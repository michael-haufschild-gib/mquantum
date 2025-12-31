#!/usr/bin/env node
/**
 * Font Conversion Script
 *
 * Converts selected TTF fonts to WOFF2 format for self-hosting.
 * Only converts the fonts actually used by the application.
 *
 * Usage: node scripts/tools/convert-fonts.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import ttf2woff2 from 'ttf2woff2'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '../..')

// Font files to convert (only the ones we actually use)
const fontMappings = [
  {
    input: 'src/assets/fonts/inter/Inter_18pt-Regular.ttf',
    output: 'public/fonts/Inter-Regular.woff2',
  },
  {
    input: 'src/assets/fonts/inter/Inter_18pt-Medium.ttf',
    output: 'public/fonts/Inter-Medium.woff2',
  },
  {
    input: 'src/assets/fonts/inter/Inter_18pt-SemiBold.ttf',
    output: 'public/fonts/Inter-SemiBold.woff2',
  },
  {
    input: 'src/assets/fonts/jetbrains_mono/JetBrainsMono-Regular.ttf',
    output: 'public/fonts/JetBrainsMono-Regular.woff2',
  },
]

/**
 * Convert a TTF file to WOFF2
 */
function convertFont(inputPath, outputPath) {
  const inputFullPath = join(projectRoot, inputPath)
  const outputFullPath = join(projectRoot, outputPath)

  // Ensure output directory exists
  const outputDir = dirname(outputFullPath)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // Read TTF and convert to WOFF2
  const ttfBuffer = readFileSync(inputFullPath)
  const woff2Buffer = ttf2woff2(ttfBuffer)

  // Write WOFF2 file
  writeFileSync(outputFullPath, woff2Buffer)

  // Calculate sizes for reporting
  const ttfSize = (ttfBuffer.length / 1024).toFixed(1)
  const woff2Size = (woff2Buffer.length / 1024).toFixed(1)
  const compression = (((ttfBuffer.length - woff2Buffer.length) / ttfBuffer.length) * 100).toFixed(
    1
  )

  console.log(`✓ ${inputPath}`)
  console.log(`  → ${outputPath} (${ttfSize}KB → ${woff2Size}KB, ${compression}% smaller)`)
}

// Main execution
console.log('Converting fonts to WOFF2...\n')

let totalTtfSize = 0
let totalWoff2Size = 0

for (const { input, output } of fontMappings) {
  try {
    const inputFullPath = join(projectRoot, input)
    const ttfBuffer = readFileSync(inputFullPath)
    totalTtfSize += ttfBuffer.length

    convertFont(input, output)

    const outputFullPath = join(projectRoot, output)
    const woff2Buffer = readFileSync(outputFullPath)
    totalWoff2Size += woff2Buffer.length
  } catch (error) {
    console.error(`✗ Failed to convert ${input}: ${error.message}`)
    process.exit(1)
  }
}

console.log('\n─────────────────────────────────────')
console.log(
  `Total: ${(totalTtfSize / 1024).toFixed(1)}KB → ${(totalWoff2Size / 1024).toFixed(1)}KB`
)
console.log(
  `Compression: ${(((totalTtfSize - totalWoff2Size) / totalTtfSize) * 100).toFixed(1)}% smaller`
)
console.log('\nFonts ready in public/fonts/')

