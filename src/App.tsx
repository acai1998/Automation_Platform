import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ComingSoon from "./pages/ComingSoon";
import { FolderOpen, Boxes, BarChart3, Settings, User } from "lucide-react";

// 开发中页面的包装组件
function CasesPage() {
  return (
    <ComingSoon
      title="用例管理"
      description="测试用例的创建、编辑、分组和管理功能正在开发中"
      icon={<FolderOpen className="h-10 w-10 text-blue-500" />}
    />
  );
}

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
  return (
    <ComingSoon
      title="报告中心"
      description="测试报告的生成、查看和导出功能正在开发中"
      icon={<BarChart3 className="h-10 w-10 text-blue-500" />}
    />
  );
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
          <Home />
        </ProtectedRoute>
      </Route>
      <Route path="/cases">
        <ProtectedRoute>
          <CasesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/tasks">
        <ProtectedRoute>
          <TasksPage />
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute>
          <ReportsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute>
          <ProfilePage />
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
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
