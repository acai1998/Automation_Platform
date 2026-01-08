import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ComingSoon from "./pages/ComingSoon";
import GitHubRepositoryManagement from "./pages/GitHubRepositoryManagement";
import APICases from "./pages/cases/APICases";
import UICases from "./pages/cases/UICases";
import PerformanceCases from "./pages/cases/PerformanceCases";
import Tasks from "./pages/tasks/Tasks";
import Reports from "./pages/reports/Reports";
import ReportDetail from "./pages/reports/ReportDetail";
import { Boxes, BarChart3, Settings, User } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 创建 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟
      retry: 1,
    },
  },
});

// 开发中页面的包装组件
function TasksPage() {
  return (
    <ComingSoon
      title="任务管理"
      description="测试任务的调度、执行和监控功能正在开发中"
      icon={<Boxes className="h-10 w-10 text-blue-500" />}
    />
  );
}

function ReportsPage() {
  return <Reports />;
}

function ReportDetailPage() {
  return <ReportDetail />;
}

function SettingsPage() {
  return (
    <ComingSoon
      title="系统设置"
      description="系统配置、Jenkins 集成和通知设置功能正在开发中"
      icon={<Settings className="h-10 w-10 text-blue-500" />}
    />
  );
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

function Router() {
  return (
    <Switch>
      {/* 公开路由 */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />

      {/* 受保护路由 */}
      <Route path="/">
        <ProtectedRoute>
          <Layout>
            <Home />
          </Layout>
        </ProtectedRoute>
      </Route>

      {/* 用例管理路由 */}
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

      <Route path="/tasks">
        <ProtectedRoute>
          <Layout>
            <TasksPage />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/repositories">
        <ProtectedRoute>
          <Layout>
            <GitHubRepositoryManagement />
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
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light">
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;