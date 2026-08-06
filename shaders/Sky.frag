precision highp float;

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
#define PINK vec4(1.0, 0.0, 1.0, 1.0)
#endif

#define USE_MATERIAL_INDEX
#include "lib/Uniforms.glsl"

#define USE_NDC_COORDINATES
in highp vec2 ndcCoordinates;

out lowp vec4 outColor;

#ifdef ENVIRONMENT_PROBE
#define GLOBAL_ILLUMINATION
uniform mediump sampler2DArray specularProbeAtlas;
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
    lowp vec4 colorStop3;
    lowp vec4 colorStop2;
    #endif
    #ifdef GRADIENT
    lowp vec4 colorStop1;
    lowp vec4 colorStop0;
    #endif
    #ifdef TEXTURED
    mediump uint texture;
    #endif
    #ifdef ENVIRONMENT_PROBE
    lowp uint mip;
    #endif
    #ifdef NEED_UV
    lowp float rotationY;
    #endif
};

#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

#include "lib/Quaternion.glsl"
#include "lib/Math.glsl"
#include "lib/CoordinateSystems.glsl"
#include "lib/Color.glsl"

#ifdef TEXTURED
#include "lib/Textures.glsl"
#endif

#ifdef GRADIENT
vec4 shadeGradient(const Material mat, float value) {
    #ifdef GRADIENT_4_STOPS
    return gradient4(mat.colorStop0, mat.colorStop1, mat.colorStop2, mat.colorStop3, value);
    #else
    return mix(mat.colorStop0, mat.colorStop1, value);
    #endif
}
#endif

#endif

void main() {
    #ifdef NEED_MATERIAL
    Material mat = decodeMaterial(material);

    vec3 unprojPoint = (inverseProjectionMatrix*vec4(ndcCoordinates, 0.0, 1.0)).xyz;
    vec3 direction = normalize(quat_transformVector(viewToWorld[0], unprojPoint));
    #if defined(TEXTURED) || defined(ENVIRONMENT_PROBE)
    highp vec2 uv = cartesianToEquirectangular(direction);
    uv.x = fract(uv.x + mat.rotationY);
    #endif

    outColor = vec4(1.0);

    #ifdef TEXTURED
    vec4 textureColor = PINK;
    if(mat.texture != 0u) {
        textureColor = textureAtlasEquirectangular(mat.texture, uv);
    }
    outColor *= textureColor;
    #endif

    #ifdef ENVIRONMENT_PROBE
    /* Environment is always encoded as linear */
    vec3 env = textureLod(specularProbeAtlas, vec3(uv, 0.0), float(mat.mip)).rgb;
    outColor.rgb *= linearToSrgb(env);
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
    vec3 linear = srgbToLinear(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor.rgb = linearToSrgb(tonemap(linear));
    #endif
}
