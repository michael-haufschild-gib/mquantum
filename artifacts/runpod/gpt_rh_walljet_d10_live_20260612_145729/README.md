# GPT walljet d=10 live snapshot

Snapshot time: 2026-06-12 14:57 Europe/Gibraltar.

Remote endpoint:

```text
ssh root@157.157.221.30 -p 12784 -i ~/.ssh/id_ed25519
```

Remote source:

```text
/workspace/gpt_rh/walljet_d10/
```

Command pattern:

```text
rh_walljet_certifier.py 10 --wall j --transverse-only --progress
```

Status at snapshot:

```text
d=10, nine wall workers running on Runpod.
All walls had passed q^1 through q^5.
All stderr files were empty.
Workers were continuing at q^6.
Q degrees: q=20, s=19, r=8.
```

This is a partial live preservation snapshot, not the final d=10
certificate archive.
