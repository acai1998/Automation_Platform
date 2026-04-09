import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useNavCollapse } from "@/contexts/NavCollapseContext";
import { useAiGeneration } from "@/contexts/AiGenerationContext";
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  Settings,
  LogOut,
  Boxes,
  User,
  ChevronDown,
  Code,
  Monitor,
  Gauge,
  BrainCircuit,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Menu,
} from "lucide-react";

// ----------------------------------------------------------------
// Nav data
// ----------------------------------------------------------------
interface NavItemChild {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href?: string;
  children?: NavItemChild[];
}

const navItems: NavItem[] = [
  { icon: <LayoutDashboard className="h-5 w-5" />, label: "仪表盘", href: "/" },
  {
    icon: <FolderOpen className="h-5 w-5" />,
    label: "用例管理",
    children: [
      { label: "API 自动化", href: "/cases/api", icon: <Code className="h-4 w-4" /> },
      { label: "UI 自动化", href: "/cases/ui", icon: <Monitor className="h-4 w-4" /> },
      { label: "性能自动化", href: "/cases/performance", icon: <Gauge className="h-4 w-4" /> },
    ],
  },
  { icon: <BrainCircuit className="h-5 w-5" />, label: "AI 用例", href: "/cases/ai-create" },
  { icon: <Boxes className="h-5 w-5" />, label: "任务管理", href: "/tasks" },
  { icon: <BarChart3 className="h-5 w-5" />, label: "运行记录", href: "/reports" },
  { icon: <Settings className="h-5 w-5" />, label: "系统设置", href: "/settings" },
];

// ----------------------------------------------------------------
// Utility: check if a nav item is active
// ----------------------------------------------------------------
function useNavActive(item: NavItem, location: string) {
  const isActive = item.href ? location === item.href : false;
  const isChildActive = item.children?.some((c) => location === c.href) ?? false;
  return { isActive: isActive || isChildActive, isChildActive };
}

// ----------------------------------------------------------------
// Mini Drawer Portal (for Icon-Only mode hover popover)
// ----------------------------------------------------------------
interface MiniDrawerProps {
  item: NavItem;
  anchorRect: DOMRect;
  onClose: () => void;
  location: string;
  onNavigate: (href: string) => void;
}

