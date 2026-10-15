'use client';

import { MapPin, Scissors, Sparkles, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  businessName?: string;
  location?: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Header({ businessName = "Barbería Central", location = "Pocitos, Montevideo", theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="bg-zinc-950/80 dark:bg-zinc-950/80 light:bg-white/80 backdrop-blur-md text-white dark:text-white light:text-zinc-900 border-b border-zinc-800/60 light:border-zinc-200 p-4 sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 p-2.5 rounded-2xl shadow-lg shadow-amber-500/20 flex items-center justify-center">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="font-bold text-base tracking-tight">{businessName}</h1>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xs text-zinc-400 light:text-zinc-600 flex items-center mt-0.5">
              <MapPin className="w-3 h-3 mr-1 text-amber-500 shrink-0" />
              {location}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onToggleTheme}
            className="p-2.5 rounded-2xl bg-zinc-900 light:bg-zinc-100 border border-zinc-800 light:border-zinc-200 text-amber-400 hover:scale-105 transition-all duration-300 cursor-pointer shadow-sm"
            title="Cambiar tema claro/oscuro"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-zinc-800" />}
          </button>

          <div className="hidden sm:flex items-center space-x-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-emerald-400 tracking-wide">Abierto</span>
          </div>
        </div>
      </div>
    </header>
  );
}