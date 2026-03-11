//! N-dimensional Clifford algebra generation for the Dirac equation.
//!
//! Generates alpha matrices (α₁..αₙ) and beta (β) satisfying:
//!   {αᵢ, αⱼ} = 2δᵢⱼ·I
//!   {αⱼ, β} = 0
//!   β² = I
//!
//! Uses the standard recursive tensor-product construction.

/// Complex S×S matrix stored as flat Vec<f32> with re/im interleaved.
/// Layout: [re(0,0), im(0,0), re(0,1), im(0,1), ..., re(S-1,S-1), im(S-1,S-1)]
/// Total length: S * S * 2
pub type ComplexMatrix = Vec<f32>;

/// Compute spinor dimension for Dirac equation in N spatial dimensions.
///
/// The Dirac equation needs N alpha matrices plus beta (N+1 total anticommuting
/// involutions). The Clifford algebra Cl(N+1) has irreducible representation of
/// dimension S = 2^(⌊(N+1)/2⌋), minimum 2.
///
/// N=1→2, N=2→2, N=3→4, N=4→4, N=5→8, N=6→8, N=7→16, N=8→16, N=9→32, N=10→32, N=11→64
///
/// Pairs: (1,2)→2, (3,4)→4, (5,6)→8, (7,8)→16, (9,10)→32, (11)→64
pub fn spinor_size(spatial_dim: usize) -> usize {
    (1usize << ((spatial_dim + 1) / 2)).max(2)
}

/// Complex S×S identity matrix.
fn complex_identity(s: usize) -> ComplexMatrix {
    let mut m = vec![0.0f32; s * s * 2];
    for i in 0..s {
        m[(i * s + i) * 2] = 1.0; // re = 1
    }
    m
}

/// Complex S×S zero matrix.
fn complex_zeros(s: usize) -> ComplexMatrix {
    vec![0.0f32; s * s * 2]
}

/// Get complex entry (row, col) from an S×S matrix.
#[inline]
fn get_entry(m: &[f32], s: usize, row: usize, col: usize) -> (f32, f32) {
    let idx = (row * s + col) * 2;
    (m[idx], m[idx + 1])
}

/// Set complex entry (row, col) in an S×S matrix.
#[inline]
fn set_entry(m: &mut [f32], s: usize, row: usize, col: usize, re: f32, im: f32) {
    let idx = (row * s + col) * 2;
    m[idx] = re;
    m[idx + 1] = im;
}

/// Kronecker (tensor) product of two complex matrices: A ⊗ B.
/// A is a_size×a_size, B is b_size×b_size.
/// Result is (a_size*b_size) × (a_size*b_size).
fn kronecker_product(a: &[f32], a_size: usize, b: &[f32], b_size: usize) -> ComplexMatrix {
    let out_size = a_size * b_size;
    let mut result = complex_zeros(out_size);
    for ar in 0..a_size {
        for ac in 0..a_size {
            let (a_re, a_im) = get_entry(a, a_size, ar, ac);
            if a_re == 0.0 && a_im == 0.0 {
                continue;
            }
            for br in 0..b_size {
                for bc in 0..b_size {
                    let (b_re, b_im) = get_entry(b, b_size, br, bc);
                    // (a_re + i*a_im)(b_re + i*b_im) = (a_re*b_re - a_im*b_im) + i(a_re*b_im + a_im*b_re)
                    let out_re = a_re * b_re - a_im * b_im;
                    let out_im = a_re * b_im + a_im * b_re;
                    let out_row = ar * b_size + br;
                    let out_col = ac * b_size + bc;
                    set_entry(&mut result, out_size, out_row, out_col, out_re, out_im);
                }
            }
        }
    }
    result
}

/// Complex matrix multiplication C = A × B (both S×S).
fn complex_mat_mul(a: &[f32], b: &[f32], s: usize) -> ComplexMatrix {
    let mut c = complex_zeros(s);
    for i in 0..s {
        for k in 0..s {
            let (a_re, a_im) = get_entry(a, s, i, k);
            if a_re == 0.0 && a_im == 0.0 {
                continue;
            }
            for j in 0..s {
                let (b_re, b_im) = get_entry(b, s, k, j);
                let (c_re, c_im) = get_entry(&c, s, i, j);
                let new_re = c_re + a_re * b_re - a_im * b_im;
                let new_im = c_im + a_re * b_im + a_im * b_re;
                set_entry(&mut c, s, i, j, new_re, new_im);
            }
        }
    }
    c
}

/// Add two complex matrices: C = A + B.
fn complex_mat_add(a: &[f32], b: &[f32]) -> ComplexMatrix {
    a.iter().zip(b.iter()).map(|(x, y)| x + y).collect()
}

/// Scale a complex matrix by a real scalar.
fn complex_mat_scale(m: &[f32], s: f32) -> ComplexMatrix {
    m.iter().map(|x| x * s).collect()
}

// ============================================================================
// Pauli matrices (2×2)
// ============================================================================

