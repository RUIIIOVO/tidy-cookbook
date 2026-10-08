/**
 * 从 src/data/raw.ts 提取菜名，预生成拼音 / 首字母，
 * 写入 src/data/pinyin.generated.json（以数字 id 为键）—— 避免把 pinyin-pro 字典打进客户端。
 * id 是手写在 raw.ts 里的数字，这里只读不生成。
 *
 * 用法: node scripts/build-pinyin.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pinyin } from "pinyin-pro";

const src = readFileSync(new URL("../src/data/raw.ts", import.meta.url), "utf8");

// 取 RAW 数组里每一项的 [id, "名称"
const body = src.slice(src.indexOf("export const RAW"));
const rows = [...body.matchAll(/^\s{2}\[(\d+), "([^"]+)",/gm)].map((m) => ({
  id: Number(m[1]),
  name: m[2],
}));

if (rows.length === 0) throw new Error("没有解析到菜品，检查 raw.ts 格式");

const ids = new Set();
const out = {};
for (const { id, name } of rows) {
  if (ids.has(id)) throw new Error(`id 重复: ${id}（${name}）`);
  ids.add(id);
  const full = pinyin(name, { toneType: "none", type: "array" });
  out[id] = { pinyin: full.join(""), initials: full.map((s) => s[0]).join("") };
}

writeFileSync(
  new URL("../src/data/pinyin.generated.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`✓ ${rows.length} 道菜 → src/data/pinyin.generated.json`);
