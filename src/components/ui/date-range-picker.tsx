import { useState, useEffect } from 'react';
import { DayPicker, DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarDays, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '@/lib/utils';

// 注入日历所需的全局样式（仅一次）
const STYLE_ID = 'rdp-custom-styles';
const CALENDAR_STYLES = `
  /* react-day-picker v9 custom theme */
  .rdp-root { --rdp-accent-color: #3b82f6; }

  .rdp-months { display: flex; gap: 1.5rem; }
  .rdp-month { min-width: 220px; }
  .rdp-month_caption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    height: 2rem;
    margin-bottom: 4px;
  }
  .rdp-caption_label { font-size: .875rem; font-weight: 600; color: #1e293b; }
  .rdp-nav { display: flex; align-items: center; gap: 4px; }

  .rdp-weekdays { display: flex; }
  .rdp-weekday {
    width: 2.25rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: .625rem;
    font-weight: 500;
    color: #94a3b8;
    text-transform: uppercase;
  }
  .rdp-weeks { display: flex; flex-direction: column; gap: 2px; }
  .rdp-week { display: flex; }

  .rdp-day {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rdp-day_button {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 6px;
    font-size: .875rem;
    font-weight: 400;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.15s, color 0.15s;
    position: relative;
    z-index: 1;
    color: #334155;
    background: transparent;
    border: none;
    outline: none;
  }
  .rdp-day_button:hover {
    background-color: #eff6ff;
    color: #1d4ed8;
  }
  .rdp-day_button:focus-visible {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
  }

  /* Today */
  .rdp-today > .rdp-day_button { font-weight: 700; color: #2563eb; }

  /* Selected range */
  .rdp-range_start > .rdp-day_button,
  .rdp-range_end > .rdp-day_button {
    background-color: #3b82f6 !important;
    color: #fff !important;
    border-radius: 6px;
  }
  .rdp-range_start > .rdp-day_button:hover,
  .rdp-range_end > .rdp-day_button:hover {
    background-color: #2563eb !important;
  }
  .rdp-range_middle {
    background-color: #eff6ff;
  }
  .rdp-range_middle > .rdp-day_button {
    border-radius: 0;
    color: #1d4ed8;
  }
  .rdp-range_middle > .rdp-day_button:hover {
    background-color: #dbeafe;
  }
  .rdp-range_start { border-radius: 6px 0 0 6px; }
  .rdp-range_end   { border-radius: 0 6px 6px 0; }
  .rdp-range_start.rdp-range_end { border-radius: 6px; }

  /* Outside days */
  .rdp-outside { opacity: 0; pointer-events: none; }

  /* Disabled */
  .rdp-disabled > .rdp-day_button { opacity: 0.3; cursor: not-allowed; }

  /* Hidden */
  .rdp-hidden { visibility: hidden; }
`;

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CALENDAR_STYLES;
  document.head.appendChild(el);
}

export interface DateRangeValue {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = '选择日期范围',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => { injectStyles(); }, []);

  // 将 YYYY-MM-DD 字符串转为 Date（本地时区零点，避免 UTC 偏移）
  const toDate = (str?: string): Date | undefined => {
    if (!str) return undefined;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const range: DateRange = {
    from: toDate(value.startDate),
    to: toDate(value.endDate),
  };

  const handleSelect = (selected: DateRange | undefined) => {
    if (!selected) {
      onChange({});
      return;
    }
    onChange({
      startDate: selected.from ? format(selected.from, 'yyyy-MM-dd') : undefined,
      endDate: selected.to ? format(selected.to, 'yyyy-MM-dd') : undefined,
    });
    // 两端都选好后自动关闭
    if (selected.from && selected.to) {
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({});
  };

  const hasValue = !!(value.startDate || value.endDate);

  const displayText = (() => {
    if (value.startDate && value.endDate) {
      if (value.startDate === value.endDate) return value.startDate;
      return `${value.startDate} 至 ${value.endDate}`;
    }
    if (value.startDate) return `${value.startDate} 起`;
    if (value.endDate) return `至 ${value.endDate}`;
    return null;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs transition-all',
            'bg-white dark:bg-slate-800',
            'border-slate-200 dark:border-slate-700',
            'text-slate-700 dark:text-slate-300',
            'hover:border-blue-400 hover:bg-blue-50/40 dark:hover:border-blue-500 dark:hover:bg-blue-900/20',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/30',
            hasValue && 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20',
            className
          )}
        >
          <CalendarDays className={cn('h-3.5 w-3.5 shrink-0', hasValue ? 'text-blue-500' : 'text-slate-400')} />
          <span className={hasValue ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-400'}>
            {displayText ?? placeholder}
          </span>
          {hasValue && (
            <span
              role="button"
              onClick={handleClear}
              className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-400 hover:text-blue-600 transition-colors"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="p-0">
        {/* 标题栏 */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">选择日期范围</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {range.from && range.to
              ? `${format(range.from, 'yyyy年MM月dd日')} — ${format(range.to, 'yyyy年MM月dd日')}`
              : range.from
              ? `已选: ${format(range.from, 'yyyy年MM月dd日')}，请选择结束日期`
              : '点击选择起始日期'}
          </p>
        </div>

        {/* 日历 */}
        <DayPicker
          mode="range"
          selected={range}
          onSelect={handleSelect}
          locale={zhCN}
          numberOfMonths={2}
          showOutsideDays={false}
          components={{
            Chevron: ({ orientation }) =>
              orientation === 'left'
                ? <ChevronLeft className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />,
          }}
        />

        {/* 底部快捷操作 */}
        <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {[
              { label: '今天', days: 0 },
              { label: '最近 7 天', days: 7 },
              { label: '最近 30 天', days: 30 },
            ].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => {
                  const today = new Date();
                  const start = new Date();
                  start.setDate(today.getDate() - days);
                  onChange({
                    startDate: format(start, 'yyyy-MM-dd'),
                    endDate: format(today, 'yyyy-MM-dd'),
                  });
                  setOpen(false);
                }}
                className="px-2 py-1 rounded text-[10px] font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { onChange({}); setOpen(false); }}
            className="h-7 px-2 text-[10px] text-slate-400 hover:text-slate-600"
          >
            清空
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
