'use client';
import {WEEK_DAYS, type WeeklyHours} from '@/lib/weekly-hours';
import type {BusinessSchedule} from '@/lib/appointment-rules';

export default function WeeklyScheduleEditor({value,onChange,title,help}:{
  value:BusinessSchedule;onChange:(value:WeeklyHours)=>void;title:string;help?:string;
}) {
  const update=(day:string, field:'isOpen'|'openTime'|'closeTime',val:boolean|string)=>{
    const next={...value,[day]:{...value[day],[field]:val}};
    onChange(next as WeeklyHours);
  };
  return <fieldset className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3 sm:p-4 space-y-3">
    <legend className="px-2 text-sm font-bold text-zinc-100">{title}</legend>
    {help&&<p className="text-xs text-zinc-400">{help}</p>}
    <div className="space-y-2">
      {WEEK_DAYS.map(d=>{
        const r=value[d.key]||{isOpen:false,openTime:'09:00',closeTime:'19:00'};
        return <div key={d.key} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 sm:grid-cols-[1fr_auto_auto]">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={r.isOpen===true} onChange={e=>update(d.key,'isOpen',e.target.checked)}
              className="size-4 accent-emerald-400"/>{d.label}
          </label>
          <span className="text-[11px] text-zinc-500 sm:hidden">{r.isOpen?'Trabaja':'No trabaja'}</span>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <label className="flex-1 text-[10px] text-zinc-400">Desde
              <input aria-label={'Desde '+d.label} type="time" step={1800} disabled={!r.isOpen}
                value={r.openTime||'09:00'} onChange={e=>update(d.key,'openTime',e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-35"/>
            </label>
            <label className="flex-1 text-[10px] text-zinc-400">Hasta
              <input aria-label={'Hasta '+d.label} type="time" step={1800} disabled={!r.isOpen}
                value={r.closeTime||'19:00'} onChange={e=>update(d.key,'closeTime',e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-35"/>
            </label>
          </div>
        </div>;
      })}
    </div>
  </fieldset>;
}
