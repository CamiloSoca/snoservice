import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { PublicShopProvider } from "@/components/PublicShopProvider";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const shopName = process.env.NEXT_PUBLIC_SHOP_NAME || "13´Cut";
const shopCity = process.env.NEXT_PUBLIC_SHOP_CITY || "Montevideo";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#09090b",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: `${shopName} | Barbería en ${shopCity}`,
  description: `Reservá tu turno online en segundos en ${shopName}.`,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: shopName,
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
        <PublicShopProvider>
          {children}
          <BottomNav />
        </PublicShopProvider>
      </body>
    </html>
  );
}