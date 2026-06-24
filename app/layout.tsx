import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { AppLayoutClient } from "@/components/AppLayoutClient";
import { APP_NAME, BRAND } from "@/lib/brand";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: BRAND.tagline,
  icons: {
    icon: BRAND.assets.yextLogoLocal,
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0047AB",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body
        className="min-h-screen bg-surface-subtle text-slate-900 antialiased"
        suppressHydrationWarning
      >
        <ToastProvider>
          <ConfirmProvider>
            <AppLayoutClient>{children}</AppLayoutClient>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
