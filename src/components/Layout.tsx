import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Menu, Boxes, User } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-sidebar-dark border-b border-slate-200 dark:border-border-dark">
          <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5">
            <Menu className="h-5 w-5 text-slate-600 dark:text-white" />
          </button>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <span className="text-slate-900 dark:text-white font-bold">AutoTest</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
