import { useState, useEffect, useRef } from 'react';
import { DayPicker, DateRange } from 'react-day-picker';
import { format, addMonths, subMonths } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarDays, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── 全局 CSS 注入（仅一次） ─────────────────────────────────────── */
const STYLE_ID = 'rdp-el-styles-v3';
const CALENDAR_STYLES = `
  .el-rdp .rdp-months         { display: flex; }
  .el-rdp .rdp-month          { width: 100%; }
  .el-rdp .rdp-month_caption  { display: none; }   /* 用自定义 header 替代 */
  .el-rdp .rdp-nav            { display: none; }   /* 用自定义导航替代 */
  .el-rdp .rdp-weekdays       { display: flex; border-bottom: 1px solid #f0f0f0; }
  .el-rdp .rdp-weekday {
    flex: 1;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #909399;
    font-weight: 500;
  }
  .el-rdp .rdp-weeks          { display: flex; flex-direction: column; }
  .el-rdp .rdp-week           { display: flex; }
  .el-rdp .rdp-day {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .el-rdp .rdp-day_button {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 3px;
    font-size: 11px;
    color: #606266;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    position: relative;
    z-index: 1;
    outline: none;
  }
  .el-rdp .rdp-day_button:hover { background: #f2f6fc; color: #409eff; }

  /* today */
  .el-rdp .rdp-today > .rdp-day_button {
    color: #409eff;
    font-weight: 700;
  }

  /* range endpoints */
  .el-rdp .rdp-range_start > .rdp-day_button,
  .el-rdp .rdp-range_end   > .rdp-day_button {
    background: #409eff !important;
    color: #fff !important;
    border-radius: 4px;
  }

  /* range middle background strip */
  .el-rdp .rdp-range_middle {
    background: #f2f6fc;
  }
  .el-rdp .rdp-range_middle > .rdp-day_button {
    border-radius: 0;
    color: #409eff;
  }
  .el-rdp .rdp-range_middle > .rdp-day_button:hover { background: #e6f0fd; }

  /* range start / end rounded caps */
  .el-rdp .rdp-range_start { border-radius: 4px 0 0 4px; background: #f2f6fc; }
  .el-rdp .rdp-range_end   { border-radius: 0 4px 4px 0; background: #f2f6fc; }
  .el-rdp .rdp-range_start.rdp-range_end { border-radius: 4px; background: transparent; }

  /* outside / disabled / hidden */
  .el-rdp .rdp-outside { opacity: 0; pointer-events: none; }
  .el-rdp .rdp-disabled > .rdp-day_button { opacity: 0.3; cursor: default; }
  .el-rdp .rdp-hidden  { visibility: hidden; }
`;

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CALENDAR_STYLES;
  document.head.appendChild(el);
}

/* ─── 快捷选项 ───────────────────────────────────────────────────── */
const SHORTCUTS = [
  {
    label: '最近一周',
    getValue: () => {
      const end = new Date(); const start = new Date();
      start.setDate(end.getDate() - 6);
      return { start, end };
    },
  },
  {
    label: '最近一个月',
    getValue: () => {
      const end = new Date(); const start = new Date();
      start.setMonth(end.getMonth() - 1);
      return { start, end };
    },
  },
  {
    label: '最近三个月',
    getValue: () => {
      const end = new Date(); const start = new Date();
      start.setMonth(end.getMonth() - 3);
      return { start, end };
    },
  },
];

