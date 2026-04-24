/**
 * Shared N-D indexing helpers for free scalar field compute shaders.
 * Provides conversion between linear buffer indices and N-D lattice coordinates
 * using stride tables and loops over 0..latticeDim.
 *
 * Exports both a raw template literal (legacy string-concat consumers) and
 * a `ShaderBlock` wrapper for `assembleShaderBlocks()` composition.
 *
 * @module
 */

import type { ShaderBlock } from '../../shared/compose-helpers'

export const freeScalarNDIndexBlock = /* wgsl */ `
// Convert N-D lattice coordinates to linear buffer index using stride table
fn ndToLinear(coords: array<u32, 12>, strides: array<u32, 12>, dim: u32) -> u32 {
  var idx: u32 = 0u;
  for (var d: u32 = 0u; d < dim; d++) {
    idx += coords[d] * strides[d];
  }
  return idx;
}

// Convert linear buffer index to N-D lattice coordinates. Compute-lattice grid
// sizes are snapped to powers of two via sanitizeGridSizes, so the derived
// strides used here are powers of two; a runtime u32 divide becomes one shift
// and one mask — ~20× cheaper on every backend we target.
// Note: gridSize is passed for call-site consistency but unused by the algorithm.
fn linearToND(idx: u32, strides: array<u32, 12>, gridSize: array<u32, 12>, dim: u32) -> array<u32, 12> {
  var coords: array<u32, 12>;
  var remaining = idx;
  for (var d: u32 = 0u; d < dim; d = d + 1u) {
    let s = strides[d];
    let logS = firstTrailingBit(s); // log2(s); s==1 → 0; s==0 is not a valid stride.
    coords[d] = remaining >> logS;
    remaining = remaining & (s - 1u);
  }
  return coords;
}

`

/** N-D indexing helpers as a ShaderBlock. */
export const freeScalarNDIndexShaderBlock: ShaderBlock = {
  name: 'free-scalar-nd-index',
  content: freeScalarNDIndexBlock,
}
