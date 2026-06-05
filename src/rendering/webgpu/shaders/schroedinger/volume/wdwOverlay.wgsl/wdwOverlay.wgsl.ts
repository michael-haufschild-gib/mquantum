/**
 * Wheeler-DeWitt overlay helpers shared by grid raymarch variants.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/wdwOverlay.wgsl
 */

export const wdwOverlayBlock = /* wgsl */ `
const WDW_OVERLAY_ALPHA_FLOOR: f32 = 0.08;
const WDW_OVERLAY_ALPHA_CEIL: f32 = 0.35;
const WDW_OVERLAY_VISIBLE_EPS: f32 = 0.001;

fn sharpenWdwOverlayAlpha(rawAlpha: f32) -> f32 {
  return smoothstep(
    WDW_OVERLAY_ALPHA_FLOOR,
    WDW_OVERLAY_ALPHA_CEIL,
    clamp(rawAlpha, 0.0, 1.0)
  );
}
`
