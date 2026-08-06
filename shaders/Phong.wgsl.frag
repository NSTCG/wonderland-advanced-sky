#ifndef WGSL_WGPU
diagnostic(off,derivative_uniformity);
#endif

#include "lib/Compatibility.wgsl"

#define USE_LIGHTS

#define FEATURE_WITH_FOG
#define FEATURE_TEXTURED
#define FEATURE_ALPHA_MASKED
#define FEATURE_NORMAL_MAPPING
#define FEATURE_VERTEX_COLORS
#define FEATURE_WITH_EMISSIVE
#define FEATURE_LIGHTMAP
#define FEATURE_LIGHTMAP_MULTIPLY_DIFFUSE
#define FEATURE_GLOBAL_ILLUMINATION
#define FEATURE_GLOBAL_ILLUMINATION_PROBE_VOLUME
#define FEATURE_TONEMAPPING
#define FEATURE_SHADOW_PCF
#define FEATURE_SHADOW_NORMAL_OFFSET_SCALE_BY_SHADOW_DEPTH
#define FEATURE_SHADOW_NORMAL_OFFSET_UV_ONLY
#define FEATURE_SHADOW_NORMAL_OFFSET_SLOPE_SCALE
#define FEATURE_DEPRECATED_LIGHT_ATTENUATION

#ifdef NORMAL_MAPPING
#define TEXTURED
#endif

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

#if NUM_LIGHTS > 0
#define USE_POSITION_WORLD
#endif

#if NUM_SHADOWS > 0
#define USE_POSITION_VIEW
#endif

#include "lib/Uniforms.wgsl"
#include "lib/Math.wgsl"

#if NUM_LIGHTS > 0 || defined(WITH_FOG)
#include "lib/Quaternion.wgsl"
#include "lib/Lights.wgsl"
#endif

#ifdef TEXTURED
#include "lib/Textures.wgsl"
#endif
#include "lib/Surface.wgsl"
#include "lib/Materials.wgsl"

#if defined(GLOBAL_ILLUMINATION) || defined(GLOBAL_ILLUMINATION_PROBE_VOLUME)
#include "lib/CoordinateSystems.wgsl"
#include "lib/GI.wgsl"
#endif

#include "lib/Color.wgsl"

struct Material {
    ambientColor: vec4<f16>,
    diffuseColor: vec4<f16>,
    specularColor: vec4<f16>,
#ifdef WITH_EMISSIVE
    emissiveColor: vec4<f16>,
#endif

#ifdef WITH_FOG
    fogColor: vec4<f16>,
#endif

#ifdef TEXTURED
    diffuseTexture: u32,
#ifdef WITH_EMISSIVE
    emissiveTexture: u32,
#endif
#ifdef NORMAL_MAPPING
    normalTexture: u32,
#endif
#ifdef LIGHTMAP
    lightmapTexture: u32,
    lightmapFactor: f16,
#endif
#endif

    shininess: u8,
};

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

fn phongDiffuseBrdf(lightDir: vec3<f32>, normal: vec3<f32>) -> f32 {
    return max(0.0, dot(lightDir, normal));
}

