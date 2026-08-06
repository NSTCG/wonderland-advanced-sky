@group(0) @binding(4) var morphTargetBounds: texture_2d<u32>;
@group(0) @binding(5) var morphTargets: texture_2d_array<f32>;
@group(0) @binding(6) var morphTargetWeights: texture_2d<f32>;

#define PIXELS_PER_TARGETS_ROW_MASK 1023
#define PIXELS_PER_TARGETS_ROW_LOG2 10

#define PIXELS_PER_WEIGHTS_ROW_MASK 511
#define PIXELS_PER_WEIGHTS_ROW_LOG2 9

const STRIDE: u32 = 2u;

fn applyMorphTargets(objectId: i32, inVertexId: u32, t: Transform) -> Transform {
    let morphTargetBoundsData: vec4<u32> = textureLoad(morphTargetBounds, vec2<i32>(objectId, 0), 0);
    let vertexOffset: u32 = morphTargetBoundsData.x;
    let vertexCount: u32 = morphTargetBoundsData.y;
    let morphTargetSetIndex: u32 = u32(morphTargetBoundsData.z >> 16u) & 0xFFFFu;
    let morphTargetCount: u32 = morphTargetBoundsData.z & 0xFFFFu;
    let weightOffset: u32 = morphTargetBoundsData.w;

    if(morphTargetSetIndex == 0u) {
        return t;
    }

    let vertexId = inVertexId - vertexOffset;
    var i = 0u;
    var res = Transform(
        t.position,
    #ifdef TANGENT
        t.tangent,
    #endif
    #ifdef NORMAL
        t.normal,
    #endif
    );
    for(; i < morphTargetCount; i++) {
        let weightTexel = vec2<i32>(
            i32(weightOffset + i) & PIXELS_PER_WEIGHTS_ROW_MASK,
            i32(weightOffset + i) >> PIXELS_PER_WEIGHTS_ROW_LOG2
        );
        let weight: f32 = textureLoad(morphTargetWeights, weightTexel, 0).r;
        if(weight == 0.0) {
            continue;
        }

        /* Offset position */
        {
            let texel = vec3<i32>(
                i32(vertexId + (i*STRIDE)*vertexCount) & PIXELS_PER_TARGETS_ROW_MASK,
                i32(vertexId + (i*STRIDE)*vertexCount) >> PIXELS_PER_TARGETS_ROW_LOG2,
                i32(morphTargetSetIndex));
            let morphOffset: vec4<f32> = textureLoad(morphTargets, texel.xy, texel.z, 0);
            res.position += morphOffset.xyz*weight;
        }

        /* Offset normal */
        #ifdef NORMAL
        {
            let texel = vec3<i32>(
                i32(vertexId + (i*STRIDE+1u)*vertexCount) & PIXELS_PER_TARGETS_ROW_MASK,
                i32(vertexId + (i*STRIDE+1u)*vertexCount) >> PIXELS_PER_TARGETS_ROW_LOG2,
                i32(morphTargetSetIndex));
            let morphOffset: vec4<f32> = textureLoad(morphTargets, texel.xy, texel.z, 0);
            res.normal += morphOffset.xyz*weight;
        }
        #endif
    }
    return res;
}
