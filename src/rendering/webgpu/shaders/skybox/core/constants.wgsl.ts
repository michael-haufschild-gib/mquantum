/**
 * Skybox constants for WGSL.
 *
 * The `MODE_*` constants this block used to export (CLASSIC, AURORA,
 * NEBULA, VOID, CRYSTALLINE, HORIZON, OCEAN, TWILIGHT, STARFIELD) were
 * dead: `composeSkyboxFragmentShader` selects the active mode block via a
 * TypeScript `switch` at compile time, so each generated skybox shader
 * only ever contains its own mode's code and never dispatches on a
 * uniform-valued mode. Nothing across the codebase referenced those
 * constants. Removed to avoid giving readers the false impression that
 * there is a runtime mode dispatch.
 */
export const constantsBlock = `
// --- Constants ---
const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
`
