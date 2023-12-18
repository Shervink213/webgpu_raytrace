
struct Sphere {
    center: vec3<f32>,
    color: vec3<f32>,
    radius: f32,
};

struct ObjectData {
    spheres: array<Sphere>,
}

struct Node {
    minCorner: vec3<f32>,
    leftChild: f32,
    maxCorner: vec3<f32>,
    sphereCount: f32,
}

struct BVH {
    nodes: array<Node>,
}

struct ObjectIndicies {
    sphereIndicies: array<f32>,
}
 
struct Ray {
    direction: vec3<f32>,
    origin: vec3<f32>,
};

struct SceneData {
    cameraPos: vec3<f32>,
    cameraForwards: vec3<f32>,
    cameraRight: vec3<f32>,
    maxBounces: f32,
    cameraUp: vec3<f32>,
    sphereCount: f32, 
}

struct RenderState {
    t: f32, // distance
    color: vec3<f32>, 
    hit: bool, 
    position: vec3<f32>,
    normal: vec3<f32>,
}


@group(0) @binding(0) var color_buffer: texture_storage_2d<rgba8unorm, write>; 
@group(0) @binding(1) var<uniform> scene: SceneData; // camera data
@group(0) @binding(2) var<storage, read> objects: ObjectData; // sphere data
@group(0) @binding(3) var<storage, read> tree: BVH; 
@group(0) @binding(4) var<storage, read> sphereLookup: ObjectIndicies; // indexed spheres
@group(0) @binding(5) var skyMaterial: texture_cube<f32>; // sky texture
@group(0) @binding(6) var skySampler: sampler;


@compute @workgroup_size(16,16) 
fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {

    let screen_size: vec2<u32> = (textureDimensions(color_buffer));
    let screen_pos = vec2<i32>(i32(GlobalInvocationID.x), i32(GlobalInvocationID.y));

    // Commented out because this gets rid of the reflections for outside of the screen, making the spheres black
    // but great for optimization
    // if i32(screen_pos.x) >= i32(screen_size.x) || i32(screen_pos.y) >= i32(screen_size.y) {
    //     return;
    // }

    let horizontal_coefficient: f32 = (f32(screen_pos.x) - f32(screen_size.x) / 2) / f32(screen_size.x);
    let vertical_coefficient: f32 = (f32(screen_pos.y) - f32(screen_size.y) / 2) / f32(screen_size.x);

    let forwards: vec3<f32> = scene.cameraForwards;
    let right: vec3<f32> = scene.cameraRight;
    let up: vec3<f32> = scene.cameraUp;


    var ray: Ray;
    ray.origin = scene.cameraPos; // the ray starts at the camera
    ray.direction = normalize(forwards + horizontal_coefficient * right + vertical_coefficient * up); // the direction is the normalized vector from the camera to the pixel, so there's a ray for every pixel


    var pixel_color: vec3<f32> = rayColor(ray); // the color of the pixel is the color of the ray



    textureStore(color_buffer, screen_pos, vec4<f32>(pixel_color, 1.0)); // store the color in the buffer
}

fn rayColor(ray: Ray) -> vec3<f32> {
    var color: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0); // start out white 
    var result: RenderState;
    var temp_ray: Ray;
    temp_ray.origin = ray.origin;
    temp_ray.direction = ray.direction;

    let bounces: u32 = u32(scene.maxBounces); // we need a max or it'll go on forever

    for (var bounce: u32 = 0; bounce < bounces; bounce++) {
        result = trace(temp_ray); // trace the ray (follow it to see if it hits anything)

        color = color * result.color; // multiply the color by the color of the object it hit

        // if it didn't hit anything, we're done
        if !result.hit {
            break;
        }

        // if it did hit something, we need to reflect the ray
        temp_ray.origin = result.position; // the new origin is the position of the hit
        temp_ray.direction = normalize(reflect(temp_ray.direction, result.normal)); // the new direction is the reflection of the old direction
    }

    // if it didn't hit anything, it's a sky pixel
    if result.hit {
        color = vec3<f32>(0.0, 0.0, 0.0);
    }

    return color;
}

