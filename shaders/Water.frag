#include "lib/Compatibility.glsl"

/**
 * Ultra-Realistic Procedural Water Shader (GLSL)
 *
 * Features:
 * - Multi-octave Gerstner-style ocean wave & ripple simulation
 * - Optional scrolling Normal Map wave distortion (`normalTexture`)
 * - Material property `radius` (Center = (0,0,0), smooth gradual fade to transparent)
 * - Material property `scrollSpeed` for natural, calm wave scrolling speed
 * - `uvScale` parameter for custom wave/texture tiling (works on textured & non-textured)
 * - `distortionFactor` parameter (1.0 = full waves, 0.0 = pure pristine mirror reflection)
 * - Organic noise-warped fluid wave movement
 * - Subsurface light scattering through wave crests
 * - Dual-lobe specular reflections & 1:1 true-scale dynamic sky reflections
 * - Dynamic crest foam
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
    mediump float radius;
    mediump float distortionFactor;
    mediump float scrollSpeed;
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

    // Material Scroll Speed (default multiplier ~0.25 for realistic calm scrolling)
    float speedMult = (mat.scrollSpeed <= 0.0001) ? 0.25 : (mat.scrollSpeed * 0.25);
    float speedTime = animTime * speedMult;

    // Material Radius Property (Center = (0,0,0), smooth gradual fade to transparent)
    vec3 waterCenter = vec3(0.0, 0.0, 0.0);
    float waterRadius = (mat.radius <= 0.001) ? 30.0 : mat.radius;
    float distToCenter = length(fragPositionWorld.xz - waterCenter.xz);
    float normDist = clamp(distToCenter / waterRadius, 0.0, 1.0);
    float alphaFade = pow(cos(normDist * 1.5707963), 1.6);
    if (alphaFade <= 0.0001) {
        discard;
    }

    // Material UV Tiling Scale (works for both textured and non-textured water)
    vec2 scaleUV = vec2(
        mat.uvScale.x <= 0.001 ? 1.0 : mat.uvScale.x,
        mat.uvScale.y <= 0.001 ? 1.0 : mat.uvScale.y
    );

    #ifdef TEXTURED
    vec2 texUV = fragTextureCoords * scaleUV;
    #else
    vec2 texUV = fragPositionWorld.xz * scaleUV;
    #endif

    // Material Distortion Factor (1.0 = full wave distortion, 0.0 = pure mirror reflection)
    float distortion = clamp(mat.distortionFactor, 0.0, 1.0);

    // Organic noise warp for natural fluid wave movement
    vec2 noiseWarp = vec2(
        skyNoise2D(texUV * 0.4 + vec2(speedTime * 0.08, speedTime * 0.05)),
        skyNoise2D(texUV * 0.4 - vec2(speedTime * 0.06, speedTime * 0.09))
    ) * 0.20;

    // Multi-frequency procedural ocean wave normal with natural speed
    vec3 waveData = computeOceanWave(texUV * 1.5 + noiseWarp, speedTime);
    vec3 waveNormal = normalize(vec3(-waveData.x, 1.0, -waveData.z));

    // Optional Scrolling Normal Map Wave Blend
    #ifdef NORMAL_MAPPING
    #ifdef TEXTURED
    if (mat.normalTexture > 0u) {
        vec2 nUV1 = texUV + noiseWarp + vec2(speedTime * 0.06, speedTime * 0.04);
        vec2 nUV2 = texUV * 1.6 - noiseWarp - vec2(speedTime * 0.05, speedTime * 0.07);

        vec3 nMap1 = textureAtlas(mat.normalTexture, nUV1).rgb * 2.0 - 1.0;
        vec3 nMap2 = textureAtlas(mat.normalTexture, nUV2).rgb * 2.0 - 1.0;
        vec3 nMapCombined = normalize(nMap1 + nMap2);

        waveNormal = normalize(mix(waveNormal, vec3(nMapCombined.x, nMapCombined.z, nMapCombined.y), 0.65));
    }
    #endif
    #endif

    // Blend wave normal with flat mirror normal based on distortionFactor
    vec3 localNormal = mix(vec3(0.0, 1.0, 0.0), waveNormal, distortion);

    vec3 worldNorm = length(fragNormal) > 0.001 ? normalize(fragNormal) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(worldNorm, vec3(0.0, 0.0, 1.0)));
    if (length(tangent) < 0.1) tangent = normalize(cross(worldNorm, vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = cross(worldNorm, tangent);
    mat3 tbn = mat3(tangent, worldNorm, bitangent);
    vec3 bumpNormal = normalize(tbn * localNormal);

    // View & Reflection Vectors (computed in world space for true 1:1 sky scale)
    vec3 viewDir = length(viewPositionWorld - fragPositionWorld) > 0.001 ? normalize(viewPositionWorld - fragPositionWorld) : vec3(0.0, 1.0, 0.0);
    vec3 reflectDir = normalize(reflect(-viewDir, bumpNormal));

    // Optical Calculations
    float NdotV = max(0.0, dot(bumpNormal, viewDir));
    float fresnel = pow(1.0 - NdotV, 4.0) * 0.85 + 0.10;

    // Subsurface Scattering (Light transmitting through wave crests facing light)
    float sunCos = clamp(dot(lightDir, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
    float sss = pow(max(0.0, dot(viewDir, -lightDir + bumpNormal * 0.5)), 4.0) * bumpNormal.y * 0.6 * distortion;
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
    if (mat.flatTexture > 0u) {
        waterBaseColor *= textureAtlas(mat.flatTexture, texUV).rgb;
    }
    #endif
    waterBaseColor *= mat.color.rgb;

    // Dynamic Full Sky Reflection (Sun, Moon, Clouds, Stars, Sky Gradient at 1:1 sky scale)
    vec3 skyReflect = evaluateUltraStylizedSky(reflectDir, lightDir, lightCol, isNight, speedTime);

    // Dual-Lobe Specular Highlights (Sun/Moon glitter)
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(bumpNormal, halfVec));
    float specular = pow(NdotH, 256.0) * 4.5 + pow(NdotH, 24.0) * 0.7;
    vec3 specColor = specular * lightCol * (isNight < 0.5 ? 1.0 : 0.6);

    // Wave Crest Foam (scaled by distortion)
    float foam = smoothstep(0.82, 1.35, waveData.y) * 0.45 * distortion;

    // Final Water Composition
    vec3 finalWater = mix(waterBaseColor, skyReflect, fresnel) + specColor + vec3(foam);

    #ifdef TONEMAPPING
    vec3 linear = srgbToLinear(finalWater);
    linear *= cameraParams.y;
    finalWater = linearToSrgb(tonemap(linear));
    #endif

    float finalAlpha = mat.color.a * alphaFade;
    outColor = vec4(finalWater, finalAlpha);
}
