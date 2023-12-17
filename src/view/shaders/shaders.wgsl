struct TransformData {
    
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

struct ObjectData {
    model: array<mat4x4<f32>>,
}


// Set to binding point 0, usually reserved for uniform buffers, from passing from CPU to GPU
// group 0 means that it's in the first group
// var<uniform> means that it's a uniform variable, so it's read only and remains constant and is a global variable
// The TransformData is an interface that tells us how the data is laid out
// UBO means uniform buffer object, so it's a buffer that's used for uniforms
@binding(0) @group(0) var<uniform> transformUBO: TransformData;
@binding(1) @group(0) var<storage, read> objects: ObjectData;



@binding(0) @group(1) var myTexture: texture_2d<f32>; 
@binding(1) @group(1) var mySampler: sampler; 


// Like an interface but for shaders
struct Fragment {
    @builtin(position) Position: vec4<f32>,
    @location(0) TexCoord: vec2<f32>,
}


// @location(0) means that the variable is bound to location 0,
// @location(1) means that the variable is bound to location 1
@vertex
// These @location stuff comes from the buffer layout attributes, so each object in that layout has a location
fn vs_main(
    @builtin(instance_index) id: u32,
    @location(0) vertexPosition: vec3<f32>, @location(1) vertexTexCoord: vec2<f32>
) -> Fragment {


    var output: Fragment;
    // Matrix multiplcation works from right to left
    // First we take out coordiantes and multiply them by the model matrix, which takes it from object coordinates into world coordinates
    // Then we multiply it by the view matrix, which takes it from world coordinates into camera coordinates, so it's relative to the camera
    // Then we multiply it by the projection matrix, which takes it from camera coordinates into clip coordinates, which is the coordinates that are used to determine what's on the screen. Stuff that is closer is bigger, stuff that is 
    output.Position = transformUBO.projection * transformUBO.view * objects.model[id] * vec4<f32>(vertexPosition, 1.0);
    output.TexCoord = vertexTexCoord;

    return output;
}

@fragment
fn fs_main(@location(0) TexCoord: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(myTexture, mySampler, TexCoord);
}
