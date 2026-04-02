"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { persistExamStartTelemetry } from "@/lib/student/actions";
import type { AnswerChangeAnalytics } from "@/lib/proctoring";
import {
  getDisplayMode,
  getOrientationMode,
  getPlatformLabel,
  getStudentDeviceType,
  isDesktopLikeDevice,
  isStandaloneDisplayMode,
} from "@/lib/proctoring-client";
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
  runtimeToken: string | null;
  savedAnswers: Record<string, string>;
  answerAnalytics: Record<string, AnswerChangeAnalytics>;
  initialTimeLeftSeconds: number;
}

export default function ExamRunnerClient({
  exam,
  questions,
  sessionId,
  runtimeToken,
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

  // When sessionStorage has been cleared (browser restart, Safari memory eviction,
  // new tab) and the exam does NOT require proctoring checks, synthesize a readiness
  // object from the current runtime instead of defaulting to "desktop" everywhere.
  const synthesizedReadiness = useMemo<ExamRuntimeReadiness>(() => {
    const deviceType = getStudentDeviceType();
    const displayMode = getDisplayMode();
    return {
      isDesktop: isDesktopLikeDevice(),
      deviceType,
      displayMode,
      orientation: getOrientationMode(),
      isStandalonePwa: isStandaloneDisplayMode(),
      platform: getPlatformLabel(),
      fullscreenReady: false,
      cameraReady: false,
      identityVerified: false,
      brightnessScore: null,
      identityHash: null,
    };
  }, []);

  const effectiveRuntimeReadiness =
    runtimeReadiness ??
    storedContext?.runtimeReadiness ??
    (!requiresResumeCheck ? synthesizedReadiness : null);
  const telemetryAlreadyPersisted =
    telemetryPersisted || Boolean(storedContext?.telemetryPersisted);

  useEffect(() => {
    if (!effectiveRuntimeReadiness || telemetryAlreadyPersisted) return;

    let cancelled = false;
    let retryTimer: number | null = null;

    async function persist(attempt: number) {
      const readiness = effectiveRuntimeReadiness;
      if (!readiness) return;

      let result:
        | Awaited<ReturnType<typeof persistExamStartTelemetry>>
        | null = null;

      try {
        result = await persistExamStartTelemetry(
          sessionId,
          readiness,
          runtimeToken,
        );
      } catch (error) {
        console.warn("[ExamRunnerClient] persistExamStartTelemetry failed", error);
      }

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
    runtimeToken,
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
      runtimeToken={runtimeToken}
      savedAnswers={savedAnswers}
      initialAnswerAnalytics={answerAnalytics}
      initialTimeLeftSeconds={initialTimeLeftSeconds}
      runtimeReadiness={effectiveRuntimeReadiness}
    />
  );
}
