#!/usr/bin/env python3
"""通过 cliproxyapi 的 gemini-3.1-flash-image 生成图片（免费额度）。

用法:
  python3 gen_image.py --prompt "..." --out /path/a.jpg
  python3 gen_image.py --batch tasks.json --outdir ./out   # [{"id":"x","prompt":"..."}]
"""
import argparse, base64, json, os, pathlib, re, sys, time
import urllib.request, urllib.error

CONF = pathlib.Path.home() / ".pi/agent/cliproxyapi.json"


def load_conf():
    c = json.loads(CONF.read_text())
    return c["baseUrl"].rstrip("/"), c["apiKey"]


def gen(prompt, base, key, timeout=180):
    body = json.dumps({
        "model": "gemini-3.1-flash-image",
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        f"{base}/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read())
    msg = d["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        raise RuntimeError(f"no image returned; text={str(msg.get('content'))[:300]}")
    url = imgs[0]["image_url"]["url"]
    m = re.match(r"data:image/(\w+);base64,(.*)$", url, re.S)
    if not m:
        raise RuntimeError(f"unexpected url form: {url[:80]}")
    return m.group(1), base64.b64decode(m.group(2))


def save(path, ext, blob):
    p = pathlib.Path(path)
    if p.suffix == "":
        p = p.with_suffix("." + ("jpg" if ext == "jpeg" else ext))
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(blob)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt")
    ap.add_argument("--out")
    ap.add_argument("--batch")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--sleep", type=float, default=1.5)
    a = ap.parse_args()
    base, key = load_conf()

    if a.batch:
        tasks = json.loads(pathlib.Path(a.batch).read_text())
        ok, fail = [], []
        for i, t in enumerate(tasks, 1):
            dest = pathlib.Path(a.outdir) / t["id"]
            if dest.with_suffix(".jpg").exists():
                print(f"[{i}/{len(tasks)}] skip {t['id']}", flush=True); continue
            for attempt in range(1, a.retries + 1):
                try:
                    t0 = time.time()
                    ext, blob = gen(t["prompt"], base, key)
                    p = save(dest, ext, blob)
                    print(f"[{i}/{len(tasks)}] ok {t['id']} {len(blob)//1024}KB {time.time()-t0:.0f}s", flush=True)
                    ok.append(t["id"]); break
                except Exception as e:
                    print(f"[{i}/{len(tasks)}] try{attempt} FAIL {t['id']}: {e}", file=sys.stderr, flush=True)
                    if attempt == a.retries: fail.append(t["id"])
                    else: time.sleep(4 * attempt)
            time.sleep(a.sleep)
        print(json.dumps({"ok": len(ok), "failed": fail}, ensure_ascii=False))
        return 1 if fail else 0

    if not a.prompt or not a.out:
        ap.error("need --prompt and --out (or --batch)")
    ext, blob = gen(a.prompt, base, key)
    p = save(a.out, ext, blob)
    print(json.dumps({"file": str(p), "bytes": len(blob)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
