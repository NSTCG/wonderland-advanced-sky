#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#define USE_MATERIAL_ID

#define FEATURE_ENVIRONMENT_PROBE
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
#include "lib/Compatibility.wgsl"
#include "lib/Uniforms.wgsl"

#define USE_NDC_COORDINATES

#ifdef ENVIRONMENT_PROBE
#define GLOBAL_ILLUMINATION
@group(0) @binding(17) var specularProbeAtlas: texture_2d_array<f16>;
@group(0) @binding(18) var reflectionProbeSampler: sampler;
#endif

#if defined(TEXTURED) || defined(GRADIENT) || defined(ENVIRONMENT_PROBE)
#define NEED_MATERIAL
#endif

#if defined(TEXTURED) || defined(ENVIRONMENT_PROBE)
#define NEED_UV
#endif

#ifdef NEED_MATERIAL
/**
 * Material definition
 *
 * Contains texture and gradient data.
 */
struct Material {
    #ifdef GRADIENT_4_STOPS
    colorStop3: vec4<f16>,
    colorStop2: vec4<f16>,
    #endif
    #ifdef GRADIENT
    colorStop1: vec4<f16>,
    colorStop0: vec4<f16>,
    #endif
    #ifdef TEXTURED
    texture: u16,
    #endif
    #ifdef ENVIRONMENT_PROBE
    mip: u8,
    #endif
    #ifdef NEED_UV
    rotationY: f8,
    #endif
};

#include "lib/Materials.wgsl"

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

#include "lib/Quaternion.wgsl"
#include "lib/Math.wgsl"
#include "lib/CoordinateSystems.wgsl"
#include "lib/Color.wgsl"

#ifdef TEXTURED
#include "lib/Textures.wgsl"
#endif

#ifdef GRADIENT
fn shadeGradient(mat: Material, value: f32) -> vec4<f32> {
    #ifdef GRADIENT_4_STOPS
    return gradient4(mat.colorStop0, mat.colorStop1, mat.colorStop2, mat.colorStop3, value);
    #else
    return mix(mat.colorStop0, mat.colorStop1, value);
    #endif
}
#endif

#endif

@fragment
fn main(
    @location(0) ndcCoordinates: vec2<f32>
) -> @location(0) vec4<f32> {

    #ifdef NEED_MATERIAL
    let mat: Material = decodeMaterial(drawUniforms.materialIndex);

    let unprojPoint: vec3<f32> = (inverseProjectionMatrix*vec4(ndcCoordinates, 0.0, 1.0)).xyz;
    let direction: vec3<f32> = normalize(quat_transformVector(viewToWorld[0], unprojPoint));
    #if defined(TEXTURED) || defined(ENVIRONMENT_PROBE)
    var uv: vec2<f32> = cartesianToEquirectangular(direction);
    uv.x = fract(uv.x + mat.rotationY);
    #endif

    var outColor = vec4<f32>(1.0);

    #ifdef TEXTURED
    var textureColor: vec4<f32> = PINK;
    if(mat.texture != 0) {
        textureColor = textureAtlasEquirectangular(mat.texture, uv);
    }
    outColor *= textureColor;
    #endif

    #ifdef ENVIRONMENT_PROBE
    /* Environment is always encoded as linear */
    let env: vec3<f32> = textureSampleLevel(specularProbeAtlas, reflectionProbeSampler, uv, 0u, f32(mat.mip)).rgb;
    outColor *= linearToSrgb4(vec4<f32>(env, 1.0));
    #endif

    #ifdef GRADIENT
    /* Remap direction to [0, 1] and sample gradient */
    outColor *= shadeGradient(mat, direction.y * 0.5 + 0.5);
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
