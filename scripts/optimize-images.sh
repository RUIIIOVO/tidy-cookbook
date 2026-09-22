#!/usr/bin/env bash
# 把 public/images/dishes/*.png 压成 800px 宽的 webp，原 png 移到 .raw/ 备份（不入库）
# 依赖：cwebp（brew install webp）
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/public/images/dishes"
RAW="$DIR/.raw"
mkdir -p "$RAW"

shopt -s nullglob
for f in "$DIR"/*.png "$DIR"/*.jpg; do
  id="$(basename "${f%.*}")"
  cwebp -quiet -q 82 -resize 800 0 "$f" -o "$DIR/$id.webp"
  mv "$f" "$RAW/"
  printf '✓ %s  %s\n' "$id" "$(du -h "$DIR/$id.webp" | cut -f1)"
done

echo
echo "总计: $(ls "$DIR"/*.webp 2>/dev/null | wc -l | tr -d ' ') 张, $(du -sh "$DIR" --exclude=.raw 2>/dev/null | cut -f1 || du -sh "$DIR" | cut -f1)"
