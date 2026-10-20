import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/confirm-dialog";
import "./globals.css";

export const metadata: Metadata = {
  title: "慧厨时光",
  description: "告别“今天吃什么”的日常纠结。极简家常菜谱与协同点餐助手：抽菜灵感决策，配料智能汇总，全端实时同步。",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "慧厨时光" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f5f2eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <ConfirmHost />
        <Toaster
          position="top-center"
          offset={16}
          duration={1800}
          visibleToasts={1}
        />
      </body>
    </html>
  );
}
