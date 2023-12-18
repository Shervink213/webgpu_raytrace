import raytracer_kernel from "./shaders/raytracer_kernel.wgsl";
import screen_shader from "./shaders/screen_shader.wgsl";
import { ComputeScene } from "../model/scene";
import { CubeMapMaterial } from "./cube_material";

export class Render {
    canvas: HTMLCanvasElement;

    adapter: GPUAdapter | undefined | null;
    device: GPUDevice | undefined;
    context: GPUCanvasContext | undefined;
    canvasFormat: GPUTextureFormat | undefined;

    // Pipeline
    ray_tracing_pipeline: GPUComputePipeline | undefined;
    ray_tracing_bind_group: GPUBindGroup | undefined;
    ray_tracing_bind_group_layout: GPUBindGroupLayout | undefined;
    screen_pipeline: GPURenderPipeline | undefined;
    screen_bind_group: GPUBindGroup | undefined;
    screen_bind_group_layout: GPUBindGroupLayout | undefined;

    // Depth buffer
    depthStencilState: GPUDepthStencilState | undefined;
    depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined;
    depthStencilBuffer: GPUTexture | undefined;
    depthStencilView: GPUTextureView | undefined;

    // Assets
    color_buffer: GPUTexture | undefined;
    color_buffer_view: GPUTextureView | undefined;
    sampler: GPUSampler | undefined;
    sceneParams: GPUBuffer | undefined;
    scene: ComputeScene | undefined;
    sphereBuffer: GPUBuffer | undefined;
    nodeBuffer: GPUBuffer | undefined;
    sphereIndexBuffer: GPUBuffer | undefined;
    skyMaterial: CubeMapMaterial | undefined;

    constructor(canvas: HTMLCanvasElement, scene: ComputeScene) {
        this.canvas = canvas;
        this.scene = scene;
    }

    async init() {
        await this.setUpDevice();
        await this.makeComputeBindGroupLayouts();

        await this.createComputeAssets();
        await this.makeDepthBuffer();

        await this.makeComputeBindGroups();

        await this.createComputePipeline();
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

    async makeComputeBindGroupLayouts() {
        this.ray_tracing_bind_group_layout = this.device?.createBindGroupLayout(
            {
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
                    {
                        binding: 5,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: {
                            viewDimension: "cube",
                        },
                    },
                    {
                        binding: 6,
                        visibility: GPUShaderStage.COMPUTE,
                        sampler: {},
                    },
                ],
            }
        );

        this.screen_bind_group_layout = this.device?.createBindGroupLayout({
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

        this.skyMaterial = new CubeMapMaterial();
        const urls = [
            "/webgpu_raytrace/sky_front.png",
            "/webgpu_raytrace/sky_back.png",
            "/webgpu_raytrace/sky_left.png",
            "/webgpu_raytrace/sky_right.png",
            "/webgpu_raytrace/sky_bottom.png",
            "/webgpu_raytrace/sky_top.png",
        ];
        await this.skyMaterial.init(this.device!, urls);
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
        const rayTracePipelineLayout = this.device?.createPipelineLayout({
            bindGroupLayouts: [this.ray_tracing_bind_group_layout!],
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

        const screenPipelineLayout = this.device?.createPipelineLayout({
            bindGroupLayouts: [this.screen_bind_group_layout!],
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

    async makeComputeBindGroups() {
        this.ray_tracing_bind_group = this.device?.createBindGroup({
            layout: this.ray_tracing_bind_group_layout!,
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
                {
                    binding: 5,
                    resource: this.skyMaterial!.view as GPUTextureView,
                },
                {
                    binding: 6,
                    resource: this.skyMaterial!.sampler as GPUSampler,
                },
            ],
        });

        this.screen_bind_group = this.device?.createBindGroup({
            layout: this.screen_bind_group_layout!,
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
    }

    prepareComputerScene() {
        const sceneData = {
            cameraPos: this.scene?.camera.position,
            cameraForwards: this.scene?.camera.forwards,
            cameraRight: this.scene?.camera.right,
            cameraUp: this.scene?.camera.up,
            sphereCount: this.scene?.spheres.length,
            maxBounces: this.scene?.maxBounces,
        };

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

                sceneData.maxBounces!,

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

    computeRender = (render_time: HTMLElement, fps: HTMLElement) => {
        this.prepareComputerScene();
        const start = performance.now();
        const commandEncoder = this.device!.createCommandEncoder();

        const rayTracePass = commandEncoder.beginComputePass();

        rayTracePass.setPipeline(this.ray_tracing_pipeline!);
        rayTracePass.setBindGroup(0, this.ray_tracing_bind_group!);
        rayTracePass.dispatchWorkgroups(
            Math.ceil(this.canvas.width / 16),
            Math.ceil(this.canvas.height / 16),
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
        this.device!.queue.onSubmittedWorkDone().then(() => {
            const end = performance.now();

            render_time.innerText = (end - start).toFixed(2);
            fps.innerText = (1000.0 / (end - start)).toFixed(2);
        });
    };
}
