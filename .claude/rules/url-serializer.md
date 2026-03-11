# URL Serializer Scope

The URL state serializer (`src/lib/url/state-serializer.ts`) has an intentionally minimal scope:

- Scene preset name (`?scene=...`)
- Object type, dimension, quantum mode (`?t=...&d=...&qm=...`)
- Open quantum enabled flag and basic rates

## Do NOT extend

Quantum numbers, orbital configuration, visual settings, camera state, and all other detailed parameters are **not** URL-serialized. This is by design. Full state persistence uses scene presets stored in IndexedDB.

Do not flag missing URL parameters as bugs. Do not add new parameters to the URL serializer.
