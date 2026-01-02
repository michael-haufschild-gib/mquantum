import fs from 'fs';

// Generate fully unrolled matrix multiply for dimensions 6-11

function generateJS(n) {
  const lines = [`  // OPT-MAT: Fully unrolled ${n}x${n} matrix multiplication`];
  lines.push(`  if (len === ${n*n}) {`);
  lines.push(`    const isAliased = out === a || out === b`);
  lines.push(`    const target = isAliased ? getAliasScratch(${n}) : out`);

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const outIdx = row * n + col;
      const terms = [];
      for (let k = 0; k < n; k++) {
        const aIdx = row * n + k;
        const bIdx = k * n + col;
        terms.push(`a[${aIdx}]!*b[${bIdx}]!`);
      }
      lines.push(`    target[${outIdx}] = ${terms.join(' + ')}`);
    }
  }

  lines.push(`    if (isAliased) out.set(target)`);
  lines.push(`    return`);
  lines.push(`  }`);
  return lines.join('\n');
}

function generateRust(n) {
  const lines = [`/// Fully unrolled ${n}x${n} matrix multiplication`];
  lines.push(`#[inline(always)]`);
  lines.push(`fn multiply_matrices_${n}x${n}(out: &mut [f64], a: &[f64], b: &[f64]) {`);

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const outIdx = row * n + col;
      const terms = [];
      for (let k = 0; k < n; k++) {
        const aIdx = row * n + k;
        const bIdx = k * n + col;
        terms.push(`a[${aIdx}]*b[${bIdx}]`);
      }
      lines.push(`    out[${outIdx}] = ${terms.join(' + ')};`);
    }
  }

  lines.push(`}`);
  return lines.join('\n');
}

let jsCode = '';
for (let n = 6; n <= 11; n++) {
  jsCode += generateJS(n) + '\n\n';
}
fs.writeFileSync('scripts/tools/unrolled-js.txt', jsCode);
console.log('Wrote JS to unrolled-js.txt');

let rustCode = '';
for (let n = 6; n <= 11; n++) {
  rustCode += generateRust(n) + '\n\n';
}
fs.writeFileSync('scripts/tools/unrolled-rust.txt', rustCode);
console.log('Wrote Rust to unrolled-rust.txt');
