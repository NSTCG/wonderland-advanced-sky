#include "lib/Compatibility.wgsl"
#define SHADER_TYPE_TEXT

#include "lib/Quaternion.wgsl"
#include "lib/Slug.vert.wgsl"

struct VertexOutput {
    #ifdef PRE_Z_PASS
    @invariant
    #endif
    @builtin(position) Position: vec4<f32>,
    @location(0) fragTextureCoords: vec2<f32>,
    @location(1) fragColor: vec4<f16>,
    @location(2) @interpolate(flat) fragBanding: vec4<f32>,
    @location(3) @interpolate(flat) fragGlyph: vec4<i32>,
    @location(4) @interpolate(flat) fragMaterialId: u16,
}

#include "lib/Uniforms.wgsl"

@group(2) @binding(0) var transformations: texture_2d<f32>;

@vertex
fn main(
    /* Position and normal are split in two for compatibility with Magnum shaders */
    @location(0) inPosition: vec2<f32>,
    @location(2) inColor: vec4<f16>,
    @location(4) inObjectId: u16,
    @location(11) inNormal: vec2<f32>,
    @location(12) inSlugTextureCoordinates: vec4<f32>,
    @location(13) inSlugJacobian: vec4<f32>,
    @location(14) inSlugBanding: vec4<f32>,
) -> VertexOutput {
    var output: VertexOutput;

    output.fragColor = inColor;

    let objectId: u32 = inObjectId;

    let idx = 2*vec2<i32>((i32(objectId)) & OBJECTS_PER_ROW_MASK, i32(objectId >> u32(OBJECTS_PER_ROW_LOG2)));
    let transform = array<vec4<f32>, 2>(
        textureLoad(transformations, idx + vec2<i32>(0, 0), 0),
        textureLoad(transformations, idx + vec2<i32>(1, 0), 0));
    let scaling =
        textureLoad(transformations, idx + vec2<i32>(0, 1), 0);
    output.fragMaterialId = u32(scaling.w);

    /* SlugDilate() expects a transposed model-view-projection matrix. We can't
     * pre-transform position and normal to world-space because Slug expects
     * them packed into a vec4. So convert the dual quats to matrices instead.
     * @todo If this turns out to be a performance issue, consider:
     * - sending matrices instead of dual quats
     * - rewriting SlugDilate() to use dual quats (might be even slower) */
    var modelMatrix: mat4x4<f32> = quat_toMatrix_4x4(transform[0]);
    modelMatrix[0] = modelMatrix[0]*scaling[0];
    modelMatrix[1] = modelMatrix[1]*scaling[1];
    modelMatrix[2] = modelMatrix[2]*scaling[2];
    modelMatrix[3] = vec4<f32>(quat_translation(Quat2(transform[0], transform[1])), modelMatrix[3].w);

    var viewMatrix: mat4x4<f32> = quat_toMatrix_4x4(worldToView[0]);
    viewMatrix[3] = vec4<f32>(quat_translation(Quat2(worldToView[0], worldToView[1])), viewMatrix[3].w);

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
    var offsetProjectionMatrix: mat4x4<f32> = projectionMatrix;
    let depthOffset: f32 = inColor.a*2.0*0.00000048; /* 4.8e-7 */
    #ifdef REVERSE_Z
    /**
     * @todo We can use a smaller offset with reverse-Z since we use a float32
     * depth buffer in range 0-1
     */
    offsetProjectionMatrix[2][2] = offsetProjectionMatrix[2][2] - depthOffset;
    #else
    offsetProjectionMatrix[2][2] = offsetProjectionMatrix[2][2] + depthOffset;
    #endif

    let mvp: mat4x4<f32> = offsetProjectionMatrix*viewMatrix*modelMatrix;
    let mvpTransposed: mat4x4<f32> = transpose(mvp);

    let slugPositionNormal: vec4<f32> = vec4<f32>(inPosition, inNormal);

    var pos: vec2<f32>;
    output.fragTextureCoords = SlugDilate(slugPositionNormal, inSlugTextureCoordinates, inSlugJacobian,
        mvpTransposed[0], mvpTransposed[1], mvpTransposed[3],
        vec2<f32>(viewport.zw), &pos);

    output.Position = pos.x*mvp[0] + pos.y*mvp[1] + mvp[3];

    var fragBanding: vec4<f32>;
    var fragGlyph: vec4<i32>;
    SlugUnpack(inSlugTextureCoordinates, inSlugBanding, &fragBanding, &fragGlyph);
    output.fragBanding = fragBanding;
    output.fragGlyph = fragGlyph;

    return output;
}
