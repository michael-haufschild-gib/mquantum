# Quantum Walk Mode

## Purpose

Documents the mathematical formulation, coin operators, shift operator,
and analytical benchmarks for the discrete-time quantum walk (DTQW) on an
N-dimensional lattice.

## 1. Theoretical Basis

### 1.1 Discrete-Time Quantum Walk

A DTQW on a D-dimensional lattice consists of:

1. **Internal (coin) state**: A 2D-component complex vector at each lattice
   site, with components indexed by direction (±1 along each spatial axis).
2. **Coin operator** C: A 2D × 2D unitary matrix applied at each site.
3. **Conditional shift operator** S: Moves amplitude to neighboring sites
   based on the coin state.

One step of the walk is: |ψ(t+1)⟩ = S · (C ⊗ I_position) · |ψ(t)⟩

The walk is a discrete-time, discrete-space unitary evolution — not a
discretization of a continuous PDE. There is no temporal or spatial truncation
error. Each step is an exact application of unitary operators.

**Source**: Kempe, J. "Quantum random walks: An introductory overview."
*Contemp. Phys.* **44**, 307–327 (2003).
DOI: [10.1080/00107151031000110776](https://www.tandfonline.com/doi/abs/10.1080/00107151031000110776).
[Wikipedia: Quantum walk](https://en.wikipedia.org/wiki/Quantum_walk).

### 1.2 Key Properties

- **Ballistic spreading**: Standard deviation σ ∝ t (linear in time), vs
  σ ∝ √t for classical random walks.
- **Unitarity**: Probability is exactly conserved at each step.
- **No continuum limit needed**: The walk IS the physical system, not an
  approximation to one.

## 2. Coin Operators

### 2.1 Grover Coin

The Grover diffusion operator on the 2D-dimensional coin space:

    G_jk = 2/N - δ_jk,  where N = 2D

This is the "inversion about the mean" operator. Applied as:
out[j] = (2/N) · Σ_k in[k] - in[j].

**Code**: `quantumWalkCoin.wgsl.ts:41–55`.

### 2.2 Hadamard Coin

For D dimensions, the coin is a tensor product of D independent 2×2 Hadamard
gates, one per spatial axis:

    H = (1/√2) [[1, 1], [1, -1]]

Each gate acts on the pair of directions (±1) along one axis. The full coin is
H^{⊗D} (dimension 2D × 2D).

**Code**: `quantumWalkCoin.wgsl.ts:56–69`.

### 2.3 DFT Coin

The discrete Fourier transform matrix on the 2D-dimensional coin space:

    F_jk = exp(2πi·jk/N) / √N,  where N = 2D

**Code**: `quantumWalkCoin.wgsl.ts:71–91`.

## 3. Shift Operator

The conditional shift moves amplitude based on coin state:

- Coin state j = 2d: shift +1 along axis d
- Coin state j = 2d+1: shift -1 along axis d

Two boundary modes are supported:

- **Periodic** (default, absorber off): Toroidal wrapping via modular arithmetic.
- **Open** (absorber on): Out-of-bounds source sites contribute zero. Amplitude
  that would leave the domain is discarded. Combined with PML damping in the
  absorber layer, this strongly suppresses reflections at domain boundaries.

The implementation reads from the source site that would have contributed to
each destination, avoiding write conflicts.

**Code**: `quantumWalkShift.wgsl.ts`.

## 4. Konno Limit Distribution

### 4.1 Theoretical Result

For a 1D Hadamard walk with symmetric initial state
|ψ₀⟩ = (1/√2)(|L⟩ - i|R⟩) ⊗ |center⟩, the scaled position X_t/t converges
weakly to the Konno distribution:

    f_K(x) = 1 / (π(1 - x²)√(1 - 2x²))  for x ∈ (-1/√2, 1/√2)

The second moment E[V²] = 1 - 1/√2 ≈ 0.29289, giving Var(X_t) ~ (1 - 1/√2)·t²
as t → ∞. This confirms the ballistic (not diffusive) spreading.

**Source**: Konno, N. "A new type of limit theorems for the one-dimensional
quantum random walk." *J. Math. Soc. Japan* **57**(4), 1179–1195 (2005).
[Project Euclid](https://projecteuclid.org/euclid.jmsj/1150287309).

### 4.2 Numerical Verification

The Konno limit is verified by running a 1000-step Hadamard walk and comparing
E[X²/t²] against the exact second moment.

**Code**: `quantumWalk.test.ts` (Konno limit tests).

## 5. Equation-to-Code Mapping

| Physics formula | Code location |
|-|-|
| Grover coin G_jk = 2/N - δ_jk | `quantumWalkCoin.wgsl.ts:41–55` |
| Hadamard H = (1/√2)[[1,1],[1,-1]] per axis | `quantumWalkCoin.wgsl.ts:56–69` |
| DFT F_jk = exp(2πijk/N)/√N | `quantumWalkCoin.wgsl.ts:71–91` |
| Conditional shift (±1 per axis) | `quantumWalkShift.wgsl.ts:36–69` |
| PML absorber (optional) | `quantumWalkAbsorber.wgsl.ts` |
| QW diagnostics | `qwDiagnostics.wgsl.ts` |

## 6. Accuracy Characterization

### 6.1 Exactness

The quantum walk applies exact unitary operators at each step. There is no
truncation, splitting, or approximation error. The only error source is f32
rounding in the cos/sin evaluations (DFT coin) and the 1/√2 constant
(Hadamard coin), both of which are O(ε) ≈ 10⁻⁷ per operation.

### 6.2 Long-Time Accumulation

Over T steps with a 2D-dimensional coin, each step applies O(2D) multiply-add
operations per site. The accumulated rounding error in probability is:

    Δ(total_prob) ≲ T · 2D · ε

For T = 1000, D = 3: Δ ≲ 6 × 10⁻⁴. The test tolerance of 10⁻⁶ for
probability conservation confirms this is well controlled.

## 7. Validation

| Benchmark | Test | Tolerance |
|-|-|-|
| Grover coin preserves probability | `quantumWalk.test.ts` | 10⁻⁶ |
| Hadamard coin preserves probability | `quantumWalk.test.ts` | 10⁻⁶ |
| DFT coin preserves probability | `quantumWalk.test.ts` | 10⁻⁶ |
| Shift operator preserves probability | `quantumWalk.test.ts` | 10⁻⁶ |
| Full step (coin+shift) preserves probability | `quantumWalk.test.ts` | 10⁻⁶ |
| 1D Hadamard: ballistic spreading | `quantumWalk.test.ts` | qualitative |
| 3D DFT preserves probability | `quantumWalk.test.ts` | 10⁻⁶ |
| Konno second moment E[V²] = 1 - 1/√2 | `quantumWalk.test.ts` | 5% |
| Konno convergence improves with T | `quantumWalk.test.ts` | monotonic |
| Symmetric initial: E[X_t] = 0 | `quantumWalk.test.ts` | 10⁻² |

Full validation details: [`validation-methodology.md`](validation-methodology.md).

## References

- Kempe, J. "Quantum random walks: An introductory overview." *Contemp. Phys.*
  **44**, 307–327 (2003).
  DOI: [10.1080/00107151031000110776](https://www.tandfonline.com/doi/abs/10.1080/00107151031000110776).
  arXiv: [quant-ph/0303081](https://arxiv.org/abs/quant-ph/0303081).
- Konno, N. "A new type of limit theorems for the one-dimensional quantum
  random walk." *J. Math. Soc. Japan* **57**(4), 1179–1195 (2005).
  [Project Euclid](https://projecteuclid.org/euclid.jmsj/1150287309).
- [Wikipedia: Quantum walk](https://en.wikipedia.org/wiki/Quantum_walk) —
  DTQW definition, coin and shift operators, ballistic spreading.
