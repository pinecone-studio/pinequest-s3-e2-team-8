"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MathContent from "@/components/math/MathContent";
import {
  logProctorEvent,
  saveAnswer,
  submitExam,
} from "@/lib/student/actions";

interface QuestionItem {
  id: string;
  type: string;
  passage_id?: string | null;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  matching_prompts?: string[] | null;
  matching_choices?: string[] | null;
  points: number;
  order_index: number;
  question_passages?: {
    id: string;
    title: string | null;
    content: string;
    content_html: string | null;
    image_url: string | null;
  } | null;
}

interface ExamTakerProps {
  exam: Record<string, unknown>;
  questions: QuestionItem[];
  sessionId: string;
  savedAnswers: Record<string, string>;
  initialTimeLeftSeconds: number;
}

function getShuffleWeight(seed: string, questionId: string) {
  let hash = 2166136261;
  const value = `${seed}:${questionId}`;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getDisplayQuestions(
  questions: QuestionItem[],
  shouldShuffle: boolean,
  seed: string
) {
  if (!shouldShuffle) return questions;

  return [...questions].sort(
    (a, b) =>
      getShuffleWeight(seed, a.id) - getShuffleWeight(seed, b.id)
  );
}

function getDisplayOptions(
  options: string[],
  shouldShuffle: boolean,
  seed: string
) {
  if (!shouldShuffle) return options;

  return [...options].sort(
    (a, b) =>
      getShuffleWeight(seed, a) - getShuffleWeight(seed, b)
  );
}

function parseStoredArray(value: string | undefined) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item))
      : [];
  } catch {
    return [];
  }
}

function parseMatchingOptions(options: string[] | null | undefined) {
  return (options ?? [])
    .map((option) => {
      const [left, right] = String(option).split("|||");
      if (!left || !right) return null;
      return { left, right };
    })
    .filter(
      (item): item is { left: string; right: string } => Boolean(item)
    );
}

function normalizeDraftAnswer(questionType: string, answer: string) {
  if (questionType === "multiple_choice") {
    return answer.trim() ? answer : null;
  }

  if (questionType === "essay" || questionType === "fill_blank") {
    return answer.trim() ? answer : null;
  }

  if (questionType === "multiple_response") {
    const nextAnswers = parseStoredArray(answer).filter((item) => item.trim());
    return nextAnswers.length > 0 ? JSON.stringify(nextAnswers) : null;
  }

  if (questionType === "matching") {
    try {
      const parsed = JSON.parse(answer) as Record<string, string>;
      const filteredEntries = Object.entries(parsed).filter(
        ([, value]) => String(value ?? "").trim() !== ""
      );

      return filteredEntries.length > 0
        ? JSON.stringify(Object.fromEntries(filteredEntries))
        : null;
    } catch {
      return null;
    }
  }

  return answer.trim() ? answer : null;
}

function isQuestionAnswered(question: QuestionItem, answer: string | undefined) {
  return normalizeDraftAnswer(question.type, answer ?? "") !== null;
}

