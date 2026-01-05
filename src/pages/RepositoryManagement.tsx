import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { repositoriesApi, RepositoryConfig } from '@/api/repositories';
import RepositoryList from '@/components/RepositoryList';
import RepositoryForm from '@/components/RepositoryForm';
import { toast } from 'sonner';
import { Plus, RefreshCw, FolderGit } from 'lucide-react';

export default function RepositoryManagement() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: repositories = [], isLoading, refetch } = useQuery({
    queryKey: ['repositories'],
    queryFn: async () => {
      const response = await repositoriesApi.getRepositories();
      return response.data || [];
    },
  });

  const handleCreateSuccess = () => {
    setShowForm(false);
    setEditingId(null);
    refetch();
    toast.success('仓库配置已创建');
  };

  const handleUpdateSuccess = () => {
    setShowForm(false);
    setEditingId(null);
    refetch();
    toast.success('仓库配置已更新');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个仓库配置吗？')) return;

    try {
      await repositoriesApi.deleteRepository(id);
      refetch();
      toast.success('仓库配置已删除');
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  const handleSync = async (id: number) => {
    try {
      const result = await repositoriesApi.syncRepository(id);
      if (result.success) {
        refetch();
        toast.success('同步已启动');
      }
    } catch (error: any) {
      toast.error(error.message || '同步失败');
    }
  };

  const editingRepo = editingId ? repositories.find((r: RepositoryConfig) => r.id === editingId) || undefined : undefined;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 顶部标题区 - 带渐变背景 */}
      <div className="relative px-4 sm:px-6 py-6 bg-gradient-to-r from-indigo-500/20 via-indigo-500/5 to-transparent dark:from-slate-800/50 dark:via-transparent rounded-t-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm">
              <FolderGit className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                仓库管理
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                管理和同步远程测试脚本仓库
              </p>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="h-9 px-4 gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 hover:shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">刷新</span>
            </Button>
            <Button
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
              className="h-9 px-4 gap-2 bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-indigo-500/30"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">新建仓库</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-h-0 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          {showForm && (
            <Card className="p-6 border-slate-200/80 dark:border-slate-700/50 shadow-sm">
              <RepositoryForm
                repository={editingRepo}
                onSuccess={editingId ? handleUpdateSuccess : handleCreateSuccess}
                onCancel={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              />
            </Card>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/80 dark:border-slate-700/50">
            <RepositoryList
              repositories={repositories}
              isLoading={isLoading}
              onEdit={(id: number) => {
                setEditingId(id);
                setShowForm(true);
              }}
              onDelete={handleDelete}
              onSync={handleSync}
            />
          </div>
        </div>
      </div>
    </div>
  );
}