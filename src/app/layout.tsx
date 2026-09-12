import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiseEnVue · Real-Time Social Trend Intelligence & CSV Fit Studio",
  description: "Identify live social media trends, analyze with AI Brain (Gemini 2.5 Flash), and act with multi-platform campaigns.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen antialiased selection:bg-cyan-500/20 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
