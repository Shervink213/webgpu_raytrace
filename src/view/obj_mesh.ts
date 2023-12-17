import { vec2, vec3 } from "gl-matrix";

export class ObjMesh {
    buffer: GPUBuffer | undefined;
    bufferLayout: GPUVertexBufferLayout | undefined;
    v: vec3[];
    vt: vec2[];
    vn: vec3[];
    vertices: Float32Array;
    vertexCount: number;

    constructor() {
        this.v = [];
        this.vt = [];
        this.vn = [];
        this.vertices = new Float32Array();
        this.vertexCount = 0;
    }

    async init(device: GPUDevice, url: string) {
        await this.read_file(url);
        this.vertexCount = this.vertices.length / 5;

        const usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            size: this.vertices.byteLength,
            usage,
            mappedAtCreation: true,
        };

        this.buffer = device.createBuffer(descriptor);
        new Float32Array(this.buffer.getMappedRange()).set(this.vertices);
        this.buffer.unmap();

        this.bufferLayout = {
            arrayStride: 20,
            attributes: [
                // position, x, y, z
                {
                    shaderLocation: 0,
                    format: "float32x3", // vec2<f32>
                    offset: 0,
                },
                // texture coordinate, u, v
                {
                    shaderLocation: 1,
                    format: "float32x2", // vec3<f32>
                    offset: 3 * 4,
                },
            ],
        };
    }

    async read_file(url: string) {
        let result: number[] = [];

        const response = await fetch(url).then((r) => r.blob());
        const content = await response.text();
        const lines = content.split("\n").map((line) => line.trim());

        lines.forEach((line) => {
            const parts = line.split(" ");

            // vertex position, xyz
            if (parts[0] === "v") {
                this.v.push(
                    vec3.fromValues(
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                        parseFloat(parts[3])
                    )
                );
                // vertex texture, uv
            } else if (parts[0] === "vt") {
                this.vt.push(
                    vec2.fromValues(parseFloat(parts[1]), parseFloat(parts[2]))
                );
                // vertex normal, xyz
            } else if (parts[0] === "vn") {
                this.vn.push(
                    vec3.fromValues(
                        parseFloat(parts[1]),
                        parseFloat(parts[2]),
                        parseFloat(parts[3])
                    )
                );
                // face
            } else if (parts[0] === "f") {
                const triangleCount = parts.length - 3;
                for (let i = 0; i < triangleCount; i++) {
                    const triangle = [
                        parts[1].split("/"),
                        parts[2 + i].split("/"),
                        parts[3 + i].split("/"),
                    ];
                    triangle.forEach((vertex) => {
                        const position = this.v[parseInt(vertex[0]) - 1];
                        const texture = this.vt[parseInt(vertex[1]) - 1];
                        const normal = this.vn[parseInt(vertex[2]) - 1];
                        result.push(position[0], position[1], position[2]);
                        result.push(texture[0], texture[1]);
                        // result.push(normal[0], normal[1], normal[2]);
                    });
                }
            }
        });

        this.vertices = new Float32Array(result);
    }
}
