# GPT RH Runpod Snapshot — 2026-06-12 13:25 CEST

Point-in-time snapshot from GPT's dedicated temporary Runpod:

```text
ssh root@157.157.221.30 -p 12784 -i ~/.ssh/id_ed25519
remote root: /workspace/gpt_rh
remote host: 576c883b8605
```

Archive:

```text
gpt_rh_selected_snapshot.tgz
sha256: 5879db1524fa00687511ab9a74b433a7293ad33ecf6c7d3f56387ab6aa9290ca
```

Contents preserved:

```text
fable_xicheck/
  gpt_fable_xicheck.py
  latest.out / latest.err / latest.pid

xihead_audit/
  gpt_xihead_audit.py
  latest.out / latest.err / latest.pid / latest_run
  run_20260612_123309/
    xi_log_moments.json
    xihead_audit_events.jsonl
    xi_head_shift_0_roots.json
    xi_head_shift_16_roots.json
    xi_head_shift_64_roots.json

rh_walljet_certifier.py
walljet_d9*.log / walljet_d9*.pid
remote_manifest.txt
```

Interpretation:

```text
This is not the final xicheck state. PID 4623 was still running when this
snapshot was taken. The K=140 re-root had completed; early K=140 candidate
windings were already collapsing at K=240/K=360, suggesting Szego/Turan
section artifacts. A final post-exit snapshot should supersede this one for
proof writing.
```
