let wasm;

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
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
    return decodeText(ptr, len);
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

function getObject(idx) { return heap[idx]; }

let heap = new Array(128).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
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
    const mem = getDataViewMemory0();
    for (let i = 0; i < array.length; i++) {
        mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
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

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
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
    }
}

let WASM_VECTOR_LEN = 0;

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
 * @param {Float64Array} a_re
 * @param {Float64Array} a_im
 * @param {Float64Array} b_re
 * @param {Float64Array} b_im
 * @param {number} n
 * @returns {Float64Array}
 */
export function complex_mat_mul_wasm(a_re, a_im, b_re, b_im, n) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(a_re, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(a_im, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(b_re, wasm.__wbindgen_export);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF64ToWasm0(b_im, wasm.__wbindgen_export);
        const len3 = WASM_VECTOR_LEN;
        wasm.complex_mat_mul_wasm(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, n);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v5 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v5;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Uint32Array} plane_indices
 * @param {Float64Array} angles
 * @param {number} rotation_count
 * @returns {Float64Array}
 */
export function compose_rotations_indexed_wasm(dimension, plane_indices, angles, rotation_count) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(plane_indices, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(angles, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.compose_rotations_indexed_wasm(retptr, dimension, ptr0, len0, ptr1, len1, rotation_count);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} angles
 * @returns {Float64Array}
 */
export function compose_rotations_wasm(dimension, plane_names, angles) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayJsValueToWasm0(plane_names, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(angles, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.compose_rotations_wasm(retptr, dimension, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Compute the joint reduced density matrix for a set of dimensions.
 *
 * # Arguments
 * * `psi_re` - Real part of wavefunction (Float32Array)
 * * `psi_im` - Imaginary part of wavefunction (Float32Array)
 * * `grid_size` - Grid dimensions
 * * `kept_dims` - Indices of dimensions to keep (sorted ascending)
 *
 * # Returns
 * Packed `Float64Array`: `[re_flat(M*M), im_flat(M*M)]` where `M = Π kept dims`.
 * Empty on invalid input or `M > 1024`.
 * @param {Float32Array} psi_re
 * @param {Float32Array} psi_im
 * @param {Uint32Array} grid_size
 * @param {Uint32Array} kept_dims
 * @returns {Float64Array}
 */
export function compute_joint_rdm_wasm(psi_re, psi_im, grid_size, kept_dims) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF32ToWasm0(psi_re, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(psi_im, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(grid_size, wasm.__wbindgen_export);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(kept_dims, wasm.__wbindgen_export);
        const len3 = WASM_VECTOR_LEN;
        wasm.compute_joint_rdm_wasm(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v5 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v5;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Compute level spacing statistics from energy eigenvalues.
 *
 * # Arguments
 * * `energies` - Eigenvalue array
 *
 * # Returns
 * Packed `Float64Array`: `[spacings..., brody_beta, mean_spacing, classification_code]`
 * Classification codes: 0 = poisson, 1 = intermediate, 2 = wigner-dyson
 * @param {Float64Array} energies
 * @returns {Float64Array}
 */
export function compute_level_spacing_wasm(energies) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(energies, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.compute_level_spacing_wasm(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float32Array} psi_re
 * @param {Float32Array} psi_im
 * @param {Uint32Array} grid_size
 * @param {number} dim_index
 * @returns {Float64Array}
 */
export function compute_rdm_wasm(psi_re, psi_im, grid_size, dim_index) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF32ToWasm0(psi_re, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(psi_im, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(grid_size, wasm.__wbindgen_export);
        const len2 = WASM_VECTOR_LEN;
        wasm.compute_rdm_wasm(retptr, ptr0, len0, ptr1, len1, ptr2, len2, dim_index);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v4 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v4;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float32Array} density_re
 * @param {Float32Array} density_im
 * @param {Uint32Array} grid_sizes
 * @param {Float64Array} spacings
 * @param {Float64Array} orbit_points_flat
 * @param {Uint32Array} orbit_lengths
 * @param {number} sigma
 * @param {number} dim
 * @returns {Float64Array}
 */
export function compute_scar_correlation_wasm(density_re, density_im, grid_sizes, spacings, orbit_points_flat, orbit_lengths, sigma, dim) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF32ToWasm0(density_re, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(density_im, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(grid_sizes, wasm.__wbindgen_export);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF64ToWasm0(spacings, wasm.__wbindgen_export);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayF64ToWasm0(orbit_points_flat, wasm.__wbindgen_export);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArray32ToWasm0(orbit_lengths, wasm.__wbindgen_export);
        const len5 = WASM_VECTOR_LEN;
        wasm.compute_scar_correlation_wasm(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, sigma, dim);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v7 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v7;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number}
 */
export function dot_product_wasm(a, b) {
    const ptr0 = passArrayF64ToWasm0(a, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(b, wasm.__wbindgen_export);
    const len1 = WASM_VECTOR_LEN;
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
 * @param {Float64Array} data
 * @param {number} n
 * @returns {Float64Array}
 */
export function fft_1d_wasm(data, n) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.fft_1d_wasm(retptr, ptr0, len0, n);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} data
 * @param {Uint32Array} grid_size
 * @returns {Float64Array}
 */
export function fft_nd_wasm(data, grid_size) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(grid_size, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.fft_nd_wasm(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.generate_dirac_matrices_wasm(retptr, spatial_dim);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v1 = getArrayF32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 4, 4);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @param {number} n
 * @returns {Float64Array}
 */
export function hermitian_eigenvalues_wasm(re, im, n) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(re, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(im, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.hermitian_eigenvalues_wasm(retptr, ptr0, len0, ptr1, len1, n);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} data
 * @param {number} n
 * @returns {Float64Array}
 */
export function ifft_1d_wasm(data, n) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.ifft_1d_wasm(retptr, ptr0, len0, n);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} data
 * @param {Uint32Array} grid_size
 * @returns {Float64Array}
 */
export function ifft_nd_wasm(data, grid_size) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(data, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(grid_size, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.ifft_nd_wasm(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Computes the magnitude (length) of a vector
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * The magnitude of the vector
 * @param {Float64Array} v
 * @returns {number}
 */
export function magnitude_wasm(v) {
    const ptr0 = passArrayF64ToWasm0(v, wasm.__wbindgen_export);
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
 * @param {Float64Array} a_re
 * @param {Float64Array} a_im
 * @param {number} n
 * @returns {Float64Array}
 */
export function matrix_exponential_pade_wasm(a_re, a_im, n) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(a_re, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(a_im, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.matrix_exponential_pade_wasm(retptr, ptr0, len0, ptr1, len1, n);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} dimension
 * @returns {Float64Array}
 */
export function multiply_matrices_wasm(a, b, dimension) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(a, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(b, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.multiply_matrices_wasm(retptr, ptr0, len0, ptr1, len1, dimension);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} matrix
 * @param {Float64Array} vector
 * @param {number} dimension
 * @returns {Float64Array}
 */
export function multiply_matrix_vector_wasm(matrix, vector, dimension) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(matrix, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(vector, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.multiply_matrix_vector_wasm(retptr, ptr0, len0, ptr1, len1, dimension);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Normalizes a vector to unit length
 *
 * # Arguments
 * * `v` - Input vector
 *
 * # Returns
 * Unit vector in the same direction
 * @param {Float64Array} v
 * @returns {Float64Array}
 */
export function normalize_vector_wasm(v) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(v, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.normalize_vector_wasm(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} flat_vertices
 * @param {number} dimension
 * @param {number} projection_distance
 * @returns {Float32Array}
 */
export function project_vertices_wasm(flat_vertices, dimension, projection_distance) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(flat_vertices, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.project_vertices_wasm(retptr, ptr0, len0, dimension, projection_distance);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 4, 4);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
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
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
export function subtract_vectors_wasm(a, b) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(a, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(b, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        wasm.subtract_vectors_wasm(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export3(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Von Neumann entropy from eigenvalues: S = -Σ λ_k ln(λ_k).
 *
 * # Arguments
 * * `eigenvalues` - Eigenvalues of a density matrix
 *
 * # Returns
 * Entropy value (natural log, nats), clamped to >= 0
 * @param {Float64Array} eigenvalues
 * @returns {number}
 */
export function von_neumann_entropy_wasm(eigenvalues) {
    const ptr0 = passArrayF64ToWasm0(eigenvalues, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.von_neumann_entropy_wasm(ptr0, len0);
    return ret;
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
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
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
        const obj = getObject(arg1);
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_export3(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_log_724dbee8e17bfd43 = function(arg0, arg1) {
        console.log(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = getObject(arg1).stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
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

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('mdimension_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
