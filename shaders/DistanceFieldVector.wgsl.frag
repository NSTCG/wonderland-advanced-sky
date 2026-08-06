#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#include "lib/Compatibility.wgsl"

#define USE_TEXTURE_COORDS
#define USE_MATERIAL_ID

#define TEXTURED
#include "lib/Textures.wgsl"
#include "lib/Packing.wgsl"
#include "lib/Materials.wgsl"

struct Material {
    color: vec4<f8>,
    outlineColor: vec4<f8>,
    outlineRange: vec2<f8>,
    vectorTexture: u16,
    smoothness: f8,
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
    let intensity: f32 = textureAtlas(mat.vectorTexture, fragTextureCoords).r;

    var outColor: vec4<f32> = smoothstep(
        mat.outlineRange.x-mat.smoothness,
        mat.outlineRange.x+mat.smoothness,
        intensity)*mat.color;

    if(mat.outlineRange.x > mat.outlineRange.y) {
        let mid: f8 = (mat.outlineRange.x + mat.outlineRange.y)*0.5;
        let halfRange: f8 = (mat.outlineRange.x - mat.outlineRange.y)*0.5;
        outColor += smoothstep(halfRange+mat.smoothness, halfRange-mat.smoothness, distance(mid, intensity))*mat.outlineColor;
    }

    return outColor;
}
