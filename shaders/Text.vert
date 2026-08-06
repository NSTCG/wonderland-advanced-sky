#ifdef WEBGL
#ifdef MULTIDRAW
#extension GL_ANGLE_multi_draw : require
#endif
#endif

precision highp float;
precision highp int;

#define SHADER_TYPE_TEXT

#include "lib/Quaternion.glsl"
#include "lib/Slug.vert.glsl"

/* Position and normal are split in two for compatibility with Magnum shaders */
layout(location = 0) in vec2 inPosition;
layout(location = 2) in mediump vec4 inColor;
#ifndef MULTIDRAW
layout(location = 4) in mediump uint inObjectId;
#endif
layout(location = 11) in vec2 inNormal;
layout(location = 12) in vec4 inSlugTextureCoordinates;
layout(location = 13) in vec4 inSlugJacobian;
layout(location = 14) in vec4 inSlugBanding;

out mediump vec4 fragColor;
out vec2 fragTextureCoords;
flat out vec4 fragBanding;
flat out ivec4 fragGlyph;
flat out mediump uint fragMaterialId;

#include "lib/Uniforms.glsl"

void main() {
    fragColor = inColor;

    #ifdef MULTIDRAW
    uint objectId = uint(gl_DrawID);
    #else
    uint objectId = inObjectId;
    #endif

    ivec2 idx = 2*ivec2(int(objectId) & OBJECTS_PER_ROW_MASK, int(objectId >> OBJECTS_PER_ROW_LOG2));
    highp vec4 transform[2] = vec4[](
        texelFetchOffset(transformations, idx, 0, ivec2(0, 0)),
        texelFetchOffset(transformations, idx, 0, ivec2(1, 0)));
    highp vec4 scaling =
        texelFetchOffset(transformations, idx, 0, ivec2(0, 1));
    fragMaterialId = uint(scaling.w);

    /* SlugDilate() expects a transposed model-view-projection matrix. We can't
     * pre-transform position and normal to world-space because Slug expects
     * them packed into a vec4. So convert the dual quats to matrices instead.
     * @todo If this turns out to be a performance issue, consider:
     * - sending matrices instead of dual quats
     * - rewriting SlugDilate() to use dual quats (might be even slower) */
    mat4 modelMatrix = mat4(quat_toMatrix(transform[0]));
    modelMatrix[0] *= scaling[0];
    modelMatrix[1] *= scaling[1];
    modelMatrix[2] *= scaling[2];
    modelMatrix[3].xyz = quat_translation(Quat2(transform[0], transform[1]));

    mat4 viewMatrix = mat4(quat_toMatrix(worldToView[0]));
    viewMatrix[3].xyz = quat_translation(Quat2(worldToView[0], worldToView[1]));

    /* Add constant NDC depth offset towards the camera for non-outline
     * vertices. We use alpha to distinguish text (= 1) and outline (= 0). By
     * going through the projection matrix we avoid using glPolygonOffset (and
     * multiple draw calls) or modifying gl_FragDepth, both of which can
     * negatively impact performance.
     * Derivation: http://terathon.com/gdc07_lengyel.pdf
     * 2.0 factor: https://aras-p.info/blog/2008/06/12/depth-bias-and-the-power-of-deceiving-yourself/ */
    /**
     * @todo We need more fine-grained offsetting for layered glyphs (emoji).
     * Instead of 255 = epsilon, this should be one alpha per layer. We then
     * have to patch the vertex data to a) detect layers and b) set alpha for
     * layer X (out of ?). */
    mat4 offsetProjectionMatrix = projectionMatrix;
    float depthOffset = inColor.a*2.0*4.8e-7;
    #ifdef REVERSE_Z
    /**
     * @todo We can use a smaller offset with reverse-Z since we use a float32
     * depth buffer in range 0-1
     */
    offsetProjectionMatrix[2][2] -= depthOffset;
    #else
    offsetProjectionMatrix[2][2] += depthOffset;
    #endif

    mat4 mvp = offsetProjectionMatrix*viewMatrix*modelMatrix;
    mat4 mvpTransposed = transpose(mvp);

    vec4 slugPositionNormal = vec4(inPosition, inNormal);

    vec2 pos;
    fragTextureCoords = SlugDilate(slugPositionNormal, inSlugTextureCoordinates, inSlugJacobian,
        mvpTransposed[0], mvpTransposed[1], mvpTransposed[3],
        vec2(viewport.zw), pos);

    gl_Position = pos.x*mvp[0] + pos.y*mvp[1] + mvp[3];

    SlugUnpack(inSlugTextureCoordinates, inSlugBanding, fragBanding, fragGlyph);
}
