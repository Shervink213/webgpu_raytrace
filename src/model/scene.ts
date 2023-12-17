import { Triangle } from "./triangle";
import { Camera } from "./camera";
import { vec3, mat4 } from "gl-matrix";
import { Quad } from "./quad";
import { ObjectTypes, RenderData } from "./definitions";
import { Statue } from "./statue";
import { Sphere } from "./sphere";
import { Node } from "./node";

export class ComputeScene {
    spheres: Sphere[];
    camera: Camera;
    sphereCount: number;
    nodes: Node[] | undefined;
    nodesCount: number = 0;
    sphereIndices: number[] | undefined;

    constructor() {
        this.spheres = new Array(32);
        for (let i = 0; i < this.spheres.length; i++) {
            const center: number[] = [
                -5.0 + 10.0 * Math.random(),
                -5.0 + 10.0 * Math.random(),
                -5.0 + 10.0 * Math.random(),
            ];

            const radius = 0.1 + 1.9 * Math.random();

            const color: number[] = [
                0.3 + 0.7 * Math.random(),
                0.3 + 0.7 * Math.random(),
                0.3 + 0.7 * Math.random(),
            ];

            this.spheres[i] = new Sphere(center, radius, color);
        }
        this.sphereCount = this.spheres.length;

        this.camera = new Camera([-10, 0, 0], 0, 0);
        this.camera.recalculate();

        this.buildBVH();
    }

    buildBVH() {
        this.sphereIndices = new Array(this.sphereCount);
        for (let i = 0; i < this.sphereCount; i++) {
            this.sphereIndices[i] = i;
        }

        this.nodes = new Array(2 * this.sphereCount - 1);
        for (let i = 0; i < this.nodes.length; i++) {
            this.nodes[i] = new Node();
        }

        let root: Node = this.nodes[0];
        root.leftChild = 0;
        root.sphereCount = this.sphereCount;
        this.nodesCount += 1;

        this.updateBVH(0);
        this.subdivide(0);
    }

    updateBVH(nodeIndex: number) {
        let node: Node = this.nodes![nodeIndex];

        node.minCorner = vec3.fromValues(Infinity, Infinity, Infinity);
        node.maxCorner = vec3.fromValues(-Infinity, -Infinity, -Infinity);

        for (let i = 0; i < node.sphereCount!; i++) {
            let sphereIndex = this.sphereIndices![node.leftChild! + i];
            let sphere = this.spheres[sphereIndex];

            const axis: vec3 = [sphere.radius, sphere.radius, sphere.radius];

            let temp: vec3 = [0, 0, 0];
            vec3.subtract(temp, sphere.center, axis);
            vec3.min(node.minCorner!, node.minCorner!, temp);

            vec3.add(temp, sphere.center, axis);
            vec3.max(node.maxCorner!, node.maxCorner!, temp);
        }
    }

    subdivide(nodeIndex: number) {
        let node: Node = this.nodes![nodeIndex];

        if (node.sphereCount! <= 2) {
            return;
        }

        let extent: vec3 = [0, 0, 0];
        vec3.subtract(extent, node.maxCorner!, node.minCorner!);
        let axis = 0;

        if (extent[1] > extent[axis]) {
            axis = 1;
        }
        if (extent[2] > extent[axis]) {
            axis = 2;
        }

        const splitPoint = node.minCorner![axis] + node.maxCorner![axis] / 2;

        let i = node.leftChild!;
        let j = i + node.sphereCount! - 1;

        while (i <= j) {
            if (this.spheres[this.sphereIndices![i]].center[axis] < splitPoint)
                i += 1;
            else {
                let temp = this.sphereIndices![i];
                this.sphereIndices![i] = this.sphereIndices![j];
                this.sphereIndices![j] = temp;
                j -= 1;
            }
        }

        let leftCount = i - node.leftChild!;
        if (leftCount == 0 || leftCount == node.sphereCount) {
            return;
        }
        const leftChildIndex = this.nodesCount;
        this.nodesCount += 1;
        const rightChildIndex = this.nodesCount;
        this.nodesCount += 1;

        this.nodes![leftChildIndex].leftChild = node.leftChild;
        this.nodes![leftChildIndex].sphereCount = leftCount;

        this.nodes![rightChildIndex].leftChild = i;
        this.nodes![rightChildIndex].sphereCount =
            node.sphereCount! - leftCount;

        node.leftChild = leftChildIndex;
        node.sphereCount = 0;

        this.updateBVH(leftChildIndex);
        this.updateBVH(rightChildIndex);
        this.subdivide(leftChildIndex);
        this.subdivide(rightChildIndex);
    }
}

