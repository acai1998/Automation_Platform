import { Code } from 'lucide-react';
import { BaseCaseList } from '@/components/cases/BaseCaseList';
import { FULL_COLUMNS } from '@/components/cases/commonColumns';

/**
 * API 自动化用例管理页面
 */
export default function APICases() {
  return (
    <BaseCaseList
      type="api"
      title="API 自动化用例"
      icon={<Code className="w-6 h-6" />}
      description="管理接口自动化测试用例"
      columns={FULL_COLUMNS}
    />
  );
}
