struct FrameUniforms {
    lightCounts: vec4<u8>,
}

#define pointLightCount frameUniforms.lightCounts.x
#define spotLightCount frameUniforms.lightCounts.y
#define sunLightCount frameUniforms.lightCounts.z

struct ViewUniforms {
    cameraParams: array<vec4<f32>, NUM_VIEWS>, /* fov (rad), exposure, near, far */
    viewport: array<vec4<i32>, NUM_VIEWS>,
    worldToView: array<array<vec4<f32>, 2>, NUM_VIEWS>,
    viewToWorld: array<array<vec4<f32>, 2>, NUM_VIEWS>,
    viewPositionWorld: array<vec4<f32>, NUM_VIEWS>,
    projectionMatrix: array<mat4x4<f32>, NUM_VIEWS>,
    inverseProjectionMatrix: array<mat4x4<f32>, NUM_VIEWS>,
}

#define cameraParams viewUniforms.cameraParams[drawUniforms.viewIndex]
#define viewport viewUniforms.viewport[drawUniforms.viewIndex]
#define worldToView viewUniforms.worldToView[drawUniforms.viewIndex]
#define viewToWorld viewUniforms.viewToWorld[drawUniforms.viewIndex]
#define viewPositionWorld viewUniforms.viewPositionWorld[drawUniforms.viewIndex]
#define projectionMatrix viewUniforms.projectionMatrix[drawUniforms.viewIndex]
#define inverseProjectionMatrix viewUniforms.inverseProjectionMatrix[drawUniforms.viewIndex]

#ifndef CUSTOM_DRAW_UNIFORMS
struct DrawUniforms {
    viewIndex: u32,
    drawIndex: u32,
    materialIndex: u32,
}
#endif

@group(0) @binding(0) var<uniform> frameUniforms: FrameUniforms;

@group(1) @binding(0) var<uniform> viewUniforms: ViewUniforms;
@group(1) @binding(1) var<uniform> drawUniforms: DrawUniforms;
