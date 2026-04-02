"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface InsightMetric {
  key: string;
  label: string;
  value: number;
  suffix: string;
  description: string;
  tone: "sky" | "emerald" | "amber" | "violet";
}

interface ScoreBand {
  label: string;
  count: number;
  percentage: number;
}

interface QuestionPerformanceItem {
  questionId: string;
  questionNumber: number;
  shortLabel: string;
  fullLabel: string;
  masteryRate: number;
  attempts: number;
  perfectCount: number;
  unansweredCount: number;
  averageScore: number;
}

interface Props {
  scopeLabel: string;
  passingScore: number;
  totalCount: number;
  attemptedCount: number;
  questionCount: number;
  metrics: InsightMetric[];
  scoreDistribution: ScoreBand[];
  questionPerformance: QuestionPerformanceItem[];
  hardestQuestion: QuestionPerformanceItem | null;
  easiestQuestion: QuestionPerformanceItem | null;
  fullyMasteredQuestions: QuestionPerformanceItem[];
}

const metricToneClasses: Record<InsightMetric["tone"], string> = {
  violet: "border-[#ECE9FF] bg-[#F2F0FF]",
  sky: "border-[#E0F0FF] bg-[#EEF7FF]",
  emerald: "border-[#DDF8EE] bg-[#EEFBF3]",
  amber: "border-[#F7F0D8] bg-[#FFF9E8]",
};

function formatValue(value: number, suffix: string) {
  return `${value}${suffix}`;
}

function EmptyAnalyticsState() {
  return (
    <div className="rounded-[24px] border border-dashed border-[#E5E7EB] bg-[#FAFAFA] px-6 py-12 text-center">
      <p className="text-sm font-medium text-[#111827]">
        Одоогоор оролдлого бүртгэгдээгүй байна.
      </p>
      <p className="mt-2 text-sm text-[#6B7280]">
        Сурагчид шалгалт өгч эхэлмэгц энд график ба анализ харагдана.
      </p>
    </div>
  );
}

function MetricCards({ metrics }: { metrics: InsightMetric[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.key}
          className={cn(
            "rounded-[24px] border px-5 py-4 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset]",
            metricToneClasses[metric.tone],
          )}
        >
          <p className="text-[16px] font-medium text-[#6B7280]">{metric.label}</p>
          <p className="mt-3 text-[24px] font-semibold text-[#3C468B]">
            {formatValue(metric.value, metric.suffix)}
          </p>
          <p className="mt-3 text-[14px] text-[#6B7280]">{metric.description}</p>
        </div>
      ))}
    </div>
  );
}

export default function ResultsInsightsPanel({
  scopeLabel,
  attemptedCount,
  totalCount,
  questionCount,
  metrics,
  scoreDistribution,
  questionPerformance,
  hardestQuestion,
  easiestQuestion,
  fullyMasteredQuestions,
}: Props) {
  return (
    <section className="rounded-[26px] border border-[#ECECEC] bg-white p-4 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.18)] md:p-5">
      <div className=" pb-7 ">
        <h2 className="text-[20px] font-medium ">
          График ба анализ
        </h2>
        <p className="mt-1 text-[15px] text-[#6B6B6B] font-medium">{scopeLabel}</p>
      </div>

      {attemptedCount === 0 ? (
        <EmptyAnalyticsState />
      ) : (
        <Tabs defaultValue="progress" className="w-full ">
          <TabsList className="rounded-full bg-[#F2F2F2] p-1 py-5">
            <TabsTrigger
              value="progress"
              className="min-w-[118px] rounded-full px-6 py-4 text-[15px] font-medium text-[#3F3F46] data-[state=active]:bg-white data-[state=active]:text-[#111827] data-[state=active]:shadow-sm"
            >
              Ахиц
            </TabsTrigger>
            <TabsTrigger
              value="questions"
              className="min-w-[118px] rounded-full px-6 py-4 text-[15px] font-medium text-[#3F3F46] data-[state=active]:bg-white data-[state=active]:text-[#111827] data-[state=active]:shadow-sm"
            >
              Асуултууд
            </TabsTrigger>
          </TabsList>

          <TabsContent value="progress" className="mt-5">
            <MetricCards metrics={metrics} />
          </TabsContent>

          <TabsContent value="questions" className="mt-5 space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="rounded-[24px] border border-[#F7E6E6] bg-[#FFF4F4] px-5 py-5">
                <p className="text-[16px] font-semibold text-[#E05252]">Хамгийн их алдсан</p>
                <p className="mt-3 text-[22px] font-semibold text-[#111827]">
                  {hardestQuestion ? `Асуулт ${hardestQuestion.questionNumber}` : "—"}
                </p>
                <p className="mt-2 text-[14px] font-medium text-[#575555]">
                  {hardestQuestion
                    ? `${hardestQuestion}`
                    : "Мэдээлэл алга"}
                </p>
              </div>

              <div className="rounded-[24px] border border-[#DDF8EE] bg-[#EEFBF3] px-5 py-5">
                <p className="text-[16px] font-semibold text-[#6BBF7A]">Хамгийн сайн хариулсан</p>
                <p className="mt-3 text-[22px] font-semibold text-[#111827]">
                  {easiestQuestion ? `Асуулт ${easiestQuestion.questionNumber}` : "—"}
                </p>
                <p className="mt-2 text-[14px] font-medium text-[#575555]">
                  {easiestQuestion
                    ? `${easiestQuestion}`
                    : "Мэдээлэл алга"}
                </p>
              </div>
            </div>
 </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
