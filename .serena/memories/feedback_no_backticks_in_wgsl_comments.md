---
name: No backticks in WGSL comments
description: Never put ` (backtick) characters inside comments of WGSL template literals — they prematurely terminate the JS template string.
type: feedback
---

Never place a backtick ` inside a WGSL `.wgsl.ts` comment. The `/* wgsl */` source lives inside a JS template literal delimited by backticks, so any backtick inside the template (even inside a `// ...` WGSL comment) closes the literal and the remaining WGSL code leaks into the TS program, producing gnarly TS1005 "Expected ';'" errors.

**Why:** hit repeatedly during the senior-staff-performance-audit (2026-04-24) — three separate rewrites broke esbuild because of `` `foo` `` in WGSL comments. Project also ships `scripts/check-wgsl-backticks.js` as a build guard, so it's a known repeat foot-gun.

**How to apply:** when editing a `.wgsl.ts` file, write comments using single quotes or unquoted tokens. Prefer: `// mix(a, b, t) == a + (b-a)*t` over `` // `mix(a, b, t)` == `a + (b-a)*t` ``. Same rule for the shader-side `.wgsl` comment text.
