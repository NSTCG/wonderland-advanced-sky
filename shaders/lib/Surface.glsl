/*
 * Set of functions dedicated to transformations of normals.
 *
 * Dependencies:
 *     - Textures.glsl (if using NORMAL_MAPPING)
 */

/**
 * Contains the data used to shade a surface, i.e.,
 *     - Normal
 *     - Tangent (Optional)
 *     - Bitangent (Optional)
 */
struct SurfaceData {
    mediump vec3 normal;
#ifdef USE_TANGENT
    mediump vec3 tangent;
    mediump vec3 bitangent;
#endif
};

/**
 * Create surface data from raw shader inputs
 *
 * **Note**: This method automatically performs normal flipping
 * for double-sided rendering.
 *
 * @param fragNormal The un-normalized surface normal
 * @returns A struct containing surface data
 */
SurfaceData computeSurfaceData(mediump vec3 fragNormal) {
    SurfaceData surface;
    surface.normal = normalize(fragNormal*(gl_FrontFacing ? 1.0 : -1.0));
    return surface;
}

#ifdef USE_TANGENT

/**
 * Create surface data from raw shader inputs
 *
 * **Note**: This method automatically performs normal flipping
 * for double-sided rendering.
 *
 * @param fragNormal The un-normalized surface normal
 * @param fragTangent The un-normalized surface tangent
 * @returns A struct containing surface data
 */
SurfaceData computeSurfaceData(mediump vec3 fragNormal, mediump vec4 fragTangent) {
    mediump float flip = gl_FrontFacing ? 1.0 : -1.0;
    SurfaceData surface;
    surface.normal = normalize(fragNormal*flip);
    surface.tangent = normalize(fragTangent.xyz*flip);
    surface.bitangent = normalize(flip*fragTangent.w*cross(surface.normal, surface.tangent));
    return surface;
}

#ifdef NORMAL_MAPPING

/**
 * Perturb the given normal using the Normal Mapping technique
 *
 * @param normal The normal to the surface
 * @param tangent The tangent to the surface
 * @param bitangent The bitangent to the surface
 * @param normalTexture The index of the normal texture
 * @param textureCoords The fragment texture coordinates
 * @returns The perturbed and normalized normal
 */
vec3 normalMapping(mediump vec3 normal, mediump vec3 tangent,
    mediump vec3 bitangent, mediump uint normalTexture, vec2 textureCoords) {
    if(normalTexture > 0u) {
        mediump mat3 tbn = mat3(tangent, bitangent, normal);
        normal = tbn*(normalize((textureAtlas(normalTexture, textureCoords).rgb*2.0 - vec3(1.0))));
    }
    return normal;
}

/**
 * @overload
 *
 * @param surface The surface input
 * @param normalTexture The index of the normal texture
 * @param textureCoords The fragment texture coordinates
 * @returns The perturbed and normalized normal
 */
vec3 normalMapping(SurfaceData surface, mediump uint normalTexture, vec2 textureCoords) {
    return normalMapping(surface.normal, surface.tangent, surface.bitangent, normalTexture, textureCoords);
}

/**
 * @overload
 * @deprecated
 *
 * @param surface The surface input
 * @param normalTexture The index of the normal texture
 * @returns The perturbed and normalized normal
 */
vec3 normalMapping(SurfaceData surface, mediump uint normalTexture) {
    return normalMapping(surface.normal, surface.tangent, surface.bitangent, normalTexture, fragTextureCoords);
}

#endif

#endif
