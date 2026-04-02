import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getStudentLearningPageData,
} from "@/lib/student-learning/actions";
import StudyPlanPanel from "./_features/StudyPlanPanel";
import PracticeBuilder from "./_features/PracticeBuilder";
import LearningAutoRefresh from "./_features/LearningAutoRefresh";

const LEARNING_ERROR_MESSAGES: Record<string, string> = {
  practice_empty: "Practice шалгалтын өгөгдөл дутуу байна. Шинээр practice үүсгээд дахин оролдоно уу.",
};

export default async function StudentLearningPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; error?: string }>;
}) {
  const { subject: requestedSubjectId, error: requestedError } = await searchParams;
  const pageData = await getStudentLearningPageData(requestedSubjectId);

  if ("error" in pageData) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Learning Hub</h2>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {pageData.error}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { overview, selectedSubject, studyPlan: studyPlanState } = pageData;

  if (overview.subjects.length === 0) {
    return (
      <div className="space-y-6">
        <LearningAutoRefresh active={overview.isRefreshing} />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Learning Hub</h2>
          <p className="text-muted-foreground">
            Таны mastery profile болон хувийн practice энд харагдана
          </p>
        </div>

        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {overview.isRefreshing
              ? "Mastery profile шинэчлэгдэж байна. Түр хүлээгээд дахин шалгана уу."
              : "Одоогоор weak-topic profile үүсгэх хангалттай data алга."}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!overview.selectedSubjectId || !selectedSubject) {
    return (
      <div className="space-y-6">
        <LearningAutoRefresh active={overview.isRefreshing} />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Learning Hub</h2>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Хичээлийн learning data олдсонгүй.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedSubjectId = overview.selectedSubjectId;
  const subjectLearning = selectedSubject;
  const plan = studyPlanState && !("error" in studyPlanState) ? studyPlanState.plan : null;
  const isStale =
    studyPlanState && !("error" in studyPlanState) ? studyPlanState.isStale : false;

  return (
    <div className="space-y-6 pb-10">
      <LearningAutoRefresh active={overview.isRefreshing} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Learning Hub</h2>
          <p className="text-muted-foreground">
            Сул сэдвүүдээ харж, AI study plan авч, зөвхөн өөртөө practice шалгалт өгнө
          </p>
        </div>
        <Link href="/student">
          <Button variant="outline">Dashboard руу буцах</Button>
        </Link>
      </div>

      {requestedError && LEARNING_ERROR_MESSAGES[requestedError] ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {LEARNING_ERROR_MESSAGES[requestedError]}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overview.subjects.map((subject) => {
          const isActive = subject.subject_id === selectedSubjectId;
          return (
            <Link
              key={subject.subject_id}
              href={`/student/learning?subject=${subject.subject_id}`}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                isActive ? "border-[#4078C1] ring-2 ring-[#4078C1]/20" : "hover:bg-zinc-50"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-zinc-900">{subject.subject_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {subject.weak_topic_count > 0
                        ? `${subject.weak_topic_count} weak topic`
                        : "Topic summary pending"}
                    </p>
                  </div>
                  <Badge variant={subject.mastery_score < 60 ? "secondary" : "outline"}>
                    {Math.round(subject.mastery_score)}%
                  </Badge>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-[#4078C1]"
                    style={{ width: `${Math.min(subject.mastery_score, 100)}%` }}
                  />
                </div>

                {subject.needs_topic_backfill && (
                  <p className="text-xs text-amber-600">
                    Topic breakdown хараахан бүрэн бэлэн болоогүй байна.
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-5">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">
                {subjectLearning.subject.subject_name} хичээлийн Weak Topic Map
              </CardTitle>
            </CardHeader>
            <CardContent>
              {subjectLearning.topics.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Энэ хичээл дээр topic-level detail хараахан бэлэн болоогүй байна.
                </div>
              ) : (
                <div className="space-y-3">
                  {subjectLearning.topics.map((topic) => (
                    <div key={topic.topic_key} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-zinc-900">{topic.topic_label}</p>
                          <p className="text-xs text-muted-foreground">
                            Official: {topic.official_percentage ?? "—"}% · Practice:{" "}
                            {topic.practice_percentage ?? "—"}%
                          </p>
                        </div>
                        <Badge variant={topic.mastery_score < 60 ? "secondary" : "outline"}>
                          {Math.round(topic.mastery_score)}%
                        </Badge>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${
                            topic.mastery_score < 60 ? "bg-[#D44F45]" : "bg-[#4078C1]"
                          }`}
                          style={{ width: `${Math.min(topic.mastery_score, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <PracticeBuilder
            key={selectedSubjectId}
            subjectId={selectedSubjectId}
            subjectName={subjectLearning.subject.subject_name}
            topics={subjectLearning.topics}
            practiceHistory={subjectLearning.practiceHistory}
          />
        </div>

        <StudyPlanPanel
          subjectId={selectedSubjectId}
          plan={plan}
          isStale={isStale}
          status={
            studyPlanState && !("error" in studyPlanState)
              ? studyPlanState.status
              : "idle"
          }
          lastError={
            studyPlanState && !("error" in studyPlanState)
              ? studyPlanState.lastError
              : null
          }
          isRefreshing={
            Boolean(subjectLearning.isRefreshing) ||
            Boolean(studyPlanState && !("error" in studyPlanState) && studyPlanState.isRefreshing)
          }
          disabled={subjectLearning.topics.length === 0}
        />
      </div>
    </div>
  );
}
