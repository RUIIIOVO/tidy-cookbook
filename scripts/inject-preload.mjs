/**
 * 构建后处理 out/ 下的 HTML：在 <head> 里为首屏 JS 加 <link rel="preload">。
 *
 * Next 静态导出把 <script> 放在 body 尾部，浏览器要解析到那里才开始下载。
 * 移动网络往返慢（国内到 Cloudflare 一次往返 0.3s 起），提前声明能让 JS 和 HTML 解析并行，
 * 省掉一到两次往返。带 noModule 的旧浏览器 polyfill 不预加载。
 *
 * 同时注入一段内联脚本提前请求 /api/me（见 EARLY_ME）。
 *
 * 用法: node scripts/inject-preload.mjs（已挂在 pnpm build 末尾）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("../out/", import.meta.url).pathname;

function* htmlFiles(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f === "_next") continue;
      yield* htmlFiles(p);
    } else if (f.endsWith(".html")) yield p;
  }
}

/**
 * 在 <head> 最前面提前发出 /api/me：不等 React 启动（首屏 JS 下载 + 执行要几百毫秒），
 * 和 JS 下载并行。auth-store 的 fetchMe 会优先复用这个 Promise。
 * 令牌从 localStorage 取，与 auth-store 的 TOKEN_KEY 保持一致。
 */
const EARLY_ME = `<script data-tc-early="">(function(){try{var t=null;try{t=localStorage.getItem("tc-token")}catch(e){}var h={};if(t)h.Authorization="Bearer "+t;window.__tcMe=fetch("/api/me",{credentials:"same-origin",headers:h})}catch(e){}})()</script>`;

let pages = 0;
for (const file of htmlFiles(OUT)) {
  let html = readFileSync(file, "utf8");
  if (html.includes("data-tc-preload")) continue; // 幂等
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)]
    .filter((m) => !/noModule/i.test(m[0]))
    .map((m) => m[1]);
  const already = new Set(
    [...html.matchAll(/<link[^>]*rel="preload"[^>]*href="([^"]+)"/g)].map((m) => m[1]),
  );
  const links = [...new Set(scripts)]
    .filter((s) => !already.has(s))
    .map((s) => `<link rel="preload" as="script" href="${s}" data-tc-preload=""/>`)
    .join("");
  html = html.replace(/<head>/, `<head>${EARLY_ME}${links}`);
  writeFileSync(file, html);
  pages++;
}
console.log(`✓ 首屏 JS 预加载已注入 ${pages} 个页面`);
