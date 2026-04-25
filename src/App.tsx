import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { NavCollapseProvider } from "./contexts/NavCollapseContext";
import { AiGenerationProvider, useAiGeneration } from "./contexts/AiGenerationContext";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ComingSoon from "./pages/ComingSoon";
import Tasks from "./pages/tasks/Tasks";
import APICases from "./pages/cases/APICases";
import UICases from "./pages/cases/UICases";
import PerformanceCases from "./pages/cases/PerformanceCases";
import AICases from "./pages/cases/AICases";
import AICaseCreate from "./pages/cases/AICaseCreate";
import Reports from "./pages/reports/Reports";
import ReportDetail from "./pages/reports/ReportDetail";
import SystemSettings from "./pages/settings/SystemSettings";
import { User } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function TasksPage() {
  return <Tasks />;
}

function ReportsPage() {
  return <Reports />;
}

function ReportDetailPage() {
  return <ReportDetail />;
}

function SettingsPage() {
  return <SystemSettings />;
}

function ProfilePage() {
  return (
    <ComingSoon
      title="个人资料"
      description="个人信息编辑、密码修改和偏好设置功能正在开发中"
      icon={<User className="h-10 w-10 text-blue-500" />}
    />
  );
}

/**
 * AI 用例保活组件：
 * - 只要曾经访问过 /cases/ai 就会挂载
 * - AI 生成中切换到其他路由时：用 visibility:hidden + 绝对定位保留 DOM 状态
 * - 当前路由是 /cases/ai：fixed inset-0 覆盖全屏，正常显示
 * - 非当前路由且未在生成：display:none（节省资源，但保活已挂载）
 */
function KeepAliveAiCases() {
  const [location] = useLocation();
  const { isGenerating } = useAiGeneration();
  // 用 useState 惰性初始化：如果刷新时直接落在 /cases/ai，也能立即挂载
  const [hasVisited, setHasVisited] = useState(
    () => location === '/cases/ai' || location.startsWith('/cases/ai?')
  );

  const isCurrentRoute = location === '/cases/ai' || location.startsWith('/cases/ai?');

  // 一旦用户导航到 /cases/ai，就永久标记（不会因路由变化而重置）
  useEffect(() => {
    if (isCurrentRoute && !hasVisited) {
      setHasVisited(true);
    }
  }, [isCurrentRoute, hasVisited]);

  // 未访问过 且 不在生成中 → 无需挂载
  const shouldMount = hasVisited || isGenerating;
  if (!shouldMount) {
    return null;
  }

  if (isCurrentRoute) {
    // 当前路由：用 fixed inset-0 覆盖全屏，与 Switch 内容互斥展示
    // z-index 设置较高确保覆盖在 Switch 渲染的空占位之上
    return (
      <div className="fixed inset-0 z-10">
        <ProtectedRoute>
          <Layout>
            <AICases />
          </Layout>
        </ProtectedRoute>
      </div>
    );
  }

  // 不在当前路由：隐藏但保留 DOM（保活核心）
  // display:none 会让浏览器跳过渲染，但 React 组件树和状态完整保留
  return (
    <div style={{ display: 'none' }}>
      <ProtectedRoute>
        <Layout>
          <AICases />
        </Layout>
      </ProtectedRoute>
    </div>
  );
}

function Router() {
  return (
    <>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />

        <Route path="/">
          <Landing />
        </Route>

        <Route path="/dashboard">
          <ProtectedRoute>
            <Layout>
              <Home />
            </Layout>
          </ProtectedRoute>
        </Route>

        <Route path="/cases">
          <Redirect to="/cases/api" />
        </Route>
        <Route path="/cases/api">
          <ProtectedRoute>
            <Layout>
              <APICases />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/cases/ui">
          <ProtectedRoute>
            <Layout>
              <UICases />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/cases/performance">
          <ProtectedRoute>
            <Layout>
              <PerformanceCases />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/cases/ai-create">
          <ProtectedRoute>
            <Layout>
              <AICaseCreate />
            </Layout>
          </ProtectedRoute>
        </Route>
        {/* /cases/ai 路由由 KeepAliveAiCases 接管，Switch 中仅保留空占位避免 404 */}
        <Route path="/cases/ai">
          {null}
        </Route>
        <Route path="/cases/ai-history">
          <Redirect to="/cases/ai-create" />
        </Route>

        <Route path="/tasks">
          <ProtectedRoute>
            <Layout>
              <TasksPage />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/reports">
          <ProtectedRoute>
            <Layout>
              <ReportsPage />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/reports/:id">
          <ProtectedRoute>
            <Layout>
              <ReportDetailPage />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/settings">
          <ProtectedRoute>
            <Layout>
              <SettingsPage />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/profile">
          <ProtectedRoute>
            <Layout>
              <ProfilePage />
            </Layout>
          </ProtectedRoute>
        </Route>

        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>

      {/* 保活层：永久挂载在 Switch 外部，不受路由切换影响 */}
      <KeepAliveAiCases />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light">
          <NavCollapseProvider>
            <AuthProvider>
              <AiGenerationProvider>
                <TooltipProvider>
                  <Toaster />
                  <Router />
                </TooltipProvider>
              </AiGenerationProvider>
            </AuthProvider>
          </NavCollapseProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
