import { RepositoryConfig } from '@/api/repositories';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2, Zap, Check, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface RepositoryListProps {
  repositories: RepositoryConfig[];
  isLoading: boolean;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onSync: (id: number) => void;
}

export default function RepositoryList({
  repositories,
  isLoading,
  onEdit,
  onDelete,
  onSync,
}: RepositoryListProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-2">加载中...</p>
      </div>
    );
  }

  if (repositories.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600 dark:text-gray-400">暂无仓库配置，请创建新的仓库</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃';
      case 'inactive':
        return '停用';
      case 'error':
        return '错误';
      default:
        return status;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
              仓库名称
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
              仓库地址
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
              脚本类型
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
              状态
            </th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
              最后同步
            </th>
            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
          {repositories.map((repo: RepositoryConfig) => (
            <tr key={repo.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                <div>
                  <p className="font-semibold">{repo.name}</p>
                  {repo.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{repo.description}</p>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                  {repo.repo_url}
                </code>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                <span className="capitalize">{repo.script_type}</span>
              </td>
              <td className="px-6 py-4 text-sm">
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(repo.status)}`}>
                  {getStatusIcon(repo.status)}
                  {getStatusText(repo.status)}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                {repo.last_sync_at ? (
                  <div>
                    <p>{formatDistanceToNow(new Date(repo.last_sync_at), { locale: zhCN, addSuffix: true })}</p>
                    {repo.last_sync_status && (
                      <p className={`text-xs ${repo.last_sync_status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {repo.last_sync_status === 'success' ? '✓ 成功' : '✗ 失败'}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">未同步</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSync(repo.id)}
                    title="同步仓库"
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(repo.id)}
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(repo.id)}
                    title="删除"
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}