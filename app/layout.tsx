import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

// ESTO BLOQUEA EL ZOOM EN CELULARES (Sensación App Nativa)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  title: "Barbería Central | Reserva tu turno",
  description: "Cortes de autor, perfilado de barba y rituales clásicos en Pocitos, Montevideo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={jakarta.variable}>
      <body className={`${jakarta.className} antialiased bg-zinc-950 text-zinc-100 overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}