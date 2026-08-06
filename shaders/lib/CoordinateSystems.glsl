/*
 * Helpers to convert between coordinates system.
 *
 * Dependencies:
 *     - Math.glsl
 */

/**
 * This method performs an equirectangular projection, i.e.,
 * projects a 3D cartesian direction on a 2D cartesian coordinate system
 *
 * **Note**: The resulting coordinates are in the range [-0.5; 0.5].
 * Please use the `cartesianToEquirectangular` for coordinates in the
 * range [0.0; 1.0].
 *
 * This methods projects the coordinates into:
 * [                Top                 ]
 * [ Back | Left | Front | Right | Back ]
 * [               Bottom               ]
 *
 * following the WebGL convention, i.e.,
 * - Front: -z
 * - Right: +x
 *
 * @param dir The **normalized** coordinates to project
 * @returns The 2D projected direction
 */
vec2 cartesianToEquirectangularSymmetrical(vec3 dir) {
    float u = atan(dir.x, -dir.z)*RECIPROCAL_PI2;
    float v = asin(dir.y)*RECIPROCAL_PI;
    return vec2(u, v);
}

/**
 * Overload of `cartesianToEquirectangularUnnormalized` with normalization
 */
vec2 cartesianToEquirectangular(vec3 dir) {
    return cartesianToEquirectangularSymmetrical(dir) + vec2(0.5);
}

/**
 * Converts equirectangular UVs into a 3D vector
 *
 * @note This is the reciprocal call to @ref cartesianToEquirectangular().
 *
 * @param uv Equirectangular UVs
 */
vec3 equirectangularToCartesian(vec2 uv) {
    /* Equirect to spherical */
    float phi = uv.x*2.0*PI;
    float theta = uv.y*PI;
    float sinTheta = sin(theta);
    /* Spherical to cartesian */
    vec3 dir = vec3(-sin(phi)*sinTheta, -cos(theta), cos(phi)*sinTheta);
    return normalize(dir);
}
