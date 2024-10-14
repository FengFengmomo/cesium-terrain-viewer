import {facesFromEdges} from './faces-from-edges.js'
import * as THREE from '../build/three.module.js';


var FRONT = 'front';
var BACK = 'back';
var ON = 'on';

var FACE_KEYS = ['a', 'b', 'c'];

var sliceGeometry = function(geometry, plane) {
    // var sliced = new THREE.Geometry();
    // var sliced = new THREE.BufferGeometry();
    var builder = new GeometryBuilder(geometry, plane);
    let pos = geometry.getAttribute("position");
    var distances = [];
    var positions = [];
    for (let i = 0; i < pos.count; i++) {
        let point = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        var distance = findDistance(point, plane);
        var position = distanceAsPosition(distance);
        distances.push(distance);
        positions.push(position);
    }
    
    // console.log(geometry.getAttribute("position"));
    console.log("positions: ",positions);
    console.log("distances: ",distances);
    console.log(geometry.index);
    
    // // geometry.vertices.forEach(function(vertex) {
    // geometry.getAttribute('position').array.forEach(function(vertex) {
    //     var distance = findDistance(vertex, plane);
    //     var position = distanceAsPosition(distance);
    //     distances.push(distance);
    //     positions.push(position);
    // });
    let indecies =  geometry.index.array;
    let triangleIndex = 0;
    for (let i = 0; i < indecies.length; i+=3) {
        let a = indecies[i];
        let b = indecies[i+1];
        let c = indecies[i+2];
        var facePositions = [positions[a], positions[b], positions[c]];
        if (
            facePositions.indexOf(FRONT) === -1 &&
            facePositions.indexOf(BACK) !== -1
        ) {
            return;
        }
        builder.startFace(triangleIndex);
        var lastIndex = c;
        var lastDistance = distances[lastIndex];
        var lastPosition = positions[lastIndex];
        [a, b, c].map(function(key){
            var index = key;
            var distance = distances[index];
            var position = positions[index];
            if (position === FRONT) {
                if (lastPosition === BACK){
                    builder.addIntersection(key, lastIndex, distance, lastDistance);
                    builder.addVertex(key);
                } else {
                    builder.addVertex(key);
                }
            }
            
            if (position === ON) {
                builder.addVertex(key);
            }

            if (position === BACK && lastPosition === FRONT) {
                builder.addIntersection(lastIndex, key, lastDistance, distance);
            }
            lastIndex = index;
            lastPosition = position;
            lastDistance = distance;
        });
        builder.endFace();
        triangleIndex++;
    }

    return sliced;
};

var distanceAsPosition = function(distance) {
    if (distance < 0) {
        return BACK;
    }
    if (distance > 0) {
        return FRONT;
    }
    return ON;
};

var findDistance = function(vertex, plane) {
    return plane.distanceToPoint(vertex);
};

var GeometryBuilder = function(sourceGeometry, slicePlane) {
    this.sourceGeometry = sourceGeometry;
    this.targetGeometry = {
        index: [],
        vertices: []
    };
    this.slicePlane = slicePlane;
    this.addedVertices = [];
    this.addedIntersections = [];
    this.newEdges = [[]];
};

GeometryBuilder.prototype.startFace = function(sourceFaceIndex) {
    this.sourceFaceIndex = sourceFaceIndex;
    let indicies = this.sourceGeometry.index.array;
    this.sourceFace = [indicies[sourceFaceIndex * 3], indicies[sourceFaceIndex * 3 + 1], indicies[sourceFaceIndex * 3 + 2]];

    this.faceIndices = [];
};

GeometryBuilder.prototype.endFace = function() {
    var indices = this.faceIndices.map(function(index, i) {
        return i;
    });
    this.addFace(indices);
};



GeometryBuilder.prototype.addVertex = function(key) {
    // this.addUv(key);
    // this.addNormal(key);

    var index = this.sourceFace[key];
    var newIndex;

    if (this.addedVertices.hasOwnProperty(index)) {
        newIndex = this.addedVertices[index];
    } else {
        var vertex = this.sourceGeometry.index.array[index];
        this.targetGeometry.vertices.push(vertex);
        newIndex = this.targetGeometry.vertices.length/3 - 1;
        this.addedVertices[index] = newIndex;
    }
    this.faceIndices.push(newIndex);
};

