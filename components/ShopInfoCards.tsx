'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowUpRight,Clock3,MapPin,Navigation2} from 'lucide-react';
import type {BusinessSchedule} from '@/lib/appointment-rules';
import {groupOpeningHours,montevideoWeekday} from '@/lib/home-hours-display';

type Props={
  schedule:BusinessSchedule;
  address:string;
  city:string;
  isDark:boolean;
};

export default function ShopInfoCards({schedule,address,city,isDark}:Props){
  const [today,setToday]=useState<string|null>(null);
  useEffect(()=>setToday(montevideoWeekday(new Date())),[]);
  const groups=useMemo(()=>groupOpeningHours(schedule),[schedule]);
  const todayRule=today?schedule[today]:null;
  const mapQuery=[address,city].filter(Boolean).join(', ');
  const directionsUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapQuery);
  const embedUrl='https://maps.google.com/maps?q='+encodeURIComponent(mapQuery)+'&z=15&output=embed';
  const surface=isDark
    ? 'border-zinc-800/90 bg-[#171719]/95 shadow-[0_18px_45px_rgba(0,0,0,0.18)]'
    : 'border-zinc-200 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.05)]';
  const muted=isDark?'text-zinc-400':'text-zinc-500';
  const secondary=isDark?'text-zinc-300':'text-zinc-700';
  const todayLabel=todayRule?.isOpen
    ? todayRule.openTime.replace(/:00$/,'')+' – '+todayRule.closeTime.replace(/:00$/,'')
    : 'Cerrado';

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 lg:gap-5">
      <div className={`min-w-0 overflow-hidden rounded-[26px] border p-5 sm:p-6 ${surface}`}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className={`mb-1 text-[10px] font-bold uppercase tracking-[0.2em] ${muted}`}>Planificá tu visita</p>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Horarios de atención</h2>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <Clock3 className="h-5 w-5" aria-hidden="true"/>
          </span>
        </div>

        <div className={`mb-3 flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
          isDark?'border-emerald-500/20 bg-emerald-500/[0.07]':'border-emerald-200 bg-emerald-50'
        }`}>
          <div className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark?'text-emerald-400':'text-emerald-700'}`}>Horario de hoy</p>
            <p className="mt-1 text-sm font-semibold sm:text-base">
              {today ? todayLabel : 'Consultá nuestros horarios'}
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            todayRule?.isOpen
              ? isDark?'border-emerald-500/25 bg-emerald-500/10 text-emerald-300':'border-emerald-200 bg-white text-emerald-700'
              : isDark?'border-zinc-700 bg-zinc-800/80 text-zinc-300':'border-zinc-200 bg-white text-zinc-600'
          }`}>
            {today?'Hoy':'Horario semanal'}
          </span>
        </div>

        <ul aria-label="Horarios semanales" className="divide-y divide-zinc-500/10">
          {groups.map(group=>{
            const isToday=Boolean(today&&group.keys.includes(today));
            return (
              <li key={group.keys[0]} className="flex min-h-10 items-center justify-between gap-3 py-2.5 text-sm">
                <span className={`font-medium ${isToday?'text-emerald-400':secondary}`}>
                  {group.label}
                  {isToday&&<span className="ml-2 text-[10px] font-bold uppercase tracking-wide">Hoy</span>}
                </span>
                <span className={`whitespace-nowrap text-right font-semibold tabular-nums ${
                  !group.isOpen?muted:isDark?'text-zinc-100':'text-zinc-900'
                }`}>
                  {group.hours}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`flex min-w-0 flex-col overflow-hidden rounded-[26px] border p-5 sm:p-6 ${surface}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className={`mb-1 text-[10px] font-bold uppercase tracking-[0.2em] ${muted}`}>Estamos cerca</p>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Encontranos</h2>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <MapPin className="h-5 w-5" aria-hidden="true"/>
          </span>
        </div>

        <div className={`relative h-44 w-full overflow-hidden rounded-2xl border sm:h-52 lg:h-56 ${
          isDark?'border-zinc-700 bg-zinc-800':'border-zinc-200 bg-zinc-100'
        }`}>
          <iframe
            title={'Mapa de ubicación de la barbería en '+mapQuery}
            src={embedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className={`h-full w-full border-0 ${isDark?'grayscale-[0.15] brightness-[0.9]':''}`}
            allowFullScreen
          />
        </div>

        <div className="mt-4 flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDark?'bg-zinc-800':'bg-zinc-100'}`}>
            <MapPin className="h-4 w-4 text-emerald-400" aria-hidden="true"/>
          </span>
          <address className="min-w-0 flex-1 not-italic">
            <p className="break-words text-sm font-bold sm:text-base">{address}</p>
            <p className={`mt-0.5 text-xs ${muted}`}>{city}</p>
          </address>
          <ArrowUpRight className={`mt-1 h-4 w-4 shrink-0 ${muted}`} aria-hidden="true"/>
        </div>

        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors active:scale-[0.99] ${
            isDark?'bg-emerald-500 text-zinc-950 hover:bg-emerald-400':'bg-zinc-950 text-white hover:bg-zinc-800'
          }`}
        >
          <Navigation2 className="h-4 w-4" aria-hidden="true"/>
          Cómo llegar
          <ArrowUpRight className="h-4 w-4" aria-hidden="true"/>
        </a>
      </div>
    </div>
  );
}
