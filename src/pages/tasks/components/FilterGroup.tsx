import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterGroupProps {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function FilterGroup({ label, options, value, onChange, compact = false }: FilterGroupProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', compact && 'gap-1.5')}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {options.map((option) => (
        <Button
          key={option.value || 'all'}
          type="button"
          size="sm"
          variant={value === option.value ? 'default' : 'outline'}
          className={cn('h-8', compact && 'h-7 px-2 text-xs')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
