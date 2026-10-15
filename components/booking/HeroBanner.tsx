'use client';

import { MapPin, Clock, Calendar, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroBannerProps {
  businessName?: string;
  tagline?: string;
  address?: string;
  imageUrl?: string;
  onBookingClick: () => void;
  theme: 'dark' | 'light';
}

export function HeroBanner({
  businessName = "BARBERÍA CENTRAL",
  tagline = "Cortes de autor, perfilado de barba y rituales de cuidado masculino en un entorno distinguido.",
  address = "Av. Brasil 2840, Pocitos",
  imageUrl = "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=1200",
  onBookingClick,
  theme,
}: HeroBannerProps) {
  return (
    <section className={cn(
      "relative w-full overflow-hidden border-b transition-colors duration-500",
      theme === 'dark' ? "bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 text-white border-zinc-800/50" : "bg-gradient-to-b from-zinc-100 via-white to-white text-zinc-900 border-zinc-200"
    )}>
      <div className="relative h-[420px] sm:h-[480px] w-full">
        <img
          src={imageUrl}
          alt={businessName}
          className="w-full h-full object-cover object-center opacity-30 mix-blend-luminosity scale-105 transition-transform duration-1000"
        />
        <div className={cn(
          "absolute inset-0 bg-gradient-to-t",
          theme === 'dark' ? "from-zinc-950 via-zinc-950/60 to-transparent" : "from-white via-white/60 to-transparent"
        )} />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 -mt-72 sm:-mt-80 pb-10 text-center space-y-5">
        <div className="inline-flex items-center space-x-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full text-amber-600 dark:text-amber-300 text-xs font-semibold uppercase tracking-widest backdrop-blur-md shadow-lg shadow-amber-500/5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Experiencia Premium</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight uppercase">
            {businessName}
          </h1>
          <p className="text-sm sm:text-base max-w-lg mx-auto font-normal opacity-80 leading-relaxed">
            {tagline}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-medium pt-2">
          <span className={cn(
            "flex items-center px-3.5 py-1.5 rounded-full border shadow-sm",
            theme === 'dark' ? "bg-zinc-900/90 border-zinc-800 text-zinc-300" : "bg-white/90 border-zinc-200 text-zinc-700"
          )}>
            <MapPin className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
            {address}
          </span>
          <span className={cn(
            "flex items-center px-3.5 py-1.5 rounded-full border shadow-sm",
            theme === 'dark' ? "bg-zinc-900/90 border-zinc-800 text-zinc-300" : "bg-white/90 border-zinc-200 text-zinc-700"
          )}>
            <Clock className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
            Lun a Sáb: 10:00 - 20:00 hs
          </span>
        </div>

        <div className="pt-3">
          <button
            onClick={onBookingClick}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-zinc-950 font-black text-base shadow-xl shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center space-x-2.5 mx-auto cursor-pointer"
          >
            <Calendar className="w-5 h-5" />
            <span>AGENDAR MI TURNO AHORA</span>
          </button>
        </div>
      </div>
    </section>
  );
}