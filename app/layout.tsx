import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Home, Scissors, UserCheck, Lock } from "lucide-react";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});



// Bloquea el zoom en celulares para dar sensación de App Nativa
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  title: "13 Cut | Reserva tu turno",
  description: "Sistema de reservas online para 13 Cut en Uruguay.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "13 Cut",
  },
};

// Componente integrado de Navegación Flotante Inferior (Estilo App Móvil)
function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 px-4 py-2 sm:hidden shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {/* Home / Inicio */}
        <Link
          href="/"
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium">Inicio</span>
        </Link>

        {/* Agendar */}
        <Link
          href="/"
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <Scissors className="w-5 h-5" />
          <span className="text-[10px] font-medium">Agendar</span>
        </Link>

        {/* Barberos / PIN */}
        <Link
          href="/barbero"
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-emerald-400 transition-colors"
        >
          <UserCheck className="w-5 h-5 text-emerald-400" />
          <span className="text-[10px] font-medium">Barberos</span>
        </Link>

        {/* Admin */}
        <Link
          href="/admin"
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-400 hover:text-amber-400 transition-colors"
        >
          <Lock className="w-5 h-5 text-amber-400" />
          <span className="text-[10px] font-medium">Admin</span>
        </Link>
      </div>
    </nav>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={jakarta.variable}>
      <body className={`${jakarta.className} antialiased bg-zinc-950 text-zinc-100 overflow-x-hidden pb-24 sm:pb-0`}>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}