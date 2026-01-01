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
  Github,
} from "lucide-react";

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { icon: <LayoutDashboard className="h-5 w-5" />, label: "仪表盘", href: "/" },
  { icon: <FolderOpen className="h-5 w-5" />, label: "用例管理", href: "/cases" },
  { icon: <Boxes className="h-5 w-5" />, label: "任务管理", href: "/tasks" },
  { icon: <GitBranch className="h-5 w-5" />, label: "仓库管理", href: "/repositories" },
  { icon: <Github className="h-5 w-5" />, label: "GitHub 仓库", href: "/github-repositories" },
  { icon: <BarChart3 className="h-5 w-5" />, label: "报告中心", href: "/reports" },
  { icon: <Settings className="h-5 w-5" />, label: "系统设置", href: "/settings" },
];

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    setLocation('/login');
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
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => setLocation(item.href)}
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