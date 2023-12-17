import shader from "./shaders/shaders.wgsl";
import { TriangleMesh } from "./triangle_mesh";
import { QuadMesh } from "./quad_mesh";
import { mat4 } from "gl-matrix";
import { Material } from "./material";
import { ObjectTypes, RenderData } from "../model/definitions";
import { ObjMesh } from "./obj_mesh";
import raytracer_kernel from "./shaders/raytracer_kernel.wgsl";
import screen_shader from "./shaders/screen_shader.wgsl";
import { ComputeScene } from "../model/scene";

export class Render {
    canvas: HTMLCanvasElement;

    adapter: GPUAdapter | undefined | null;
    device: GPUDevice | undefined;
    context: GPUCanvasContext | undefined;
    canvasFormat: GPUTextureFormat | undefined;

    // Pipeline
    uniformBuffer: GPUBuffer | undefined;
    pipeline: GPURenderPipeline | undefined;
    frameGroupLayout: GPUBindGroupLayout | undefined;
    materialGroupLayout: GPUBindGroupLayout | undefined;
    frameBindGroup: GPUBindGroup | undefined;
    // For raytracing
    ray_tracing_pipeline: GPUComputePipeline | undefined;
    ray_tracing_bind_group: GPUBindGroup | undefined;
    screen_pipeline: GPURenderPipeline | undefined;
    screen_bind_group: GPUBindGroup | undefined;

    // Depth buffer
    depthStencilState: GPUDepthStencilState | undefined;
    depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined;
    depthStencilBuffer: GPUTexture | undefined;
    depthStencilView: GPUTextureView | undefined;

