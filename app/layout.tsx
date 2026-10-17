import { ClerkProvider } from "@clerk/nextjs";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Link", template: "%s · Link" },
  description: "Tell Link what you want out of life. Link figures out how your money gets you there.",
  applicationName: "Link",
  appleWebApp: { capable: true, title: "Link", statusBarStyle: "default" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#16171b" },
  ],
};

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export default function RootLayout({ children }: { children: ReactNode }) {
  const app = <Providers>{children}</Providers>;
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{clerkEnabled ? <ClerkProvider>{app}</ClerkProvider> : app}</body>
    </html>
  );
}
