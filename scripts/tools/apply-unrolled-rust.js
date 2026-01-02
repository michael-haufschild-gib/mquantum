import fs from 'fs';

// Read the source files
const animationRs = fs.readFileSync('src/wasm/mdimension_core/src/animation.rs', 'utf8');
const unrolledRust = fs.readFileSync('scripts/tools/unrolled-rust.txt', 'utf8');

// Find the semi-unrolled block to replace
// Starts with "/// Specialized 6×6 matrix multiplication (semi-unrolled inner loop)"
// Ends with the closing brace of the 11×11 function (before "/// Resets a matrix to identity")

const startMarker = '/// Specialized 6×6 matrix multiplication (semi-unrolled inner loop)';
const endMarker = '/// Resets a matrix to identity';

const startIdx = animationRs.indexOf(startMarker);
const endIdx = animationRs.indexOf(endMarker);

if (startIdx === -1) {
  console.error('Could not find start marker');
  process.exit(1);
}
if (endIdx === -1) {
  console.error('Could not find end marker');
  process.exit(1);
}

console.log('Start index:', startIdx);
console.log('End index:', endIdx);

// Build the replacement - use the generated unrolled code
const replacement = unrolledRust.trim();

// Construct the new file
const before = animationRs.substring(0, startIdx);
const after = animationRs.substring(endIdx);

const newContent = before + replacement + '\n\n' + after;

fs.writeFileSync('src/wasm/mdimension_core/src/animation.rs', newContent);
console.log('Updated animation.rs with fully unrolled code');
