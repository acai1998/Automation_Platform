import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden">
      {/* ── Sidebar ── */}
      {/*
        Desktop (lg+): sidebar is a static flex child, so <main> naturally takes the rest via flex-1.
        Mobile/Drawer: sidebar is position:fixed, so <main> needs no margin either (drawer overlays).
      */}
      <Sidebar />

      {/* ── Main Content ── */}
      {/* No top header bar — content starts from the very top of the viewport */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
