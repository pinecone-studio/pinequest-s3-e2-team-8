"use client";

import { useEffect, useState } from "react";
import type { Question, QuestionPassage } from "@/types";
import QuestionList from "./QuestionList";

interface Props {
  questions: Question[];
  examId: string;
  passages: QuestionPassage[];
  isLocked?: boolean;
  syncTargetId: string;
}

export default function QuestionListPanel({
  questions,
  examId,
  passages,
  isLocked = false,
  syncTargetId,
}: Props) {
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  useEffect(() => {
    const target = document.getElementById(syncTargetId);
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    if (!target) return;

    const updateHeight = () => {
      if (!mediaQuery.matches) {
        setPanelHeight(null);
        return;
      }

      setPanelHeight(Math.round(target.getBoundingClientRect().height));
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    resizeObserver.observe(target);
    window.addEventListener("resize", updateHeight);
    mediaQuery.addEventListener("change", updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      mediaQuery.removeEventListener("change", updateHeight);
    };
  }, [syncTargetId]);

  return (
    <div
      className="lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden"
      style={panelHeight ? { height: panelHeight } : undefined}
    >
      <div className="mb-4">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Нэмсэн асуултууд
        </h2>
      </div>

      <QuestionList
        className="min-h-0 flex-1"
        questions={questions}
        examId={examId}
        passages={passages}
        isLocked={isLocked}
      />
    </div>
  );
}
