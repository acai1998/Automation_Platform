import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon, Monitor, type LucideIcon } from "lucide-react";
import { useCallback, memo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Theme = 'light' | 'dark' | 'system';

interface ThemeButtonConfig {
  theme: Theme;
  icon: LucideIcon;
  label: string;
}

const THEME_BUTTONS: ThemeButtonConfig[] = [
  { theme: 'light', icon: Sun, label: '浅色模式' },
  { theme: 'dark', icon: Moon, label: '深色模式' },
  { theme: 'system', icon: Monitor, label: '跟随系统' },
];

/**
 * 主题切换组件
 * 提供浅色、深色和跟随系统三种主题模式切换，带有平滑的动画效果
 * @returns 主题切换按钮组
 */
export const ThemeToggle = memo(function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastTheme, setLastTheme] = useState(theme);

  // 主题切换动画效果
  useEffect(() => {
    if (theme !== lastTheme) {
      setIsAnimating(true);
      setLastTheme(theme);

      // 添加全局过渡动画
      const root = document.documentElement;
      root.style.setProperty('transition', 'background-color 0.3s ease, color 0.3s ease');

      const timer = setTimeout(() => {
        setIsAnimating(false);
        root.style.removeProperty('transition');
      }, 300);

      return () => {
        clearTimeout(timer);
        root.style.removeProperty('transition');
      };
    }
  }, [theme, lastTheme]);

  const handleThemeChange = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
  }, [setTheme]);

  return (
    <div
      className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/5 transition-all duration-300"
      role="group"
      aria-label="主题切换"
    >
      {THEME_BUTTONS.map(({ theme: buttonTheme, icon: Icon, label }) => {
        const isActive = theme === buttonTheme;

        return (
          <button
            key={buttonTheme}
            onClick={() => handleThemeChange(buttonTheme)}
            className={cn(
              "relative p-2 rounded-md transition-all duration-300 ease-in-out",
              "transform hover:scale-105 active:scale-95",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              isActive
                ? "bg-white dark:bg-white/10 text-primary shadow-sm scale-100"
                : "text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5"
            )}
            aria-label={`切换到${label}`}
            aria-pressed={isActive}
            title={label}
          >
            <Icon
              className={cn(
                "h-4 w-4 transition-all duration-300",
                isActive && isAnimating && "animate-theme-switch"
              )}
              aria-hidden="true"
            />
            {isActive && (
              <span className="absolute inset-0 rounded-md animate-pulse-subtle opacity-20 bg-primary pointer-events-none" />
            )}
          </button>
        );
      })}
    </div>
  );
});
