import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "今天吃什么",
  description: "家常菜谱 · 抽菜 · 点菜单",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "今天吃什么" },
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
        <Toaster
          position="top-center"
          offset={12}
          toastOptions={{
            style: {
              background: "#1b1916",
              color: "#f5f2eb",
              border: "none",
              borderRadius: "10px",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
