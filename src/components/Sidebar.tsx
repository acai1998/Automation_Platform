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
  Github,
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
  { icon: <Github className="h-5 w-5" />, label: "GitHub 仓库", href: "/repositories" },
  { icon: <BarChart3 className="h-5 w-5" />, label: "报告中心", href: "/reports" },
  { icon: <Settings className="h-5 w-5" />, label: "系统设置", href: "/settings" },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
    // 默认展开包含当前路径的菜单
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
    <aside className="hidden lg:flex w-72 flex-col border-r border-slate-200 dark:border-[#234833] bg-slate-50 dark:bg-[#122017] h-full">
      <div className="flex flex-col h-full justify-between p-4">
        {/* Logo & Nav */}
        <div className="flex flex-col gap-6">
          {/* Brand */}
          <div className="flex gap-3 items-center px-2">
            <div className="rounded-lg size-10 bg-primary/20 flex items-center justify-center text-primary">
              <Boxes className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">
                AutoTest
              </h1>
              <p className="text-slate-500 dark:text-[#92c9a9] text-xs font-normal">
                自动化测试平台
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const isExpanded = expandedMenus.has(item.label);
              const isActive = item.href ? location === item.href : isChildActive(item);

              if (hasChildren) {
                return (
                  <div key={item.label}>
                    {/* 父菜单 */}
                    <button
                      onClick={() => toggleMenu(item.label)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* 子菜单 */}
                    <div
                      className={`overflow-hidden transition-all duration-200 ${
                        isExpanded ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-4">
                        {item.children?.map((child) => {
                          const isChildItemActive = location === child.href;
                          return (
                            <button
                              key={child.href}
                              onClick={() => setLocation(child.href)}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isChildItemActive
                                  ? "bg-primary/20 text-primary border border-primary/10"
                                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                              }`}
                            >
                              {child.icon}
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
                  key={item.href}
                  onClick={() => item.href && setLocation(item.href)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/10"
                      : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                  }`}
                >
                  {item.icon}
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile / Footer */}
        <div className="flex flex-col gap-3 border-t border-slate-200 dark:border-[#234833] pt-4">
          {/* Theme Toggle */}
          <div className="px-2 mb-2">
            <ThemeToggle />
          </div>

          {/* User */}
          <button
            onClick={() => setLocation('/profile')}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-slate-900 dark:text-white text-sm font-medium">
                {user?.display_name || user?.username || '用户'}
              </span>
              <span className="text-xs text-slate-500 dark:text-gray-500">查看个人资料</span>
            </div>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-400/10 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">退出登录</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
