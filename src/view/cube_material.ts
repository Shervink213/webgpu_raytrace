export class CubeMapMaterial {
  texture: GPUTexture | undefined;
  view: GPUTextureView | undefined;
  sampler: GPUSampler | undefined;

  async init(device: GPUDevice, urls: string[]) {
    let imageData = Array<ImageBitmap>(6);
    for (let i = 0; i < urls.length; i++) {
      const response = await fetch(urls[i]);
      const blob = await response.blob();
      imageData[i] = await createImageBitmap(blob);
    }

    await this.loadImageBitmaps(device, imageData);

    const viewDescriptor: GPUTextureViewDescriptor = {
      format: "rgba8unorm",
      dimension: "cube",
      aspect: "all",
      baseMipLevel: 0,
      mipLevelCount: 1,
      baseArrayLayer: 0,
      arrayLayerCount: 6,
    };

    this.view = this.texture!.createView(viewDescriptor);

    const samplerDescriptor: GPUSamplerDescriptor = {
      addressModeU: "repeat",
      addressModeV: "repeat",

      magFilter: "linear",
      minFilter: "nearest",
      mipmapFilter: "nearest",
      maxAnisotropy: 1,
    };

    this.sampler = device.createSampler(samplerDescriptor);
  }

  async loadImageBitmaps(device: GPUDevice, imageData: ImageBitmap[]) {
    const faceSize = 1024; // each face is 1024x1024

    // create a texture with 6 faces
    const textureDescriptor: GPUTextureDescriptor = {
      dimension: "2d",
      size: {
        width: faceSize,
        height: faceSize,
        depthOrArrayLayers: 6,
      },
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    };

    this.texture = device.createTexture(textureDescriptor);

    // copy each face into the texture
    for (let i = 0; i < 6; i++) {
      device.queue.copyExternalImageToTexture(
        { source: imageData[i] },
        { texture: this.texture, origin: [0, 0, i] },
        [imageData[i].width, imageData[i].height]
      );
    }
  }
}
