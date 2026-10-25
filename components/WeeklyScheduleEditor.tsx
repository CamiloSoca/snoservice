'use client';

import {CalendarDays,Check,Clock3} from 'lucide-react';
import {WEEK_DAYS,type WeeklyHours} from '@/lib/weekly-hours';
import type {BusinessSchedule} from '@/lib/appointment-rules';

type EditorProps={
  value:BusinessSchedule;
  onChange:(hours:WeeklyHours)=>void;
  title:string;
  help?:string;
};

const week=()=>WEEK_DAYS.map(d=>d.key);
const weekdays=new Set(['lunes','martes','miercoles','jueves','viernes']);
const readable=(time:string)=>time.slice(0,5);

export default function WeeklyScheduleEditor({value,onChange,title,help}:EditorProps){
  const enabled=WEEK_DAYS.filter(d=>value[d.key]?.isOpen).length;
  const edit=(key:string,field:'isOpen'|'openTime'|'closeTime',newValue:boolean|string)=>{
    onChange({...value,[key]:{...value[key],[field]:newValue}} as WeeklyHours);
  };
  const setOpenDays=(selected:Set<string>)=>{
    const next:WeeklyHours={};
    for(const day of WEEK_DAYS){
      const previous=value[day.key]||{openTime:'09:00',closeTime:'19:00',isOpen:false};
      next[day.key]={...previous,isOpen:selected.has(day.key)};
    }
    onChange(next);
  };
  return <section aria-label={title} className="space-y-4 rounded-3xl border border-zinc-700/70 bg-zinc-950/80 p-3 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <CalendarDays size={20}/>
        </span>
        <div>
          <h3 className="text-base font-extrabold text-zinc-100">{title}</h3>
          {help&&<p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-400">{help}</p>}
        </div>
      </div>
      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
        {enabled} de 7 días activos
      </span>
    </div>
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Configuración rápida</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Elegir días rápidamente">
        {([
          ['Lun a vie',weekdays],
          ['Solo sábados',new Set(['sabado'])],
          ['Toda la semana',new Set(week())],
          ['Cerrar todos',new Set<string>()],
        ] as const).map(([label,keys])=>
          <button key={label} type="button" onClick={()=>setOpenDays(keys)}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-emerald-400 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">
            {label}
          </button>
        )}
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {WEEK_DAYS.map(day=>{
        const rule=value[day.key]||{isOpen:false,openTime:'09:00',closeTime:'19:00'};
        return <article key={day.key} className={
          'rounded-2xl border p-3 transition-colors '+(rule.isOpen
            ?'border-emerald-500/40 bg-emerald-500/[0.07]'
            :'border-zinc-800 bg-zinc-900/60')
        }>
          <div className="flex items-center justify-between gap-2">
            <strong className={'text-sm '+(rule.isOpen?'text-zinc-100':'text-zinc-400')}>{day.label}</strong>
            <button type="button" aria-label={day.label+': '+(rule.isOpen?'habilitado. Cerrar':'cerrado. Habilitar')}
              aria-pressed={rule.isOpen}
              onClick={()=>edit(day.key,'isOpen',!rule.isOpen)}
              className={'flex min-h-10 min-w-24 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold transition-colors '+
                (rule.isOpen?'border-emerald-500 bg-emerald-400 text-zinc-950':'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500')}>
              {rule.isOpen?<><Check size={15}/> Abierto</>:'Cerrado'}
            </button>
          </div>
          {rule.isOpen ? <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="min-w-0 text-[11px] font-medium text-zinc-400">
              Desde
              <input type="time" step={1800} required aria-label={'Desde '+day.label} value={readable(rule.openTime)}
                onChange={e=>edit(day.key,'openTime',e.target.value)}
                style={{colorScheme:'dark'}}
                className="mt-1 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-400"/>
            </label>
            <Clock3 size={15} aria-hidden className="mb-3 text-emerald-400"/>
            <label className="min-w-0 text-[11px] font-medium text-zinc-400">
              Hasta
              <input type="time" step={1800} required aria-label={'Hasta '+day.label} value={readable(rule.closeTime)}
                onChange={e=>edit(day.key,'closeTime',e.target.value)}
                style={{colorScheme:'dark'}}
                className="mt-1 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-400"/>
            </label>
          </div> : <p className="mt-2 text-xs text-zinc-500">Sin atención este día.</p>}
        </article>;
      })}
    </div>
    <p className="text-[11px] text-zinc-500">Los cambios se aplican cuando tocás <strong className="text-zinc-300">Guardar horarios</strong>. Los turnos ya reservados no se cancelan automáticamente.</p>
  </section>;
}
