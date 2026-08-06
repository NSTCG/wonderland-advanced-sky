#include "lib/Compatibility.wgsl"
#define SHADER_TYPE_TEXT

#define FEATURE_TONEMAPPING

#define USE_MATERIAL_ID

#include "lib/Packing.wgsl"
#include "lib/Materials.wgsl"
#include "lib/Uniforms.wgsl"
#include "lib/Color.wgsl"
#include "lib/Slug.frag.wgsl"

struct Material {
    color: vec4<f8>,
    effectColor: vec4<f8>,
    font: u8,
};

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

@group(0) @binding(19) var curveTexture: texture_2d_array<f32>;
@group(0) @binding(20) var bandTexture: texture_2d_array<u32>;

@fragment
fn main(
    @location(0) fragTextureCoords: vec2<f32>,
    @location(1) fragColor: vec4<f16>,
    @location(2) @interpolate(flat) fragBanding: vec4<f32>,
    @location(3) @interpolate(flat) fragGlyph: vec4<i32>,
    @location(4) @interpolate(flat) fragMaterialId: u16,
) -> @location(0) vec4<f32> {
    let mat: Material = decodeMaterial(fragMaterialId);
    /* Text components without a font don't get rendered, but best to be safe */
    let layer: i32 = max(i32(mat.font) - 1, 0);
    /* fragColor is linear, mat.color is sRGB. This is OK since we build the
     * Slug mesh with only white color, which ends up the same with both. */
    let color: vec4<f32> = mix(mat.effectColor, mat.color, fragColor.a) * vec4<f32>(fragColor.rgb, 1.0);
    var outColor = SlugRender(curveTexture, bandTexture, fragTextureCoords,
        color, fragBanding, fragGlyph, layer);

    #ifdef TONEMAPPING
    var linear: vec3<f32> = srgbToLinear3(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor = vec4<f32>(linearToSrgb3(tonemap(linear)), outColor.a);
    #endif

    return outColor;
}
