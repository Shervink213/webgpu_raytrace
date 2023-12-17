import { vec3 } from "gl-matrix";

export class Node {
    minCorner: vec3 | undefined;
    leftChild: number | undefined;
    maxCorner: vec3 | undefined;
    sphereCount: number | undefined;
}
