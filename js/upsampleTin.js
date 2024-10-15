import * as THREE from '../build/three.module.js';

/**
 * 该几何体分割主要用于不规则三角形几何体的分割
 * 坐标点的范围确定在x: [-0.5, 0.5], z:[-0.5,0.5] 之间, y 用来表示高程
 * -0.5       top          0.5
 * __ __ __ __ __ __ __ __
 * |          |           |
 * |          |           |
 * |          |           |
 * |__________|___________|   X  right
 * |          |           |
 * |          |           |
 * |          |           |
 * |__________|___________|
 * -0.5                    0.5
 *            Z
 */
export class UpSampleTin {

    FRONT = 'front';
    BACK = 'back';
    ON = 'on';

    constructor(geometry, xAixs = 0, yAixs = 0) {
        this.geometry = geometry;
        this.xAixs = xAixs;
        this.yAixs = yAixs;
        
        
    }

    splitALL(){
        let geometry = this.geometry;
        this.spliteGeometry(geometry, true, this.xAixs, true);
        this.up = this.constructGeometry(); // 大于X
        this.spliteGeometry(geometry, true, this.xAixs, false);
        this.down = this.constructGeometry(); // 小于X
        this.spliteGeometry(geometry, false, this.yAixs, false);
        this.left = this.constructGeometry();   // 大于Y
        this.spliteGeometry(geometry, false, this.yAixs, true);
        this.right = this.constructGeometry();  // 小于Y

        // 取四个角的点
        this.spliteGeometry(this.up, false, this.yAixs, true);
        this.downRight = this.constructGeometry();
        this.spliteGeometry(this.up, false, this.yAixs, false);
        this.upRight = this.constructGeometry();
        this.spliteGeometry(this.down, false, this.yAixs, true);
        this.downLeft = this.constructGeometry();
        this.spliteGeometry(this.down, false, this.yAixs, false);
        this.upLeft = this.constructGeometry();
    }

    getGeometry(postion) {
        let geometry = this.geometry;
        if (postion ===0) {
            this.spliteGeometry(geometry, true, this.xAixs, false);
            this.down = this.constructGeometry(); // 小于X
            this.spliteGeometry(this.down, false, this.yAixs, false);
            this.upLeft = this.constructGeometry();
            return this.upLeft;
        }
        if (postion === 1) {
            this.spliteGeometry(geometry, true, this.xAixs, true);
            this.up = this.constructGeometry();
            this.spliteGeometry(this.up, false, this.yAixs, false);
            this.upRight = this.constructGeometry();
            return this.upRight;
        }
        if (postion === 2) {
            this.spliteGeometry(geometry, true, this.xAixs, false);
            this.down = this.constructGeometry();
            this.spliteGeometry(this.down, false, this.yAixs, true);
            this.downLeft = this.constructGeometry();
            return this.downLeft;
        }
        if (postion === 3) {
            this.spliteGeometry(geometry, true, this.xAixs, true);
            this.up = this.constructGeometry();
            this.spliteGeometry(this.up, false, this.yAixs, true);
            this.downRight = this.constructGeometry();
            return this.downRight;
        }
    }
    /**
     * 
     * @param {*} geometry 
     * @param {*} xAixs 是x轴还是y轴 
     * @param {*} line 分界线
     * @param {*} big true: 大于分界线，false: 小于分界线，取的时候取大于分界线的
     */
    spliteGeometry(geometry, xAixs = true, line = 0, big = true) {
        var builder = new Builder(geometry);
        let distances = []; // 计算每个点到线的距离
        let positions = []; // 计算每个点在线的哪一侧
        let pos = geometry.getAttribute('position');
        let vertexCount = geometry.userData.terrain.vertexCount;
        // for (let i = 0; i < pos.count; i++) {
        for (let i = 0; i < vertexCount; i++) {
            let point = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            var distance = xAixs? (point.x - line) : (point.z - line);
            var position = this.distanceAsPosition(distance, big);
            distances.push(distance);
            positions.push(position);
        }

        let indecies =  geometry.index.array; // 获取顶点索引，用于遍历三角形
        let triangleIndex = 0; // 三角形数量
        for (let i = 0; i < indecies.length; i+=3) {
            // 获取三角形的三个顶点
            let a = indecies[i];
            let b = indecies[i+1];
            let c = indecies[i+2];
            
            builder.startFace(triangleIndex);

            // 以每条线进行计算，三角形总共三条线，分别进行计算。
            var lastIndex = c; 
            var lastDistance = distances[lastIndex];
            var lastPosition = positions[lastIndex];
            let that = this;
            // abc 分别为顶点索引
            [a, b, c].map(function(index){
                var distance = distances[index];
                var position = positions[index];
                if (position === that.FRONT) {
                    if (lastPosition === that.BACK){
                        builder.addIntersection(index, lastIndex, distance, lastDistance); // 添加交点 index->lastIndex
                        builder.addVertex(index);
                    } else {
                        builder.addVertex(index);
                    }
                }
                
                if (position === that.ON) {
                    builder.addVertex(index);
                }

                if (position === that.BACK && lastPosition === that.FRONT) { // 当前点在界限后面，不需要添加该点，只需要添加交点
                    builder.addIntersection(lastIndex, index , lastDistance, distance); //  添加交点 lastIndex->index
                    // builder.addVertex(index); // 添加顶点
                }
                lastIndex = index;
                lastPosition = position;
                lastDistance = distance;
            });
            builder.endFace();
            triangleIndex++;
        }
        this.builder = builder;
    }
    
