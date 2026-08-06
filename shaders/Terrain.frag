#include "lib/Compatibility.glsl"

/**
 * Realistic Terrain & Underwater Caustics Shader (GLSL)
 *
 * Features:
 * - 200m radius underwater ocean basin with depth-based water attenuation
 * - Animated projected light caustics on underwater seabed & cliffs
 * - Normal map scrolling / wiggle simulating underwater refraction
 * - Beyond 200m radius: distant mountain terrain sticking out of water level Y=0
 * - Altitude & slope-based multi-texture blending (Sand -> Grass -> Rock -> Snow)
 * - Atmospheric horizon fog that blends distant mountains into dynamic sky color
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

    // Default light & time fallbacks
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

    // Normal mapping with underwater scrolling wiggle
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

    // Elevation & Slope Analysis
    float heightY = fragPositionWorld.y;
    float slope = 1.0 - bumpNormal.y; // 0.0 for flat terrain, 1.0 for vertical cliff

    // Base Terrain Color Palette
    vec3 sandColor = vec3(0.76, 0.70, 0.50);
    vec3 grassColor = vec3(0.18, 0.42, 0.15);
    vec3 rockColor = vec3(0.35, 0.33, 0.32);
    vec3 snowColor = vec3(0.92, 0.95, 0.98);
    vec3 deepAbyssalColor = vec3(0.01, 0.05, 0.15);

    vec3 terrainBaseColor;

    if (heightY < 0.0) {
        // UNDERWATER SEABED & CLIFFS (Y < 0.0)
        float underwaterDepth = clamp(-heightY / 15.0, 0.0, 1.0);
        vec3 shallowBed = mix(sandColor, rockColor, clamp(slope * 2.0, 0.0, 1.0));
        terrainBaseColor = mix(shallowBed, deepAbyssalColor, underwaterDepth * 0.75);

        // ANIMATED PROJECTED UNDERWATER LIGHT CAUSTICS
        float cIntensity = mat.causticsIntensity <= 0.001 ? 1.0 : mat.causticsIntensity;
        vec2 cUV1 = fragPositionWorld.xz * 0.25 + vec2(animTime * 0.45, animTime * 0.30);
        vec2 cUV2 = fragPositionWorld.xz * 0.35 - vec2(animTime * 0.35, animTime * 0.50);
        float caustics = pow(skyNoise2D(cUV1) * skyNoise2D(cUV2), 1.6) * 3.5 * exp(-underwaterDepth * 2.5);

        vec3 causticColor = isNight < 0.5 ? vec3(0.4, 0.85, 0.95) : vec3(0.1, 0.3, 0.6);
        terrainBaseColor += caustics * causticColor * cIntensity * max(0.2, bumpNormal.y);
    } else {
        // DISTANT MOUNTAIN REGION STICKING OUT OF WATER (Y > 0.0)
        if (heightY < 4.0) {
            float t = heightY / 4.0;
            terrainBaseColor = mix(sandColor, grassColor, t);
        } else if (heightY < 18.0) {
            float t = (heightY - 4.0) / 14.0;
            terrainBaseColor = mix(grassColor, rockColor, t);
        } else {
            float t = clamp((heightY - 18.0) / 12.0, 0.0, 1.0);
            terrainBaseColor = mix(rockColor, snowColor, t);
        }

        // Steep cliff rock override
        terrainBaseColor = mix(terrainBaseColor, rockColor, smoothstep(0.35, 0.70, slope));
    }

    #ifdef TEXTURED
    if (mat.flatTexture > 0u) {
        terrainBaseColor *= textureAtlas(mat.flatTexture, texUV).rgb;
    }
    #endif
    terrainBaseColor *= mat.color.rgb;

    // Direct Lighting
    float NdotL = max(0.1, dot(bumpNormal, lightDir));
    vec3 finalTerrain = terrainBaseColor * lightCol * NdotL;

    // View Direction & Distance Fog
    vec3 viewVec = viewPositionWorld - fragPositionWorld;
    float viewDist = length(viewVec);
    vec3 viewDir = viewDist > 0.001 ? normalize(-viewVec) : vec3(0.0, 1.0, 0.0);

    // ATMOSPHERIC HORIZON FOG (Blends distant mountains into sky color without sun/moon blockage)
    float density = mat.fogDensity <= 0.001 ? 0.0012 : mat.fogDensity;
    float fogFactor = 1.0 - exp(-pow(viewDist * density, 1.5));
    fogFactor = clamp(fogFactor, 0.0, 1.0);

    // Live atmospheric sky color at horizon in view direction
    vec3 skyFogColor = evaluateAtmosphericSkyFast(viewDir, lightDir, lightCol, isNight, animTime);
    finalTerrain = mix(finalTerrain, skyFogColor, fogFactor);

    #ifdef TONEMAPPING
    vec3 linear = srgbToLinear(finalTerrain);
    linear *= cameraParams.y;
    finalTerrain = linearToSrgb(tonemap(linear));
    #endif

    outColor = vec4(finalTerrain, mat.color.a);
}
