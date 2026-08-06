#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#include "lib/Compatibility.wgsl"

#define USE_MATERIAL_ID

#define FEATURE_TEXTURED
#define FEATURE_GRADIENT
#define FEATURE_GRADIENT_4_STOPS
#define FEATURE_TONEMAPPING

#ifdef GRADIENT_4_STOPS
#define GRADIENT
#endif

#ifndef PINK
#define PINK vec4<f32>(1.0, 0.0, 1.0, 1.0)
#endif

#define USE_MATERIAL_INDEX
#include "lib/Uniforms.wgsl"

#if defined(TEXTURED) || defined(GRADIENT)

/**
 * Material definition
 *
 * Contains texture and gradient data.
 */
struct Material {
#ifdef GRADIENT
#ifdef GRADIENT_4_STOPS
    colorStop3: vec4<f16>,
    colorStop2: vec4<f16>,
#endif
    colorStop1: vec4<f16>,
    colorStop0: vec4<f16>,
#endif
#ifdef TEXTURED
    texture: u32,
#endif
};

#include "lib/Materials.wgsl"

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

#include "lib/Color.wgsl"

#ifdef GRADIENT
fn shadeGradient(mat: Material, value: f32) -> vec4<f16> {
    #ifdef GRADIENT_4_STOPS
    return gradient4(mat.colorStop0, mat.colorStop1, mat.colorStop2, mat.colorStop3, value);
    #else
    return mix(mat.colorStop0, mat.colorStop1, value);
    #endif
}
#endif

#ifdef TEXTURED
#include "lib/Textures.wgsl"

fn shadeTexture(mat: Material, inputUv: vec2<f32>) -> vec4<f32> {
    if(mat.texture == 0u) {
        return PINK;
    }

    let b: Bounds = unpackBounds(mat.texture);

    /* @todo: This could be done in the vertex shader, or even
     * better, could be global uniforms... */
    let vRatio: f32 = f32(viewport.z)/f32(viewport.w);
    let tRatio: f32 = f32(b.bounds.z)/f32(b.bounds.w);

    var uv: vec2<f32> = inputUv;
    if(vRatio > tRatio) {
        /* Center the image vertically in the viewport and scale */
        uv.y = 0.5 + (inputUv.y - 0.5) * (tRatio/vRatio);
    } else {
        /* Center the image horizontally in the viewport and scale */
        uv.x = 0.5 + (inputUv.x - 0.5) * (vRatio/tRatio);
    }
    return textureAtlasLayer(uv, b.bounds, b.layer);
}
#endif

#endif

@fragment
fn main(
    @location(0) uv: vec2<f32>
) -> @location(0) vec4<f32> {

    #if defined(TEXTURED) || defined(GRADIENT)

    let mat: Material = decodeMaterial(drawUniforms.materialIndex);

    var outColor = vec4<f32>(1.0);

    #ifdef TEXTURED
    outColor *= shadeTexture(mat, uv);
    #endif
    #ifdef GRADIENT
    outColor *= shadeGradient(mat, uv.y);
    #endif

    #else

    /* Use error color if the shader isn't set for textures
     * nor for gradients */
    outColor = PINK;

    #endif

    #ifdef TONEMAPPING
    var linear: vec3<f32> = srgbToLinear3(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor = vec4<f32>(linearToSrgb3(tonemap(linear)), outColor.a);
    #endif

    return outColor;
}
