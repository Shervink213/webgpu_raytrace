export class TriangleMesh {
    buffer: GPUBuffer;
    bufferLayout: GPUVertexBufferLayout;

    constructor(device: GPUDevice) {
        // x y z u v
        const vertices: Float32Array = new Float32Array([
            0.0, 0.0, 0.5, 0.5, 0.0, 0.0, -0.5, -0.5, 0.0, 1.0, 0.0, 0.5, -0.5,
            1.0, 1.0,
        ]);

        const usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            size: vertices.byteLength,
            usage,
            mappedAtCreation: true,
        };

        this.buffer = device.createBuffer(descriptor);
        new Float32Array(this.buffer.getMappedRange()).set(vertices);
        this.buffer.unmap();

        this.bufferLayout = {
            arrayStride: 5 * 4, // 5 floats * 4 bytes/float

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
}
