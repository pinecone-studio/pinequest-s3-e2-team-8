"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { saveAnswer, submitExam } from "@/lib/student/actions";

interface QuestionItem {
  id: string;
  type: string;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  points: number;
  order_index: number;
}

interface ExamTakerProps {
  exam: Record<string, unknown>;
  questions: QuestionItem[];
  sessionId: string;
  savedAnswers: Record<string, string>;
}

export default function ExamTaker({
  exam,
  questions,
  sessionId,
  savedAnswers,
}: ExamTakerProps) {
  const router = useRouter();
  // Shuffle-г mount дээр нэг л удаа хийх (useRef ашиглан тогтвортой байлгах)
  const displayQuestionsRef = useRef<QuestionItem[]>(
    exam.shuffle_questions
      ? [...questions].sort(() => Math.random() - 0.5)
      : questions
  );
  const displayQuestions = displayQuestionsRef.current;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(savedAnswers);
  const [timeLeft, setTimeLeft] = useState(
    (exam.duration_minutes as number) * 60
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);

  const currentQuestion = displayQuestions[currentIndex];

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proctoring: Tab switch detection
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        setTabSwitchCount((prev) => {
          const newCount = prev + 1;
          if (newCount >= 5) {
            handleSubmit();
          } else if (newCount >= 3) {
            alert(
              `Анхааруулга: Та ${newCount} удаа цонхноос гарлаа. 5 удаа давбал шалгалт автоматаар дуусна!`
            );
          }
          return newCount;
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Хариулт хадгалах (debounced)
  const handleAnswer = useCallback(
    async (questionId: string, answer: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: answer }));
      await saveAnswer(sessionId, questionId, answer);
    },
    [sessionId]
  );

  // Шалгалт дуусгах
  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const result = await submitExam(sessionId);
    if (result.success) {
      router.push(`/student/exams/${exam.id}/result`);
    } else {
      setIsSubmitting(false);
      alert(result.error || "Алдаа гарлаа");
    }
  };

  // Хугацааг формат хийх
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const answeredCount = Object.keys(answers).filter((id) =>
    displayQuestions.some((q) => q.id === id)
  ).length;
  const isTimeWarning = timeLeft < 300; // 5 минутаас бага

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header: Timer + Progress */}
      <div className="sticky top-0 z-50 border-b bg-background px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{exam.title as string}</h1>
            <p className="text-sm text-muted-foreground">
              {answeredCount}/{displayQuestions.length} хариулсан
            </p>
          </div>
          <div className="flex items-center gap-4">
            {tabSwitchCount > 0 && (
              <Badge variant="destructive">
                Tab: {tabSwitchCount}/5
              </Badge>
            )}
            <div
              className={`rounded-lg px-4 py-2 font-mono text-xl font-bold ${
                isTimeWarning
                  ? "animate-pulse bg-red-100 text-red-700"
                  : "bg-muted"
              }`}
            >
              {formatTime(timeLeft)}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? "Илгээж байна..." : "Дуусгах"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 gap-4 p-4">
        {/* Question Navigator (sidebar) */}
        <div className="hidden w-48 shrink-0 md:block">
          <div className="sticky top-20 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Асуултууд
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {displayQuestions.map((q, i) => {
                const qId = q.id as string;
                const isAnswered = !!answers[qId];
                const isCurrent = i === currentIndex;
                return (
                  <button
                    key={qId}
                    onClick={() => setCurrentIndex(i)}
                    className={`flex h-8 w-8 items-center justify-center rounded text-sm font-medium transition-colors ${
                      isCurrent
                        ? "bg-primary text-primary-foreground"
                        : isAnswered
                          ? "bg-green-100 text-green-800"
                          : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Question Content */}
        <div className="flex-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Асуулт {currentIndex + 1}/{displayQuestions.length}
                </CardTitle>
                <Badge variant="outline">
                  {currentQuestion.points} оноо
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Question text */}
              <div className="text-lg leading-relaxed">
                {currentQuestion.content}
              </div>

              {/* Image */}
              {currentQuestion.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentQuestion.image_url}
                  alt="Асуултын зураг"
                  className="max-h-64 rounded-lg"
                />
              )}

              {/* Answer options */}
              {(currentQuestion.type === "multiple_choice" ||
                currentQuestion.type === "true_false") && (
                <div className="space-y-2">
                  {(currentQuestion.options ?? []).map((option, i) => {
                    const optionValue =
                      typeof option === "string" ? option : String(option);
                    const isSelected =
                      answers[currentQuestion.id] === optionValue;
                    return (
                      <button
                        key={i}
                        onClick={() =>
                          handleAnswer(
                            currentQuestion.id,
                            optionValue
                          )
                        }
                        className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : ""
                          }`}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span>{optionValue}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Essay answer */}
              {currentQuestion.type === "essay" && (
                <textarea
                  className="min-h-[150px] w-full rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Хариултаа бичнэ үү..."
                  value={answers[currentQuestion.id] ?? ""}
                  onChange={(e) =>
                    handleAnswer(
                      currentQuestion.id,
                      e.target.value
                    )
                  }
                />
              )}

              {/* Fill blank */}
              {currentQuestion.type === "fill_blank" && (
                <input
                  type="text"
                  className="w-full rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Хариултаа бичнэ үү..."
                  value={answers[currentQuestion.id] ?? ""}
                  onChange={(e) =>
                    handleAnswer(
                      currentQuestion.id,
                      e.target.value
                    )
                  }
                />
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                  disabled={currentIndex === 0}
                >
                  Өмнөх
                </Button>
                <Button
                  onClick={() =>
                    setCurrentIndex((p) =>
                      Math.min(displayQuestions.length - 1, p + 1)
                    )
                  }
                  disabled={currentIndex === displayQuestions.length - 1}
                >
                  Дараах
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