    // 构造几何体
    constructGeometry(){
        let geometry = this.builder.targetGeometry;
        let header = this.builder.sourceGeometry.userData.terrain.header; // 获取原始地形头信息
        let vertexData = {
            vertexCount: geometry.vertices.length/3,
            vertex: geometry.vertices,
            sliced: true
        }
        let indexData = {
            triangleCount: geometry.index.length, // 有多少个三角形就是多少个 三角形*3的个数的索引
            indices: geometry.index
            // highest: highest
        }
        let westVertexs = [];
        let southVertexs = [];
        let eastVertexs = [];
        let northVertexs = [];
        let triangleIndex = 0;
        for (let i = 0; i < geometry.vertices.length/3; i+=3) {
            let x = geometry.vertices[i];
            let y = geometry.vertices[i+1];
            let z = geometry.vertices[i+2];
            if (x == -0.5){
                westVertexs.push(triangleIndex);
                continue;
            }
            if (x == 0.5){
                eastVertexs.push(triangleIndex);
                continue;
            }
            if (z == 0.5){
                northVertexs.push(triangleIndex);
                continue;
            }
            if (z == 0){
                southVertexs.push(triangleIndex);
                continue;
            }
            triangleIndex++;
        }
        let edgeIndices = {
            westVertexCount: westVertexs.length,
            southVertexCount: southVertexs.length,
            eastVertexCount: eastVertexs.length,
            northVertexCount: northVertexs.length,
            west: westVertexs,
            south: southVertexs,
            east: eastVertexs,
            north: northVertexs
        }
        let extensions = {
            
        };
        let terrain =  {
            header,
            vertexData,
            indexData,
            edgeIndices,
            extensions
        }
        let newGeometry = new sliceGeometry(terrain);
        return newGeometry;
    }


    /**
     * 计算在直线的上下方
     * @param {vector} v1 
     * @param {vector} v2 
     * @param {vector} v3 
     * @param {number} line 
     */
    distanceAsPosition(distance, big) {
        // TODO: 实现intersect方法, 三角形和直线的交点计算
        if (distance == 0) {
            return this.ON;
        }
        if (big) {
            if (distance > 0) {
                return this.FRONT;
            }
            if (distance < 0) {
                return this.BACK;
            }
        }
        if (!big) {
            if (distance > 0) {
                return this.BACK;
            }
            if (distance < 0) {
                return this.FRONT;
            }
        }
    }

   
}

