#!/usr/bin/env python3
"""生成定制菜「自选食材」的方形配图（gpt-image-2，1k 1:1）。

  python3 scripts/gen-ingredient-images.py                 # 生成全部缺图
  python3 scripts/gen-ingredient-images.py --ids a,b       # 指定 id
  python3 scripts/gen-ingredient-images.py --force         # 覆盖已有

输出 public/images/ingredients/<id>.webp（400px 方图），原图备份到 .raw-images/ingredients/。
名称 → 路径的映射在 src/data/ingredient-images.ts，新增食材两边一起改。
"""
import argparse, json, pathlib, re, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN = pathlib.Path.home() / ".agents/skills/gpt-image-2/scripts/generate_image.py"
OUT = ROOT / "public/images/ingredients"
RAW = ROOT / ".raw-images/ingredients"

# 所有食材共用同一套构图，保证网格里大小、视角、底色一致
STYLE = (
    "overhead top-down flat lay, a single small round shallow white porcelain dish perfectly centered, "
    "the dish fills about 78% of the square frame with even margin on all sides, "
    "seamless warm off-white paper background (#f5f2eb), soft diffused daylight from upper left, "
    "gentle soft shadow under the dish, restrained warm-neutral color grading, crisp focus, "
    "high-end editorial food photography, minimal, no text, no labels, no hands, no utensils, "
    "no chopsticks, no props, no garnish herbs, no tablecloth, no wood"
)

INGREDIENTS = {
    # 糖水小料
    "shou-zuo-hou-yu-ni": "smooth creamy lavender-purple mashed taro paste, swirled",
    "xian-ao-jing-ying-xi-mi": "cooked clear translucent small sago pearls, glistening",
    "q-tan-qing-shuang-cui-bo-bo": "clear crystal agar boba balls, glossy and transparent",
    "ruan-nuo-man-ao-mi-hong-dou": "soft glossy sweetened red azuki beans",
    "shuang-cui-yuan-zhi-ye-guo": "translucent white diced nata de coco coconut jelly cubes",
    # 高蛋白
    "yuan-qie-gu-si-fei-niu-juan": "thinly sliced raw marbled beef rolls, neatly arranged",
    "xian-nen-qu-pi-ji-tui-rou": "poached skinless chicken thigh meat, sliced into juicy pieces",
    "xian-tian-da-xia-ren": "poached peeled pink-orange shrimp, curled, neatly arranged",
    "tang-xin-man-shu-dan": "two soft-boiled egg halves with glossy jammy golden yolks",
    # 慢碳主食
    "shui-guo-tian-yu-mi-duan": "boiled golden sweetcorn cob cut into thick round sections",
    "mi-tian-zheng-hong-shu": "steamed sweet potato chunks with bright orange soft flesh and purple skin",
    "wu-gu-cao-mi-za-liang-fan": "steamed multigrain brown rice with red rice and grains, neat mound",
    "jing-xuan-dong-bei-bai-mi-fan": "fluffy steamed short-grain white rice, neat mound",
    # 鲜蔬菌菇
    "cui-nen-xi-lan-hua": "blanched bright green broccoli florets",
    "qing-tian-xi-hu-lu": "blanched green zucchini half-moon slices",
    "yuan-qie-hu-luo-bo": "blanched vibrant orange carrot slices",
    "cui-shuang-he-lan-dou": "blanched vivid green snow pea pods",
    "yuan-sheng-cui-kou-mo": "blanched white button mushrooms cut in halves",
    "xian-cui-jin-zhen-gu": "blanched pale enoki mushrooms in a neat bundle",
    "shuang-kou-hei-mu-er": "blanched glossy black wood ear fungus",
    "nen-cui-si-ji-dou": "blanched green string beans cut into short batons",
    # 捞汁
    "mi-zhi-suan-xiang-sheng-chou-lao-zhi": "dark amber soy sauce dressing with minced garlic and red chili rings",
    "bei-jian-zhi-ma-sha-la-zhi": "creamy beige roasted sesame dressing with a few toasted sesame seeds",
    "yuan-wei-hai-yan-hei-hu-jiao": "flaky sea salt and coarse cracked black pepper, two small neat piles",
}


def generate(ing_id: str) -> str:
    prompt = f"{INGREDIENTS[ing_id]}. {STYLE}"
    cmd = [sys.executable, str(GEN), "--prompt", prompt, "--size", "1:1", "--resolution", "1k"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    m = re.search(r"\{.*\}", r.stdout, re.S)
    if not m:
        return f"  ✗ {ing_id}: {r.stderr.strip()[:200]}"
    data = json.loads(m.group(0))
    if data.get("status") != "completed" or not data.get("files"):
        return f"  ✗ {ing_id}: {data.get('status')} {data.get('message', '')[:160]}"
    src = pathlib.Path(data["files"][0])
    dst = OUT / f"{ing_id}.webp"
    subprocess.run(
        ["cwebp", "-quiet", "-q", "82", "-resize", "400", "400", str(src), "-o", str(dst)],
        check=True,
    )
    shutil.copy2(src, RAW / f"{ing_id}{src.suffix}")
    return f"  ✓ {ing_id}  ${data.get('cost', 0)}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", help="逗号分隔的食材 id")
    ap.add_argument("--force", action="store_true", help="覆盖已有图片")
    ap.add_argument("--jobs", type=int, default=4, help="并发数")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    targets = [i.strip() for i in a.ids.split(",")] if a.ids else list(INGREDIENTS)
    todo = []
    for i in targets:
        if i not in INGREDIENTS:
            print(f"  ! {i} 没有描述，跳过")
        elif not a.force and (OUT / f"{i}.webp").exists():
            print(f"  - {i} 已存在，跳过")
        else:
            todo.append(i)

    print(f"待生成 {len(todo)} 张\n")
    with ThreadPoolExecutor(max_workers=a.jobs) as pool:
        for line in pool.map(generate, todo):
            print(line, flush=True)


if __name__ == "__main__":
    main()
