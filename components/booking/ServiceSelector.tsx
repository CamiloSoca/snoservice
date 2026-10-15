'use client';

import { Service } from '@/features/booking/types/booking.types';
import { Clock, Check, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServiceSelectorProps {
  services: Service[];
  selectedService: Service | null;
  onSelectService: (service: Service) => void;
  theme?: 'dark' | 'light';
}

export function ServiceSelector({ 
  services, 
  selectedService, 
  onSelectService,
  theme = 'dark' 
}: ServiceSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <span className="text-xs uppercase tracking-widest text-amber-500 font-bold">Paso 1 de 4</span>
        <h2 className="text-2xl font-black tracking-tight">Elegí tu servicio</h2>
        <p className="text-sm opacity-70">Tocá una opción para seleccionarla.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        {services.map((service) => {
          const isSelected = selectedService?.id === service.id;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onSelectService(service)}
              className={cn(
                "w-full group relative p-5 rounded-3xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[160px] text-left touch-manipulation select-none active:scale-[0.98]",
                isSelected
                  ? "bg-amber-500/15 border-amber-500 shadow-xl ring-2 ring-amber-500/30"
                  : theme === 'dark'
                    ? "bg-zinc-900/60 border-zinc-800 hover:border-amber-500/50 text-zinc-100"
                    : "bg-zinc-50 border-zinc-200 hover:border-amber-500/50 text-zinc-900"
              )}
            >
              <div className="flex items-start justify-between w-full">
                <div className={cn(
                  "p-3 rounded-2xl transition-colors",
                  isSelected 
                    ? "bg-amber-500 text-zinc-950 shadow-md" 
                    : theme === 'dark' ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700"
                )}>
                  <Scissors className="w-5 h-5" />
                </div>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all",
                  isSelected 
                    ? "bg-amber-500 border-amber-500 text-zinc-950 scale-110 shadow" 
                    : theme === 'dark' ? "border-zinc-700 bg-zinc-800/50 text-transparent" : "border-zinc-300 bg-white text-transparent"
                )}>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>

              <div className="space-y-2 pt-4 w-full">
                <h3 className="font-bold text-base leading-snug">
                  {service.name}
                </h3>
                {service.description && (
                  <p className="text-xs opacity-60 line-clamp-2">{service.description}</p>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs opacity-70 flex items-center font-medium">
                    <Clock className="w-3.5 h-3.5 mr-1 text-amber-500" />
                    {service.durationMinutes} min
                  </span>
                  <span className="font-black text-lg text-amber-500">
                    ${service.price}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}