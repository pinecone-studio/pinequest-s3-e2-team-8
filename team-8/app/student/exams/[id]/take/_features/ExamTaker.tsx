"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MathContent from "@/components/math/MathContent";
import {
  logProctorEvent,
  saveAnswersBatch,
  submitExam,
} from "@/lib/student/actions";
import { useCameraMonitor } from "@/hooks/useCameraMonitor";
import { useGazeMonitor } from "@/hooks/useGazeMonitor";

// ---------------------------------------------------------------------------
// SEB (Safe Exam Browser) detection
// ---------------------------------------------------------------------------
// Set to true when you want to enforce SEB for all exams.
// In Phase 2, replace this with a per-exam flag from the exams table.
const REQUIRE_SEB = false;

function isSEBBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("SEB");
}

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
      true,
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
  const answersRef = useRef<Record<string, string>>(answers);
  const [timeLeft, setTimeLeft] = useState(initialTimeLeftSeconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const lastCheckpointRef = useRef<Record<string, string>>(savedAnswers);
  const isCheckpointingRef = useRef(false);
  const currentQuestionRef = useRef<QuestionItem | null>(
    displayQuestions[0] ?? null
  );
  const currentIndexRef = useRef(0);
  const tabSwitchCountRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const proctorThrottleRef = useRef<Record<string, number>>({});

  // SEB detection (evaluated once per render; navigator.userAgent never changes).
  const sebDetected = isSEBBrowser();
  // Camera is only started when SEB is not required, or when SEB is detected.
  const { cameraStatus, videoRef } = useCameraMonitor({
    sessionId,
    enabled: !REQUIRE_SEB || sebDetected,
  });

  // Gaze warning count — only stored in state for badge display.
  // The ref inside useGazeMonitor is the authoritative counter.
  const [gazeWarningCount, setGazeWarningCount] = useState(0);

  useGazeMonitor({
    sessionId,
    videoRef,
    enabled: cameraStatus === "granted",
    onWarning: (total) => {
      setGazeWarningCount(total);
    },
    onMaxWarnings: () => {
      void handleSubmit();
    },
  });

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
    answersRef.current = answers;
  }, [answers]);

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

  const checkpointDirtyAnswers = useCallback(async () => {
    if (isCheckpointingRef.current || isSubmittingRef.current) return;

    const currentAnswers = answersRef.current;
    const lastCheckpoint = lastCheckpointRef.current;

    const dirty: Record<string, string> = {};
    for (const [qId, answer] of Object.entries(currentAnswers)) {
      if (lastCheckpoint[qId] !== answer) {
        dirty[qId] = answer;
      }
    }
    for (const qId of Object.keys(lastCheckpoint)) {
      if (!(qId in currentAnswers)) {
        dirty[qId] = "";
      }
    }

    if (Object.keys(dirty).length === 0) return;

    isCheckpointingRef.current = true;
    try {
      const result = await saveAnswersBatch(sessionId, dirty);
      // Алдаа буцаасан бол lastCheckpoint шинэчлэхгүй — дараагийн checkpoint дахин оролдоно
      if (!result || "error" in result) return;
      lastCheckpointRef.current = { ...currentAnswers };
    } finally {
      isCheckpointingRef.current = false;
    }
  }, [sessionId]);

  const flushPendingAnswers = useCallback(async () => {
    while (isCheckpointingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await checkpointDirtyAnswers();
  }, [checkpointDirtyAnswers]);

  // Шалгалт дуусгах
  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    await flushPendingAnswers();
    const result = await submitExam(sessionId, { ...answersRef.current });
    if ("success" in result && result.success) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      router.push(`/student/exams/${exam.id as string}/result`);
    } else {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      alert(("error" in result && result.error) || "Алдаа гарлаа");
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

  // Batched checkpoint: flush dirty answers every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void checkpointDirtyAnswers();
    }, 5000);
    return () => clearInterval(interval);
  }, [checkpointDirtyAnswers]);

  // Checkpoint on question navigation
  useEffect(() => {
    void checkpointDirtyAnswers();
  }, [currentIndex, checkpointDirtyAnswers]);

  // Checkpoint on page hide / beforeunload
  useEffect(() => {
    const handlePageHide = () => {
      void checkpointDirtyAnswers();
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [checkpointDirtyAnswers]);

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

        if (newCount >= 10) {
          void handleSubmit();
        } else if (newCount >= 5) {
          alert(
            `Анхааруулга: Та ${newCount} удаа цонхноос гарлаа. 10 удаа давбал шалгалт автоматаар дуусна!`
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
      // Essay болон fill_blank асуултад paste зөвшөөрнө (логлоно)
      const currentType = currentQuestionRef.current?.type;
      if (currentType === "essay" || currentType === "fill_blank") {
        emitProctorEvent("paste_attempt", {}, 1000);
        return;
      }
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

  // Хариулт хадгалах (localStorage-д шууд, Redis-д batch checkpoint-ээр)
  const handleAnswer = useCallback(
    (questionId: string, answer: string, questionType: string) => {
      const normalizedAnswer = normalizeDraftAnswer(questionType, answer);
      const nextAnswers = { ...answersRef.current };
      if (normalizedAnswer === null) {
        delete nextAnswers[questionId];
      } else {
        nextAnswers[questionId] = normalizedAnswer;
      }

      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
    },
    []
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

  if (REQUIRE_SEB && !sebDetected) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Safe Exam Browser шаардлагатай</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Энэ шалгалтыг зөвхөн Safe Exam Browser (SEB) ашиглан нээх
              боломжтой. Та SEB татаж аваад дахин нээнэ үү.
            </p>
            <p className="text-xs text-muted-foreground">
              safeexambrowser.org
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
      {/* Submit confirmation dialog */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Шалгалт дуусгах уу?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {answeredCount}/{displayQuestions.length} асуултад хариулсан байна.
              {answeredCount < displayQuestions.length && (
                <span className="font-medium text-destructive">
                  {" "}{displayQuestions.length - answeredCount} асуулт хариулаагүй байна!
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Дуусгасны дараа засах боломжгүй.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSubmitConfirm(false)}
              >
                Буцах
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  void handleSubmit();
                }}
              >
                Дуусгах
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header: Timer + Progress */}
      <div className="sticky top-0 z-50 border-b bg-background/95 px-3 py-2 backdrop-blur">
        {gazeWarningCount > 0 && (
          <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-center text-sm font-medium text-red-700">
            {gazeWarningCount < 3
              ? `Анхааруулга ${gazeWarningCount}/3: Та камерын өмнө шулуун харна уу. ${3 - gazeWarningCount} анхааруулга үлдсэн.`
              : "Анхааруулга 3/3: Шалгалт дуусгагдаж байна..."}
          </div>
        )}
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="line-clamp-1 text-base font-semibold sm:text-lg">
              {exam.title as string}
            </h1>
            <p className="text-sm text-muted-foreground">
              {answeredCount}/{displayQuestions.length} хариулсан
            </p>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            {cameraStatus === "denied" && (
              <Badge variant="destructive">Камер хаалттай</Badge>
            )}
            {gazeWarningCount > 0 && (
              <Badge variant="destructive">
                Анхааруулга {gazeWarningCount}/3
              </Badge>
            )}
            {tabSwitchCount > 0 && (
              <Badge variant="destructive">
                Tab {tabSwitchCount}/5
              </Badge>
            )}
            <div
              className={`rounded-lg px-3 py-2 font-mono text-lg font-bold sm:text-xl ${
                isTimeWarning
                  ? "animate-pulse bg-red-100 text-red-700"
                  : "bg-muted"
              }`}
            >
              {formatTime(timeLeft)}
            </div>
            <Button
              onClick={() => setShowSubmitConfirm(true)}
              loading={isSubmitting}
              loadingText="Илгээж байна..."
              variant="destructive"
              className="shrink-0"
            >
              Дуусгах
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 gap-4 p-3 sm:p-4">
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
          <Card className="rounded-2xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Асуулт {currentIndex + 1}/{displayQuestions.length}
                </CardTitle>
                <Badge variant="outline">
                  {currentQuestion.points} оноо
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {currentPassage && (
                <div className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Нийтлэг өгөгдөл</Badge>
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
                      alt="Нийтлэг өгөгдлийн зураг"
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
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
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
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
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
                  className="min-h-[140px] w-full rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-primary"
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
              <div className="flex gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                  disabled={currentIndex === 0}
                  className="flex-1"
                >
                  Өмнөх
                </Button>
                {currentIndex < displayQuestions.length - 1 && (
                  <Button
                    onClick={() =>
                      setCurrentIndex((p) =>
                        Math.min(displayQuestions.length - 1, p + 1)
                      )
                    }
                    className="flex-1"
                  >
                    Дараах
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Camera preview — always in DOM so videoRef is attached before stream resolves.
          Hidden when camera is not yet granted. PiP-style fixed box bottom-right. */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`fixed top-16 right-4 z-50 h-28 w-36 rounded-xl border-2 bg-black object-cover shadow-lg transition-opacity ${
          cameraStatus === "granted" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    </div>
  );
}
