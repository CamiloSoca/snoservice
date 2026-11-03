import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/session';

// La instalación desde /admin abre una app independiente de la portada pública.
// Se mantiene scope '/' para que /login permanezca dentro de la app al vencer la sesión.
export const metadata: Metadata = {
  title: 'Administración | 13 CUT',
  description: 'Panel privado de administración de 13 CUT.',
  manifest: '/admin-manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '13 CUT Admin',
  },
};

// Permitimos que esta ruta sea bloqueante y dinámica en tiempo de request
export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {children}
    </div>
  );
}