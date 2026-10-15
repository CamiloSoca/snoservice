import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_TOKEN = 'barber_central_secret_token_2026';

async function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = cookieStore.get('barber_admin_session')?.value;

  if (session !== SESSION_TOKEN) {
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