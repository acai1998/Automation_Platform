import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
export type NavState = "expanded" | "icon-only" | "drawer";

interface NavCollapseContextValue {
  navState: NavState;
  isDrawerOpen: boolean;
  toggleNav: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const STORAGE_KEY = "nav-collapse-state";

function getStateFromWidth(width: number): NavState {
  if (width >= 1440) return "expanded";
  if (width >= 1024) return "icon-only";
  return "drawer";
}

function loadSavedState(): NavState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "expanded" || saved === "icon-only" || saved === "drawer") {
      return saved;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveState(state: NavState) {
  try {
    localStorage.setItem(STORAGE_KEY, state);
  } catch {
    // ignore
  }
}

// ----------------------------------------------------------------
// Context
// ----------------------------------------------------------------
const NavCollapseContext = createContext<NavCollapseContextValue | null>(null);

export function NavCollapseProvider({ children }: { children: ReactNode }) {
  // Determine initial state: saved user preference or auto from viewport
  const [navState, setNavState] = useState<NavState>(() => {
    const saved = loadSavedState();
    const autoState = getStateFromWidth(window.innerWidth);
    // If the viewport demands "drawer" mode, always use drawer regardless of saved state
    if (autoState === "drawer") return "drawer";
    // Otherwise, respect saved preference
    return saved ?? autoState;
  });

  // Whether the user manually chose a state (prevents auto-resize from overriding until threshold cross)
  const isManualRef = useRef(false);

  // Drawer overlay visibility (only relevant when navState === 'drawer')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ----------------------------------------------------------------
  // Resize listener
  // ----------------------------------------------------------------
  useEffect(() => {
    let prevAutoState = getStateFromWidth(window.innerWidth);

    const handleResize = () => {
      const width = window.innerWidth;
      const autoState = getStateFromWidth(width);

      // Always force drawer on small screens
      if (autoState === "drawer") {
        isManualRef.current = false;
        setNavState("drawer");
        setIsDrawerOpen(false);
        saveState("drawer");
        prevAutoState = autoState;
        return;
      }

      // If the user has manually overridden and we haven't crossed to drawer, skip
      if (isManualRef.current) {
        prevAutoState = autoState;
        return;
      }

      // Auto switch only if the breakpoint tier changed
      if (autoState !== prevAutoState) {
        setNavState(autoState);
        saveState(autoState);
        prevAutoState = autoState;
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ----------------------------------------------------------------
  // ESC key closes drawer
  // ----------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen]);

  // ----------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------
  const toggleNav = useCallback(() => {
    setNavState((prev) => {
      let next: NavState;
      if (prev === "expanded") {
        next = "icon-only";
      } else if (prev === "icon-only") {
        next = "expanded";
      } else {
        // drawer mode — toggle just opens/closes the drawer overlay
        setIsDrawerOpen((open) => !open);
        return prev;
      }
      isManualRef.current = true;
      saveState(next);
      return next;
    });
  }, []);

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  return (
    <NavCollapseContext.Provider
      value={{ navState, isDrawerOpen, toggleNav, openDrawer, closeDrawer }}
    >
      {children}
    </NavCollapseContext.Provider>
  );
}

// ----------------------------------------------------------------
// Hook
// ----------------------------------------------------------------
export function useNavCollapse(): NavCollapseContextValue {
  const ctx = useContext(NavCollapseContext);
  if (!ctx) {
    throw new Error("useNavCollapse must be used within NavCollapseProvider");
  }
  return ctx;
}
