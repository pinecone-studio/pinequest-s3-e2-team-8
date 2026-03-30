import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MathContent from "@/components/math/MathContent";
import { getStudentPracticeResult } from "@/lib/student-learning/actions";

function parseStringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as string[];
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function parseMatchingPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, ...rightParts] = String(option).split("|||");
      const right = rightParts.join("|||");
      if (!left || !right) return null;
      return { left, right };
    })
    .filter((item): item is { left: string; right: string } => Boolean(item));
}

function renderAnswerValue(type: string, rawAnswer: unknown) {
  if (!rawAnswer || String(rawAnswer).trim() === "") {
    return <span className="font-medium text-muted-foreground">Хариулаагүй</span>;
  }

  if (type === "multiple_response") {
    const values = parseStringArray(rawAnswer);
    return (
      <div className="space-y-1">
        {values.map((value) => (
          <MathContent
            key={value}
            text={value}
            className="prose prose-sm max-w-none font-medium text-foreground"
          />
        ))}
      </div>
    );
  }

  if (type === "matching") {
    try {
      const parsed = JSON.parse(String(rawAnswer)) as Record<string, string>;
      const entries = Object.entries(parsed);
      return (
        <div className="space-y-1.5">
          {entries.map(([left, right]) => (
            <div key={left} className="grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <MathContent
                text={left}
                className="prose prose-sm max-w-none font-medium text-foreground"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <MathContent
                text={right}
                className="prose prose-sm max-w-none font-medium text-foreground"
              />
            </div>
          ))}
        </div>
      );
    } catch {
      return null;
    }
  }

  return (
    <MathContent
      text={String(rawAnswer)}
      className="prose prose-sm max-w-none font-medium text-foreground"
    />
  );
}

function renderCorrectAnswer(type: string, correctAnswer: unknown, options: unknown) {
  if (type === "matching") {
    const pairs = parseMatchingPairs(options);
    return (
      <div className="space-y-1.5">
        {pairs.map((pair) => (
          <div
            key={`${pair.left}-${pair.right}`}
            className="grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
          >
            <MathContent
              text={pair.left}
              className="prose prose-sm max-w-none font-medium text-green-700"
            />
            <span className="text-xs text-green-700">→</span>
            <MathContent
              text={pair.right}
              className="prose prose-sm max-w-none font-medium text-green-700"
            />
          </div>
        ))}
      </div>
    );
  }

  if (type === "multiple_response") {
    const values = parseStringArray(correctAnswer);
    return (
      <div className="space-y-1">
        {values.map((value) => (
          <MathContent
            key={value}
            text={value}
            className="prose prose-sm max-w-none font-medium text-green-700"
          />
        ))}
      </div>
    );
  }

  return (
    <MathContent
      text={String(correctAnswer ?? "")}
      className="prose prose-sm max-w-none font-medium text-green-700"
    />
  );
}

export default async function StudentPracticeResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStudentPracticeResult(id);

  if (!data?.attempt) {
    redirect(`/student/learning/practice/${id}`);
  }

  const percentage =
    data.attempt.max_score && Number(data.attempt.max_score) > 0
      ? Math.round((Number(data.attempt.total_score ?? 0) / Number(data.attempt.max_score)) * 100)
      : 0;
  const answerMap = new Map(data.answers.map((answer) => [answer.practice_question_id, answer]));

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#4078C1]">{data.exam.subject_name}</p>
          <h2 className="text-2xl font-bold tracking-tight">{data.exam.title}</h2>
          <p className="text-sm text-muted-foreground">
            Энэ дүн official average болон teacher/parent report-д нөлөөлөхгүй.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{percentage}%</Badge>
          <Link href="/student/learning">
            <Button variant="outline">Learning Hub</Button>
          </Link>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Practice дүн</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Нийт оноо</p>
            <p className="mt-2 text-2xl font-bold">
              {Number(data.attempt.total_score ?? 0)} / {Number(data.attempt.max_score ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Хувь</p>
            <p className="mt-2 text-2xl font-bold">{percentage}%</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Сэдвүүд</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.isArray(data.exam.selected_topics) &&
                data.exam.selected_topics.map((topic) => (
                  <Badge key={String(topic.topic_key)} variant="outline">
                    {String(topic.topic_label)}
                  </Badge>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {data.questions.map((question, index) => {
          const answer = answerMap.get(question.id);
          return (
            <Card key={question.id} className="rounded-2xl">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base">Асуулт {index + 1}</CardTitle>
                  <div className="flex items-center gap-2">
                    {question.subtopic && <Badge variant="outline">{question.subtopic}</Badge>}
                    <Badge variant={answer?.is_correct ? "secondary" : "outline"}>
                      {answer?.is_correct ? "Зөв" : "Буруу"}
                    </Badge>
                  </div>
                </div>
                <MathContent
                  html={question.content_html}
                  text={question.content}
                  className="prose prose-sm max-w-none text-zinc-900"
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl bg-zinc-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-zinc-900">Таны хариулт</p>
                  {renderAnswerValue(question.type, answer?.answer)}
                </div>
                <div className="rounded-xl bg-green-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-green-800">Зөв хариулт</p>
                  {renderCorrectAnswer(question.type, question.correct_answer, question.options)}
                </div>
                {question.explanation && (
                  <div className="rounded-xl border p-4">
                    <p className="mb-2 text-sm font-semibold text-zinc-900">Тайлбар</p>
                    <MathContent
                      text={question.explanation}
                      className="prose prose-sm max-w-none text-zinc-700"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
