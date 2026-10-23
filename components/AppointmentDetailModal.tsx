'use client';

import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle2, Clock3, Mail, MessageCircle, Phone, Scissors, X, XCircle} from 'lucide-react';
import type {AppointmentItem} from '@/lib/booking-store';
import {appointmentTimeState} from '@/lib/appointment-rules';
import {customerWhatsAppLink} from '@/lib/customer-contact';
import type {OnSitePaymentMethod} from '@/lib/payment-method';

export type AppointmentActionResult = {
  ok: boolean;
  error?: string;
  cancellationEmailStatus?: string;
};

interface Props {
  appointment: AppointmentItem;
  canComplete: boolean;
  getWhatsAppLink?: (appointment: AppointmentItem) => string | null;
  onComplete: (appointment: AppointmentItem, method: OnSitePaymentMethod) => Promise<AppointmentActionResult>;
  onCancel: (appointment: AppointmentItem) => Promise<AppointmentActionResult>;
  onSuccess: (message: string) => void;
  onClose: () => void;
}

function notificationMessage(status: string | undefined) {
  switch (status) {
    case 'accepted':
      return 'El correo de cancelación fue aceptado por el servidor de correo.';
    case 'missing_recipient':
      return 'La reserva no tiene un correo válido: contactá al cliente manualmente.';
    case 'unconfigured':
      return 'El correo automático no está configurado: avisá al cliente manualmente.';
    default:
      return 'El turno se canceló, pero el correo no pudo enviarse. Contactá al cliente manualmente.';
  }
}

