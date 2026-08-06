#include "lib/Compatibility.glsl"

#define USE_TEXTURE_COORDS
#define USE_MATERIAL_ID
#include "lib/Inputs.glsl"

#define TEXTURED
#include "lib/Textures.glsl"

#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

struct Material {
    lowp vec4 color;
    mediump uint mainTexture;
    mediump uint noiseTexture;
    /* TODO: How about supporting vec2? */
    lowp float offsetX;
    lowp float offsetY;
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

void main() {
    Material mat = decodeMaterial(fragMaterialId);

    vec4 col = textureAtlas(mat.mainTexture, fract(fragTextureCoords));
    vec4 colA = textureAtlas(mat.noiseTexture, fract(0.5*(fragTextureCoords + vec2(mat.offsetX, mat.offsetY))));
    vec4 colB = textureAtlas(mat.noiseTexture, fract(fragTextureCoords + 1.2*vec2(mat.offsetX, mat.offsetY)));
    outColor = mat.color;
    outColor.a *= 2.0*col.r*colA.r*colB.r;
}
