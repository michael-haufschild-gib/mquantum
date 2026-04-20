//! Radix-2 Cooley-Tukey FFT for interleaved complex data.
//!
//! Data layout: `[re0, im0, re1, im1, ..., re_{N-1}, im_{N-1}]`
//!
//! Convention: forward DFT uses `exp(-i * 2π * k * n / N)` (signal processing standard).
//! Inverse DFT uses `exp(+i * 2π * k * n / N)` with 1/N normalization.
//!
//! Twiddle factors are cached per FFT size using thread-local storage (WASM is single-threaded).

use std::cell::RefCell;
use std::f64::consts::PI;
use std::rc::Rc;

// ============================================================================
// Twiddle Factor Cache
// ============================================================================

/// Maximum supported log2(N). Supports FFT sizes up to 2^20 = 1,048,576.
/// Public so lib.rs validators can enforce the same upper bound.
pub const MAX_LOG2: usize = 21;

thread_local! {
    /// Cached twiddle factors indexed by log2(N).
    /// Each entry stores interleaved [re, im] pairs for all butterfly stages of size N.
    /// Layout: stage L=2 (1 factor), stage L=4 (2 factors), ..., stage L=N (N/2 factors).
    /// Total: N-1 complex pairs = 2*(N-1) f64 values.
    /// Wrapped in Rc for O(1) clone on cache hits.
    static TWIDDLE_CACHE: RefCell<Vec<Option<Rc<Vec<f64>>>>> =
        RefCell::new(vec![None; MAX_LOG2]);
}

/// Compute the base-2 logarithm for a power-of-2 value.
/// Panics if n is not a power of 2 or is zero.
#[inline]
fn log2_exact(n: usize) -> usize {
    assert!(
        n > 0 && n.is_power_of_two(),
        "n must be a non-zero power of 2"
    );
    let idx = n.trailing_zeros() as usize;
    assert!(idx < MAX_LOG2, "FFT size exceeds the supported maximum");
    idx
}

/// Get or compute cached twiddle factors for FFT size `n`.
/// Returns an `Rc<Vec<f64>>` — clone is O(1) ref-count increment.
fn get_twiddle_factors(n: usize) -> Rc<Vec<f64>> {
    TWIDDLE_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let idx = log2_exact(n);

        if let Some(ref table) = cache[idx] {
            return Rc::clone(table);
        }

        // Total twiddle entries: sum(L/2 for L=2,4,...,N) = N-1
        let mut table = Vec::with_capacity((n - 1) * 2);
        let mut len = 2usize;
        while len <= n {
            let half_len = len / 2;
            let angle = (-2.0 * PI) / (len as f64);
            for j in 0..half_len {
                let theta = angle * (j as f64);
                table.push(theta.cos());
                table.push(theta.sin());
            }
            len *= 2;
        }

        let rc = Rc::new(table);
        cache[idx] = Some(Rc::clone(&rc));
        rc
    })
}

// ============================================================================
// Bit-Reversal Permutation
// ============================================================================

/// In-place bit-reversal permutation of interleaved complex data.
#[inline]
fn bit_reverse(data: &mut [f64], n: usize) {
    let mut j = 0usize;
    for i in 0..n - 1 {
        if i < j {
            // Swap complex elements i and j
            let ri = i * 2;
            let rj = j * 2;
            data.swap(ri, rj);
            data.swap(ri + 1, rj + 1);
        }
        let mut m = n >> 1;
        while m >= 1 && j >= m {
            j -= m;
            m >>= 1;
        }
        j += m;
    }
}

// ============================================================================
// 1D FFT
// ============================================================================

/// In-place radix-2 forward FFT on interleaved complex data.
///
/// Computes `X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2π * k * n / N)`.
///
/// # Arguments
/// * `data` - Interleaved `[re0, im0, re1, im1, ...]` of length `2*n`
/// * `n` - Number of complex elements (must be a power of 2, >= 2)
pub fn fft_1d(data: &mut [f64], n: usize) {
    assert!(n >= 2 && n.is_power_of_two());
    assert!(data.len() >= 2 * n);

    bit_reverse(data, n);

    let twiddle = get_twiddle_factors(n);
    let mut twiddle_offset = 0usize;

    let mut len = 2usize;
    while len <= n {
        let half_len = len / 2;

        let mut i = 0usize;
        while i < n {
            for j in 0..half_len {
                let even_idx = (i + j) * 2;
                let odd_idx = (i + j + half_len) * 2;

                let w_re = twiddle[twiddle_offset + j * 2];
                let w_im = twiddle[twiddle_offset + j * 2 + 1];

                // Twiddle multiply: w * data[odd]
                let odd_re = data[odd_idx];
                let odd_im = data[odd_idx + 1];
                let t_re = w_re * odd_re - w_im * odd_im;
                let t_im = w_re * odd_im + w_im * odd_re;

                // Butterfly
                let even_re = data[even_idx];
                let even_im = data[even_idx + 1];
                data[even_idx] = even_re + t_re;
                data[even_idx + 1] = even_im + t_im;
                data[odd_idx] = even_re - t_re;
                data[odd_idx + 1] = even_im - t_im;
            }
            i += len;
        }

        twiddle_offset += half_len * 2;
        len *= 2;
    }
}

