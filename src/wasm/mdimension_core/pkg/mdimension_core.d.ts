/* tslint:disable */
/* eslint-disable */

/**
 * Composes multiple rotations from plane names and angles.
 *
 * # Arguments
 * * `dimension` - The dimensionality of the space
 * * `plane_names` - Array of plane names (e.g., ["XY", "XW", "ZW"])
 * * `angles` - Array of rotation angles in radians (same length as plane_names)
 *
 * # Returns
 * Flat rotation matrix (dimension × dimension) as Float64Array
 */
export function compose_rotations_wasm(dimension: number, plane_names: string[], angles: Float64Array): Float64Array;

/**
 * Computes the dot product of two vectors
 *
 * # Arguments
 * * `a` - First vector
 * * `b` - Second vector
 *
 * # Returns
 * The scalar dot product
 */
export function dot_product_wasm(a: Float64Array, b: Float64Array): number;

/**
 * Computes the magnitude (length) of a vector
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * The magnitude of the vector
 */
export function magnitude_wasm(v: Float64Array): number;

/**
 * Multiplies two square matrices: C = A × B
 *
 * # Arguments
 * * `a` - First matrix (n×n, row-major)
 * * `b` - Second matrix (n×n, row-major)
 * * `dimension` - Matrix dimension
 *
 * # Returns
 * Result matrix (n×n, row-major)
 */
export function multiply_matrices_wasm(a: Float64Array, b: Float64Array, dimension: number): Float64Array;

/**
 * Multiplies a matrix by a vector.
 *
 * # Arguments
 * * `matrix` - Flat n×n matrix (row-major)
 * * `vector` - Input vector of length n
 * * `dimension` - Matrix/vector dimension
 *
 * # Returns
 * Result vector of length n
 */
export function multiply_matrix_vector_wasm(matrix: Float64Array, vector: Float64Array, dimension: number): Float64Array;

/**
 * Normalizes a vector to unit length
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * Unit vector in the same direction
 */
export function normalize_vector_wasm(v: Float64Array): Float64Array;

/**
 * Projects edge pairs to 3D positions for LineSegments2 geometry.
 *
 * # Arguments
 * * `flat_vertices` - Flat array of vertex coordinates
 * * `dimension` - Dimensionality of each vertex
 * * `flat_edges` - Flat array of edge indices [start0, end0, start1, end1, ...]
 * * `projection_distance` - Distance from projection plane
 *
 * # Returns
 * Flat array of edge positions [e0_x1, e0_y1, e0_z1, e0_x2, e0_y2, e0_z2, ...]
 */
export function project_edges_wasm(flat_vertices: Float64Array, dimension: number, flat_edges: Uint32Array, projection_distance: number): Float32Array;

/**
 * Projects n-dimensional vertices to 3D positions using perspective projection.
 *
 * # Arguments
 * * `flat_vertices` - Flat array of vertex coordinates
 * * `dimension` - Dimensionality of each vertex
 * * `projection_distance` - Distance from projection plane
 *
 * # Returns
 * Flat array of 3D positions as Float32Array [x0, y0, z0, x1, y1, z1, ...]
 */
export function project_vertices_wasm(flat_vertices: Float64Array, dimension: number, projection_distance: number): Float32Array;

export function start(): void;

/**
 * Subtracts two vectors element-wise: c = a - b
 *
 * # Arguments
 * * `a` - First vector
 * * `b` - Second vector
 *
 * # Returns
 * The difference vector
 */
export function subtract_vectors_wasm(a: Float64Array, b: Float64Array): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly compose_rotations_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly dot_product_wasm: (a: number, b: number, c: number, d: number) => number;
  readonly magnitude_wasm: (a: number, b: number) => number;
  readonly multiply_matrices_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly multiply_matrix_vector_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly normalize_vector_wasm: (a: number, b: number, c: number) => void;
  readonly project_edges_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly project_vertices_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly subtract_vectors_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly start: () => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
