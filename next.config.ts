import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 整站静态导出 → ./out，由 Workers Assets 托管（免费、不计请求配额）
  // 服务端逻辑全部走 worker/ 的 /api/*，不依赖 Next 的服务端运行时
  output: "export",
  // 静态导出关掉 Next 的图片优化；配图已在构建前压成 800px webp
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
