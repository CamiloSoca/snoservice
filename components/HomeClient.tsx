// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import BarberDetailPanel from '@/components/BarberDetailPanel';
import {
  MapPin,
  Scissors,
  Sun,
  Moon,
  Phone,
  Lock,
  ExternalLink,
  UserCheck,
  Calendar,
  Clock,
  ArrowRight,
  Heart,
  ChevronDown,
} from 'lucide-react';
import {
  DEFAULT_SHOP_CONFIG,
} from '@/lib/booking-store';
import type { PublicShopData } from '@/lib/public-shop-data';

type InstagramPost = { id: string; imageUrl: string; permalink: string; caption: string; likeCount: number | null };

export default function HomeClient({initialShop}: {initialShop: PublicShopData}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [instagramPosts, setInstagramPosts] = useState<InstagramPost[]>([]);
  const [instagramLoaded, setInstagramLoaded] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<PublicShopData['barbers'][number] | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/public/instagram', { signal: abort.signal })
      .then(response => response.ok ? response.json() : { posts: [] })
      .then(data => {
        if (abort.signal.aborted) return;
        setInstagramPosts(Array.isArray(data.posts) ? data.posts.slice(0, 4) : []);
      })
      .catch(() => {})
      .finally(() => { if (!abort.signal.aborted) setInstagramLoaded(true); });
    return () => abort.abort();
  }, []);
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

  const bgImage = shopConfig.backgroundImageUrl || '';
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
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {bgImage ? (
          <Image
            src={bgImage}
            alt="Fondo"
            fill
            sizes="100vw"
            quality={45}
            loading="lazy"
            className={`object-cover object-center filter blur-md scale-105 grayscale transition-opacity duration-700 ${
              isDark ? 'opacity-20 contrast-125' : 'opacity-10 contrast-100'
            }`}
          />
        ) : null}
        <div
          className={`absolute inset-0 bg-gradient-to-b transition-colors duration-500 ${
            isDark
              ? 'from-zinc-950/90 via-zinc-950/80 to-zinc-950/95 backdrop-blur-sm'
              : 'from-zinc-50/90 via-zinc-50/80 to-zinc-50/95 backdrop-blur-sm'
          }`}
        />
      </div>

      <div className="relative z-10 w-full">
        {/* HEADER */}
        <header
          className={`sticky top-0 z-30 w-full backdrop-blur-md border-b transition-colors px-4 pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))] pb-3 ${
            isDark ? 'bg-zinc-950/90 border-zinc-800/80' : 'bg-white/90 border-zinc-200'
          }`}
        >
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 min-w-0">
              {logoImage ? (
                <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900 shrink-0">
                  <Image src={logoImage} alt={shopConfig.name} fill sizes="36px" quality={75} className="object-cover" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-zinc-800 text-zinc-100">
                  <Scissors className="w-4 h-4" />
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
                className={`hidden sm:inline-flex px-3.5 py-2 rounded-xl text-xs items-center gap-1.5 transition-all active:scale-95 ${primaryBtn}`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Agendar Turno</span>
              </Link>

              <Link
                href="/barbero"
                prefetch={true}
                className={`hidden sm:inline-flex px-3 py-2 rounded-xl text-xs font-semibold border items-center gap-1.5 transition-colors active:scale-95 ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-800 hover:bg-zinc-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Barberos</span>
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
          <div className="relative rounded-3xl overflow-hidden border border-zinc-800 text-white shadow-2xl">
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
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-950/40" />
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
                className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-zinc-100 hover:bg-white text-zinc-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl transition-transform active:scale-[0.98] touch-manipulation shrink-0"
              >
                <Calendar className="w-4 h-4" />
                <span>Reservar turno</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* SERVICIOS públicos, sin preselecciones que alteren el flujo de turnos */}
        <section className="mx-auto max-w-5xl px-4 pt-5" aria-labelledby="servicios-title">
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 id="servicios-title" className="text-lg font-extrabold tracking-tight">Nuestros servicios</h2>
            <Link href="/agendar" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400">Ver todos <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="flex snap-x gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {initialShop.services.filter(service => service.active !== false).slice(0, 6).map(service => (
              <Link key={service.id} href="/agendar" prefetch={true}
                className={['flex min-w-[136px] max-w-[210px] shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl border p-4 text-sm font-bold',
                  isDark ? 'border-zinc-800 bg-zinc-900/75' : 'border-zinc-200 bg-white'
                ].join(' ')}>
                <Scissors className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <span>{service.name}</span>
                <span className="text-[11px] font-medium text-zinc-400">Ver disponibilidad</span>
              </Link>
            ))}
          </div>
        </section>

        {/* INSTAGRAM — reutiliza logo, portada y publicaciones reales de cada barbería */}
        <section className="max-w-5xl mx-auto px-4 py-3">
          <div
            className={['overflow-hidden rounded-3xl border backdrop-blur-sm',
              isDark ? 'border-zinc-800/90 bg-zinc-900/75' : 'border-zinc-200 bg-white/90 shadow-sm'
            ].join(' ')}
          >
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold tracking-tight sm:text-lg">
                    Últimos trabajos
                  </h2>
                  <p className={['mt-1 text-xs', isDark ? 'text-zinc-400' : 'text-zinc-500'].join(' ')}>
                    Las últimas publicaciones de {shopConfig.name}
                  </p>
                </div>
                <a
                  href={shopConfig.instagramUrl || 'https://www.instagram.com/13.cut/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={['inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors active:scale-95 touch-manipulation',
                    isDark
                      ? 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100'
                  ].join(' ')}
                >
                  <span>Ver perfil</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                </a>
              </div>

              <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible">
                {instagramPosts.map((post) => (
                  <a
                    key={post.id}
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={'Ver publicación de Instagram: ' + post.caption}
                    className={'group relative block aspect-square w-[60%] max-w-[250px] shrink-0 snap-start overflow-hidden rounded-2xl border transition-colors hover:border-emerald-400 sm:w-full ' +
                      (isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-zinc-100')}
                  >
                    {/* Miniaturas de la API oficial: sin embebidos ni widgets externos. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.imageUrl}
                      alt={post.caption}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    {typeof post.likeCount === 'number' && Number.isFinite(post.likeCount) && (
                      <span
                        className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg bg-zinc-950/75 px-2 py-1.5 text-[11px] font-semibold text-white"
                        aria-label={post.likeCount.toLocaleString('es-UY') + ' me gusta'}
                      >
                        <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                        {post.likeCount.toLocaleString('es-UY')}
                      </span>
                    )}
                    <span className="absolute bottom-2 right-2 rounded-lg bg-zinc-950/75 p-1.5 text-white">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </a>
                ))}
                {instagramLoaded && !instagramPosts.length && (
                  <p className="col-span-full py-6 text-center text-sm text-zinc-400">
                    Mirá nuestros trabajos en Instagram.
                  </p>
                )}
                {!instagramLoaded && (
                  <p className="col-span-full py-6 text-center text-sm text-zinc-400">
                    Cargando publicaciones...
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* EQUIPO: tarjetas breves, foto real o inicial */}
        <section id="equipo" className="mx-auto max-w-5xl scroll-mt-24 px-4 pt-6" aria-labelledby="equipo-title">
          <div className="mb-3">
            <h2 id="equipo-title" className="text-lg font-extrabold tracking-tight">Nuestro equipo</h2>
            <p className={['mt-1 text-xs', isDark ? 'text-zinc-400' : 'text-zinc-500'].join(' ')}>Conocé a tu barbero y reservá</p>
          </div>
          {activeBarbers.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {activeBarbers.map(b => {
                const slug = b.slug || b.name.toLowerCase();
                return (
                  <div key={b.id} className={['min-w-0 overflow-hidden rounded-2xl border',
                    isDark ? 'border-zinc-800 bg-zinc-900/75' : 'border-zinc-200 bg-white'
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
                      <div className="px-3 pt-3">
                        <h3 className="truncate text-sm font-bold" title={b.name}>{b.name}</h3>
                        <p className="mt-1 text-xs text-zinc-400">Ver perfil</p>
                      </div>
                    </button>
                    <Link href={'/agendar?barbero=' + encodeURIComponent(slug)} prefetch={true}
                      className={['mx-3 mb-3 mt-3 flex min-h-10 items-center justify-center gap-1 rounded-xl px-2 text-xs font-bold',primaryBtn].join(' ')}>
                      Reservar <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-zinc-400">No hay barberos disponibles por el momento.</p>}
        </section>

        {/* Horarios y ubicación accesibles, sin desplazar las fotos ni el equipo */}
        <section id="info" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-6">
          <details className={['group rounded-2xl border', isDark ? 'border-zinc-800 bg-zinc-900/75' : 'border-zinc-200 bg-white'].join(' ')}>
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-bold [&::-webkit-details-marker]:hidden">
              <Clock className="h-5 w-5 text-emerald-400" />
              <span className="flex-1">Horarios y ubicación</span>
              <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-zinc-800 p-3 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className={`border rounded-3xl p-5 sm:p-6 space-y-3 backdrop-blur-sm ${
                isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center">
                  <Clock className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="font-extrabold text-base">Horarios de Atención</h3>
              </div>

              <div
                className={`grid grid-cols-2 gap-y-2 text-xs sm:text-sm pt-1 ${
                  isDark ? 'text-zinc-300' : 'text-zinc-600'
                }`}
              >
                {activeSchedule ? (
                  ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].map(
                    (dayKey) => {
                      const rawSchedule = activeSchedule || {};
                      const val = rawSchedule[dayKey] || {
                        isOpen: false,
                        openTime: '09:00',
                        closeTime: '19:00',
                      };
                      const dayName =
                        dayKey.charAt(0).toUpperCase() +
                        dayKey.slice(1).replace('miercoles', 'miércoles').replace('sabado', 'sábado');

                      return (
                        <div key={dayKey} className="contents">
                          <span className="capitalize font-medium">{dayName}:</span>
                          {val.isOpen ? (
                            <span className="font-semibold text-right">
                              {val.openTime} - {val.closeTime} hs
                            </span>
                          ) : (
                            <span className="text-rose-400 font-bold text-right">Cerrado</span>
                          )}
                        </div>
                      );
                    }
                  )
                ) : (
                  <span className="text-xs text-zinc-500">Cargando horarios...</span>
                )}
              </div>
            </div>

            <div
              className={`border rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-4 backdrop-blur-sm ${
                isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h3 className="font-extrabold text-base">Nuestro Local</h3>
                </div>
                
                <p>Reservá tu lugar online sin esperas.</p>
                
                <p className={`text-xs sm:text-sm ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                  {shopAddress}, {shopCity}.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${shopAddress},${shopCity}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 touch-manipulation ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-200'
                      : 'bg-zinc-100 border-zinc-200 text-zinc-800'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Cómo llegar</span>
                </a>
  
              </div>
            </div>
          </div>
            </div>
          </details>
          <div className="mt-4 flex justify-center gap-4 text-xs text-zinc-500 sm:hidden">
            <Link href="/barbero" prefetch={false} className="underline underline-offset-4">Acceso barberos</Link>
            <Link href="/admin" prefetch={false} className="underline underline-offset-4">Administración</Link>
          </div>
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
            <Link href="/agendar" className="hover:underline">
              Agendar
            </Link>
            <Link href="/barbero" className="hover:underline">
              Barberos
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-1 hover:underline">
              <Lock className="w-3 h-3" /> Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
