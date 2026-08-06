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
    normal: vec3<f32>,
#ifdef USE_TANGENT
    tangent: vec3<f32>,
    bitangent: vec3<f32>,
#endif
}

/**
 * Create surface data from raw shader inputs
 *
 * **Note**: This method automatically performs normal flipping
 * for double-sided rendering.
 *
 * @param fragNormal The un-normalized surface normal
 * @returns A struct containing surface data
 */
fn computeSurfaceDataNormal(fragNormal: vec3<f32>) -> SurfaceData {
    var surface: SurfaceData;
    let frontFacing: f32 = 1.0;
    surface.normal = normalize(fragNormal*frontFacing);
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
fn computeSurfaceData(fragNormal: vec3<f32>, fragTangent: vec4<f32>) -> SurfaceData {
    let frontFacing: f32 = 1.0;
    let flip: f32 = frontFacing;
    var surface: SurfaceData;
    surface.normal = normalize(fragNormal*flip);
    surface.tangent = normalize(fragTangent.xyz*flip);
    surface.bitangent = normalize(cross(surface.normal, surface.tangent)*flip*fragTangent.w);
    return surface;
}

#ifdef NORMAL_MAPPING

/**
 * Perturb the given normal using the Normal Mapping technique
 *
 * @param surface Surface vectors
 * @param normalTexture Index of the normal texture
 * @param textureCoords Fragment texture coordinates
 * @returns Perturbed and normalized normal
 */
fn normalMapping(surface: SurfaceData, normalTexture: u16, textureCoords: vec2<f32>) -> vec3<f32> {
    if(normalTexture > 0u) {
        let tbn: mat3x3<f32> = mat3x3<f32>(surface.tangent, surface.bitangent, surface.normal);
        return tbn*normalize(textureAtlas(normalTexture, textureCoords).rgb*2.0 - vec3<f32>(1.0));
    }
    return surface.normal;
}

#endif

#endif
