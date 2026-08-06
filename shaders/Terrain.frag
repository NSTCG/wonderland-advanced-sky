#include "lib/Compatibility.glsl"

/**
 * Realistic Terrain & Underwater Depth Fog Shader (GLSL)
 *
 * Features:
 * - 0 fog haze within 250m near player zone; smooth 100% atmospheric sky color match in distance
 * - Ultra-gradual underwater depth color fade to deep dark blue below water level Y = 0
 * - Projected animated light caustics on underwater seabed & cliffs
 * - Procedural micro-detail noise for crisp close-up terrain realism
 * - Altitude & slope-based material blending with wet shore specular shine
 */

#define USE_LIGHTS
#define FEATURE_TEXTURED
#define FEATURE_NORMAL_MAPPING
#define FEATURE_TONEMAPPING

#ifdef NORMAL_MAPPING
#define TEXTURED
#define USE_TANGENT
#endif

#ifdef TEXTURED
#define USE_TEXTURE_COORDS
#endif

#define USE_MATERIAL_ID
#define USE_POSITION_WORLD
#define USE_NORMAL

#include "lib/Uniforms.glsl"
#include "lib/Inputs.glsl"
#include "lib/Color.glsl"

#ifdef TEXTURED
#include "lib/Textures.glsl"
#endif
#include "lib/Packing.glsl"
#include "lib/Materials.glsl"
#include "lib/Lights.glsl"
#include "lib/SkyProcedural.glsl"

