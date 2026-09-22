/**
 * 从 src/data/raw.ts 提取菜名，预生成拼音 / 首字母 / id，
 * 写入 src/data/pinyin.generated.json —— 避免把 pinyin-pro 字典打进客户端。
 *
 * 用法: node scripts/build-pinyin.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pinyin } from "pinyin-pro";

const src = readFileSync(new URL("../src/data/raw.ts", import.meta.url), "utf8");

// 取 RAW 数组里每一项的第一个字符串字面量
const body = src.slice(src.indexOf("export const RAW"));
const names = [...body.matchAll(/^\s{2}\["([^"]+)",/gm)].map((m) => m[1]);

if (names.length === 0) throw new Error("没有解析到菜名，检查 raw.ts 格式");

const out = {};
for (const name of names) {
  const full = pinyin(name, { toneType: "none", type: "array" });
  const py = full.join("");
  const initials = full.map((s) => s[0]).join("");
  let id = full.join("-");
  let n = 2;
  while (Object.values(out).some((v) => v.id === id)) id = `${full.join("-")}-${n++}`;
  out[name] = { id, pinyin: py, initials };
}

writeFileSync(
  new URL("../src/data/pinyin.generated.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`✓ ${names.length} 道菜 → src/data/pinyin.generated.json`);
