"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { startExamAttempt } from "@/lib/student/actions";
import PreExamCheck from "./PreExamCheck";
import {
  writeStoredExamStartContext,
  type ExamRuntimeReadiness,
} from "./runtime-readiness";

interface ExamStartGateProps {
  exam: Record<string, unknown>;
}

export default function ExamStartGate({ exam }: ExamStartGateProps) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const examId = String(exam.id ?? "");
  const proctoringMode = useMemo(
    () =>
      (exam.proctoring_mode as "off" | "standard" | "strict" | undefined) ??
      "off",
    [exam.proctoring_mode]
  );

  async function handleStart(payload: ExamRuntimeReadiness) {
    if (starting) return;
    setStarting(true);

    try {
      const result = await startExamAttempt(examId, payload);
      if ("redirectTo" in result && typeof result.redirectTo === "string") {
        router.push(result.redirectTo);
        return;
      }

      if ("error" in result) {
        alert(result.error);
        return;
      }

      if (!("sessionId" in result) || !("startedAt" in result)) {
        alert("Шалгалтын session мэдээллийг бэлтгэж чадсангүй.");
        return;
      }

      writeStoredExamStartContext(examId, {
        sessionId: result.sessionId,
        startedAt: result.startedAt,
        runtimeReadiness: payload,
        telemetryPersisted: false,
      });

      const query = new URLSearchParams({
        session: result.sessionId,
        fresh: "1",
        startedAt: result.startedAt,
      });

      router.push(`/student/exams/${examId}/take/run?${query.toString()}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <PreExamCheck
      examTitle={typeof exam.title === "string" ? exam.title : undefined}
      proctoringMode={proctoringMode}
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
      resumeMode={false}
      onStart={handleStart}
    />
  );
}
