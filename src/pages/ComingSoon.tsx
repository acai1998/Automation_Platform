import { Layout } from '@/components/Layout';
import { Construction, Wrench, Clock, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export default function ComingSoon({ title, description, icon }: ComingSoonProps) {
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <div className="text-center max-w-md">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
            {icon || <Construction className="h-10 w-10 text-blue-500" />}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            {title}
          </h1>

          {/* Description */}
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            {description || '该功能正在开发中，敬请期待...'}
          </p>

          {/* Status Card */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-6 mb-8">
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Wrench className="h-4 w-4 text-orange-500" />
                <span>开发中</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Clock className="h-4 w-4 text-blue-500" />
                <span>即将上线</span>
              </div>
            </div>
          </div>

          {/* Back Button */}
          <button
            onClick={() => setLocation('/')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            返回仪表盘
          </button>
        </div>
      </div>
    </Layout>
  );
}
