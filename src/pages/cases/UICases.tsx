import { Monitor } from 'lucide-react';
import { BaseCaseList } from '@/components/cases/BaseCaseList';
import { FULL_COLUMNS } from '@/components/cases/commonColumns';

/**
 * UI 自动化用例管理页面
 */
export default function UICases() {
  return (
    <BaseCaseList
      type="ui"
      title="UI 自动化用例"
      icon={<Monitor className="w-6 h-6" />}
      description="管理 UI 自动化测试用例"
      columns={FULL_COLUMNS}
    />
  );
}
