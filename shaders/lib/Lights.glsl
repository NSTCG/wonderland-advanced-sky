#ifndef LIGHTS_GLSL
#define LIGHTS_GLSL

/**
 * Calculate fog blend factor, equivalent to GL fixed function fog mode GL_EXP2
 *
 * @param dist Distance to fragment in eye coordinates
 * @param density Fog density
 * returns Fog factor, clamped to 0-1
 */
float fogBlendFactor(float dist, float density) {
    /* e^(-d²), rewritten to use exp2 for performance: 2^(-d²log2(e)) */
    const float LOG2 = -1.442695;
    float d = density * dist;
    return 1.0 - clamp(exp2(d*d*LOG2), 0.0, 1.0);
}

#ifdef SSAO
uniform mediump sampler2D ambientOcclusion;
#endif

#if NUM_LIGHTS > 0

uniform Lights {
    highp vec3 lightPositionsWorld[NUM_LIGHTS];
    highp vec3 lightDirectionsWorld[NUM_LIGHTS];
    /* R, G, B, intensity */
    mediump vec4 lightColors[NUM_LIGHTS];
    /* outerAngle, innerAngle, shadows, shadowIndex */
    highp vec4 lightParameters[NUM_LIGHTS];
};

mediump float distanceAttenuation(mediump float distanceSquared, mediump float intensity) {
    #ifdef DEPRECATED_LIGHT_ATTENUATION
    return 1.0/(1.0 + distanceSquared/intensity*0.3333);
    #else
    /* Prevent attenuation blowing up near 0 by pretending lights are bulbs
     * with radius 5cm */
    return intensity/max(distanceSquared, 0.0025);
    #endif
}

float spotAttenuation(vec3 l, vec3 direction, float coneCos, float penumbraCos) {
    float angleCos = dot(l, direction);
    if (angleCos > coneCos) {
        return smoothstep(coneCos, penumbraCos, angleCos);
    } else {
        return 0.0;
    }
}

#if NUM_SHADOWS > 0
uniform Shadows {
    highp mat4 shadowMatrices[NUM_SHADOWS];
    highp vec4 shadowParameters[NUM_SHADOWS];
    highp vec4 shadowSplits[NUM_SHADOWS];
    highp mat2x4 shadowLightView[NUM_SHADOWS];
    highp mat4 shadowLightProj[NUM_SHADOWS];
};
uniform mediump sampler2DArrayShadow shadowAtlas;

#ifdef SHADOW_PCF
const vec2 poissonDisk[4] = vec2[](
    vec2(-0.94201624, -0.39906216),
    vec2(0.94558609, -0.76890725),
    vec2(-0.094184101, -0.92938870),
    vec2(0.34495938, 0.29387760));
#endif

/* Not a function to avoid potential slow emulated path for dynamically indexed
 * matrices/vectors. Chrome explicitly warns about this. */
#define matrixRow(mat, i) vec4(mat[0][i], mat[1][i], mat[2][i], mat[3][i])

vec4 shadowCoord(int index, vec3 position, vec3 normal, vec3 toLight, float shadowMapTexelSize) {
    float shadowNormalOffset = shadowParameters[index].y;
    mat4 shadowViewProj = shadowMatrices[index];

    float normalOffsetScale = shadowNormalOffset*shadowMapTexelSize;
    #ifdef FEATURE_SHADOW_NORMAL_OFFSET_SLOPE_SCALE
    float cosLightAngle = dot(toLight, normal);
    normalOffsetScale *= clamp(1.0 - cosLightAngle, 0.0, 1.0);
    #endif
    vec3 shadowOffset = normal*normalOffsetScale;
    vec3 shadowFragPositionWorld = position + shadowOffset;
    #ifdef FEATURE_SHADOW_NORMAL_OFFSET_UV_ONLY
    vec4 row0 = matrixRow(shadowViewProj, 0);
    vec4 row1 = matrixRow(shadowViewProj, 1);
    vec4 row2 = matrixRow(shadowViewProj, 2);
    vec4 row3 = matrixRow(shadowViewProj, 3);
    vec4 coord = vec4(dot(row0.xyz, shadowFragPositionWorld) + row0.w,
        dot(row1.xyz, shadowFragPositionWorld) + row1.w,
        dot(row2.xyz, position) + row2.w,
        dot(row3.xyz, position) + row3.w);
    #else
    vec4 coord = shadowViewProj * vec4(shadowFragPositionWorld, 1.0);
    #endif

    return coord;
}

