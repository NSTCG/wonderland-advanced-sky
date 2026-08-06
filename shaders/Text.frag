#include "lib/Compatibility.glsl"
#define SHADER_TYPE_TEXT

#define FEATURE_TONEMAPPING

precision highp sampler2DArray;
precision highp usampler2DArray;

#define USE_MATERIAL_ID

#include "lib/Inputs.glsl"
#include "lib/Packing.glsl"
#include "lib/Materials.glsl"
#include "lib/Uniforms.glsl"
#include "lib/Color.glsl"
#include "lib/Slug.frag.glsl"

struct Material {
    lowp vec4 color;
    lowp vec4 effectColor;
    lowp uint font;
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

in mediump vec4 fragColor;
in vec2 fragTextureCoords;
flat in vec4 fragBanding;
flat in ivec4 fragGlyph;

uniform sampler2DArray curveTexture;
uniform usampler2DArray bandTexture;

void main() {
    Material mat = decodeMaterial(fragMaterialId);
    /* Text components without a font don't get rendered, but best to be safe */
    int layer = max(int(mat.font) - 1, 0);
    /* fragColor is linear, mat.color is sRGB. This is OK since we build the
     * Slug mesh with only white color, which ends up the same with both. */
    vec4 color = mix(mat.effectColor, mat.color, fragColor.a)*vec4(fragColor.rgb, 1.0);
    outColor = SlugRender(curveTexture, bandTexture, fragTextureCoords,
        color, fragBanding, fragGlyph, layer);

    #ifdef TONEMAPPING
    vec3 linear = srgbToLinear(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor.rgb = linearToSrgb(tonemap(linear));
    #endif
}
