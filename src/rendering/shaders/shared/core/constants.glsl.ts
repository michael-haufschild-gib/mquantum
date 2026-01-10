export const constantsBlock = `
// Performance constants
// High quality mode (when idle)
#define MAX_MARCH_STEPS_HQ 128
#define MAX_ITER_HQ 256
#define SURF_DIST_HQ 0.002

// Low quality mode (during animation)
#define MAX_MARCH_STEPS_LQ 64
#define MAX_ITER_LQ 30
#define SURF_DIST_LQ 0.002

#define BOUND_R 2.0

// Standardized epsilon values for numerical stability
// Use the appropriate epsilon for each context:
#define EPS 1e-6                    // General floating point comparison
#define EPS_POSITION 1e-6           // Position/direction normalization guards
#define EPS_DIVISION 0.0001         // Division-by-zero guards
#define EPS_UV 0.001                // UV coordinate/radius guards
#define EPS_WEIGHT 0.001            // Blend weight/density guards

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
