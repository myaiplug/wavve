import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WAVE by NoDAW Labs — Liquid Signal Editor",
  description: "Browser audio instrument. Centered reactor, skeuomorphic EQ, dynamics, waveform engine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
