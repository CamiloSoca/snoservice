'use client';

import { useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Sun, Sunset } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeSlotSelectorProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  theme?: 'dark' | 'light';
}

const getUpcomingDays = () => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    const dayName = d.toLocaleDateString('es-UY', { weekday: 'short' }).replace('.', '').toUpperCase();
    const dayNumber = d.getDate();
    const monthName = d.toLocaleDateString('es-UY', { month: 'short' }).replace('.', '');
    days.push({ dateString, dayName, dayNumber, monthName });
  }
  return days;
};

const MOCK_MORNING_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:15', '12:00'];
const MOCK_AFTERNOON_SLOTS = ['14:00', '14:45', '15:30', '16:15', '17:00', '18:00', '19:00'];

export function TimeSlotSelector({ 
  selectedDate, 
  onSelectDate, 
  selectedTime, 
  onSelectTime,
  theme = 'dark'
}: TimeSlotSelectorProps) {
  const days = getUpcomingDays();

  // Si el usuario entra al paso 3 y no hay fecha guardada, asignamos hoy automáticamente en el estado padre
  useEffect(() => {
    if (!selectedDate && days.length > 0) {
      onSelectDate(days[0].dateString);
    }
  }, [selectedDate, days, onSelectDate]);

  const activeDate = selectedDate || days[0].dateString;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <span className="text-xs uppercase tracking-widest text-amber-500 font-bold">Paso 3 de 4</span>
        <h2 className="text-2xl font-black tracking-tight">Fecha y Horario</h2>
        <p className="text-sm opacity-70">Elegí el día y tocá un horario disponible.</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold opacity-70 uppercase tracking-wider flex items-center">
          <CalendarIcon className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
          Día seleccionado
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {days.map((day) => {
            const isSelected = activeDate === day.dateString;
            return (
              <button
                key={day.dateString}
                type="button"
                onClick={() => onSelectDate(day.dateString)}
                className={cn(
                  "p-3 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center cursor-pointer touch-manipulation select-none active:scale-95",
                  isSelected
                    ? "bg-amber-500 border-amber-500 text-zinc-950 shadow-lg ring-2 ring-amber-500/30 font-bold"
                    : theme === 'dark'
                      ? "bg-zinc-900/60 border-zinc-800 text-zinc-200 hover:border-amber-500/50"
                      : "bg-zinc-50 border-zinc-200 text-zinc-800 hover:border-amber-500/50"
                )}
              >
                <span className="text-[10px] uppercase font-semibold">
                  {day.dayName}
                </span>
                <span className="text-lg font-black my-0.5">{day.dayNumber}</span>
                <span className="text-[10px] capitalize opacity-75">
                  {day.monthName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <div className="flex items-center text-xs font-medium opacity-70">
            <Sun className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
            Mañana
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {MOCK_MORNING_SLOTS.map((time) => {
              const isSelected = selectedTime === time;
              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => onSelectTime(time)}
                  className={cn(
                    "py-3 px-3 rounded-xl border text-sm font-bold transition-all duration-200 flex items-center justify-center cursor-pointer touch-manipulation select-none active:scale-95",
                    isSelected
                      ? "bg-amber-500 border-amber-500 text-zinc-950 shadow-md ring-2 ring-amber-500/30"
                      : theme === 'dark'
                        ? "bg-zinc-900/60 border-zinc-800 text-zinc-200 hover:border-amber-500/50"
                        : "bg-zinc-50 border-zinc-200 text-zinc-800 hover:border-amber-500/50"
                  )}
                >
                  <Clock className="w-3 h-3 mr-1 opacity-60" />
                  {time}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center text-xs font-medium opacity-70">
            <Sunset className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
            Tarde / Noche
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {MOCK_AFTERNOON_SLOTS.map((time) => {
              const isSelected = selectedTime === time;
              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => onSelectTime(time)}
                  className={cn(
                    "py-3 px-3 rounded-xl border text-sm font-bold transition-all duration-200 flex items-center justify-center cursor-pointer touch-manipulation select-none active:scale-95",
                    isSelected
                      ? "bg-amber-500 border-amber-500 text-zinc-950 shadow-md ring-2 ring-amber-500/30"
                      : theme === 'dark'
                        ? "bg-zinc-900/60 border-zinc-800 text-zinc-200 hover:border-amber-500/50"
                        : "bg-zinc-50 border-zinc-200 text-zinc-800 hover:border-amber-500/50"
                  )}
                >
                  <Clock className="w-3 h-3 mr-1 opacity-60" />
                  {time}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}