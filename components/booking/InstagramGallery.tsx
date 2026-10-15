import { ExternalLink, Sparkles } from 'lucide-react';

function InstagramIcon({ className = "w-5 h-5" }: { className?: string }) {
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

export function InstagramGallery() {
  return (
    <section className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-gradient-to-b from-zinc-900/60 to-zinc-900/30 dark:from-zinc-900/60 dark:to-zinc-900/30 light:from-white light:to-zinc-100 border border-zinc-800/60 light:border-zinc-200 rounded-3xl p-6 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-rose-500/10 to-purple-500/10 border border-amber-500/30 text-amber-400">
              <InstagramIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight flex items-center gap-1.5">
                Seguinos en Instagram
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h3>
              <p className="text-xs opacity-70">@barberiacentral.uy</p>
            </div>
          </div>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-amber-500 hover:text-amber-400 transition-colors bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-full border border-amber-500/20"
          >
            <span>Ver feed</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          {[
            'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&q=80&w=400',
            'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&q=80&w=400',
            'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&q=80&w=400',
          ].map((src, index) => (
            <div
              key={index}
              className="group relative aspect-square rounded-2xl overflow-hidden border border-zinc-800/80 light:border-zinc-200 bg-zinc-950"
            >
              <img
                src={src}
                alt="Corte de barbería"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-80 group-hover:opacity-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2">
                <span className="text-[10px] text-zinc-200 font-medium">#BarberiaCentral</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}