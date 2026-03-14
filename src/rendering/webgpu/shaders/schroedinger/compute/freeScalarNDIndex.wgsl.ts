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

// Convert linear buffer index to N-D lattice coordinates using stride table
// Uses the same first-axis-fastest convention as ndToLinear: strides[0]=1.
fn linearToND(idx: u32, strides: array<u32, 12>, gridSize: array<u32, 12>, dim: u32) -> array<u32, 12> {
  var coords: array<u32, 12>;
  var remaining = idx;
  for (var d: i32 = i32(dim) - 1; d >= 0; d--) {
    let ud = u32(d);
    coords[ud] = remaining / strides[ud];
    remaining = remaining % strides[ud];
  }
  return coords;
}

// Periodic boundary wrap for a single coordinate
fn wrapCoord(coord: i32, size: u32) -> u32 {
  return u32((coord + i32(size)) % i32(size));
}
`
