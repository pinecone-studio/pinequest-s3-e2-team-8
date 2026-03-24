"use client";

import { deleteQuestion } from "@/lib/question/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import type { Question } from "@/types";

const typeLabels: Record<string, string> = {
  multiple_choice: "Сонголтот",
  true_false: "Үнэн/Худал",
  essay: "Нээлттэй",
  fill_blank: "Цоорхой",
};

interface Props {
  questions: Question[];
  examId: string;
}

export default function QuestionList({ questions, examId }: Props) {
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
      {questions.map((q, idx) => (
        <Card key={q.id}>
          <CardContent className="flex items-start gap-4 pt-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
              {idx + 1}
            </span>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium leading-snug">{q.content}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{typeLabels[q.type] ?? q.type}</Badge>
                <Badge variant="outline">{q.points} оноо</Badge>
                {q.correct_answer && (
                  <Badge variant="secondary" className="text-xs">
                    ✓ {q.correct_answer}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(q.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
