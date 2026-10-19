#!/usr/bin/env node
/**
 * 菜谱快速导入助手
 * 支持：下厨房 (xiachufang.com)、小红书 (xiaohongshu.com / xhslink.com)、抖音 (douyin.com / v.douyin.com)
 *
 * 用法：
 *   node scripts/import-recipe.mjs "https://www.xiachufang.com/recipe/100641402/"
 *   node scripts/import-recipe.mjs --clip                  # 从系统剪贴板读取
 *   node scripts/import-recipe.mjs --text                  # 交互式粘贴多行文案
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RAW_FILE = path.resolve(process.cwd(), "src/data/raw.ts");
const PROMPTS_FILE = path.resolve(process.cwd(), "scripts/dish_prompts.json");

// API 配置，优先使用 APIMART，兼容 OPENAI 和 DEEPSEEK
const API_KEY = process.env.APIMART_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
const API_BASE = process.env.OPENAI_BASE_URL || (process.env.APIMART_API_KEY ? "https://api.apimart.ai/v1" : "https://api.openai.com/v1");
const MODEL_NAME = process.env.RECIPE_MODEL || "gpt-4o-mini";

if (!API_KEY) {
  console.error("❌ 错误: 未检测到 API_KEY。请设置 APIMART_API_KEY 或 OPENAI_API_KEY 环境变量。");
  process.exit(1);
}

// 帮助信息
function printHelp() {
  console.log(`
🍳 tidy-cookbook 菜谱导入工具

用法:
  node scripts/import-recipe.mjs <链接或包含链接的分享文本>
  node scripts/import-recipe.mjs --clip   # 从系统剪切板自动读取
  node scripts/import-recipe.mjs --text   # 交互式粘贴文案导入
`);
}

// 获取剪贴板内容 (macOS pbpaste)
function getClipboardText() {
  try {
    return execSync("pbpaste", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

// 提取文本中的 URL
function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

// 静默后台无头 Chrome 抓取 (100% 后台运行，无窗口、不抢焦点、不移动鼠标)
async function fetchWithHeadlessChrome(url) {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(chromePath)) return null;

  try {
    const { stdout } = await execFileAsync(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--dump-dom",
      url,
    ], { timeout: 15000 });
    return stdout;
  } catch {
    return null;
  }
}

// 下厨房抓取解析
async function parseXiachufang(url) {
  console.log("🔍 正在抓取下厨房菜谱...");
  // 将 PC 端的 xiachufang.com 替换为 m.xiachufang.com，避免 PC 端频繁触发滑动验证码
  const mobileUrl = url.replace("www.xiachufang.com", "m.xiachufang.com");

  const res = await fetch(mobileUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    },
  });
  if (!res.ok) throw new Error(`下厨房请求失败: ${res.status}`);
  const html = await res.text();

  // 标题
  const titleMatch = html.match(/<h1 class="recipe-name[^>]*>([\s\S]*?)<\/h1>/i) ||
                     html.match(/<h1 class="page-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
                     html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";

  // 食材 (移动端与 PC 端兼容)
  const ings = [];
  // 匹配移动端 .ing-line
  const lineRegex = /<a[^>]+class="ing-line"[^>]*>([\s\S]*?)<\/a>/gi;
  let lineMatch;
  while ((lineMatch = lineRegex.exec(html)) !== null) {
    const nameMatch = lineMatch[1].match(/<div class="ing-name"[^>]*>([\s\S]*?)<\/div>/i);
    const amountMatch = lineMatch[1].match(/<div class="ing-amount"[^>]*>([\s\S]*?)<\/div>/i);
    if (nameMatch) {
      const name = nameMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const amount = amountMatch ? amountMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
      if (name) ings.push(`${name} ${amount}`.trim());
    }
  }

  // 备用 PC 端正则
  if (ings.length === 0) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRegex.exec(html)) !== null) {
      const nameMatch = tr[1].match(/<td class="name"[^>]*>([\s\S]*?)<\/td>/i);
      const unitMatch = tr[1].match(/<td class="unit"[^>]*>([\s\S]*?)<\/td>/i);
      if (nameMatch) {
        const name = nameMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const unit = unitMatch ? unitMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
        if (name) ings.push(`${name} ${unit}`.trim());
      }
    }
  }

  // 步骤
  const steps = [];
  const stepRegex = /<p class="step-text"[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = stepRegex.exec(html)) !== null) {
    const text = pMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text && !steps.includes(text)) steps.push(text);
  }

  if (steps.length === 0) {
    const pcRegex = /<p class="text"[^>]*>([\s\S]*?)<\/p>/gi;
    let p;
    while ((p = pcRegex.exec(html)) !== null) {
      const text = p[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text && !steps.includes(text)) steps.push(text);
    }
  }

  return {
    platform: "下厨房",
    title,
    ingredientsText: ings.join("\n"),
    stepsText: steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n"),
    rawText: `菜名: ${title}\n食材:\n${ings.join("\n")}\n做法:\n${steps.join("\n")}`,
  };
}

// 小红书解析
async function parseXiaohongshu(rawInput, url) {
  console.log("🔍 正在解析小红书内容...");
  let targetUrl = url;

  // 展开短链
  if (url.includes("xhslink.com")) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      targetUrl = res.url || url;
    } catch {}
  }

  // 尝试后台 headless chrome 提取页面信息
  let chromeHtml = null;
  if (targetUrl) {
    chromeHtml = await fetchWithHeadlessChrome(targetUrl);
  }

  let noteTitle = "";
  let noteDesc = "";

  if (chromeHtml) {
    const titleMatch = chromeHtml.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) noteTitle = titleMatch[1].replace(/ - 小红书.*$/, "").trim();

    const descMatch = chromeHtml.match(/<meta name="description" content="([\s\S]*?)"/i);
    if (descMatch) noteDesc = descMatch[1].trim();
  }

  // 如果页面被安全限制，或者获取不到内容，降级使用用户分享的文本
  const rawClean = rawInput.replace(/https?:\/\/[^\s]+/g, "").replace(/【.*?】/g, (m) => m + "\n").trim();

  return {
    platform: "小红书",
    title: noteTitle,
    rawText: `小红书分享内容：\n${rawClean}\n\n抓取补充（若有）：\n标题：${noteTitle}\n描述：${noteDesc}`,
  };
}

// 抖音解析
async function parseDouyin(rawInput, url) {
  console.log("🔍 正在解析抖音内容...");
  let targetUrl = url;

  // 展开短链获取真实视频页面
  if (url && (url.includes("v.douyin.com") || url.includes("douyin.com"))) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      targetUrl = res.url || url;
    } catch {}
  }

  // 尝试从分享文本中剥离无用前缀与后缀
  const rawClean = rawInput
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/^[\s\d.、]*复制打开(抖音|小红书)[，：:]*\s*(看看)?/i, "")
    .replace(/复制打开(抖音|小红书)查看精彩.*$/i, "")
    .trim();

  return {
    platform: "抖音",
    rawText: `抖音分享内容：\n${rawClean}\n目标链接: ${targetUrl}`,
  };
}

// 调用大模型进行结构化转换
async function transformWithLLM(content) {
  console.log("🤖 正在标准化为菜谱规范与个人习惯...");

  const prompt = `你是一个资深大厨与菜谱标准化助手。请将外部菜谱内容转换为指定格式的结构化 JSON。

【小类分类与其英文ID】:
- 猪肉: pork
- 牛肉: beef
- 鸡肉: chicken
- 虾: shrimp
- 鱼: fish
- 贝类: shellfish
- 蟹: crab
- 时蔬: greens
- 蛋类: egg
- 豆制品: tofu
- 汤: soup
- 轻食: light
- 饭类: rice
- 面食: noodle
- 点心: sweet
- 炸物/小吃: snack

【严格项目规范与作者做菜习惯】:
1. 菜品描述: 只能写一句话这道菜吃起来什么样，禁止出现任何做法要点，简短生动（例如“软烂醇香，肥而不腻，酱红透亮”）。
2. 食材格式: 紧凑编码，必须由 主、辅、调 三部分构成，用 "@" 连接。每部分内多项用分号 ";" 连接，名称和用量之间空一格。
   格式必须如："主|五花肉 500g@辅|姜 4片;八角 1个@调|生抽 2勺;老抽 半勺;冰糖 15g"（没有的辅料可写 无 或不写该项）。
3. 步骤习惯:
   - 步骤必须简明干练，用 "@" 拼接步骤，每个步骤一两句话，禁止写废话。
   - 【做菜习惯 1 - 肉类不焯水】：肉类（除清汤和鸡爪外）不要写焯水！统一改为切块洗净充分沥干水分后，直接入锅中小火翻炒煎至表皮微焦出油再烹饪炖煮。
   - 【做菜习惯 2 - 不盛出回锅】：不要写“滑熟肉片后盛出，重新爆香小料后再回锅”，习惯是将肉片拨到锅边底油爆香小料后翻炒在一起。
   - 【做菜习惯 3 - 蒸蛋泡沫】：水蒸蛋打散起沫是正常的，用勺子撇掉浮沫即可，不要写顺一个方向不打出泡沫。
   - 【做菜习惯 4 - 速冻半成品】：如果是速冻半成品（烤肠、薯条、薯饼等），直接说明空气炸锅与油煎/炸的温度时间。
4. 辣度 spicy: 0(不辣), 1(微辣), 2(中辣), 3(特辣)
5. 标签 tags: 2-3个简明词汇（如 ["家常", "经典"] 或 ["快手", "下饭"]）
6. 英文提示词 prompt: 为这道菜生成一段符合 Midjourney/GPT 风格的英文美食摄影描述（用于后续配图生成）。

输出必须是纯合法 JSON 格式，包含以下字段：
{
  "name": "标准菜名（去掉多余修饰符与表情符号）",
  "desc": "一句话口感风味描述",
  "sub": "小类ID",
  "spicy": 0,
  "tags": ["标签1", "标签2"],
  "ingredients": "主|...@辅|...@调|...",
  "steps": "步骤1@步骤2@...",
  "prompt": "一段详细的高品质英文食物摄影提示词"
}`;

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      stream: false,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM 转换失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const resContent = data.choices[0].message.content;
  return JSON.parse(resContent);
}

// 获取 raw.ts 中的最大 ID
function getNextDishId() {
  const content = fs.readFileSync(RAW_FILE, "utf-8");
  const regex = /^\s*\[\s*(\d+)\s*,/gm;
  let maxId = 0;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const id = parseInt(m[1], 10);
    if (id > maxId) maxId = id;
  }
  return maxId + 1;
}

// 将新菜品插入到 raw.ts 中对应的分类末尾
function appendToRawFile(dishRecord) {
  const content = fs.readFileSync(RAW_FILE, "utf-8");
  const [id, name, desc, sub, spicy, tags, ing, steps] = dishRecord;

  const recordStr = `  [${id}, ${JSON.stringify(name)}, ${JSON.stringify(desc)}, ${JSON.stringify(sub)}, ${spicy}, ${JSON.stringify(tags)},
    ${JSON.stringify(ing)},
    ${JSON.stringify(steps)}],`;

  // 找到该小类的最后一个条目位置，或者直接插到数组末尾（最后一道菜之后）
  const endBracketIndex = content.lastIndexOf("];");
  if (endBracketIndex === -1) {
    throw new Error("未能找到 raw.ts 的数组结尾 ];");
  }

  const newContent = content.slice(0, endBracketIndex).trimEnd() + "\n\n" + recordStr + "\n];\n";
  fs.writeFileSync(RAW_FILE, newContent, "utf-8");
}

// 同步写入 dish_prompts.json
function appendToPromptsFile(id, prompt) {
  if (!fs.existsSync(PROMPTS_FILE) || !prompt) return;
  try {
    const json = JSON.parse(fs.readFileSync(PROMPTS_FILE, "utf-8"));
    json[String(id)] = prompt;
    fs.writeFileSync(PROMPTS_FILE, JSON.stringify(json, null, 2) + "\n", "utf-8");
    console.log(`✓ 英文配图提示词已记录到 scripts/dish_prompts.json (#${id})`);
  } catch (e) {
    console.warn("⚠️ 写入 dish_prompts.json 失败:", e.message);
  }
}

// 终端交互确认
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

// 主流程
async function main() {
  const args = process.argv.slice(2);
  let rawInput = "";

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--clip")) {
    rawInput = getClipboardText();
    if (!rawInput) {
      console.error("❌ 剪贴板为空，请先复制内容！");
      return;
    }
    console.log(`📋 从剪贴板读取到内容 (${rawInput.length} 字符)`);
  } else if (args.includes("--text")) {
    console.log("📝 请粘贴菜谱文案（输入完毕后在新行按 Ctrl+D 结束）：");
    const rl = readline.createInterface({ input: process.stdin });
    const lines = [];
    for await (const line of rl) {
      lines.push(line);
    }
    rawInput = lines.join("\n").trim();
  } else if (args[0]) {
    rawInput = args.join(" ").trim();
  } else {
    // 默认尝试剪贴板，如无则提示输入
    const clip = getClipboardText();
    if (clip && (clip.includes("http") || clip.includes("xiachufang") || clip.includes("douyin") || clip.includes("xiaohongshu"))) {
      console.log("📋 自动使用剪贴板中的分享内容...");
      rawInput = clip;
    } else {
      printHelp();
      return;
    }
  }

  const url = extractUrl(rawInput);
  let parsedData = null;

  try {
    if (url && url.includes("xiachufang.com")) {
      parsedData = await parseXiachufang(url);
    } else if (url && (url.includes("xiaohongshu.com") || url.includes("xhslink.com"))) {
      parsedData = await parseXiaohongshu(rawInput, url);
    } else if (url && (url.includes("douyin.com") || url.includes("iesdouyin.com"))) {
      parsedData = await parseDouyin(rawInput, url);
    } else {
      console.log("ℹ️ 未识别到特定平台链接，按通用文本解析...");
      parsedData = {
        platform: "自定义文本",
        rawText: rawInput,
      };
    }

    // LLM 标准化
    const transformed = await transformWithLLM(parsedData.rawText);

    // 分配新 ID
    const nextId = getNextDishId();
    const dishRecord = [
      nextId,
      transformed.name,
      transformed.desc,
      transformed.sub,
      transformed.spicy,
      transformed.tags,
      transformed.ingredients,
      transformed.steps,
    ];

    // 格式化输出预览
    console.log("\n=================== 菜谱结构化预览 ===================");
    console.log(`ID:     #${nextId}`);
    console.log(`名称:   ${transformed.name}`);
    console.log(`描述:   ${transformed.desc}`);
    console.log(`分类:   ${transformed.sub}`);
    console.log(`辣度:   ${transformed.spicy}`);
    console.log(`标签:   ${JSON.stringify(transformed.tags)}`);
    console.log(`食材:   ${transformed.ingredients}`);
    console.log("步骤:");
    transformed.steps.split("@").forEach((step, idx) => {
      console.log(`  ${idx + 1}. ${step}`);
    });
    if (transformed.prompt) {
      console.log(`配图词: ${transformed.prompt}`);
    }
    console.log("====================================================\n");

    const answer = await askQuestion("👉 是否确认写入 raw.ts 并重新构建拼音？(y: 确认 / n: 取消): ");
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      appendToRawFile(dishRecord);
      appendToPromptsFile(nextId, transformed.prompt);
      console.log(`\n✅ 成功添加新菜品 #${nextId} 到 src/data/raw.ts`);

      console.log("🔄 正在更新拼音生成文件...");
      execSync("node scripts/build-pinyin.mjs", { stdio: "inherit" });

      console.log("\n🎉 完成！下一步建议：");
      console.log(`1. 生成配图: python3 scripts/gen-dish-images.py --ids ${nextId}`);
      console.log("2. 压图与刷新清单: ./scripts/optimize-images.sh && node scripts/build-image-manifest.mjs");
    } else {
      console.log("❌ 已取消，未对项目作任何修改。");
    }
  } catch (err) {
    console.error("❌ 发生错误:", err.message);
  }
}

main();
