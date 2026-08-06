/**
 * Ultra-Realistic Procedural Water Shader (GLSL)
 *
 * Features:
 * - Multi-octave Gerstner-style ocean wave & ripple simulation
 * - Subsurface light scattering through wave crests
 * - Dual-lobe specular reflections & dynamic sky reflections
 * - Dynamic crest foam
 * - Radius = 30.0 & Center = (0,0,0) radial alpha fade to 0.0 transparent
 */

#define USE_LIGHTS
#define FEATURE_TEXTURED
#define FEATURE_TONEMAPPING

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
#ifdef TEXTURED
    mediump uint flatTexture;
#endif
};

Material decodeMaterial(uint matIndex) {
    {{decoder}}
    return mat;
}

// Multi-octave wave height & gradient computation for realistic oceanic surface
vec3 computeOceanWave(vec2 pos, float t) {
    vec2 p1 = pos * 0.8 + vec2(t * 0.45, t * 0.30);
    vec2 p2 = pos * 1.8 - vec2(t * 0.35, t * 0.50);
    vec2 p3 = pos * 4.2 + vec2(t * 0.70, -t * 0.40);
    vec2 p4 = pos * 9.5 - vec2(t * 1.10, t * 0.80);

    float h1 = skyNoise2D(p1);
    float h2 = skyNoise2D(p2) * 0.5;
    float h3 = skyNoise2D(p3) * 0.25;
    float h4 = skyNoise2D(p4) * 0.12;

    float waveH = h1 + h2 + h3 + h4;

    // Gradient sampling for accurate normal calculation
    vec2 eps = vec2(0.04, 0.0);
    float h1x = skyNoise2D(p1 + eps * 0.8);
    float h2x = skyNoise2D(p2 + eps * 1.8) * 0.5;
    float h3x = skyNoise2D(p3 + eps * 4.2) * 0.25;

    float h1y = skyNoise2D(p1 + eps.yx * 0.8);
    float h2y = skyNoise2D(p2 + eps.yx * 1.8) * 0.5;
    float h3y = skyNoise2D(p3 + eps.yx * 4.2) * 0.25;

    float hx = h1x + h2x + h3x;
    float hy = h1y + h2y + h3y;

    vec2 grad = vec2(hx - (h1 + h2 + h3), hy - (h1 + h2 + h3)) * 6.0;
    return vec3(grad.x, waveH, grad.y);
}

void main() {
    Material mat = decodeMaterial(fragMaterialId);

    // Default fallbacks
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

    // Radial Alpha Fade: Center = (0,0,0), Radius = 30.0
    vec3 waterCenter = vec3(0.0, 0.0, 0.0);
    float waterRadius = 30.0;
    float distToCenter = length(fragPositionWorld.xz - waterCenter.xz);
    float alphaFade = 1.0 - smoothstep(waterRadius * 0.65, waterRadius, distToCenter);
    if (alphaFade <= 0.001) {
        discard;
    }

    #ifdef TEXTURED
    vec2 texUV = fragTextureCoords;
    #else
    vec2 texUV = fragPositionWorld.xz;
    #endif

    // Multi-frequency wave calculation
    vec3 waveData = computeOceanWave(texUV * 1.5, animTime);
    vec3 localNormal = normalize(vec3(-waveData.x, 1.0, -waveData.z));

    vec3 worldNorm = length(fragNormal) > 0.001 ? normalize(fragNormal) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(worldNorm, vec3(0.0, 0.0, 1.0)));
    if (length(tangent) < 0.1) tangent = normalize(cross(worldNorm, vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = cross(worldNorm, tangent);
    mat3 tbn = mat3(tangent, worldNorm, bitangent);
    vec3 bumpNormal = normalize(tbn * localNormal);

    // View & Reflection Vectors
    vec3 viewDir = length(viewPositionWorld - fragPositionWorld) > 0.001 ? normalize(viewPositionWorld - fragPositionWorld) : vec3(0.0, 1.0, 0.0);
    vec3 reflectDir = reflect(-viewDir, bumpNormal);

    // Optical Calculations
    float NdotV = max(0.0, dot(bumpNormal, viewDir));
    float fresnel = pow(1.0 - NdotV, 4.0) * 0.85 + 0.10;

    // Subsurface Scattering (Light transmitting through wave crests facing light)
    float sunCos = clamp(dot(lightDir, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
    float sss = pow(max(0.0, dot(viewDir, -lightDir + bumpNormal * 0.5)), 4.0) * bumpNormal.y * 0.6;
    vec3 sssColor = isNight < 0.5 ? mix(vec3(0.05, 0.55, 0.45), vec3(0.9, 0.4, 0.2), 1.0 - sunCos) : vec3(0.02, 0.25, 0.45);

    // Color Gradients based on Day/Sunset/Night
    vec3 deepWaterColor;
    vec3 shallowWaterColor;

    if (isNight < 0.5) {
        if (sunCos < 0.25) {
            float t = sunCos / 0.25;
            deepWaterColor = mix(vec3(0.06, 0.03, 0.18), vec3(0.01, 0.08, 0.22), t);
            shallowWaterColor = mix(vec3(0.85, 0.32, 0.12), vec3(0.05, 0.45, 0.55), t);
        } else {
            deepWaterColor = vec3(0.01, 0.08, 0.22);
            shallowWaterColor = vec3(0.05, 0.45, 0.55);
        }
    } else {
        deepWaterColor = vec3(0.005, 0.015, 0.06);
        shallowWaterColor = vec3(0.02, 0.18, 0.35);
    }

    vec3 waterBaseColor = mix(deepWaterColor, shallowWaterColor, (1.0 - NdotV) * 0.7) + sss * sssColor;
    #ifdef TEXTURED
    waterBaseColor *= textureAtlas(mat.flatTexture, texUV).rgb;
    #endif
    waterBaseColor *= mat.color.rgb;

    // Dynamic Sky Reflection
    vec3 skyReflect = evaluateAtmosphericSkyFast(reflectDir, lightDir, lightCol, isNight, animTime);

    // Dual-Lobe Specular Highlights (Sun/Moon glitter)
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(bumpNormal, halfVec));
    float specular = pow(NdotH, 256.0) * 4.5 + pow(NdotH, 24.0) * 0.7;
    vec3 specColor = specular * lightCol * (isNight < 0.5 ? 1.0 : 0.6);

    // Wave Crest Foam
    float foam = smoothstep(0.82, 1.35, waveData.y) * 0.45;

    // Final Water Composition
    vec3 finalWater = mix(waterBaseColor, skyReflect, fresnel) + specColor + vec3(foam);

    #ifdef TONEMAPPING
    vec3 linear = srgbToLinear3(finalWater);
    linear *= cameraParams.y;
    finalWater = linearToSrgb3(tonemap(linear));
    #endif

    float finalAlpha = mat.color.a * alphaFade;
    gl_FragColor = vec4(finalWater, finalAlpha);
}
