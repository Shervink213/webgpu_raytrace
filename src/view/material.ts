import floor from "/floor.jpg";
import image from "/vite.jpg";

export class Material {
    texture: GPUTexture | undefined;
    view: GPUTextureView | undefined;
    sampler: GPUSampler | undefined;
    bindGroup: GPUBindGroup | undefined;

    async init(
        device: GPUDevice,
        image: string,
        bindGroupLayout: GPUBindGroupLayout
    ) {
        const blob = await fetch(image).then((r) => r.blob());
        const imageBitmap = await createImageBitmap(blob);

        await this.loadImageBitMap(device, imageBitmap);
        if (!this.texture) {
            throw new Error("Texture not created");
        }

        const viewDescriptor: GPUTextureViewDescriptor = {
            format: "rgba8unorm",
            dimension: "2d",
            aspect: "all",
        };

        this.view = this.texture.createView(viewDescriptor);

        const samplerDescriptor: GPUSamplerDescriptor = {
            addressModeU: "repeat",
            addressModeV: "repeat",
        };

        this.sampler = device.createSampler(samplerDescriptor);

        this.bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.view as GPUTextureView,
                },
                {
                    binding: 1,
                    resource: this.sampler as GPUSampler,
                },
            ],
        });
    }

    async loadImageBitMap(device: GPUDevice, imageData: ImageBitmap) {
        const texttureDescriptor: GPUTextureDescriptor = {
            size: {
                width: imageData.width,
                height: imageData.height,
            },
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        };

        this.texture = device.createTexture(texttureDescriptor);

        device.queue.copyExternalImageToTexture(
            {
                source: imageData,
            },
            {
                texture: this.texture,
            },
            texttureDescriptor.size
        );
    }
}
