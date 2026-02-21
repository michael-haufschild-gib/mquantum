Root cause: export UI slider enforces bitrate range [2,100] Mbps, but exportStore runtime paths accepted any positive bitrate via updateSettings and persist hydration.
Fix: in src/stores/exportStore.ts, clamp updateSettings bitrate patches to [2,100] and clamp hydrated persisted bitrate to [2,100] in sanitizeHydratedSettings.
Fail-first test: src/tests/stores/exportStore.test.ts -> 'clamps bitrate updates to the supported [2, 100] Mbps range' failed before fix (0.5 persisted), now passes.
Verification: export-focused suite passes (141 tests) and eslint passes on touched files.