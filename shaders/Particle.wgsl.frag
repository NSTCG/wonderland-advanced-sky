#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#include "lib/Compatibility.wgsl"

#define USE_TEXTURE_COORDS
#define USE_MATERIAL_ID

#define TEXTURED
#include "lib/Textures.wgsl"
#include "lib/Materials.wgsl"

struct Material {
    color: vec4<f8>,
    mainTexture: u16,
    noiseTexture: u16,
    /* TODO: How about supporting vec2? */
    offsetX: f32,
    offsetY: f32,
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

    let col: vec4<f8> = textureAtlas(mat.mainTexture, fract(fragTextureCoords));
    let colA: vec4<f8> = textureAtlas(mat.noiseTexture, fract(0.5*(fragTextureCoords + vec2<f32>(mat.offsetX, mat.offsetY))));
    let colB: vec4<f8> = textureAtlas(mat.noiseTexture, fract(fragTextureCoords + 1.2*vec2<f32>(mat.offsetX, mat.offsetY)));
    var outColor: vec4<f32> = mat.color;
    outColor.a *= 2.0*col.r*colA.r*colB.r;
    return outColor;
}
