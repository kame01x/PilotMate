import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ChartPattern from "@/components/ChartPattern";
import ThemeInit from "@/components/ThemeInit";
import { MusicProvider } from "@/lib/music/MusicContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PilotMate",
  description: "Training assistant for student pilots and instructors",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeInit />
        <MusicProvider>
          <ChartPattern />
          {children}
        </MusicProvider>
      </body>
    </html>
  );
}
