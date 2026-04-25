import { Link } from "wouter";
import { ArrowRight, BarChart3, Clock3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const featureList = [
  {
    icon: BarChart3,
    title: "可视化测试洞察",
    description: "统一查看执行趋势、成功率和关键质量指标，帮助团队快速决策。",
  },
  {
    icon: Clock3,
    title: "灵活任务调度",
    description: "支持定时触发、手动执行和流水线集成，让测试流程更自动化。",
  },
  {
    icon: ShieldCheck,
    title: "稳定执行闭环",
    description: "通过标准化流程管理用例与执行结果，持续提升交付可靠性。",
  },
];

export default function Landing() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto flex max-w-6xl flex-col px-6 pb-16 pt-24 md:px-10 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">
            自动化测试管理平台
          </p>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            简洁高效的测试门户
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600 dark:text-slate-300 md:text-lg">
            聚焦用例管理、任务调度与执行分析，帮助团队高质量、可追踪地推进自动化测试。
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="min-w-32">
                登录平台
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {featureList.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <feature.icon className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              <h2 className="mt-4 text-lg font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
