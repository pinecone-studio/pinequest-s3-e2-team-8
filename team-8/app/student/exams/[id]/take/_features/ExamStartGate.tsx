"use client";

import { useState } from "react";
import PreExamCheck from "./PreExamCheck";
import ExamTaker from "./ExamTaker";

interface ExamStartGateProps {
  exam: Record<string, unknown>;
  questions: Parameters<typeof ExamTaker>[0]["questions"];
  sessionId: string;
  savedAnswers: Record<string, string>;
  initialTimeLeftSeconds: number;
}

/**
 * Shows the Pre-Exam System Check screen first.
 * Once the student passes checks and clicks "Start Exam", ExamTaker is mounted.
 */
export default function ExamStartGate(props: ExamStartGateProps) {
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <PreExamCheck
        examTitle={typeof props.exam.title === "string" ? props.exam.title : undefined}
        onStart={() => setStarted(true)}
      />
    );
  }

  return <ExamTaker {...props} />;
}
