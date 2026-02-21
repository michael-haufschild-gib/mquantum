Root cause: VideoRecorder.initialize passed options.rotation directly to addVideoTrack using only nullish fallback; runtime invalid values (e.g., 45) were forwarded.
Fix: in src/lib/export/video.ts initialize, added normalizedRotation guard accepting only 0/90/180/270 and fallback to 0.
Fail-first test: src/tests/lib/export/video.test.ts -> 'coerces invalid runtime rotation metadata to 0 degrees' failed before fix (45 propagated), passes after fix.
Verification: targeted video test and full export suite pass.