#include "lib/Compatibility.glsl"

#define FEATURE_TEXTURED
#define FEATURE_ALPHA_MASKED
#define FEATURE_VERTEX_COLORS
#define FEATURE_TONEMAPPING

#ifdef TEXTURED
#define USE_TEXTURE_COORDS
#endif
#ifdef VERTEX_COLORS
#define USE_COLOR
#endif

#define USE_MATERIAL_ID
#include "lib/Uniforms.glsl"
#include "lib/Inputs.glsl"
#include "lib/Color.glsl"

#ifdef TEXTURED
#include "lib/Textures.glsl"
#endif
#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

struct Material {
    lowp vec4 color;
#ifdef TEXTURED
    mediump uint flatTexture;
#endif
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

void main() {
#ifdef TEXTURED
    alphaMask(fragMaterialId, fragTextureCoords);
#endif

    Material mat = decodeMaterial(fragMaterialId);
    outColor =
        #ifdef VERTEX_COLORS
        fragColor*
        #endif
        #ifdef TEXTURED
        textureAtlas(mat.flatTexture, fragTextureCoords)*
        #endif
        mat.color;

    #ifdef TONEMAPPING
    vec3 linear = srgbToLinear(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor.rgb = linearToSrgb(tonemap(linear));
    #endif
}