export default function AppointmentDetailModal({
  appointment, canComplete, getWhatsAppLink, onComplete, onCancel, onSuccess, onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OnSitePaymentMethod | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mounted, busy, onClose]);

  const timeState = appointmentTimeState(appointment);
  const completeAllowed = appointment.status === 'confirmado' && canComplete && timeState === 'started';
  const cancelAllowed = appointment.status === 'confirmado' && timeState === 'future';
  const whatsappLink = getWhatsAppLink?.(appointment)
    || customerWhatsAppLink(appointment.clientPhone, appointment.clientName, "13'Cut");
  const formattedPrice = new Intl.NumberFormat('es-UY', {
    style: 'currency', currency: 'UYU', maximumFractionDigits: 0,
  }).format(Number(appointment.priceSnapshot ?? appointment.servicePrice ?? 0));
  const phone = appointment.clientPhone?.trim() || '';
  const email = appointment.clientEmail?.trim() || '';

  async function perform(action: 'complete' | 'cancel') {
    if (busy) return;
    if (action === 'complete' && (!completeAllowed || !paymentMethod)) {
      setError('Seleccioná cómo pagó el cliente: efectivo o transferencia.');
      return;
    }
    if (action === 'cancel' && !cancelAllowed) return;
    setError('');
    setBusy(true);
    try {
      const result = action === 'complete'
        ? await onComplete(appointment, paymentMethod!) : await onCancel(appointment);
      if (!result.ok) {
        setError(result.error || 'No se pudo actualizar el turno. Intentá nuevamente.');
        return;
      }
      if (action === 'cancel') {
        onSuccess('Horario liberado. ' + notificationMessage(result.cancellationEmailStatus));
      } else {
        onSuccess('Turno completado. El importe y las comisiones quedaron registrados en la caja abierta.');
      }
      onClose();
    } catch {
      setError('Hubo un problema al actualizar el turno. Revisá la agenda antes de reintentar.');
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  // Portal fuera del calendario: ni el overflow-hidden del panel ni
  // la barra móvil de z-50 pueden recortar o tapar este detalle.
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6"
      aria-label="Detalle del turno">
      <button type="button" onClick={() => {if (!busy) onClose();}}
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-label="Cerrar detalle del turno" disabled={busy} />
      <div role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title"
        className="relative z-[121] flex max-h-[calc(100dvh-16px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-zinc-700 bg-zinc-950 shadow-2xl sm:max-h-[88dvh] sm:rounded-3xl">
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-400">Detalle de la reserva</p>
            <h2 id="appointment-detail-title" className="mt-1 truncate text-xl font-extrabold text-white">{appointment.clientName}</h2>
          </div>
          <button type="button" ref={closeButton} disabled={busy} onClick={onClose}
            aria-label="Cerrar" className="rounded-xl bg-zinc-800 p-2.5 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-400"><Clock3 className="h-3.5 w-3.5"/> Día y hora</span>
              <p className="mt-1 text-sm font-bold text-white">{appointment.dateString}</p>
              <p className="text-base font-extrabold text-emerald-400">{appointment.timeSlot} hs</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-400"><Scissors className="h-3.5 w-3.5"/> Servicio</span>
              <p className="mt-1 text-sm font-bold text-white">{appointment.serviceName}</p>
              <p className="text-xs text-zinc-400">{appointment.barberName} · {appointment.durationMinutes} min</p>
              <p className="mt-1 text-sm font-bold text-emerald-400">{formattedPrice}</p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">Contacto del cliente</p>
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <Phone className="h-4 w-4 shrink-0 text-emerald-400"/>
              {phone ? <a className="break-all underline decoration-zinc-600 underline-offset-4" href={'tel:' + phone.replace(/[^\d+]/g, '')}>{phone}</a>
                : <span className="text-zinc-500">Sin teléfono registrado</span>}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-200">
              <Mail className="h-4 w-4 shrink-0 text-emerald-400"/>
              {email ? <a className="break-all underline decoration-zinc-600 underline-offset-4" href={'mailto:' + email}>{email}</a>
                : <span className="text-zinc-500">Sin correo registrado</span>}
            </div>
            {appointment.clientNotes && (
              <div className="mt-3 rounded-lg bg-zinc-800 p-3 text-xs leading-relaxed text-zinc-300">
                <span className="font-bold text-zinc-100">Notas: </span>{appointment.clientNotes}
              </div>
            )}
            {whatsappLink ? (
              <a className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-zinc-950"
                href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4"/> Contactar por WhatsApp
              </a>
            ) : (
              <p className="mt-3 text-xs text-amber-300">No hay un celular uruguayo válido para contactar por WhatsApp.</p>
            )}
          </div>
          {appointment.status === 'confirmado' && timeState === 'started' && (
            <fieldset className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
              <legend className="px-1 text-xs font-bold text-zinc-200">¿Cómo pagó el cliente? *</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([{value:'cash',label:'Efectivo'},{value:'transfer',label:'Transferencia'}] as const).map(option => (
                  <button key={option.value} type="button" disabled={busy}
                    aria-pressed={paymentMethod === option.value}
                    onClick={() => {setPaymentMethod(option.value);setError('');}}
                    className={'rounded-xl border px-3 py-3 text-sm font-bold transition-colors ' +
                      (paymentMethod === option.value
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : 'border-zinc-700 text-zinc-300 hover:border-zinc-500')}>
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">
                El cobro se realiza en el local. Esta selección queda registrada junto al turno completado.
              </p>
            </fieldset>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          {confirmCancel && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
              <p className="font-bold">¿Confirmás la cancelación?</p>
              <p className="mt-1 text-xs leading-relaxed">
                Se liberará el horario y se enviará un correo al cliente avisando que su barbero o la barbería canceló la reserva.
              </p>
            </div>
          )}
          {appointment.status === 'confirmado' && !canComplete && (
            <p className="text-xs text-amber-300">Abrí la caja antes de completar turnos.</p>
          )}
          {appointment.status === 'confirmado' && timeState === 'future' && (
            <p className="text-xs text-zinc-400">Completar se habilita cuando comienza el turno. Podés cancelar antes de que empiece.</p>
          )}
          {appointment.status === 'completado' && (
            <p className="text-sm font-semibold text-emerald-400">Este turno ya está completado y contabilizado.</p>
          )}
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-zinc-800 bg-zinc-950 px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] sm:pb-4">
          {confirmCancel ? (
            <>
              <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)}
                className="rounded-xl border border-zinc-700 px-3 py-3 text-sm font-bold text-zinc-200">Volver</button>
              <button type="button" disabled={busy} onClick={() => {void perform('cancel');}}
                className="rounded-xl bg-rose-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">
                {busy ? 'Cancelando…' : 'Sí, cancelar turno'}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy || !cancelAllowed}
                onClick={() => setConfirmCancel(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 px-2 py-3 text-sm font-bold text-rose-300 disabled:cursor-not-allowed disabled:opacity-35">
                <XCircle className="h-4 w-4"/> Cancelar
              </button>
              <button type="button" disabled={busy || !completeAllowed || !paymentMethod}
                onClick={() => {void perform('complete');}}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-400 px-2 py-3 text-sm font-bold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">
                <CheckCircle2 className="h-4 w-4"/> {busy ? 'Guardando…' : 'Completar'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
