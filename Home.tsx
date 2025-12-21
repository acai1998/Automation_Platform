import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileJson, Zap, BarChart3, Bell } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="max-w-md w-full">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Automated Testing Platform</CardTitle>
              <CardDescription>Manage and execute your Postman Collections with ease</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Welcome to the Automated Testing Platform. Sign in to start managing your API tests.
              </p>
              <Button
                className="w-full"
                onClick={() => (window.location.href = getLoginUrl())}
              >
                Sign In with Manus
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Automated Testing Platform</h1>
            <p className="text-gray-500">Welcome, {user?.name}</p>
          </div>
          <Button variant="outline" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* Collections Card */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/collections')}>
            <CardHeader>
              <FileJson className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Collections</CardTitle>
              <CardDescription>Manage Postman Collections</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-gray-500">Collections</p>
            </CardContent>
          </Card>

          {/* Scheduled Tasks Card */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <Zap className="h-8 w-8 text-yellow-600 mb-2" />
              <CardTitle>Scheduled Tasks</CardTitle>
              <CardDescription>Automated execution</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-gray-500">Active tasks</p>
            </CardContent>
          </Card>

          {/* Analytics Card */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <BarChart3 className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Analytics</CardTitle>
              <CardDescription>Test results metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0%</p>
              <p className="text-sm text-gray-500">Pass rate</p>
            </CardContent>
          </Card>

          {/* Notifications Card */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <Bell className="h-8 w-8 text-red-600 mb-2" />
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Alerts reminders</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-gray-500">Unread</p>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started Section */}
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Follow these steps to set up your first test</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="text-gray-700">
                <strong>Import a Collection:</strong> Go to Collections and upload your Postman Collection JSON file
              </li>
              <li className="text-gray-700">
                <strong>Run Tests:</strong> Execute your collection manually to verify it works
              </li>
              <li className="text-gray-700">
                <strong>Schedule Tasks:</strong> Set up automated execution using Cron expressions
              </li>
              <li className="text-gray-700">
                <strong>Monitor Results:</strong> View analytics and test results in the dashboard
              </li>
            </ol>
            <Button className="mt-6" onClick={() => setLocation('/collections')}>
              Start with Collections
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
