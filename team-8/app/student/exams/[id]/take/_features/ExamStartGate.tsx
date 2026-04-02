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
  const [startError, setStartError] = useState<string | null>(null);
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

    setStartError(null);
    try {
      const result = await startExamAttempt(examId, payload);
      if ("redirectTo" in result && typeof result.redirectTo === "string") {
        router.push(result.redirectTo);
        return;
      }

      if ("error" in result) {
        setStartError(result.error ?? "Шалгалт эхлүүлэхэд алдаа гарлаа.");
        return;
      }

      if (!("sessionId" in result) || !("startedAt" in result)) {
        setStartError("Шалгалтын session мэдээллийг бэлтгэж чадсангүй.");
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
    <>
      {startError && (
        <div className="fixed inset-x-0 top-4 z-200 flex justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700 shadow-lg">
            {startError}
          </div>
        </div>
      )}
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
    </>
  );
}
