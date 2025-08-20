import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  title: "Movie Recommendations | Toss the Remote",
  description: "Discover your next favorite movie with AI-powered recommendations based on your taste",
  keywords: ["movies", "recommendations", "AI", "film", "cinema", "streaming"],
  authors: [{ name: "Toss the Remote" }],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon' }
    ],
  },
  openGraph: {
    title: "Movie Recommendations | Toss the Remote",
    description: "Discover your next favorite movie with AI-powered recommendations",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ backgroundColor: '#000000' }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: '#000000', color: '#ffffff' }}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
