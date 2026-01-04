import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { repositoriesApi, RepositoryConfig } from '@/api/repositories';
import RepositoryList from '@/components/RepositoryList';
import RepositoryForm from '@/components/RepositoryForm';
import { toast } from 'sonner';
import { Plus, RefreshCw } from 'lucide-react';

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">仓库管理</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">管理和同步远程测试脚本仓库</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setShowForm(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            新建仓库
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-6">
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

      <Card>
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
      </Card>
    </div>
  );
}