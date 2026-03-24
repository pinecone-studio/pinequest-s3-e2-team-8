"use client";

import { Fragment } from "react";
import { deleteQuestion } from "@/lib/question/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import type { Question, QuestionPassage } from "@/types";
import MathContent from "@/components/math/MathContent";
import EditQuestionDialog from "./EditQuestionDialog";

const typeLabels: Record<string, string> = {
  multiple_choice: "Сонголтот",
  true_false: "Үнэн/Худал",
  essay: "Нээлттэй",
  fill_blank: "Цоорхой",
};

interface Props {
  questions: Question[];
  examId: string;
  passages: QuestionPassage[];
  isLocked?: boolean;
}

export default function QuestionList({
  questions,
  examId,
  passages,
  isLocked = false,
}: Props) {
  const renderedPassages = new Set<string>();

  async function handleDelete(questionId: string) {
    await deleteQuestion(questionId, examId);
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        Асуулт байхгүй байна. Доороос асуулт нэмнэ үү.
      </div>
    );
  }

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{questions.length} асуулт</span>
        <span>Нийт оноо: {totalPoints}</span>
      </div>
      {questions.map((q, idx) => {
        const passage = q.question_passages;
        const shouldRenderPassage =
          Boolean(passage?.id) && !renderedPassages.has(String(passage?.id));

        if (passage?.id) {
          renderedPassages.add(passage.id);
        }

        return (
          <Fragment key={q.id}>
            {shouldRenderPassage && passage && (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Shared passage</Badge>
                    {passage.title && (
                      <span className="font-medium">{passage.title}</span>
                    )}
                  </div>
                  <MathContent
                    html={passage.content_html}
                    text={passage.content}
                    className="prose prose-sm max-w-none text-foreground"
                  />
                  {passage.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={passage.image_url}
                      alt="Passage зураг"
                      className="max-h-64 rounded-lg border"
                    />
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="flex items-start gap-4 pt-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <MathContent
                    html={q.content_html}
                    text={q.content}
                    className="prose prose-sm max-w-none text-foreground"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{typeLabels[q.type] ?? q.type}</Badge>
                    <Badge variant="outline">{q.points} оноо</Badge>
                    {q.question_passages && (
                      <Badge variant="secondary" className="text-xs">
                        Passage-д холбогдсон
                      </Badge>
                    )}
                    {q.image_url && (
                      <Badge variant="outline" className="text-xs">
                        Зурагтай
                      </Badge>
                    )}
                    {q.correct_answer && (
                      <Badge variant="secondary" className="text-xs">
                        ✓ {q.correct_answer}
                      </Badge>
                    )}
                  </div>
                </div>
                {!isLocked && (
                  <div className="flex shrink-0 items-center gap-2">
                    <EditQuestionDialog
                      examId={examId}
                      question={q}
                      passages={passages}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(q.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </Fragment>
        );
      })}
    </div>
  );
}
