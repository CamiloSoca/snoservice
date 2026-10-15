// app/admin/layout.tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/session';

async function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();

  if (!session) {
    redirect('/login');
  }

  return <>{children}</>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-amber-500 flex items-center justify-center font-bold text-sm">
          Verificando acceso de administrador...
        </div>
      }
    >
      <AdminAuthGuard>{children}</AdminAuthGuard>
    </Suspense>
  );
}