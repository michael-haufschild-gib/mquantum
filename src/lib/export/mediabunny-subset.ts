/**
 * Minimal mediabunny re-export for video encoding.
 *
 * Only the 6 classes needed for video export are re-exported here.
 * This file is dynamically imported by video.ts, and because Vite/Rollup
 * can tree-shake static re-exports, the unused demuxers, input formats,
 * audio codecs, subtitle support, FLAC, ADTS, MPEG-TS, OGG, WAV, and MP3
 * modules are eliminated from the bundle.
 *
 * Before this optimization: ~492 KB raw / ~123 KB gzip
 *
 * @module lib/export/mediabunny-subset
 */

export {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
} from 'mediabunny'
