/**
 * Volume raymarching block.
 *
 * Re-exports the volume raymarch function used by all inline volumetric paths.
 * Historically there were two variants (fast + HQ) selected by quality multiplier;
 * the fast variant produced visible artifacts (e.g. hydrogen lobe collapse) and
 * was removed alongside the progressive-refinement system.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl
 */

import { volumeRaymarchHQBlock } from './volumeRaymarchHQ.wgsl'

/**
 * Volume raymarching block. Single source of truth — no fast/HQ split.
 */
export const volumeRaymarchBlock: string = volumeRaymarchHQBlock
