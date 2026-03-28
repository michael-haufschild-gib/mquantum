/**
 * Classical Hamiltonian Orbit Integrator for N-D Potentials
 *
 * Symplectic Störmer-Verlet (velocity Verlet / leapfrog) integrator for
 * Hamilton's equations in N spatial dimensions. Preserves phase-space volume
 * — critical for accurate long-time trajectories in chaotic systems.
 *
 * Supports all TDSE potential types via analytical gradient functions.
 * Used for eigenstate–orbit autocorrelation (quantum scar detection).
 *
 * @module lib/physics/tdse/classicalOrbit
 */

import type { TdseConfig } from '@/lib/geometry/extended/tdse'

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single point on a classical trajectory. */
export interface OrbitPoint {
  /** Position vector (length = latticeDim) */
  x: Float64Array
  /** Momentum vector (length = latticeDim) */
  p: Float64Array
}

/** Result of integrating a classical trajectory. */
export interface ClassicalTrajectory {
  /** Trajectory points sampled every `sampleInterval` steps */
  points: OrbitPoint[]
  /** Total energy H at t=0 (should be conserved) */
  energy: number
  /** Energy drift |H(t_final) - H(0)| / |H(0)| */
  energyDrift: number
  /** Number of spatial dimensions */
  dim: number
}

/** Configuration for orbit generation. */
export interface OrbitConfig {
  /** Number of integration steps */
  steps: number
  /** Integration time step */
  dt: number
  /** Sample one point every N steps (reduces memory) */
  sampleInterval: number
  /** Number of independent orbits to generate */
  numOrbits: number
  /** Gaussian tube width for scar weight (in spatial units) */
  tubeWidth: number
  /** PRNG seed for reproducible initial conditions */
  seed: number
}

/** Default orbit generation parameters. */
export const DEFAULT_ORBIT_CONFIG: OrbitConfig = {
  steps: 10000,
  dt: 0.005,
  sampleInterval: 5,
  numOrbits: 8,
  tubeWidth: 0.3,
  seed: 314159,
}

// ─── Potential & Gradient ───────────────────────────────────────────────────

/**
 * Evaluate the potential V(x) for a given TDSE configuration.
 *
 * Implements the same potential functions as the WGSL shader
 * (tdsePotential.wgsl.ts) but in JavaScript for CPU-side orbit integration.
 *
 * @param x - Position vector (length = latticeDim)
 * @param config - TDSE configuration
 * @returns Potential energy V(x)
 */
export function evaluatePotential(x: Float64Array, config: TdseConfig): number {
  const dim = x.length
  const pot = config.potentialType

  if (pot === 'free') return 0

  if (pot === 'harmonicTrap') {
    let r2 = 0
    for (let d = 0; d < dim; d++) r2 += x[d]! * x[d]!
    return 0.5 * config.mass * config.harmonicOmega * config.harmonicOmega * r2
  }

  if (pot === 'coupledAnharmonic') {
    const omega2 = config.harmonicOmega * config.harmonicOmega
    let harmonic = 0
    for (let d = 0; d < dim; d++) harmonic += x[d]! * x[d]!
    harmonic *= 0.5 * config.mass * omega2

    let coupling = 0
    for (let i = 0; i < dim; i++) {
      for (let j = i + 1; j < dim; j++) {
        coupling += x[i]! * x[i]! * x[j]! * x[j]!
      }
    }
    return harmonic + config.anharmonicLambda * coupling
  }

  if (pot === 'doubleWell') {
    const a = config.doubleWellSeparation
    const lam = config.doubleWellLambda
    const eps = config.doubleWellAsymmetry
    const x0 = x[0]!
    const t = x0 * x0 - a * a
    return lam * t * t - eps * x0
  }

  if (pot === 'barrier') {
    const dist = Math.abs(x[0]! - config.barrierCenter)
    return dist < config.barrierWidth * 0.5 ? config.barrierHeight : 0
  }

  if (pot === 'finiteWell') {
    return Math.abs(x[0]!) < config.wellWidth * 0.5 ? -config.wellDepth : 0
  }

  if (pot === 'periodicLattice') {
    const phase = Math.PI * x[0]! / Math.max(config.latticePeriod, 1e-6)
    const c = Math.cos(phase)
    return config.latticeDepth * c * c
  }

  if (pot === 'radialDoubleWell') {
    let r2 = 0
    for (let d = 0; d < dim; d++) r2 += x[d]! * x[d]!
    const r = Math.sqrt(r2)
    const dr1 = r - config.radialWellInner
    const dr2 = r - config.radialWellOuter
    return config.radialWellDepth * dr1 * dr1 * dr2 * dr2 - config.radialWellTilt * r
  }

  if (pot === 'becTrap') {
    const omega0 = config.harmonicOmega
    const anisotropy = config.trapAnisotropy ?? []
    let sum = 0
    for (let d = 0; d < dim; d++) {
      const omega_d = omega0 * (anisotropy[d] ?? 1.0)
      sum += omega_d * omega_d * x[d]! * x[d]!
    }
    return 0.5 * config.mass * sum
  }

  // step, driven, doubleSlit, custom — use harmonic fallback
  // (classical orbits are most meaningful for smooth confining potentials)
  let r2 = 0
  for (let d = 0; d < dim; d++) r2 += x[d]! * x[d]!
  return 0.5 * config.mass * config.harmonicOmega * config.harmonicOmega * r2
}

