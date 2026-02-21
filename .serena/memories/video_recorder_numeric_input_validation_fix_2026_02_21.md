Root cause: VideoRecorder.initialize accepted runtime-invalid width/height/fps/bitrate values and forwarded them into composition/encoder setup.
Fix: added initialize-time validation for positive-finite width/height/fps/bitrate, normalized width/height to integer >=2, and added safe runtime fallbacks for format/codec/bitrateMode/hardwareAcceleration in src/lib/export/video.ts.
Behavior note: preserved prior non-finite duration progress fallback (did not enforce strict duration rejection in initialize).
Fail-first test: src/tests/lib/export/video.test.ts -> 'rejects non-positive numeric runtime options during initialize' failed before fix and now passes.
Verification: export-focused vitest suite (140 tests) and eslint on touched files pass.