class Builder {

    constructor(geometry) {
        this.sourceGeometry = geometry;
        // 构造目标几何体，只构造顶点索引和顶点坐标
        this.targetGeometry = {
            index: [],
            vertices: []
        };
        this.addedVertices = [];
        this.addedIntersections = [];
        this.newEdges = [[]];
    }
    startFace(sourceFaceIndex) {
        this.sourceFaceIndex = sourceFaceIndex;
        let indicies = this.sourceGeometry.index.array;
        this.sourceFace = [indicies[sourceFaceIndex * 3], indicies[sourceFaceIndex * 3 + 1], indicies[sourceFaceIndex * 3 + 2]];
        this.faceIndices = []; // 存放的应该顶点索引，而不是三角形索引
    }
    endFace() {
        // 将三角形索引转换为顶点索引
        // var indices = this.faceIndices.map(function(index, i) {
        //     return i;
        // });
        var indices = this.faceIndices;
        this.addFace(indices);
    }

    // index为原geometry的顶点索引
    addVertex(index) { // 添加顶点
        // var index = this.sourceFace[key];
        let newIndex; // 新的顶点索引
        if (this.addedVertices.hasOwnProperty(index)) { // 检查数组是否有索引index，
            newIndex = this.addedVertices[index];
        } else {
            let postion = this.sourceGeometry.getAttribute("position");
            // var vertex = this.sourceGeometry.vertices[index];
            this.targetGeometry.vertices.push(postion.getX(index), postion.getY(index), postion.getZ(index));
            newIndex = this.targetGeometry.vertices.length/3 - 1;
            this.addedVertices[index] = newIndex;
        }
        this.faceIndices.push(newIndex);
    }

    addIntersection(indexA, indexB, distanceA, distanceB){
        var t = Math.abs(distanceA) / (Math.abs(distanceA) + Math.abs(distanceB));
        // var indexA = this.sourceFace[keyA];
        // var indexB = this.sourceFace[keyB];
        var id = this.intersectionId(indexA, indexB); // 'A,B' 是有指向性的
        var index;

        if (this.addedIntersections.hasOwnProperty(id)) {
            index = this.addedIntersections[id];
        } else {
            // var vertexA = this.sourceGeometry.index.array[indexA];
            // var vertexB = this.sourceGeometry.index.array[indexB];
            let pos = this.sourceGeometry.getAttribute("position");
            let ax = pos.getX(indexA);
            let ay = pos.getY(indexA);
            let az = pos.getZ(indexA);
            let bx = pos.getX(indexB);
            let by = pos.getY(indexB);
            let bz = pos.getZ(indexB);
            let nx = ax*(1-t) + bx*t;
            let ny = ay*(1-t) + by*t;
            let nz = az*(1-t) + bz*t;
            // var newVertex = vertexA.clone().lerp(vertexB, t);
            this.targetGeometry.vertices.push(nx, ny, nz);
            index = this.targetGeometry.vertices.length/3 - 1;
            this.addedIntersections[id] = index;
        }
        this.faceIndices.push(index);
        // this.updateNewEdges(index);
    }

