/**
 * Ultra-Realistic Procedural Water Shader (WGSL)
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

#include "lib/Compatibility.wgsl"

#define USE_MATERIAL_INDEX
#include "lib/Uniforms.wgsl"
#include "lib/Inputs.wgsl"
#include "lib/Color.wgsl"

#ifdef TEXTURED
#include "lib/Textures.wgsl"
#endif
#include "lib/Packing.wgsl"
#include "lib/Materials.wgsl"
#include "lib/Lights.wgsl"
#include "lib/SkyProcedural.wgsl"

struct Material {
    color: vec4<f16>,
#ifdef TEXTURED
    flatTexture: u32,
#endif
};

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
}

fn computeOceanWave(pos: vec2<f32>, t: f32) -> vec3<f32> {
    let p1 = pos * 0.8 + vec2<f32>(t * 0.45, t * 0.30);
    let p2 = pos * 1.8 - vec2<f32>(t * 0.35, t * 0.50);
    let p3 = pos * 4.2 + vec2<f32>(t * 0.70, -t * 0.40);
    let p4 = pos * 9.5 - vec2<f32>(t * 1.10, t * 0.80);

    let h1 = skyNoise2D(p1);
    let h2 = skyNoise2D(p2) * 0.5;
    let h3 = skyNoise2D(p3) * 0.25;
    let h4 = skyNoise2D(p4) * 0.12;

    let waveH = h1 + h2 + h3 + h4;

    let eps = vec2<f32>(0.04, 0.0);
    let h1x = skyNoise2D(p1 + eps * 0.8);
    let h2x = skyNoise2D(p2 + eps * 1.8) * 0.5;
    let h3x = skyNoise2D(p3 + eps * 4.2) * 0.25;

    let h1y = skyNoise2D(p1 + eps.yx * 0.8);
    let h2y = skyNoise2D(p2 + eps.yx * 1.8) * 0.5;
    let h3y = skyNoise2D(p3 + eps.yx * 4.2) * 0.25;

    let hx = h1x + h2x + h3x;
    let hy = h1y + h2y + h3y;

    let grad = vec2<f32>(hx - (h1 + h2 + h3), hy - (h1 + h2 + h3)) * 6.0;
    return vec3<f32>(grad.x, waveH, grad.y);
}

@fragment
fn main(
    @location(0) fragPositionWorld: vec3<f32>,
    @location(1) fragNormal: vec3<f32>,
#ifdef TEXTURED
    @location(2) fragTextureCoords: vec2<f32>,
#endif
) -> @location(0) vec4<f32> {
    let mat: Material = decodeMaterial(drawUniforms.materialIndex);

    // Super smooth 20x gradual radial alpha falloff: Center = (0,0,0), Radius = 30.0
    let waterCenter = vec3<f32>(0.0, 0.0, 0.0);
    let waterRadius: f32 = 30.0;
    let distToCenter = length(fragPositionWorld.xz - waterCenter.xz);
    let normDist = clamp(distToCenter / waterRadius, 0.0, 1.0);
    let alphaFade = pow(cos(normDist * 1.5707963), 1.6);
    if (alphaFade <= 0.0001) {
        discard;
    }

    var animTime: f32 = 0.0;
    var isNight: f32 = 0.0;
    var lightDir = vec3<f32>(0.0, 1.0, 0.5);
    var lightCol = vec3<f32>(1.0);

    #if NUM_LIGHTS > 0
    let lightPos = lightPositionsWorld[0];
    animTime = lightPos.y;
    isNight = select(0.0, 1.0, lightPos.x >= 0.5);
    if (length(lightDirectionsWorld[0]) > 0.01) {
        lightDir = normalize(lightDirectionsWorld[0]);
    } else if (length(lightPos) > 0.01) {
        lightDir = normalize(lightPos);
    }
    lightCol = lightColors[0].rgb * max(0.1, lightColors[0].a);
    #endif

#ifdef TEXTURED
    let texUV = fragTextureCoords;
#else
    let texUV = fragPositionWorld.xz;
#endif

    let waveData = computeOceanWave(texUV * 1.5, animTime);
    let localNormal = normalize(vec3<f32>(-waveData.x, 1.0, -waveData.z));

    let worldNorm = select(vec3<f32>(0.0, 1.0, 0.0), normalize(fragNormal), length(fragNormal) > 0.001);
    var tangent = normalize(cross(worldNorm, vec3<f32>(0.0, 0.0, 1.0)));
    if (length(tangent) < 0.1) {
        tangent = normalize(cross(worldNorm, vec3<f32>(1.0, 0.0, 0.0)));
    }
    let bitangent = cross(worldNorm, tangent);
    let bumpNormal = normalize(tangent * localNormal.x + worldNorm * localNormal.y + bitangent * localNormal.z);

    let viewDir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(viewPositionWorld - fragPositionWorld), length(viewPositionWorld - fragPositionWorld) > 0.001);
    let reflectDir = reflect(-viewDir, bumpNormal);

    let NdotV = max(0.0, dot(bumpNormal, viewDir));
    let fresnel = pow(1.0 - NdotV, 4.0) * 0.85 + 0.10;

    let sunCos = clamp(dot(lightDir, vec3<f32>(0.0, 1.0, 0.0)), 0.0, 1.0);
    let sss = pow(max(0.0, dot(viewDir, -lightDir + bumpNormal * 0.5)), 4.0) * bumpNormal.y * 0.6;
    let sssColor = select(mix(vec3<f32>(0.05, 0.55, 0.45), vec3<f32>(0.9, 0.4, 0.2), 1.0 - sunCos), vec3<f32>(0.02, 0.25, 0.45), isNight >= 0.5);

    var deepWaterColor: vec3<f32>;
    var shallowWaterColor: vec3<f32>;

    if (isNight < 0.5) {
        if (sunCos < 0.25) {
            let t = sunCos / 0.25;
            deepWaterColor = mix(vec3<f32>(0.06, 0.03, 0.18), vec3<f32>(0.01, 0.08, 0.22), t);
            shallowWaterColor = mix(vec3<f32>(0.85, 0.32, 0.12), vec3<f32>(0.05, 0.45, 0.55), t);
        } else {
            deepWaterColor = vec3<f32>(0.01, 0.08, 0.22);
            shallowWaterColor = vec3<f32>(0.05, 0.45, 0.55);
        }
    } else {
        deepWaterColor = vec3<f32>(0.005, 0.015, 0.06);
        shallowWaterColor = vec3<f32>(0.02, 0.18, 0.35);
    }

    var waterBaseColor = mix(deepWaterColor, shallowWaterColor, (1.0 - NdotV) * 0.7) + sss * sssColor;
#ifdef TEXTURED
    waterBaseColor *= textureAtlas(mat.flatTexture, texUV).rgb;
#endif
    waterBaseColor *= vec3<f32>(mat.color.rgb);

    let skyReflect = evaluateAtmosphericSkyFast(reflectDir, lightDir, lightCol, isNight, animTime);

    let halfVec = normalize(lightDir + viewDir);
    let NdotH = max(0.0, dot(bumpNormal, halfVec));
    let specular = pow(NdotH, 256.0) * 4.5 + pow(NdotH, 24.0) * 0.7;
    let specColor = specular * lightCol * select(1.0, 0.6, isNight >= 0.5);

    let foam = smoothstep(0.82, 1.35, waveData.y) * 0.45;
    var finalWater = mix(waterBaseColor, skyReflect, fresnel) + specColor + vec3<f32>(foam);

    #ifdef TONEMAPPING
    var linear = srgbToLinear3(finalWater);
    linear *= cameraParams.y;
    finalWater = linearToSrgb3(tonemap(linear));
    #endif

    let finalAlpha = f32(mat.color.a) * alphaFade;
    return vec4<f32>(finalWater, finalAlpha);
}
