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
 * @param dir The **normalized** coordinate to project
 * @returns The 2D projected direction
 */
fn cartesianToEquirectangularSymmetrical(dir: vec3<f32>) -> vec2<f32> {
    let u = atan2(dir.x, -dir.z)*RECIPROCAL_PI2;
    let v = asin(dir.y)*RECIPROCAL_PI;
    return vec2<f32>(u, v);
}

/**
 * Overload of `cartesianToEquirectangularUnnormalized` with normalization
 */
fn cartesianToEquirectangular(dir: vec3<f32>) -> vec2<f32> {
    return cartesianToEquirectangularSymmetrical(dir) + vec2<f32>(0.5);
}
