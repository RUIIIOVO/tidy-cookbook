#!/usr/bin/env python3
"""批量生成菜品配图（gpt-image-2）。

  python3 scripts/gen-dish-images.py --sub pork          # 按小类跑（默认 1k）
  python3 scripts/gen-dish-images.py --ids a,b,c         # 指定菜 id
  python3 scripts/gen-dish-images.py --sub pork --force  # 覆盖已有

风格锁在 scripts/style_lock.txt，菜品描述在 scripts/dish_prompts.json。
已存在的图默认跳过，方便断点续跑（免费额度 / 限流中断后直接重跑同一条命令）。
"""
import argparse, json, pathlib, re, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN = pathlib.Path.home() / ".agents/skills/gpt-image-2/scripts/generate_image.py"
OUT = ROOT / "public/images/dishes"
STYLE = (ROOT / "scripts/style_lock.txt").read_text(encoding="utf-8").strip()
PROMPTS = json.loads((ROOT / "scripts/dish_prompts.json").read_text(encoding="utf-8"))


def dish_index():
    """从 raw.ts + pinyin.generated.json 还原 id -> (name, sub)"""
    raw = (ROOT / "src/data/raw.ts").read_text(encoding="utf-8")
    body = raw[raw.index("export const RAW"):]
    rows = re.findall(r'^\s{2}\["([^"]+)", "[^"]*", "(\w+)"', body, re.M)
    py = json.loads((ROOT / "src/data/pinyin.generated.json").read_text(encoding="utf-8"))
    return {py[name]["id"]: (name, sub) for name, sub in rows if name in py}


def generate(dish_id: str, desc: str, resolution: str) -> bool:
    prompt = f"{desc}. {STYLE}"
    cmd = [sys.executable, str(GEN), "--prompt", prompt, "--size", "4:3", "--resolution", resolution]
    r = subprocess.run(cmd, capture_output=True, text=True)
    m = re.search(r"\{.*\}", r.stdout, re.S)
    if not m:
        print(f"  ✗ {dish_id}: {r.stderr.strip()[:200]}")
        return False
    data = json.loads(m.group(0))
    if data.get("status") != "completed" or not data.get("files"):
        print(f"  ✗ {dish_id}: {data.get('status')} {data.get('message', '')[:160]}")
        return False
    src = pathlib.Path(data["files"][0])
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{dish_id}{src.suffix}"
    dst.write_bytes(src.read_bytes())
    print(f"  ✓ {dish_id}  {data['duration_seconds']}s  ${data['cost']}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sub", help="小类，如 pork / fish / greens")
    ap.add_argument("--ids", help="逗号分隔的菜品 id")
    ap.add_argument("--force", action="store_true", help="覆盖已有图片")
    ap.add_argument(
        "--resolution",
        default="1k",
        choices=["1k", "2k", "4k"],
        help="默认 1k —— 最终只压到 800px 宽的 webp，再高纯属浪费钱和时间",
    )
    a = ap.parse_args()

    index = dish_index()
    if a.ids:
        targets = [i.strip() for i in a.ids.split(",")]
    elif a.sub:
        targets = [i for i, (_, sub) in index.items() if sub == a.sub]
    else:
        ap.error("需要 --sub 或 --ids")

    todo = []
    for i in targets:
        if i not in PROMPTS:
            print(f"  ! {i} 缺少 dish_prompts.json 描述，跳过")
            continue
        if not a.force and list(OUT.glob(f"{i}.*")):
            print(f"  - {i} 已存在，跳过")
            continue
        todo.append(i)

    print(f"待生成 {len(todo)} 张\n")
    ok = 0
    for n, i in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {index.get(i, ('?',))[0]}")
        if generate(i, PROMPTS[i], a.resolution):
            ok += 1
        if n < len(todo):
            time.sleep(2)
    print(f"\n完成 {ok}/{len(todo)}")


if __name__ == "__main__":
    main()
