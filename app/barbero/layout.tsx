import type { Metadata } from 'next';

// Un manifiesto propio evita que los barberos instalen el acceso de clientes.
// La identidad y la URL de inicio son distintas a las de / y /admin.
// Scope '/' conserva la navegación interna dentro de la app instalada.
export const metadata: Metadata = {
  title: 'Panel de barberos | 13 CUT',
  description: 'Acceso privado al panel de barberos de 13 CUT.',
  manifest: '/barbero-manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '13 CUT Barberos',
  },
};

export default function BarberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
