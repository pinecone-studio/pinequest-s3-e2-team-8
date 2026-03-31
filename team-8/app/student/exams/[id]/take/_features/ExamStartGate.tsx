"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnswerChangeAnalytics } from "@/lib/proctoring";
import { startExamAttempt } from "@/lib/student/actions";
import PreExamCheck from "./PreExamCheck";
import ExamTaker from "./ExamTaker";

interface ExamStartGateProps {
  exam: Record<string, unknown>;
  questions: Parameters<typeof ExamTaker>[0]["questions"];
  sessionId: string | null;
  savedAnswers: Record<string, string>;
  answerAnalytics: Record<string, AnswerChangeAnalytics>;
  initialTimeLeftSeconds: number | null;
  sessionAlreadyStarted: boolean;
}

type RuntimeReadiness = {
  isDesktop: boolean;
  deviceType: "desktop" | "mobile";
  displayMode: "browser" | "standalone" | "fullscreen" | "unknown";
  orientation: "portrait" | "landscape";
  isStandalonePwa: boolean;
  platform: string;
  fullscreenReady: boolean;
  cameraReady: boolean;
  identityVerified: boolean;
  brightnessScore: number | null;
  identityHash: string | null;
};

export default function ExamStartGate(props: ExamStartGateProps) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [launchState, setLaunchState] = useState({
    sessionId: props.sessionId,
    savedAnswers: props.savedAnswers,
    answerAnalytics: props.answerAnalytics,
    initialTimeLeftSeconds: props.initialTimeLeftSeconds,
    runtimeReadiness: null as RuntimeReadiness | null,
  });

  const effectiveTimeLeft = launchState.initialTimeLeftSeconds ?? 0;
  const examId = String(props.exam.id ?? "");
  const resumeMode = Boolean(props.sessionAlreadyStarted && props.sessionId);
  const proctoringMode = useMemo(
    () =>
      (props.exam.proctoring_mode as "off" | "standard" | "strict" | undefined) ??
      "off",
    [props.exam.proctoring_mode]
  );

  async function handleStart(payload: RuntimeReadiness) {
    if (launchState.sessionId) {
      setLaunchState((current) => ({
        ...current,
        runtimeReadiness: payload,
      }));
      setStarted(true);
      return;
    }

    const result = await startExamAttempt(examId, payload);
    if ("redirectTo" in result && typeof result.redirectTo === "string") {
      router.push(result.redirectTo);
      return;
    }

    if ("error" in result) {
      alert(result.error);
      return;
    }

    if (!("sessionId" in result)) {
      alert("Шалгалтын session мэдээллийг бэлтгэж чадсангүй.");
      return;
    }

    setLaunchState({
      sessionId: result.sessionId,
      savedAnswers: result.savedAnswers,
      answerAnalytics: result.answerAnalytics,
      initialTimeLeftSeconds: result.initialTimeLeftSeconds,
      runtimeReadiness: payload,
    });
    setStarted(true);
  }

  if (!started) {
    return (
      <PreExamCheck
        examTitle={typeof props.exam.title === "string" ? props.exam.title : undefined}
        proctoringMode={proctoringMode}
        devicePolicy={
          (props.exam.device_policy as
            | "any"
            | "mobile_preferred"
            | "desktop_only"
            | undefined) ?? "any"
        }
        requireFullscreen={Boolean(props.exam.require_fullscreen)}
        requireCamera={Boolean(props.exam.require_camera)}
        identityVerification={Boolean(props.exam.identity_verification)}
        resumeMode={resumeMode}
        onStart={handleStart}
      />
    );
  }

  if (!launchState.sessionId) {
    return null;
  }

  return (
    <ExamTaker
      exam={props.exam}
      questions={props.questions}
      sessionId={launchState.sessionId}
      savedAnswers={launchState.savedAnswers}
      initialAnswerAnalytics={launchState.answerAnalytics}
      initialTimeLeftSeconds={effectiveTimeLeft}
      runtimeReadiness={launchState.runtimeReadiness}
    />
  );
}
