import type { Metadata } from "next";
import { Inter, Martel } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// An Indian-designed Latin + Devanagari serif: it has the ₹ sign and the हि in the logo.
const martel = Martel({ subsets: ["latin", "latin-ext", "devanagari"], weight: ["600", "800"], variable: "--font-martel" });

export const metadata: Metadata = {
  title: "Hisaab",
  description: "Know who hasn't paid, nudge them on WhatsApp, and verify UPI screenshots automatically.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${martel.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
