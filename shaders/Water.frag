#include "lib/Compatibility.glsl"

#define FEATURE_TEXTURED
#define FEATURE_TONEMAPPING

#ifdef TEXTURED
#define USE_TEXTURE_COORDS
#endif

#define USE_MATERIAL_ID
#define USE_POSITION_WORLD
#define USE_NORMAL_WORLD
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

void main() {
    Material mat = decodeMaterial(fragMaterialId);

    // Default time & light fallbacks
    float animTime = 0.0;
    float isNight = 0.0;
    vec3 lightDir = vec3(0.0, 1.0, 0.5);
    vec3 lightCol = vec3(1.0);

    #if NUM_LIGHTS > 0
    vec3 lightPos = lightPositionsWorld[0];
    animTime = lightPos.y;
    isNight = lightPos.x >= 0.5 ? 1.0 : 0.0;
    if (length(lightDirectionsWorld[0]) > 0.01) {
        lightDir = normalize(-lightDirectionsWorld[0]);
    } else if (length(lightPos) > 0.01) {
        lightDir = normalize(lightPos);
    }
    lightCol = lightColors[0].rgb * max(0.1, lightColors[0].a);
    #endif

    // Procedural scrolling noise normal map
    vec2 uv = fragTextureCoords * 12.0;
    vec2 uv1 = uv + vec2(animTime * 0.18, animTime * 0.12);
    vec2 uv2 = uv * 2.2 - vec2(animTime * 0.14, animTime * 0.22);

    float h1 = skyNoise2D(uv1);
    float h2 = skyNoise2D(uv2);
    float h1x = skyNoise2D(uv1 + vec2(0.05, 0.0));
    float h1y = skyNoise2D(uv1 + vec2(0.0, 0.05));
    float h2x = skyNoise2D(uv2 + vec2(0.05, 0.0));
    float h2y = skyNoise2D(uv2 + vec2(0.0, 0.05));

    vec2 waveGrad = vec2((h1x - h1) + (h2x - h2) * 0.5, (h1y - h1) + (h2y - h2) * 0.5) * 4.0;
    vec3 localNormal = normalize(vec3(-waveGrad.x, 1.0, -waveGrad.y));

    vec3 worldNorm = normalize(fragNormalWorld);
    vec3 tangent = normalize(cross(worldNorm, vec3(0.0, 0.0, 1.0)));
    if (length(tangent) < 0.1) tangent = normalize(cross(worldNorm, vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = cross(worldNorm, tangent);
    mat3 tbn = mat3(tangent, worldNorm, bitangent);
    vec3 bumpNormal = normalize(tbn * localNormal);

    // View direction & reflection
    vec3 viewDir = normalize(viewPositionWorld - fragPositionWorld);
    vec3 reflectDir = reflect(-viewDir, bumpNormal);

    float NdotV = max(0.0, dot(bumpNormal, viewDir));
    float fresnel = pow(1.0 - NdotV, 3.5) * 0.75 + 0.15;

    // Dynamic water colors (Deep vs Shallow)
    vec3 deepWaterColor;
    vec3 shallowWaterColor;

    if (isNight < 0.5) {
        float sunCos = dot(lightDir, vec3(0.0, 1.0, 0.0));
        if (sunCos < 0.25) {
            // Sunset warm ocean palette
            deepWaterColor = mix(vec3(0.08, 0.04, 0.20), vec3(0.02, 0.15, 0.35), sunCos / 0.25);
            shallowWaterColor = mix(vec3(0.85, 0.35, 0.15), vec3(0.12, 0.60, 0.75), sunCos / 0.25);
        } else {
            deepWaterColor = vec3(0.02, 0.12, 0.32);
            shallowWaterColor = vec3(0.10, 0.58, 0.75);
        }
    } else {
        // Night deep blue water
        deepWaterColor = vec3(0.01, 0.03, 0.12);
        shallowWaterColor = vec3(0.04, 0.15, 0.38);
    }

    vec3 waterBaseColor = mix(deepWaterColor, shallowWaterColor, (1.0 - NdotV) * 0.6);
    #ifdef TEXTURED
    waterBaseColor *= textureAtlas(mat.flatTexture, fragTextureCoords).rgb;
    #endif
    waterBaseColor *= mat.color.rgb;

    // Dynamic Sky Reflection
    vec3 skyReflect = evaluateAtmosphericSkyFast(reflectDir, lightDir, lightCol, isNight, animTime);

    // Sun / Moon Specular Reflection Highlight
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(bumpNormal, halfVec));
    float specular = pow(NdotH, 128.0) * 2.0 + pow(NdotH, 16.0) * 0.4;
    vec3 specColor = specular * lightCol;

    // Foam at crests
    float foam = smoothstep(0.72, 0.90, (h1 + h2 * 0.5)) * 0.4;
    vec3 finalWater = mix(waterBaseColor, skyReflect, fresnel) + specColor + vec3(foam);

    #ifdef TONEMAPPING
    vec3 linear = srgbToLinear(finalWater);
    linear *= cameraParams.y;
    finalWater = linearToSrgb(tonemap(linear));
    #endif

    outColor = vec4(finalWater, mat.color.a);
}
