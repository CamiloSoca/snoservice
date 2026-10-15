import { MapPin, Phone, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocationInfoProps {
  theme?: 'dark' | 'light';
}

export function LocationInfo({ theme = 'dark' }: LocationInfoProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className={cn(
        "border rounded-3xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left transition-colors shadow-lg",
        theme === 'dark' ? "bg-zinc-900/30 border-zinc-800/60" : "bg-white border-zinc-200 shadow-zinc-100"
      )}>
        <div className="space-y-1">
          <div className="flex items-center justify-center sm:justify-start text-amber-500 font-bold text-sm">
            <MapPin className="w-4 h-4 mr-1.5" />
            <span>Ubicación</span>
          </div>
          <p className="text-xs font-medium opacity-90">Av. Brasil 2840</p>
          <p className="text-[11px] opacity-60">Pocitos, Montevideo</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-center sm:justify-start text-amber-500 font-bold text-sm">
            <Phone className="w-4 h-4 mr-1.5" />
            <span>Contacto</span>
          </div>
          <p className="text-xs font-medium opacity-90">+598 99 123 456</p>
          <p className="text-[11px] opacity-60">Consultas por WhatsApp</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-center sm:justify-start text-amber-500 font-bold text-sm">
            <Sparkles className="w-4 h-4 mr-1.5" />
            <span>Garantía</span>
          </div>
          <p className="text-xs font-medium opacity-90">Atención Puntual</p>
          <p className="text-[11px] opacity-60">Sin esperas innecesarias</p>
        </div>
      </div>
    </div>
  );
}