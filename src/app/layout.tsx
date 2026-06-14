import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Control Total | Inventario y utilidad real",
  description:
    "Sistema SaaS para inventario, ventas y utilidad real de sellers multicanal.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070b10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${interSans.variable} ${geistMono.variable} h-full`}
      style={{ backgroundColor: "#070b10", colorScheme: "dark" }}
    >
      <body className="min-h-full antialiased" style={{ backgroundColor: "#070b10" }}>
        {children}
      </body>
    </html>
  );
}
