import { Camera } from "./camera";
import { vec3 } from "gl-matrix";

import { Sphere } from "./sphere";
import { Node } from "./node";

export class ComputeScene {
    spheres: Sphere[];
    camera: Camera;
    sphereCount: number;
    nodes: Node[] | undefined;
    nodesCount: number = 0;
    sphereIndices: number[] | undefined;
    maxBounces: number;

    constructor(sphereCount: number, maxBounces: number) {
        this.spheres = new Array(sphereCount);

        for (let i = 0; i < this.spheres.length; i++) {
            // puts the spheres in a random location
            const center: number[] = [
                -20.0 + 100.0 * Math.random(),
                -50.0 + 100.0 * Math.random(),
                -50.0 + 100.0 * Math.random(),
            ];

            // random radius
            const radius = 0.1 + 1.9 * Math.random();

            // random color
            const color: number[] = [
                Math.random(),
                Math.random(),
                Math.random(),
            ];

            this.spheres[i] = new Sphere(center, radius, color);
        }
        this.sphereCount = this.spheres.length;
        // sets the camera to a fixed location, all the way back
        this.camera = new Camera([-20, 0, 0], 0, 0);
        this.maxBounces = maxBounces;

        this.buildBVH();
    }

    buildBVH() {
        this.sphereIndices = new Array(this.sphereCount);
        for (let i = 0; i < this.sphereCount; i++) {
            this.sphereIndices[i] = i;
        }

        this.nodes = new Array(2 * this.sphereCount - 1); // 2n-1 nodes for n spheres
        for (let i = 0; i < this.nodes.length; i++) {
            this.nodes[i] = new Node();
        }

        let root: Node = this.nodes[0];
        root.leftChild = 0;
        root.sphereCount = this.sphereCount;
        this.nodesCount += 1;

        // update the bounding volume hierarchy,
        this.updateBVH(0);
        this.subdivide(0);
    }

    updateBVH(nodeIndex: number) {
        let node: Node = this.nodes![nodeIndex];

        // setting the min and max corners of the bounding box
        node.minCorner = vec3.fromValues(Infinity, Infinity, Infinity);
        node.maxCorner = vec3.fromValues(-Infinity, -Infinity, -Infinity);

        // for each sphere in the node, update the min and max corners
        for (let i = 0; i < node.sphereCount!; i++) {
            let sphereIndex = this.sphereIndices![node.leftChild! + i]; // the index of the sphere in the spheres array
            let sphere = this.spheres[sphereIndex];

            // the axis is the radius of the sphere
            const axis: vec3 = [sphere.radius, sphere.radius, sphere.radius];

            // subtract the center of the sphere from the min corner, and then take the min of the two, that is the new min corner
            let temp: vec3 = [0, 0, 0];
            vec3.subtract(temp, sphere.center, axis);
            vec3.min(node.minCorner!, node.minCorner!, temp);

            // add the center of the sphere to the max corner, and then take the max of the two, that is the new max corner
            vec3.add(temp, sphere.center, axis);
            vec3.max(node.maxCorner!, node.maxCorner!, temp);
        }
    }

    subdivide(nodeIndex: number) {
        let node: Node = this.nodes![nodeIndex];

        // if there are 2 or less spheres in the node, then we don't need to subdivide
        if (node.sphereCount! <= 2) {
            return;
        }

        // the extent is the difference between the max and min corners
        let extent: vec3 = [0, 0, 0];
        vec3.subtract(extent, node.maxCorner!, node.minCorner!);
        let axis = 0;

        // find the axis with the largest extent
        if (extent[1] > extent[axis]) {
            axis = 1;
        }
        if (extent[2] > extent[axis]) {
            axis = 2;
        }

        // the split point is the middle of the min and max corners
        const splitPoint = node.minCorner![axis] + node.maxCorner![axis] / 2;

        let i = node.leftChild!;
        let j = i + node.sphereCount! - 1;

        // partition the spheres into two groups, one with centers less than the split point, and one with centers greater than the split point
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

        // create two new nodes, one for the left group and one for the right group
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

        // update the bounding volume hierarchy for the two new nodes
        this.updateBVH(leftChildIndex);
        this.updateBVH(rightChildIndex);
        this.subdivide(leftChildIndex);
        this.subdivide(rightChildIndex);
    }
}
