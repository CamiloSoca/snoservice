'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {getAgendaRevision} from '@/lib/booking-store';

type SyncState = 'connecting' | 'updating' | 'connected' | 'error';

interface AgendaSyncOptions {
  enabled: boolean;
  refreshData: () => Promise<void>;
  onUnauthorized?: () => void;
}

const REVISION_POLL_MS = 4_500;
const FALLBACK_REFRESH_MS = 30_000;

/** Detecta cambios rápidamente sin descargar todas las finanzas en cada ciclo.
 *  Si falla el contador, la sincronización periódica sigue funcionando.
 *  Ante regreso a la app, conexión recuperada o solicitud manual, actualiza datos.
 */
export function useAgendaAutoSync({enabled, refreshData, onUnauthorized}: AgendaSyncOptions) {
  const refreshRef = useRef(refreshData);
  const unauthorizedRef = useRef(onUnauthorized);
  const manualRef = useRef<() => void>(() => undefined);
  const [state, setState] = useState<SyncState>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  refreshRef.current = refreshData;
  unauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let busy = false;
    let forcedAfterBusy = false;
    let revisionLastFetched: number | null = null;
    let lastSuccessfulRefresh = 0;

    const run = async (force = false) => {
      if (disposed || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      if (busy) {
        if (force) forcedAfterBusy = true;
        return;
      }
      busy = true;
      try {
        // Fetch de versión barato. Si falla, consultar datos igualmente.
        let revision: number | null = null;
        try {
          revision = await getAgendaRevision();
        } catch (error: any) {
          if (error?.status === 401) throw error;
          console.warn('Señal de agenda no disponible; usando sincronización de respaldo.');
        }
        if (disposed) return;
        const changed = revision !== null && revisionLastFetched !== null && revision !== revisionLastFetched;
        const overdue = Date.now() - lastSuccessfulRefresh >= FALLBACK_REFRESH_MS;
        const shouldFetch = force || changed || overdue;
        if (shouldFetch) {
          setState('updating');
          await refreshRef.current();
          if (disposed) return;
          lastSuccessfulRefresh = Date.now();
          setLastUpdatedAt(lastSuccessfulRefresh);
          setState('connected');
        } else if (lastSuccessfulRefresh) {
          setState('connected');
        }
        // Sólo avanzar versión cuando los datos fueron conciliados con éxito.
        if (revision !== null && (!shouldFetch || lastSuccessfulRefresh)) {
          revisionLastFetched = revision;
        }
      } catch (error: any) {
        if (disposed) return;
        setState('error');
        if (error?.status === 401) unauthorizedRef.current?.();
        else console.warn('No se pudo sincronizar la agenda.', error);
      } finally {
        busy = false;
        if (forcedAfterBusy && !disposed) {
          forcedAfterBusy = false;
          void run(true);
        }
      }
    };

    manualRef.current = () => {void run(true);};
    void run(true); // Recupera los cambios entre el snapshot inicial y el montaje.
    const interval = window.setInterval(() => {void run();}, REVISION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run(true);
    };
    const onResume = () => {void run(true);};

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);
    return () => {
      disposed = true;
      manualRef.current = () => undefined;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onResume);
    };
  }, [enabled]);

  const refresh = useCallback(() => {manualRef.current();}, []);
  return {syncState: state, lastUpdatedAt, refresh};
}
