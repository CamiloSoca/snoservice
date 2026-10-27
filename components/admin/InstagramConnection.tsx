'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

type Status = { configured: boolean; connected: boolean; username: string | null };

export default function InstagramConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/admin/instagram/status', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, []);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">Instagram · Últimas 4 publicaciones</strong>
        {status?.connected && <span className="text-xs text-emerald-400">Conectado</span>}
      </div>
      <p className="text-xs text-zinc-400">
        La portada muestra las últimas fotos o miniaturas de reels de @13.cut.
        El dueño autoriza la conexión una sola vez, sin compartir su contraseña.
      </p>
      {status?.configured ? (
        <a href="/api/admin/instagram/connect"
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 text-xs font-bold text-zinc-950 hover:bg-white">
          {status.connected ? 'Volver a conectar' : 'Conectar Instagram'}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <p className="text-xs text-amber-300">
          Falta configurar la aplicación de Meta en el servidor para habilitar la conexión.
        </p>
      )}
      {status?.connected && <p className="text-xs text-zinc-400">Cuenta: @{status.username}</p>}
    </div>
  );
}
