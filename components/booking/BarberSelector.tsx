'use client';

import { Barber } from '@/features/booking/types/booking.types';
import { UserCheck, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BarberSelectorProps {
  barbers: Barber[];
  selectedBarber: Barber | null;
  onSelectBarber: (barber: Barber) => void;
  theme?: 'dark' | 'light';
}

export function BarberSelector({ 
  barbers, 
  selectedBarber, 
  onSelectBarber,
  theme = 'dark' 
}: BarberSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <span className="text-xs uppercase tracking-widest text-amber-500 font-bold">Paso 2 de 4</span>
        <h2 className="text-2xl font-black tracking-tight">Elegí tu barbero</h2>
        <p className="text-sm opacity-70">Seleccioná al profesional con el que preferís atenderte.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {barbers.map((barber) => {
          const isSelected = selectedBarber?.id === barber.id;
          return (
            <button
              key={barber.id}
              type="button"
              onClick={() => onSelectBarber(barber)}
              className={cn(
                "w-full group relative p-5 rounded-3xl border-2 transition-all duration-200 cursor-pointer flex items-center justify-between text-left touch-manipulation select-none active:scale-[0.98]",
                isSelected
                  ? "bg-amber-500/15 border-amber-500 shadow-xl ring-2 ring-amber-500/30"
                  : theme === 'dark'
                    ? "bg-zinc-900/60 border-zinc-800 hover:border-amber-500/50 text-zinc-100"
                    : "bg-zinc-50 border-zinc-200 hover:border-amber-500/50 text-zinc-900"
              )}
            >
              <div className="flex items-center space-x-4">
                <div className={cn(
                  "w-14 h-14 rounded-2xl border flex items-center justify-center text-amber-500 font-black text-xl shadow-inner",
                  theme === 'dark' ? "bg-zinc-800 border-zinc-700" : "bg-zinc-200 border-zinc-300"
                )}>
                  {barber.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {barber.name}
                  </h3>
                  <p className="text-xs opacity-70 flex items-center mt-1 font-medium">
                    <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                    Disponible hoy
                  </p>
                </div>
              </div>

              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
                isSelected 
                  ? "bg-amber-500 border-amber-500 text-zinc-950 scale-110 shadow" 
                  : theme === 'dark' ? "border-zinc-700 bg-zinc-800/50 text-transparent" : "border-zinc-300 bg-white text-transparent"
              )}>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}