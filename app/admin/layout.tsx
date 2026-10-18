import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/session';

// Permitimos que esta ruta sea bloqueante y dinámica en tiempo de request
export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {children}
    </div>
  );
}