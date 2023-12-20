var S=Object.defineProperty;var B=(s,r,e)=>r in s?S(s,r,{enumerable:!0,configurable:!0,writable:!0,value:e}):s[r]=e;var n=(s,r,e)=>(B(s,typeof r!="symbol"?r+"":r,e),e);(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))t(a);new MutationObserver(a=>{for(const o of a)if(o.type==="childList")for(const i of o.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&t(i)}).observe(document,{childList:!0,subtree:!0});function e(a){const o={};return a.integrity&&(o.integrity=a.integrity),a.referrerPolicy&&(o.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?o.credentials="include":a.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function t(a){if(a.ep)return;a.ep=!0;const o=e(a);fetch(a.href,o)}})();const P=`\r
struct Sphere {\r
    center: vec3<f32>,\r
    color: vec3<f32>,\r
    radius: f32,\r
};\r
\r
struct ObjectData {\r
    spheres: array<Sphere>,\r
}\r
\r
struct Node {\r
    minCorner: vec3<f32>,\r
    leftChild: f32,\r
    maxCorner: vec3<f32>,\r
    sphereCount: f32,\r
}\r
\r
struct BVH {\r
    nodes: array<Node>,\r
}\r
\r
struct ObjectIndicies {\r
    sphereIndicies: array<f32>,\r
}\r
 \r
struct Ray {\r
    direction: vec3<f32>,\r
    origin: vec3<f32>,\r
};\r
\r
struct SceneData {\r
    cameraPos: vec3<f32>,\r
    cameraForwards: vec3<f32>,\r
    cameraRight: vec3<f32>,\r
    maxBounces: f32,\r
    cameraUp: vec3<f32>,\r
    sphereCount: f32, \r
}\r
\r
struct RenderState {\r
    t: f32, // distance\r
    color: vec3<f32>, \r
    hit: bool, \r
    position: vec3<f32>,\r
    normal: vec3<f32>,\r
}\r
\r
\r
@group(0) @binding(0) var color_buffer: texture_storage_2d<rgba8unorm, write>; \r
@group(0) @binding(1) var<uniform> scene: SceneData; // camera data\r
@group(0) @binding(2) var<storage, read> objects: ObjectData; // sphere data\r
@group(0) @binding(3) var<storage, read> tree: BVH; \r
@group(0) @binding(4) var<storage, read> sphereLookup: ObjectIndicies; // indexed spheres\r
@group(0) @binding(5) var skyMaterial: texture_cube<f32>; // sky texture\r
@group(0) @binding(6) var skySampler: sampler;\r
\r
\r
@compute @workgroup_size(16,16) \r
fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {\r
\r
    let screen_size: vec2<u32> = (textureDimensions(color_buffer));\r
    let screen_pos = vec2<i32>(i32(GlobalInvocationID.x), i32(GlobalInvocationID.y));\r
\r
    // Commented out because this gets rid of the reflections for outside of the screen, making the spheres black\r
    // but great for optimization\r
    // if i32(screen_pos.x) >= i32(screen_size.x) || i32(screen_pos.y) >= i32(screen_size.y) {\r
    //     return;\r
    // }\r
\r
    let horizontal_coefficient: f32 = (f32(screen_pos.x) - f32(screen_size.x) / 2) / f32(screen_size.x);\r
    let vertical_coefficient: f32 = (f32(screen_pos.y) - f32(screen_size.y) / 2) / f32(screen_size.x);\r
\r
    let forwards: vec3<f32> = scene.cameraForwards;\r
    let right: vec3<f32> = scene.cameraRight;\r
    let up: vec3<f32> = scene.cameraUp;\r
\r
\r
    var ray: Ray;\r
    ray.origin = scene.cameraPos; // the ray starts at the camera\r
    ray.direction = normalize(forwards + horizontal_coefficient * right + vertical_coefficient * up); // the direction is the normalized vector from the camera to the pixel, so there's a ray for every pixel\r
\r
\r
    var pixel_color: vec3<f32> = rayColor(ray); // the color of the pixel is the color of the ray\r
\r
\r
\r
    textureStore(color_buffer, screen_pos, vec4<f32>(pixel_color, 1.0)); // store the color in the buffer\r
}\r
\r
fn rayColor(ray: Ray) -> vec3<f32> {\r
    var color: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0); // start out white \r
    var result: RenderState;\r
    var temp_ray: Ray;\r
    temp_ray.origin = ray.origin;\r
    temp_ray.direction = ray.direction;\r
\r
    let maxBounces = scene.maxBounces;\r
    let bounces: u32 = u32(maxBounces);\r
\r
    for (var bounce: u32 = 0; bounce < bounces; bounce++) {\r
        result = trace(temp_ray); // trace the ray (follow it to see if it hits anything)\r
\r
        color = color * result.color; // multiply the color by the color of the object it hit\r
\r
        // if it didn't hit anything, we're done\r
        if !result.hit {\r
            break;\r
        }\r
\r
        // if it did hit something, we need to reflect the ray\r
        temp_ray.origin = result.position; // the new origin is the position of the hit\r
        temp_ray.direction = normalize(reflect(temp_ray.direction, result.normal)); // the new direction is the reflection of the old direction\r
    }\r
\r
    // if it didn't hit anything, it's a sky pixel\r
    if result.hit {\r
        color = vec3<f32>(0.0, 0.0, 0.0);\r
    }\r
\r
    return color;\r
}\r
\r
fn trace(ray: Ray) -> RenderState {\r
\r
    var renderState: RenderState; // the render state is the information about the ray's hit\r
\r
    renderState.hit = false; // start out with no hit\r
    var nearestHit: f32 = 9999; // start out with a really far away hit \r
    \r
\r
    // BVH\r
    var node: Node = tree.nodes[0]; // head of the tree\r
    var stack: array<Node, 15>;\r
    var stackLocation = 0;\r
\r
\r
    while true {\r
        // get the data from the node\r
        var sphereCount = u32(node.sphereCount);\r
        var contents = u32(node.leftChild); \r
        \r
        // internal node, not actual objects\r
        if sphereCount == 0 {\r
            var leftChild: Node = tree.nodes[contents];\r
            var rightChild: Node = tree.nodes[contents + 1];\r
\r
            // get the distance to the children\r
            var distanceLeft: f32 = distance(ray, leftChild);\r
            var distanceRight: f32 = distance(ray, rightChild);\r
\r
            // if the right child is closer, go there first\r
            if distanceLeft > distanceRight {\r
                var temp = distanceLeft;\r
                distanceLeft = distanceRight;\r
                distanceRight = temp;\r
\r
                var tempChild = leftChild;\r
                leftChild = rightChild;\r
                rightChild = tempChild;\r
            }\r
\r
            // if the next node farther than the object we hit, we're done \r
            if distanceLeft > nearestHit {\r
                // no more nodes to check\r
                if stackLocation == 0 {\r
                    break;\r
                } else {\r
                    // go back up the tree\r
                    stackLocation -= 1;\r
                    node = stack[stackLocation];\r
                    continue;\r
                }\r
            } else {\r
\r
                node = leftChild;\r
                if distanceRight < nearestHit {\r
                    stack[stackLocation] = rightChild;\r
                    stackLocation += 1;\r
                }\r
            }\r
        } else {\r
             // leaf node, actual objects\r
\r
             // check each object in the node\r
            for (var i: u32 = 0; i < sphereCount; i++) {\r
                var newRenderState: RenderState = hit_sphere(ray, objects.spheres[u32(sphereLookup.sphereIndicies[i + contents])], 0.001, nearestHit, renderState);\r
                if newRenderState.hit {\r
                    nearestHit = newRenderState.t;\r
                    renderState = newRenderState;\r
                }\r
            }\r
\r
            if stackLocation == 0 {\r
                break;\r
            } else {\r
                stackLocation -= 1;\r
                node = stack[stackLocation];\r
                continue;\r
            }\r
        }\r
    }\r
\r
    if !renderState.hit {\r
        renderState.color = textureSampleLevel(skyMaterial, skySampler, ray.direction, 0.0).xyz;\r
    }\r
    return renderState;\r
}\r
\r
// reflect the ray\r
fn hit_sphere(ray: Ray, sphere: Sphere, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {\r
    let oc = ray.origin - sphere.center;\r
    let a = dot(ray.direction, ray.direction);\r
    let b = 2.0 * dot(oc, ray.direction);\r
    let c = dot(oc, oc) - sphere.radius * sphere.radius;\r
    let discriminant = b * b - 4.0 * a * c;\r
\r
\r
    var renderState: RenderState;\r
    renderState.color = oldRenderState.color;\r
\r
\r
    if discriminant > 0.0 {\r
\r
        let t: f32 = (-b - sqrt(discriminant)) / (2.0 * a);\r
\r
        // if the hit is within the bounds\r
        if t < tMax && t > tMin {\r
\r
            renderState.position = ray.origin + t * ray.direction; // change the render state to reflect the hit\r
            renderState.normal = normalize(renderState.position - sphere.center); // the normal is the vector from the center to the hit\r
            renderState.t = t; // the distance is the distance to the hit\r
            renderState.color = sphere.color; // the color is the color of the sphere\r
            renderState.hit = true; // we hit something\r
            return renderState;\r
        }\r
    }\r
\r
    renderState.hit = false; // we didn't hit anything\r
    return renderState;\r
}\r
\r
// get the distance to the node\r
fn distance(ray: Ray, node: Node) -> f32 {\r
\r
    var inverseDirection: vec3<f32> = vec3(1.0) / ray.direction;\r
    var t1: vec3<f32> = (node.minCorner - ray.origin) / inverseDirection;\r
    var t2: vec3<f32> = (node.maxCorner - ray.origin) / inverseDirection;\r
    var tMin: vec3<f32> = min(t1, t2);\r
    var tMax: vec3<f32> = max(t1, t2);\r
\r
    var tNear: f32 = max(max(tMin.x, tMin.y), tMin.z);\r
    var tFar: f32 = min(min(tMax.x, tMax.y), tMax.z);\r
\r
    // if the near is farther than the far, or the far is negative, we didn't hit anything\r
    if tNear > tFar || tFar < 0.0 {\r
        return 999;\r
    } else {\r
        return tNear;\r
    }\r
}\r
`,_=`\r
@group(0) @binding(0) var screen_sampler: sampler;\r
@group(0) @binding(1) var color_buffer: texture_2d<f32>;\r
struct VertexOutput {\r
    @builtin(position) Position: vec4<f32>,\r
    @location(0) TexCoord: vec2<f32>,\r
\r
}\r
\r
@vertex\r
fn vert_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {\r
    let positions = array<vec2<f32>, 6>(\r
        vec2<f32>(1.0, 1.0),\r
        vec2<f32>(1.0, -1.0),\r
        vec2<f32>(-1.0, -1.0),\r
        vec2<f32>(1.0, 1.0),\r
        vec2<f32>(-1.0, -1.0),\r
        vec2<f32>(-1.0, 1.0),\r
    );\r
\r
    let textCoords = array<vec2<f32>, 6>(\r
        vec2<f32>(1.0, 0.0),\r
        vec2<f32>(1.0, 1.0),\r
        vec2<f32>(0.0, 1.0),\r
        vec2<f32>(1.0, 0.0),\r
        vec2<f32>(0.0, 1.0),\r
        vec2<f32>(0.0, 0.0),\r
    );\r
\r
    var output: VertexOutput;\r
    output.Position = vec4<f32>(positions[VertexIndex], 0.0, 1.0);\r
    output.TexCoord = textCoords[VertexIndex];\r
    return output;\r
}\r
\r
@fragment\r
fn frag_main(@location(0) TexCoord: vec2<f32>) -> @location(0) vec4<f32> {\r
    return textureSample(color_buffer, screen_sampler, TexCoord);\r
}\r
`;class I{constructor(){n(this,"texture");n(this,"view");n(this,"sampler")}async init(r,e){let t=Array(6);for(let i=0;i<e.length;i++){const d=await(await fetch(e[i])).blob();t[i]=await createImageBitmap(d)}await this.loadImageBitmaps(r,t);const a={format:"rgba8unorm",dimension:"cube",aspect:"all",baseMipLevel:0,mipLevelCount:1,baseArrayLayer:0,arrayLayerCount:6};this.view=this.texture.createView(a);const o={addressModeU:"repeat",addressModeV:"repeat",magFilter:"linear",minFilter:"nearest",mipmapFilter:"nearest",maxAnisotropy:1};this.sampler=r.createSampler(o)}async loadImageBitmaps(r,e){const a={dimension:"2d",size:{width:1024,height:1024,depthOrArrayLayers:6},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT};this.texture=r.createTexture(a);for(let o=0;o<6;o++)r.queue.copyExternalImageToTexture({source:e[o]},{texture:this.texture,origin:[0,0,o]},[e[o].width,e[o].height])}}class p{constructor(r,e){n(this,"canvas");n(this,"adapter");n(this,"device");n(this,"context");n(this,"canvasFormat");n(this,"ray_tracing_pipeline");n(this,"ray_tracing_bind_group");n(this,"ray_tracing_bind_group_layout");n(this,"screen_pipeline");n(this,"screen_bind_group");n(this,"screen_bind_group_layout");n(this,"depthStencilState");n(this,"depthStencilAttachment");n(this,"depthStencilBuffer");n(this,"depthStencilView");n(this,"color_buffer");n(this,"color_buffer_view");n(this,"sampler");n(this,"sceneParams");n(this,"scene");n(this,"sphereBuffer");n(this,"nodeBuffer");n(this,"sphereIndexBuffer");n(this,"skyMaterial");n(this,"computeRender",(r,e)=>{var d;this.prepareComputerScene();const t=performance.now(),a=this.device.createCommandEncoder(),o=a.beginComputePass();o.setPipeline(this.ray_tracing_pipeline),o.setBindGroup(0,this.ray_tracing_bind_group),o.dispatchWorkgroups(Math.ceil(this.canvas.width/16),Math.ceil(this.canvas.height/16),1),o.end();const i=(d=this.context)==null?void 0:d.getCurrentTexture().createView(),c=a.beginRenderPass({colorAttachments:[{view:i,storeOp:"store",loadOp:"clear",clearValue:{r:0,g:0,b:0,a:1}}]});c.setPipeline(this.screen_pipeline),c.setBindGroup(0,this.screen_bind_group),c.draw(6,1,0,0),c.end(),this.device.queue.submit([a.finish()]),this.device.queue.onSubmittedWorkDone().then(()=>{const u=performance.now();r.innerText=(u-t).toFixed(2),e.innerText=(1e3/(u-t)).toFixed(2)})});this.canvas=r,this.scene=e}async init(){await this.setUpDevice(),await this.makeComputeBindGroupLayouts(),await this.createComputeAssets(),await this.makeDepthBuffer(),await this.makeComputeBindGroups(),await this.createComputePipeline()}async setUpDevice(){if(this.adapter=await navigator.gpu.requestAdapter(),console.log(this.adapter),!this.adapter)throw new Error("No appropriate GPUAdapter found.");this.device=await this.adapter.requestDevice(),this.context=this.canvas.getContext("webgpu"),this.canvasFormat=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:this.device,format:this.canvasFormat,alphaMode:"opaque"})}async makeComputeBindGroupLayouts(){var r,e;this.ray_tracing_bind_group_layout=(r=this.device)==null?void 0:r.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:"write-only",format:"rgba8unorm",viewDimension:"2d"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:5,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:"cube"}},{binding:6,visibility:GPUShaderStage.COMPUTE,sampler:{}}]}),this.screen_bind_group_layout=(e=this.device)==null?void 0:e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,sampler:{}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{}}]})}async createComputeAssets(){var c,d;this.color_buffer=(c=this.device)==null?void 0:c.createTexture({size:{width:this.canvas.width,height:this.canvas.height},format:"rgba8unorm",usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING}),this.color_buffer_view=this.color_buffer.createView();const r={addressModeU:"repeat",addressModeV:"repeat",magFilter:"linear",minFilter:"nearest",mipmapFilter:"nearest",maxAnisotropy:1};this.sampler=this.device.createSampler(r);const e={size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST};this.sceneParams=this.device.createBuffer(e);const t={size:32*((d=this.scene.spheres)==null?void 0:d.length),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST};this.sphereBuffer=this.device.createBuffer(t);const a={size:32*this.scene.nodesCount,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST};this.nodeBuffer=this.device.createBuffer(a);const o={size:4*this.scene.sphereCount,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST};this.sphereIndexBuffer=this.device.createBuffer(o),this.skyMaterial=new I;const i=["/webgpu_raytrace/sky_front.png","/webgpu_raytrace/sky_back.png","/webgpu_raytrace/sky_left.png","/webgpu_raytrace/sky_right.png","/webgpu_raytrace/sky_bottom.png","/webgpu_raytrace/sky_top.png"];await this.skyMaterial.init(this.device,i)}async makeDepthBuffer(){this.depthStencilState={format:"depth24plus-stencil8",depthWriteEnabled:!0,depthCompare:"less-equal"};const e={size:{width:this.canvas.width,height:this.canvas.height,depthOrArrayLayers:1},format:"depth24plus-stencil8",usage:GPUTextureUsage.RENDER_ATTACHMENT};this.depthStencilBuffer=this.device.createTexture(e);const t={format:"depth24plus-stencil8",dimension:"2d",aspect:"all"};this.depthStencilView=this.depthStencilBuffer.createView(t),this.depthStencilAttachment={view:this.depthStencilView,depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store",stencilLoadOp:"clear",stencilStoreOp:"discard"}}async createComputePipeline(){var t,a,o,i,c,d,u;const r=(t=this.device)==null?void 0:t.createPipelineLayout({bindGroupLayouts:[this.ray_tracing_bind_group_layout]});this.ray_tracing_pipeline=(o=this.device)==null?void 0:o.createComputePipeline({layout:r,compute:{module:(a=this.device)==null?void 0:a.createShaderModule({code:P}),entryPoint:"main"}});const e=(i=this.device)==null?void 0:i.createPipelineLayout({bindGroupLayouts:[this.screen_bind_group_layout]});this.screen_pipeline=(u=this.device)==null?void 0:u.createRenderPipeline({layout:e,vertex:{module:(c=this.device)==null?void 0:c.createShaderModule({code:_}),entryPoint:"vert_main"},fragment:{module:(d=this.device)==null?void 0:d.createShaderModule({code:_}),entryPoint:"frag_main",targets:[{format:"bgra8unorm"}]},primitive:{topology:"triangle-list"}})}async makeComputeBindGroups(){var r,e;this.ray_tracing_bind_group=(r=this.device)==null?void 0:r.createBindGroup({layout:this.ray_tracing_bind_group_layout,entries:[{binding:0,resource:this.color_buffer_view},{binding:1,resource:{buffer:this.sceneParams}},{binding:2,resource:{buffer:this.sphereBuffer}},{binding:3,resource:{buffer:this.nodeBuffer}},{binding:4,resource:{buffer:this.sphereIndexBuffer}},{binding:5,resource:this.skyMaterial.view},{binding:6,resource:this.skyMaterial.sampler}]}),this.screen_bind_group=(e=this.device)==null?void 0:e.createBindGroup({layout:this.screen_bind_group_layout,entries:[{binding:0,resource:this.sampler},{binding:1,resource:this.color_buffer_view}]})}prepareComputerScene(){var o,i,c,d,u,l,f,v,y,b;const r={cameraPos:(o=this.scene)==null?void 0:o.camera.position,cameraForwards:(i=this.scene)==null?void 0:i.camera.forwards,cameraRight:(c=this.scene)==null?void 0:c.camera.right,cameraUp:(d=this.scene)==null?void 0:d.camera.up,sphereCount:(u=this.scene)==null?void 0:u.spheres.length,maxBounces:(l=this.scene)==null?void 0:l.maxBounces};(f=this.device)==null||f.queue.writeBuffer(this.sceneParams,0,new Float32Array([r.cameraPos[0],r.cameraPos[1],r.cameraPos[2],0,r.cameraForwards[0],r.cameraForwards[1],r.cameraForwards[2],0,r.cameraRight[0],r.cameraRight[1],r.cameraRight[2],r.maxBounces,r.cameraUp[0],r.cameraUp[1],r.cameraUp[2],r.sphereCount]),0,16);const e=new Float32Array(8*this.scene.spheres.length);for(let h=0;h<this.scene.spheres.length;h++)e[8*h]=this.scene.spheres[h].center[0],e[8*h+1]=this.scene.spheres[h].center[1],e[8*h+2]=this.scene.spheres[h].center[2],e[8*h+3]=0,e[8*h+4]=this.scene.spheres[h].color[1],e[8*h+5]=this.scene.spheres[h].color[2],e[8*h+6]=this.scene.spheres[h].color[3],e[8*h+7]=this.scene.spheres[h].radius;(v=this.device)==null||v.queue.writeBuffer(this.sphereBuffer,0,e,0,8*this.scene.sphereCount);const t=new Float32Array(8*this.scene.nodesCount);for(let h=0;h<this.scene.nodesCount;h++)t[8*h]=this.scene.nodes[h].minCorner[0],t[8*h+1]=this.scene.nodes[h].minCorner[1],t[8*h+2]=this.scene.nodes[h].minCorner[2],t[8*h+3]=this.scene.nodes[h].leftChild,t[8*h+4]=this.scene.nodes[h].maxCorner[1],t[8*h+5]=this.scene.nodes[h].maxCorner[2],t[8*h+6]=this.scene.nodes[h].maxCorner[3],t[8*h+7]=this.scene.nodes[h].sphereCount;(y=this.device)==null||y.queue.writeBuffer(this.nodeBuffer,0,t,0,8*this.scene.nodesCount);const a=new Float32Array(8*this.scene.sphereCount);for(let h=0;h<this.scene.spheres.length;h++)a[h]=this.scene.sphereIndices[h];(b=this.device)==null||b.queue.writeBuffer(this.sphereIndexBuffer,0,a,0,this.scene.sphereCount)}}class M{constructor(r,e,t){n(this,"position");n(this,"view");n(this,"forwards");n(this,"right");n(this,"up");n(this,"theta",0);n(this,"phi",0);this.position=r,this.theta=e,this.phi=t,this.forwards=new Float32Array([1,0,0]),this.right=new Float32Array([0,-1,0]),this.up=new Float32Array([0,0,1])}}var g=typeof Float32Array<"u"?Float32Array:Array;Math.hypot||(Math.hypot=function(){for(var s=0,r=arguments.length;r--;)s+=arguments[r]*arguments[r];return Math.sqrt(s)});function U(){var s=new g(3);return g!=Float32Array&&(s[0]=0,s[1]=0,s[2]=0),s}function C(s,r,e){var t=new g(3);return t[0]=s,t[1]=r,t[2]=e,t}function E(s,r,e){return s[0]=r[0]+e[0],s[1]=r[1]+e[1],s[2]=r[2]+e[2],s}function w(s,r,e){return s[0]=r[0]-e[0],s[1]=r[1]-e[1],s[2]=r[2]-e[2],s}function A(s,r,e){return s[0]=Math.min(r[0],e[0]),s[1]=Math.min(r[1],e[1]),s[2]=Math.min(r[2],e[2]),s}function N(s,r,e){return s[0]=Math.max(r[0],e[0]),s[1]=Math.max(r[1],e[1]),s[2]=Math.max(r[2],e[2]),s}(function(){var s=U();return function(r,e,t,a,o,i){var c,d;for(e||(e=3),t||(t=0),a?d=Math.min(a*e+t,r.length):d=r.length,c=t;c<d;c+=e)s[0]=r[c],s[1]=r[c+1],s[2]=r[c+2],o(s,s,i),r[c]=s[0],r[c+1]=s[1],r[c+2]=s[2];return r}})();class R{constructor(r,e,t){n(this,"center");n(this,"radius");n(this,"color");this.center=new Float32Array(r),this.radius=e,this.color=new Float32Array(t)}}class T{constructor(){n(this,"minCorner");n(this,"leftChild");n(this,"maxCorner");n(this,"sphereCount")}}class m{constructor(r,e){n(this,"spheres");n(this,"camera");n(this,"sphereCount");n(this,"nodes");n(this,"nodesCount",0);n(this,"sphereIndices");n(this,"maxBounces");this.spheres=new Array(r);for(let t=0;t<this.spheres.length;t++){const a=[-50+100*Math.random(),-50+100*Math.random(),-50+100*Math.random()],o=.1+1.9*Math.random();let i=[.1+.9*Math.random(),.1+.9*Math.random(),.1+.9*Math.random()];this.spheres[t]=new R(a,o,i)}this.sphereCount=this.spheres.length,this.camera=new M([-20,0,0],0,0),this.maxBounces=e,this.buildBVH()}buildBVH(){this.sphereIndices=new Array(this.sphereCount);for(let e=0;e<this.sphereCount;e++)this.sphereIndices[e]=e;this.nodes=new Array(2*this.sphereCount-1);for(let e=0;e<this.nodes.length;e++)this.nodes[e]=new T;let r=this.nodes[0];r.leftChild=0,r.sphereCount=this.sphereCount,this.nodesCount+=1,this.updateBVH(0),this.subdivide(0)}updateBVH(r){let e=this.nodes[r];e.minCorner=C(1/0,1/0,1/0),e.maxCorner=C(-1/0,-1/0,-1/0);for(let t=0;t<e.sphereCount;t++){let a=this.sphereIndices[e.leftChild+t],o=this.spheres[a];const i=[o.radius,o.radius,o.radius];let c=[0,0,0];w(c,o.center,i),A(e.minCorner,e.minCorner,c),E(c,o.center,i),N(e.maxCorner,e.maxCorner,c)}}subdivide(r){let e=this.nodes[r];if(e.sphereCount<=2)return;let t=[0,0,0];w(t,e.maxCorner,e.minCorner);let a=0;t[1]>t[a]&&(a=1),t[2]>t[a]&&(a=2);const o=(e.minCorner[a]+e.maxCorner[a])/2;let i=e.leftChild,c=i+e.sphereCount-1;for(;i<=c;)if(this.spheres[this.sphereIndices[i]].center[a]<o)i+=1;else{let f=this.sphereIndices[i];this.sphereIndices[i]=this.sphereIndices[c],this.sphereIndices[c]=f,c-=1}let d=i-e.leftChild;if(d===0||d===e.sphereCount)return;const u=this.nodesCount;this.nodesCount+=1;const l=this.nodesCount;this.nodesCount+=1,this.nodes[u].leftChild=e.leftChild,this.nodes[u].sphereCount=d,this.nodes[l].leftChild=i,this.nodes[l].sphereCount=e.sphereCount-d,e.leftChild=u,e.sphereCount=0,this.updateBVH(u),this.updateBVH(l),this.subdivide(u),this.subdivide(l)}}class G{constructor(r){n(this,"canvas");n(this,"render");n(this,"scene");n(this,"running",!1);n(this,"checkIfNumberIsValid",r=>!isNaN(r)&&r>-1&&r<1e6);n(this,"getValue",(r,e)=>{const t=r.valueAsNumber;return this.checkIfNumberIsValid(t)?t:e});n(this,"run",async()=>{const r=document.getElementById("render_time"),e=document.getElementById("fps");this.running&&this.render.computeRender(r,e),requestAnimationFrame(this.run)});const e=document.getElementById("count"),t=document.getElementById("bounces"),a=document.getElementById("canvas_width"),o=document.getElementById("canvas_height");this.canvas=r,this.canvas.width=this.getValue(a,512),this.canvas.height=this.getValue(o,512),this.scene=new m(this.getValue(e,12),this.getValue(t,4)),this.render=new p(r,this.scene),e.addEventListener("change",async()=>{const i=this.getValue(e,12);if(e.valueAsNumber<1||isNaN(e.valueAsNumber)){if(document.getElementById("sphere_error"))return;const c=document.createElement("div");c.id="sphere_error",c.className="text-lg text-red-500",c.textContent="Please enter a valid number for sphere count",e.parentElement.appendChild(c);return}else{const c=document.getElementById("sphere_error");c&&c.remove()}this.scene=new m(i,this.getValue(t,4)),this.render=new p(r,this.scene),this.running=!1,await this.render.init().then(()=>this.running=!0)}),t.addEventListener("change",async()=>{const i=this.getValue(t,4);if(t.valueAsNumber<0||isNaN(t.valueAsNumber)){if(document.getElementById("bounce_error"))return;const c=document.createElement("div");c.id="bounce_error",c.className="text-lg text-red-500",c.textContent="Please enter a valid number for bounce",e.parentElement.appendChild(c);return}else{const c=document.getElementById("bounce_error");c&&c.remove()}this.scene=new m(this.getValue(e,32),i),this.render=new p(r,this.scene),this.running=!1,await this.render.init().then(()=>this.running=!0)}),a.addEventListener("change",async()=>{if(a.valueAsNumber<0||isNaN(a.valueAsNumber)){if(document.getElementById("width_error"))return;const i=document.createElement("div");i.id="width_error",i.className="text-lg text-red-500",i.textContent="Please enter a valid number for width",e.parentElement.appendChild(i);return}else{const i=document.getElementById("width_error");i&&i.remove()}this.canvas.width=this.getValue(a,512),this.render=new p(this.canvas,this.scene),this.running=!1,await this.render.init().then(()=>this.running=!0)}),o.addEventListener("change",async()=>{if(o.valueAsNumber<0||isNaN(o.valueAsNumber)){if(document.getElementById("height_error"))return;const i=document.createElement("div");i.id="height_error",i.className="text-lg text-red-500",i.textContent="Please enter a valid number for height",e.parentElement.appendChild(i);return}else{const i=document.getElementById("height_error");i&&i.remove()}this.canvas.height=this.getValue(o,512),this.render=new p(this.canvas,this.scene),this.running=!1,await this.render.init().then(()=>this.running=!0)})}async init(){await this.render.init().then(()=>this.running=!0)}}const k=document.getElementById("canvas"),x=new G(k);x.init().then(()=>{x.run()});
