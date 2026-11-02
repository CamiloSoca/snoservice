// Navegación visual por ruta; los permisos siguen verificados en el servidor.
// No decidir el acceso por ocultar enlaces: /admin conserva la sesión firmada
// y /barbero conserva su PIN y sus protecciones de datos.
export type NavigationArea = 'public' | 'admin' | 'staff' | 'none';

export function navigationArea(pathname: string): NavigationArea {
  if (pathname === '/') return 'public';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/barbero' || pathname.startsWith('/barbero/')) return 'staff';
  return 'none';
}

export function bottomNavigationItems(pathname: string): Array<{href: string; label: string}> {
  const area = navigationArea(pathname);
  if (area === 'public') return [
    {href: '/', label: 'Inicio'},
    {href: '/agendar', label: 'Reservar'},
  ];
  if (area === 'admin') return [
    {href: '/admin', label: 'Administración'},
    {href: '/barbero', label: 'Barberos'},
  ];
  // /barbero muestra su propia pantalla de PIN/panel.
  // /agendar utiliza su propio asistente; /login es formulario independiente.
  return [];
}
