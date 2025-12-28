#!/usr/bin/env node
/**
 * Favicon and Social Image Generator
 *
 * Generates all required favicon sizes and social media images from source logos.
 *
 * Usage: node scripts/tools/generate-favicons.mjs
 *
 * Input:
 *   - src/assets/logo/logo_transparent.png (2048x2048) - for favicons
 *   - src/assets/logo/logo.jpeg (2048x2048) - for social images
 *
 * Output (to src/assets/logo/):
 *   - favicon.ico (16x16, 32x32, 48x48)
 *   - apple-touch-icon.png (180x180)
 *   - favicon-192.png (192x192)
 *   - favicon-512.png (512x512)
 *   - og-image.jpg (1200x630)
 *   - twitter-card.jpg (1200x630)
 *   - logo-topbar.png (64x64)
 *   - manifest.webmanifest
 */

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const LOGO_TRANSPARENT = path.join(ROOT_DIR, 'src/assets/logo/logo_transparent.png');
const LOGO_OPAQUE = path.join(ROOT_DIR, 'src/assets/logo/logo.jpeg');
const OUTPUT_DIR = path.join(ROOT_DIR, 'src/assets/logo');

// Dark background color matching the app
const DARK_BG = { r: 13, g: 13, b: 15, alpha: 1 }; // #0d0d0f

/**
 * Generate a PNG favicon at specified size
 */
async function generatePngFavicon(inputPath, outputPath, size) {
  await sharp(inputPath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outputPath);
  console.log(`  Created: ${path.basename(outputPath)} (${size}x${size})`);
}

/**
 * Generate ICO file with multiple sizes
 */
async function generateIco(inputPath, outputPath) {
  const sizes = [16, 32, 48];
  const tempFiles = [];

  // Generate temp PNGs for each size
  for (const size of sizes) {
    const tempPath = path.join(OUTPUT_DIR, `_temp_${size}.png`);
    await sharp(inputPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(tempPath);
    tempFiles.push(tempPath);
  }

  // Convert to ICO
  const icoBuffer = await pngToIco(tempFiles);
  await fs.writeFile(outputPath, icoBuffer);
  console.log(`  Created: ${path.basename(outputPath)} (${sizes.join(', ')}px)`);

  // Cleanup temp files
  for (const tempFile of tempFiles) {
    await fs.unlink(tempFile);
  }
}

/**
 * Generate social media image (OG/Twitter) with centered logo on dark background
 */
async function generateSocialImage(inputPath, outputPath, width, height) {
  // Calculate logo size - use 60% of the height for the logo
  const logoSize = Math.floor(height * 0.7);

  // First resize the logo
  const resizedLogo = await sharp(inputPath)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  // Create dark background and composite logo centered
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: DARK_BG
    }
  })
    .composite([{
      input: resizedLogo,
      gravity: 'center'
    }])
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  console.log(`  Created: ${path.basename(outputPath)} (${width}x${height})`);
}

/**
 * Main generation function
 */
async function main() {
  console.log('\nFavicon & Social Image Generator\n');
  console.log('================================\n');

  // Verify input files exist
  try {
    await fs.access(LOGO_TRANSPARENT);
    await fs.access(LOGO_OPAQUE);
  } catch {
    console.error('Error: Source logo files not found!');
    console.error(`  Expected: ${LOGO_TRANSPARENT}`);
    console.error(`  Expected: ${LOGO_OPAQUE}`);
    process.exit(1);
  }

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log('Generating favicons from transparent logo...\n');

  // Generate PNG favicons (from transparent)
  await generatePngFavicon(LOGO_TRANSPARENT, path.join(OUTPUT_DIR, 'apple-touch-icon.png'), 180);
  await generatePngFavicon(LOGO_TRANSPARENT, path.join(OUTPUT_DIR, 'favicon-192.png'), 192);
  await generatePngFavicon(LOGO_TRANSPARENT, path.join(OUTPUT_DIR, 'favicon-512.png'), 512);
  await generatePngFavicon(LOGO_TRANSPARENT, path.join(OUTPUT_DIR, 'logo-topbar.png'), 64);

  // Generate ICO (from transparent)
  await generateIco(LOGO_TRANSPARENT, path.join(OUTPUT_DIR, 'favicon.ico'));

  console.log('\nGenerating social images from opaque logo...\n');

  // Generate social media images (use transparent logo on dark bg for better quality)
  await generateSocialImage(LOGO_TRANSPARENT, path.join(OUTPUT_DIR, 'og-image.jpg'), 1200, 630);
  await generateSocialImage(LOGO_TRANSPARENT, path.join(OUTPUT_DIR, 'twitter-card.jpg'), 1200, 630);

  // Generate manifest.webmanifest
  const manifest = {
    name: 'MDimension - N-Dimensional Object Visualizer',
    short_name: 'MDimension',
    description: 'Explore and visualize n-dimensional geometric objects in real-time 3D',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0d0f',
    theme_color: '#0d0d0f',
    orientation: 'any',
    icons: [
      { src: '/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    categories: ['education', 'utilities', 'visualization']
  };
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'manifest.webmanifest'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('  Created: manifest.webmanifest');

  console.log('\n================================');
  console.log('All images generated successfully!\n');
  console.log('Output directory:', OUTPUT_DIR);
  console.log('\nGenerated files:');

  const files = await fs.readdir(OUTPUT_DIR);
  const generatedFiles = files.filter(f =>
    f.endsWith('.ico') ||
    f.endsWith('.png') ||
    f.endsWith('.jpg') ||
    f.endsWith('.webmanifest')
  );

  for (const file of generatedFiles.sort()) {
    const stats = await fs.stat(path.join(OUTPUT_DIR, file));
    const sizeKb = (stats.size / 1024).toFixed(1);
    console.log(`  ${file} (${sizeKb} KB)`);
  }

  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
