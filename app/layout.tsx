import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#09090b",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "13´Cut | Barbería en Montevideo",
  description: "Reservá tu turno online en segundos en 13´Cut.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "13´Cut",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={jakarta.variable}>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              * { -webkit-tap-highlight-color: transparent; }
              .no-scrollbar::-webkit-scrollbar { display: none; }
              .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `,
          }}
        />
      </head>
      <body
        className={`${jakarta.className} antialiased bg-zinc-950 text-zinc-100 min-h-screen overflow-y-auto overflow-x-clip pb-24 sm:pb-0 selection:bg-emerald-500/30 selection:text-emerald-200`}
      >
        {children}
        <BottomNav />
      </body>
    </html>
  );
}