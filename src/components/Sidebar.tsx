import { useState } from "react";
import { useLocation } from "wouter";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  Settings,
  LogOut,
  Boxes,
  User,
  GitBranch,
  ChevronDown,
  Code,
  Monitor,
  Gauge,
} from "lucide-react";

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
  { icon: <Boxes className="h-5 w-5" />, label: "任务管理", href: "/tasks" },
  { icon: <GitBranch className="h-5 w-5" />, label: "GitHub 仓库", href: "/repositories" },
  { icon: <BarChart3 className="h-5 w-5" />, label: "报告中心", href: "/reports" },
  { icon: <Settings className="h-5 w-5" />, label: "系统设置", href: "/settings" },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    navItems.forEach((item) => {
      if (item.children?.some((child) => location.startsWith(child.href))) {
        expanded.add(item.label);
      }
    });
    return expanded;
  });

  const handleLogout = async () => {
    await logout();
    setLocation('/login');
  };

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const isChildActive = (item: NavItem) => {
    return item.children?.some((child) => location === child.href);
  };

  return (
    <aside className="hidden lg:flex w-64 flex-col bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 h-full">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Boxes className="h-5 w-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-900" />
            </div>
            <div>
              <h1 className="text-slate-900 dark:text-white text-base font-bold tracking-tight">
                AutoTest
              </h1>
              <p className="text-slate-500 dark:text-slate-500 text-xs">
                自动化测试平台
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const isExpanded = expandedMenus.has(item.label);
              const isActive = item.href ? location === item.href : isChildActive(item);

              if (hasChildren) {
                return (
                  <div key={item.label} className="space-y-1">
                    {/* 父菜单 */}
                    <button
                      type="button"
                      onClick={() => toggleMenu(item.label)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                        isActive
                          ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`transition-colors ${isActive ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
                          {item.icon}
                        </span>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* 子菜单 */}
                    <div
                      className={`overflow-hidden transition-all duration-200 ease-out ${
                        isExpanded ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="ml-3 pl-3 border-l-2 border-slate-100 dark:border-slate-800 space-y-0.5 py-1">
                        {item.children?.map((child) => {
                          const isChildItemActive = location === child.href;
                          return (
                            <button
                              type="button"
                              key={child.href}
                              onClick={() => setLocation(child.href)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                                isChildItemActive
                                  ? "bg-blue-500 text-white shadow-sm shadow-blue-500/25"
                                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                              }`}
                            >
                              <span className={isChildItemActive ? 'text-white/80' : ''}>
                                {child.icon}
                              </span>
                              <span>{child.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              // 无子菜单的普通项
              return (
                <button
                  type="button"
                  key={item.href}
                  onClick={() => item.href && setLocation(item.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? "bg-blue-500 text-white shadow-sm shadow-blue-500/25"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <span className={`transition-colors ${isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
                    {item.icon}
                  </span>
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-2">
          {/* Theme Toggle */}
          <div className="px-1 py-2">
            <ThemeToggle />
          </div>

          {/* User Profile */}
          <button
            type="button"
            onClick={() => setLocation('/profile')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white transition-all duration-200 group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
              <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {user?.display_name || user?.username || '用户'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                查看个人资料
              </p>
            </div>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">退出登录</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
