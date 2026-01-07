import { RepositoryConfig } from '@/api/repositories';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2, Zap, Check, AlertCircle, Clock, Loader2, Package } from 'lucide-react';
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
  // 状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Check className="w-3.5 h-3.5" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5" />;
      default:
        return <Clock className="w-3.5 h-3.5" />;
    }
  };

  // 状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    }
  };

  // 状态文本
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

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <div className="absolute inset-0 h-10 w-10 animate-ping opacity-20 rounded-full bg-indigo-500" />
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">加载中...</span>
      </div>
    );
  }

  // 空状态
  if (repositories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500 dark:text-slate-400">
        <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800">
          <Package className="h-8 w-8" />
        </div>
        <p className="font-medium">暂无仓库配置</p>
        <p className="text-sm">请点击上方「新建仓库」按钮创建仓库配置</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 桌面端表格 */}
      <div className="hidden lg:block overflow-auto">
        <table className="w-full min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                仓库名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                仓库地址
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                脚本类型
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                状态
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                最后同步
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {repositories.map((repo: RepositoryConfig) => (
              <tr
                key={repo.id}
                className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-150"
              >
                <td className="px-4 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {repo.name}
                    </p>
                    {repo.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {repo.description}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded max-w-[300px] inline-block truncate">
                    {repo.repo_url}
                  </code>
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {repo.script_type}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusStyle(repo.status)}`}
                  >
                    {getStatusIcon(repo.status)}
                    {getStatusText(repo.status)}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  {repo.last_sync_at ? (
                    <div className="text-sm">
                      <p className="text-slate-600 dark:text-slate-400">
                        {formatDistanceToNow(new Date(repo.last_sync_at), {
                          locale: zhCN,
                          addSuffix: true,
                        })}
                      </p>
                      {repo.last_sync_status && (
                        <p
                          className={`text-xs mt-0.5 ${
                            repo.last_sync_status === 'success'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {repo.last_sync_status === 'success' ? '✓ 成功' : '✗ 失败'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 dark:text-slate-500">未同步</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSync(repo.id)}
                      title="同步仓库"
                      className="h-8 w-8 p-0 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      <Zap className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(repo.id)}
                      title="编辑"
                      className="h-8 w-8 p-0 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(repo.id)}
                      title="删除"
                      className="h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
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

      {/* 平板端表格（简化列） */}
      <div className="hidden md:block lg:hidden overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                仓库信息
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                类型 / 状态
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {repositories.map((repo: RepositoryConfig) => (
              <tr
                key={repo.id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-150"
              >
                <td className="px-4 py-3">
                  <div className="max-w-[300px]">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {repo.name}
                    </p>
                    <code className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate block mt-1">
                      {repo.repo_url}
                    </code>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center w-fit px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {repo.script_type}
                    </span>
                    <span
                      className={`inline-flex items-center w-fit gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusStyle(repo.status)}`}
                    >
                      {getStatusIcon(repo.status)}
                      {getStatusText(repo.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSync(repo.id)}
                      className="h-8 w-8 p-0"
                    >
                      <Zap className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(repo.id)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(repo.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
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

      {/* 移动端卡片列表 */}
      <div className="md:hidden overflow-auto">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {repositories.map((repo: RepositoryConfig) => (
            <div
              key={repo.id}
              className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors duration-150"
            >
              {/* 卡片头部 */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug mb-2">
                    {repo.name}
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {repo.script_type}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusStyle(repo.status)}`}
                    >
                      {getStatusIcon(repo.status)}
                      {getStatusText(repo.status)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 卡片详情 */}
              <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-0.5">
                    仓库地址
                  </p>
                  <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block truncate">
                    {repo.repo_url}
                  </code>
                </div>
                {repo.description && (
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-0.5">
                      描述
                    </p>
                    <p className="line-clamp-2 leading-relaxed">{repo.description}</p>
                  </div>
                )}
                {repo.last_sync_at && (
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-0.5">
                      最后同步
                    </p>
                    <p>
                      {formatDistanceToNow(new Date(repo.last_sync_at), {
                        locale: zhCN,
                        addSuffix: true,
                      })}
                      {repo.last_sync_status && (
                        <span
                          className={`ml-2 ${
                            repo.last_sync_status === 'success'
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {repo.last_sync_status === 'success' ? '✓ 成功' : '✗ 失败'}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSync(repo.id)}
                  className="flex-1 h-8 gap-1.5 text-xs"
                >
                  <Zap className="w-3.5 h-3.5" />
                  同步
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(repo.id)}
                  className="flex-1 h-8 gap-1.5 text-xs"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  编辑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(repo.id)}
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}