function MiniDrawer({ item, anchorRect, onClose, location, onNavigate }: MiniDrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // slight delay so the click that opened the drawer doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  const top = anchorRect.top;

  return createPortal(
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        left: 72,
        top,
        zIndex: 50,
        minWidth: 180,
      }}
      className="
        bg-white dark:bg-slate-900
        border border-slate-200 dark:border-slate-700
        rounded-xl shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60
        py-2 overflow-hidden
        animate-in fade-in-0 slide-in-from-left-2 duration-150
      "
    >
      {/* Header label */}
      <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {item.label}
        </span>
      </div>

      {item.children ? (
        <div className="px-2">
          {item.children.map((child) => {
            const isActive = location === child.href;
            return (
              <button
                key={child.href}
                type="button"
                onClick={() => {
                  onNavigate(child.href);
                  onClose();
                }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
                  ${isActive
                    ? "bg-primary text-white shadow-sm shadow-primary/25"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }
                `}
              >
                <span className={isActive ? "text-white/80" : "text-slate-400 dark:text-slate-500"}>
                  {child.icon}
                </span>
                <span>{child.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-2">
          <button
            type="button"
            onClick={() => {
              if (item.href) onNavigate(item.href);
              onClose();
            }}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
              ${item.href && location === item.href
                ? "bg-primary text-white shadow-sm shadow-primary/25"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }
            `}
          >
            <span className={item.href && location === item.href ? "text-white/80" : "text-slate-400 dark:text-slate-500"}>
              {item.icon}
            </span>
            <span>前往 {item.label}</span>
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

// ----------------------------------------------------------------
// Icon-Only nav item
// ----------------------------------------------------------------
interface IconOnlyItemProps {
  item: NavItem;
  location: string;
  onNavigate: (href: string) => void;
  badge?: React.ReactNode;
}

function IconOnlyNavItem({ item, location, onNavigate, badge }: IconOnlyItemProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { isActive } = useNavActive(item, location);

  const handleClick = useCallback(() => {
    if (item.children) {
      setOpen((v) => !v);
    } else if (item.href) {
      onNavigate(item.href);
    }
  }, [item, onNavigate]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        title={item.label}
        className={`
          relative w-full flex items-center justify-center
          h-12 rounded-xl transition-all duration-200 group
          ${isActive
            ? "bg-primary text-white shadow-sm shadow-primary/25"
            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white"
          }
        `}
      >
        <span className={isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}>
          {item.icon}
        </span>
        {/* Active dot indicator */}
        {isActive && !badge && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/60" />
        )}
        {/* Badge (e.g. AI generation progress) */}
        {badge && (
          <span className="absolute -top-0.5 -right-0.5">{badge}</span>
        )}
      </button>

      {open && btnRef.current && (
        <MiniDrawer
          item={item}
          anchorRect={btnRef.current.getBoundingClientRect()}
          onClose={handleClose}
          location={location}
          onNavigate={onNavigate}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------
// Expanded nav item
// ----------------------------------------------------------------
interface ExpandedNavItemProps {
  item: NavItem;
  location: string;
  onNavigate: (href: string) => void;
  defaultExpanded?: boolean;
  badge?: React.ReactNode;
}

function ExpandedNavItem({ item, location, onNavigate, defaultExpanded, badge }: ExpandedNavItemProps) {
  const { isActive } = useNavActive(item, location);
  const [expanded, setExpanded] = useState(() => defaultExpanded ?? isActive);

  const hasChildren = item.children && item.children.length > 0;

  if (hasChildren) {
    return (
      <div className="space-y-0.5">
        {/* Parent */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`
            w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg
            transition-all duration-200 group
            ${isActive
              ? "bg-primary/10 text-primary"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
            }
          `}
        >
          <div className="flex items-center gap-3">
            <span className={`transition-colors ${isActive ? "text-primary" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`}>
              {item.icon}
            </span>
            <span className="text-sm font-medium">{item.label}</span>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {/* Children */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-out ${
            expanded ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="ml-3 pl-3 border-l-2 border-slate-100 dark:border-slate-800 space-y-0.5 py-1">
            {item.children?.map((child) => {
              const childActive = location === child.href;
              return (
                <button
                  type="button"
                  key={child.href}
                  onClick={() => onNavigate(child.href)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                    transition-all duration-150
                    ${childActive
                      ? "bg-primary text-white shadow-sm shadow-primary/25"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                    }
                  `}
                >
                  <span className={childActive ? "text-white/80" : ""}>{child.icon}</span>
                  <span>{child.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Leaf item
  return (
    <button
      type="button"
      onClick={() => item.href && onNavigate(item.href)}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        transition-all duration-200 group
        ${isActive
          ? "bg-primary text-white shadow-sm shadow-primary/25"
          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
        }
      `}
    >
      <span className={`transition-colors ${isActive ? "text-white/80" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`}>
        {item.icon}
      </span>
      <span className="flex-1 text-sm font-medium text-left">{item.label}</span>
      {badge && <span className="flex-shrink-0">{badge}</span>}
    </button>
  );
}

// ----------------------------------------------------------------
// Sidebar inner content (used in both desktop sidebar & drawer)
// ----------------------------------------------------------------
interface SidebarContentProps {
  location: string;
  onNavigate: (href: string) => void;
  mode: "expanded" | "icon-only";
  onToggle?: () => void;
}

/** AI 生成进度角标：展开模式文字 + 进度，图标模式仅显示旋转圆点 */
function AiGeneratingBadge({ progress, mode }: { progress: number; mode: 'expanded' | 'icon-only' }) {
  if (mode === 'expanded') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse flex-shrink-0" />
        {progress}%
      </span>
    );
  }
  // Icon-only: 小圆点角标
  return (
    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
    </span>
  );
}

function SidebarContent({ location, onNavigate, mode, onToggle }: SidebarContentProps) {
  const { user, logout } = useAuth();
  const { isGenerating, progress } = useAiGeneration();
  const isExpanded = mode === "expanded";

  const handleLogout = async () => {
    await logout();
    onNavigate("/login");
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Logo ── */}
      <div
        className={`
          flex items-center border-b border-slate-100 dark:border-slate-800
          transition-all duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${isExpanded ? "h-20 px-5 gap-3" : "h-[72px] justify-center px-2"}
        `}
      >
        {/* Icon */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
            <Boxes className="h-5 w-5 text-white" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full border-2 border-white dark:border-slate-900" />
        </div>

        {/* Text — hidden in icon-only */}
        {isExpanded && (
          <div className="overflow-hidden">
            <h1 className="text-slate-900 dark:text-white text-base font-bold tracking-tight whitespace-nowrap">
              AutoTest
            </h1>
            <p className="text-slate-500 dark:text-slate-500 text-xs whitespace-nowrap">
              自动化测试平台
            </p>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className={`flex-1 overflow-y-auto py-4 ${isExpanded ? "px-3" : "px-2"}`}>
        <div className={`space-y-1 ${!isExpanded ? "flex flex-col items-stretch gap-1" : ""}`}>
          {navItems.map((item) => {
            // 仅对"AI 用例"菜单项在生成中时展示角标
            const isAiCaseItem = item.label === "AI 用例";
            const badge =
              isAiCaseItem && isGenerating ? (
                <AiGeneratingBadge progress={progress} mode={isExpanded ? 'expanded' : 'icon-only'} />
              ) : undefined;

            return isExpanded ? (
              <ExpandedNavItem
                key={item.label}
                item={item}
                location={location}
                onNavigate={onNavigate}
                defaultExpanded={item.children?.some((c) => location === c.href)}
                badge={badge}
              />
            ) : (
              <IconOnlyNavItem
                key={item.label}
                item={item}
                location={location}
                onNavigate={onNavigate}
                badge={badge}
              />
            );
          })}
        </div>
      </nav>

      {/* ── Footer ── */}
      <div className={`border-t border-slate-100 dark:border-slate-800 ${isExpanded ? "p-3 space-y-1" : "p-2 space-y-1"}`}>

        {/* Collapse toggle (desktop only) — placed above user profile */}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={isExpanded ? "收起导航" : "展开导航"}
            className={`
              w-full flex items-center rounded-xl
              text-slate-400 dark:text-slate-500
              hover:bg-slate-100 dark:hover:bg-slate-800
              hover:text-slate-600 dark:hover:text-slate-300
              active:scale-[0.97] active:bg-slate-200 dark:active:bg-slate-700
              transition-all duration-200
              ${isExpanded ? "gap-3 px-3 py-2.5" : "justify-center h-11"}
            `}
          >
            {isExpanded ? (
              <>
                <PanelLeftClose className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium">收起导航</span>
              </>
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Divider between collapse btn and user profile */}
        {onToggle && (
          <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
        )}

        {/* Theme Toggle */}
        {isExpanded ? (
          <div className="px-1 py-1">
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <ThemeToggle iconOnly />
          </div>
        )}

        {/* User Profile */}
        {isExpanded ? (
          <button
            type="button"
            onClick={() => onNavigate("/profile")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white transition-all duration-200 group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {user?.display_name || user?.username || "用户"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 truncate">查看个人资料</p>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate("/profile")}
            title="个人资料"
            className="w-full flex items-center justify-center h-11 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white transition-all duration-200"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
              <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
          </button>
        )}

        {/* Logout */}
        {isExpanded ? (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">退出登录</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            title="退出登录"
            className="w-full flex items-center justify-center h-11 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-all duration-200"
          >
            <LogOut className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Main Sidebar export
// ----------------------------------------------------------------
export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { navState, isDrawerOpen, toggleNav, openDrawer, closeDrawer } = useNavCollapse();

  const handleNavigate = useCallback(
    (href: string) => {
      setLocation(href);
    },
    [setLocation]
  );

  // ── Desktop sidebar (expanded or icon-only) ──
  if (navState === "expanded" || navState === "icon-only") {
    const w = navState === "expanded" ? 200 : 72;
    return (
      <aside
        style={{
          width: w,
          minWidth: w,
          transition: "width 0.28s cubic-bezier(0.4,0,0.2,1), min-width 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}
        className="hidden lg:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 h-full overflow-hidden"
      >
        <SidebarContent
          location={location}
          onNavigate={handleNavigate}
          mode={navState}
          onToggle={toggleNav}
        />
      </aside>
    );
  }

  // ── Drawer mode (mobile / hidden) ──
  return (
    <>
      {/* Mobile hamburger trigger — fixed top-left since Header is removed */}
      <button
        type="button"
        onClick={openDrawer}
        title="打开导航菜单"
        className="
          lg:hidden fixed top-3 left-3 z-30
          flex items-center justify-center w-9 h-9
          rounded-lg bg-white/90 dark:bg-slate-900/90
          backdrop-blur-sm
          border border-slate-200/80 dark:border-slate-700/80
          shadow-sm shadow-slate-200/60 dark:shadow-slate-900/60
          text-slate-500 dark:text-slate-400
          hover:bg-slate-50 dark:hover:bg-slate-800
          hover:text-slate-700 dark:hover:text-white
          active:scale-95
          transition-all duration-200
        "
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Backdrop */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden
            animate-in fade-in-0 duration-200"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        style={{
          width: "min(70vw, 300px)",
          transform: isDrawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}
        className="fixed left-0 top-0 z-50 h-full
          bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800
          flex flex-col shadow-2xl lg:hidden"
      >
        {/* Drawer close button */}
        <button
          type="button"
          onClick={closeDrawer}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <SidebarContent
          location={location}
          onNavigate={(href) => {
            handleNavigate(href);
            closeDrawer();
          }}
          mode="expanded"
        />
      </div>
    </>
  );
}
