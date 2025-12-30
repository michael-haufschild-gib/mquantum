export const constantsBlock = `
// Performance constants
// High quality mode (when idle)
#define MAX_MARCH_STEPS_HQ 128
#define MAX_ITER_HQ 256
#define SURF_DIST_HQ 0.002

// Low quality mode (during animation)
#define MAX_MARCH_STEPS_LQ 64
#define MAX_ITER_LQ 32
#define SURF_DIST_LQ 0.004

#define BOUND_R 2.0
#define EPS 1e-6

#define PI 3.14159265359
#define HALF_PI 1.57079632679
#define TAU 6.28318530718

// Multi-Light System Constants
#define MAX_LIGHTS 4
#define LIGHT_TYPE_POINT 0
#define LIGHT_TYPE_DIRECTIONAL 1
#define LIGHT_TYPE_SPOT 2

// Palette modes
#define PAL_MONO 0
#define PAL_ANALOG 1
#define PAL_COMP 2
#define PAL_TRIAD 3
#define PAL_SPLIT 4
`
