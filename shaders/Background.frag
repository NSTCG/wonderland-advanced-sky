precision highp float;

#define USE_MATERIAL_ID
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

in highp vec2 textureCoordinates;

out lowp vec4 outColor;

#if defined(TEXTURED) || defined(GRADIENT)

/**
 * Material definition
 *
 * Contains texture and gradient data.
 */
struct Material {
#ifdef GRADIENT
#ifdef GRADIENT_4_STOPS
    lowp vec4 colorStop3;
    lowp vec4 colorStop2;
#endif
    lowp vec4 colorStop1;
    lowp vec4 colorStop0;
#endif
#ifdef TEXTURED
    mediump uint texture;
#endif
};

#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

#include "lib/Color.glsl"

#ifdef GRADIENT
mediump vec4 shadeGradient(const Material mat, highp float value) {
    #ifdef GRADIENT_4_STOPS
    return gradient4(mat.colorStop0, mat.colorStop1, mat.colorStop2, mat.colorStop3, value);
    #else
    return mix(mat.colorStop0, mat.colorStop1, value);
    #endif
}
#endif

#ifdef TEXTURED
#include "lib/Textures.glsl"

vec4 shadeTexture(const Material mat) {
    if(mat.texture == 0u) return PINK;

    mediump uvec4 bounds;
    mediump uint layer = unpackBounds(mat.texture, bounds);

    /* @todo: This could be done in the vertex shader, or even
     * better, could be global uniforms... */
    float vRatio = float(viewport.z)/float(viewport.w);
    float tRatio = float(bounds.z)/float(bounds.w);

    vec2 uv = textureCoordinates;
    if(vRatio > tRatio) {
        /* Center the image vertically in the viewport and scale */
        uv.y = 0.5 + (textureCoordinates.y - 0.5) * (tRatio/vRatio);
    } else {
        /* Center the image horizontally in the viewport and scale */
        uv.x = 0.5 + (textureCoordinates.x - 0.5) * (vRatio/tRatio);
    }
    return textureAtlasLayer(uv, bounds, layer);
}
#endif

#endif

void main() {
    #if defined(TEXTURED) || defined(GRADIENT)

    Material mat = decodeMaterial(material);

    outColor = vec4(1.0);

    #ifdef TEXTURED
    outColor *= shadeTexture(mat);
    #endif
    #ifdef GRADIENT
    outColor *= shadeGradient(mat, textureCoordinates.y);
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
