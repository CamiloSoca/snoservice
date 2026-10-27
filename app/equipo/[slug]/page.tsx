import PublicBarberProfile from '@/components/PublicBarberProfile';

// El perfil depende de la ruta dinámica y de los datos del local.
// En Next.js 16 se genera a pedido para no bloquear prerenderizados estáticos.
export const instant = false;

export default function Page() {
  return <PublicBarberProfile />;
}