export class Scene {
    triangles: Triangle[];
    quads: Quad[];
    player: Camera;
    objectData: Float32Array;
    triangleCount: number;
    quadCount: number;
    statue: Statue;

    constructor() {
        this.triangles = [];
        this.quads = [];
        this.objectData = new Float32Array(4 * 4 * 1024);
        this.triangleCount = 0;
        this.quadCount = 0;

        this.makeTriangles();
        this.makeQuads();
        this.statue = new Statue([0, 0, 0], [0, 0, 0]);

        this.player = new Camera([-2, 0, 0.5], 0, 0);
    }

    makeTriangles() {
        // create a grid of triangles
        let i = 0;
        for (let y = -5; y <= 5; y++) {
            // puts a triangle at 2, y, 0
            this.triangles.push(new Triangle([2, y, 0.5], 0));

            // turns an identity matrix into a Float32Array
            let blankMatrix = mat4.create();
            for (let j = 0; j < 16; j++) {
                this.objectData[16 * i + j] = blankMatrix[j];
            }
            i++;
            this.triangleCount++;
        }
    }
    makeQuads() {
        // create a grid of triangles
        let i = this.triangleCount; // start at the end of the triangles array
        for (let x = -10; x <= 10; x++) {
            for (let y = -10; y <= 10; y++) {
                // puts a triangle at 2, y, 0
                this.quads.push(new Quad([x, y, 0]));

                // turns an identity matrix into a Float32Array
                let blankMatrix = mat4.create();
                for (let j = 0; j < 16; j++) {
                    this.objectData[16 * i + j] = blankMatrix[j];
                }
                i++;
                this.quadCount++;
            }
        }
    }

    update() {
        let i = 0;
        this.triangles.forEach((triangles) => {
            triangles.update();
            const model = triangles.get_model();
            if (model === undefined) {
                throw new Error("Model is undefined");
            }
            // takes the model matrix and puts it into the objectData array
            for (let j = 0; j < 16; j++) {
                this.objectData[16 * i + j] = model[j];
            }
            i++;
        });

        this.quads.forEach((quad) => {
            quad.update();
            const model = quad.get_model();
            if (model === undefined) {
                throw new Error("Model is undefined");
            }
            // takes the model matrix and puts it into the objectData array
            for (let j = 0; j < 16; j++) {
                this.objectData[16 * i + j] = model[j];
            }
            i++;
        });

        this.statue.update();
        const model = this.statue.get_model();
        if (model === undefined) {
            throw new Error("Model is undefined");
        }
        // takes the model matrix and puts it into the objectData array
        for (let j = 0; j < 16; j++) {
            this.objectData[16 * i + j] = model[j];
        }
        i++;

        this.player.update();
    }

    spin_player(dx: number, dy: number) {
        // horizontal rotation
        this.player.eulers[2] -= dx;
        this.player.eulers[2] %= 360;

        // vertical rotation
        this.player.eulers[1] = Math.min(
            89,
            Math.max(-89, this.player.eulers[1] - dy)
        );
    }

    move_player(forwardsAmount: number, rightAmount: number) {
        vec3.scaleAndAdd(
            this.player.position,
            this.player.position,
            this.player.forwards,
            forwardsAmount
        );

        vec3.scaleAndAdd(
            this.player.position,
            this.player.position,
            this.player.right,
            rightAmount
        );
    }

    get_player() {
        return this.player;
    }

    get_renderables(): RenderData {
        return {
            viewTransform: this.player.get_view()!,
            modelTransform: this.objectData,
            objectCounts: {
                [ObjectTypes.TRIANGLE]: this.triangleCount,
                [ObjectTypes.QUAD]: this.quadCount,
            },
        };
    }
}