export default function ExamTaker({
  exam,
  questions,
  sessionId,
  savedAnswers,
  initialTimeLeftSeconds,
}: ExamTakerProps) {
  const router = useRouter();
  const draftStorageKey = `exam-session:${sessionId}:drafts`;
  const [displayQuestions] = useState(() =>
    getDisplayQuestions(
      questions,
      Boolean(exam.shuffle_questions),
      sessionId
    )
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return savedAnswers;

    const localAnswers = window.localStorage.getItem(draftStorageKey);
    if (!localAnswers) return savedAnswers;

    try {
      const parsed = JSON.parse(localAnswers) as Record<string, string>;
      return { ...savedAnswers, ...parsed };
    } catch {
      window.localStorage.removeItem(draftStorageKey);
      return savedAnswers;
    }
  });
  const [timeLeft, setTimeLeft] = useState(initialTimeLeftSeconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const saveTimersRef = useRef<Record<string, number>>({});
  const dirtyAnswersRef = useRef<Record<string, string>>({});
  const activeSavePromisesRef = useRef<Record<string, Promise<unknown>>>({});
  const currentQuestionRef = useRef<QuestionItem | null>(
    displayQuestions[0] ?? null
  );
  const currentIndexRef = useRef(0);
  const tabSwitchCountRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const proctorThrottleRef = useRef<Record<string, number>>({});

  const currentQuestion = displayQuestions[currentIndex];
  const currentPassage = currentQuestion.question_passages;
  const currentMultipleAnswers = parseStoredArray(answers[currentQuestion.id]);
  const currentMatchingPrompts =
    currentQuestion.matching_prompts ??
    parseMatchingOptions(currentQuestion.options).map((pair) => pair.left);
  const currentMatchingChoices = getDisplayOptions(
    currentQuestion.matching_choices ??
      parseMatchingOptions(currentQuestion.options).map((pair) => pair.right),
    Boolean(exam.shuffle_options),
    `${sessionId}:${currentQuestion.id}:matching-right`
  );
  const currentMatchingAnswer = (() => {
    try {
      return JSON.parse(answers[currentQuestion.id] ?? "{}") as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const emitProctorEvent = useCallback(
    (
      eventType:
        | "tab_hidden"
        | "window_blur"
        | "copy_attempt"
        | "paste_attempt"
        | "context_menu",
      metadata: Record<string, string | number | boolean | null> = {},
      throttleMs = 0
    ) => {
      if (isSubmittingRef.current) return;

      const now = Date.now();
      const lastLoggedAt = proctorThrottleRef.current[eventType] ?? 0;
      if (throttleMs > 0 && now - lastLoggedAt < throttleMs) return;

      proctorThrottleRef.current[eventType] = now;

      void logProctorEvent(sessionId, eventType, {
        question_id: currentQuestionRef.current?.id ?? null,
        question_number: currentIndexRef.current + 1,
        ...metadata,
      });
    },
    [sessionId]
  );

  const persistAnswer = useCallback(
    (questionId: string, answer: string) => {
      const request = saveAnswer(sessionId, questionId, answer).finally(() => {
        if (dirtyAnswersRef.current[questionId] === answer) {
          delete dirtyAnswersRef.current[questionId];
        }

        if (activeSavePromisesRef.current[questionId] === request) {
          delete activeSavePromisesRef.current[questionId];
        }
      });

      activeSavePromisesRef.current[questionId] = request;
      return request;
    },
    [sessionId]
  );

  const queueSave = useCallback(
    (questionId: string, answer: string, questionType: string) => {
      dirtyAnswersRef.current[questionId] = answer;

      const existingTimer = saveTimersRef.current[questionId];
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const delay =
        questionType === "essay" || questionType === "fill_blank" ? 700 : 0;

      if (delay === 0) {
        delete saveTimersRef.current[questionId];
        void persistAnswer(questionId, answer);
        return;
      }

      saveTimersRef.current[questionId] = window.setTimeout(() => {
        delete saveTimersRef.current[questionId];
        void persistAnswer(questionId, answer);
      }, delay);
    },
    [persistAnswer]
  );

  const flushPendingAnswers = useCallback(async () => {
    const pendingDirtyAnswers = { ...dirtyAnswersRef.current };

    for (const timerId of Object.values(saveTimersRef.current)) {
      clearTimeout(timerId);
    }
    saveTimersRef.current = {};

    const pendingRequests = Object.entries(pendingDirtyAnswers).map(
      ([questionId, answer]) =>
        activeSavePromisesRef.current[questionId] ??
        persistAnswer(questionId, answer)
    );

    await Promise.all([
      ...Object.values(activeSavePromisesRef.current),
      ...pendingRequests,
    ]);
  }, [persistAnswer]);

  // Шалгалт дуусгах
  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    await flushPendingAnswers();
    const result = await submitExam(sessionId);
    if (result.success) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      router.push(`/student/exams/${exam.id as string}/result`);
    } else {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      alert(result.error || "Алдаа гарлаа");
    }
  }, [
    draftStorageKey,
    exam.id,
    flushPendingAnswers,
    router,
    sessionId,
  ]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [handleSubmit]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(draftStorageKey, JSON.stringify(answers));
  }, [answers, draftStorageKey]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(saveTimersRef.current)) {
        clearTimeout(timerId);
      }
    };
  }, []);

  // Proctoring: Tab switch detection
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        const newCount = tabSwitchCountRef.current + 1;
        tabSwitchCountRef.current = newCount;
        setTabSwitchCount(newCount);

        emitProctorEvent(
          "tab_hidden",
          {
            tab_switch_count: newCount,
            visibility_state: document.visibilityState,
          },
          500
        );

        if (newCount >= 5) {
          void handleSubmit();
        } else if (newCount >= 3) {
          alert(
            `Анхааруулга: Та ${newCount} удаа цонхноос гарлаа. 5 удаа давбал шалгалт автоматаар дуусна!`
          );
        }
      }
    };

    const handleWindowBlur = () => {
      if (document.hidden) return;

      emitProctorEvent(
        "window_blur",
        {
          tab_switch_count: tabSwitchCountRef.current,
        },
        2000
      );
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [emitProctorEvent, handleSubmit]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      emitProctorEvent("copy_attempt", {}, 1000);
    };

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault();
      emitProctorEvent("paste_attempt", {}, 1000);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      emitProctorEvent("context_menu", {}, 1000);
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [emitProctorEvent]);

  // Хариулт хадгалах (debounced)
  const handleAnswer = useCallback(
    (questionId: string, answer: string, questionType: string) => {
      const normalizedAnswer = normalizeDraftAnswer(questionType, answer);

      setAnswers((prev) => {
        const next = { ...prev };
        if (normalizedAnswer === null) {
          delete next[questionId];
        } else {
          next[questionId] = normalizedAnswer;
        }
        return next;
      });

      queueSave(questionId, normalizedAnswer ?? "", questionType);
    },
    [queueSave]
  );

  // Хугацааг формат хийх
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const answeredCount = displayQuestions.filter((question) =>
    isQuestionAnswered(question, answers[question.id])
  ).length;
  const isTimeWarning = timeLeft < 300; // 5 минутаас бага

  if (displayQuestions.length === 0 || !currentQuestion) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Асуулт олдсонгүй</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Энэ шалгалтын асуултын багц бүрэн бэлдээгүй байна. Багшдаа мэдэгдээд
              дараа дахин оролдоно уу.
            </p>
            <Button variant="outline" className="w-full" onClick={() => router.push("/student/exams")}>
              Шалгалтын жагсаалт руу буцах
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            <p className="text-xs text-muted-foreground">
              Tab switch, copy/paste, right click үйлдлүүд логлогдоно.
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
              loading={isSubmitting}
              loadingText="Илгээж байна..."
              variant="destructive"
            >
              Дуусгах
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
                const isAnswered = isQuestionAnswered(q, answers[qId]);
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
              {currentPassage && (
                <div className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Shared passage</Badge>
                    {currentPassage.title && (
                      <span className="font-medium">{currentPassage.title}</span>
                    )}
                  </div>
                  <MathContent
                    html={currentPassage.content_html}
                    text={currentPassage.content}
                    className="prose prose-sm max-w-none text-foreground"
                  />
                  {currentPassage.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentPassage.image_url}
                      alt="Passage зураг"
                      className="max-h-72 rounded-lg border"
                    />
                  )}
                </div>
              )}

              {/* Question text */}
              <MathContent
                html={currentQuestion.content_html}
                text={currentQuestion.content}
                className="prose prose-sm max-w-none text-foreground"
              />

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
              {currentQuestion.type === "multiple_choice" && (
                <div className="space-y-2">
                  {getDisplayOptions(
                    currentQuestion.options ?? [],
                    Boolean(exam.shuffle_options),
                    `${sessionId}:${currentQuestion.id}`
                  ).map((option, i) => {
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
                            optionValue,
                            currentQuestion.type
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
                        <MathContent
                          text={optionValue}
                          className="prose prose-sm max-w-none text-foreground"
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQuestion.type === "multiple_response" && (
                <div className="space-y-2">
                  {getDisplayOptions(
                    currentQuestion.options ?? [],
                    Boolean(exam.shuffle_options),
                    `${sessionId}:${currentQuestion.id}`
                  ).map((option, i) => {
                    const optionValue = String(option);
                    const isSelected = currentMultipleAnswers.includes(optionValue);

                    return (
                      <button
                        key={i}
                        onClick={() => {
                          const nextAnswers = isSelected
                            ? currentMultipleAnswers.filter(
                                (item) => item !== optionValue
                              )
                            : [...currentMultipleAnswers, optionValue];

                          handleAnswer(
                            currentQuestion.id,
                            JSON.stringify(nextAnswers),
                            currentQuestion.type
                          );
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border text-sm ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : ""
                          }`}
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <MathContent
                          text={optionValue}
                          className="prose prose-sm max-w-none text-foreground"
                        />
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
                      e.target.value,
                      currentQuestion.type
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
                      e.target.value,
                      currentQuestion.type
                    )
                  }
                />
              )}

              {currentQuestion.type === "matching" && (
                <div className="space-y-3">
                  {currentMatchingPrompts.map((leftPrompt, index) => {
                    return (
                      <div
                        key={`${leftPrompt}-${index}`}
                        className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"
                      >
                        <div className="rounded-lg bg-muted/40 px-3 py-2 font-medium">
                          <MathContent
                            text={leftPrompt}
                            className="prose prose-sm max-w-none text-foreground"
                          />
                        </div>
                        <select
                          className="rounded-lg border bg-background px-3 py-2"
                          value={currentMatchingAnswer[leftPrompt] ?? ""}
                          onChange={(event) => {
                            const nextAnswer = {
                              ...currentMatchingAnswer,
                              [leftPrompt]: event.target.value,
                            };

                            handleAnswer(
                              currentQuestion.id,
                              JSON.stringify(nextAnswer),
                              currentQuestion.type
                            );
                          }}
                        >
                          <option value="">Сонгоно уу</option>
                          {currentMatchingChoices.map((option) => (
                            <option key={`${leftPrompt}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
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
