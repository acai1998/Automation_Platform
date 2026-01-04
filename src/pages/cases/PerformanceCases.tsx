import { Gauge } from 'lucide-react';
import { BaseCaseList } from '@/components/cases/BaseCaseList';
import { SIMPLE_COLUMNS } from '@/components/cases/commonColumns';

/**
 * 性能自动化用例管理页面
 */
export default function PerformanceCases() {
  return (
    <BaseCaseList
      type="performance"
      title="性能自动化用例"
      icon={<Gauge className="w-6 h-6" />}
      description="管理性能 / 压测相关用例"
      columns={SIMPLE_COLUMNS}
    />
  );
}
