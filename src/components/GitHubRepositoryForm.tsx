import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';

interface GitHubRepository {
  id?: string;
  name: string;
  description?: string;
  url: string;
  language?: string;
  status: 'active' | 'inactive' | 'archived';
  stars?: number;
  lastSync?: string;
  createdAt?: string;
}

interface GitHubRepositoryFormProps {
  repository?: GitHubRepository;
  onSubmit: (data: Omit<GitHubRepository, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

export default function GitHubRepositoryForm({
  repository,
  onSubmit,
  onCancel,
}: GitHubRepositoryFormProps) {
  const [formData, setFormData] = useState<Omit<GitHubRepository, 'id' | 'createdAt'>>({
    name: '',
    description: '',
    url: '',
    language: '',
    status: 'active',
    stars: undefined,
    lastSync: undefined,
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (repository) {
      setFormData({
        name: repository.name,
        description: repository.description || '',
        url: repository.url,
        language: repository.language || '',
        status: repository.status,
        stars: repository.stars,
        lastSync: repository.lastSync,
      });
    }
  }, [repository]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = '仓库名称不能为空';
    }

    if (!formData.url.trim()) {
      newErrors.url = '仓库 URL 不能为空';
    } else if (!isValidUrl(formData.url)) {
      newErrors.url = '请输入有效的 URL';
    } else if (!formData.url.includes('github.com')) {
      newErrors.url = '请输入 GitHub 仓库 URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      // 模拟 API 调用
      await new Promise(resolve => setTimeout(resolve, 500));
      onSubmit(formData);
    } catch (error) {
      toast.error('提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const languages = [
    'Python',
    'JavaScript',
    'TypeScript',
    'Java',
    'Go',
    'Rust',
    'C++',
    'C#',
    'PHP',
    'Ruby',
    'Swift',
    'Kotlin',
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-blue-600 rounded"></div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {repository ? '编辑仓库' : '新增仓库'}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 仓库名称 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            仓库名称 <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            placeholder="e.g., SeleniumBase-CI"
            value={formData.name}
            onChange={e => {
              setFormData({ ...formData, name: e.target.value });
              if (errors.name) setErrors({ ...errors, name: '' });
            }}
            className={errors.name ? 'border-red-500' : ''}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.name}
            </p>
          )}
        </div>

        {/* 编程语言 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            编程语言
          </label>
          <select
            value={formData.language || ''}
            onChange={e => setFormData({ ...formData, language: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">选择语言</option>
            {languages.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
            <option value="other">其他</option>
          </select>
        </div>
      </div>

      {/* 仓库 URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          仓库 URL <span className="text-red-500">*</span>
        </label>
        <Input
          type="url"
          placeholder="https://github.com/example/repository"
          value={formData.url}
          onChange={e => {
            setFormData({ ...formData, url: e.target.value });
            if (errors.url) setErrors({ ...errors, url: '' });
          }}
          className={errors.url ? 'border-red-500' : ''}
        />
        {errors.url && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {errors.url}
          </p>
        )}
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          描述
        </label>
        <textarea
          placeholder="输入仓库描述..."
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 状态 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            状态
          </label>
          <select
            value={formData.status}
            onChange={e => setFormData({ ...formData, status: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">活跃</option>
            <option value="inactive">不活跃</option>
            <option value="archived">已归档</option>
          </select>
        </div>

        {/* Star 数量 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Star 数量
          </label>
          <Input
            type="number"
            placeholder="0"
            min="0"
            value={formData.stars || ''}
            onChange={e => setFormData({ ...formData, stars: e.target.value ? parseInt(e.target.value) : undefined })}
          />
        </div>
      </div>

      {/* 提交按钮 */}
      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          取消
        </Button>
        <Tooltip content={repository ? '更新仓库信息' : '添加新仓库'}>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {repository ? '更新' : '添加'}
              </>
            )}
          </Button>
        </Tooltip>
      </div>
    </form>
  );
}