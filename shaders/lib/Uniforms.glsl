uniform FrameUniforms {
    lowp uvec4 textureCounts;
    lowp uvec4 lightCounts;
};

#define textureCount textureCounts.x
#define pointLightCount lightCounts.x
#define spotLightCount lightCounts.y
#define sunLightCount lightCounts.z

uniform ViewUniforms {
    highp vec4 viewCameraParams[NUM_VIEWS]; /* fov (rad), exposure, near, far */
    highp ivec4 viewViewport[NUM_VIEWS];
    highp mat2x4 viewWorldToView[NUM_VIEWS];
    highp mat2x4 viewViewToWorld[NUM_VIEWS];
    highp vec3 viewWorldPosition[NUM_VIEWS];
    highp mat4 viewProjectionMatrix[NUM_VIEWS];
    highp mat4 viewInverseProjectionMatrix[NUM_VIEWS];
};

#define cameraParams viewCameraParams[viewIndex]
#define viewport viewViewport[viewIndex]
#define worldToView viewWorldToView[viewIndex]
#define viewToWorld viewViewToWorld[viewIndex]
#define viewPositionWorld viewWorldPosition[viewIndex]
#define projectionMatrix viewProjectionMatrix[viewIndex]
#define inverseProjectionMatrix viewInverseProjectionMatrix[viewIndex]

uniform highp sampler2D transformations;

uniform uint viewIndex;
#ifdef USE_DRAW_INDEX
uniform uint drawIndex;
#endif

#ifdef USE_MATERIAL_INDEX
uniform mediump uint material;
#endif
