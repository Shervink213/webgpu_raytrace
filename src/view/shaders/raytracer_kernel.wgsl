
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
    t: f32,
    color: vec3<f32>,
    hit: bool,
    position: vec3<f32>,
    normal: vec3<f32>,
}


@group(0) @binding(0) var color_buffer: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> scene: SceneData;
@group(0) @binding(2) var<storage, read> objects: ObjectData;
@group(0) @binding(3) var<storage, read> tree: BVH;
@group(0) @binding(4) var<storage, read> sphereLookup: ObjectIndicies;

@compute @workgroup_size(1,1,1)
fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {

    let screen_size: vec2<u32> = (textureDimensions(color_buffer));
    let screen_pos = vec2<i32>(i32(GlobalInvocationID.x), i32(GlobalInvocationID.y));

    let horizontal_coefficient: f32 = (f32(screen_pos.x) - f32(screen_size.x) / 2) / f32(screen_size.x);
    let vertical_coefficient: f32 = (f32(screen_pos.y) - f32(screen_size.y) / 2) / f32(screen_size.x);

    let forwards: vec3<f32> = scene.cameraForwards;
    let right: vec3<f32> = scene.cameraRight;
    let up: vec3<f32> = scene.cameraUp;


    var myRay: Ray;
    myRay.origin = scene.cameraPos;
    myRay.direction = normalize(forwards + horizontal_coefficient * right + vertical_coefficient * up);

    // var pixel_color: vec3<f32> = scene.cameraPos;
    var pixel_color: vec3<f32> = rayColor(myRay);



    textureStore(color_buffer, screen_pos, vec4<f32>(pixel_color, 1.0));
}

fn rayColor(ray: Ray) -> vec3<f32> {
    var color: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0);
    var result: RenderState;
    var temp_ray: Ray;
    temp_ray.origin = ray.origin;
    temp_ray.direction = ray.direction;

    let bounces: u32 = u32(scene.maxBounces);
    for (var bounce: u32 = 0; bounce < bounces; bounce++) {
        result = trace(temp_ray);

        color = color * result.color;

        if !result.hit {
            break;
        }

        temp_ray.origin = result.position;
        temp_ray.direction = normalize(reflect(temp_ray.direction, result.normal));
    }

    if result.hit {
        color = vec3<f32>(0.0, 0.0, 0.0);
    }

    return color;
}

fn trace(ray: Ray) -> RenderState {

    var renderState: RenderState;
    // sky color
    renderState.color = vec3<f32>(1.0, 1.0, 1.0);
    renderState.hit = false;
    var nearestHit: f32 = 9999;
    

    // BVH
    var node: Node = tree.nodes[0];
    var stack: array<Node, 15>;
    var stackLocation = 0;

    while true {
        var sphereCount = u32(node.sphereCount);
        var contents = u32(node.leftChild);
        
        // internal node, not actual objects
        if sphereCount == 0 {
            var leftChild: Node = tree.nodes[contents];
            var rightChild: Node = tree.nodes[contents + 1];

            var distanceLeft: f32 = distance(ray, leftChild);
            var distanceRight: f32 = distance(ray, rightChild);

            if distanceLeft > distanceRight {
                var temp = distanceLeft;
                distanceLeft = distanceRight;
                distanceRight = temp;

                var tempChild = leftChild;
                leftChild = rightChild;
                rightChild = tempChild;
            }

            if distanceLeft > nearestHit {
                if stackLocation == 0 {
                    break;
                } else {
                    stackLocation -= 1;
                    node = stack[stackLocation];
                    continue;
                }
            } else {
                node = leftChild;
                if distanceRight < nearestHit {
                    stack[stackLocation] = rightChild;
                    stackLocation += 1;
                }
            }
        } else {

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


    return renderState;
}

fn hit_sphere(ray: Ray, sphere: Sphere, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {
    let oc = ray.origin - sphere.center;
    let a = dot(ray.direction, ray.direction);
    let b = 2.0 * dot(oc, ray.direction);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    let discriminant = b * b - 4.0 * a * c;

    var renderState: RenderState;
    renderState.color = oldRenderState.color;

    if discriminant > 0.0 {
        let t: f32 = (-b - sqrt(discriminant)) / (2.0 * a);

        if t < tMax && t > tMin {
            renderState.position = ray.origin + t * ray.direction;
            renderState.normal = normalize(renderState.position - sphere.center);
            renderState.t = t;
            renderState.color = sphere.color;
            renderState.hit = true;
            return renderState;
        }
    }

    renderState.hit = false;
    return renderState;
}

fn distance(ray: Ray, node: Node) -> f32 {
    var inverseDirection: vec3<f32> = vec3(1.0) / ray.direction;
    var t1: vec3<f32> = (node.minCorner - ray.origin) / inverseDirection;
    var t2: vec3<f32> = (node.maxCorner - ray.origin) / inverseDirection;
    var tMin: vec3<f32> = min(t1, t2);
    var tMax: vec3<f32> = max(t1, t2);

    var tNear: f32 = max(max(tMin.x, tMin.y), tMin.z);
    var tFar: f32 = min(min(tMax.x, tMax.y), tMax.z);

    if tNear > tFar || tFar < 0.0 {
        return 999;
    } else {
        return tNear;
    }
}