/* ─── 自定义月历头部 ─────────────────────────────────────────────── */
interface MonthHeaderProps {
  month: Date;
  side: 'left' | 'right';
  onPrevYear: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onNextYear: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
}
function MonthHeader({ month, side, onPrevYear, onPrevMonth, onNextMonth, onNextYear }: MonthHeaderProps) {
  const navBtn = 'h-5 w-5 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-blue-500 transition-colors cursor-pointer';
  return (
    <div className="flex items-center justify-between px-2 py-1.5 select-none">
      <div className="flex items-center gap-0.5">
        {side === 'left' && (
          <>
            <button className={navBtn} onClick={onPrevYear} title="上一年"><ChevronsLeft className="h-3.5 w-3.5" /></button>
            <button className={navBtn} onClick={onPrevMonth} title="上一月"><ChevronLeft className="h-3.5 w-3.5" /></button>
          </>
        )}
      </div>
      <span className="text-[13px] font-semibold text-gray-700">
        {format(month, 'yyyy年 MM月')}
      </span>
      <div className="flex items-center gap-0.5">
        {side === 'right' && (
          <>
            <button className={navBtn} onClick={onNextMonth} title="下一月"><ChevronRight className="h-3.5 w-3.5" /></button>
            <button className={navBtn} onClick={onNextYear} title="下一年"><ChevronsRight className="h-3.5 w-3.5" /></button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── 类型定义 ───────────────────────────────────────────────────── */
export interface DateRangeValue {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
}

/* ─── 主组件 ─────────────────────────────────────────────────────── */
export function DateRangePicker({ value, onChange, placeholder = '选择日期范围', className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 内部临时选择（点击确定才提交）
  const [tempRange, setTempRange] = useState<DateRange>({});

  // 当前两个面板的月份
  const today = new Date();
  const [leftMonth, setLeftMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const rightMonth = addMonths(leftMonth, 1);

  useEffect(() => { injectStyles(); }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 打开时同步外部 value → 临时状态（在 handleToggle 里同步处理）
  const toDate = (str?: string): Date | undefined => {
    if (!str) return undefined;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const hasValue = !!(value.startDate || value.endDate);
  const displayText = (() => {
    if (value.startDate && value.endDate) {
      if (value.startDate === value.endDate) return value.startDate;
      return `${value.startDate}  至  ${value.endDate}`;
    }
    if (value.startDate) return `${value.startDate}  至  ...`;
    if (value.endDate) return `...  至  ${value.endDate}`;
    return null;
  })();

  // 确定
  const handleConfirm = () => {
    onChange({
      startDate: tempRange.from ? format(tempRange.from, 'yyyy-MM-dd') : undefined,
      endDate: tempRange.to ? format(tempRange.to, 'yyyy-MM-dd') : undefined,
    });
    setOpen(false);
  };

  // 清空
  const handleClear = () => {
    setTempRange({});
  };

  // 清空并关闭（触发器上的 × 按钮）
  const handleTriggerClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({});
    setTempRange({});
  };

  // 快捷选项
  const handleShortcut = (getValue: () => { start: Date; end: Date }) => {
    const { start, end } = getValue();
    setTempRange({ from: start, to: end });
    // 同步左月面板到快捷起始月
    setLeftMonth(new Date(start.getFullYear(), start.getMonth(), 1));
  };

  // 月份导航（左面板控制，右面板始终 = 左 + 1）
  const goPrevYear  = () => setLeftMonth(d => subMonths(d, 12));
  const goPrevMonth = () => setLeftMonth(d => subMonths(d, 1));
  const goNextMonth = () => setLeftMonth(d => addMonths(d, 1));
  const goNextYear  = () => setLeftMonth(d => addMonths(d, 12));

  // 点击触发器时同步外部 value → 临时状态
  const handleToggle = () => {
    if (!open) {
      setTempRange({
        from: value.startDate ? toDate(value.startDate) : undefined,
        to: value.endDate ? toDate(value.endDate) : undefined,
      });
    }
    setOpen(v => !v);
  };

  return (
    <div className="relative inline-block">
      {/* ── 触发器 ── */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={cn(
          'inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs transition-all',
          'bg-white border-slate-200 text-slate-700',
          'hover:border-blue-400 hover:bg-blue-50/40',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/30',
          hasValue && 'border-blue-400 bg-blue-50',
          className
        )}
      >
        <CalendarDays className={cn('h-3.5 w-3.5 shrink-0', hasValue ? 'text-blue-500' : 'text-slate-400')} />
        <span className={hasValue ? 'text-blue-600 font-medium' : 'text-slate-400'}>
          {displayText ?? placeholder}
        </span>
        {hasValue && (
          <span
            role="button"
            onClick={handleTriggerClear}
            className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100 text-blue-400 hover:text-blue-600 transition-colors"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {/* ── Popover 面板（absolute 定位，紧贴触发按钮） ── */}
      {open && (
        <div
          ref={popRef}
          className="absolute left-0 top-full mt-1 z-[9999] bg-white rounded-lg border border-gray-200 shadow-2xl overflow-hidden"
          style={{ minWidth: 580 }}
        >
          <div className="flex">
            {/* ── 左侧快捷选项 ── */}
            <div className="w-[88px] border-r border-gray-100 py-1.5 shrink-0">
              {SHORTCUTS.map(({ label, getValue }) => (
                <button
                  key={label}
                  onClick={() => handleShortcut(getValue)}
                  className="w-full text-left px-2.5 py-1.5 text-[11px] text-gray-600 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── 右侧主体 ── */}
            <div className="flex flex-col flex-1">
              {/* 顶部：开始/结束日期展示栏 */}
              <div className="flex items-center border-b border-gray-100 px-2.5 py-1.5 gap-2 bg-gray-50/60">
                {/* 开始日期 */}
                <div className={cn(
                  'flex-1 flex items-center gap-1 h-6 px-2 rounded border text-[11px] bg-white',
                  tempRange.from ? 'border-blue-300 text-gray-700' : 'border-gray-200 text-gray-400'
                )}>
                  <CalendarDays className="h-3 w-3 text-gray-400 shrink-0" />
                  <span>{tempRange.from ? format(tempRange.from, 'yyyy-MM-dd') : '开始日期'}</span>
                </div>

                <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />

                {/* 结束日期 */}
                <div className={cn(
                  'flex-1 flex items-center gap-1 h-6 px-2 rounded border text-[11px] bg-white',
                  tempRange.to ? 'border-blue-300 text-gray-700' : 'border-gray-200 text-gray-400'
                )}>
                  <CalendarDays className="h-3 w-3 text-gray-400 shrink-0" />
                  <span>{tempRange.to ? format(tempRange.to, 'yyyy-MM-dd') : '结束日期'}</span>
                </div>
              </div>

              {/* 双月日历区 */}
              <div className="flex divide-x divide-gray-100">
                {/* 左月 */}
                <div className="flex-1 px-0.5">
                  <MonthHeader
                    month={leftMonth}
                    side="left"
                    onPrevYear={goPrevYear}
                    onPrevMonth={goPrevMonth}
                    onNextMonth={goNextMonth}
                    onNextYear={goNextYear}
                  />
                  <DayPicker
                    className="el-rdp"
                    mode="range"
                    month={leftMonth}
                    onMonthChange={() => {}}
                    selected={tempRange}
                    onSelect={(r) => setTempRange(r ?? {})}
                    locale={zhCN}
                    numberOfMonths={1}
                    showOutsideDays
                    hideNavigation
                    components={{
                      Chevron: () => null,
                    }}
                  />
                </div>

                {/* 右月 */}
                <div className="flex-1 px-0.5">
                  <MonthHeader
                    month={rightMonth}
                    side="right"
                    onPrevYear={goPrevYear}
                    onPrevMonth={goPrevMonth}
                    onNextMonth={goNextMonth}
                    onNextYear={goNextYear}
                  />
                  <DayPicker
                    className="el-rdp"
                    mode="range"
                    month={rightMonth}
                    onMonthChange={() => {}}
                    selected={tempRange}
                    onSelect={(r) => setTempRange(r ?? {})}
                    locale={zhCN}
                    numberOfMonths={1}
                    showOutsideDays
                    hideNavigation
                    components={{
                      Chevron: () => null,
                    }}
                  />
                </div>
              </div>

              {/* 底部操作栏 */}
              <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 px-3 py-2 bg-white">
                <button
                  onClick={handleClear}
                  className="text-[11px] text-gray-500 hover:text-blue-500 transition-colors"
                >
                  清空
                </button>
                <button
                  onClick={handleConfirm}
                  className="h-6 px-3 rounded bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-medium transition-colors"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
