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
| `peschelWorker.ts` | no | yes | swallow-then-fallback pattern |
| `coordinateEntanglement.worker.ts` | no | yes (`TdseBecStrategy.ts:467`) | exceptions propagate |
| `freeScalar/kSpaceWorker.ts` | no | yes | `FreeScalarFieldKSpace.ts:251` |
| `dirac/diracAlgebraWorker.ts` | no | yes (`diracAlgebra.ts:48`) | catch + log + retry |

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

`peschelWorker`, `coordinateEntanglement.worker`, `kSpaceWorker`, and
`diracAlgebraWorker` rely on out-of-band `onerror` only. They are
acceptable today because each consumer pairs the worker with a
graceful-fallback path (clear the in-flight flag, log, accept "no
result for this frame"). The migration task is to add `type: 'error'`
responses so the consumer doesn't have to listen on two channels — see
`docs/refactoring-backlog.md` for the queue.

## Tests

Worker behaviour is validated by `*.test.ts` siblings that import the
*pure* compute function the worker delegates to (e.g.
`computeCoordinateEntanglement`, `runCutSweep`). The Vitest happy-dom
environment cannot drive the worker glue itself; the `Dispatch.test.ts`
files (e.g. `kSpaceWorkerDispatch.test.ts`) document this gap and
exercise the `onmessage` body directly via a mocked `self`.