/// σ₁ = [[0,1],[1,0]]
fn sigma1() -> ComplexMatrix {
    let mut m = complex_zeros(2);
    set_entry(&mut m, 2, 0, 1, 1.0, 0.0);
    set_entry(&mut m, 2, 1, 0, 1.0, 0.0);
    m
}

/// σ₂ = [[0,-i],[i,0]]
fn sigma2() -> ComplexMatrix {
    let mut m = complex_zeros(2);
    set_entry(&mut m, 2, 0, 1, 0.0, -1.0);
    set_entry(&mut m, 2, 1, 0, 0.0, 1.0);
    m
}

/// σ₃ = [[1,0],[0,-1]]
fn sigma3() -> ComplexMatrix {
    let mut m = complex_zeros(2);
    set_entry(&mut m, 2, 0, 0, 1.0, 0.0);
    set_entry(&mut m, 2, 1, 1, -1.0, 0.0);
    m
}

// ============================================================================
// Dirac matrix generation
// ============================================================================

/// Generate all Dirac matrices for N spatial dimensions.
///
/// Returns (alphas, beta) where:
///   alphas: Vec of N complex matrices, each S×S
///   beta: one S×S complex matrix
///
/// Construction:
///   1D (S=2): α₁ = σ₁, β = σ₃
///   2D (S=2): α₁ = σ₁, α₂ = σ₂, β = σ₃
///   3D (S=4): αⱼ = [[0, σⱼ], [σⱼ, 0]], β = [[I₂, 0], [0, -I₂]]
///   4D (S=4): adds α₄ = [[0, -iI₂], [iI₂, 0]]
///   5D (S=4): adds α₅ = chirality matrix = i·α₁·α₂·α₃·α₄·β
///   6D+ (S doubles): recursive tensor products
pub fn generate_dirac_matrices(spatial_dim: usize) -> (Vec<ComplexMatrix>, ComplexMatrix) {
    assert!(spatial_dim >= 1 && spatial_dim <= 11, "spatial_dim must be 1..=11");

    match spatial_dim {
        1 => {
            // S=2: α₁ = σ₁, β = σ₃
            (vec![sigma1()], sigma3())
        }
        2 => {
            // S=2: α₁ = σ₁, α₂ = σ₂, β = σ₃
            (vec![sigma1(), sigma2()], sigma3())
        }
        _ => {
            // For dim >= 3, build from the even-dimensional base case
            // and extend with odd dimensions using chirality
            generate_higher_dim(spatial_dim)
        }
    }
}

/// Generate Dirac matrices for spatial dimension >= 3.
///
/// Strategy: build the base even-dimensional algebra that provides our target
/// spinor size S, then select or extend as needed:
/// - If N < base_even: use first N alphas from the base, plus beta
/// - If N == base_even: use all alphas, plus beta
/// - If N == base_even + 1: add chirality matrix as extra alpha
fn generate_higher_dim(spatial_dim: usize) -> (Vec<ComplexMatrix>, ComplexMatrix) {
    let target_s = spinor_size(spatial_dim);
    // base_even = 2 * log2(target_s): the even dimension that generates target_s
    let base_even = 2 * (target_s.trailing_zeros() as usize);

    // Start from 2D base
    let mut all_alphas: Vec<ComplexMatrix> = vec![sigma1(), sigma2()];
    let mut beta = sigma3();
    let mut current_s: usize = 2;

    // Build up to base_even
    let mut current_dim: usize = 2;
    while current_dim < base_even {
        let old_s = current_s;
        current_s *= 2;
        let s3 = sigma3();
        let s1 = sigma1();
        let s2 = sigma2();
        let id_old = complex_identity(old_s);

        // Extend existing alphas: αⱼ → αⱼ ⊗ σ₃
        for alpha in all_alphas.iter_mut() {
            *alpha = kronecker_product(alpha, old_s, &s3, 2);
        }

        // New alpha for dimension 2k-1: I ⊗ σ₁
        all_alphas.push(kronecker_product(&id_old, old_s, &s1, 2));

        // New alpha for dimension 2k: I ⊗ σ₂
        all_alphas.push(kronecker_product(&id_old, old_s, &s2, 2));

        // Extend beta: β → β ⊗ σ₃
        beta = kronecker_product(&beta, old_s, &s3, 2);

        current_dim += 2;
    }

    // Now all_alphas has base_even alphas and beta, all of size current_s = target_s.
    // Select the first spatial_dim alphas (spatial_dim <= base_even always holds).
    assert!(spatial_dim <= base_even,
        "spatial_dim={spatial_dim} exceeds base_even={base_even}");
    all_alphas.truncate(spatial_dim);

    (all_alphas, beta)
}

