import React, { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parse = (v) => { const m = /^(\d{4})-(\d{2})$/.exec(v || ''); return m ? { y: Number(m[1]), m: Number(m[2]) } : null; };

export const MonthPicker = ({ value, onChange, className = '', testid }) => {
  const cur = parse(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(cur?.y || new Date().getFullYear());
  const pick = (i) => { onChange(`${year}-${String(i + 1).padStart(2, '0')}`); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setYear(cur?.y || new Date().getFullYear()); }}>
      <PopoverTrigger asChild>
        <button type="button" className={`${className} flex items-center justify-between text-left`} data-testid={testid}>
          <span>{cur ? `${MONTHS[cur.m - 1]} ${cur.y}` : <span className="text-stone-400">Select month</span>}</span>
          <CalendarDays className="h-4 w-4 text-stone-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" data-testid={`${testid}-calendar`}>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="rounded p-1 hover:bg-stone-100" onClick={() => setYear(year - 1)} data-testid={`${testid}-prev-year`}><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold" data-testid={`${testid}-year`}>{year}</span>
          <button type="button" className="rounded p-1 hover:bg-stone-100" onClick={() => setYear(year + 1)} data-testid={`${testid}-next-year`}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((n, i) => {
            const on = cur && cur.y === year && cur.m === i + 1;
            return (
              <button type="button" key={n} onClick={() => pick(i)} data-testid={`${testid}-month-${i + 1}`}
                className={`rounded-md px-2 py-1.5 text-sm ${on ? 'bg-stone-900 text-white' : 'hover:bg-stone-100'}`}>{n}</button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