    // 添加三角形
    addFace(indices) {
        if (indices.length === 0) {
            return;
        }
        if (indices.length === 3) {
            this.addFacePart(indices[0], indices[1], indices[2]);
            return;
        }

        // 代码运行到此处，indices.length 为4，因为三角形和直线相交最多两个顶点
        var pairs = [];
        for (var i = 0; i < indices.length; i++) {
            for (var j = i + 1; j < indices.length; j++) {
                var diff = Math.abs(i - j);
                if (diff > 1 && diff < indices.length - 1) { // 索引距离大于1，且长度小于3，即只能为2
                    pairs.push([indices[i], indices[j]]);
                }
            }
        }

        // 按照边的长度排序
        // pairs.sort(function(pairA, pairB) {
        //     var lengthA = this.faceEdgeLength(pairA[0], pairA[1]);
        //     var lengthB = this.faceEdgeLength(pairB[0], pairB[1]);
        //     return lengthA - lengthB;
        // }.bind(this));
        // indices = [a,b,c,d]
        // pairs = [[a,c],[b,d]]
        // slice(start, end) 不包含end
        var a = indices.indexOf(pairs[0][0]); // a = 0
        indices = indices.slice(a).concat(indices.slice(0, a)); // indices = [a,b,c,d]

        var b = indices.indexOf(pairs[0][1]); // b = 2
        var indicesA = indices.slice(0, b + 1); // indicesA = [a,b,c]
        var indicesB = indices.slice(b).concat(indices.slice(0, 1)); // indicesB = [c,d,a]

        this.addFace(indicesA);
        this.addFace(indicesB);
    };
    // 添加三角形部分,a,b,c是索引,而不是原来的key
    addFacePart(a, b, c) {
        // this.faceIndices
        this.targetGeometry.index.push( 
            a,b,c
        );
    };

    // 计算边的长度
    faceEdgeLength(a, b) {
        let ax = this.targetGeometry.vertices[a*3];
        let ay = this.targetGeometry.vertices[a*3+1];
        let az = this.targetGeometry.vertices[a*3+2];
        let bx = this.targetGeometry.vertices[b*3];
        let by = this.targetGeometry.vertices[b*3+1];
        let bz = this.targetGeometry.vertices[b*3+2];
        let squared = Math.pow(ax - bx, 2) + Math.pow(ay - by, 2) + Math.pow(az - bz, 2);
        return squared;
    };

    // 添加交点,相交的边。从front到back，做为记录
    intersectionId(indexA, indexB) {
        return [indexA, indexB].sort().join(',');
    };

    // 更新新边, 不需要
    updateNewEdges(index) {
        var edgeIndex = this.newEdges.length - 1;
        var edge = this.newEdges[edgeIndex];
        if (edge.length < 2) {
            edge.push(index);
        } else {
            this.newEdges.push([index]);
        }
    };
}

class sliceGeometry  extends THREE.BufferGeometry{
    constructor(terrain, skirt = false, skirtDepth = 10.0,  calculateNormals = true, scale = 2.0) {
        super();
        this.scale = scale;
		// Buffers
		const indices = [];
		const vertices = [];
		const normals = [];
		const uvs = [];
        if (terrain){
			if (terrain.header) {
				this.userData.terrain = {};
			    this.userData.terrain.header = terrain.header;
				this.userData.terrain.vertexCount = terrain.vertexData.vertexCount;
				this.userData.terrain.triangleCount = terrain.indexData.triangleCount;
				this.userData.terrain.westVertexCount = terrain.edgeIndices.westVertexCount;
				this.userData.terrain.southVertexCount = terrain.edgeIndices.southVertexCount;
				this.userData.terrain.eastVertexCount = terrain.edgeIndices.eastVertexCount;
				this.userData.terrain.northVertexCount = terrain.edgeIndices.northVertexCount;
			}
		}
        this.buildPlane(terrain.vertexData, terrain.indexData, indices, vertices, normals, uvs);
        this.setIndex(indices);
		this.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		this.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
		this.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    buildPlane(vertexData, indicesData, indices, vertices, normals, uvs) {
		let vertexCount = vertexData.vertexCount;
        vertices.push(...vertexData.vertex);
		for (let i = 0; i < vertexCount; i++) {
            let x = vertices[i*3];
            let y = vertices[i*3+1];
            let z = vertices[i*3+2];
			normals.push(0, 1, 0); // 这里法向量是朝上的，所以是(0, 1, 0)； Y轴朝上，所以这样写
			uvs.push(x+0.5, 0.5-z); // 这里写成uvs.push(xarr[i]/32767, 1.0-yarr[i]/32767); 也是可以的，前面的就是按照这个方式的一种简化。
		}
		indices.push(...indicesData.indices);
	}
    
}