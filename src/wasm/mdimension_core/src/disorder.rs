//! Seeded disorder generation on N-D lattices.
//!
//! Bit-exact JS mulberry32 parity: the PRNG reproduces the same sequence as
//! `src/lib/math/rng.ts::mulberry32`, so presets that hash a seed through the
//! TS fallback and the WASM path land on the same lattice bytes.

/// Mulberry32 stepper. Returns the next uniform f64 in `[0, 1)` and updates
/// `state` in place using the same bit pattern as the JS implementation.
#[inline]
fn mulberry32_next(state: &mut u32) -> f64 {
    *state = state.wrapping_add(0x6d2b_79f5);
    let s = *state;
    let mut t = (s ^ (s >> 15)).wrapping_mul(1 | s);
    t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(0x3D | t))) ^ t;
    f64::from(t ^ (t >> 14)) / 4_294_967_296.0
}

/// Box-Muller transform: emit two independent N(0, 1) samples.
#[inline]
fn gaussian_pair(state: &mut u32) -> (f64, f64) {
    let mut u1 = mulberry32_next(state);
    while u1 == 0.0 {
        u1 = mulberry32_next(state);
    }
    let u2 = mulberry32_next(state);
    let r = (-2.0 * u1.ln()).sqrt();
    let theta = 2.0 * std::f64::consts::PI * u2;
    (r * theta.cos(), r * theta.sin())
}

/// Generate `total_sites` samples of uniform noise in `[-0.5, 0.5]`.
///
/// Mirrors `src/lib/physics/tdse/disorderNoise.ts::generateDisorderNoise`.
pub fn generate_disorder_noise(total_sites: usize, seed: u32) -> Vec<f32> {
    let mut out = vec![0.0_f32; total_sites];
    let mut state = seed;
    for slot in &mut out {
        *slot = (mulberry32_next(&mut state) - 0.5) as f32;
    }
    out
}

/// Distribution selector for Anderson disorder — `0 = uniform`, `1 = gaussian`.
#[derive(Clone, Copy, Debug)]
pub enum DisorderDistribution {
    Uniform,
    Gaussian,
}

impl DisorderDistribution {
    /// Decode from the stable u32 wire representation used at the WASM boundary.
    pub fn from_u32(code: u32) -> Option<Self> {
        match code {
            0 => Some(Self::Uniform),
            1 => Some(Self::Gaussian),
            _ => None,
        }
    }
}

/// Generate an Anderson disorder potential on the lattice.
///
/// Mirrors `src/lib/physics/anderson/disorderPotential.ts`. Uniform draws in
/// `[-W/2, +W/2]`, Gaussian draws with standard deviation `W` (the legacy JS
/// code multiplies the N(0, 1) sample by `W` directly — reproduced here).
pub fn generate_disorder_potential(
    total_sites: usize,
    disorder_strength: f64,
    seed: u32,
    distribution: DisorderDistribution,
) -> Vec<f32> {
    let mut out = vec![0.0_f32; total_sites];
    let mut state = seed;

    match distribution {
        DisorderDistribution::Uniform => {
            let half_w = disorder_strength * 0.5;
            for slot in &mut out {
                *slot = ((mulberry32_next(&mut state) - 0.5) * 2.0 * half_w) as f32;
            }
        }
        DisorderDistribution::Gaussian => {
            // Pairs — matches the JS loop that consumes two samples per iteration.
            let mut i = 0;
            while i < total_sites {
                let (g1, g2) = gaussian_pair(&mut state);
                out[i] = (disorder_strength * g1) as f32;
                if i + 1 < total_sites {
                    out[i + 1] = (disorder_strength * g2) as f32;
                }
                i += 2;
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// mulberry32 stays inside `[0, 1)` and advances state deterministically.
    /// Bit-exact parity with the JS implementation is covered in the Vitest
    /// parity suite (`src/tests/lib/physics/wasmInitLoopsParity.test.ts`),
    /// which has access to both the Rust and JS paths.
    #[test]
    fn mulberry32_range_and_determinism() {
        let mut state: u32 = 42;
        let first: Vec<f64> = (0..8).map(|_| mulberry32_next(&mut state)).collect();
        for &v in &first {
            assert!((0.0..1.0).contains(&v));
        }
        let mut state2: u32 = 42;
        let second: Vec<f64> = (0..8).map(|_| mulberry32_next(&mut state2)).collect();
        assert_eq!(first, second);
    }

    #[test]
    fn disorder_noise_in_range() {
        let noise = generate_disorder_noise(10_000, 1337);
        for &v in &noise {
            assert!(v >= -0.5 && v < 0.5, "noise out of range: {v}");
        }
    }

    #[test]
    fn disorder_noise_deterministic() {
        let a = generate_disorder_noise(128, 99);
        let b = generate_disorder_noise(128, 99);
        assert_eq!(a, b);
    }

    #[test]
    fn disorder_noise_seed_changes_sequence() {
        let a = generate_disorder_noise(128, 1);
        let b = generate_disorder_noise(128, 2);
        assert_ne!(a, b);
    }

    #[test]
    fn uniform_disorder_within_half_width() {
        let w = 3.0;
        let pot = generate_disorder_potential(4096, w, 42, DisorderDistribution::Uniform);
        for &v in &pot {
            assert!(v >= (-w * 0.5) as f32 && v <= (w * 0.5) as f32);
        }
    }

    #[test]
    fn gaussian_disorder_has_finite_variance() {
        let w = 1.0;
        let pot = generate_disorder_potential(16_384, w, 7, DisorderDistribution::Gaussian);
        let mean: f64 = pot.iter().map(|&v| f64::from(v)).sum::<f64>() / pot.len() as f64;
        let var: f64 = pot
            .iter()
            .map(|&v| (f64::from(v) - mean).powi(2))
            .sum::<f64>()
            / pot.len() as f64;
        // Legacy JS uses `disorderStrength * g` where g ~ N(0,1), so σ ≈ W.
        assert!((var.sqrt() - w).abs() < 0.1, "σ drift: got {}", var.sqrt());
    }
}
