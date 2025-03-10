import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "コードレビューツール",
  description:
    "新入社員のプログラミング学習を促進するためのコードレビューツール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
