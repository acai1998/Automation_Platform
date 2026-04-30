import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type NavState = 'expanded' | 'icon-only';

interface NavCollapseContextValue {
  navState: NavState;
  toggleNav: () => void;
}

const STORAGE_KEY = 'nav-collapse-state';

function getStateFromWidth(width: number): NavState {
  if (width >= 1440) return 'expanded';
  return 'icon-only';
}

function loadSavedState(): NavState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'expanded' || saved === 'icon-only') {
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

const NavCollapseContext = createContext<NavCollapseContextValue | null>(null);

export function NavCollapseProvider({ children }: { children: ReactNode }) {
  const [navState, setNavState] = useState<NavState>(() => {
    const saved = loadSavedState();
    const autoState = getStateFromWidth(window.innerWidth);
    return saved ?? autoState;
  });

  const isManualRef = useRef(false);

  useEffect(() => {
    let prevAutoState = getStateFromWidth(window.innerWidth);

    const handleResize = () => {
      const autoState = getStateFromWidth(window.innerWidth);

      if (isManualRef.current) {
        prevAutoState = autoState;
        return;
      }

      if (autoState !== prevAutoState) {
        setNavState(autoState);
        saveState(autoState);
        prevAutoState = autoState;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleNav = useCallback(() => {
    setNavState((prev) => {
      const next: NavState = prev === 'expanded' ? 'icon-only' : 'expanded';
      isManualRef.current = true;
      saveState(next);
      return next;
    });
  }, []);

  return <NavCollapseContext.Provider value={{ navState, toggleNav }}>{children}</NavCollapseContext.Provider>;
}

export function useNavCollapse(): NavCollapseContextValue {
  const ctx = useContext(NavCollapseContext);
  if (!ctx) {
    throw new Error('useNavCollapse must be used within NavCollapseProvider');
  }
  return ctx;
}
