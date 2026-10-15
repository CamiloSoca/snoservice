import { Scissors, MapPin, Clock, Phone, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

function InstagramIcon({ className = "w-4 h-4" }: { className?: string }) {
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

export function Footer({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  return (
    <footer className={cn(
      "border-t pt-12 pb-8 transition-colors duration-500",
      theme === 'dark' ? "bg-zinc-950 border-zinc-800/80 text-zinc-400" : "bg-zinc-100 border-zinc-200 text-zinc-600"
    )}>
      <div className="max-w-3xl mx-auto px-4 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 shadow-md">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="font-extrabold tracking-tight text-base">BARBERÍA CENTRAL</span>
            </div>
            <p className="text-xs leading-relaxed opacity-80">
              Experiencia de grooming tradicional con la mejor atención y productos seleccionados en Pocitos.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <h4 className="font-semibold uppercase tracking-wider text-[11px] text-amber-500">
              Información
            </h4>
            <div className="flex items-start space-x-2 pt-1 opacity-90">
              <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>Av. Brasil 2840, Pocitos, Montevideo</span>
            </div>
            <div className="flex items-start space-x-2 opacity-90">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>Lun a Sáb: 10:00 a 20:00 hs</span>
            </div>
            <div className="flex items-start space-x-2 opacity-90">
              <Phone className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>+598 99 123 456</span>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <h4 className="font-semibold uppercase tracking-wider text-[11px] text-amber-500">
              Comunidad
            </h4>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 hover:text-amber-500 transition-colors opacity-90"
            >
              <InstagramIcon className="w-4 h-4 text-amber-500" />
              <span>Seguinos en Instagram</span>
            </a>
            <div className="pt-2 flex items-center space-x-2 text-[11px] opacity-80">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Reservas garantizadas online</span>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-zinc-800/40 dark:border-zinc-800/40 light:border-zinc-300 flex flex-col sm:flex-row items-center justify-between text-[11px] opacity-70 gap-2">
          <p>© 2026 Barbería Central. Todos los derechos reservados.</p>
          <p>Powered by BarberAgenda SaaS</p>
        </div>
      </div>
    </footer>
  );
}