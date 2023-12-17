import { vec3, mat4 } from "gl-matrix";
import { Deg2Rad } from "./math_stuff";

export class Camera {
    position: vec3;
    eulers: vec3 = vec3.create();
    view: mat4 | undefined;
    forwards: vec3;
    right: vec3;
    up: vec3;
    theta: number = 0;
    phi: number = 0;

    // theta is for rotation in horizontal plane, phi is for rotation in vertical plane
    constructor(position: vec3, theta: number, phi: number) {
        this.position = position;

        this.eulers = [0, phi, theta];
        this.theta = theta;
        this.phi = phi;
        this.forwards = vec3.fromValues(0, 0, 0);
        this.right = vec3.create();
        this.up = vec3.create();
    }

    recalculate() {
        this.forwards = new Float32Array([
            Math.cos((this.theta * 180.0) / Math.PI) *
                Math.cos((this.phi * 180.0) / Math.PI),
            Math.sin((this.theta * 180.0) / Math.PI) *
                Math.cos((this.phi * 180.0) / Math.PI),
            Math.sin((this.phi * 180.0) / Math.PI),
        ]);

        this.right = new Float32Array([0.0, 0.0, 0.0]);
        vec3.cross(this.right, this.forwards, [0.0, 0.0, 1.0]);
        this.up = new Float32Array([0.0, 0.0, 0.0]);
        vec3.cross(this.up, this.right, this.forwards);
    }

    update() {
        this.forwards = [
            Math.cos(Deg2Rad(this.eulers[2])) *
                Math.cos(Deg2Rad(this.eulers[1])),
            Math.sin(Deg2Rad(this.eulers[2])) *
                Math.cos(Deg2Rad(this.eulers[1])),
            Math.sin(Deg2Rad(this.eulers[1])),
        ];

        vec3.cross(this.right, this.forwards, [0, 0, 1]);
        vec3.cross(this.up, this.right, this.forwards);

        let target = vec3.create();
        vec3.add(target, this.position, this.forwards);
        this.view = mat4.create();
        mat4.lookAt(this.view, this.position, target, this.up);
    }

    get_view() {
        return this.view;
    }
}