/**
 * Compute the gradient ∇V(x) via central finite differences.
 *
 * This is general-purpose and works for all potential types. For potentials
 * with analytical gradients (harmonic, coupled anharmonic), the analytical
 * version could be faster, but finite differences are simpler and the orbit
 * computation is not performance-critical.
 *
 * @param x - Position vector
 * @param config - TDSE configuration
 * @param grad - Output gradient vector (modified in place)
 * @param h - Finite difference step size
 */
export function computeGradient(
  x: Float64Array,
  config: TdseConfig,
  grad: Float64Array,
  h = 1e-5
): void {
  const dim = x.length
  const inv2h = 1.0 / (2.0 * h)
  for (let d = 0; d < dim; d++) {
    const orig = x[d]!
    x[d] = orig + h
    const vPlus = evaluatePotential(x, config)
    x[d] = orig - h
    const vMinus = evaluatePotential(x, config)
    x[d] = orig
    grad[d] = (vPlus - vMinus) * inv2h
  }
}

// ─── Integrator ─────────────────────────────────────────────────────────────

/**
 * Integrate Hamilton's equations using symplectic Störmer-Verlet.
 *
 * The velocity Verlet scheme:
 *   p(t + dt/2) = p(t) - (dt/2) · ∇V(x(t))
 *   x(t + dt)   = x(t) + (dt/m) · p(t + dt/2)
 *   p(t + dt)   = p(t + dt/2) - (dt/2) · ∇V(x(t + dt))
 *
 * @param x0 - Initial position
 * @param p0 - Initial momentum
 * @param config - TDSE configuration (potential params + mass)
 * @param orbitCfg - Integration parameters
 * @returns Trajectory with sampled points
 */
export function integrateOrbit(
  x0: Float64Array,
  p0: Float64Array,
  config: TdseConfig,
  orbitCfg: OrbitConfig
): ClassicalTrajectory {
  const dim = x0.length
  const dt = orbitCfg.dt
  const halfDt = dt / 2
  const invMass = 1.0 / Math.max(config.mass, 1e-10)

  // Working arrays
  const x = new Float64Array(x0)
  const p = new Float64Array(p0)
  const grad = new Float64Array(dim)

  // Initial energy
  let ke = 0
  for (let d = 0; d < dim; d++) ke += p[d]! * p[d]!
  ke *= 0.5 * invMass
  const initialEnergy = ke + evaluatePotential(x, config)

  const points: OrbitPoint[] = []

  // Sample initial point
  points.push({
    x: new Float64Array(x),
    p: new Float64Array(p),
  })

  for (let step = 1; step <= orbitCfg.steps; step++) {
    // Half-step momentum
    computeGradient(x, config, grad)
    for (let d = 0; d < dim; d++) p[d] = p[d]! - halfDt * grad[d]!

    // Full-step position
    for (let d = 0; d < dim; d++) x[d] = x[d]! + dt * invMass * p[d]!

    // Half-step momentum
    computeGradient(x, config, grad)
    for (let d = 0; d < dim; d++) p[d] = p[d]! - halfDt * grad[d]!

    // Sample point
    if (step % orbitCfg.sampleInterval === 0) {
      points.push({
        x: new Float64Array(x),
        p: new Float64Array(p),
      })
    }
  }

  // Final energy for drift measurement
  let keFinal = 0
  for (let d = 0; d < dim; d++) keFinal += p[d]! * p[d]!
  keFinal *= 0.5 * invMass
  const finalEnergy = keFinal + evaluatePotential(x, config)
  const energyDrift = initialEnergy !== 0 ? Math.abs(finalEnergy - initialEnergy) / Math.abs(initialEnergy) : 0

  return { points, energy: initialEnergy, energyDrift, dim }
}

// ─── Orbit Generation ───────────────────────────────────────────────────────

/**
 * Generate multiple classical orbits at a target energy.
 *
 * Initial conditions are sampled from the classically allowed region:
 * 1. Random position direction (uniform on S^{N-1})
 * 2. Random radius such that V(r·n̂) < targetEnergy
 * 3. Momentum magnitude set to conserve energy: |p| = √(2m(E - V(x)))
 * 4. Random momentum direction
 *
 * @param targetEnergy - Target total energy for the orbits
 * @param config - TDSE configuration
 * @param orbitCfg - Orbit generation parameters
 * @returns Array of classical trajectories
 */
