#!/usr/bin/env bash
set -euo pipefail

cd /workspace/gpt_rh/gpt_rh_walljet_d11_20260612_175016

python3.12 --version > manifest.txt
python3.12 - <<'PY' >> manifest.txt
import datetime
import os
import platform

import sympy

print("sympy", sympy.__version__)
print("hostname", platform.node())
print("workdir", os.getcwd())
print("script_sha256", "d9ab34be3595dfce90c43feecf14988248080a8d3f78cdca817f078c48cd76ba")
print("target", "d=11 transverse-only walls 1..10")
print("launched_utc", datetime.datetime.utcnow().isoformat() + "Z")
PY

for w in $(seq 1 10); do
  ww=$(printf "%02d" "$w")
  nohup bash -lc \
    "python3.12 rh_walljet_certifier.py 11 --transverse-only --wall $w --progress > wall_${ww}.out 2> wall_${ww}.err; echo \$? > wall_${ww}.exit" \
    >/dev/null 2>&1 &
  echo "$!" > "wall_${ww}.pid"
done

{
  echo "started_pids"
  for f in wall_*.pid; do
    printf "%s " "$f"
    cat "$f"
  done
} >> manifest.txt