fn trace(ray: Ray) -> RenderState {

    var renderState: RenderState; // the render state is the information about the ray's hit

    renderState.hit = false; // start out with no hit
    var nearestHit: f32 = 9999; // start out with a really far away hit 
    

    // BVH
    var node: Node = tree.nodes[0]; // head of the tree
    var stack: array<Node, 15>;
    var stackLocation = 0;


    while true {
        // get the data from the node
        var sphereCount = u32(node.sphereCount);
        var contents = u32(node.leftChild); 
        
        // internal node, not actual objects
        if sphereCount == 0 {
            var leftChild: Node = tree.nodes[contents];
            var rightChild: Node = tree.nodes[contents + 1];

            // get the distance to the children
            var distanceLeft: f32 = distance(ray, leftChild);
            var distanceRight: f32 = distance(ray, rightChild);

            // if the right child is closer, go there first
            if distanceLeft > distanceRight {
                var temp = distanceLeft;
                distanceLeft = distanceRight;
                distanceRight = temp;

                var tempChild = leftChild;
                leftChild = rightChild;
                rightChild = tempChild;
            }

            // if the next node farther than the object we hit, we're done 
            if distanceLeft > nearestHit {
                // no more nodes to check
                if stackLocation == 0 {
                    break;
                } else {
                    // go back up the tree
                    stackLocation -= 1;
                    node = stack[stackLocation];
                    continue;
                }
            } else {
                // 
                node = leftChild;
                if distanceRight < nearestHit {
                    stack[stackLocation] = rightChild;
                    stackLocation += 1;
                }
            }
        } else {
             // leaf node, actual objects

             // check each object in the node
            for (var i: u32 = 0; i < sphereCount; i++) {
                var newRenderState: RenderState = hit_sphere(ray, objects.spheres[u32(sphereLookup.sphereIndicies[i + contents])], 0.001, nearestHit, renderState);
                if newRenderState.hit {
                    nearestHit = newRenderState.t;
                    renderState = newRenderState;
                }
            }

            if stackLocation == 0 {
                break;
            } else {
                stackLocation -= 1;
                node = stack[stackLocation];
                continue;
            }
        }
    }

    if !renderState.hit {
        renderState.color = textureSampleLevel(skyMaterial, skySampler, ray.direction, 0.0).xyz;
    }
    return renderState;
}

// reflect the ray
fn hit_sphere(ray: Ray, sphere: Sphere, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {
    // gotten from here: https://stackoverflow.com/questions/63922206/glsl-sphere-ray-intersection-geometric-solution
    let oc = ray.origin - sphere.center;
    let a = dot(ray.direction, ray.direction);
    let b = 2.0 * dot(oc, ray.direction);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    let discriminant = b * b - 4.0 * a * c;


    var renderState: RenderState;
    renderState.color = oldRenderState.color;


    if discriminant > 0.0 {

        let t: f32 = (-b - sqrt(discriminant)) / (2.0 * a);

        // if the hit is within the bounds
        if t < tMax && t > tMin {

            renderState.position = ray.origin + t * ray.direction; // change the render state to reflect the hit
            renderState.normal = normalize(renderState.position - sphere.center); // the normal is the vector from the center to the hit
            renderState.t = t; // the distance is the distance to the hit
            renderState.color = sphere.color; // the color is the color of the sphere
            renderState.hit = true; // we hit something
            return renderState;
        }
    }

    renderState.hit = false; // we didn't hit anything
    return renderState;
}

// get the distance to the node
fn distance(ray: Ray, node: Node) -> f32 {

    var inverseDirection: vec3<f32> = vec3(1.0) / ray.direction;
    var t1: vec3<f32> = (node.minCorner - ray.origin) / inverseDirection;
    var t2: vec3<f32> = (node.maxCorner - ray.origin) / inverseDirection;
    var tMin: vec3<f32> = min(t1, t2);
    var tMax: vec3<f32> = max(t1, t2);

    var tNear: f32 = max(max(tMin.x, tMin.y), tMin.z);
    var tFar: f32 = min(min(tMax.x, tMax.y), tMax.z);

    // if the near is farther than the far, or the far is negative, we didn't hit anything
    if tNear > tFar || tFar < 0.0 {
        return 999;
    } else {
        return tNear;
    }
}
