#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#include "lib/Compatibility.wgsl"

#define SHADER_TYPE_MESH_VISUALIZER

#define USE_MATERIAL_ID
#define USE_BARYCENTRIC

#include "lib/Materials.wgsl"

struct Material {
    color: vec4<f8>,
    wireframeColor: vec4<f8>,
}

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

@fragment
fn main(
    #include "lib/Inputs.wgsl"
) -> @location(0) vec4<f32> {
    let mat: Material = decodeMaterial(fragMaterialId);

    let d: vec3<f8> = fwidth(fragBarycentric);
    let factor: vec3<f8> = smoothstep(vec3<f8>(0.0), d*1.5, fragBarycentric);
    let nearest: f8 = min(min(factor.x, factor.y), factor.z);

    return mix(mat.wireframeColor, mat.color, nearest);
}
