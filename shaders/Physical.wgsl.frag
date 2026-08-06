#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#include "lib/Compatibility.wgsl"

#define USE_LIGHTS

#define FEATURE_TEXTURED
#define FEATURE_ALPHA_MASKED
#define FEATURE_VERTEX_COLORS
#define FEATURE_NORMAL_MAPPING
#define FEATURE_WITH_EMISSIVE
#define FEATURE_LIGHTMAP
#define FEATURE_LIGHTMAP_MULTIPLY_ALBEDO
#define FEATURE_OCCLUSION_TEXTURE
#define FEATURE_SEPARATE_OCCLUSION_TEXTURE
#define FEATURE_GLOBAL_ILLUMINATION
#define FEATURE_GLOBAL_ILLUMINATION_PROBE_VOLUME
#define FEATURE_CLEARCOAT
#define FEATURE_TONEMAPPING
#define FEATURE_SHADOW_PCF
#define FEATURE_SHADOW_NORMAL_OFFSET_SCALE_BY_SHADOW_DEPTH
#define FEATURE_SHADOW_NORMAL_OFFSET_UV_ONLY
#define FEATURE_SHADOW_NORMAL_OFFSET_SLOPE_SCALE
#define FEATURE_WITH_FOG

#ifdef NORMAL_MAPPING
#define TEXTURED
#endif
#ifdef LIGHTMAP
#define TEXTURED
#endif
#ifdef OCCLUSION_TEXTURE
#define TEXTURED
#endif
#ifdef GLOBAL_ILLUMINATION
#define TEXTURED
#endif

#define USE_POSITION_WORLD
#define USE_NORMAL
#define USE_MATERIAL_ID
#ifdef TEXTURED
#define USE_TEXTURE_COORDS
#endif
#ifdef NORMAL_MAPPING
#define USE_TANGENT
#endif
#ifdef LIGHTMAP
#define USE_TEXTURE_COORDS_1
#endif
#ifdef VERTEX_COLORS
#define USE_COLOR
#endif

#if NUM_SHADOWS > 0
#define USE_POSITION_VIEW
#endif

#include "lib/Uniforms.wgsl"
#include "lib/Math.wgsl"
#include "lib/Color.wgsl"

#if NUM_LIGHTS > 0 || defined(WITH_FOG)
#include "lib/Quaternion.wgsl"
#include "lib/Lights.wgsl"
#endif

#ifdef TEXTURED
#include "lib/Textures.wgsl"
#endif
#include "lib/Surface.wgsl"
#include "lib/Materials.wgsl"
#include "lib/PhysicalBSDF.wgsl"

#if defined(GLOBAL_ILLUMINATION) || defined(GLOBAL_ILLUMINATION_PROBE_VOLUME)
#include "lib/CoordinateSystems.wgsl"
#include "lib/GI.wgsl"
#endif

struct Material {
    albedoColor: vec4<f16>,
#ifdef WITH_EMISSIVE
    emissiveColor: vec4<f16>,
#endif
#ifdef WITH_FOG
    fogColor: vec4<f16>,
#endif
    metallicFactor: f16,
    roughnessFactor: f16,
#ifdef TEXTURED
    albedoTexture: u16,
#ifndef SEPARATE_OCCLUSION_TEXTURE
    occlusionRoughnessMetallicTexture: u16,
#else
    roughnessMetallicTexture: u16,
#endif
#ifdef WITH_EMISSIVE
    emissiveTexture: u16,
#endif
#ifdef NORMAL_MAPPING
    normalTexture: u16,
#endif
#ifdef LIGHTMAP
    lightmapTexture: u16,
    lightmapFactor: f16,
#endif
#ifdef OCCLUSION_TEXTURE
#ifdef SEPARATE_OCCLUSION_TEXTURE
    occlusionTexture: u16,
#endif
    occlusionFactor: f16,
#endif
#endif
#ifdef CLEARCOAT
    clearCoatRoughness: f16,
    clearCoatFactor: f16,
#endif
};

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

