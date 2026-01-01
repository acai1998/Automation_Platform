import { useState } from 'react';
import { RepositoryConfig, repositoriesApi } from '@/api/repositories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface RepositoryFormProps {
  repository?: RepositoryConfig;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function RepositoryForm({ repository, onSuccess, onCancel }: RepositoryFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: repository?.name || '',
    description: repository?.description || '',
    repo_url: repository?.repo_url || '',
    branch: repository?.branch || 'main',
    script_path_pattern: repository?.script_path_pattern || '**/*.{js,ts,py,java}',
    script_type: repository?.script_type || 'javascript',
    sync_interval: repository?.sync_interval || 0,
    auto_create_cases: repository?.auto_create_cases !== false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleTestConnection = async () => {
    if (!formData.repo_url) {
      toast.error('请输入仓库地址');
      return;
    }

    setIsTesting(true);
    try {
      const result = await repositoriesApi.testConnection(formData.repo_url);
      if (result.success && result.data?.connected) {
        toast.success('连接成功');
        // 获取分支列表
        if (repository?.id) {
          const branchResult = await repositoriesApi.getBranches(repository.id);
          if (branchResult.success && branchResult.data) {
            setBranches(branchResult.data);
          }
        }
      } else {
        toast.error('连接失败');
      }
    } catch (error: any) {
      toast.error(error.message || '连接测试失败');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.repo_url) {
      toast.error('请填写必填项');
      return;
    }

    setIsLoading(true);
    try {
      if (repository?.id) {
        await repositoriesApi.updateRepository(repository.id, formData as any);
      } else {
        await repositoriesApi.createRepository(formData as any);
      }
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 仓库名称 */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
            仓库名称 *
          </label>
          <Input
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="例如：测试脚本仓库"
            required
          />
        </div>

        {/* 脚本类型 */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
            脚本类型 *
          </label>
          <select
            name="script_type"
            value={formData.script_type}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="javascript">JavaScript/TypeScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="other">其他</option>
          </select>
        </div>
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
          描述
        </label>
        <Textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="添加仓库描述（可选）"
          rows={3}
        />
      </div>

      {/* 仓库地址 */}
      <div>
        <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
          仓库地址 *
        </label>
        <div className="flex gap-2">
          <Input
            name="repo_url"
            value={formData.repo_url}
            onChange={handleChange}
            placeholder="例如：https://github.com/user/repo.git"
            required
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : '测试'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 分支 */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
            分支
          </label>
          {branches.length > 0 ? (
            <select
              name="branch"
              value={formData.branch}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {branches.map(branch => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          ) : (
            <Input
              name="branch"
              value={formData.branch}
              onChange={handleChange}
              placeholder="main"
            />
          )}
        </div>

        {/* 同步间隔 */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
            同步间隔（秒，0 = 仅手动）
          </label>
          <Input
            name="sync_interval"
            type="number"
            value={formData.sync_interval}
            onChange={handleChange}
            placeholder="0"
            min="0"
          />
        </div>
      </div>

      {/* 脚本路径模式 */}
      <div>
        <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
          脚本路径模式
        </label>
        <Input
          name="script_path_pattern"
          value={formData.script_path_pattern}
          onChange={handleChange}
          placeholder="**/*.{js,ts,py,java}"
        />
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          使用 glob 模式，例如：tests/**/*.js
        </p>
      </div>

      {/* 自动创建用例 */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          name="auto_create_cases"
          checked={formData.auto_create_cases}
          onChange={handleChange}
          className="w-4 h-4 rounded border-gray-300"
        />
        <label className="text-sm text-gray-900 dark:text-white">
          自动从脚本创建测试用例
        </label>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-600">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            repository?.id ? '更新' : '创建'
          )}
        </Button>
      </div>
    </form>
  );
}