/// Verify anticommutation relations (for testing).
///
/// Checks:
///   {αᵢ, αⱼ} = 2δᵢⱼ·I  for all i, j
///   {αⱼ, β} = 0          for all j
///   β² = I
pub fn verify_clifford_algebra(
    alphas: &[ComplexMatrix],
    beta: &ComplexMatrix,
    s: usize,
) -> bool {
    let id = complex_identity(s);
    let two_id = complex_mat_scale(&id, 2.0);
    let tol = 1e-5;

    // Check {αᵢ, αⱼ} = αᵢαⱼ + αⱼαᵢ = 2δᵢⱼI
    for i in 0..alphas.len() {
        for j in 0..alphas.len() {
            let ab = complex_mat_mul(&alphas[i], &alphas[j], s);
            let ba = complex_mat_mul(&alphas[j], &alphas[i], s);
            let anticomm = complex_mat_add(&ab, &ba);

            if i == j {
                // Should equal 2I
                if !matrices_close(&anticomm, &two_id, tol) {
                    return false;
                }
            } else {
                // Should equal 0
                let zero = complex_zeros(s);
                if !matrices_close(&anticomm, &zero, tol) {
                    return false;
                }
            }
        }
    }

    // Check {αⱼ, β} = 0
    for alpha in alphas {
        let ab = complex_mat_mul(alpha, beta, s);
        let ba = complex_mat_mul(beta, alpha, s);
        let anticomm = complex_mat_add(&ab, &ba);
        let zero = complex_zeros(s);
        if !matrices_close(&anticomm, &zero, tol) {
            return false;
        }
    }

    // Check β² = I
    let b2 = complex_mat_mul(beta, beta, s);
    if !matrices_close(&b2, &id, tol) {
        return false;
    }

    true
}

/// Check if two complex matrices are close within tolerance.
fn matrices_close(a: &[f32], b: &[f32], tol: f32) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() < tol)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spinor_sizes() {
        // S = 2^(⌊(N+1)/2⌋), minimum 2
        // Pairs (N, N+1) sharing same S: (1,2)→2, (3,4)→4, (5,6)→8, (7,8)→16, (9,10)→32
        assert_eq!(spinor_size(1), 2);
        assert_eq!(spinor_size(2), 2);
        assert_eq!(spinor_size(3), 4);
        assert_eq!(spinor_size(4), 4);
        assert_eq!(spinor_size(5), 8);
        assert_eq!(spinor_size(6), 8);
        assert_eq!(spinor_size(7), 16);
        assert_eq!(spinor_size(8), 16);
        assert_eq!(spinor_size(9), 32);
        assert_eq!(spinor_size(10), 32);
        assert_eq!(spinor_size(11), 64);
    }

    #[test]
    fn test_anticommutation_all_dims() {
        for dim in 1..=11 {
            let (alphas, beta) = generate_dirac_matrices(dim);
            let s = spinor_size(dim);
            assert_eq!(alphas.len(), dim, "Wrong number of alpha matrices for dim={dim}");
            assert_eq!(beta.len(), s * s * 2, "Wrong beta size for dim={dim}");
            assert!(
                verify_clifford_algebra(&alphas, &beta, s),
                "Clifford algebra verification failed for dim={dim}"
            );
        }
    }

    #[test]
    fn test_h_squared_equals_e_squared_identity() {
        // For a few k-vectors, verify H_free² = E²·I
        // H_free = Σⱼ αⱼ·kⱼ + β·m  (setting c=ℏ=1)
        let test_cases: Vec<(usize, Vec<f32>)> = vec![
            (1, vec![1.0]),
            (2, vec![1.0, 0.5]),
            (3, vec![1.0, 0.5, -0.3]),
            (4, vec![0.7, -0.2, 0.4, 0.1]),
            (5, vec![0.3, -0.5, 0.2, 0.8, -0.1]),
        ];
        let m: f32 = 1.0;

        for (dim, k_vec) in &test_cases {
            let s = spinor_size(*dim);
            let (alphas, beta) = generate_dirac_matrices(*dim);

            // Build H_free = Σ αⱼ·kⱼ + β·m
            let mut h = complex_mat_scale(&beta, m);
            for (j, alpha) in alphas.iter().enumerate() {
                let term = complex_mat_scale(alpha, k_vec[j]);
                h = complex_mat_add(&h, &term);
            }

            // Compute H²
            let h2 = complex_mat_mul(&h, &h, s);

            // Compute E² = Σ kⱼ² + m²
            let k2: f32 = k_vec.iter().map(|ki| ki * ki).sum();
            let e2 = k2 + m * m;

            // Check H² = E²·I
            let expected = complex_mat_scale(&complex_identity(s), e2);
            assert!(
                matrices_close(&h2, &expected, 1e-4),
                "H²≠E²I for dim={dim}, k={k_vec:?}"
            );
        }
    }

    #[test]
    fn test_1d_matrices_are_pauli() {
        let (alphas, beta) = generate_dirac_matrices(1);
        // α₁ = σ₁ = [[0,1],[1,0]]
        assert!((get_entry(&alphas[0], 2, 0, 1).0 - 1.0).abs() < 1e-6);
        assert!((get_entry(&alphas[0], 2, 1, 0).0 - 1.0).abs() < 1e-6);
        // β = σ₃ = [[1,0],[0,-1]]
        assert!((get_entry(&beta, 2, 0, 0).0 - 1.0).abs() < 1e-6);
        assert!((get_entry(&beta, 2, 1, 1).0 - (-1.0)).abs() < 1e-6);
    }
}
