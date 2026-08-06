#define FEATURE_TEXTURED
#define FEATURE_TONEMAPPING

#ifdef TEXTURED
#define USE_TEXTURE_COORDS
#endif

#define USE_MATERIAL_ID
#define USE_POSITION_WORLD
#define USE_NORMAL_WORLD

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

@fragment
fn main(
    @location(0) fragPositionWorld: vec3<f32>,
    @location(1) fragNormalWorld: vec3<f32>,
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
        lightDir = normalize(-lightDirectionsWorld[0]);
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

    let uv = texUV * 12.0;
    let uv1 = uv + vec2<f32>(animTime * 0.18, animTime * 0.12);
    let uv2 = uv * 2.2 - vec2<f32>(animTime * 0.14, animTime * 0.22);

    let h1 = skyNoise2D(uv1);
    let h2 = skyNoise2D(uv2);
    let h1x = skyNoise2D(uv1 + vec2<f32>(0.05, 0.0));
    let h1y = skyNoise2D(uv1 + vec2<f32>(0.0, 0.05));
    let h2x = skyNoise2D(uv2 + vec2<f32>(0.05, 0.0));
    let h2y = skyNoise2D(uv2 + vec2<f32>(0.0, 0.05));

    let waveGrad = vec2<f32>((h1x - h1) + (h2x - h2) * 0.5, (h1y - h1) + (h2y - h2) * 0.5) * 4.0;
    let localNormal = normalize(vec3<f32>(-waveGrad.x, 1.0, -waveGrad.y));

    let worldNorm = normalize(fragNormalWorld);
    var tangent = normalize(cross(worldNorm, vec3<f32>(0.0, 0.0, 1.0)));
    if (length(tangent) < 0.1) {
        tangent = normalize(cross(worldNorm, vec3<f32>(1.0, 0.0, 0.0)));
    }
    let bitangent = cross(worldNorm, tangent);
    let bumpNormal = normalize(tangent * localNormal.x + worldNorm * localNormal.y + bitangent * localNormal.z);

    let viewDir = normalize(viewPositionWorld - fragPositionWorld);
    let reflectDir = reflect(-viewDir, bumpNormal);

    let NdotV = max(0.0, dot(bumpNormal, viewDir));
    let fresnel = pow(1.0 - NdotV, 3.5) * 0.75 + 0.15;

    var deepWaterColor: vec3<f32>;
    var shallowWaterColor: vec3<f32>;

    if (isNight < 0.5) {
        let sunCos = dot(lightDir, vec3<f32>(0.0, 1.0, 0.0));
        if (sunCos < 0.25) {
            deepWaterColor = mix(vec3<f32>(0.08, 0.04, 0.20), vec3<f32>(0.02, 0.15, 0.35), sunCos / 0.25);
            shallowWaterColor = mix(vec3<f32>(0.85, 0.35, 0.15), vec3<f32>(0.12, 0.60, 0.75), sunCos / 0.25);
        } else {
            deepWaterColor = vec3<f32>(0.02, 0.12, 0.32);
            shallowWaterColor = vec3<f32>(0.10, 0.58, 0.75);
        }
    } else {
        deepWaterColor = vec3<f32>(0.01, 0.03, 0.12);
        shallowWaterColor = vec3<f32>(0.04, 0.15, 0.38);
    }

    var waterBaseColor = mix(deepWaterColor, shallowWaterColor, (1.0 - NdotV) * 0.6);
#ifdef TEXTURED
    waterBaseColor *= textureAtlas(mat.flatTexture, texUV).rgb;
#endif
    waterBaseColor *= vec3<f32>(mat.color.rgb);

    let skyReflect = evaluateAtmosphericSkyFast(reflectDir, lightDir, lightCol, isNight, animTime);

    let halfVec = normalize(lightDir + viewDir);
    let NdotH = max(0.0, dot(bumpNormal, halfVec));
    let specular = pow(NdotH, 128.0) * 2.0 + pow(NdotH, 16.0) * 0.4;
    let specColor = specular * lightCol;

    let foam = smoothstep(0.72, 0.90, (h1 + h2 * 0.5)) * 0.4;
    var finalWater = mix(waterBaseColor, skyReflect, fresnel) + specColor + vec3<f32>(foam);

    #ifdef TONEMAPPING
    var linear = srgbToLinear3(finalWater);
    linear *= cameraParams.y;
    finalWater = linearToSrgb3(tonemap(linear));
    #endif

    return vec4<f32>(finalWater, f32(mat.color.a));
}
