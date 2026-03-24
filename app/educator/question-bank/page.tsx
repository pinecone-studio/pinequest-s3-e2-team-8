import { getQuestionBank } from "@/lib/question/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const typeLabels: Record<string, string> = {
  multiple_choice: "Сонголтот",
  true_false: "Үнэн/Худал",
  essay: "Нээлттэй",
  fill_blank: "Цоорхой",
};

export default async function QuestionBankPage() {
  const questions = await getQuestionBank();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Асуултын сан</h2>
        <p className="text-muted-foreground">
          Таны үүсгэсэн бүх асуултууд · Нийт {questions.length}
        </p>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          Асуулт байхгүй байна. Шалгалт үүсгэж асуулт нэмнэ үү.
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <Card key={q.id}>
              <CardContent className="flex items-start gap-4 pt-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium leading-snug">{q.content}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{typeLabels[q.type] ?? q.type}</Badge>
                    <Badge variant="outline">{q.points} оноо</Badge>
                    {q.difficulty && (
                      <Badge variant="secondary">{q.difficulty}</Badge>
                    )}
                    {(q as { exams?: { title: string } }).exams?.title && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {(q as { exams?: { title: string } }).exams!.title}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
