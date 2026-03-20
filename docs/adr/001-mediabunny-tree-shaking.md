# ADR-001: Tree-shake mediabunny via re-export subset

**Status**: Accepted
**Date**: 2026-03-20
**Deciders**: Project maintainer

## Context

The `mediabunny` library (WebCodecs-based video muxer) is used for video export. The project uses 6 of its exports: `Output`, `Mp4OutputFormat`, `WebMOutputFormat`, `BufferTarget`, `StreamTarget`, `CanvasSource`.

The library ships a full ESM module tree with demuxers, input format parsers, audio codecs (FLAC, ADTS, OGG, WAV, MP3), subtitle support, and conversion utilities. It declares `sideEffects: false` in package.json.

The library was loaded via `await import('mediabunny')`, which returns a namespace object. Rollup cannot tree-shake namespace property access because it cannot statically determine which properties will be accessed at runtime. This resulted in the full library (491 KB raw / 123 KB gzip) being bundled despite only 6 classes being used.

## Decision

Introduce `src/lib/export/mediabunny-subset.ts` — a thin file that statically re-exports only the 6 needed classes:

```ts
export { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, StreamTarget, CanvasSource } from 'mediabunny'
```

`video.ts` dynamically imports this subset file instead of `mediabunny` directly:

```ts
_mediabunny = await import('./mediabunny-subset')
```

Static named re-exports are analyzable by Rollup, enabling tree-shaking at the re-export boundary.

## Alternatives Considered

1. **Static top-level import**: Would lose lazy loading — mediabunny would be in the critical bundle path instead of loaded on-demand when the user initiates an export.

2. **Destructured dynamic import** (`const { Output } = await import('mediabunny')`): Still a namespace import at the Rollup level — no tree-shaking benefit.

3. **Fork mediabunny**: Over-engineering. The 22-line subset file achieves the same result.

4. **Replace mediabunny with raw WebCodecs**: Would require reimplementing MP4/WebM muxing (ISOBMFF box layout, Matroska EBML encoding), which is exactly what mediabunny provides. Unjustified.

## Consequences

**Positive**:
- mediabunny chunk: 491 KB -> 164 KB raw (67% reduction), 123 KB -> 42 KB gzip (66% reduction)
- Total JS gzip: 637 KB -> 558 KB (12% reduction)
- Lazy loading preserved — subset is still dynamically imported
- Bundle budget tightened: mediabunny cap 130 KB -> 50 KB, total 650 KB -> 570 KB

**Negative**:
- Developers must update `mediabunny-subset.ts` when adding new mediabunny features
- ~164 KB remains because the MP4/WebM muxers depend on shared codec infrastructure

**Ratchets**:
- `scripts/check-bundle-size.js` enforces 50 KB gzip cap for the mediabunny chunk
- CI runs the budget check after every build
