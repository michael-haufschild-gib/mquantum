/**
 * Shared N-D indexing helpers for free scalar field compute shaders.
 * Provides conversion between linear buffer indices and N-D lattice coordinates
 * using stride tables and loops over 0..latticeDim.
 *
 * @module
 */

export const freeScalarNDIndexBlock = /* wgsl */ `
// Convert N-D lattice coordinates to linear buffer index using stride table
fn ndToLinear(coords: array<u32, 12>, strides: array<u32, 12>, dim: u32) -> u32 {
  var idx: u32 = 0u;
  for (var d: u32 = 0u; d < dim; d++) {
    idx += coords[d] * strides[d];
  }
  return idx;
}

// Convert linear buffer index to N-D lattice coordinates via successive
// division-and-remainder on precomputed strides (C-order, largest stride first).
// Note: gridSize is passed for call-site consistency but unused by the algorithm.
fn linearToND(idx: u32, strides: array<u32, 12>, gridSize: array<u32, 12>, dim: u32) -> array<u32, 12> {
  var coords: array<u32, 12>;
  var remaining = idx;
  for (var d: u32 = 0u; d < dim; d++) {
    let s = strides[d];
    coords[d] = remaining / s;
    remaining = remaining % s;
  }
  return coords;
}

`
