#!/usr/bin/env python3
"""Local pod dispatcher for the RH quest.

Keeps at most CAP concurrent `fable_*` jobs per runpod and pulls the next
queued job into any free slot. Does NO heavy compute locally — only ssh
orchestration (ps / scp / nohup). Run once per turn; it is idempotent.

Queue file: logs/rh_pod_queue.json
  {"jobs": [{"id","script","pod_pref","status","pod","log","launched_at","done_at"}]}
  status in {queued, running, done}; pod_pref in {any, "1", "2"}.

Capacity policy (user: "use both pods, do not overload, backlog when full"):
  pod 1 is shared (GPT agent + a heavy parallel project) -> small footprint.
  pod 2 is dedicated -> more slots, still conservative.
"""
import json
import os
import subprocess
import time

KEY = os.path.expanduser("~/.ssh/id_ed25519")
QUEUE = "/Users/Spare/Documents/code/mquantum/logs/rh_pod_queue.json"

PODS = {
    "1": {"host": "213.173.105.105", "port": "19850", "cap": 2},
    "2": {"host": "157.157.221.30", "port": "32272", "cap": 4},
}


def ssh(pod, cmd, timeout=60):
    p = PODS[pod]
    try:
        r = subprocess.run(
            ["ssh", "-p", p["port"], "-i", KEY, "-o", "ConnectTimeout=20",
             "-o", "StrictHostKeyChecking=accept-new", f"root@{p['host']}", cmd],
            capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except subprocess.TimeoutExpired:
        return ""


def running_scripts(pod):
    # Count only the real interpreter processes (args start with "python3.13
    # fable_"), NOT the `bash -c ... nohup python3.13 ...` launcher wrappers,
    # which would otherwise double-count and falsely report pods as full.
    out = ssh(pod, "ps -eo args= | grep -E '^python3.13 fable_' || true")
    scripts = set()
    for ln in out.strip().splitlines():
        parts = ln.split()
        if len(parts) >= 2 and parts[0] == "python3.13":
            scripts.add(parts[1])
    return scripts


def launch(pod, script):
    p = PODS[pod]
    base = os.path.basename(script)
    subprocess.run(
        ["scp", "-P", p["port"], "-i", KEY, "-o", "ConnectTimeout=20",
         script, f"root@{p['host']}:/root/{base}"],
        check=True, timeout=120)
    log = base.replace(".py", ".log")
    # The trailing `echo` gives the remote shell a foreground statement so it
    # exits and ssh returns promptly; setsid+redirects keep the job detached.
    ssh(pod, f"bash -lc 'cd /root && setsid nohup python3.13 {base} "
             f"> {log} 2>&1 < /dev/null & echo LAUNCHED_{base}'", timeout=40)
    return log


def main():
    with open(QUEUE) as f:
        q = json.load(f)

    live = {pod: running_scripts(pod) for pod in PODS}

    # Reap: a 'running' job whose script no longer appears in ps is done.
    for job in q["jobs"]:
        if job["status"] == "running":
            base = os.path.basename(job["script"])
            if base not in live.get(job.get("pod", ""), set()):
                job["status"] = "done"
                job["done_at"] = time.strftime("%Y-%m-%d %H:%M:%S")

    count = {pod: len(live[pod]) for pod in PODS}

    # Fill free slots from the backlog, in queue order.
    for pod in PODS:
        while count[pod] < PODS[pod]["cap"]:
            nxt = next((j for j in q["jobs"]
                        if j["status"] == "queued"
                        and j["pod_pref"] in (pod, "any")), None)
            if not nxt:
                break
            if not os.path.exists(nxt["script"]):
                print(f"SKIP {nxt['id']}: local script missing {nxt['script']}")
                nxt["status"] = "missing"
                continue
            log = launch(pod, nxt["script"])
            nxt.update(status="running", pod=pod, log=log,
                       launched_at=time.strftime("%Y-%m-%d %H:%M:%S"))
            count[pod] += 1

    with open(QUEUE, "w") as f:
        json.dump(q, f, indent=2)

    for pod in PODS:
        print(f"pod{pod}: {count[pod]}/{PODS[pod]['cap']} slots used")
    for j in q["jobs"]:
        print(f"  [{j['status']:8}] pod{j.get('pod','-')} {j['id']:18} {j.get('log','')}")


if __name__ == "__main__":
    main()