struct Material {
    lowp vec4 color;
    mediump vec2 uvScale;
    mediump float causticsIntensity;
    mediump float fogDensity;
#ifdef TEXTURED
    mediump uint flatTexture;
#ifdef NORMAL_MAPPING
    mediump uint normalTexture;
#endif
#endif
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

void main() {
    Material mat = decodeMaterial(fragMaterialId);

    // Light vector and animation time fallbacks
    float animTime = 0.0;
    float isNight = 0.0;
    vec3 lightDir = vec3(0.0, 1.0, 0.5);
    vec3 lightCol = vec3(1.0);

    #if NUM_LIGHTS > 0
    vec3 lightPos = lightPositionsWorld[0];
    animTime = lightPos.y;
    isNight = lightPos.x >= 0.5 ? 1.0 : 0.0;
    if (length(lightDirectionsWorld[0]) > 0.01) {
        lightDir = normalize(lightDirectionsWorld[0]);
    } else if (length(lightPos) > 0.01) {
        lightDir = normalize(lightPos);
    }
    lightCol = lightColors[0].rgb * max(0.1, lightColors[0].a);
    #endif

    vec2 scaleUV = vec2(
        mat.uvScale.x <= 0.001 ? 1.0 : mat.uvScale.x,
        mat.uvScale.y <= 0.001 ? 1.0 : mat.uvScale.y
    );

    #ifdef TEXTURED
    vec2 texUV = fragTextureCoords * scaleUV;
    #else
    vec2 texUV = fragPositionWorld.xz * scaleUV * 0.02;
    #endif

    // World Normal & Bump Normal Mapping
    vec3 worldNorm = length(fragNormal) > 0.001 ? normalize(fragNormal) : vec3(0.0, 1.0, 0.0);
    vec3 bumpNormal = worldNorm;

    #ifdef NORMAL_MAPPING
    #ifdef TEXTURED
    if (mat.normalTexture > 0u) {
        vec2 wiggleUV1 = texUV + vec2(animTime * 0.08, animTime * 0.05);
        vec2 wiggleUV2 = texUV * 1.5 - vec2(animTime * 0.06, animTime * 0.09);

        vec3 nMap1 = textureAtlas(mat.normalTexture, wiggleUV1).rgb * 2.0 - 1.0;
        vec3 nMap2 = textureAtlas(mat.normalTexture, wiggleUV2).rgb * 2.0 - 1.0;
        vec3 nMapCombined = normalize(nMap1 + nMap2);

        vec3 tangent = normalize(cross(worldNorm, vec3(0.0, 0.0, 1.0)));
        if (length(tangent) < 0.1) tangent = normalize(cross(worldNorm, vec3(1.0, 0.0, 0.0)));
        vec3 bitangent = cross(worldNorm, tangent);
        mat3 tbn = mat3(tangent, worldNorm, bitangent);

        bumpNormal = normalize(tbn * vec3(nMapCombined.x, 1.0, nMapCombined.y));
    }
    #endif
    #endif

    // Procedural Detail Noise for crisp close-up surface texture
    float detailNoise = skyNoise2D(fragPositionWorld.xz * 0.25) * 0.5 + 0.5;
    float microGrain = skyNoise2D(fragPositionWorld.xz * 3.0) * 0.2 + 0.8;

    float heightY = fragPositionWorld.y;
    float slope = 1.0 - bumpNormal.y; // 0.0 for flat terrain, 1.0 for vertical cliff

    // Base Color Palette
    vec3 sandColor = vec3(0.76, 0.70, 0.50) * (0.85 + 0.3 * detailNoise) * microGrain;
    vec3 grassColor = vec3(0.18, 0.42, 0.15) * (0.8 + 0.4 * detailNoise) * microGrain;
    vec3 rockColor = vec3(0.35, 0.33, 0.32) * (0.75 + 0.5 * detailNoise) * microGrain;
    vec3 snowColor = vec3(0.92, 0.95, 0.98) * (0.9 + 0.2 * detailNoise);

    vec3 terrainBaseColor;
    float specularIntensity = 0.0;
    float specularPower = 16.0;

    if (heightY < 0.0) {
        // UNDERWATER SEABED & CLIFFS
        // Ultra-gradual depth fade below water level Y = 0.0 (over 40m depth)
        float depthFactor = clamp(-heightY / 40.0, 0.0, 1.0);
        depthFactor = depthFactor * depthFactor * (3.0 - 2.0 * depthFactor); // Smooth cubic curve

        vec3 shallowBed = mix(sandColor, rockColor, clamp(slope * 2.0, 0.0, 1.0));
        vec3 deepDarkBlue = isNight < 0.5 ? vec3(0.01, 0.04, 0.12) : vec3(0.001, 0.004, 0.015);
        terrainBaseColor = mix(shallowBed, deepDarkBlue, depthFactor * 0.85);

        // Projected Caustics
        float cIntensity = mat.causticsIntensity <= 0.001 ? 1.0 : mat.causticsIntensity;
        vec2 cUV1 = fragPositionWorld.xz * 0.25 + vec2(animTime * 0.45, animTime * 0.30);
        vec2 cUV2 = fragPositionWorld.xz * 0.35 - vec2(animTime * 0.35, animTime * 0.50);
        float caustics = pow(skyNoise2D(cUV1) * skyNoise2D(cUV2), 1.6) * 3.0 * (1.0 - depthFactor * 0.7);

        vec3 causticColor = isNight < 0.5 ? vec3(0.4, 0.85, 0.95) : vec3(0.1, 0.3, 0.6);
        terrainBaseColor += caustics * causticColor * cIntensity * max(0.2, bumpNormal.y);
    } else {
        // MOUNTAIN REGION ABOVE WATER
        if (heightY < 3.0) {
            float t = heightY / 3.0;
            terrainBaseColor = mix(sandColor, grassColor, t);
            specularIntensity = (1.0 - t) * 0.35;
            specularPower = 48.0;
        } else if (heightY < 18.0) {
            float t = (heightY - 3.0) / 15.0;
            terrainBaseColor = mix(grassColor, rockColor, t);
        } else {
            float t = clamp((heightY - 18.0) / 12.0, 0.0, 1.0);
            terrainBaseColor = mix(rockColor, snowColor, t);
            specularIntensity = t * 0.2;
            specularPower = 32.0;
        }

        terrainBaseColor = mix(terrainBaseColor, rockColor * 0.85, smoothstep(0.35, 0.70, slope));
    }

    #ifdef TEXTURED
    if (mat.flatTexture > 0u) {
        terrainBaseColor *= textureAtlas(mat.flatTexture, texUV).rgb;
    }
    #endif
    terrainBaseColor *= mat.color.rgb;

    // View Direction & Lighting
    vec3 viewVec = viewPositionWorld - fragPositionWorld;
    float viewDist = length(viewVec);
    vec3 viewDir = viewDist > 0.001 ? normalize(-viewVec) : vec3(0.0, 1.0, 0.0);

    float NdotL = max(0.12, dot(bumpNormal, lightDir));
    vec3 finalTerrain = terrainBaseColor * lightCol * NdotL;

    // Specular Highlight
    if (specularIntensity > 0.01) {
        vec3 halfVec = normalize(lightDir + viewDir);
        float NdotH = max(0.0, dot(bumpNormal, halfVec));
        float spec = pow(NdotH, specularPower) * specularIntensity;
        finalTerrain += lightCol * spec;
    }

    // FOG AND ATMOSPHERE FADING
    if (heightY < 0.0 || viewPositionWorld.y < 0.0) {
        // Smooth & gradual underwater distance fog
        float uFog = 1.0 - exp(-viewDist * 0.008);
        uFog = clamp(uFog, 0.0, 0.95);

        vec3 deepDarkBlue = isNight < 0.5 ? vec3(0.01, 0.04, 0.12) : vec3(0.001, 0.004, 0.015);
        finalTerrain = mix(finalTerrain, deepDarkBlue, uFog);
    } else {
        // ATMOSPHERIC FOG: 0 fog inside 250m near zone; matches 100% atmosphere sky color in distance
        float fogDist = max(0.0, viewDist - 250.0);
        float heightFactor = exp(-max(0.0, fragPositionWorld.y) * 0.02);
        float density = mat.fogDensity <= 0.001 ? 0.0012 : mat.fogDensity;

        float atmFog = 1.0 - exp(-pow(fogDist * density * heightFactor, 1.35));
        atmFog = clamp(atmFog, 0.0, 1.0);

        // Evaluate dynamic atmosphere sky color in exact view direction
        vec3 skyColor = evaluateAtmosphericSkyFast(viewDir, lightDir, lightCol, isNight, animTime);
        finalTerrain = mix(finalTerrain, skyColor, atmFog);
    }

    #ifdef TONEMAPPING
    vec3 linear = srgbToLinear(finalTerrain);
    linear *= cameraParams.y;
    finalTerrain = linearToSrgb(tonemap(linear));
    #endif

    outColor = vec4(finalTerrain, mat.color.a);
}
