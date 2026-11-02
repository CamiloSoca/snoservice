// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import BarberDetailPanel from '@/components/BarberDetailPanel';
import InstagramCarousel from '@/components/InstagramCarousel';
import ShopInfoCards from '@/components/ShopInfoCards';
import {
  MapPin,
  Sun,
  Moon,
  Phone,
  ArrowRight,
} from 'lucide-react';
import {
  DEFAULT_SHOP_CONFIG,
} from '@/lib/booking-store';
import type { PublicShopData } from '@/lib/public-shop-data';

export default function HomeClient({initialShop}: {initialShop: PublicShopData}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [selectedBarber, setSelectedBarber] = useState<PublicShopData['barbers'][number] | null>(null);

  // Usar siempre la version mas reciente del cache compartido.
  const shopConfig = initialShop.shopConfig;
  const barbers = initialShop.barbers.filter(b => b.active !== false);

  useEffect(() => {
    // Solo se persiste la preferencia visual. Los datos del negocio
    // llegan renderizados desde el servidor, sin esperar al navegador.
    const savedTheme = localStorage.getItem('barber_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('barber_theme', next);
  };

  const isDark = theme === 'dark';
  const primaryBtn = isDark
    ? 'bg-zinc-100 hover:bg-white text-zinc-950 font-bold'
    : 'bg-zinc-950 hover:bg-zinc-800 text-white font-bold';

  const bannerUrl = shopConfig.coverImageUrl || shopConfig.backgroundImageUrl || '';
  const logoImage = shopConfig.logoUrl?.trim() || '';

  const shopCity = shopConfig.city || 'Montevideo';
  const shopAddress = shopConfig.address || DEFAULT_SHOP_CONFIG.address;
  const shopPhone = shopConfig.phone || DEFAULT_SHOP_CONFIG.phone;
  const activeSchedule = shopConfig.schedule || DEFAULT_SHOP_CONFIG.schedule;
  const activeBarbers = barbers;

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between relative transition-colors duration-200 ${
        isDark ? 'bg-[#090b0a] text-zinc-100' : 'bg-[#f7f8f6] text-zinc-900'
      }`}
    >
      {/* Iluminación ambiental por Tailwind: sin fotos desenfocadas ni filtros costosos. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className={isDark
          ? 'absolute inset-x-0 top-0 h-[950px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.12),transparent_58%)]'
          : 'absolute inset-x-0 top-0 h-[950px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.065),transparent_60%)]'}
        />
        <div className={isDark
          ? 'absolute inset-x-0 top-[900px] h-[1100px] bg-[radial-gradient(ellipse_at_88%_45%,rgba(16,185,129,0.055),transparent_58%)]'
          : 'absolute inset-x-0 top-[900px] h-[1100px] bg-[radial-gradient(ellipse_at_88%_45%,rgba(16,185,129,0.035),transparent_58%)]'}
        />
      </div>

      <div className="relative z-10 w-full">
        {/* HEADER */}
        <header
          className={`sticky top-0 z-30 w-full backdrop-blur-md border-b transition-colors px-4 pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))] pb-3 ${
            isDark ? 'bg-[#0b0e0c]/90 border-white/[0.06]' : 'bg-white/90 border-zinc-200/75'
          }`}
        >
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 min-w-0">
              {logoImage ? (
                <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900 shrink-0">
                  <Image src={logoImage} alt={shopConfig.name} fill sizes="36px" quality={75} className="object-cover" />
                </div>
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-sm font-black tracking-tight text-emerald-300">
                  {shopConfig.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="truncate">
                <h1 className="font-bold text-sm sm:text-base tracking-tight truncate">
                  {shopConfig.name}
                </h1>
                <p className={`text-[11px] truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {shopAddress}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <Link
                href="/agendar"
                prefetch={true}
                className={`hidden sm:inline-flex px-4 py-2.5 rounded-xl text-xs items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${primaryBtn}`}
              >
                <span>Agendar turno</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>

              <button
                type="button"
                onClick={toggleTheme}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer touch-manipulation active:scale-95 ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                }`}
                aria-label="Cambiar tema"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* HERO BANNER */}
        <section className="max-w-5xl mx-auto px-4 pt-4 sm:pt-5">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#111613] text-white shadow-[0_24px_65px_rgba(0,0,0,0.20)]">
            <div className="absolute inset-0">
              {bannerUrl ? (
                <Image
                  src={bannerUrl}
                  alt={shopConfig.name}
                  fill
                  preload
                  sizes="(max-width: 640px) 100vw, 1024px"
                  quality={72}
                  className="object-cover object-center opacity-75"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/75 to-zinc-950/35" />
            </div>

            <div className="relative min-h-[240px] p-5 sm:p-9 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4 sm:gap-6">
                {logoImage && (
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-950 shrink-0">
                    <Image src={logoImage} alt={shopConfig.name} fill sizes="80px" quality={75} className="object-cover" />
                  </div>
                )}

                <div className="space-y-1.5">
                  <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                    {shopConfig.name}
                  </h2>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-zinc-300">
                    <span className="flex items-center">
                      <MapPin className="w-3.5 h-3.5 mr-1.5 text-zinc-100 shrink-0" />
                      {shopAddress}, {shopCity}
                    </span>
                    <span className="flex items-center">
                      <Phone className="w-3.5 h-3.5 mr-1.5 text-emerald-400 shrink-0" />
                      {shopPhone}
                    </span>
                  </div>
                </div>
              </div>

              <Link
                href="/agendar"
                prefetch={true}
                className="flex w-full shrink-0 touch-manipulation items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-sm font-extrabold text-zinc-950 shadow-[0_12px_28px_rgba(0,0,0,0.2)] transition-[transform,background-color] hover:bg-emerald-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
              >
                <span>Reservar turno</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* EQUIPO: tarjetas breves, foto real o inicial */}
        <section id="equipo" className="mx-auto max-w-5xl scroll-mt-24 px-4 pt-6" aria-labelledby="equipo-title">
          <div className="mb-4">
            <span className={['mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em]', isDark ? 'text-emerald-400/90' : 'text-emerald-700'].join(' ')}>Elegí tu barbero</span>
            <h2 id="equipo-title" className="text-xl font-extrabold tracking-tight sm:text-2xl">Nuestro equipo</h2>
            <p className={['mt-1 text-xs sm:text-sm', isDark ? 'text-zinc-400' : 'text-zinc-500'].join(' ')}>Conocé a tu barbero y reservá</p>
          </div>
          {activeBarbers.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {activeBarbers.map(b => {
                const slug = b.slug || b.name.toLowerCase();
                return (
                  <div key={b.id} className={['min-w-0 overflow-hidden rounded-[24px] border transition-[border-color,transform] duration-200 hover:-translate-y-0.5',
                    isDark ? 'border-white/[0.075] bg-[#151917]/90 shadow-[0_12px_34px_rgba(0,0,0,0.16)]' : 'border-zinc-200/80 bg-white shadow-sm'
                  ].join(' ')}>
                    <button type="button" onClick={() => setSelectedBarber(b)} className="block w-full text-left">
                      <div className="relative flex aspect-[5/4] items-center justify-center overflow-hidden bg-zinc-800">
                        {b.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.imageUrl} alt={'Foto de ' + b.name} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-4xl font-extrabold text-zinc-400">{b.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="px-3.5 pt-3">
                        <h3 className="truncate text-sm font-bold" title={b.name}>{b.name}</h3>
                        <p className={['mt-1 text-xs', isDark ? 'text-zinc-400' : 'text-zinc-500'].join(' ')}>Ver perfil <ArrowRight className="ml-1 inline h-3 w-3" aria-hidden="true" /></p>
                      </div>
                    </button>
                    <Link href={'/agendar?barbero=' + encodeURIComponent(slug)} prefetch={true}
                      className={['mx-3 mb-3 mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',primaryBtn].join(' ')}>
                      Reservar <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-zinc-400">No hay barberos disponibles por el momento.</p>}
        </section>

        {/* INSTAGRAM — carrusel liviano de publicaciones oficiales */}
        <InstagramCarousel
          isDark={isDark}
          instagramHandle={shopConfig.instagramHandle || '@13.cut'}
          shopName={shopConfig.name}
          bannerUrl={bannerUrl}
          logoImage={logoImage}
          instagramUrl={shopConfig.instagramUrl || 'https://www.instagram.com/13.cut/'}
        />

        {/* HORARIOS Y UBICACIÓN: solo visual, siempre datos vigentes del local */}
        <section id="info" className="mx-auto max-w-5xl scroll-mt-24 px-4 pb-10 pt-5" aria-label="Horarios y ubicación">
          <ShopInfoCards
            schedule={activeSchedule}
            address={shopAddress}
            city={shopCity}
            isDark={isDark}
          />
        </section>


      </div>

      {selectedBarber && (
        <BarberDetailPanel shop={initialShop} barber={selectedBarber} onClose={() => setSelectedBarber(null)} />
      )}

      <footer
        className={`relative z-10 border-t py-6 text-xs hidden sm:block ${
          isDark ? 'border-zinc-900 text-zinc-500' : 'border-zinc-200 text-zinc-500'
        }`}
      >
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between gap-2">
          <div>
            <span className="font-semibold">{shopConfig.name}</span> - {shopAddress}
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/" aria-current="page" className="hover:underline">
              Inicio
            </Link>
            <Link href="/agendar" className="hover:underline">
              Reservar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