export function generateOrbitsAtEnergy(
  targetEnergy: number,
  config: TdseConfig,
  orbitCfg: OrbitConfig = DEFAULT_ORBIT_CONFIG
): ClassicalTrajectory[] {
  const dim = config.latticeDim
  const orbits: ClassicalTrajectory[] = []
  let rng = orbitCfg.seed | 0

  for (let orbitIdx = 0; orbitIdx < orbitCfg.numOrbits; orbitIdx++) {
    // Generate random position in classically allowed region
    const x0 = new Float64Array(dim)
    const p0 = new Float64Array(dim)

    // Try to find a valid starting position (V(x) < E)
    let found = false
    for (let attempt = 0; attempt < 100; attempt++) {
      // Random direction on S^{N-1} via normalized Gaussian vector
      let norm2 = 0
      for (let d = 0; d < dim; d++) {
        // Box-Muller from mulberry32 PRNG
        rng = (rng + 0x6d2b79f5) | 0
        let t1 = Math.imul(rng ^ (rng >>> 15), 1 | rng)
        t1 = (t1 + Math.imul(t1 ^ (t1 >>> 7), 61 | t1)) ^ t1
        const u1 = ((t1 ^ (t1 >>> 14)) >>> 0) / 4294967296

        rng = (rng + 0x6d2b79f5) | 0
        let t2 = Math.imul(rng ^ (rng >>> 15), 1 | rng)
        t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2
        const u2 = ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296

        const g = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
        x0[d] = g
        norm2 += g * g
      }
      const normInv = 1.0 / Math.sqrt(Math.max(norm2, 1e-20))
      for (let d = 0; d < dim; d++) x0[d] = x0[d]! * normInv

      // Random radius: sample uniformly in [0, r_max] where r_max is the classical turning point
      // For harmonic-like potentials, r_max ~ sqrt(2E / (mω²))
      const omega = Math.max(config.harmonicOmega, 0.1)
      const rMax = Math.sqrt(Math.max(2 * Math.abs(targetEnergy) / (config.mass * omega * omega), 0.1))

      rng = (rng + 0x6d2b79f5) | 0
      let t3 = Math.imul(rng ^ (rng >>> 15), 1 | rng)
      t3 = (t3 + Math.imul(t3 ^ (t3 >>> 7), 61 | t3)) ^ t3
      const u3 = ((t3 ^ (t3 >>> 14)) >>> 0) / 4294967296
      // Uniform in r^D for uniform volume sampling
      const r = rMax * Math.pow(u3, 1.0 / dim)

      for (let d = 0; d < dim; d++) x0[d] = x0[d]! * r

      const V = evaluatePotential(x0, config)
      if (V < targetEnergy) {
        // Assign momentum to conserve energy
        const keNeeded = targetEnergy - V
        if (keNeeded > 0) {
          // Random momentum direction
          let pNorm2 = 0
          for (let d = 0; d < dim; d++) {
            rng = (rng + 0x6d2b79f5) | 0
            let tp = Math.imul(rng ^ (rng >>> 15), 1 | rng)
            tp = (tp + Math.imul(tp ^ (tp >>> 7), 61 | tp)) ^ tp
            const up1 = ((tp ^ (tp >>> 14)) >>> 0) / 4294967296

            rng = (rng + 0x6d2b79f5) | 0
            let tp2 = Math.imul(rng ^ (rng >>> 15), 1 | rng)
            tp2 = (tp2 + Math.imul(tp2 ^ (tp2 >>> 7), 61 | tp2)) ^ tp2
            const up2 = ((tp2 ^ (tp2 >>> 14)) >>> 0) / 4294967296

            const gp = Math.sqrt(-2 * Math.log(Math.max(up1, 1e-10))) * Math.cos(2 * Math.PI * up2)
            p0[d] = gp
            pNorm2 += gp * gp
          }
          const pMag = Math.sqrt(2 * config.mass * keNeeded)
          const pScale = pMag / Math.sqrt(Math.max(pNorm2, 1e-20))
          for (let d = 0; d < dim; d++) p0[d] = p0[d]! * pScale
        }
        found = true
        break
      }
    }

    if (!found) {
      // Fallback: start at origin with all kinetic energy
      x0.fill(0)
      p0.fill(0)
      if (dim > 0) p0[0] = Math.sqrt(2 * config.mass * Math.abs(targetEnergy))
    }

    orbits.push(integrateOrbit(x0, p0, config, orbitCfg))
  }

  return orbits
}