@fragment
fn main(
    #ifdef WITH_FOG
    @builtin(position) Position: vec4<f32>,
    #endif
    #include "lib/Inputs.wgsl"
) -> @location(0) vec4<f32> {

    #ifdef TEXTURED
    alphaMask(fragMaterialId, fragTextureCoords);
    #endif

    let mat: Material = decodeMaterial(fragMaterialId);

    var albedo: vec4<f16> =
        #ifdef VERTEX_COLORS
        fragColor*
        #endif
        mat.albedoColor;

    #ifdef TEXTURED
    if(mat.albedoTexture > 0u) {
        albedo *= textureAtlas(mat.albedoTexture, fragTextureCoords);
    }
    #endif
    albedo = srgbToLinear4(albedo);

    var ao: f16 = 1.0;
    var roughness: f32 = mat.roughnessFactor;
    var metallic: f32 = mat.metallicFactor;
    #ifdef TEXTURED
    #ifndef SEPARATE_OCCLUSION_TEXTURE
    if(mat.occlusionRoughnessMetallicTexture > 0u) {
        let orm: vec3<f16> = textureAtlas(mat.occlusionRoughnessMetallicTexture, fragTextureCoords).rgb;
        #ifdef OCCLUSION_TEXTURE
        ao = mix(1.0, orm.r, mat.occlusionFactor);
        #endif
        roughness *= orm.g;
        metallic *= orm.b;
    }
    #else
    if(mat.roughnessMetallicTexture > 0u) {
        let rm: vec3<f16> = textureAtlas(mat.roughnessMetallicTexture, fragTextureCoords).rgb;
        roughness *= rm.g;
        metallic *= rm.b;
    }
    #ifdef OCCLUSION_TEXTURE
    if(mat.occlusionTexture > 0u) {
        let occlusion: f32 = textureAtlas(mat.occlusionTexture, fragTextureCoords).r;
        ao = mix(1.0, occlusion, mat.occlusionFactor);
    }
    #endif
    #endif
    #endif

    /* Normal */
    #ifdef NORMAL_MAPPING
    let surface: SurfaceData = computeSurfaceData(fragNormal, fragTangent);
    let normal: vec3<f32> = normalMapping(surface, mat.normalTexture, fragTextureCoords);
    #else
    let surface: SurfaceData = computeSurfaceDataNormal(fragNormal);
    let normal: vec3<f32> = surface.normal;
    #endif

    #ifdef CLEARCOAT
    let clearCoat: ClearCoatData = createClearCoatData(surface.normal, mat.clearCoatFactor, mat.clearCoatRoughness);
    let bsdf: PhysicalBSDF = createPhysicalBSDF(albedo.rgb, metallic, roughness, mat.clearCoatFactor);
    #else
    let bsdf: PhysicalBSDF = createPhysicalBSDF(albedo.rgb, metallic, roughness, 0.0);
    #endif

    let view: vec3<f32> = normalize(viewPositionWorld.xyz - fragPositionWorld);

    var col: vec3<f32> = vec3<f32>(0.0);

    #ifdef TEXTURED
    #ifdef LIGHTMAP
    let lightmap: vec4<f16> =
        textureAtlas(mat.lightmapTexture, fragTextureCoords1)*mat.lightmapFactor;
    #ifndef LIGHTMAP_MULTIPLY_DIFFUSE
    finalAmbientColor += vec4<f32>(lightmap.rgb, 0.0);
    #else
    finalAmbientColor += vec4<f32>(lightmap.rgb*finalDiffuseColor.rgb, 0.0);
    #endif
    #endif
    #endif

    /* Environment contribution */
    #ifdef GLOBAL_ILLUMINATION
    #ifdef CLEARCOAT
    col += evaluateEnvironmentClearCoat(normal, view, bsdf.diffuse, bsdf.perceptualRoughness, bsdf.specular, ao, clearCoat);
    #else
    col += evaluateEnvironment(normal, view, bsdf.diffuse, bsdf.perceptualRoughness, bsdf.specular, ao);
    #endif
    #endif

    /* Probe volume contribution */
    #ifdef GLOBAL_ILLUMINATION_PROBE_VOLUME
    col += evaluateProbeVolume(fragPositionWorld, normal)*bsdf.diffuse;
    #endif

    /* Punctual lights contribution */
    col += evaluateDirectLights(bsdf, view, normal, fragPositionWorld);

    #ifdef WITH_EMISSIVE
    var emissive: vec4<f32> = mat.emissiveColor;
    #ifdef TEXTURED
    if(mat.emissiveTexture != 0u) {
        emissive *= textureAtlas(mat.emissiveTexture, fragTextureCoords);
    }
    #endif
    col += emissive.a*srgbToLinear3(emissive.rgb);
    #endif

    #ifdef WITH_FOG
    #ifdef REVERSE_Z
    let dist: f32 = (1.0 - gl_FragCoord.z)/gl_FragCoord.w;
    #else
    let dist: f32 = gl_FragCoord.z/gl_FragCoord.w;
    #endif
    let fogFactor: f32 = fogBlendFactor(dist, mat.fogColor.a*0.2);
    col = mix(col, mat.fogColor.rgb, fogFactor);
    #endif

    #ifdef TONEMAPPING
    /* Apply exposure */
    col *= cameraParams.y;
    col = tonemap(col);
    #endif

    return linearToSrgb4(vec4<f32>(col, albedo.a));
}