GeometryBuilder.prototype.addIntersection = function(keyA, keyB, distanceA, distanceB) {
    var t = Math.abs(distanceA) / (Math.abs(distanceA) + Math.abs(distanceB));


    var indexA = this.sourceFace[keyA];
    var indexB = this.sourceFace[keyB];
    var id = this.intersectionId(indexA, indexB); // 'A,B'
    var index;

    if (this.addedIntersections.hasOwnProperty(id)) {
        index = this.addedIntersections[id];
    } else {
        var vertexA = this.sourceGeometry.index.array[indexA];
        var vertexB = this.sourceGeometry.index.array[indexB];
        let pos = this.sourceGeometry.getAttribute("position");
        let ax = pos.getX(indexA);
        let ay = pos.getY(indexA);
        let az = pos.getZ(indexA);
        let bx = pos.getX(indexB);
        let by = pos.getY(indexB);
        let bz = pos.getZ(indexB);
        let nx = ax*t + bx*(1-t);
        let ny = ay*t  + by*(1-t);
        let nz = az*t  + bz*(1-t);
        // var newVertex = vertexA.clone().lerp(vertexB, t);
        this.targetGeometry.vertices.push(nx, ny, nz);
        index = this.targetGeometry.vertices.length/3 - 1;
        this.addedIntersections[id] = index;
    }
    this.faceIndices.push(index);
    this.updateNewEdges(index);
};



GeometryBuilder.prototype.addFace = function(indices) {
    if (indices.length === 3) {
        this.addFacePart(indices[0], indices[1], indices[2]);
        return;
    }

    var pairs = [];
    for (var i = 0; i < indices.length; i++) {
        for (var j = i + 1; j < indices.length; j++) {
            var diff = Math.abs(i - j);
            if (diff > 1 && diff < indices.length - 1) {
                pairs.push([indices[i], indices[j]]);
            }
        }
    }

    pairs.sort(function(pairA, pairB) {
        var lengthA = this.faceEdgeLength(pairA[0], pairA[1]);
        var lengthB = this.faceEdgeLength(pairB[0], pairB[1]);
        return lengthA - lengthB;
    }.bind(this));

    var a = indices.indexOf(pairs[0][0]);
    indices = indices.slice(a).concat(indices.slice(0, a));

    var b = indices.indexOf(pairs[0][1]);
    var indicesA = indices.slice(0, b + 1);
    var indicesB = indices.slice(b).concat(indices.slice(0, 1));

    this.addFace(indicesA);
    this.addFace(indicesB);
};

GeometryBuilder.prototype.addFacePart = function(a, b, c) {
    // var normals = null;
    // if (this.faceNormals.length) {
    //     normals = [
    //         this.faceNormals[a],
    //         this.faceNormals[b],
    //         this.faceNormals[c],
    //     ];
    // }
    // var face = new THREE.Face3(
    //     this.faceIndices[a],
    //     this.faceIndices[b],
    //     this.faceIndices[c],
    //     normals
    // );
    // this.faceIndices[a],
    //     this.faceIndices[b],
    //     this.faceIndices[c],
    this.targetGeometry.faces.push( this.faceIndices[a],
        this.faceIndices[b],
        this.faceIndices[c],);
};

GeometryBuilder.prototype.faceEdgeLength = function(a, b) {
    var indexA = this.faceIndices[a];
    var indexB = this.faceIndices[b];
    var vertexA = this.targetGeometry.vertices[indexA];
    var vertexB = this.targetGeometry.vertices[indexB];
    return vertexA.distanceToSquared(vertexB);
};

GeometryBuilder.prototype.intersectionId = function(indexA, indexB) {
    return [indexA, indexB].sort().join(',');
};

GeometryBuilder.prototype.keyIndex = function(key) {
    return FACE_KEYS.indexOf(key);
};

GeometryBuilder.prototype.updateNewEdges = function(index) {
    var edgeIndex = this.newEdges.length - 1;
    var edge = this.newEdges[edgeIndex];
    if (edge.length < 2) {
        edge.push(index);
    } else {
        this.newEdges.push([index]);
    }
};



export  {sliceGeometry};