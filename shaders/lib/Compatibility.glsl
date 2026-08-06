precision highp float;
precision highp int;

out mediump vec4 outColor;

/* Backward compatibility with pre-0.9.0 */
#define viewTransform worldToView

#define numPointLights pointLightCount
#define numSpotLights spotLightCount
#define numSunLights sunLightCount
