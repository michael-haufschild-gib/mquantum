 1. Quantum Carpet (Spacetime Diagram)

  A 2D image where x-axis = position, y-axis = time. Each horizontal row is |ψ(x,t)|² at one timestep.
  Accumulate rows as TDSE evolves. The result is a fractal-like interference tapestry — one of the most
  visually striking images in all of physics.

  Why it's special: It shows the ENTIRE time evolution simultaneously. Quantum revivals appear as the pattern
  repeating vertically. Fractional revivals show up as the pattern at rational time fractions producing exact
  sub-copies. The Talbot effect (self-imaging of periodic structures) creates intricate moiré patterns. These
  look like Persian rugs woven from interference.

  In N-D: Take a 1D slice through your N-dimensional TDSE along any axis. The carpet reveals how dynamics along
   that slice depend on the full N-D potential landscape. In higher dimensions, you could show multiple carpets
   for different slice axes simultaneously — comparing how the evolution looks along different dimensions of
  the same N-D potential.

  Implementation: Accumulate 1D slices from the TDSE compute pass into a rolling texture buffer. Render as a 2D
   heatmap panel (canvas overlay or dedicated viewport). The TDSE solver already runs — this is pure
  visualization, no new physics compute.

  ---
  2. Classical-Quantum Correspondence

  A continuous dial from "classical" to "quantum" on the same potential. At the classical end: a sharp point
  particle following Newton's equations, tracing Lissajous curves in the N-D harmonic potential. At the quantum
   end: the full probabilistic wavefunction cloud. In between: a wavepacket that partially follows the
  classical path but spreads quantum mechanically.

  Why it's special: This is the single most important conceptual bridge in quantum mechanics, and it's almost
  never visualized interactively. Students can watch a point particle become a probability cloud by turning a
  dial. The expectation values ⟨x⟩, ⟨p⟩ always track the classical trajectory exactly (Ehrenfest's theorem) —
  but the cloud around them grows with time. In N-D harmonic oscillators, the classical orbits are
  N-dimensional Lissajous figures that would render as beautiful spiraling trajectories through the volume.

  What you'd see: A glowing particle trail (classical trajectory) embedded inside the quantum probability
  cloud. At low ℏ, the cloud hugs the trail tightly. At physical ℏ, the cloud dominates. A live readout shows
  ⟨x⟩ tracks the classical path while Δx grows — Ehrenfest's theorem made visible.

  Implementation: Classical trajectories for HO are analytical (sinusoids with the existing per-dimension ω
  values). Render as a line/particle overlay in the raymarching shader or as a 3D line pass. The "ℏ dial"
  scales the wavepacket width parameter. No new solver needed — just an overlay and parameter remapping.

  ---
  3. Quantum Chaos / Scarred Eigenstates

  Replace the harmonic potential with a classically chaotic one. The eigenstates look completely alien —
  irregular, asymmetric probability landscapes with bright "scars" tracing the paths of unstable classical
  periodic orbits.

  Why it's special: Every eigenstate currently in the app is smooth, symmetric, and regular. Chaotic
  eigenstates are the visual opposite — they look like probability was splattered randomly, except for ghostly
  bright lines (scars) that correspond to classical orbits that shouldn't matter in quantum mechanics but
  somehow do (quantum scarring is still actively researched). The contrast with your existing HO/hydrogen
  states would be immediate and visceral.

  In N-D: Coupled anharmonic oscillators (e.g., V = ½(ω₁²x₁² + ω₂²x₂² + ... ) + λ·x₁²·x₂²) are chaotic for most
   coupling values and generalize trivially to any dimension. More dimensions = richer chaos = more complex
  scar topology. You'd be visualizing high-dimensional quantum chaos, which is essentially unexplored territory
   in interactive visualization.

  Implementation: The hard part is computing eigenstates of non-integrable potentials. Two options: (a)
  imaginary-time propagation in your existing TDSE solver (propagate in τ = it, the state decays to the ground
  state), or (b) a new Lanczos/Arnoldi compute pass for low-lying eigenstates. For the potential itself, just
  add new entries to TdsePotentialType — the infrastructure for custom potentials already exists.

  ---
  4. Measurement Simulation / Born Rule Builder

  Click anywhere in the 3D volume to "measure the particle's position." The wavefunction collapses — a
  shockwave animation contracts the probability cloud to a point, sampled from |ψ|². The collapsed state then
  evolves forward from that point. Repeat many times. The accumulated measurement dots build up a pointillist
  reconstruction of |ψ|² — the Born rule demonstrated empirically.

  Why it's special: This is the most philosophically loaded operation in quantum mechanics, and making it
  interactive transforms it from abstract math to visceral experience. Students click, watch collapse, see
  randomness, then watch the pattern emerge from many trials. The transition from "random individual outcome"
  to "deterministic statistical distribution" is the heart of quantum probability.

  Extensions: Beyond position measurement — offer energy measurement (collapse to an eigenstate), angular
  momentum measurement (collapse to specific l,m), or "which dimension" measurement for N-D states (measure
  along one axis, watch the other dimensions' wavefunction update). A histogram panel shows accumulated
  statistics converging to the theoretical distribution.

  In N-D: Measuring one spatial dimension while leaving others unmeasured is a partial trace. The
  post-measurement state in the remaining dimensions depends on where the measurement landed — this is the N-D
  analog of "conditional wavefunction" without needing a second particle.

  Implementation: Sampling from |ψ|² can be done via rejection sampling on the CPU (using the eigenfunction
  evaluation you already have). Collapse = reset TDSE initial condition to narrow Gaussian at sampled point.
  The dot overlay is a simple particle buffer rendered as a point cloud pass.

  ---
  5. Spinor Wavefunctions (Pauli Equation)

  Extend from scalar ψ to two-component spinor (ψ↑, ψ↓). Add a magnetic field. The spin precesses — visible as
  the two components exchanging amplitude in a rotating pattern through the N-D volume.

  Why it's special: Spin is the most "quantum" property — no classical analog, half-integer angular momentum,
  fundamentally new. Currently 100% absent from the app. Visualizing a spinor wavefunction as two interlocked
  colored clouds (spin-up = cyan, spin-down = magenta) that precess and exchange amplitude in a magnetic field
  is genuinely novel for a web-based visualizer. Stern-Gerlach splitting — a single beam separating into two in
   a gradient field — is one of the iconic images of QM and would be dynamic and dramatic.

  In N-D: The spinor has 2 components regardless of spatial dimension. The Pauli equation in N-D is two coupled
   Schrödinger equations with a Zeeman coupling. The magnetic field defines a direction in the first 3
  dimensions; the remaining N-3 dimensions evolve independently. This means spin precession projected into
  higher-dimensional space — visually unique.

  Implementation: Extend the TDSE solver to propagate two coupled grids instead of one. The shader evaluates
  both components and combines them with distinct color channels. The magnetic field is a new uniform. Moderate
   effort — doubles the compute and memory for TDSE, but the infrastructure handles it.


New Quantum Modes

  1. Bose-Einstein Condensate (Gross-Pitaevskii Equation)

  A macroscopic quantum state with self-interaction. The GPE is the Schrödinger equation with one extra term:
  g|ψ|²ψ. That nonlinearity changes everything.

  What you'd see: Quantized vortices — point singularities in 2D where the phase winds by 2π around a
  zero-density core. In 3D, these become vortex lines that can form rings, knots, and tangles. Vortex
  reconnection events (two lines collide and re-route) are visually explosive. Dark solitons — traveling
  density dips that hold their shape forever due to nonlinearity balancing dispersion. Quantum turbulence — a
  chaotic tangle of vortex lines, the quantum analog of classical turbulence.

  In N-D: The GPE works in any dimension. Vortex topology gets increasingly exotic — in 4D+, vortex "lines"
  become vortex sheets, and reconnection events involve higher-dimensional surgery. Nobody has visualized this.

  Why it fits: The split-step FFT already in your TDSE solver handles the GPE with one additional line — a
  nonlinear phase kick exp(-ig|ψ|²dt) in the potential half-step. The rest of the pipeline (grid evolution,
  raymarching, visualization) is identical.

  Education: BEC is Nobel Prize physics (2001). Superfluidity, superconductivity, and quantum turbulence are
  all GPE phenomena. The vortices are quantum-protected topological objects — you can't remove them smoothly.

  ---
  2. Quantum Walk

  A particle that hops on an N-D lattice according to quantum rules — a "coin flip" determines direction, but
  the coin is quantum (superposition of heads and tails). Unlike a classical random walk (Gaussian spreading,
  ∝√t), a quantum walk spreads ballistically (∝t) with sharp interference peaks at the wavefront edges.

  What you'd see: Instead of a smooth Gaussian blob, the probability forms a sharp-edged polytope shape in N-D
  with intricate interference fringes inside. The wavefront races outward at constant speed while the interior
  shows complex standing-wave patterns. In 2D it's a diamond, in 3D an octahedron, in N-D a cross-polytope —
  all with internal interference structure that depends on the coin operator.

  In N-D: This is natively N-dimensional. The lattice is N-D, the coin operates on 2N internal states, and the
  interference pattern is dimension-dependent. Comparing quantum walks across dimensions 2→11 would show how
  interference patterns scale with dimensionality — something no existing tool shows.

  Why it fits: Discrete-time update on a grid. Reuses your compute shader infrastructure. Each timestep is: (1)
   apply coin operator to internal state, (2) shift amplitudes on lattice. Output is a probability grid,
  raymarched exactly like TDSE.

  Education: Quantum walks are THE algorithmic primitive for quantum computing. Grover's search, quantum
  PageRank, topological phase detection — all built on quantum walks. Comparing classical vs quantum walk
  spreading rates is an instant "aha" moment.

  ---
  3. Tight-Binding / Bloch Waves

  An electron in a crystal — a periodic potential with atoms at lattice sites. The wavefunction is a Bloch
  wave: a plane wave modulated by a lattice-periodic envelope. Band gaps emerge — forbidden energy ranges where
   no states exist.

  What you'd see: The probability density is periodic, repeating across the lattice, but with complex internal
  structure within each unit cell. At band edges, the wavefunctions "pile up" on the atoms (valence band) or
  between atoms (conduction band) — this is literally the difference between insulators and conductors, made
  visible. Wannier functions (maximally localized) look like atomic orbitals but adapted to the crystal
  symmetry.

  In N-D: The Bravais lattice generalizes to N-D with N lattice vectors. The Brillouin zone (momentum-space
  unit cell) has exotic shapes in higher dimensions. Band structure in N-D produces N-dimensional Fermi
  surfaces — the topology of these surfaces determines material properties and gets increasingly rich with
  dimension.

  Why it fits: Could be implemented as either a new analytical mode (tight-binding matrix for a few bands) or
  via your existing periodic lattice TDSE potential. The band structure is a 2D panel (energy vs momentum)
  alongside the 3D wavefunction — a new HUD element.

  Education: Connects quantum mechanics to every electronic device. Semiconductors, insulators, metals,
  topological insulators — all explained by band theory.

  ---
  4. Dirac Equation (Relativistic Quantum Mechanics)

  The Schrödinger equation's relativistic cousin. Instead of a scalar ψ, it has a multi-component spinor.
  Predicts antimatter, spin, and magnetic moments from first principles.

  What you'd see: A wavepacket approaching a potential step that transmits more probability than was incident —
   the Klein paradox (pair creation at the barrier). Zitterbewegung — a rapid trembling motion where the
  particle oscillates between particle and antiparticle components at frequency 2mc²/ℏ. Render particle
  component in one color, antiparticle in another. The two components dance around each other.

  In N-D: The Dirac algebra requires 2^(⌊N/2⌋) component spinors and N gamma matrices. In 4D: 4 components. In
  6D: 8 components. In 10D: 32 components. The spinor representation of the rotation group changes with
  dimension — visualizing this is pure mathematics made visible. (String theory uses the 10D Dirac equation.)

  Education: Antimatter, spin-orbit coupling, why the periodic table works (relativistic effects in heavy
  atoms). The Dirac equation is arguably the most important equation in physics after E=mc².

  ---
  Cross-Cutting Visualizations (work across all modes)

  5. Quantum Carpet

  For any time-evolving state, accumulate a 2D spacetime diagram: x-axis = position (1D slice through N-D),
  y-axis = time. Each row is one timestep's |ψ(x)|².

  What you'd see: Fractal-like interference tapestries. Self-similar patterns at rational fractions of the
  revival time. The Talbot effect produces exact self-images of the initial condition at specific times. These
  are objectively among the most beautiful images in physics — they look like algorithmically generated art,
  but they're pure physics.

  Works across modes: HO superpositions produce carpets with simple beating patterns. Particle-in-a-box
  produces fractal carpets. BEC would show soliton worldlines. Quantum walks produce geometric lattice
  patterns. Each mode creates a distinctive carpet.

  ---
  6. Wavefunction Sculptor

  User sculpts an arbitrary probability distribution in 3D (paint/draw tools). The app decomposes it into the
  eigenstates of the current potential (HO, hydrogen, box — whatever is active). Shows the decomposition
  coefficients. Then evolves the sculpted state forward and watches it disperse, interfere, and potentially
  revive.

  What you'd see: Draw a smiley face as your initial wavefunction. The app shows "this is 12% ground state + 8%
   (1,0,0) + 6% (0,1,0) + ..." Then hit play and watch the smiley face dissolve into quantum chaos, partially
  reform at revival times, and create interference patterns along the way.

  Education: Superposition and completeness from the creative direction — ANY shape can be expressed as a sum
  of eigenstates. Students discover that smooth shapes need few eigenstates (fast convergence) while sharp
  features need many (Gibbs phenomenon). The decomposition panel makes Fourier analysis tangible.

  ---
  7. Dimensional Crossfade

  Unique to this app's N-D capability. A slider that smoothly morphs a wavefunction from dimension D to
  dimension D+1. Watch the probability density reshape as a new spatial degree of freedom opens up.

  What you'd see: A 3D hydrogen ground state (spherical blob) gains a 4th dimension — the sphere fattens into a
   hypersphere, and when projected back to 3D, the density profile changes (the projection of a 4D Gaussian is
  different from a 3D Gaussian). Continue to 5D, 6D... each dimensional transition reshapes the visible
  projection. For HO excited states, the nodal surfaces gain additional dimensions — a planar node in 3D
  becomes a hyperplanar node in 4D.

  Education: Dimensional dependence of quantum mechanics. Why the hydrogen atom is special in 3D (Runge-Lenz
  symmetry). How degeneracy patterns change with dimension. This is the app's unique selling point and
  currently it's a discrete jump between dimensions — making it continuous would be visually powerful.

  ---
  8. Measurement Simulation / Born Rule Lab

  Click in the volume to "measure position." The app samples from |ψ|², collapses to that point, then
  optionally re-evolves. Accumulated measurement dots build up a pointillist reconstruction of the probability
  distribution.

  What you'd see: Click → shockwave collapse animation → dot appears at the measured position → wavefunction
  re-spreads. After 50 measurements, a cloud of dots that roughly matches |ψ|². After 500, a near-perfect
  reproduction. The transition from individual randomness to statistical determinism is the Born rule
  demonstrated empirically.

  Works across modes: Measure position in HO eigenstates (dots cluster at classical turning points for high-n).
   Measure in hydrogen (dots trace out orbital shapes). Measure in BEC (dots avoid vortex cores). Energy
  measurements collapse to eigenstates instead of positions.

  ---
  9. Quantum Number Atlas

  A visual encyclopedia organized by quantum numbers. For HO: a grid where rows are energy levels and columns
  are degeneracy indices. For hydrogen: the classic (n, l, m) table. Each cell shows a thumbnail of that
  eigenstate, rendered with the app's full quality engine.

  What you'd see: A periodic-table-like display of all quantum states. Color-coded by energy. Degeneracy
  visible as the number of states per energy row — and this changes with dimension. In 3D, the n-th HO shell
  has (n+1)(n+2)/2 states. In 7D, the formula is completely different. Clicking a cell loads that state in the
  main viewport.

  In N-D: The atlas layout itself changes with dimension because the degeneracy structure does. Switching from
  3D to 7D rearranges the entire table — shells grow or shrink, new quantum numbers appear. This makes abstract
   group theory (representation dimensions of SO(N)) visually concrete.

  Education: Organizing principle of quantum mechanics. Why certain states exist, why shells close, how
  symmetry determines structure.