    // Assets
    triangleMesh: TriangleMesh | undefined;
    quadMesh: TriangleMesh | undefined;
    statueMesh: ObjMesh | undefined;
    triangleMaterial: Material | undefined;
    quadMaterial: Material | undefined;
    objectBuffer: GPUBuffer | undefined;
    // For raytracing
    color_buffer: GPUTexture | undefined;
    color_buffer_view: GPUTextureView | undefined;
    sampler: GPUSampler | undefined;
    sceneParams: GPUBuffer | undefined;
    scene: ComputeScene | undefined;
    sphereBuffer: GPUBuffer | undefined;
    nodeBuffer: GPUBuffer | undefined;
    sphereIndexBuffer: GPUBuffer | undefined;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.scene = new ComputeScene();
    }

    async init() {
        await this.setUpDevice();
        // await this.makeBindGroupLayouts();
        // await this.createAssets();
        await this.createComputeAssets();
        await this.makeDepthBuffer();

        // await this.createPipeline();
        await this.createComputePipeline();
        // await this.makeBindGroups();
    }

    async setUpDevice() {
        // wrapper for the GPU
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            throw new Error("No appropriate GPUAdapter found.");
        }
        // wrapper for GPU functions, function calls are made using the device
        this.device = await this.adapter.requestDevice();

        this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.canvasFormat,
            alphaMode: "opaque",
        });
    }

    async makeBindGroupLayouts() {
        this.frameGroupLayout = this.device?.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX, //using the uniform in the vertex shader
                    buffer: {},
                },

                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                        hasDynamicOffset: false,
                    },
                },
            ],
        });

        this.materialGroupLayout = this.device?.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT, // Applying the texture in the fragment shader
                    texture: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT, // Applying the texture in the fragment shader
                    sampler: {},
                },
            ],
        });
    }

    async createComputeAssets() {
        this.color_buffer = this.device?.createTexture({
            size: {
                width: this.canvas.width,
                height: this.canvas.height,
            },
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING,
        });

        this.color_buffer_view = this.color_buffer!.createView();

        const samplerDescriptor: GPUSamplerDescriptor = {
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1,
        };

        this.sampler = this.device!.createSampler(samplerDescriptor);

        const paramsBufferDescriptor: GPUBufferDescriptor = {
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        };
        this.sceneParams = this.device!.createBuffer(paramsBufferDescriptor);

        const sphereBufferDescriptor: GPUBufferDescriptor = {
            size: 32 * this.scene!.spheres?.length,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        };
        this.sphereBuffer = this.device!.createBuffer(sphereBufferDescriptor);

        const nodeBufferDescriptor: GPUBufferDescriptor = {
            size: 32 * this.scene!.nodesCount,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        };
        this.nodeBuffer = this.device!.createBuffer(nodeBufferDescriptor);

        const sphereIndexBufferDescriptor: GPUBufferDescriptor = {
            size: 4 * this.scene!.sphereCount,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        };
        this.sphereIndexBuffer = this.device!.createBuffer(
            sphereIndexBufferDescriptor
        );
    }

    async createAssets() {
        this.triangleMesh = new TriangleMesh(this.device!);
        this.quadMesh = new QuadMesh(this.device!);
        this.statueMesh = new ObjMesh();
        await this.statueMesh.init(this.device!, "/models/cube.obj");
        this.triangleMaterial = new Material();

        this.quadMaterial = new Material();

        this.uniformBuffer = this.device?.createBuffer({
            size: 4 * (4 * 4) * 2, // 4x4 matrix of 4 byte floats, 3 matrices
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const modelBufferDescriptor: GPUBufferDescriptor = {
            size: 4 * (4 * 4) * 1024, //4, 4x4
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        };

        this.objectBuffer = this.device!.createBuffer(modelBufferDescriptor);

        await this.triangleMaterial.init(
            this.device!,
            "/vite.jpg",
            this.materialGroupLayout!
        );
        await this.quadMaterial.init(
            this.device!,
            "/floor.jpg",
            this.materialGroupLayout!
        );
    }

    async makeDepthBuffer() {
        this.depthStencilState = {
            format: "depth24plus-stencil8",
            depthWriteEnabled: true,
            depthCompare: "less-equal",
        };

        const size: GPUExtent3D = {
            width: this.canvas.width,
            height: this.canvas.height,
            depthOrArrayLayers: 1,
        };

        const depthBufferDescriptor: GPUTextureDescriptor = {
            size,
            format: "depth24plus-stencil8",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        };

        this.depthStencilBuffer = this.device!.createTexture(
            depthBufferDescriptor
        );

        const viewDescriptor: GPUTextureViewDescriptor = {
            format: "depth24plus-stencil8",
            dimension: "2d",
            aspect: "all",
        };
        this.depthStencilView =
            this.depthStencilBuffer.createView(viewDescriptor);

        this.depthStencilAttachment = {
            view: this.depthStencilView,
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            stencilLoadOp: "clear",
            stencilStoreOp: "discard",
        };
    }

    async createComputePipeline() {
        const rayTraceBindGroupLayout = this.device?.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba8unorm",
                        viewDimension: "2d",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "uniform",
                    },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
            ],
        });

        this.ray_tracing_bind_group = this.device?.createBindGroup({
            layout: rayTraceBindGroupLayout!,
            entries: [
                {
                    binding: 0,
                    resource: this.color_buffer_view as GPUTextureView,
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.sceneParams as GPUBuffer,
                    },
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.sphereBuffer as GPUBuffer,
                    },
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.nodeBuffer as GPUBuffer,
                    },
                },
                {
                    binding: 4,
                    resource: {
                        buffer: this.sphereIndexBuffer as GPUBuffer,
                    },
                },
            ],
        });

        const rayTracePipelineLayout = this.device?.createPipelineLayout({
            bindGroupLayouts: [rayTraceBindGroupLayout!],
        });

        this.ray_tracing_pipeline = this.device?.createComputePipeline({
            layout: rayTracePipelineLayout!,
            compute: {
                module: this.device?.createShaderModule({
                    code: raytracer_kernel,
                }),
                entryPoint: "main",
            },
        });

        const screenBindGroupLayout = this.device?.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
            ],
        });

        this.screen_bind_group = this.device?.createBindGroup({
            layout: screenBindGroupLayout!,
            entries: [
                {
                    binding: 0,
                    resource: this.sampler as GPUSampler,
                },
                {
                    binding: 1,
                    resource: this.color_buffer_view as GPUTextureView,
                },
            ],
        });

        const screenPipelineLayout = this.device?.createPipelineLayout({
            bindGroupLayouts: [screenBindGroupLayout!],
        });

        this.screen_pipeline = this.device?.createRenderPipeline({
            layout: screenPipelineLayout!,
            vertex: {
                module: this.device?.createShaderModule({
                    code: screen_shader,
                }),
                entryPoint: "vert_main",
            },
            fragment: {
                module: this.device?.createShaderModule({
                    code: screen_shader,
                }),
                entryPoint: "frag_main",
                targets: [
                    {
                        format: "bgra8unorm",
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
            },
        });
    }

    async createPipeline() {
        if (
            !this.device ||
            !this.triangleMesh ||
            !this.canvasFormat ||
            !this.context ||
            !this.adapter ||
            !this.canvas ||
            !this.triangleMaterial ||
            !this.quadMaterial ||
            !this.objectBuffer ||
            !this.materialGroupLayout ||
            !this.frameGroupLayout
        ) {
            throw new Error("Missing required objects");
        }

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameGroupLayout, this.materialGroupLayout],
        });

        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            depthStencil: this.depthStencilState,
            vertex: {
                module: this.device.createShaderModule({
                    code: shader,
                }),
                entryPoint: "vs_main", // the entry point of the vertex shader, the function name
                buffers: [this.triangleMesh.bufferLayout], // the interface for the buffer
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: shader,
                }),
                entryPoint: "fs_main",
                targets: [
                    {
                        format: this.canvasFormat,
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
            },
        });
    }

    async makeBindGroups() {
        this.frameBindGroup = this.device?.createBindGroup({
            layout: this.frameGroupLayout!,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer as GPUBuffer,
                    },
                },

                {
                    binding: 1,
                    resource: {
                        buffer: this.objectBuffer as GPUBuffer,
                    },
                },
            ],
        });
    }

    prepareComputerScene() {
        const sceneData = {
            cameraPos: this.scene?.camera.position,
            cameraForwards: this.scene?.camera.forwards,
            cameraRight: this.scene?.camera.right,
            cameraUp: this.scene?.camera.up,
            sphereCount: this.scene?.spheres.length,
        };
        const maxBounces = 4;
        this.device?.queue.writeBuffer(
            this.sceneParams!,
            0,
            new Float32Array([
                sceneData.cameraPos![0],
                sceneData.cameraPos![1],
                sceneData.cameraPos![2],
                0.0,
                sceneData.cameraForwards![0],
                sceneData.cameraForwards![1],
                sceneData.cameraForwards![2],
                0.0,
                sceneData.cameraRight![0],
                sceneData.cameraRight![1],
                sceneData.cameraRight![2],

                maxBounces,

                sceneData.cameraUp![0],
                sceneData.cameraUp![1],
                sceneData.cameraUp![2],

                sceneData.sphereCount!,
            ]),
            0,
            16
        );

        const sphereData = new Float32Array(8 * this.scene!.spheres.length);
        for (let i = 0; i < this.scene!.spheres.length; i++) {
            sphereData[8 * i] = this.scene!.spheres[i].center[0];
            sphereData[8 * i + 1] = this.scene!.spheres[i].center[1];
            sphereData[8 * i + 2] = this.scene!.spheres[i].center[2];
            sphereData[8 * i + 3] = 0.0;
            sphereData[8 * i + 4] = this.scene!.spheres[i].color[1];
            sphereData[8 * i + 5] = this.scene!.spheres[i].color[2];
            sphereData[8 * i + 6] = this.scene!.spheres[i].color[3];
            sphereData[8 * i + 7] = this.scene!.spheres[i].radius;
        }

        this.device?.queue.writeBuffer(
            this.sphereBuffer!,
            0,
            sphereData,
            0,
            8 * this.scene!.sphereCount
        );

        const nodeData = new Float32Array(8 * this.scene!.nodesCount);
        for (let i = 0; i < this.scene!.nodesCount; i++) {
            nodeData[8 * i] = this.scene!.nodes![i].minCorner![0];
            nodeData[8 * i + 1] = this.scene!.nodes![i].minCorner![1];
            nodeData[8 * i + 2] = this.scene!.nodes![i].minCorner![2];
            nodeData[8 * i + 3] = this.scene!.nodes![i].leftChild!;
            nodeData[8 * i + 4] = this.scene!.nodes![i].maxCorner![1];
            nodeData[8 * i + 5] = this.scene!.nodes![i].maxCorner![2];
            nodeData[8 * i + 6] = this.scene!.nodes![i].maxCorner![3];
            nodeData[8 * i + 7] = this.scene!.nodes![i].sphereCount!;
        }

        this.device?.queue.writeBuffer(
            this.nodeBuffer!,
            0,
            nodeData,
            0,
            8 * this.scene!.nodesCount
        );

        const sphereIndexData = new Float32Array(8 * this.scene!.sphereCount);
        for (let i = 0; i < this.scene!.spheres.length; i++) {
            sphereIndexData[i] = this.scene!.sphereIndices![i];
        }

        this.device?.queue.writeBuffer(
            this.sphereIndexBuffer!,
            0,
            sphereIndexData,
            0,
            this.scene!.sphereCount
        );
    }

    computeRender = () => {
        this.prepareComputerScene();
        const commandEncoder = this.device!.createCommandEncoder();

        const rayTracePass = commandEncoder.beginComputePass();

        rayTracePass.setPipeline(this.ray_tracing_pipeline!);
        rayTracePass.setBindGroup(0, this.ray_tracing_bind_group!);
        rayTracePass.dispatchWorkgroups(
            this.canvas.width,
            this.canvas.height,
            1
        );
        rayTracePass.end();

        const textureView = this.context?.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: textureView as GPUTextureView,
                    storeOp: "store",
                    loadOp: "clear",
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                },
            ],
        });

        renderPass.setPipeline(this.screen_pipeline!);
        renderPass.setBindGroup(0, this.screen_bind_group!);
        renderPass.draw(6, 1, 0, 0);

        renderPass.end();

        this.device!.queue.submit([commandEncoder.finish()]);
    };

    async render(renderables: RenderData) {
        if (!this.objectBuffer) {
            throw new Error("Object buffer is undefined");
        }

        const projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, 512 / 512, 0.1, 10);

        const view = renderables.viewTransform;

        this.device?.queue.writeBuffer(
            this.objectBuffer,
            0,
            renderables.modelTransform,
            0,
            renderables.modelTransform.length
        );

        this.device?.queue.writeBuffer(
            this.uniformBuffer!,
            0,
            <ArrayBuffer>view
        );
        this.device?.queue.writeBuffer(
            this.uniformBuffer!,
            64,
            <ArrayBuffer>projection
        );

        // records all the operations we want to perform
        const commandEncoder = this.device!.createCommandEncoder();
        // create a texture view from the canvas context
        const textureView = this.context!.getCurrentTexture().createView();
        // create a render pass, which is a collection of render commands
        const renderPass = commandEncoder.beginRenderPass({
            // the color attachment is the texture view we created above
            colorAttachments: [
                {
                    view: textureView, // the texture view
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // clear color
                    loadOp: "clear", // load the texture view
                    storeOp: "store", // store the result of the operation
                },
            ],
            depthStencilAttachment: this.depthStencilAttachment,
        });

        // sets the pipeline to use for the render pass, which has the commands we want to run
        renderPass.setPipeline(this.pipeline!);
        renderPass.setBindGroup(0, this.frameBindGroup!);

        let objectsDrawn = 0;

        // Triangle
        renderPass.setVertexBuffer(0, this.triangleMesh!.buffer);

        renderPass.setBindGroup(1, this.triangleMaterial?.bindGroup!);
        // set the vertex buffer to the triangle mesh buffer

        renderPass.draw(
            3,
            renderables.objectCounts[ObjectTypes.TRIANGLE],
            0,
            objectsDrawn
        );
        objectsDrawn += renderables.objectCounts[ObjectTypes.TRIANGLE];

        // Quads
        renderPass.setVertexBuffer(0, this.quadMesh!.buffer);

        renderPass.setBindGroup(1, this.quadMaterial?.bindGroup!);
        // set the vertex buffer to the triangle mesh buffer

        renderPass.draw(
            6,
            renderables.objectCounts[ObjectTypes.QUAD],
            0,
            objectsDrawn
        );
        objectsDrawn += renderables.objectCounts[ObjectTypes.QUAD];

        // Statue
        renderPass.setVertexBuffer(0, this.statueMesh!.buffer!);

        renderPass.setBindGroup(1, this.triangleMaterial?.bindGroup!);
        // set the vertex buffer to the triangle mesh buffer

        renderPass.draw(this.statueMesh?.vertexCount!, 1, 0, objectsDrawn);
        objectsDrawn += 1;

        renderPass.end();

        this.device!.queue.submit([commandEncoder.finish()]);
    }
}