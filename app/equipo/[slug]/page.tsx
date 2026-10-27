'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Calendar, Check, MapPin, Scissors } from 'lucide-react';
import { PublicShopGate } from '@/components/PublicShopProvider';
import type { PublicShopData } from '@/lib/public-shop-data';

function BarberProfile({ shop }: { shop: PublicShopData }) {
  const params = useParams();
  const slug = String(params.slug || '').toLowerCase();
  const barber = shop.barbers.find(b =>
    b.active !== false && (b.slug || b.name.toLowerCase()).toLowerCase() === slug
  );
  const banner = shop.shopConfig.coverImageUrl || shop.shopConfig.backgroundImageUrl || '';
  const availableServices = shop.services
    .filter(service => service.active !== false)
    .filter(service => barber && (!barber.serviceIds?.length || barber.serviceIds.includes(service.id)));

  if (!barber) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-xl font-bold">No encontramos ese barbero</h1>
        <Link href="/#equipo" className="mt-4 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950">
          Volver al equipo
        </Link>
      </main>
    );
  }

  const bookingUrl = '/agendar?barbero=' + encodeURIComponent(barber.slug || barber.name.toLowerCase());
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-28 pt-4 text-zinc-100 sm:pt-7">
      <Link href="/#equipo" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al equipo
      </Link>
      <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="relative flex min-h-[240px] items-end overflow-hidden bg-zinc-800 sm:min-h-[320px]">
          {barber.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={barber.imageUrl} alt={'Foto de ' + barber.name} className="absolute inset-0 h-full w-full object-cover object-center" />
          ) : banner ? (
            <Image src={banner} alt={'Portada de ' + shop.shopConfig.name} fill sizes="(max-width: 640px) 100vw, 768px" quality={70} className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-7xl font-black text-zinc-500">
              {barber.name.charAt(0)}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/35 to-transparent" />
          <div className="relative p-5 sm:p-7">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-300">{shop.shopConfig.name}</p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{barber.name}</h1>
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
        <Link href="/#info" className="inline-flex items-center gap-1.5 underline underline-offset-4">
          <MapPin className="h-4 w-4" aria-hidden="true" /> Horarios y ubicación del local
        </Link>
        <Link href="/agendar" className="inline-flex items-center gap-1.5 underline underline-offset-4">
          <Scissors className="h-4 w-4" aria-hidden="true" /> Reservar con otro barbero
        </Link>
      </div>
    </main>
  );
}

export default function EquipoProfilePage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <PublicShopGate variant="home" label="Cargando barbero...">
        {shop => <BarberProfile shop={shop} />}
      </PublicShopGate>
    </div>
  );
}
