"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { persistExamStartTelemetry } from "@/lib/student/actions";
import type { AnswerChangeAnalytics } from "@/lib/proctoring";
import ExamTaker from "./ExamTaker";
import PreExamCheck from "./PreExamCheck";
import {
  markStoredExamStartTelemetryPersisted,
  parseStoredExamStartContext,
  readStoredExamStartContextSnapshot,
  subscribeStoredExamStartContext,
  writeStoredExamStartContext,
  type ExamRuntimeReadiness,
} from "./runtime-readiness";

interface ExamRunnerClientProps {
  exam: Record<string, unknown>;
  questions: Parameters<typeof ExamTaker>[0]["questions"];
  sessionId: string;
  savedAnswers: Record<string, string>;
  answerAnalytics: Record<string, AnswerChangeAnalytics>;
  initialTimeLeftSeconds: number;
}

export default function ExamRunnerClient({
  exam,
  questions,
  sessionId,
  savedAnswers,
  answerAnalytics,
  initialTimeLeftSeconds,
}: ExamRunnerClientProps) {
  const examId = String(exam.id ?? "");
  const storedContextRaw = useSyncExternalStore(
    (onStoreChange) => subscribeStoredExamStartContext(examId, onStoreChange),
    () => readStoredExamStartContextSnapshot(examId),
    () => null
  );
  const storedContext = useMemo(
    () => parseStoredExamStartContext(storedContextRaw, sessionId),
    [sessionId, storedContextRaw]
  );
  const [runtimeReadiness, setRuntimeReadiness] = useState<ExamRuntimeReadiness | null>(null);
  const [telemetryPersisted, setTelemetryPersisted] = useState(false);
  const [telemetryAttempt, setTelemetryAttempt] = useState(0);

  const requiresResumeCheck = useMemo(() => {
    return (
      Boolean(exam.require_camera) ||
      Boolean(exam.require_fullscreen) ||
      Boolean(exam.identity_verification) ||
      String(exam.proctoring_mode ?? "off") !== "off"
    );
  }, [
    exam.identity_verification,
    exam.proctoring_mode,
    exam.require_camera,
    exam.require_fullscreen,
  ]);

  const effectiveRuntimeReadiness =
    runtimeReadiness ?? storedContext?.runtimeReadiness ?? null;
  const telemetryAlreadyPersisted =
    telemetryPersisted || Boolean(storedContext?.telemetryPersisted);

  useEffect(() => {
    if (!effectiveRuntimeReadiness || telemetryAlreadyPersisted) return;

    let cancelled = false;
    let retryTimer: number | null = null;

    async function persist(attempt: number) {
      const readiness = effectiveRuntimeReadiness;
      if (!readiness) return;

      const result = await persistExamStartTelemetry(
        sessionId,
        readiness
      );
      if (cancelled) return;

      if (result && !("error" in result)) {
        markStoredExamStartTelemetryPersisted(examId, sessionId);
        setTelemetryPersisted(true);
        return;
      }

      if (attempt === 0) {
        retryTimer = window.setTimeout(() => {
          setTelemetryAttempt(1);
        }, 1500);
      }
    }

    void persist(telemetryAttempt);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    effectiveRuntimeReadiness,
    examId,
    sessionId,
    telemetryAlreadyPersisted,
    telemetryAttempt,
  ]);

  async function handleResumeStart(payload: ExamRuntimeReadiness) {
    writeStoredExamStartContext(examId, {
      sessionId,
      startedAt: new Date().toISOString(),
      runtimeReadiness: payload,
      telemetryPersisted: false,
    });
    setRuntimeReadiness(payload);
    setTelemetryPersisted(false);
    setTelemetryAttempt(0);
  }

  if (!effectiveRuntimeReadiness && requiresResumeCheck) {
    return (
      <PreExamCheck
        examTitle={typeof exam.title === "string" ? exam.title : undefined}
        proctoringMode={
          (exam.proctoring_mode as "off" | "standard" | "strict" | undefined) ??
          "off"
        }
        devicePolicy={
          (exam.device_policy as
            | "any"
            | "mobile_preferred"
            | "desktop_only"
            | undefined) ?? "any"
        }
        requireFullscreen={Boolean(exam.require_fullscreen)}
        requireCamera={Boolean(exam.require_camera)}
        identityVerification={Boolean(exam.identity_verification)}
        resumeMode
        onStart={handleResumeStart}
      />
    );
  }

  return (
    <ExamTaker
      exam={exam}
      questions={questions}
      sessionId={sessionId}
      savedAnswers={savedAnswers}
      initialAnswerAnalytics={answerAnalytics}
      initialTimeLeftSeconds={initialTimeLeftSeconds}
      runtimeReadiness={effectiveRuntimeReadiness}
    />
  );
}