/// In-place inverse FFT with 1/N normalization.
///
/// Computes `x[n] = (1/N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2π * k * n / N)`.
///
/// Uses the conjugate-FFT-conjugate-scale trick for exact parity with the TS implementation.
pub fn ifft_1d(data: &mut [f64], n: usize) {
    assert!(n >= 1 && n.is_power_of_two());
    assert!(data.len() >= 2 * n);

    if n <= 1 {
        return;
    }

    // Conjugate
    for i in 0..n {
        data[i * 2 + 1] = -data[i * 2 + 1];
    }

    // Forward FFT
    fft_1d(data, n);

    // Conjugate and scale by 1/N
    let inv_n = 1.0 / (n as f64);
    for i in 0..n {
        data[i * 2] *= inv_n;
        data[i * 2 + 1] *= -inv_n;
    }
}

// ============================================================================
// N-D FFT
// ============================================================================

/// Compute row-major strides for an N-D grid.
fn compute_strides(grid_size: &[usize]) -> Vec<usize> {
    let dim = grid_size.len();
    let mut strides = vec![0usize; dim];
    if dim == 0 {
        return strides;
    }
    strides[dim - 1] = 1;
    for d in (0..dim - 1).rev() {
        strides[d] = strides[d + 1] * grid_size[d + 1];
    }
    strides
}

/// Collect dimension indices to iterate (all except target), in reverse order.
fn collect_other_dims(dim: usize, exclude_dim: usize) -> Vec<usize> {
    let mut others = Vec::with_capacity(dim - 1);
    for dd in (0..dim).rev() {
        if dd != exclude_dim {
            others.push(dd);
        }
    }
    others
}

/// Decompose a fiber index into a base offset for the N-D grid.
fn compute_fiber_base(
    fiber_index: usize,
    other_dims: &[usize],
    grid_size: &[usize],
    strides: &[usize],
) -> usize {
    let mut base = 0usize;
    let mut remaining = fiber_index;
    for &dd in other_dims {
        let coord = remaining % grid_size[dd];
        remaining /= grid_size[dd];
        base += coord * strides[dd];
    }
    base
}

/// Apply a 1D transform along each axis of an N-D grid.
fn nd_transform(data: &mut [f64], grid_size: &[usize], transform_1d: fn(&mut [f64], usize)) {
    let dim = grid_size.len();
    if dim == 0 {
        return;
    }

    let total_sites: usize = grid_size.iter().product();
    if total_sites <= 1 {
        return;
    }

    let strides = compute_strides(grid_size);

    for d in 0..dim {
        let n = grid_size[d];
        if n <= 1 {
            continue;
        }

        let fiber_stride = strides[d];
        let fiber_count = total_sites / n;
        let other_dims = collect_other_dims(dim, d);
        let mut fiber = vec![0.0f64; 2 * n];

        for f in 0..fiber_count {
            let base = compute_fiber_base(f, &other_dims, grid_size, &strides);

            // Extract fiber
            for i in 0..n {
                let flat_idx = base + i * fiber_stride;
                fiber[i * 2] = data[flat_idx * 2];
                fiber[i * 2 + 1] = data[flat_idx * 2 + 1];
            }

            transform_1d(&mut fiber, n);

            // Write back
            for i in 0..n {
                let flat_idx = base + i * fiber_stride;
                data[flat_idx * 2] = fiber[i * 2];
                data[flat_idx * 2 + 1] = fiber[i * 2 + 1];
            }
        }
    }
}

/// In-place N-dimensional forward FFT.
pub fn fft_nd(data: &mut [f64], grid_size: &[usize]) {
    nd_transform(data, grid_size, fft_1d);
}

