#include "lib/Compatibility.glsl"

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
#define FEATURE_SSAO
#define FEATURE_TONEMAPPING
#define FEATURE_SHADOW_PCF
#define FEATURE_SHADOW_NORMAL_OFFSET_SCALE_BY_SHADOW_DEPTH
#define FEATURE_SHADOW_NORMAL_OFFSET_UV_ONLY
#define FEATURE_SHADOW_NORMAL_OFFSET_SLOPE_SCALE
#define FEATURE_DEPRECATED_AMBIENT_FACTOR
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

#include "lib/Uniforms.glsl"
#include "lib/Inputs.glsl"
#include "lib/Math.glsl"

#if NUM_LIGHTS > 0 || defined(WITH_FOG)
#include "lib/Quaternion.glsl"
#endif

#include "lib/Lights.glsl"

#ifdef TEXTURED
#include "lib/Textures.glsl"
#endif
#include "lib/Surface.glsl"
#include "lib/Packing.glsl"
#include "lib/Materials.glsl"

#if defined(GLOBAL_ILLUMINATION) || defined(GLOBAL_ILLUMINATION_PROBE_VOLUME)
#include "lib/CoordinateSystems.glsl"
#include "lib/GI.glsl"
#endif

#include "lib/Color.glsl"

struct Material {
    lowp vec4 ambientColor;
    lowp vec4 diffuseColor;
    lowp vec4 specularColor;
#ifdef WITH_EMISSIVE
    lowp vec4 emissiveColor;
#endif

#ifdef WITH_FOG
    lowp vec4 fogColor;
#endif

#ifdef TEXTURED
    mediump uint diffuseTexture;
#ifdef WITH_EMISSIVE
    mediump uint emissiveTexture;
#endif
#ifdef NORMAL_MAPPING
    mediump uint normalTexture;
#endif
#ifdef LIGHTMAP
    mediump uint lightmapTexture;
    lowp float lightmapFactor;
#endif
#endif

