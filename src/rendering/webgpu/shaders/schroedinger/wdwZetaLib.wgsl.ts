/**
 * Shared WGSL library for the WDW ⊗ ζ visualization suite.
 *
 * Provides the primitives the live sphere-tracing main block
 * (`mainWdwZetaVolume.wgsl.ts`) needs to synthesize each mode's lit 3D form
 * from the ζ-LUT: signed-distance primitives + ops, surface lighting
 * (lambert + ambient + Fresnel rim + Blinn specular), complex domain-coloring,
 * a few perceptual palettes, hashing, and the LUT-reader contract. The
 * mode-specific geometry (`wzMap`) and the gradient-based normal/AO live in the
 * main block (they reference `wzMap`, which WGSL requires defined first).
 *
 * Included only when `isWdwZetaVolume` (composed just before the main block).
 *
 * @module rendering/webgpu/shaders/schroedinger/wdwZetaLib.wgsl
 */

/**
 * Generate the shared WDW ⊗ ζ library block.
 *
 * @returns WGSL source (no entry point — helpers only).
 */
export function generateWdwZetaLib(): string {
  return /* wgsl */ `
// ============================================
// WDW ⊗ ζ suite — shared lighting / SDF / color library
// ============================================

const WZ_PI: f32 = 3.14159265359;
const WZ_TAU: f32 = 6.28318530718;
// LUT layout (mirrors src/lib/physics/wdwZeta/lut.ts):
//   [0] header A, [1] header B, [2..49] ζ-zeros (.x = tₙ), [50..] mode aux.
const WZ_ZEROS_OFF: i32 = 2;
const WZ_ZEROS_N: i32 = 48;
const WZ_AUX_OFF: i32 = 50;

// 2D analytic-field block (matches src/lib/physics/wdwZeta/lut.ts).
const WZ_FIELD_NX: i32 = 96;
const WZ_FIELD_NY: i32 = 64;
const WZ_FIELD_OFF: i32 = 128;
// Shared arithmetic-measures table (matches src/lib/physics/wdwZeta/lut.ts):
// .x = N(t) zero-count staircase, .y = Chebyshev ψ(x), .z = Mertens M(x), .w = explicit-formula osc.
const WZ_MEAS_OFF: i32 = 6272; // = WZ_FIELD_OFF + WZ_FIELD_NX*WZ_FIELD_NY
const WZ_MEAS_N: i32 = 128;

// ── LUT readers ──
fn wzHeadA() -> vec4f { return wdwZetaLut[0]; }
fn wzHeadB() -> vec4f { return wdwZetaLut[1]; }
fn wzZero(i: i32) -> f32 { return wdwZetaLut[WZ_ZEROS_OFF + clamp(i, 0, WZ_ZEROS_N - 1)].x; }
fn wzAux(i: i32) -> vec4f { return wdwZetaLut[WZ_AUX_OFF + clamp(i, 0, 110)]; }

// Linear sample of the shared arithmetic-measures table at u ∈ [0,1].
fn wzMeasure(u: f32) -> vec4f {
  let f = clamp(u, 0.0, 1.0) * f32(WZ_MEAS_N - 1);
  let i0 = i32(floor(f));
  let i1 = min(i0 + 1, WZ_MEAS_N - 1);
  return mix(wdwZetaLut[WZ_MEAS_OFF + i0], wdwZetaLut[WZ_MEAS_OFF + i1], f - f32(i0));
}

// Spectral coordinate u ∈ [0,1] for a surface point: blends radius + height so
// the arithmetic measures sweep across both flat reliefs/bowls and tall forms.
fn wzSpectralU(p: vec3f) -> f32 {
  return clamp(length(p) * 0.6 + (0.5 + 0.5 * p.y) * 0.4, 0.0, 1.0);
}

// Bilinear sample of the 2D analytic-field block at (u,v) ∈ [0,1]². Returns the
// raw vec4: .x height scalar, .y phase/action, .z signed raw, .w ridge/seam.
fn wzFieldAt(uIn: f32, vIn: f32) -> vec4f {
  let u = clamp(uIn, 0.0, 1.0) * f32(WZ_FIELD_NX - 1);
  let v = clamp(vIn, 0.0, 1.0) * f32(WZ_FIELD_NY - 1);
  let x0 = i32(floor(u));
  let y0 = i32(floor(v));
  let x1 = min(x0 + 1, WZ_FIELD_NX - 1);
  let y1 = min(y0 + 1, WZ_FIELD_NY - 1);
  let fx = u - f32(x0);
  let fy = v - f32(y0);
  let c00 = wdwZetaLut[WZ_FIELD_OFF + y0 * WZ_FIELD_NX + x0];
  let c10 = wdwZetaLut[WZ_FIELD_OFF + y0 * WZ_FIELD_NX + x1];
  let c01 = wdwZetaLut[WZ_FIELD_OFF + y1 * WZ_FIELD_NX + x0];
  let c11 = wdwZetaLut[WZ_FIELD_OFF + y1 * WZ_FIELD_NX + x1];
  return mix(mix(c00, c10, fx), mix(c01, c11, fx), fy);
}

// ── hashing (banding suppression + cheap stable noise) ──
fn wzHash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}
fn wzHash13(p: f32) -> f32 {
  return fract(sin(p * 91.3458) * 47453.5453);
}

// ── 2D rotation ──
fn wzRot(a: f32) -> mat2x2<f32> {
  let c = cos(a); let s = sin(a);
  return mat2x2<f32>(c, -s, s, c);
}

// ── Signed-distance primitives ──
fn sdSphere(p: vec3f, r: f32) -> f32 { return length(p) - r; }

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdTorus(p: vec3f, R: f32, r: f32) -> f32 {
  let q = vec2f(length(p.xz) - R, p.y);
  return length(q) - r;
}

// Infinite cone aligned to +y with half-angle whose tan = k; signed.
fn sdConeY(p: vec3f, k: f32) -> f32 {
  let q = length(p.xz);
  return (q - k * p.y) / sqrt(1.0 + k * k);
}

fn sdCapsule(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// Distance to a horizontal ring (circle of radius R in the plane y = yc).
fn sdRing(p: vec3f, R: f32, yc: f32, r: f32) -> f32 {
  let q = vec2f(length(p.xz) - R, p.y - yc);
  return length(q) - r;
}

fn wzSmin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ── Perceptual palettes ──
fn wzViridis(tIn: f32) -> vec3f {
  let t = clamp(tIn, 0.0, 1.0);
  var r: f32; var g: f32; var b: f32;
  if (t < 0.25) {
    let u = t / 0.25;
    r = mix(0.267, 0.231, u); g = mix(0.005, 0.319, u); b = mix(0.329, 0.542, u);
  } else if (t < 0.5) {
    let u = (t - 0.25) / 0.25;
    r = mix(0.231, 0.128, u); g = mix(0.319, 0.567, u); b = mix(0.542, 0.551, u);
  } else if (t < 0.75) {
    let u = (t - 0.5) / 0.25;
    r = mix(0.128, 0.373, u); g = mix(0.567, 0.785, u); b = mix(0.551, 0.380, u);
  } else {
    let u = (t - 0.75) / 0.25;
    r = mix(0.373, 0.993, u); g = mix(0.785, 0.906, u); b = mix(0.380, 0.144, u);
  }
  return vec3f(r, g, b);
}
fn wzThermal(tIn: f32) -> vec3f {
  let t = clamp(tIn, 0.0, 1.0);
  return vec3f(clamp(t * 2.4, 0.0, 1.0), clamp(t * 1.6 - 0.25, 0.0, 1.0), clamp(t * 2.2 - 1.2, 0.0, 1.0));
}
// Cosine gradient (Inigo Quilez) — smooth, saturated, tunable.
fn wzCosPal(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(WZ_TAU * (c * t + d));
}
// A warm "forged gold" ramp for positivity / purity surfaces.
fn wzGold(t: f32) -> vec3f {
  return wzCosPal(clamp(t, 0.0, 1.0), vec3f(0.36, 0.27, 0.12), vec3f(0.36, 0.30, 0.16),
                  vec3f(1.0, 1.0, 1.0), vec3f(0.0, 0.12, 0.25));
}
// Cool nebular ramp (deep indigo → cyan → pale).
fn wzNebula(t: f32) -> vec3f {
  return wzCosPal(clamp(t, 0.0, 1.0), vec3f(0.18, 0.20, 0.34), vec3f(0.30, 0.32, 0.42),
                  vec3f(1.0, 1.0, 1.0), vec3f(0.55, 0.62, 0.72));
}

// ── Complex domain coloring: phase → hue, magnitude → lightness banding ──
fn wzDomainColor(z: vec2f) -> vec3f {
  let mag = length(z);
  let phase = atan2(z.y, z.x);
  let hue = fract(phase / WZ_TAU + 1.0);
  // log-magnitude contour shading (the classic analytic domain-coloring look).
  let lm = log2(mag + 1.0);
  let band = 0.7 + 0.3 * fract(lm * 1.5);
  return hsl2rgb(hue, 0.85, 0.5 * band);
}

// ── Surface lighting: lambert key + fill + ambient + Fresnel rim + Blinn spec ──
// rd is the view ray direction (from camera into scene); n the surface normal.
fn wzShade(p: vec3f, n: vec3f, rd: vec3f, albedo: vec3f, ao: f32, rough: f32) -> vec3f {
  let v = -rd;
  // Two key lights placed in model space (the turntable rotates the object,
  // so fixed model-space lights graze the rotating form for shifting highlights).
  let l1 = normalize(vec3f(0.6, 0.85, 0.45));
  let l2 = normalize(vec3f(-0.5, 0.25, -0.7));
  let diff1 = max(dot(n, l1), 0.0);
  let diff2 = max(dot(n, l2), 0.0) * 0.4;
  // Hemisphere ambient (sky cool, ground warm) so cavities are never flat black.
  let amb = mix(vec3f(0.10, 0.12, 0.18), vec3f(0.22, 0.18, 0.14), 0.5 + 0.5 * n.y);
  // Blinn-Phong specular from the key light, narrowed by (1-rough).
  let h = normalize(l1 + v);
  let gloss = 1.0 - clamp(rough, 0.0, 1.0);
  let specPow = mix(8.0, 90.0, gloss);
  let spec = pow(max(dot(n, h), 0.0), specPow) * 0.7 * gloss * gloss;
  // Fresnel rim (view-grazing) — gives the form a luminous silhouette.
  let fres = pow(clamp(1.0 - max(dot(n, v), 0.0), 0.0, 1.0), 3.0);
  var col = albedo * ((diff1 + diff2) * vec3f(1.0, 0.96, 0.88) + amb * ao);
  col += vec3f(1.0, 0.95, 0.85) * spec * ao;
  // rim tinted by the albedo (kept low so it never washes a flat face to white)
  col += fres * albedo * 0.35;
  return col;
}

// ── Shared WDW ⊗ ζ color algorithms — each encodes a genuine number-theoretic
//    MEASURE the whole group's mathematics produces (sampled at the point's
//    spectral coordinate), never surface orientation or lighting. ──

// ζ-Zero Count N(t): the Riemann zero-counting staircase. Each integer band (one
// more non-trivial zero passed) takes a distinct spectral hue.
fn wzZetaZeroCount(p: vec3f) -> vec3f {
  let band = floor(wzMeasure(wzSpectralU(p)).x + 0.5);
  return wzCosPal(band * 0.11, vec3f(0.5), vec3f(0.5), vec3f(1.0), vec3f(0.0, 0.33, 0.67));
}

// Chebyshev ψ(x) = Σ_{pᵏ≤x} log p: the prime-power staircase, a forged-gold ramp
// rising with accumulated prime mass.
fn wzChebyshevPsi(p: vec3f) -> vec3f {
  return wzGold(0.12 + 0.82 * wzMeasure(wzSpectralU(p)).y);
}

// Mertens M(x) = Σ_{n≤x} μ(n): the signed Möbius summatory — gold where M > 0,
// indigo where M < 0, near-black at the cancellation crossings the RH bound governs.
fn wzMertens(p: vec3f) -> vec3f {
  let M = wzMeasure(wzSpectralU(p)).z; // ∈ [−1,1]
  let dark = vec3f(0.04, 0.04, 0.06);
  if (M >= 0.0) { return mix(dark, wzGold(0.62), clamp(M, 0.0, 1.0)); }
  return mix(dark, vec3f(0.32, 0.22, 0.72), clamp(-M, 0.0, 1.0));
}

// Explicit-Formula Wave: the ζ-zeros' oscillatory contribution to ψ(x),
// Σ_n cos(γₙ·log x)/√(¼+γₙ²) — cyan↔magenta by the sign/strength of the wave.
fn wzExplicitFormula(p: vec3f) -> vec3f {
  let o = wzMeasure(wzSpectralU(p)).w; // ∈ [−1,1]
  return mix(vec3f(0.85, 0.22, 0.6), vec3f(0.2, 0.75, 0.85), 0.5 + 0.5 * o);
}

// Signed distance to a filled regular polygon (inradius r, half-angle an = π/n)
// centered at the origin in the q-plane. Negative inside. (Inigo Quilez form.)
fn wzNgon(q: vec2f, r: f32, an: f32) -> f32 {
  let acs = vec2f(cos(an), sin(an));
  let a = atan2(q.x, q.y);
  let bn = a - 2.0 * an * floor(a / (2.0 * an)) - an; // fold to ∈ [−an, an)
  var pp = length(q) * vec2f(cos(bn), abs(sin(bn)));
  pp = pp - r * acs;
  pp.y = pp.y + clamp(-pp.y, 0.0, r * acs.y);
  return length(pp) * sign(pp.x);
}

// ── Mode 10: Field With One Element 𝔽₁ — cyclotomic spire of roots of unity. ──
// A vertical stack of regular n-gons (n = 1..N): ring n carries the n-th roots of
// unity μ_n as glowing vertex beads; the polygon gains sides climbing to a circle
// at the apex (the archimedean place ∞). q→1 morphs the sharp 𝔽₁ polygons toward
// the rounded 𝔽_q Frobenius circles. (mat 12.0 = WZ_EMIT_GOLD, the bead glow.)
fn wzMap10(p: vec3f, t: f32) -> vec2f {
  let H = wzHeadA();             // (maxOrder, qDeform, towerTwist, primeGlow)
  let N = max(2.0, H.x);
  // nearest cyclotomic ring (order n) by height, rings n=1..N over y ∈ [−1,1]
  let fy = clamp((p.y + 1.0) / 2.0, 0.0, 1.0) * (N - 1.0);
  let ni = clamp(round(fy), 0.0, N - 1.0);
  let n = ni + 1.0;
  let yn = -1.0 + ni / (N - 1.0) * 2.0;
  let R = 0.62 - 0.16 * (ni / (N - 1.0));          // circumradius, tapering up (a spire)
  let an = WZ_PI / max(n, 2.0);                     // π/n
  let apothem = R * cos(an);                        // inradius
  let tw = H.z * n * 0.9;                           // golden-angle twist per ring
  let cw = cos(tw);
  let sw = sin(tw);
  let q = vec2f(cw * p.x - sw * p.z, sw * p.x + cw * p.z);
  // polygon outline morphed toward a circle by the q→1 deformation
  let qb = clamp((H.y - 1.0) / 2.0, 0.0, 1.0);
  let perim = abs(mix(wzNgon(q, apothem, an), length(q) - R, qb));
  var d = length(vec2f(perim, p.y - yn)) - 0.016;
  // Lit ring-tube. matId MUST be < 9.99 (>= 9.99 routes to the emissive path);
  // wzAlbedo dispatches on the wzModeId, not matId, so 9.0 still selects mode 10.
  var mat = 9.0;
  // root-of-unity vertex beads: the n-th roots e^{2πik/n} on the circle of radius R
  let seg = WZ_TAU / n;
  let aa = atan2(q.y, q.x);
  let ka = seg * round(aa / seg);                   // nearest root-of-unity angle k·seg
  let bead = R * vec2f(cos(ka), sin(ka));
  let dVert = length(vec3f(q.x - bead.x, p.y - yn, q.y - bead.y)) - wzHeadB().x;
  if (dVert < d) { d = dVert; mat = 12.0; }
  return vec2f(d, mat);
}

// ── Color-algorithm dispatch for lit suite surfaces ──
// Returns vec4f(rgb, matched): matched = 0 means no algorithm claimed the pixel
// (the caller then falls back to the per-mode native MIXED/PHASE coloring).
// Handles the shared ramps (blackbody/viridis/contours), the 4 shared WDW ⊗ ζ
// algorithms (29-32), and the 9 lit mode-specific algorithms (33-36, 38-42);
// the primon-only Bose Occupation Heat (37) is emissive and lives in wzEmitColor.
fn wzColorAlgo(algo: i32, p: vec3f, matId: f32, s: f32) -> vec4f {
  if (algo == 5) { return vec4f(wzThermal(s), 1.0); }
  if (algo == 19) { return vec4f(wzViridis(s), 1.0); }
  if (algo == 21) {
    let band = abs(fract(p.y * 6.0 + length(p.xz) * 4.0) - 0.5) * 2.0;
    return vec4f(wzViridis(s) * (0.5 + 0.5 * smoothstep(0.1, 0.5, band)), 1.0);
  }
  // Shared (29-32) — number-theoretic measures sampled at the point's spectral coord.
  if (algo == 29) { return vec4f(wzZetaZeroCount(p), 1.0); }
  if (algo == 30) { return vec4f(wzChebyshevPsi(p), 1.0); }
  if (algo == 31) { return vec4f(wzMertens(p), 1.0); }
  if (algo == 32) { return vec4f(wzExplicitFormula(p), 1.0); }
  // ξ Phase Carpet (constraintSeam): arg ξ hue × Talbot-carpet lightness.
  if (algo == 33) {
    let band = wzHeadB().x;
    let u = mix(0.5 - band, 0.5 + band, clamp(0.5 * (p.x + 1.0), 0.0, 1.0));
    let f = wzFieldAt(u, clamp((p.z + 1.3) / 2.6, 0.0, 1.0));
    return vec4f(hsl2rgb(fract(f.y / WZ_TAU + 0.5), 0.82, 0.16 + 0.30 * f.x + 0.26 * f.z), 1.0);
  }
  // Möbius Triad (moebiusNoBoundary): μ(n) → gold / void / indigo.
  if (algo == 34) {
    let curv = wzHeadA().w;
    let cutoff = max(8.0, wzHeadA().y);
    let r = clamp(length(p.xz), 0.0, 0.985);
    let hb = 0.5 * log((1.0 + r) / (1.0 - r));
    let ringF = hb * (1.5 + 2.5 * curv);
    let ri = min(floor(ringF), 5.0);
    let sf = atan2(p.z, p.x) / WZ_TAU * (6.0 * pow(2.0, ri)) + 0.5;
    let idx = (i32(ri) * 17 + i32(floor(sf))) % i32(cutoff);
    let mu = wzAux(abs(idx) % 48).x;
    if (mu > 0.5) { return vec4f(wzGold(0.62), 1.0); }
    if (mu < -0.5) { return vec4f(0.20, 0.17, 0.55, 1.0); }
    return vec4f(0.02, 0.02, 0.035, 1.0);
  }
  // Dilation xp Flow (forcedCell): the Berry–Keating orbit invariant x·p.
  if (algo == 35) {
    let sq = wzHeadA().w;
    let xp = (p.x * exp(-sq)) * (p.z * exp(sq));
    let m = clamp(log(1.0 + abs(xp) * 6.0) / 1.5, 0.0, 1.0);
    return vec4f(mix(wzNebula(0.3 + 0.6 * m), wzThermal(0.3 + 0.6 * m), 0.5 + 0.5 * sign(xp)), 1.0);
  }
  // WKB Action Fringes (turningSurface): real ∫√U Airy bands.
  if (algo == 36) {
    let f = wzFieldAt(clamp(p.x * 0.5 + 0.5, 0.0, 1.0), clamp(p.z / 6.0 + 0.5, 0.0, 1.0));
    if (f.z < 0.0) { return vec4f(0.05, 0.04, 0.12, 1.0); }
    let fr = 0.5 + 0.5 * cos(f.y * 9.0);
    let bands = wzCosPal(fr, vec3f(0.5, 0.4, 0.5), vec3f(0.5), vec3f(1.0), vec3f(0.0, 0.2, 0.5));
    return vec4f(mix(bands, vec3f(1.0, 0.95, 0.8), f.w), 1.0);
  }
  // Purity Shells (frobeniusWheel): jewel tone per cohomological weight.
  if (algo == 38) {
    let w = (matId - 5.0) * 100.0;
    let jewel = wzCosPal(clamp(w / 6.0, 0.0, 1.0), vec3f(0.45, 0.35, 0.5), vec3f(0.45, 0.4, 0.45), vec3f(1.0), vec3f(0.0, 0.33, 0.66));
    return vec4f(jewel * (0.5 + 0.5 * s), 1.0);
  }
  // Causal Redshift (dewittCone): branch-split Doppler along the null cone.
  if (algo == 39) {
    let rs = clamp(length(p) * 0.55, 0.0, 1.0);
    let shifted = select(vec3f(0.35, 0.55, 1.0), vec3f(1.0, 0.35, 0.2), matId > 6.2);
    return vec4f(mix(vec3f(0.95, 0.97, 1.0), shifted, rs), 1.0);
  }
  // Geodesic Length Spectrum (selbergSpectrum): short = cool, long = warm.
  if (algo == 40) {
    let stripe = 0.5 + 0.5 * cos(atan2(p.z, p.x) * 3.0 + p.y * 9.0 * wzHeadB().y * (1.0 + 0.1 * wzHeadB().x));
    let lenCol = wzCosPal(clamp(0.5 + 0.5 * p.y, 0.0, 1.0), vec3f(0.5, 0.45, 0.5), vec3f(0.5), vec3f(1.0), vec3f(0.65, 0.4, 0.15));
    return vec4f(mix(vec3f(0.05, 0.07, 0.1), lenCol, smoothstep(0.6, 0.99, stripe)), 1.0);
  }
  // p-adic Valuation (adelicWavefunction): ultrametric level by depth.
  if (algo == 41) {
    let depth = clamp(length(p) * 1.2, 0.0, 1.0);
    return vec4f(hsl2rgb(fract(0.08 + floor(depth * 5.0) * 0.16), 0.7, 0.3 + 0.12 * fract(depth * 5.0)), 1.0);
  }
  // Li Positivity Sign (weilPositivity): λ_n ≥ 0 gold, λ_n < 0 violet well.
  if (algo == 42) {
    let lam = wzAux(i32(floor(clamp(length(p.xz) * 0.85, 0.0, 0.999) * wzHeadA().x))).x;
    if (lam < 0.0) { return vec4f(mix(vec3f(0.5, 0.2, 0.7), vec3f(0.2, 0.05, 0.35), clamp(-lam, 0.0, 1.0)), 1.0); }
    return vec4f(wzGold(0.4 + 0.5 * clamp(lam, 0.0, 1.0)), 1.0);
  }
  // Cyclotomic φ(n) (fieldOneElement): the primitive-root density φ(n)/n per ring
  // (= Π_{p|n}(1−1/p)) — primes (φ(p)/p = 1−1/p, high) blaze gold, highly-composite
  // orders (low density) sink to indigo. A genuine cyclotomic measure.
  if (algo == 43) {
    let N = max(2.0, wzHeadA().x);
    let ni = clamp(round(clamp((p.y + 1.0) / 2.0, 0.0, 1.0) * (N - 1.0)), 0.0, N - 1.0);
    let dens = wzAux(i32(ni)).z; // φ(n)/n ∈ (0,1]
    return vec4f(mix(vec3f(0.22, 0.16, 0.6), wzGold(0.45 + 0.5 * dens), clamp(dens, 0.0, 1.0)), 1.0);
  }
  return vec4f(0.0);
}
`
}
