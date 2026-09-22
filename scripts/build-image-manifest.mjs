/**
 * 扫描 public/images/dishes/*.webp，生成 src/data/images.generated.json
 * 让前端知道哪些菜已经有配图，没有的继续用图标占位。
 *
 * 用法: node scripts/build-image-manifest.mjs
 */
import { readdirSync, writeFileSync, existsSync } from "node:fs";

const dir = new URL("../public/images/dishes/", import.meta.url);
const ids = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".webp"))
      .map((f) => f.replace(/\.webp$/, ""))
      .sort()
  : [];

writeFileSync(
  new URL("../src/data/images.generated.json", import.meta.url),
  JSON.stringify(ids, null, 2) + "\n",
);
console.log(`✓ ${ids.length} 张配图 → src/data/images.generated.json`);
