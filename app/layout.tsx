import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "まちスコア - 不動産総合リスクマップ",
  description: "不動産取引価格・犯罪発生統計・ハザードリスクを1つの地図上に統合表示する、住まい選びのための総合リスク可視化サービス。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
