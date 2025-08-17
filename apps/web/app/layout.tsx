import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = { title: "Labyrinth Racer", description: "FPV distributed-systems maze racer" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable} style={{
        margin: 0,
        color: "#eaeef2",
        fontFamily: "var(--font-inter), ui-sans-serif",
        background: "radial-gradient(1200px 600px at 20% 0%, #0f1420 0%, #0b0d12 60%, #080a0d 100%)",
        minHeight: "100dvh"
      }}>
        {children}
      </body>
    </html>
  );
}

