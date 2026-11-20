/* @ts-self-types="./mdimension_core.d.ts" */

/**
 * Complex matrix multiply: C = A × B for N×N matrices.
 *
 * # Arguments
 * * `a_re`, `a_im` - Left matrix (N×N, row-major)
 * * `b_re`, `b_im` - Right matrix (N×N, row-major)
 * * `n` - Matrix dimension
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(N*N), im_flat(N*N)]`
 * @param {Float64Array | number[]} a_re
 * @param {Float64Array | number[]} a_im
 * @param {Float64Array | number[]} b_re
 * @param {Float64Array | number[]} b_im
 * @param {number} n
 * @returns {Float64Array}
 */
export function complex_mat_mul_wasm(a_re, a_im, b_re, b_im, n) {
    const val5 = +n;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passArrayF64ToWasm0(a_re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(a_im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF64ToWasm0(b_re, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArrayF64ToWasm0(b_im, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 8, 8); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 8, 8); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.complex_mat_mul_wasm(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val5);
    var v6 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v6;
}

/**
 * Composes multiple rotations from flattened plane indices and angles.
 *
 * # Arguments
 * * `dimension` - The dimensionality of the space
 * * `plane_indices` - Flattened plane pairs [i0, j0, i1, j1, ...]
 * * `angles` - Rotation angles in radians
 * * `rotation_count` - Number of active rotations in the buffers
 *
 * # Returns
 * Flat rotation matrix (dimension × dimension) as Float64Array
 * @param {number} dimension
 * @param {Uint32Array | number[]} plane_indices
 * @param {Float64Array | number[]} angles
 * @param {number} rotation_count
 * @returns {Float64Array}
 */
export function compose_rotations_indexed_wasm(dimension, plane_indices, angles, rotation_count) {
    const val3 = +dimension;
    const val4 = +rotation_count;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArray32ToWasm0(plane_indices, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(angles, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compose_rotations_indexed_wasm(val3, ptr0, len0, ptr1, len1, val4);
    var v5 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v5;
}

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
 * @param {number} dimension
 * @param {string[]} plane_names
 * @param {Float64Array | number[]} angles
 * @returns {Float64Array}
 */
export function compose_rotations_wasm(dimension, plane_names, angles) {
    const val3 = +dimension;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayJsValueToWasm0(plane_names, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(angles, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__externref_drop_slice(ptr0, len0); wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compose_rotations_wasm(val3, ptr0, len0, ptr1, len1);
    var v4 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v4;
}

/**
 * Full Gaussian measurement collapse.
 *
 * Matches `src/lib/physics/measurement.ts::computeFullCollapse`. Returns a
 * packed `Float32Array` of length `2 · total_sites` where the first half is
 * `ψ_re` and the second is `ψ_im` (which is identically zero for a full
 * collapse — included so the JS caller unpacks symmetrically with the
 * partial-collapse ABI).
 *
 * # Arguments
 * * `grid_size` - Per-axis lattice sizes (`Uint32Array`, length = `latticeDim`)
 * * `spacing` - Per-axis spacing (`Float64Array`, length = `latticeDim`)
 * * `center` - Measurement center in world units (length = `latticeDim`)
 * * `sigma` - Gaussian width
 * * `compact_dims` - Optional per-axis periodicity flags (0/1). Pass empty
 *   slice for fully-open boundaries.
 *
 * # Returns
 * Packed `Float32Array`, or empty on shape mismatch.
 * @param {Uint32Array | number[]} grid_size
 * @param {Float64Array | number[]} spacing
 * @param {Float64Array | number[]} center
 * @param {number} sigma
 * @param {Uint8Array | number[]} compact_dims
 * @returns {Float32Array}
 */
export function compute_full_collapse_wasm(grid_size, spacing, center, sigma, compact_dims) {
    const val5 = +sigma;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passArray32ToWasm0(grid_size, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(spacing, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArrayF64ToWasm0(center, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray8ToWasm0(compact_dims, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 8, 8); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compute_full_collapse_wasm(ptr0, len0, ptr1, len1, ptr2, len2, val5, ptr3, len3);
    var v6 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v6;
}

/**
 * Compute the BEC incompressible kinetic-energy spectrum E_incomp(k).
 *
 * Velocity-field finite differences + N-D FFT (via `fft::fft_nd`) +
 * Helmholtz projection + log-spaced shell binning of the Nore/Bradley
 * superfluid decomposition.  All steps run entirely in Rust; the JS
 * caller invokes this single WASM entry point and unpacks the result.
 *
 * # Arguments
 * * `psi_re` / `psi_im` — split wavefunction components (Float32,
 *   length = product(grid_size)).
 * * `grid_size` — per-axis lattice sizes.
 * * `spacing` — per-axis lattice spacing.
 * * `hbar`, `mass` — physical constants.
 *
 * # Returns
 * Packed `Vec<f64>` of length `2 · NUM_SPECTRUM_BINS + 2`:
 *   - `[0..N)` = spectrum (Float32-precision signal, returned as f64)
 *   - `[N..2N)` = k-value bin centers
 *   - `[2N]` = total incompressible kinetic energy
 *   - `[2N+1]` = total compressible kinetic energy
 * Empty vector on invalid input.
 * @param {Float32Array | number[]} psi_re
 * @param {Float32Array | number[]} psi_im
 * @param {Uint32Array | number[]} grid_size
 * @param {Float64Array | number[]} spacing
 * @param {number} hbar
 * @param {number} mass
 * @returns {Float64Array}
 */
export function compute_incompressible_spectrum_wasm(psi_re, psi_im, grid_size, spacing, hbar, mass) {
    const val5 = +hbar;
    const val6 = +mass;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passArrayF32ToWasm0(psi_re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(psi_im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray32ToWasm0(grid_size, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArrayF64ToWasm0(spacing, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 8, 8); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compute_incompressible_spectrum_wasm(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val5, val6);
    var v7 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v7;
}

/**
 * Compute the joint reduced density matrix for a set of dimensions.
 *
 * # Arguments
 * * `psi_re` - Real part of wavefunction (Float32Array)
 * * `psi_im` - Imaginary part of wavefunction (Float32Array)
 * * `grid_size` - Grid dimensions
 * * `kept_dims` - Strictly increasing indices of dimensions to keep
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(M*M), im_flat(M*M)]` where `M = Π kept dims`.
 * Empty on invalid input or `M > 1024`.
 * @param {Float32Array | number[]} psi_re
 * @param {Float32Array | number[]} psi_im
 * @param {Uint32Array | number[]} grid_size
 * @param {Uint32Array | number[]} kept_dims
 * @returns {Float64Array}
 */
export function compute_joint_rdm_wasm(psi_re, psi_im, grid_size, kept_dims) {
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passArrayF32ToWasm0(psi_re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(psi_im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray32ToWasm0(grid_size, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArray32ToWasm0(kept_dims, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 4, 4); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compute_joint_rdm_wasm(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    var v5 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v5;
}

/**
 * Compute level spacing statistics from energy eigenvalues.
 *
 * # Arguments
 * * `energies` - Eigenvalue array
 *
 * # Returns
 * Packed `Float64Array`: `[spacings..., brody_beta, mean_spacing, classification_code]`
 * Classification codes: 0 = poisson, 1 = intermediate, 2 = wigner-dyson, 3 = undetermined
 * @param {Float64Array | number[]} energies
 * @returns {Float64Array}
 */
export function compute_level_spacing_wasm(energies) {
    const ptr0 = passArrayF64ToWasm0(energies, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_level_spacing_wasm(ptr0, len0);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

/**
 * Partial axis-aligned measurement collapse.
 *
 * Matches `src/lib/physics/measurement.ts::computePartialCollapse`. Returns
 * packed `[re..., im...]` of length `2 · total_sites`.
 *
 * # Arguments
 * * `psi_re`, `psi_im` - Current wavefunction components (length = `total_sites`)
 * * `grid_size`, `spacing` - Lattice geometry
 * * `axis` - Measured axis index
 * * `axis_position` - Measurement coordinate along `axis`
 * * `sigma` - Gaussian width
 * * `axis_compact` - Non-zero to wrap on the measured axis
 *
 * # Returns
 * Packed `Float32Array`, or empty on shape mismatch / invalid axis.
 * @param {Float32Array | number[]} psi_re
 * @param {Float32Array | number[]} psi_im
 * @param {Uint32Array | number[]} grid_size
 * @param {Float64Array | number[]} spacing
 * @param {number} axis
 * @param {number} axis_position
 * @param {number} sigma
 * @param {number} axis_compact
 * @returns {Float32Array}
 */
export function compute_partial_collapse_wasm(psi_re, psi_im, grid_size, spacing, axis, axis_position, sigma, axis_compact) {
    const val5 = +axis;
    const val6 = +axis_position;
    const val7 = +sigma;
    const val8 = +axis_compact;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
    try {
        ptr0 = passArrayF32ToWasm0(psi_re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(psi_im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray32ToWasm0(grid_size, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArrayF64ToWasm0(spacing, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 8, 8); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compute_partial_collapse_wasm(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val5, val6, val7, val8);
    var v9 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v9;
}

/**
 * Compute the reduced density matrix for a single dimension by tracing out
 * all other dimensions.
 *
 * # Arguments
 * * `psi_re` - Real part of wavefunction (Float32Array from GPU readback)
 * * `psi_im` - Imaginary part of wavefunction (Float32Array)
 * * `grid_size` - Grid dimensions `[M_0, M_1, ..., M_{N-1}]`
 * * `dim_index` - Which dimension to keep (0-based)
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(M*M), im_flat(M*M)]` where `M = grid_size[dim_index]`.
 * Empty on invalid input.
 * @param {Float32Array | number[]} psi_re
 * @param {Float32Array | number[]} psi_im
 * @param {Uint32Array | number[]} grid_size
 * @param {number} dim_index
 * @returns {Float64Array}
 */
export function compute_rdm_wasm(psi_re, psi_im, grid_size, dim_index) {
    const val4 = +dim_index;
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passArrayF32ToWasm0(psi_re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(psi_im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray32ToWasm0(grid_size, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compute_rdm_wasm(ptr0, len0, ptr1, len1, ptr2, len2, val4);
    var v5 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v5;
}

/**
 * Compute scar correlation between eigenstate density and classical orbits.
 *
 * # Arguments
 * * `density_re` - Eigenstate ψ_re on the lattice (f32 from GPU readback)
 * * `density_im` - Eigenstate ψ_im on the lattice (f32)
 * * `grid_sizes` - Per-dimension grid sizes
 * * `spacings` - Per-dimension lattice spacings (f64)
 * * `orbit_points_flat` - Flattened orbit positions `[x0_d0, x0_d1, ..., x1_d0, ...]` (f64)
 * * `orbit_lengths` - Number of points per orbit
 * * `sigma` - Gaussian tube width ε
 * * `dim` - Number of spatial dimensions
 *
 * # Returns
 * Packed `Float64Array`: `[corr_0, ..., corr_N, max, mean, orbit_correlation, strongest_idx]`
 * @param {Float32Array | number[]} density_re
 * @param {Float32Array | number[]} density_im
 * @param {Uint32Array | number[]} grid_sizes
 * @param {Float64Array | number[]} spacings
 * @param {Float64Array | number[]} orbit_points_flat
 * @param {Uint32Array | number[]} orbit_lengths
 * @param {number} sigma
 * @param {number} dim
 * @returns {Float64Array}
 */
export function compute_scar_correlation_wasm(density_re, density_im, grid_sizes, spacings, orbit_points_flat, orbit_lengths, sigma, dim) {
    const val7 = +sigma;
    const val8 = +dim;
    let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5;
    try {
        ptr0 = passArrayF32ToWasm0(density_re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF32ToWasm0(density_im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray32ToWasm0(grid_sizes, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
        ptr3 = passArrayF64ToWasm0(spacings, wasm.__wbindgen_malloc);
        len3 = WASM_VECTOR_LEN;
        ptr4 = passArrayF64ToWasm0(orbit_points_flat, wasm.__wbindgen_malloc);
        len4 = WASM_VECTOR_LEN;
        ptr5 = passArray32ToWasm0(orbit_lengths, wasm.__wbindgen_malloc);
        len5 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 4, 4); }
        if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 8, 8); }
        if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 8, 8); }
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 4, 4); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 4, 4); }
        throw e;
    }
    const ret = wasm.compute_scar_correlation_wasm(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, val7, val8);
    var v9 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v9;
}

/**
 * Returns the spinor size for a given spatial dimension.
 * @param {number} spatial_dim
 * @returns {number}
 */
export function dirac_spinor_size_wasm(spatial_dim) {
    const ret = wasm.dirac_spinor_size_wasm(spatial_dim);
    return ret >>> 0;
}

/**
 * Computes the dot product of two vectors
 *
 * # Arguments
 * * `a` - First vector
 * * `b` - Second vector
 *
 * # Returns
 * The scalar dot product
 * @param {Float64Array | number[]} a
 * @param {Float64Array | number[]} b
 * @returns {number}
 */
export function dot_product_wasm(a, b) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(a, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(b, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.dot_product_wasm(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * In-place 1D forward FFT on interleaved complex data.
 *
 * Convention: `X[k] = Σ x[n] * exp(-i * 2π * k * n / N)`.
 *
 * # Arguments
 * * `data` - Interleaved `[re0, im0, re1, im1, ...]` (length 2*n)
 * * `n` - Number of complex elements (must be a power of 2, >= 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 * @param {Float64Array | number[]} data
 * @param {number} n
 * @returns {Float64Array}
 */
export function fft_1d_wasm(data, n) {
    const val2 = +n;
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.fft_1d_wasm(ptr0, len0, val2);
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * N-dimensional forward FFT on interleaved complex data.
 *
 * Applies 1D forward FFT along each axis sequentially.
 *
 * # Arguments
 * * `data` - Interleaved complex data (length `2 * product(grid_size)`)
 * * `grid_size` - Grid sizes per dimension (each must be a power of 2, >= 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 * @param {Float64Array | number[]} data
 * @param {Uint32Array | number[]} grid_size
 * @returns {Float64Array}
 */
export function fft_nd_wasm(data, grid_size) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray32ToWasm0(grid_size, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.fft_nd_wasm(ptr0, len0, ptr1, len1);
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * Generates Dirac gamma matrices for N spatial dimensions.
 *
 * # Arguments
 * * `spatial_dim` - Number of spatial dimensions (1-11)
 *
 * # Returns
 * Flat f32 buffer containing all matrices packed sequentially:
 *   [spinorSize_as_f32, alpha_1 | alpha_2 | ... | alpha_N | beta]
 * Each matrix is S×S×2 floats (complex, row-major, re/im interleaved).
 * @param {number} spatial_dim
 * @returns {Float32Array}
 */
export function generate_dirac_matrices_wasm(spatial_dim) {
    const ret = wasm.generate_dirac_matrices_wasm(spatial_dim);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * Generate a seeded uniform noise lattice in `[-0.5, 0.5]`.
 *
 * Matches `src/lib/physics/tdse/disorderNoise.ts::generateDisorderNoise`
 * bit-for-bit (mulberry32 PRNG parity).
 *
 * # Arguments
 * * `total_sites` - Length of the output Float32Array
 * * `seed` - Integer seed (wraps to u32 at the boundary)
 *
 * # Returns
 * Float32Array of length `total_sites`.
 * @param {number} total_sites
 * @param {number} seed
 * @returns {Float32Array}
 */
export function generate_disorder_noise_wasm(total_sites, seed) {
    const ret = wasm.generate_disorder_noise_wasm(total_sites, seed);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * Generate an Anderson disorder potential.
 *
 * Matches `src/lib/physics/anderson/disorderPotential.ts` with
 * `distribution_code`: `0 = uniform`, `1 = gaussian`.
 *
 * # Arguments
 * * `total_sites` - Lattice site count (product of grid sizes)
 * * `disorder_strength` - `W` (uniform half-range × 2; Gaussian σ)
 * * `seed` - Integer seed
 * * `distribution_code` - `0` uniform, `1` gaussian
 *
 * # Returns
 * `Float32Array` of length `total_sites`, or empty on invalid distribution.
 * @param {number} total_sites
 * @param {number} disorder_strength
 * @param {number} seed
 * @param {number} distribution_code
 * @returns {Float32Array}
 */
export function generate_disorder_potential_wasm(total_sites, disorder_strength, seed, distribution_code) {
    const ret = wasm.generate_disorder_potential_wasm(total_sites, disorder_strength, seed, distribution_code);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * Hermitian eigendecomposition via Jacobi iteration.
 *
 * # Arguments
 * * `re` - Real part of Hermitian matrix (row-major, n×n)
 * * `im` - Imaginary part of Hermitian matrix (row-major, n×n)
 * * `n` - Matrix dimension
 *
 * # Returns
 * Eigenvalues sorted descending as `Float64Array`
 * @param {Float64Array | number[]} re
 * @param {Float64Array | number[]} im
 * @param {number} n
 * @returns {Float64Array}
 */
export function hermitian_eigenvalues_wasm(re, im, n) {
    const val3 = +n;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.hermitian_eigenvalues_wasm(ptr0, len0, ptr1, len1, val3);
    var v4 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v4;
}

/**
 * In-place 1D inverse FFT with 1/N normalization.
 *
 * Convention: `x[n] = (1/N) Σ X[k] * exp(+i * 2π * k * n / N)`.
 *
 * # Arguments
 * * `data` - Interleaved `[re0, im0, re1, im1, ...]` (length 2*n)
 * * `n` - Number of complex elements (must be a power of 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 * @param {Float64Array | number[]} data
 * @param {number} n
 * @returns {Float64Array}
 */
export function ifft_1d_wasm(data, n) {
    const val2 = +n;
    const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ifft_1d_wasm(ptr0, len0, val2);
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * N-dimensional inverse FFT on interleaved complex data.
 *
 * Applies 1D inverse FFT along each axis sequentially.
 *
 * # Arguments
 * * `data` - Interleaved complex data (length `2 * product(grid_size)`)
 * * `grid_size` - Grid sizes per dimension (each must be a power of 2, >= 2)
 *
 * # Returns
 * Transformed data as a new `Float64Array`, or empty on invalid input
 * @param {Float64Array | number[]} data
 * @param {Uint32Array | number[]} grid_size
 * @returns {Float64Array}
 */
export function ifft_nd_wasm(data, grid_size) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray32ToWasm0(grid_size, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 4, 4); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.ifft_nd_wasm(ptr0, len0, ptr1, len1);
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * Computes the magnitude (length) of a vector
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * The magnitude of the vector
 * @param {Float64Array | number[]} v
 * @returns {number}
 */
export function magnitude_wasm(v) {
    const ptr0 = passArrayF64ToWasm0(v, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.magnitude_wasm(ptr0, len0);
    return ret;
}

/**
 * Matrix exponential via Padé(13,13) with scaling-and-squaring.
 *
 * Computes exp(A) for an N×N complex matrix stored as separate real/imag arrays.
 *
 * # Arguments
 * * `a_re` - Real part of input matrix (N×N, row-major)
 * * `a_im` - Imaginary part of input matrix (N×N, row-major)
 * * `n` - Matrix dimension
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(N*N), im_flat(N*N)]`
 * @param {Float64Array | number[]} a_re
 * @param {Float64Array | number[]} a_im
 * @param {number} n
 * @returns {Float64Array}
 */
export function matrix_exponential_pade_wasm(a_re, a_im, n) {
    const val3 = +n;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(a_re, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(a_im, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.matrix_exponential_pade_wasm(ptr0, len0, ptr1, len1, val3);
    var v4 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v4;
}

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
 * @param {Float64Array | number[]} a
 * @param {Float64Array | number[]} b
 * @param {number} dimension
 * @returns {Float64Array}
 */
export function multiply_matrices_wasm(a, b, dimension) {
    const val3 = +dimension;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(a, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(b, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.multiply_matrices_wasm(ptr0, len0, ptr1, len1, val3);
    var v4 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v4;
}

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
 * @param {Float64Array | number[]} matrix
 * @param {Float64Array | number[]} vector
 * @param {number} dimension
 * @returns {Float64Array}
 */
export function multiply_matrix_vector_wasm(matrix, vector, dimension) {
    const val3 = +dimension;
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(matrix, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(vector, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.multiply_matrix_vector_wasm(ptr0, len0, ptr1, len1, val3);
    var v4 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v4;
}

/**
 * Normalizes a vector to unit length
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * Unit vector in the same direction
 * @param {Float64Array | number[]} v
 * @returns {Float64Array}
 */
export function normalize_vector_wasm(v) {
    const ptr0 = passArrayF64ToWasm0(v, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.normalize_vector_wasm(ptr0, len0);
    var v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}

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
 * @param {Float64Array | number[]} flat_vertices
 * @param {number} dimension
 * @param {number} projection_distance
 * @returns {Float32Array}
 */
export function project_vertices_wasm(flat_vertices, dimension, projection_distance) {
    const val2 = +dimension;
    const val3 = +projection_distance;
    const ptr0 = passArrayF64ToWasm0(flat_vertices, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.project_vertices_wasm(ptr0, len0, val2, val3);
    var v4 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v4;
}

/**
 * Initializes the WASM module: installs the panic hook for readable error
 * messages in the browser console.
 */
export function start() {
    wasm.start();
}

/**
 * Subtracts two vectors element-wise: c = a - b
 *
 * # Arguments
 * * `a` - First vector
 * * `b` - Second vector
 *
 * # Returns
 * The difference vector
 * @param {Float64Array | number[]} a
 * @param {Float64Array | number[]} b
 * @returns {Float64Array}
 */
export function subtract_vectors_wasm(a, b) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArrayF64ToWasm0(a, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArrayF64ToWasm0(b, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 8, 8); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 8, 8); }
        throw e;
    }
    const ret = wasm.subtract_vectors_wasm(ptr0, len0, ptr1, len1);
    var v3 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v3;
}

/**
 * Von Neumann entropy from eigenvalues: S = -Σ λ_k ln(λ_k).
 *
 * # Arguments
 * * `eigenvalues` - Eigenvalues of a density matrix
 *
 * # Returns
 * Entropy value (natural log, nats), clamped to >= 0
 * @param {Float64Array | number[]} eigenvalues
 * @returns {number}
 */
export function von_neumann_entropy_wasm(eigenvalues) {
    const ptr0 = passArrayF64ToWasm0(eigenvalues, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.von_neumann_entropy_wasm(ptr0, len0);
    return ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_string_get_7ce8eee7fd327545: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_00952405221549ca: function(arg0, arg1) {
            console.log(getStringFromWasm0(arg0, arg1));
        },
        __wbg_new_bb74001155cb8ca8: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_stack_575c4e0918581b9c: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./mdimension_core_bg.js": import0,
    };
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('mdimension_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