    lowp uint shininess;
#ifdef DEPRECATED_AMBIENT_FACTOR
    lowp float ambientFactor;
#endif
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

mediump float phongDiffuseBrdf(mediump vec3 lightDir, mediump vec3 normal) {
    return max(0.0, dot(lightDir, normal));
}

mediump float phongSpecularBrdf(mediump vec3 lightDir, mediump vec3 normal, mediump vec3 viewDir, mediump float shininess) {
    mediump vec3 reflection = reflect(lightDir, normal);
    return pow(max(dot(viewDir, reflection), 0.0), shininess);
}

void main() {
    #ifdef TEXTURED
    alphaMask(fragMaterialId, fragTextureCoords);
    #endif

    Material mat = decodeMaterial(fragMaterialId);

    lowp vec4 finalDiffuseColor =
        #ifdef VERTEX_COLORS
        fragColor*
        #endif
        mat.diffuseColor;

    #ifdef TEXTURED
    if(mat.diffuseTexture > 0u) {
        finalDiffuseColor *= textureAtlas(mat.diffuseTexture, fragTextureCoords);
    }
    #endif

    #ifdef DEPRECATED_AMBIENT_FACTOR
    lowp vec4 finalAmbientColor =
        mat.ambientColor + finalDiffuseColor*mat.ambientFactor;
    #else
    lowp vec4 finalAmbientColor = mat.ambientColor*finalDiffuseColor;
    #endif
    lowp vec4 finalSpecularColor = mat.specularColor;
    finalSpecularColor.rgb *= finalSpecularColor.a;

    #ifdef TEXTURED
    #ifdef LIGHTMAP
    lowp vec4 lightmap =
        textureAtlas(mat.lightmapTexture, fragTextureCoords1)*mat.lightmapFactor;
    #ifndef LIGHTMAP_MULTIPLY_DIFFUSE
    finalAmbientColor.rgb += lightmap.rgb;
    #else
    finalAmbientColor.rgb += lightmap.rgb*finalDiffuseColor.rgb;
    #endif
    #endif
    #endif

    /* Ambient color */
    outColor = vec4(finalAmbientColor.rgb, finalDiffuseColor.a);

    mediump float shininess = float(mat.shininess);

    /* Normal */
    #ifdef NORMAL_MAPPING
    SurfaceData surface = computeSurfaceData(fragNormal, fragTangent);
    mediump vec3 normal = normalMapping(surface, mat.normalTexture, fragTextureCoords);
    #else
    SurfaceData surface = computeSurfaceData(fragNormal);
    mediump vec3 normal = surface.normal;
    #endif

    #ifdef GLOBAL_ILLUMINATION
    vec3 irradiance = evaluateEnvironmentIrradiance(normal);
    /* cheap linear-to-srgb conversion */
    outColor.rgb += finalDiffuseColor.rgb*sqrt(irradiance);
    #endif

    #ifdef GLOBAL_ILLUMINATION_PROBE_VOLUME
    vec3 volumeIrradiance = evaluateProbeVolume(fragPositionWorld, normal);
    outColor.rgb += finalDiffuseColor.rgb*sqrt(volumeIrradiance*RECIPROCAL_PI);
    #endif

    #if NUM_LIGHTS > 0

    /* Normally the view vector points to the viewer, but we can save ourselves
     * some negations this way. By passing the standard outward light vector to
     * reflect() (which expects an incident vector), these two cancel out. */
    mediump vec3 viewDir = normalize(fragPositionWorld - viewPositionWorld);
    bool useSpecular = finalSpecularColor.a != 0.0 && shininess != 0.0;

    for(lowp uint i = 0u; i < pointLightCount; ++i) {
        mediump vec4 lightData = lightColors[i];

        /* dot product of mediump vec3 can be NaN for distances > 128 */
        highp vec3 lightPos = lightPositionsWorld[i];
        highp vec3 lightDirAccurate = lightPos - fragPositionWorld;
        mediump float distSq = dot(lightDirAccurate, lightDirAccurate);
        mediump float attenuation = distanceAttenuation(distSq, lightData.a);

        if(attenuation < 0.001)
            continue;

        mediump vec3 lightDir = lightDirAccurate;
        lightDir *= inversesqrt(distSq);

        /* Add diffuse color */
        mediump vec3 value = finalDiffuseColor.rgb*phongDiffuseBrdf(lightDir, normal);
        /* Add specular color */
        if(useSpecular) {
            value += finalSpecularColor.rgb*
                phongSpecularBrdf(lightDir, normal, viewDir, shininess);
        }
        float shadow = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        bool shadowsEnabled = bool(lightParameters[i].z);
        if(shadowsEnabled) {
            int shadowIndex = int(lightParameters[i].w) + int(dot(lightDir, lightDirectionsWorld[i]) < 0.0);
            shadow = sampleShadowParaboloid(shadowIndex, fragPositionWorld);
        }
        #endif
        outColor.rgb += shadow*attenuation*value*lightData.rgb;
    }

    for(lowp uint i = pointLightCount; i < pointLightCount + spotLightCount; ++i) {
        mediump vec4 lightData = lightColors[i];
        /* dot product of mediump vec3 can be NaN for distances > 128 */
        highp vec3 lightPos = lightPositionsWorld[i];
        highp vec3 lightDirAccurate = lightPos - fragPositionWorld;
        mediump float distSq = dot(lightDirAccurate, lightDirAccurate);
        mediump float attenuation = distanceAttenuation(distSq, lightData.a);

        if(attenuation < 0.001)
            continue;

        mediump vec3 lightDir = lightDirAccurate;
        lightDir *= inversesqrt(distSq);

        highp vec3 spotDir = lightDirectionsWorld[i];
        attenuation *= spotAttenuation(lightDir, spotDir, lightParameters[i].x, lightParameters[i].y);

        if(attenuation < 0.001)
            continue;

        /* Add diffuse color */
        mediump vec3 value = finalDiffuseColor.rgb*phongDiffuseBrdf(lightDir, normal);
        /* Add specular color */
        if(useSpecular) {
            value += finalSpecularColor.rgb*
                phongSpecularBrdf(lightDir, normal, viewDir, shininess);
        }
        float shadow = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        bool shadowsEnabled = bool(lightParameters[i].z);
        if(shadowsEnabled) {
            int shadowIndex = int(lightParameters[i].w);
            shadow = sampleShadowPerspective(shadowIndex, fragPositionWorld, surface.normal, lightDir);
        }
        #endif
        outColor.rgb += shadow*attenuation*value*lightData.rgb;
    }

    for(lowp uint i = pointLightCount + spotLightCount; i < pointLightCount + spotLightCount + sunLightCount; ++i) {
        mediump vec4 lightData = lightColors[i];
        mediump vec3 lightDir = lightDirectionsWorld[i];

        /* Add diffuse color */
        mediump vec3 value = finalDiffuseColor.rgb*
            phongDiffuseBrdf(lightDir, normal);
        /* Add specular color */
        if(useSpecular) {
            value += finalSpecularColor.rgb*
                phongSpecularBrdf(lightDir, normal, viewDir, shininess);
        }
        float shadow = 1.0;
        #if NUM_SHADOWS > 0
        /* Shadows */
        bool shadowsEnabled = bool(lightParameters[i].z);
        if(shadowsEnabled) {
            int shadowIndex = int(lightParameters[i].w);
            float depth = -fragPositionView.z;
            int cascade = selectCascade(shadowIndex, depth);
            if(cascade != -1)
                shadow = sampleShadowOrtho(shadowIndex + cascade, fragPositionWorld, surface.normal, lightDir);
        }
        #endif
        outColor.rgb += shadow*lightData.a*value*lightData.rgb;
    }

    #endif

    #ifdef SSAO
    vec2 screenUV = (gl_FragCoord.xy - vec2(viewport.xy))/vec2(viewport.zw);
    float ssao = texture(ambientOcclusion, screenUV).r;
    outColor.rgb *= ssao;
    #endif

    #ifdef WITH_EMISSIVE
    vec4 emissive = mat.emissiveColor;
    #ifdef TEXTURED
    if(mat.emissiveTexture != 0u) {
        emissive *= textureAtlas(mat.emissiveTexture, fragTextureCoords);
    }
    #endif
    outColor.rgb += emissive.a*emissive.rgb;
    #endif

    #ifdef WITH_FOG
    #ifdef REVERSE_Z
    float dist = (1.0 - gl_FragCoord.z)/gl_FragCoord.w;
    #else
    float dist = gl_FragCoord.z/gl_FragCoord.w;
    #endif
    float fogFactor = fogBlendFactor(dist, mat.fogColor.a*0.2);
    outColor.rgb = mix(outColor.rgb, mat.fogColor.rgb, fogFactor);
    #endif

    #ifdef TONEMAPPING
    /** @todo Make Phong calculate lighting in linear RGB */
    vec3 linear = srgbToLinear(outColor.rgb);
    /* Apply exposure */
    linear *= cameraParams.y;
    outColor.rgb = linearToSrgb(tonemap(linear));
    #endif
}
