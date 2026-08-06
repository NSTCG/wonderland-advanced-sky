/**
 * Realistic Terrain & Underwater Depth Fog Shader (WGSL)
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
    uvScale: vec2<f32>,
    causticsIntensity: f32,
    fogDensity: f32,
#ifdef TEXTURED
    flatTexture: u32,
#ifdef NORMAL_MAPPING
    normalTexture: u32,
#endif
#endif
};

fn decodeMaterial(matIndex: u32) -> Material {
    {{decoder}}
    return mat;
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

    let scaleX = select(1.0, mat.uvScale.x, mat.uvScale.x > 0.001);
    let scaleY = select(1.0, mat.uvScale.y, mat.uvScale.y > 0.001);
    let scaleUV = vec2<f32>(scaleX, scaleY);

#ifdef TEXTURED
    let texUV = fragTextureCoords * scaleUV;
#else
    let texUV = fragPositionWorld.xz * scaleUV * 0.02;
#endif

    let worldNorm = select(vec3<f32>(0.0, 1.0, 0.0), normalize(fragNormal), length(fragNormal) > 0.001);
    var bumpNormal = worldNorm;

#ifdef NORMAL_MAPPING
#ifdef TEXTURED
    if (mat.normalTexture > 0u) {
        let wiggleUV1 = texUV + vec2<f32>(animTime * 0.08, animTime * 0.05);
        let wiggleUV2 = texUV * 1.5 - vec2<f32>(animTime * 0.06, animTime * 0.09);

        let nMap1 = textureAtlas(mat.normalTexture, wiggleUV1).rgb * 2.0 - 1.0;
        let nMap2 = textureAtlas(mat.normalTexture, wiggleUV2).rgb * 2.0 - 1.0;
        let nMapCombined = normalize(nMap1 + nMap2);

        var tangent = normalize(cross(worldNorm, vec3<f32>(0.0, 0.0, 1.0)));
        if (length(tangent) < 0.1) {
            tangent = normalize(cross(worldNorm, vec3<f32>(1.0, 0.0, 0.0)));
        }
        let bitangent = cross(worldNorm, tangent);
        bumpNormal = normalize(tangent * nMapCombined.x + worldNorm * 1.0 + bitangent * nMapCombined.y);
    }
#endif
#endif

    let detailNoise = skyNoise2D(fragPositionWorld.xz * 0.25) * 0.5 + 0.5;
    let microGrain = skyNoise2D(fragPositionWorld.xz * 3.0) * 0.2 + 0.8;

    let heightY = fragPositionWorld.y;
    let slope = 1.0 - bumpNormal.y;

    let sandColor = vec3<f32>(0.76, 0.70, 0.50) * (0.85 + 0.3 * detailNoise) * microGrain;
    let grassColor = vec3<f32>(0.18, 0.42, 0.15) * (0.8 + 0.4 * detailNoise) * microGrain;
    let rockColor = vec3<f32>(0.35, 0.33, 0.32) * (0.75 + 0.5 * detailNoise) * microGrain;
    let snowColor = vec3<f32>(0.92, 0.95, 0.98) * (0.9 + 0.2 * detailNoise);

    var terrainBaseColor: vec3<f32>;
    var specularIntensity: f32 = 0.0;
    var specularPower: f32 = 16.0;

    if (heightY < 0.0) {
        let rawDepth = clamp(-heightY / 40.0, 0.0, 1.0);
        let depthFactor = rawDepth * rawDepth * (3.0 - 2.0 * rawDepth);

        let shallowBed = mix(sandColor, rockColor, clamp(slope * 2.0, 0.0, 1.0));
        let deepDarkBlue = select(vec3<f32>(0.01, 0.04, 0.12), vec3<f32>(0.001, 0.004, 0.015), isNight >= 0.5);
        terrainBaseColor = mix(shallowBed, deepDarkBlue, depthFactor * 0.85);

        let cIntensity = select(1.0, mat.causticsIntensity, mat.causticsIntensity > 0.001);
        let cUV1 = fragPositionWorld.xz * 0.25 + vec2<f32>(animTime * 0.45, animTime * 0.30);
        let cUV2 = fragPositionWorld.xz * 0.35 - vec2<f32>(animTime * 0.35, animTime * 0.50);
        let caustics = pow(skyNoise2D(cUV1) * skyNoise2D(cUV2), 1.6) * 3.0 * (1.0 - depthFactor * 0.7);

        let causticColor = select(vec3<f32>(0.4, 0.85, 0.95), vec3<f32>(0.1, 0.3, 0.6), isNight >= 0.5);
        terrainBaseColor += caustics * causticColor * cIntensity * max(0.2, bumpNormal.y);
    } else {
        if (heightY < 3.0) {
            let t = heightY / 3.0;
            terrainBaseColor = mix(sandColor, grassColor, t);
            specularIntensity = (1.0 - t) * 0.35;
            specularPower = 48.0;
        } else if (heightY < 18.0) {
            let t = (heightY - 3.0) / 15.0;
            terrainBaseColor = mix(grassColor, rockColor, t);
        } else {
            let t = clamp((heightY - 18.0) / 12.0, 0.0, 1.0);
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
    terrainBaseColor *= vec3<f32>(mat.color.rgb);

    let viewVec = viewPositionWorld - fragPositionWorld;
    let viewDist = length(viewVec);
    let viewDir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(-viewVec), viewDist > 0.001);

    let NdotL = max(0.12, dot(bumpNormal, lightDir));
    var finalTerrain = terrainBaseColor * lightCol * NdotL;

    if (specularIntensity > 0.01) {
        let halfVec = normalize(lightDir + viewDir);
        let NdotH = max(0.0, dot(bumpNormal, halfVec));
        let spec = pow(NdotH, specularPower) * specularIntensity;
        finalTerrain += lightCol * spec;
    }

    if (heightY < 0.0 || viewPositionWorld.y < 0.0) {
        let uFog = clamp(1.0 - exp(-viewDist * 0.008), 0.0, 0.95);
        let deepDarkBlue = select(vec3<f32>(0.01, 0.04, 0.12), vec3<f32>(0.001, 0.004, 0.015), isNight >= 0.5);
        finalTerrain = mix(finalTerrain, deepDarkBlue, uFog);
    } else {
        let fogDist = max(0.0, viewDist - 250.0);
        let heightFactor = exp(-max(0.0, fragPositionWorld.y) * 0.02);
        let density = select(0.0012, mat.fogDensity, mat.fogDensity > 0.001);
        let atmFog = clamp(1.0 - exp(-pow(fogDist * density * heightFactor, 1.35)), 0.0, 1.0);

        let skyColor = evaluateAtmosphericSkyFast(viewDir, lightDir, lightCol, isNight, animTime);
        finalTerrain = mix(finalTerrain, skyColor, atmFog);
    }

    #ifdef TONEMAPPING
    var linear = srgbToLinear3(finalTerrain);
    linear *= cameraParams.y;
    finalTerrain = linearToSrgb3(tonemap(linear));
    #endif

    return vec4<f32>(finalTerrain, f32(mat.color.a));
}
