import { vec3, mat4 } from "gl-matrix";

export class Camera {
    position: vec3;

    view: mat4 | undefined;
    forwards: vec3;
    right: vec3;
    up: vec3;
    theta: number = 0;
    phi: number = 0;

    // theta is for rotation in horizontal plane, phi is for rotation in vertical plane
    constructor(position: vec3, theta: number, phi: number) {
        this.position = position;

        this.theta = theta;
        this.phi = phi;

        this.forwards = new Float32Array([1.0, 0.0, 0.0]);
        this.right = new Float32Array([0.0, -1.0, 0.0]);
        this.up = new Float32Array([0.0, 0.0, 1.0]);
    }
}