vec3 shadowCoordOrtho(int index, vec3 position, vec3 normal, vec3 toLight) {
    float shadowBias = shadowParameters[index].x;
    float shadowMapTexelSize = shadowParameters[index].z;
    vec4 coord = shadowCoord(index, position, normal, toLight, shadowMapTexelSize);
    return vec3(coord.xy, (coord.z - shadowBias));
}

vec3 shadowCoordPerspective(int index, vec3 position, vec3 normal, vec3 toLight) {
    float shadowBias = shadowParameters[index].x;
    float shadowMapTexelSize = shadowParameters[index].z;

    #ifdef SHADOW_NORMAL_OFFSET_SCALE_BY_SHADOW_DEPTH
    vec3 positionLightView = quat2_transformPoint(
        Quat2(shadowLightView[index][0], shadowLightView[index][1]), position);
    float shadowFOVFactor = max(shadowLightProj[index][0].x, shadowLightProj[index][1].y);
    shadowMapTexelSize *= abs(positionLightView.z) * shadowFOVFactor;
    #endif

    vec4 coord = shadowCoord(index, position, normal, toLight, shadowMapTexelSize);
    return vec3(coord.xy/coord.w, clamp((coord.z - shadowBias)/coord.w, 0.0, 1.0));
}

float sampleShadowOrtho(int index, vec3 position, vec3 normal, vec3 toLight) {
    vec3 coord = shadowCoordOrtho(index, position, normal, toLight);
    #ifdef SHADOW_PCF
    float shadow = 0.0;
    vec2 texelSize = 1.0/vec2(textureSize(shadowAtlas, 0).xy);
    for(int i = 0; i < 4; ++i) {
            shadow += texture(shadowAtlas, vec4(coord.xy + poissonDisk[i]*texelSize,
                float(index), coord.z));
    }
    return shadow / 4.0;
    #else
    return texture(shadowAtlas, vec4(coord.xy, float(index), coord.z));
    #endif
}
#ifdef USE_POSITION_WORLD
/** @deprecated */
float sampleShadowOrtho(int index, vec3 normal, vec3 toLight) {
    return sampleShadowOrtho(index, fragPositionWorld, normal, toLight);
}
#endif

float sampleShadowPerspective(int index, vec3 position, vec3 normal, vec3 toLight) {
    vec3 coord = shadowCoordPerspective(index, position, normal, toLight);
    return texture(shadowAtlas, vec4(coord.xy, float(index), coord.z));
}
#ifdef USE_POSITION_WORLD
/** @deprecated */
float sampleShadowPerspective(int index, vec3 normal, vec3 toLight) {
    return sampleShadowPerspective(index, fragPositionWorld, normal, toLight);
}
#endif

float sampleShadowParaboloid(int index, vec3 position) {
    float shadowBias = shadowParameters[index].x;
    float shadowNear = shadowParameters[index].z;
    float shadowFar = shadowParameters[index].w;
    vec3 coord = (shadowMatrices[index] * vec4(position, 1.0)).xyz;

    /* shadowMatrix is simply the view matrix for paraboloid point lights,
     * no projection part, so do it manually */
    highp float dist = length(coord);
    coord /= dist;
    coord.xy /= 1.0 - coord.z;
    coord.xy = coord.xy * 0.5 + 0.5;
    coord.z = (dist - shadowNear) / (shadowFar - shadowNear);
    #ifdef REVERSE_Z
    coord.z = 1.0 - coord.z;
    #endif

    coord.z = clamp(coord.z - shadowBias, 0.0, 1.0);

    return texture(shadowAtlas, vec4(coord.xy, float(index), coord.z));
}
#ifdef USE_POSITION_WORLD
/** @deprecated */
float sampleShadowParaboloid(int index) {
    return sampleShadowParaboloid(index, fragPositionWorld);
}
#endif

int selectCascade(int shadow, float w) {
    int count = int(shadowParameters[shadow].w);
    vec4 comparison = vec4(greaterThan(vec4(w), shadowSplits[shadow]));
    float findex = dot(vec4(float(count > 0), float(count > 1), float(count > 2), float(count > 3)), comparison);
    int cascade = int(findex);
    return cascade > (count - 1) ? -1 : cascade;
}
#endif

#endif

#endif // LIGHTS_GLSL
