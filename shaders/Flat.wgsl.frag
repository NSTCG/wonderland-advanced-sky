#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#include "lib/Compatibility.wgsl"

#define FEATURE_TEXTURED
#define FEATURE_ALPHA
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
#include "lib/Uniforms.wgsl"
#include "lib/Color.wgsl"

#ifdef TEXTURED
#include "lib/Textures.wgsl"
#endif
#include "lib/Materials.wgsl"

struct Material {
    color: vec4<f8>,
#ifdef TEXTURED
    flatTexture: u16,
#endif
}

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

@fragment
fn main(
    #include "lib/Inputs.wgsl"
) -> @location(0) vec4<f32> {
    #ifdef TEXTURED
    alphaMask(fragMaterialId, fragTextureCoords);
    #endif

    let mat: Material = decodeMaterial(fragMaterialId);
    var outColor: vec4<f32> =
        #ifdef VERTEX_COLORS
        fragColor*
        #endif
        #ifdef TEXTURED
        textureAtlas(mat.flatTexture, fragTextureCoords)*
        #endif
        mat.color;

    #ifdef TONEMAPPING
    var linear: vec3<f32> = srgbToLinear3(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor = vec4<f32>(linearToSrgb3(tonemap(linear)), outColor.a);
    #endif

    return outColor;
}
