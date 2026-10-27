'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Calendar, Check, MapPin, Scissors, X } from 'lucide-react';
import type { PublicShopData } from '@/lib/public-shop-data';

export default function BarberDetailPanel({shop, barber, onClose}: {
  shop: PublicShopData;
  barber: PublicShopData['barbers'][number];
  onClose: () => void;
}) {
  const backButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    backButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);
  const availableServices = shop.services
    .filter(service => service.active !== false)
    .filter(service => barber && (!barber.serviceIds?.length || barber.serviceIds.includes(service.id)));

  const bookingUrl = '/agendar?barbero=' + encodeURIComponent(barber.slug || barber.name.toLowerCase());
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="barber-profile-title"
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-zinc-950 text-zinc-100"
    >
      {/* Barra siempre visible y situada debajo de la zona del reloj/notch del iPhone. */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            ref={backButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver
          </button>
          <span className="min-w-0 truncate text-center text-sm font-semibold text-zinc-300">Perfil del barbero</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar perfil"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-4 sm:pt-7">
        <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
          <div className="relative flex min-h-[280px] items-end overflow-hidden bg-zinc-800 sm:min-h-[340px]">
            {barber.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={barber.imageUrl}
                alt={'Foto de ' + barber.name}
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-5xl font-extrabold text-zinc-200">
                  {barber.name.charAt(0)}
                </div>
                <span className="text-xs font-medium text-zinc-400">Foto por agregar</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
            <div className="relative p-5 sm:p-7">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-300">{shop.shopConfig.name}</p>
              <h1 id="barber-profile-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl">{barber.name}</h1>
              <p className="mt-1 text-sm text-zinc-300">{barber.role || 'Barbero'}</p>
            </div>
          </div>
          <div className="space-y-4 p-5 sm:p-7">
            {barber.bio && <p className="text-sm leading-relaxed text-zinc-300">{barber.bio}</p>}
            {!!barber.specialties?.length && (
              <div className="flex flex-wrap gap-2" aria-label="Especialidades del barbero">
                {barber.specialties.map(specialty => (
                  <span key={specialty} className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200">
                    {specialty}
                  </span>
                ))}
              </div>
            )}
            <Link href={bookingUrl} prefetch={true}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-extrabold text-zinc-950">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Agendar con {barber.name}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
        <h2 className="text-lg font-extrabold">Servicios que realiza</h2>
        <p className="mt-1 text-xs text-zinc-400">Elegí el servicio y el horario durante la reserva.</p>
        {availableServices.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {availableServices.map(service => (
              <li key={service.id} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
                <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span className="flex-1">{service.name}</span>
                <span className="font-semibold text-zinc-300">{'$' + Number(service.price).toLocaleString('es-UY')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">Consultá los servicios disponibles al reservar.</p>
        )}
      </section>
      <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
        <Link href="/#info" onClick={onClose} className="inline-flex items-center gap-1.5 underline underline-offset-4">
          <MapPin className="h-4 w-4" aria-hidden="true" /> Horarios y ubicación del local
        </Link>
        <Link href="/agendar" className="inline-flex items-center gap-1.5 underline underline-offset-4">
          <Scissors className="h-4 w-4" aria-hidden="true" /> Reservar con otro barbero
        </Link>
      </div>
      </main>
    </div>
  );
}
