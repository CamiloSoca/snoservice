// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Scissors,
  Sun,
  Moon,
  Phone,
  Lock,
  Star,
  ExternalLink,
  UserCheck,
  Calendar,
  Clock,
  ArrowRight,
} from 'lucide-react';
import {
  BarberItem,
  ShopConfig,
  DEFAULT_SHOP_CONFIG,
  getBarbers,
  getShopConfig,
  getServices,
} from '@/lib/booking-store';
import { InitialShopSkeleton, InitialShopError } from '@/components/InitialShopState';

const INSTAGRAM_POSTS = [
  {
    id: 'ig-1',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/service/5aac5325-e7d8-4d2c-a6e8-2262c48ef195.jpg?v=1791944149645',
    tag: 'Corte',
  },
  {
    id: 'ig-2',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/service/d1272363-e728-46e0-8b74-1ef16cd029f7.jpg?v=1792010387277',
    tag: 'Mechas',
  },
  {
    id: 'ig-3',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/service/2dcba77d-0406-4b85-bb26-cd291eb34c5f.jpg?v=1791944389044',
    tag: 'Color Global',
  },
  {
    id: 'ig-4',
    image:
      'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/branch/f9079cf5-877b-4054-aa9b-8345d7679b0e.jpg?v=1792010015139',
    tag: 'Local',
  },
];

const GOOGLE_REVIEWS = [
  {
    id: 'rev-1',
    author: 'Matías Cabrera',
    rating: 5,
    comment:
      'Excelente atención. Reservé turno por la web y me atendieron en hora.',
  },
  {
    id: 'rev-2',
    author: 'Facundo Silvera',
    rating: 5,
    comment: 'Impecable el trabajo y muy práctico para agendar desde el celular.',
  },
  {
    id: 'rev-3',
    author: 'Rodrigo Techera',
    rating: 5,
    comment: 'Muy buena atención y los horarios son súper cómodos.',
  },
];

const DEFAULT_BANNER_URL =
  'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/branch/f9079cf5-877b-4054-aa9b-8345d7679b0e.jpg?v=1792010015139';

function InstagramSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function GoogleLogoSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [shopConfig, setShopConfig] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);
  const [barbers, setBarbers] = useState<BarberItem[]>([]);
  const [initialLoad, setInitialLoad] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('barber_theme') as 'dark' | 'light' | null;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }

    async function loadData() {
      try {
        const [config, brbs] = await Promise.all([
          getShopConfig(true),
          getBarbers(true),
          getServices(true),
        ]);
        setShopConfig(config);
        setBarbers(brbs.filter((b) => b.active !== false));
        setInitialLoad('ready');
      } catch (err) {
        console.error('Error cargando inicio:', err);
        setInitialLoad('error');
      }
    }
    loadData();
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

  const bgImage =
    shopConfig.backgroundImageUrl ||
    'https://www.bookly.uy/uploads/medium/c380e86bd0228e2fce4f447ba1742899_medium-1401x1123.png';
  
  const bannerUrl = shopConfig.coverImageUrl || shopConfig.backgroundImageUrl || DEFAULT_BANNER_URL;
  
  // Forzamos a que si hay logo en Supabase lo use, sino cae al default
  const logoImage = shopConfig.logoUrl && shopConfig.logoUrl.trim() !== '' 
    ? shopConfig.logoUrl 
    : DEFAULT_SHOP_CONFIG.logoUrl;

  const shopCity = shopConfig.city || 'Montevideo';
  const shopAddress = shopConfig.address || DEFAULT_SHOP_CONFIG.address;
  const shopPhone = shopConfig.phone || DEFAULT_SHOP_CONFIG.phone;
  const activeSchedule = shopConfig.schedule || DEFAULT_SHOP_CONFIG.schedule;
  const activeBarbers = barbers;

  if (!mounted || initialLoad === 'loading') {
    return <InitialShopSkeleton label="Cargando la barbería..." />;
  }
  if (initialLoad === 'error') {
    return <InitialShopError />;
  }

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between relative transition-colors duration-200 ${
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {bgImage ? (
          <img
            src={bgImage}
            alt="Fondo"
            decoding="async"
            className={`w-full h-full object-cover object-center filter blur-md scale-105 grayscale transition-opacity duration-700 ${
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
                <div className="w-9 h-9 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900 shrink-0">
                  <img src={logoImage} alt={shopConfig.name} className="w-full h-full object-cover" />
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
              <img
                src={bannerUrl}
                alt={shopConfig.name}
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover object-center opacity-75"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-950/40" />
            </div>

            <div className="relative p-5 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4 sm:gap-6">
                {logoImage && (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-950 shrink-0">
                    <img src={logoImage} alt={shopConfig.name} className="w-full h-full object-cover" />
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
                <span>Reservar Turno</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* UBICACIÓN Y HORARIOS */}
        <section className="max-w-5xl mx-auto px-4 py-4">
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
                <Link
                  href="/agendar"
                  prefetch={true}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-95 touch-manipulation ${primaryBtn}`}
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Agendar ahora</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* EQUIPO DE BARBEROS */}
        <section className="max-w-5xl mx-auto px-4 py-3">
          <div
            className={`border rounded-3xl p-5 sm:p-7 space-y-4 backdrop-blur-sm ${
              isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight">
                Equipo de {shopConfig.name}
              </h2>
              <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Elegí tu barbero
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {activeBarbers.length === 0 && (
                <p className="col-span-full text-sm text-zinc-400">No hay barberos disponibles por el momento.</p>
              )}
              {activeBarbers.map((b) => {
                const slug = b.slug || b.name.toLowerCase();
                return (
                  <div
                    key={b.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between space-y-4 ${
                      isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center font-extrabold text-base text-white shrink-0">
                        {b.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-base">{b.name}</h3>
                        <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          Barbero
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/agendar?barbero=${slug}`}
                      prefetch={true}
                      className={`w-full py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] touch-manipulation ${primaryBtn}`}
                    >
                      <span>Agendar con {b.name}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* INSTAGRAM */}
        <section className="max-w-5xl mx-auto px-4 py-3">
          <div
            className={`border rounded-3xl p-5 sm:p-7 space-y-5 backdrop-blur-sm ${
              isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 text-white flex items-center justify-center shrink-0">
                  <InstagramSvg className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                    Instagram
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {shopConfig.instagramHandle || '@barberia'}
                  </p>
                </div>
              </div>

              <a
                href={shopConfig.instagramUrl || 'https://instagram.com'}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold shrink-0 active:scale-95 touch-manipulation ${
                  isDark
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-200'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                }`}
              >
                <span>Ver perfil</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </a>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {INSTAGRAM_POSTS.map((post) => (
                <div
                  key={post.id}
                  className="relative aspect-square rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900"
                >
                  <img
                    src={post.image}
                    alt={post.tag}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2.5 left-2.5">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-950/80 text-white backdrop-blur-sm border border-white/10">
                      {post.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RESEÑAS EN GOOGLE */}
        <section id="resenas-google" className="max-w-5xl mx-auto px-4 py-3 pb-10">
          <div
            className={`border rounded-3xl p-5 sm:p-7 space-y-5 backdrop-blur-sm ${
              isDark ? 'bg-zinc-900/75 border-zinc-800/90' : 'bg-white/90 border-zinc-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                    isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <GoogleLogoSvg className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                    Opiniones en Google
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {shopAddress}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-xs font-bold">4.9</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {GOOGLE_REVIEWS.map((review) => (
                <div
                  key={review.id}
                  className={`rounded-2xl border p-4 space-y-2.5 ${
                    isDark ? 'bg-zinc-950/70 border-zinc-800/90' : 'bg-zinc-50/70 border-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">{review.author}</span>
                    <div className="flex items-center space-x-0.5">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDark ? 'text-zinc-300' : 'text-zinc-600'
                    }`}
                  >
                    &ldquo;{review.comment}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

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