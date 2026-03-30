"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const toneClasses: Record<InsightMetric["tone"], string> = {
  sky: "border-sky-200 bg-sky-50 text-sky-950",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  violet: "border-violet-200 bg-violet-50 text-violet-950",
};

const barClasses = [
  "from-slate-900 to-slate-500",
  "from-sky-600 to-sky-400",
  "from-emerald-600 to-emerald-400",
  "from-amber-500 to-amber-300",
] as const;

function formatValue(value: number, suffix: string) {
  return `${value}${suffix}`;
}

function EmptyAnalyticsState() {
  return (
    <div className="rounded-[24px] border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center">
      <p className="text-sm font-medium text-zinc-900">
        Одоогоор оролдлого бүртгэгдээгүй байна.
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        Сурагчид шалгалт өгч эхэлмэгц ахиц, дундаж, асуултын анализ энд
        автоматаар гарч ирнэ.
      </p>
    </div>
  );
}

export default function ResultsInsightsPanel({
  scopeLabel,
  passingScore,
  totalCount,
  attemptedCount,
  questionCount,
  metrics,
  scoreDistribution,
  questionPerformance,
  hardestQuestion,
  easiestQuestion,
  fullyMasteredQuestions,
}: Props) {
  const maxDistributionCount = Math.max(
    ...scoreDistribution.map((band) => band.count),
    1
  );
  const focusQuestions = questionPerformance.slice(0, 6);

  return (
    <Card className="h-fit rounded-[28px] border border-zinc-200 bg-white shadow-[0_12px_40px_-18px_rgba(15,23,42,0.14)] xl:sticky xl:top-6">
      <CardHeader className="space-y-3 border-b border-zinc-100 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold text-zinc-950">
              График ба анализ
            </CardTitle>
            <CardDescription className="text-sm text-zinc-500">
              {scopeLabel} · {attemptedCount}/{totalCount} оролдлого · {questionCount}{" "}
              асуулт
            </CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
            Тэнцэх босго {passingScore}%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {attemptedCount === 0 ? (
          <EmptyAnalyticsState />
        ) : (
          <Tabs defaultValue="progress" className="w-full">
            <TabsList className="h-auto w-full justify-start gap-2 rounded-2xl bg-zinc-100 p-1.5">
              <TabsTrigger
                value="progress"
                className="h-10 flex-none rounded-xl px-4 data-active:bg-white data-active:text-zinc-950"
              >
                <TrendingUp className="h-4 w-4" />
                Ахиц
              </TabsTrigger>
              <TabsTrigger
                value="distribution"
                className="h-10 flex-none rounded-xl px-4 data-active:bg-white data-active:text-zinc-950"
              >
                <BarChart3 className="h-4 w-4" />
                Тархалт
              </TabsTrigger>
              <TabsTrigger
                value="questions"
                className="h-10 flex-none rounded-xl px-4 data-active:bg-white data-active:text-zinc-950"
              >
                <Target className="h-4 w-4" />
                Асуултууд
              </TabsTrigger>
            </TabsList>

            <TabsContent value="progress" className="space-y-4 pt-2">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {metrics.map((metric) => (
                  <div
                    key={metric.key}
                    className={cn(
                      "rounded-[22px] border px-4 py-4",
                      toneClasses[metric.tone]
                    )}
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-current/70">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-current">
                      {formatValue(metric.value, metric.suffix)}
                    </p>
                    <p className="mt-2 text-sm text-current/80">
                      {metric.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                <div className="flex items-center gap-2">
                  <CircleGauge className="h-4 w-4 text-zinc-700" />
                  <p className="text-sm font-semibold text-zinc-950">
                    Ерөнхий төлөв
                  </p>
                </div>
                <div className="mt-4 space-y-4">
                  {metrics.map((metric) => (
                    <div key={`${metric.key}-bar`} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-zinc-600">{metric.label}</span>
                        <span className="font-semibold text-zinc-950">
                          {formatValue(metric.value, metric.suffix)}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-zinc-200">
                        <div
                          className="h-full rounded-full bg-zinc-900 transition-all"
                          style={{ width: `${Math.max(metric.value, 4)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="distribution" className="space-y-4 pt-2">
              <div className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-zinc-700" />
                  <p className="text-sm font-semibold text-zinc-950">
                    Онооны тархалт
                  </p>
                </div>
                <div className="mt-5 flex h-56 items-end gap-3">
                  {scoreDistribution.map((band, index) => (
                    <div
                      key={band.label}
                      className="flex flex-1 flex-col items-center gap-2"
                    >
                      <span className="text-xs font-semibold text-zinc-700">
                        {band.count}
                      </span>
                      <div className="flex h-full w-full items-end rounded-[20px] bg-white px-2 pb-2 ring-1 ring-zinc-200">
                        <div
                          className={cn(
                            "w-full rounded-[14px] bg-gradient-to-t transition-all",
                            barClasses[index % barClasses.length]
                          )}
                          style={{
                            height: `${Math.max(
                              (band.count / maxDistributionCount) * 100,
                              band.count > 0 ? 12 : 2
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-zinc-950">
                          {band.label}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {band.percentage}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {scoreDistribution.map((band) => (
                  <div
                    key={`${band.label}-summary`}
                    className="rounded-[20px] border border-zinc-200 bg-white px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      {band.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-zinc-950">
                      {band.count}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Нийт оролдлогын {band.percentage}%
                    </p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="questions" className="space-y-4 pt-2">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-sm font-semibold">Хамгийн их алдсан</p>
                  </div>
                  {hardestQuestion ? (
                    <>
                      <p className="mt-3 text-base font-semibold text-zinc-950">
                        Асуулт {hardestQuestion.questionNumber}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {hardestQuestion.shortLabel}
                      </p>
                      <p className="mt-3 text-sm font-medium text-rose-700">
                        Амжилт: {hardestQuestion.masteryRate}%
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      Асуултын анализ хараахан үүсээгүй байна.
                    </p>
                  )}
                </div>

                <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm font-semibold">Хамгийн сайн хариулсан</p>
                  </div>
                  {easiestQuestion ? (
                    <>
                      <p className="mt-3 text-base font-semibold text-zinc-950">
                        Асуулт {easiestQuestion.questionNumber}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {easiestQuestion.shortLabel}
                      </p>
                      <p className="mt-3 text-sm font-medium text-emerald-700">
                        Амжилт: {easiestQuestion.masteryRate}%
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      Асуултын анализ хараахан үүсээгүй байна.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4">
                <p className="text-sm font-semibold text-zinc-950">
                  Анхаарах асуултууд
                </p>
                <div className="mt-4 space-y-4">
                  {focusQuestions.length > 0 ? (
                    focusQuestions.map((question) => (
                      <div key={question.questionId} className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-950">
                              Асуулт {question.questionNumber}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {question.shortLabel}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-zinc-950">
                              {question.masteryRate}%
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              хоосон: {question.unansweredCount}
                            </p>
                          </div>
                        </div>
                        <div className="h-2.5 rounded-full bg-zinc-200">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
                            style={{
                              width: `${Math.max(question.masteryRate, 4)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Асуултын өгөгдөл алга.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-zinc-200 bg-white p-4">
                <p className="text-sm font-semibold text-zinc-950">
                  Бүгд сайн хариулсан асуултууд
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {fullyMasteredQuestions.length > 0 ? (
                    fullyMasteredQuestions.map((question) => (
                      <Badge
                        key={`${question.questionId}-mastered`}
                        variant="outline"
                        className="rounded-full border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-700"
                      >
                        Асуулт {question.questionNumber} · {question.masteryRate}%
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Одоогоор бүх сурагч зөв хариулсан асуулт алга.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
