import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "一字寻物",
  description: "基于固定传统相字规则的公开寻物提示工具。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className="antialiased">{children}</body></html>;
}
