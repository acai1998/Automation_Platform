import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon, Monitor } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/5">
      <button
        onClick={() => setTheme('light')}
        className={`p-2 rounded-md transition-colors ${
          theme === 'light'
            ? 'bg-white dark:bg-white/10 text-primary shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="浅色模式"
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`p-2 rounded-md transition-colors ${
          theme === 'dark'
            ? 'bg-white dark:bg-white/10 text-primary shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="深色模式"
      >
        <Moon className="h-4 w-4" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`p-2 rounded-md transition-colors ${
          theme === 'system'
            ? 'bg-white dark:bg-white/10 text-primary shadow-sm'
            : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        title="跟随系统"
      >
        <Monitor className="h-4 w-4" />
      </button>
    </div>
  );
}
