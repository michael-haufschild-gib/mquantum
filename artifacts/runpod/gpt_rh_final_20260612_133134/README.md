# GPT RH Runpod Final Snapshot

Final post-exit archive from GPT's dedicated Runpod.

Remote endpoint used:

```text
ssh root@157.157.221.30 -p 12784 -i ~/.ssh/id_ed25519
```

Remote workdir:

```text
/workspace/gpt_rh
```

Snapshot time:

```text
local: 2026-06-12 13:31:34 Europe/Gibraltar
remote manifest: 2026-06-12T11:31:36+00:00
```

Archive:

```text
gpt_rh_selected_snapshot.tgz
sha256: 8659e35afdfa9b25b326186f57fe52337f88b48748fb3951f0dc013cbd223b2c
```

Environment from `remote_manifest.txt`:

```text
mpmath==1.3.0
sympy==1.14.0
```

Preserved proof-relevant contents:

```text
fable_xicheck/gpt_fable_xicheck.py
fable_xicheck/latest.out
fable_xicheck/latest.err
fable_xicheck/latest.pid
xihead_audit/gpt_xihead_audit.py
xihead_audit/run_20260612_123309/xi_log_moments.json
xihead_audit/run_20260612_123309/xihead_audit_events.jsonl
xihead_audit/run_20260612_123309/xi_head_shift_0_roots.json
xihead_audit/run_20260612_123309/xi_head_shift_16_roots.json
xihead_audit/run_20260612_123309/xi_head_shift_64_roots.json
xihead_audit/run_20260612_123309/f89_head_identity.json
rh_walljet_certifier.py
walljet_d9*.log
walljet_d9*.pid
```

XICHECK status:

```text
K=140 re-root done [2026s]
Onset set: 60 zeros below 0.8*z*(140)=527.02
60 winding rows preserved
done in 2594s
stderr empty
no active python/xicheck process in final remote manifest
```

Verdict:

```text
All 60 K=140 onset candidates have K=140 winding count 1 but K=240/K=360
counts numerically zero on the tested circles. The K=140 nonreal onset arc is
therefore a Szego/Turan section artifact in this audit, not a surviving F62
candidate. This refutes the existing K=140 section-zero candidates but does not
constitute an RH proof.
```

Use `remote_manifest.txt` for file sizes, timestamps, process status, and
package versions. Use `gpt_rh_selected_snapshot.tgz.sha256` to verify archive
integrity.

F89 local derived artifact:

```text
xihead_audit/run_20260612_123309/f89_head_identity.json
```

This file was generated locally after the remote archive to verify the exact
identity

```text
Phi_{xi,0}(s)=Xi(sqrt(exp(-DeltaLG0)s))/Xi(0).
```

It records max log-coefficient error `8.1789141241617601921916806975e-118`
through degree 90 and zero checks against the archived shift-0 root file. This
derived JSON is not part of the original `gpt_rh_selected_snapshot.tgz`; it is
part of the local project worktree.