/// In-place N-dimensional inverse FFT.
pub fn ifft_nd(data: &mut [f64], grid_size: &[usize]) {
    nd_transform(data, grid_size, ifft_1d);
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const TOL: f64 = 1e-10;

    /// Check two interleaved complex arrays are approximately equal.
    fn assert_complex_close(a: &[f64], b: &[f64], tol: f64) {
        assert_eq!(a.len(), b.len(), "arrays differ in length");
        for i in 0..a.len() {
            assert!(
                (a[i] - b[i]).abs() < tol,
                "mismatch at index {}: {} vs {} (diff {})",
                i,
                a[i],
                b[i],
                (a[i] - b[i]).abs()
            );
        }
    }

    // ── 1D forward FFT ──

    #[test]
    fn test_fft_delta_to_constant() {
        // x = [1, 0, 0, 0] -> X = [1, 1, 1, 1]
        let mut data = vec![1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        fft_1d(&mut data, 4);
        let expected = vec![1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
        assert_complex_close(&data, &expected, TOL);
    }

    #[test]
    fn test_fft_constant_to_delta() {
        // x = [1, 1, 1, 1] -> X = [4, 0, 0, 0]
        let mut data = vec![1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
        fft_1d(&mut data, 4);
        let expected = vec![4.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        assert_complex_close(&data, &expected, TOL);
    }

    #[test]
    fn test_fft_two_point() {
        // DFT of [3, 7] = [3+7, 3-7] = [10, -4]
        let mut data = vec![3.0, 0.0, 7.0, 0.0];
        fft_1d(&mut data, 2);
        assert!((data[0] - 10.0).abs() < TOL);
        assert!((data[2] - (-4.0)).abs() < TOL);
    }

    #[test]
    fn test_fft_parseval_theorem() {
        let n = 16;
        let mut data = vec![0.0; 2 * n];
        for i in 0..n {
            data[i * 2] = (2.0 * PI * 3.0 * (i as f64) / (n as f64)).sin();
        }

        let mut time_energy = 0.0;
        for i in 0..n {
            time_energy += data[i * 2] * data[i * 2] + data[i * 2 + 1] * data[i * 2 + 1];
        }

        fft_1d(&mut data, n);

        let mut freq_energy = 0.0;
        for i in 0..n {
            freq_energy += data[i * 2] * data[i * 2] + data[i * 2 + 1] * data[i * 2 + 1];
        }
        freq_energy /= n as f64;

        assert!(
            (time_energy - freq_energy).abs() < TOL,
            "Parseval violated: time={time_energy}, freq={freq_energy}"
        );
    }

    #[test]
    fn test_fft_cosine_peaks() {
        let n = 16;
        let k = 3;
        let mut data = vec![0.0; 2 * n];
        for i in 0..n {
            data[i * 2] = (2.0 * PI * (k as f64) * (i as f64) / (n as f64)).cos();
        }

        fft_1d(&mut data, n);

        for i in 0..n {
            let mag = (data[i * 2] * data[i * 2] + data[i * 2 + 1] * data[i * 2 + 1]).sqrt();
            if i == k || i == n - k {
                assert!(
                    (mag - (n as f64) / 2.0).abs() < 1e-8,
                    "expected peak at bin {i}, got mag={mag}"
                );
            } else {
                assert!(mag < 1e-8, "expected zero at bin {i}, got mag={mag}");
            }
        }
    }

    // ── 1D inverse FFT ──

    #[test]
    fn test_ifft_roundtrip() {
        let n = 8;
        let mut original = vec![0.0; 2 * n];
        for i in 0..n {
            let t = (i as f64) / (n as f64);
            original[i * 2] = (2.0 * PI * t).cos() + 0.5 * (4.0 * PI * t).sin();
        }

        let mut data = original.clone();
        fft_1d(&mut data, n);
        ifft_1d(&mut data, n);

        assert_complex_close(&data, &original, TOL);
    }

    #[test]
    fn test_ifft_constant_to_delta() {
        // X = [1, 1, 1, 1] -> x = [1, 0, 0, 0]
        let mut data = vec![1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
        ifft_1d(&mut data, 4);
        let expected = vec![1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        assert_complex_close(&data, &expected, TOL);
    }

    #[test]
    fn test_roundtrip_complex_signal() {
        let n = 16;
        let mut original = vec![0.0; 2 * n];
        for i in 0..n {
            let t = (i as f64) / (n as f64);
            original[i * 2] = (2.0 * PI * t).cos();
            original[i * 2 + 1] = (2.0 * PI * 3.0 * t).sin();
        }

        let mut data = original.clone();
        fft_1d(&mut data, n);
        ifft_1d(&mut data, n);

        assert_complex_close(&data, &original, TOL);
    }

    #[test]
    fn test_roundtrip_1024() {
        let n = 1024;
        let mut original = vec![0.0; 2 * n];
        for i in 0..n {
            let t = (i as f64) / (n as f64);
            original[i * 2] = (2.0 * PI * 7.0 * t).sin() + 0.5 * (2.0 * PI * 31.0 * t).cos();
        }

        let mut data = original.clone();
        fft_1d(&mut data, n);
        ifft_1d(&mut data, n);

        assert_complex_close(&data, &original, TOL);
    }

    // ── N-D FFT ──

    #[test]
    fn test_nd_roundtrip_3d() {
        let dims = [4, 4, 4];
        let total: usize = dims.iter().product();
        let mut original = vec![0.0; 2 * total];
        for iz in 0..4 {
            for iy in 0..4 {
                for ix in 0..4 {
                    let idx = iz * 16 + iy * 4 + ix;
                    original[idx * 2] =
                        (2.0 * PI * (ix as f64) / 4.0).sin() * (2.0 * PI * (iy as f64) / 4.0).cos();
                }
            }
        }

        let mut data = original.clone();
        fft_nd(&mut data, &dims);
        ifft_nd(&mut data, &dims);

        assert_complex_close(&data, &original, TOL);
    }

    #[test]
    fn test_nd_roundtrip_2d() {
        let dims = [8, 4];
        let total: usize = dims.iter().product();
        let mut original = vec![0.0; 2 * total];
        for i in 0..total {
            original[i * 2] = (2.0 * PI * 5.0 * (i as f64) / (total as f64)).cos();
            original[i * 2 + 1] = (2.0 * PI * 7.0 * (i as f64) / (total as f64)).sin();
        }

        let mut data = original.clone();
        fft_nd(&mut data, &dims);
        ifft_nd(&mut data, &dims);

        assert_complex_close(&data, &original, TOL);
    }

    #[test]
    fn test_nd_roundtrip_4d() {
        let dims = [2, 2, 4, 4];
        let total: usize = dims.iter().product();
        let mut original = vec![0.0; 2 * total];
        for i in 0..total {
            let t = (i as f64) / (total as f64);
            original[i * 2] = (2.0 * PI * t).sin() * (1.0 + 0.5 * (4.0 * PI * t).cos());
        }

        let mut data = original.clone();
        fft_nd(&mut data, &dims);
        ifft_nd(&mut data, &dims);

        assert_complex_close(&data, &original, TOL);
    }

    #[test]
    fn test_nd_parseval_3d() {
        let dims = [4, 4, 4];
        let total: usize = dims.iter().product();
        let mut data = vec![0.0; 2 * total];
        for i in 0..total {
            data[i * 2] = (2.0 * PI * 3.0 * (i as f64) / (total as f64)).sin();
        }

        let mut time_energy = 0.0;
        for i in 0..total {
            time_energy += data[i * 2] * data[i * 2] + data[i * 2 + 1] * data[i * 2 + 1];
        }

        fft_nd(&mut data, &dims);

        let mut freq_energy = 0.0;
        for i in 0..total {
            freq_energy += data[i * 2] * data[i * 2] + data[i * 2 + 1] * data[i * 2 + 1];
        }
        freq_energy /= total as f64;

        assert!(
            (time_energy - freq_energy).abs() < TOL,
            "N-D Parseval violated: time={time_energy}, freq={freq_energy}"
        );
    }

    #[test]
    fn test_nd_matches_1d() {
        // N-D FFT with 1 dimension should match 1D FFT
        let n = 8;
        let mut data_a = vec![0.0; 2 * n];
        let mut data_b = vec![0.0; 2 * n];
        for i in 0..n {
            let val = (2.0 * PI * (i as f64) / (n as f64)).cos();
            data_a[i * 2] = val;
            data_b[i * 2] = val;
        }

        fft_1d(&mut data_a, n);
        fft_nd(&mut data_b, &[n]);

        assert_complex_close(&data_a, &data_b, TOL);
    }

    #[test]
    fn test_fft_linearity() {
        let n = 8;
        let a = 2.5;
        let b = -1.3;

        let mut x = vec![0.0; 2 * n];
        let mut y = vec![0.0; 2 * n];
        for i in 0..n {
            let t = (i as f64) / (n as f64);
            x[i * 2] = (2.0 * PI * t).cos();
            y[i * 2] = (2.0 * PI * 2.0 * t).sin();
        }

        // FFT(a*x + b*y)
        let mut combined = vec![0.0; 2 * n];
        for i in 0..2 * n {
            combined[i] = a * x[i] + b * y[i];
        }
        fft_1d(&mut combined, n);

        // a*FFT(x) + b*FFT(y)
        fft_1d(&mut x, n);
        fft_1d(&mut y, n);
        let mut expected = vec![0.0; 2 * n];
        for i in 0..2 * n {
            expected[i] = a * x[i] + b * y[i];
        }

        assert_complex_close(&combined, &expected, TOL);
    }
}
