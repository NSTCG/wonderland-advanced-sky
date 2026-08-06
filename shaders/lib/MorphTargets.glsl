uniform highp usampler2D morphTargetBounds;
uniform highp sampler2DArray morphTargets;
uniform highp sampler2D morphTargetWeights;

#define PIXELS_PER_TARGETS_ROW_MASK 1023
#define PIXELS_PER_TARGETS_ROW_LOG2 10

#define PIXELS_PER_WEIGHTS_ROW_MASK 511
#define PIXELS_PER_WEIGHTS_ROW_LOG2 9

#ifdef NORMAL
void applyMorphTargets(int objectId, inout vec3 position, inout vec3 normal) {
#else
void applyMorphTargets(int objectId, inout vec3 position) {
#endif
    highp uvec4 morphTargetBoundsData = texelFetch(morphTargetBounds, ivec2(objectId, 0), 0);
    uint vertexOffset = morphTargetBoundsData.x;
    uint vertexCount = morphTargetBoundsData.y;
    uint morphTargetSetIndex = (morphTargetBoundsData.z >> 16u) & 0xFFFFu;
    uint morphTargetCount = morphTargetBoundsData.z & 0xFFFFU;
    uint weightOffset = morphTargetBoundsData.w;

    const uint STRIDE = 2u;

    if(morphTargetSetIndex == 0u) {
        return;
    }

    uint vertexId = uint(gl_VertexID) - vertexOffset;
    for(uint i = 0u; i < morphTargetCount; i++) {
        ivec2 weightTexel = ivec2(
            int(weightOffset + i) & PIXELS_PER_WEIGHTS_ROW_MASK,
            int(weightOffset + i) >> PIXELS_PER_WEIGHTS_ROW_LOG2
        );
        float weight = texelFetch(morphTargetWeights, weightTexel, 0).r;
        if(weight == 0.0) continue;

        /* Offset position */
        {
            ivec3 texel = ivec3(
                int(vertexId + (i*STRIDE)*vertexCount) & PIXELS_PER_TARGETS_ROW_MASK,
                int(vertexId + (i*STRIDE)*vertexCount) >> PIXELS_PER_TARGETS_ROW_LOG2,
                int(morphTargetSetIndex));
            vec4 morphOffset = texelFetch(morphTargets, texel, 0);
            position += morphOffset.xyz*weight;
        }

        /* Offset normal */
        #ifdef NORMAL
        {
            ivec3 texel = ivec3(
                int(vertexId + (i*STRIDE+1u)*vertexCount) & PIXELS_PER_TARGETS_ROW_MASK,
                int(vertexId + (i*STRIDE+1u)*vertexCount) >> PIXELS_PER_TARGETS_ROW_LOG2,
                int(morphTargetSetIndex));
            vec4 morphOffset = texelFetch(morphTargets, texel, 0);
            normal += morphOffset.xyz*weight;
        }
        #endif
    }
}
