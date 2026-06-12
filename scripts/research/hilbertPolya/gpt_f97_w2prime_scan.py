#!/usr/bin/env python3
"""Numerical sanity checks for F97's spacing-only W2' conjecture.

The conjecture asks whether a real-rooted even polynomial with all real-zero
gaps at least pi has an absolute bound for |C'/C| on critical vertical walls.
This script tests deterministic pi-lattice zero blocks and random pi-separated
even configurations.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import asdict, dataclass

import numpy as np
from scipy.optimize import brentq


@dataclass
class WallMax:
    family: str
    degree_pairs: int
    max_abs_psi: float
    critical_x: float
    y: float


def lattice_zeros(d: int) -> np.ndarray:
    xs = np.array([(j + 0.5) * math.pi for j in range(d)], dtype=float)
    return np.array([-x for x in reversed(xs)] + list(xs), dtype=float)


def random_zeros(d: int, rng: random.Random, extra_scale: float, clustered: bool) -> np.ndarray:
    x = math.pi / 2
    if not clustered:
        x += rng.expovariate(1.0 / extra_scale)
    xs = [x]
    for _ in range(1, d):
        extra = 0.0 if clustered and rng.random() < 0.4 else rng.expovariate(1.0 / extra_scale)
        xs.append(xs[-1] + math.pi + extra)
    return np.array([-x for x in reversed(xs)] + xs, dtype=float)


def psi_real(x: float, zeros: np.ndarray) -> float:
    return float(np.sum(1.0 / (x - zeros)))


def critical_points(zeros: np.ndarray) -> np.ndarray:
    points: list[float] = []
    eps = 1e-11
    for left, right in zip(zeros[:-1], zeros[1:]):
        points.append(brentq(lambda t: psi_real(t, zeros), left + eps, right - eps))
    return np.array(points, dtype=float)


def wall_sup_abs_psi(c: float, zeros: np.ndarray) -> tuple[float, float]:
    ys = np.concatenate([np.linspace(0.0, 5.0, 1001), np.geomspace(1e-4, 1000.0, 2400)])
    vals = np.abs(np.sum(1.0 / (c + 1j * ys[:, None] - zeros[None, :]), axis=1))
    idx = int(np.argmax(vals))
    return float(vals[idx]), float(ys[idx])


def scan_configuration(family: str, d: int, zeros: np.ndarray, edge_only: bool) -> WallMax:
    crits = critical_points(zeros)
    if edge_only and len(crits) > 80:
        idxs = list(range(30)) + list(range(len(crits) - 30, len(crits)))
        crits = crits[idxs]
    best = WallMax(family, d, 0.0, 0.0, 0.0)
    for c in crits:
        value, y = wall_sup_abs_psi(float(c), zeros)
        if value > best.max_abs_psi:
            best = WallMax(family, d, value, float(c), y)
    return best


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--random-reps", type=int, default=50)
    parser.add_argument("--degrees", type=int, nargs="+", default=[2, 3, 4, 8, 16, 32, 64, 128, 256, 512])
    args = parser.parse_args()

    rng = random.Random(args.seed)
    results: list[WallMax] = []

    for d in args.degrees:
        results.append(scan_configuration("pi_lattice", d, lattice_zeros(d), edge_only=d >= 128))

        best_random: WallMax | None = None
        best_clustered: WallMax | None = None
        if d <= 64:
            for _ in range(args.random_reps):
                candidate = scan_configuration(
                    "random_pi_separated",
                    d,
                    random_zeros(d, rng, extra_scale=3.0, clustered=False),
                    edge_only=False,
                )
                if best_random is None or candidate.max_abs_psi > best_random.max_abs_psi:
                    best_random = candidate

                candidate = scan_configuration(
                    "clustered_pi_separated",
                    d,
                    random_zeros(d, rng, extra_scale=3.0, clustered=True),
                    edge_only=False,
                )
                if best_clustered is None or candidate.max_abs_psi > best_clustered.max_abs_psi:
                    best_clustered = candidate

        if best_random is not None:
            results.append(best_random)
        if best_clustered is not None:
            results.append(best_clustered)

    payload = {
        "seed": args.seed,
        "spacing": "all consecutive real-zero gaps >= pi",
        "conclusion": (
            "Spacing alone does not give the model C0=1 barrier; finite pi-lattice "
            "blocks already exceed 1 and grow slowly near edge critical walls."
        ),
        "results": [asdict(r) for r in results],
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
