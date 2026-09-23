#!/usr/bin/env bash
# 把 public/images/dishes/*.png 压成 800px 宽的 webp，原 png 移到仓库根 .raw-images/ 备份（Git LFS 入库，不进构建产物）
# 依赖：cwebp（brew install webp）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/public/images/dishes"
RAW="$ROOT/.raw-images"
mkdir -p "$RAW"

shopt -s nullglob
for f in "$DIR"/*.png "$DIR"/*.jpg; do
  id="$(basename "${f%.*}")"
  cwebp -quiet -q 82 -resize 800 0 "$f" -o "$DIR/$id.webp"
  mv "$f" "$RAW/"
  printf '✓ %s  %s\n' "$id" "$(du -h "$DIR/$id.webp" | cut -f1)"
done

echo
echo "总计: $(ls "$DIR"/*.webp 2>/dev/null | wc -l | tr -d ' ') 张, $(du -sh "$DIR" | cut -f1)"
