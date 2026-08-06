/* WGSL doesn't currently provide a notion of precision for integer types, there only is i32 and u32
 * The following are a factice way to retain the initial information of the precision from our GLSL shaders */
#define i8 i32
#define i16 i32
#define u8 u32
#define u16 u32
#define f8 f32

/** @todo Investigate usage of half-precision extension */
#define f16 f32

/* Backward compatibility with pre-0.9.0 */
#define viewTransform worldToView

#define numPointLights pointLightCount
#define numSpotLights spotLightCount
#define numSunLights sunLightCount

fn inversesqrt(f: f32) -> f32 {
    return 1.0 / sqrt(f);
}
