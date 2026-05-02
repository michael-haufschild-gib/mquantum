# Web Worker Operational Contract

This project uses Web Workers to offload CPU-intensive physics off the
main thread. Each worker has a strict request/response shape and a
specific error-propagation contract. This document is the source of
truth for what a *good* worker looks like in this codebase, and where
the current set deviates.

## Invariants

Every worker MUST:

1. Have a documented `Request` and `Response` discriminated-union type
   with a `type` (or `kind`) field.
2. Carry a numeric `epoch` (or equivalent monotonic id) so the consumer
   can drop stale responses from cancelled / superseded requests.
3. Surface compute failures explicitly. The two acceptable channels are:
   - **In-band error message**: post `{ type: 'error', epoch, message }`.
     Consumer's `onmessage` branches on `type` to handle errors and
     results uniformly. Preferred — keeps the failure path on the same
     channel as the success path.
   - **Out-of-band `onerror` handler**: let exceptions propagate; the
     main thread's `worker.onerror` clears any in-flight flag and logs.
     Acceptable when the consumer can't distinguish "no result" from
     "error" anyway (e.g. one-shot fire-and-forget).
4. Never silently swallow exceptions. A bare `catch {}` that drops the
   error on the floor is a contract violation.

## Workers in this project

| Worker | In-band error? | `worker.onerror`? | Notes |
|---|---|---|---|
| `srmtSweep.worker.ts` | yes (`type: 'error'`) | yes | reference implementation |
| `srmtDiagnostic.worker.ts` | yes (`type: 'error'`) | yes | per-clock fan-out |
| `bec/incompressibleSpectrum.worker.ts` | yes (`type: 'error'`) | yes | |
| `peschelWorker.ts` | yes (`type: 'error'`) | yes | top-level `type: 'error'` upgraded 2026-05-03; `trajectoryError` for partial failures |
| `coordinateEntanglement.worker.ts` | yes (`type: 'error'`) | yes (`TdseBecStrategy.ts:467`) | upgraded 2026-05-03 |
| `freeScalar/kSpaceWorker.ts` | yes (`type: 'error'`) | yes | upgraded 2026-05-03 |
| `dirac/diracAlgebraWorker.ts` | yes (`type: 'error'`) | yes (`diracAlgebra.ts:48`) | upgraded 2026-05-03; catch + log + retry |

## Reference implementation: srmtSweep

Discriminated-union response:

```ts
type Response =
  | { type: 'progress'; epoch: number; point: SrmtSweepPoint }
  | { type: 'done'; epoch: number }
  | { type: 'error'; epoch: number; message: string }
```

Consumer pattern:

```ts
worker.onmessage = (e: MessageEvent<Response>) => {
  if (e.data.epoch !== currentEpoch) return // drop stale
  switch (e.data.type) {
    case 'progress': onPoint(e.data.point); break
    case 'done':     onComplete(); break
    case 'error':    onError(e.data.message); break
  }
}
worker.onerror = (event) => {
  // Belt-and-suspenders for uncaught throws in the worker body.
  onError(event.message ?? 'worker error event')
}
```

## Cancellation

Workers that run long jobs (`srmtSweep`) accept an `epoch`-bumped
cancel: the consumer increments the epoch on the next request, and the
worker checks the epoch between iterations and short-circuits if it's
no longer current. The drained-cancel pattern is preferred over
`worker.terminate()` because terminating drops in-flight allocations.

`peschel` echoes the epoch on its response so the consumer can drop
stale results, but does not perform in-loop epoch cancellation.

## Known deviations / ratchet

All seven workers in this project now surface compute failures via
in-band `{ type: 'error' }` responses. The consumer pattern is the
discriminated-union switch documented in the reference implementation
above; the out-of-band `onerror` handler remains as
belt-and-suspenders for uncaught throws that escape the worker's
`try/catch`.

The migration was completed across two waves:

- **2026-04-28**: `srmtSweep`, `srmtDiagnostic`, `bec/incompressibleSpectrum`.
- **2026-05-03**: `coordinateEntanglement`, `freeScalar/kSpaceWorker`,
  `dirac/diracAlgebraWorker`, `entanglement/peschelWorker`.

`peschelWorker`'s pre-existing `trajectoryError` field now coexists
with the top-level `type: 'error'` variant. `trajectoryError` signals
*partial* failure — the worker built a sweep + modular result but the
optional cosmology trajectory threw — and is meant for the UI to fall
back to the Minkowski view. Top-level `type: 'error'` signals a hard
failure where no result was produced and the consumer should drop the
spinner without rendering anything.

## Tests

Worker behaviour is validated by `*.test.ts` siblings that import the
*pure* compute function the worker delegates to (e.g.
`computeCoordinateEntanglement`, `runCutSweep`). The Vitest happy-dom
environment cannot drive the worker glue itself; the `Dispatch.test.ts`
files (e.g. `kSpaceWorkerDispatch.test.ts`) document this gap and
exercise the `onmessage` body directly via a mocked `self`.
