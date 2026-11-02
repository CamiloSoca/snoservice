'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

type Status = {configured:boolean;connected:boolean;username:string|null;savedAt:string|null;feedStatus:'ok'|'empty'|'error'|'not_connected';failureCode:string|null};

export default function InstagramConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [oauthResult, setOauthResult] = useState<string | null>(null);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('instagram');
    if (result && ['connected','error','invalid_state','unauthorized','cancelled','not_configured'].includes(result))
      setOauthResult(result);
  }, []);
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
        {status?.connected && <span className={status.feedStatus === 'ok' ? 'text-xs text-emerald-400' : 'text-xs text-amber-300'}>
          {status.feedStatus === 'ok' ? 'Publicaciones disponibles' : 'Acceso guardado'}
        </span>}
      </div>
      <p className="text-xs text-zinc-400">
        La portada muestra las últimas fotos o miniaturas de reels de @13.cut.
        El dueño autoriza la conexión una sola vez, sin compartir su contraseña.
      </p>
      {oauthResult && (
        <p role="status" className={oauthResult === 'connected'
          ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200'
          : 'rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200'}>
          {oauthResult === 'connected'
            ? 'Instagram autorizó la conexión. Estamos comprobando las publicaciones.'
            : oauthResult === 'invalid_state'
              ? 'Falló la verificación de la conexión. Iniciá la autorización desde esta pestaña.'
              : oauthResult === 'unauthorized'
                ? 'Tu sesión de administración venció durante la conexión. Volvé a ingresar.'
                : oauthResult === 'cancelled'
                  ? 'No se completó la autorización de Instagram.'
                  : 'La nueva autorización no se pudo guardar. La conexión anterior sigue almacenada.'}
        </p>
      )}
      {status?.connected && status.feedStatus !== 'ok' && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-200">
          <strong>La conexión no está entregando publicaciones.</strong>
          <p className="mt-1">
            {status.feedStatus === 'empty'
              ? 'Instagram respondió, pero no hay fotos utilizables para mostrar.'
              : 'El servidor no pudo obtener publicaciones. Una credencial guardada no garantiza acceso válido.'}
          </p>
          {status.failureCode && <p className="mt-1 font-mono text-[10px]">Diagnóstico: {status.failureCode}</p>}
          {status.savedAt && <p className="mt-1 text-amber-100/80">
            Última autorización guardada: {new Date(status.savedAt).toLocaleDateString('es-UY',{
              timeZone:'America/Montevideo',day:'2-digit',month:'2-digit',year:'numeric',
            })}
          </p>}
        </div>
      )}
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
