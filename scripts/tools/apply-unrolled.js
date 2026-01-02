import fs from 'fs';

// Read the source files
const matrixTs = fs.readFileSync('src/lib/math/matrix.ts', 'utf8');
const unrolledJs = fs.readFileSync('scripts/tools/unrolled-js.txt', 'utf8');

// Find the semi-unrolled block to replace (lines 234-316)
// Starts with "  // OPT-MAT-3: Fast path for 6×6"
// Ends with the closing brace of the 11×11 block

const startMarker = '  // OPT-MAT-3: Fast path for 6×6 matrices (6D visualization)';
const endMarker = `    if (isAliased) out.set(target)
    return
  }

  const dim = Math.sqrt(len)`;

const startIdx = matrixTs.indexOf(startMarker);
const endIdx = matrixTs.indexOf(endMarker) + endMarker.indexOf('\n\n  const dim');

if (startIdx === -1) {
  console.error('Could not find start marker');
  process.exit(1);
}

// Find the end of the 11x11 block (the line before "const dim = Math.sqrt(len)")
const beforeEnd = matrixTs.substring(0, matrixTs.indexOf('\n  const dim = Math.sqrt(len)', startIdx));
const actualEndIdx = beforeEnd.length;

console.log('Start index:', startIdx);
console.log('End index:', actualEndIdx);

// Build the replacement - use the generated unrolled code but keep consistent formatting
const replacement = unrolledJs.trim();

// Construct the new file
const before = matrixTs.substring(0, startIdx);
const after = matrixTs.substring(actualEndIdx);

const newContent = before + replacement + '\n\n' + after;

fs.writeFileSync('src/lib/math/matrix.ts', newContent);
console.log('Updated matrix.ts with fully unrolled code');