fn phongSpecularBrdf(lightDir: vec3<f32>, normal: vec3<f32>, viewDir: vec3<f32>, shininess: f32) -> f32 {
    let reflection = reflect(lightDir, normal);
    return pow(max(dot(viewDir, reflection), 0.0), shininess);
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

    var finalDiffuseColor: vec4<f32> =
        #ifdef VERTEX_COLORS
        fragColor*
        #endif
        mat.diffuseColor;

    #ifdef TEXTURED
    if(mat.diffuseTexture > 0u) {
        finalDiffuseColor *= textureAtlas(mat.diffuseTexture, fragTextureCoords);
    }
    #endif

    var finalAmbientColor: vec4<f16> = mat.ambientColor*finalDiffuseColor;
    var finalSpecularColor: vec4<f16> = mat.specularColor;
    finalSpecularColor *= vec4<f16>(vec3<f16>(finalSpecularColor.a), 1.0);

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

    /* Ambient color */
    var outColor = vec4<f32>(finalAmbientColor.rgb, finalDiffuseColor.a);

    let shininess = f32(mat.shininess);

    /* Normal */
    #ifdef NORMAL_MAPPING
    let surface: SurfaceData = computeSurfaceData(fragNormal, fragTangent);
    let normal: vec3<f32> = normalMapping(surface, mat.normalTexture, fragTextureCoords);
    #else
    let surface: SurfaceData = computeSurfaceDataNormal(fragNormal);
    let normal: vec3<f32> = surface.normal;
    #endif

    #ifdef GLOBAL_ILLUMINATION
    let irradiance: vec3<f32> = evaluateEnvironmentIrradiance(normal);
    /* cheap linear-to-srgb conversion */
    outColor += vec4<f32>(finalDiffuseColor.rgb*sqrt(irradiance), 0.0);
    #endif

    #ifdef GLOBAL_ILLUMINATION_PROBE_VOLUME
    let volumeIrradiance: vec3<f32> = evaluateProbeVolume(fragPositionWorld, normal);
    outColor += vec4<f32>(finalDiffuseColor.rgb*sqrt(volumeIrradiance*RECIPROCAL_PI), 0.0);
    #endif

    #if NUM_LIGHTS > 0
    /* Normally the view vector points to the viewer, but we can save ourselves
     * some negations this way. By passing the standard outward light vector to
     * reflect() (which expects an incident vector), these two cancel out. */
    let viewDir: vec3<f32> = normalize(fragPositionWorld - viewPositionWorld.xyz);
    let useSpecular: bool = finalSpecularColor.a != 0.0 && shininess != 0.0;

    var i: u8 = 0u;
    for(; i < pointLightCount; i++) {
        let lightData: vec4<f16> = lights.colors[i];
        /* dot product of vec3<f32> can be NaN for distances > 128 */
        let lightPos: vec3<f32> = lights.positionsWorld[i];
        let lightDirAccurate: vec3<f32> = lightPos - fragPositionWorld;
        let distSq: f16 = dot(lightDirAccurate, lightDirAccurate);
        let attenuation: f16 = distanceAttenuation(distSq, lightData.a);

        if(attenuation < 0.001) {
            continue;
        }

        let lightDir: vec3<f32> = lightDirAccurate*inversesqrt(distSq);

        /* Add diffuse color */
        var value: vec3<f32> = finalDiffuseColor.rgb*phongDiffuseBrdf(lightDir, normal);
        /* Add specular color */
        if(useSpecular) {
            value += finalSpecularColor.rgb*
                phongSpecularBrdf(lightDir, normal, viewDir, shininess);
        }
        var shadow: f32 = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        let shadowsEnabled: bool = bool(lights.parameters[i].z);
        if(shadowsEnabled) {
            let shadowIndex: i32 = i32(lights.parameters[i].w) + i32(dot(lightDir, lights.directionsWorld[i]) < 0.0);
            shadow = sampleShadowParaboloid(shadowIndex, fragPositionWorld);
        }
        #endif
        outColor = vec4<f32>(outColor.rgb + shadow*attenuation*value*lightData.rgb, outColor.a);
    }

    let endSpotLights: u8 = pointLightCount + spotLightCount;
    for(; i < endSpotLights; i++) {
        let lightData: vec4<f16> = lights.colors[i];
        /* dot product of vec3<f32> can be NaN for distances > 128 */
        let lightPos: vec3<f32> = lights.positionsWorld[i];
        let lightDirAccurate: vec3<f32> = lightPos - fragPositionWorld;
        let distSq: f16 = dot(lightDirAccurate, lightDirAccurate);
        var attenuation: f16 = distanceAttenuation(distSq, lightData.a);

        if(attenuation < 0.001) {
            continue;
        }

        let lightDir: vec3<f32> = lightDirAccurate*inversesqrt(distSq);

        let spotDir: vec3<f32> = lights.directionsWorld[i];
        attenuation *= spotAttenuation(lightDir, spotDir, lights.parameters[i].x, lights.parameters[i].y);

        if(attenuation < 0.001) {
            continue;
        }

        /* Add diffuse color */
        var value: vec3<f32> = finalDiffuseColor.rgb*phongDiffuseBrdf(lightDir, normal);
        /* Add specular color */
        if(useSpecular) {
            value += finalSpecularColor.rgb*
                phongSpecularBrdf(lightDir, normal, viewDir, shininess);
        }
        var shadow: f32 = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        let shadowsEnabled: bool = bool(lights.parameters[i].z);
        if(shadowsEnabled) {
            let shadowIndex: i32 = i32(lights.parameters[i].w);
            shadow = sampleShadowPerspective(shadowIndex, fragPositionWorld, surface.normal, lightDir);
        }
        #endif
        outColor = vec4<f32>(outColor.rgb + shadow*attenuation*value*lightData.rgb, outColor.a);
    }

    let endSunLights: u8 = pointLightCount + spotLightCount + sunLightCount;
    for(; i < endSunLights; i++) {
        let lightData: vec4<f8> = lights.colors[i];
        let lightDir: vec3<f32> = lights.directionsWorld[i];

        /* Add diffuse color */
        var value: vec3<f32> = finalDiffuseColor.rgb*
            phongDiffuseBrdf(lightDir, normal);
        /* Add specular color */
        if(useSpecular) {
            value += finalSpecularColor.rgb*
                phongSpecularBrdf(lightDir, normal, viewDir, shininess);
        }
        var shadow: f32 = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        let shadowsEnabled: bool = bool(lights.parameters[i].z);
        if(shadowsEnabled) {
            let shadowIndex: i32 = i32(lights.parameters[i].w);
            let depth: f32 = -fragPositionView.z;
            let cascade: i32 = selectCascade(shadowIndex, depth);
            if(cascade != -1) {
                shadow = sampleShadowOrtho(shadowIndex + cascade, fragPositionWorld, surface.normal, lightDir);
            }
        }
        #endif
        outColor = vec4<f32>(outColor.rgb + shadow*lightData.a*value*lightData.rgb, outColor.a);
    }

    #endif

    #ifdef WITH_EMISSIVE
    var emissive = mat.emissiveColor;
    #ifdef TEXTURED
    if(mat.emissiveTexture != 0u) {
        emissive *= textureAtlas(mat.emissiveTexture, fragTextureCoords);
    }
    #endif
    outColor += vec4<f32>(emissive.a*emissive.rgb, 0.0);
    #endif

    #ifdef WITH_FOG
    #ifdef REVERSE_Z
    let dist: f32 = (1.0 - Position.z)/Position.w;
    #else
    let dist: f32 = Position.z/Position.w;
    #endif
    let fogFactor: f32 = fogBlendFactor(dist, mat.fogColor.a*0.2);
    outColor = vec4<f32>(mix(outColor.rgb, mat.fogColor.rgb, fogFactor), outColor.a);
    #endif

    #ifdef TONEMAPPING
    /** @todo Make Phong calculate lighting in linear RGB */
    var linear: vec3<f32> = srgbToLinear3(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor = vec4<f32>(linearToSrgb3(tonemap(linear)), outColor.a);
    #endif

    return outColor;
}
