"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Calculator, PanelRightClose, PanelRightOpen, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MathContent from "@/components/math/MathContent";
import MathReferencePanel from "@/components/math/MathReferencePanel";
import {
  logProctorEvent,
  recordExamHeartbeat,
  saveAnswersBatch,
  submitExam,
  getIdentityEnrollment,
} from "@/lib/student/actions";
import {
  captureVideoSnapshot,
  computeBrightnessScore,
  computeVideoFingerprint,
  getDisplayMode,
  getHashDistance,
  getOrientationMode,
} from "@/lib/proctoring-client";
import {
  deriveRiskLevel,
  getProctorEventPolicy,
  isMobileCompatibleProctoredExam,
  shouldAutoFlag,
  shouldTriggerChallenge,
  type AnswerChangeAnalytics,
  type ProctorDisplayMode,
  type ProctorEventType,
  type StudentDeviceType,
} from "@/lib/proctoring";
import { useCameraMonitor } from "@/hooks/useCameraMonitor";
import { useGazeMonitor } from "@/hooks/useGazeMonitor";
import { cn } from "@/lib/utils";
import type { ExamRuntimeReadiness } from "./runtime-readiness";

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
  runtimeToken: string | null;
  savedAnswers: Record<string, string>;
  initialAnswerAnalytics: Record<string, AnswerChangeAnalytics>;
  initialTimeLeftSeconds: number;
  runtimeReadiness: ExamRuntimeReadiness | null;
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

function buildDirtyAnswerDelta(
  currentAnswers: Record<string, string>,
  lastCheckpoint: Record<string, string>,
  currentAnalytics: Record<string, AnswerChangeAnalytics>
) {
  const answers: Record<string, string> = {};
  const answerAnalytics: Record<string, AnswerChangeAnalytics> = {};

  for (const [questionId, answer] of Object.entries(currentAnswers)) {
    if (lastCheckpoint[questionId] !== answer) {
      answers[questionId] = answer;
      answerAnalytics[questionId] = currentAnalytics[questionId] ?? {
        firstAnsweredAt: null,
        lastChangedAt: null,
        changeCount: 0,
      };
    }
  }

  for (const questionId of Object.keys(lastCheckpoint)) {
    if (!(questionId in currentAnswers)) {
      answers[questionId] = "";
      if (currentAnalytics[questionId]) {
        answerAnalytics[questionId] = currentAnalytics[questionId];
      }
    }
  }

  return { answers, answerAnalytics };
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

function DividerLine() {
  return <div className="h-[52px] w-px bg-black/20" />;
}

function AlarmIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 text-[#7F32F5]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3.5l2.5 1.5" />
      <path d="M5 4 3 6" />
      <path d="m19 4 2 2" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[26px] text-[#6B6B6B]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? (
        <path d="m15 18-6-6 6-6" />
      ) : (
        <path d="m9 18 6-6-6-6" />
      )}
    </svg>
  );
}

function getRiskLabel(level: ReturnType<typeof deriveRiskLevel>) {
  switch (level) {
    case "critical":
      return "Эрсдэл маш өндөр";
    case "high":
      return "Эрсдэл өндөр";
    case "medium":
      return "Эрсдэл дунд";
    default:
      return "Эрсдэл бага";
  }
}

function hasMathSignal(value: string | null | undefined) {
  if (!value) return false;

  return /(\$\$?|\\\(|\\\[|\\frac|\\sqrt|\\pi|\\sin|\\cos|\\tan|\\log|\\int|\\sum|\\prod|\^|_|√|π|≤|≥|≠|∠|△|матем|геометр|алгебр|тригонометр)/iu.test(
    value
  );
}

function ToolTile({
  icon,
  label,
  active = false,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-[108px] flex-col items-center gap-2 rounded-[20px] px-4 py-3 text-center shadow-[0_4px_10px_rgba(0,0,0,0.1)] transition-all",
        active
          ? "border border-[#DCC7FF] bg-[#FAF7FF] text-[#7F32F5]"
          : "bg-white/80 text-black",
        disabled ? "cursor-not-allowed opacity-50" : "hover:-translate-y-0.5"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          active ? "bg-[#EEE1FE]" : "bg-[#F3F3F3]"
        )}
      >
        {icon}
      </span>
      <span className="text-sm leading-[120%]">{label}</span>
    </button>
  );
}

export default function ExamTaker({
  exam,
  questions,
  sessionId,
  runtimeToken,
  savedAnswers,
  initialAnswerAnalytics,
  initialTimeLeftSeconds,
  runtimeReadiness,
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
  const answerAnalyticsRef = useRef<Record<string, AnswerChangeAnalytics>>(
    initialAnswerAnalytics
  );
  const [timeLeft, setTimeLeft] = useState(initialTimeLeftSeconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const lastCheckpointRef = useRef<Record<string, string>>(savedAnswers);
  const isCheckpointingRef = useRef(false);
  const riskScoreRef = useRef(0);
  const currentQuestionRef = useRef<QuestionItem | null>(
    displayQuestions[0] ?? null
  );
  const currentIndexRef = useRef(0);
  const tabSwitchCountRef = useRef(0);
  const lastOrientationLoggedRef = useRef<"portrait" | "landscape">(
    runtimeReadiness?.orientation ?? "portrait"
  );
  const isSubmittingRef = useRef(false);
  const handleSubmitRef = useRef<() => void>(() => {});
  const proctorThrottleRef = useRef<Record<string, number>>({});
  const [riskScore, setRiskScore] = useState(0);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeAttempts, setChallengeAttempts] = useState(0);
  const [challengeSecondsLeft, setChallengeSecondsLeft] = useState(30);
  const [challengeDirection, setChallengeDirection] = useState<"left" | "right">(
    "left"
  );
  const [challengeMessage, setChallengeMessage] = useState(
    "Fullscreen руу буцаад, дараа нь толгойгоо шаардсан зүг рүү эргүүлнэ үү."
  );
  const [faceDirection, setFaceDirection] = useState<
    "center" | "left" | "right" | "missing" | "multi_face"
  >("center");
  const [multiFaceCount, setMultiFaceCount] = useState(0);
  const [fullscreenActive, setFullscreenActive] = useState(true);
  const [questionSheetOpen, setQuestionSheetOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [spotCheckOpen, setSpotCheckOpen] = useState(false);
  const [spotCheckSecondsLeft, setSpotCheckSecondsLeft] = useState(20);
  const [spotCheckMessage, setSpotCheckMessage] = useState(
    "Камераа нээгээд нүүрээ төвд барьж, богино spot-check хийнэ үү."
  );
  const [spotCheckBusy, setSpotCheckBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    runtimeReadiness?.orientation ?? "portrait"
  );
  const [displayMode, setDisplayMode] = useState<ProctorDisplayMode>(
    runtimeReadiness?.displayMode ?? "unknown"
  );
  const [identityReferenceHash, setIdentityReferenceHash] = useState<string | null>(null);
  const deviceType: StudentDeviceType = runtimeReadiness?.deviceType ?? "desktop";
  const platform = runtimeReadiness?.platform ?? "unknown";
  const isStandalonePwa =
    displayMode === "standalone" || displayMode === "fullscreen";
  const isMobileSession = deviceType === "mobile";
  const isStrictMode = String(exam.proctoring_mode ?? "off") === "strict";
  const isMobileStandard = Boolean(
    isMobileSession &&
      isMobileCompatibleProctoredExam({
        proctoring_mode:
          (exam.proctoring_mode as "off" | "standard" | "strict" | undefined) ??
          "off",
        device_policy:
          (exam.device_policy as "any" | "mobile_preferred" | "desktop_only" | undefined) ??
          "any",
      })
  );
  const requireCamera = Boolean(exam.require_camera);
  const requireFullscreen = Boolean(exam.require_fullscreen);
  const shouldEnforceFullscreen = requireFullscreen && (!isMobileStandard || isStandalonePwa);
  const shouldUseSpotChecks = requireCamera && isMobileStandard;
  const shouldRunContinuousCamera = requireCamera && (!isMobileStandard || spotCheckOpen);
  const heartbeatIntervalMs =
    exam.proctoring_mode === "strict"
      ? 12000
      : exam.proctoring_mode === "standard"
        ? 20000
        : null;
  const sebDetected = isSEBBrowser();

  const { cameraStatus, videoRef } = useCameraMonitor({
    sessionId,
    enabled: shouldRunContinuousCamera && (!REQUIRE_SEB || sebDetected),
    preferFrontCamera: true,
  });
  const shouldPinCameraPreview =
    cameraStatus === "granted" && (!isMobileStandard || spotCheckOpen);

  // Gaze warning count — only stored in state for badge display.
  // The ref inside useGazeMonitor is the authoritative counter.
  const [gazeWarningCount, setGazeWarningCount] = useState(0);

  const handleGazeWarning = useCallback((total: number) => {
    setGazeWarningCount((current) => (current === total ? current : total));
  }, []);

  const handleGazeStateChange = useCallback(
    (
      state: "center" | "left" | "right" | "missing" | "multi_face",
      faceCount: number
    ) => {
      setFaceDirection((current) => (current === state ? current : state));
      setMultiFaceCount((current) => (current === faceCount ? current : faceCount));
    },
    []
  );

  useGazeMonitor({
    sessionId,
    videoRef,
    enabled:
      !isSubmitting &&
      requireCamera &&
      cameraStatus === "granted" &&
      (!isMobileStandard || spotCheckOpen),
    onWarning: handleGazeWarning,
    onMaxWarnings: () => {
      handleSubmitRef.current();
    },
    onStateChange: handleGazeStateChange,
  });

  const currentQuestion = displayQuestions[currentIndex] ?? null;
  const showMathReference = useMemo(() => {
    const examText = `${String(exam.title ?? "")} ${String(exam.description ?? "")}`;
    if (hasMathSignal(examText)) return true;

    return displayQuestions.some((question) => {
      if (
        hasMathSignal(question.content) ||
        hasMathSignal(question.content_html) ||
        hasMathSignal(question.question_passages?.content) ||
        hasMathSignal(question.question_passages?.content_html)
      ) {
        return true;
      }

      return (question.options ?? []).some((option) => hasMathSignal(String(option)));
    });
  }, [displayQuestions, exam.description, exam.title]);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (!Boolean(exam.identity_verification)) return;

    void getIdentityEnrollment().then((enrollment) => {
      setIdentityReferenceHash(enrollment?.referenceHash ?? null);
    });
  }, [exam.identity_verification]);

  useEffect(() => {
    const updateRuntimeView = () => {
      setOrientation(getOrientationMode());
      setDisplayMode(getDisplayMode());
    };

    updateRuntimeView();
    window.addEventListener("orientationchange", updateRuntimeView);
    window.addEventListener("resize", updateRuntimeView);
    document.addEventListener("fullscreenchange", updateRuntimeView);
    return () => {
      window.removeEventListener("orientationchange", updateRuntimeView);
      window.removeEventListener("resize", updateRuntimeView);
      document.removeEventListener("fullscreenchange", updateRuntimeView);
    };
  }, []);

  const captureSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    try {
      return captureVideoSnapshot(video);
    } catch {
      return null;
    }
  }, [videoRef]);

  const queueSpotCheck = useCallback(
    (reason: string, nextRiskScore = riskScoreRef.current) => {
      if (!shouldUseSpotChecks || spotCheckOpen || isSubmittingRef.current) {
        return;
      }

      setSpotCheckSecondsLeft(20);
      setSpotCheckMessage(
        reason === "scheduled"
          ? "Тогтмол spot-check эхэллээ. Камераа нээгээд нүүрээ төвд барина уу."
          : "Эрсдэл өссөн тул camera spot-check эхэллээ. Нүүрээ төвд бариад шалгана уу."
      );
      setSpotCheckOpen(true);
      void logProctorEvent(sessionId, "spot_check_required", {
        triggered_by: reason,
        risk_score: nextRiskScore,
        question_id: currentQuestionRef.current?.id ?? null,
        question_number: currentIndexRef.current + 1,
        device_type: deviceType,
        display_mode: displayMode,
        proctoring_mode: String(exam.proctoring_mode ?? "off"),
        platform,
        orientation,
      }, {
        runtimeToken,
      }).catch((error) => {
        console.warn("[ExamTaker] logProctorEvent failed", error);
      });
    },
    [
      deviceType,
      displayMode,
      exam.proctoring_mode,
      orientation,
      platform,
      runtimeToken,
      sessionId,
      shouldUseSpotChecks,
      spotCheckOpen,
    ]
  );

  const maybeOpenChallenge = useCallback(
    (nextRiskScore: number, triggeringEvent: ProctorEventType) => {
      if (isSubmittingRef.current) {
        return;
      }

      if (shouldUseSpotChecks) {
        if (shouldTriggerChallenge(nextRiskScore)) {
          queueSpotCheck(`risk:${triggeringEvent}`, nextRiskScore);
        }
        return;
      }

      if (challengeOpen) {
        return;
      }

      if (shouldTriggerChallenge(nextRiskScore)) {
        const nextDirection = Math.random() > 0.5 ? "left" : "right";
        setChallengeDirection(nextDirection);
        setChallengeSecondsLeft(30);
        setChallengeOpen(true);
        setChallengeMessage(
          `Анхааруулга: integrity check идэвхжлээ. Fullscreen рүү буцаад толгойгоо ${nextDirection === "left" ? "зүүн" : "баруун"} тийш эргүүлнэ үү.`
        );
        void logProctorEvent(sessionId, "challenge_required", {
          triggered_by: triggeringEvent,
          risk_score: nextRiskScore,
          question_id: currentQuestionRef.current?.id ?? null,
          question_number: currentIndexRef.current + 1,
        }, {
          runtimeToken,
        }).catch((error) => {
          console.warn("[ExamTaker] logProctorEvent failed", error);
        });
      }

      if (shouldAutoFlag(nextRiskScore) && isStrictMode) {
        handleSubmitRef.current();
      }
    },
    [
      challengeOpen,
      isStrictMode,
      queueSpotCheck,
      runtimeToken,
      sessionId,
      shouldUseSpotChecks,
    ]
  );

  const emitProctorEvent = useCallback(
    (
      eventType: ProctorEventType,
      metadata: Record<string, string | number | boolean | null> = {},
      throttleMs = 0
    ) => {
      if (isSubmittingRef.current) return;

      const now = Date.now();
      const lastLoggedAt = proctorThrottleRef.current[eventType] ?? 0;
      if (throttleMs > 0 && now - lastLoggedAt < throttleMs) return;

      proctorThrottleRef.current[eventType] = now;

      const eventPolicy = getProctorEventPolicy(eventType, {
        deviceType,
        displayMode,
        proctoringMode:
          (exam.proctoring_mode as "off" | "standard" | "strict" | undefined) ??
          "off",
      });
      const nextRiskScore = riskScoreRef.current + eventPolicy.riskDelta;
      riskScoreRef.current = nextRiskScore;
      setRiskScore(nextRiskScore);
      const nextRiskLevel = deriveRiskLevel(nextRiskScore);
      const shouldAttachSnapshot =
        (eventPolicy.severity === "high" || eventPolicy.severity === "critical") &&
        String(exam.evidence_mode ?? "metadata_only") === "metadata_snapshots";
      const snapshot = shouldAttachSnapshot ? captureSnapshot() : null;

      void logProctorEvent(sessionId, eventType, {
        question_id: currentQuestionRef.current?.id ?? null,
        question_number: currentIndexRef.current + 1,
        risk_score: nextRiskScore,
        risk_level: nextRiskLevel,
        derived_risk_delta: eventPolicy.riskDelta,
        snapshot_url: snapshot,
        device_type: deviceType,
        display_mode: displayMode,
        proctoring_mode: String(exam.proctoring_mode ?? "off"),
        platform,
        orientation,
        ...metadata,
      }, {
        runtimeToken,
      }).catch((error) => {
        console.warn("[ExamTaker] logProctorEvent failed", error);
      });

      if (
        eventType !== "spot_check_required" &&
        eventType !== "spot_check_passed" &&
        eventType !== "spot_check_failed"
      ) {
        maybeOpenChallenge(nextRiskScore, eventType);
      }
    },
    [
      captureSnapshot,
      deviceType,
      displayMode,
      exam.evidence_mode,
      exam.proctoring_mode,
      maybeOpenChallenge,
      orientation,
      platform,
      runtimeToken,
      sessionId,
    ]
  );

  const runSpotCheck = useCallback(async () => {
    const video = videoRef.current;
    if (!video || cameraStatus !== "granted") {
      setSpotCheckOpen(false);
      emitProctorEvent("spot_check_failed", { reason: "camera_unavailable" });
      return;
    }

    setSpotCheckBusy(true);
    try {
      const brightnessScore = computeBrightnessScore(video);
      const liveHash = computeVideoFingerprint(video);
      const identityDistance =
        Boolean(exam.identity_verification) && identityReferenceHash
          ? getHashDistance(identityReferenceHash, liveHash)
          : null;
      const identityOk =
        !Boolean(exam.identity_verification) ||
        (identityDistance !== null && Number.isFinite(identityDistance) && identityDistance <= 56);
      const faceOk = faceDirection !== "missing" && faceDirection !== "multi_face";
      const brightnessOk = brightnessScore >= 28;

      if (identityOk && faceOk && brightnessOk) {
        setSpotCheckOpen(false);
        emitProctorEvent("spot_check_passed", {
          brightness_score: brightnessScore,
          identity_distance: identityDistance,
          face_state: faceDirection,
        });
        return;
      }

      setSpotCheckOpen(false);
      emitProctorEvent(
        identityOk ? "spot_check_failed" : "identity_failed",
        {
          brightness_score: brightnessScore,
          identity_distance: identityDistance,
          face_state: faceDirection,
          multi_face_count: multiFaceCount,
          reason: !brightnessOk
            ? "low_light"
            : !faceOk
              ? "face_not_ready"
              : "identity_mismatch",
        }
      );
    } catch {
      setSpotCheckOpen(false);
      emitProctorEvent("spot_check_failed", { reason: "runtime_error" });
    } finally {
      setSpotCheckBusy(false);
    }
  }, [
    cameraStatus,
    emitProctorEvent,
    exam.identity_verification,
    faceDirection,
    identityReferenceHash,
    multiFaceCount,
    videoRef,
  ]);

  const checkpointDirtyAnswers = useCallback(async () => {
    if (isCheckpointingRef.current || isSubmittingRef.current) return;

    const currentAnswers = answersRef.current;
    const lastCheckpoint = lastCheckpointRef.current;
    const currentAnalytics = answerAnalyticsRef.current;
    const { answers: dirty, answerAnalytics: dirtyAnalytics } =
      buildDirtyAnswerDelta(currentAnswers, lastCheckpoint, currentAnalytics);

    if (Object.keys(dirty).length === 0) return;

    isCheckpointingRef.current = true;
    try {
      const result = await saveAnswersBatch(sessionId, dirty, dirtyAnalytics);
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
    const pendingDelta = buildDirtyAnswerDelta(
      { ...answersRef.current },
      lastCheckpointRef.current,
      { ...answerAnalyticsRef.current }
    );
    const result =
      Object.keys(pendingDelta.answers).length > 0
        ? await submitExam(
            sessionId,
            pendingDelta.answers,
            pendingDelta.answerAnalytics
          )
        : await submitExam(sessionId);
    if ("success" in result && result.success) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      router.replace(`/student/exams/${exam.id as string}/result`);
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

  useEffect(() => {
    handleSubmitRef.current = () => {
      void handleSubmit();
    };
  }, [handleSubmit]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (challengeOpen) {
        return;
      }
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [challengeOpen]);

  // Submit when timer hits zero (must be outside the state updater to avoid
  // calling router.push during React's reconciliation phase).
  useEffect(() => {
    if (timeLeft === 0 && initialTimeLeftSeconds > 0) {
      handleSubmitRef.current();
    }
  }, [timeLeft, initialTimeLeftSeconds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(draftStorageKey, JSON.stringify(answers));
  }, [answers, draftStorageKey]);

  // Batched checkpoint: flush dirty answers every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void checkpointDirtyAnswers();
    }, isMobileSession ? 3000 : 5000);
    return () => clearInterval(interval);
  }, [checkpointDirtyAnswers, isMobileSession]);

  // Checkpoint on question navigation
  useEffect(() => {
    void checkpointDirtyAnswers();
  }, [currentIndex, checkpointDirtyAnswers]);

  // Checkpoint on page hide / beforeunload
  useEffect(() => {
    const handlePageHide = (event?: Event) => {
      void checkpointDirtyAnswers();
      emitProctorEvent(
        "page_frozen",
        {
          persisted:
            event && "persisted" in event
              ? Boolean((event as PageTransitionEvent).persisted)
              : false,
        },
        2000
      );
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [checkpointDirtyAnswers, emitProctorEvent]);

  // Proctoring: visibility / focus / fullscreen / device change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        const newCount = tabSwitchCountRef.current + 1;
        tabSwitchCountRef.current = newCount;
        setTabSwitchCount(newCount);

        emitProctorEvent(
          isMobileSession ? "app_hidden" : "tab_hidden",
          {
            tab_switch_count: newCount,
            visibility_state: document.visibilityState,
          },
          500
        );
        void checkpointDirtyAnswers();

        if (!isMobileSession && newCount >= 3) {
          alert(
            `Анхааруулга: Та ${newCount} удаа цонхноос гарлаа. Integrity challenge идэвхжиж болно.`
          );
        }
      }
    };

    const handleWindowBlur = () => {
      if (document.hidden || isMobileSession) return;

      emitProctorEvent(
        "window_blur",
        {
          tab_switch_count: tabSwitchCountRef.current,
        },
        2000
      );
    };

    const handleFullscreenChange = () => {
      setFullscreenActive(Boolean(document.fullscreenElement));
      setDisplayMode(getDisplayMode());
      if (shouldEnforceFullscreen && !document.fullscreenElement) {
        emitProctorEvent(
          "fullscreen_exit",
          {
            tab_switch_count: tabSwitchCountRef.current,
          },
          1000
        );
      }
    };

    const handleDeviceChange = () => {
      if (!requireCamera) return;
      emitProctorEvent(
        "camera_disconnected",
        {
          reason: "device_change",
        },
        2000
      );
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleWindowBlur);
    setFullscreenActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [
    checkpointDirtyAnswers,
    emitProctorEvent,
    isMobileSession,
    requireCamera,
    shouldEnforceFullscreen,
  ]);

  useEffect(() => {
    let offlineStartedAt = 0;
    const initialOnline =
      typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
        ? navigator.onLine
        : true;
    setIsOnline(initialOnline);

    const handleOffline = () => {
      offlineStartedAt = Date.now();
      setIsOnline(false);
      emitProctorEvent("offline_started", { reason: "navigator_offline" }, 2000);
    };

    const handleOnline = () => {
      setIsOnline(true);
      emitProctorEvent(
        "offline_restored",
        {
          downtime_seconds:
            offlineStartedAt > 0 ? Math.round((Date.now() - offlineStartedAt) / 1000) : 0,
        },
        2000
      );
      void checkpointDirtyAnswers();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [checkpointDirtyAnswers, emitProctorEvent]);

  useEffect(() => {
    if (!isMobileSession) return;

    const handleOrientationChange = () => {
      const nextOrientation = getOrientationMode();
      if (lastOrientationLoggedRef.current !== nextOrientation) {
        lastOrientationLoggedRef.current = nextOrientation;
        setOrientation(nextOrientation);
        emitProctorEvent("orientation_changed", { orientation: nextOrientation }, 2000);
      }
    };

    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("resize", handleOrientationChange);
    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("resize", handleOrientationChange);
    };
  }, [emitProctorEvent, isMobileSession]);

  // Lock screen orientation to portrait on mobile PWA (Screen Orientation API)
  useEffect(() => {
    if (!isMobileSession || !isStandalonePwa) return;
    const orientationApi = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
    if (typeof orientationApi?.lock !== "function") return;
    orientationApi.lock("portrait").catch(() => {});
    return () => {
      screen.orientation.unlock();
    };
  }, [isMobileSession, isStandalonePwa]);

  useEffect(() => {
    if (!shouldUseSpotChecks) return;

    let timeoutId: number | undefined;
    const scheduleNext = () => {
      timeoutId = window.setTimeout(() => {
        if (!document.hidden && !spotCheckOpen && !isSubmittingRef.current) {
          queueSpotCheck("scheduled");
        }
        scheduleNext();
      }, 90000 + Math.floor(Math.random() * 60000));
    };

    scheduleNext();
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [queueSpotCheck, shouldUseSpotChecks, spotCheckOpen]);

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

  // Keyboard shortcut blocking + text selection prevention
  useEffect(() => {
    const BLOCKED_KEYS: { key: string; ctrlKey?: boolean; shiftKey?: boolean }[] = [
      { key: "F12" },
      { key: "I", ctrlKey: true, shiftKey: true },
      { key: "J", ctrlKey: true, shiftKey: true },
      { key: "C", ctrlKey: true, shiftKey: true },
      { key: "U", ctrlKey: true },
      { key: "S", ctrlKey: true },
      { key: "P", ctrlKey: true },
      { key: "F5" },
    ];

    const handleKeyDown = (event: KeyboardEvent) => {
      const blocked = BLOCKED_KEYS.some((combo) => {
        if (combo.key.toLowerCase() !== event.key.toLowerCase()) return false;
        if (combo.ctrlKey !== undefined && combo.ctrlKey !== event.ctrlKey) return false;
        if (combo.shiftKey !== undefined && combo.shiftKey !== event.shiftKey) return false;
        return true;
      });
      if (blocked) {
        event.preventDefault();
        emitProctorEvent("keyboard_shortcut", { key: event.key }, 2000);
      }
    };

    const handleSelectStart = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("selectstart", handleSelectStart);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("selectstart", handleSelectStart);
    };
  }, [emitProctorEvent]);

  // Multiple monitor detection (desktop only, Chrome 93+ Window Management API)
  useEffect(() => {
    if (isMobileSession) return;

    const checkMultiMonitor = () => {
      if ((window.screen as Screen & { isExtended?: boolean }).isExtended === true) {
        emitProctorEvent("multi_monitor", { source: "screen_check" }, 10000);
      }
    };

    checkMultiMonitor();
    window.addEventListener("resize", checkMultiMonitor);

    return () => {
      window.removeEventListener("resize", checkMultiMonitor);
    };
  }, [emitProctorEvent, isMobileSession]);

  useEffect(() => {
    if (!requireCamera) return;

    const video = videoRef.current;
    const stream = video?.srcObject;
    if (!(stream instanceof MediaStream)) return;

    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return;

    const handleTrackEnded = () => {
      emitProctorEvent("camera_disconnected", { reason: "track_ended" }, 1000);
    };

    for (const track of tracks) {
      track.addEventListener("ended", handleTrackEnded);
    }

    return () => {
      for (const track of tracks) {
        track.removeEventListener("ended", handleTrackEnded);
      }
    };
  }, [emitProctorEvent, requireCamera, videoRef, cameraStatus]);

  useEffect(() => {
    if (!heartbeatIntervalMs) return;

    const interval = window.setInterval(() => {
      void recordExamHeartbeat(sessionId, runtimeToken).then((result) => {
        if (result && "error" in result) {
          emitProctorEvent("heartbeat_lost", { reason: result.error ?? "heartbeat_failed" }, 5000);
        }
      });
    }, heartbeatIntervalMs);

    return () => window.clearInterval(interval);
  }, [emitProctorEvent, heartbeatIntervalMs, runtimeToken, sessionId]);

  useEffect(() => {
    if (!challengeOpen) return;

    const timer = window.setInterval(() => {
      setChallengeSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setChallengeAttempts((current) => current + 1);
          setChallengeOpen(false);
          emitProctorEvent("challenge_failed", {
            reason: "timeout",
            risk_score: riskScoreRef.current,
          });
          if (challengeAttempts + 1 >= 2) {
            handleSubmitRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [challengeAttempts, challengeOpen, emitProctorEvent]);

  useEffect(() => {
    if (!spotCheckOpen) return;

    const timer = window.setInterval(() => {
      setSpotCheckSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setSpotCheckOpen(false);
          emitProctorEvent("spot_check_failed", { reason: "timeout" });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [emitProctorEvent, spotCheckOpen]);

  useEffect(() => {
    if (!challengeOpen) return;

    if (
      document.fullscreenElement &&
      ((challengeDirection === "left" && faceDirection === "left") ||
        (challengeDirection === "right" && faceDirection === "right"))
    ) {
      setChallengeOpen(false);
      setChallengeMessage("Challenge амжилттай.");
      emitProctorEvent("challenge_passed", {
        challenge_direction: challengeDirection,
        risk_score: riskScoreRef.current,
      });
    }
  }, [challengeDirection, challengeOpen, emitProctorEvent, faceDirection]);

  // Хариулт хадгалах (localStorage-д шууд, Redis-д batch checkpoint-ээр)
  const handleAnswer = useCallback(
    (questionId: string, answer: string, questionType: string) => {
      const normalizedAnswer = normalizeDraftAnswer(questionType, answer);
      const nextAnswers = { ...answersRef.current };
      const nowIso = new Date().toISOString();
      const previous = answerAnalyticsRef.current[questionId] ?? {
        firstAnsweredAt: null,
        lastChangedAt: null,
        changeCount: 0,
      };
      if (normalizedAnswer === null) {
        delete nextAnswers[questionId];
      } else {
        nextAnswers[questionId] = normalizedAnswer;
      }

      answerAnalyticsRef.current = {
        ...answerAnalyticsRef.current,
        [questionId]: {
          firstAnsweredAt: previous.firstAnsweredAt ?? nowIso,
          lastChangedAt: nowIso,
          changeCount: previous.changeCount + 1,
        },
      };

      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
    },
    []
  );

  const answeredCount = displayQuestions.filter((question) =>
    isQuestionAnswered(question, answers[question.id])
  ).length;
  const isTimeWarning = timeLeft < 300; // 5 минутаас бага
  const progressPercent =
    displayQuestions.length > 0
      ? Math.round(((currentIndex + 1) / displayQuestions.length) * 100)
      : 0;
  const minutesLeft = Math.floor(timeLeft / 60);
  const secondsLeft = timeLeft % 60;
  const riskLevel = deriveRiskLevel(riskScore);
  const currentQuestionOptions = getDisplayOptions(
    currentQuestion.options ?? [],
    Boolean(exam.shuffle_options),
    `${sessionId}:${currentQuestion.id}`
  );

  if (REQUIRE_SEB && !sebDetected) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Safe Exam Browser шаардлагатай</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Энэ шалгалтыг зөвхөн Safe Exam Browser ашиглан нээх боломжтой.
              SEB-ээ нээгээд дахин оролдоно уу.
            </p>
            <p className="text-xs text-muted-foreground">safeexambrowser.org</p>
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

  return (
    <div className="min-h-screen bg-[rgba(250,250,250,0.98)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-8">
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Шалгалт дуусгах уу?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {answeredCount}/{displayQuestions.length} асуултад хариулсан байна.
              {answeredCount < displayQuestions.length && (
                <span className="font-medium text-destructive">
                  {" "}
                  {displayQuestions.length - answeredCount} асуулт хариулаагүй байна.
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

      {challengeOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-3xl border bg-background p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Integrity Challenge</h3>
            <p className="mt-2 text-sm text-muted-foreground">{challengeMessage}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Risk</p>
                <p className="text-lg font-semibold">{deriveRiskLevel(riskScore)}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Seconds left</p>
                <p className="text-lg font-semibold">{challengeSecondsLeft}s</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Face state</p>
                <p className="text-lg font-semibold">{faceDirection}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Fullscreen руу буцаж, камераа төвлөрүүлээд толгойгоо{" "}
              {challengeDirection === "left" ? "зүүн" : "баруун"} тийш эргүүлнэ үү.
              Амжилтгүй бол автоматаар flag хийгдэнэ.
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void document.documentElement.requestFullscreen().catch(() => {});
                }}
              >
                Fullscreen руу буцах
              </Button>
            </div>
          </div>
        </div>
      )}

      {spotCheckOpen && (
        <div className="fixed inset-0 z-[115] bg-black/65 px-4 py-6">
          <div className="mx-auto mt-56 w-full max-w-md rounded-3xl border bg-background p-5 shadow-2xl">
            <h3 className="text-lg font-semibold">Camera Spot-check</h3>
            <p className="mt-2 text-sm text-muted-foreground">{spotCheckMessage}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Хугацаа</p>
                <p className="text-lg font-semibold">{spotCheckSecondsLeft}s</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Face</p>
                <p className="text-lg font-semibold">{faceDirection}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Нүүрээ төвд барьж, гэрлээ сайн тааруулаад шалгалтаа үргэлжлүүлэхийн өмнө баталгаажуулна уу.
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSpotCheckOpen(false);
                  emitProctorEvent("spot_check_failed", { reason: "dismissed" });
                }}
              >
                Болих
              </Button>
              <Button
                type="button"
                className="flex-1"
                loading={spotCheckBusy}
                loadingText="Шалгаж байна..."
                onClick={() => void runSpotCheck()}
              >
                Spot-check хийх
              </Button>
            </div>
          </div>
        </div>
      )}

      {questionSheetOpen && (
        <div className="fixed inset-0 z-[95] bg-black/45 md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setQuestionSheetOpen(false)}
            aria-label="Question list хаах"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border bg-background p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Асуултын жагсаалт</p>
                <p className="text-xs text-muted-foreground">
                  {answeredCount}/{displayQuestions.length} хариулсан
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuestionSheetOpen(false)}
              >
                Хаах
              </Button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {displayQuestions.map((question, index) => {
                const answered = isQuestionAnswered(question, answers[question.id]);
                const active = index === currentIndex;
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(index);
                      setQuestionSheetOpen(false);
                    }}
                    className={`flex h-12 items-center justify-center rounded-2xl text-sm font-semibold ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : answered
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-muted text-foreground"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showMathReference && referenceOpen && (
        <div className="fixed inset-0 z-[96] bg-black/45 xl:hidden">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setReferenceOpen(false)}
            aria-label="Лавлах хаах"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] rounded-t-[28px] bg-white shadow-2xl">
            <MathReferencePanel
              compact
              className="max-h-[82vh] rounded-b-none rounded-t-[28px] border-0 shadow-none"
              onClose={() => setReferenceOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1090px] flex-col items-center gap-[30px] px-4 pb-8 pt-[91px] lg:pt-[99px]">
        <div className="fixed left-0 right-0 top-0 z-50 w-screen bg-[#FAFAFA] shadow-[0_4px_10px_rgba(0,0,0,0.1)]">
          <div className="mx-auto flex h-[59px] w-full max-w-[1512px] items-center justify-center gap-[18px] px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEE1FE]">
              <AlarmIcon />
            </div>
            <div className="flex items-center gap-2 text-[#575555]">
              <span className={`text-[20px] leading-[120%] ${isTimeWarning ? "text-red-600" : ""}`}>
                {minutesLeft.toString().padStart(2, "0")}
              </span>
              <span className="text-sm">мин</span>
              <span className={`text-[20px] leading-[120%] ${isTimeWarning ? "text-red-600" : ""}`}>
                {secondsLeft.toString().padStart(2, "0")}
              </span>
              <span className="text-sm">сек</span>
            </div>
          </div>
        </div>

        {!isOnline && (
          <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-800">
            Сүлжээ тасарсан байна. Хариултыг төхөөрөмж дээр хадгалж, холболт сэргээхийг хүлээж байна.
          </div>
        )}
        {gazeWarningCount > 0 && !isMobileStandard && (
          <div className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-center text-sm font-medium text-red-700">
            {gazeWarningCount < 3
              ? `Анхааруулга ${gazeWarningCount}/3: Та камерын өмнө шулуун харна уу. ${3 - gazeWarningCount} анхааруулга үлдсэн.`
              : "Анхааруулга 3/3: Шалгалт дуусгагдаж байна..."}
          </div>
        )}

        <div className="flex w-full flex-col gap-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="min-w-[260px]">
                <h1 className="text-[20px] font-medium leading-[120%] text-black">
                  {exam.title as string}
                </h1>
                <p className="mt-1 text-base font-normal leading-[120%] text-[#6B6B6B]">
                  {(exam.description as string | null) || "Шалгалтын асуултуудыг анхааралтай бөглөнө үү."}
                </p>
              </div>

              <div className="hidden lg:block">
                <DividerLine />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-[6px] lg:max-w-[491px]">
                <p className="text-base font-medium leading-[120%] text-black">
                  {progressPercent}%
                </p>
                <div className="h-2 w-full rounded-[64px] bg-[#E0E0E0]">
                  <div
                    className="h-2 rounded-[64px] bg-[#C59CFC]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isOnline && <Badge variant="destructive">Offline</Badge>}
            {cameraStatus === "denied" && <Badge variant="destructive">Камер хаалттай</Badge>}
            {shouldEnforceFullscreen && !fullscreenActive && (
              <Badge variant="destructive">Fullscreen off</Badge>
            )}
            {gazeWarningCount > 0 && !isMobileStandard && (
              <Badge variant="destructive">Анхааруулга {gazeWarningCount}/3</Badge>
            )}
            {tabSwitchCount > 0 && (
              <Badge variant="destructive">
                {isMobileSession ? "App" : "Tab"} {tabSwitchCount}
              </Badge>
            )}
            {multiFaceCount > 1 && (
              <Badge variant="destructive">Extra face x{multiFaceCount}</Badge>
            )}
            {isMobileSession && !isStandalonePwa && (
              <Badge variant="outline">Browser mode</Badge>
            )}
            {isMobileSession && orientation === "landscape" && (
              <Badge variant="outline">Landscape</Badge>
            )}
            <Badge variant={riskScore >= 40 ? "destructive" : "outline"}>
              {getRiskLabel(riskLevel)}
            </Badge>
          </div>

          <div className="flex items-start gap-4 xl:gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-4 flex justify-end xl:hidden">
                {showMathReference ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#DCC7FF] bg-white text-[#7F32F5] hover:bg-[#FAF7FF]"
                    onClick={() => setReferenceOpen(true)}
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Лавлах
                  </Button>
                ) : null}
              </div>

              <div className="w-full rounded-2xl bg-white px-0 py-6 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
                <div className="mx-auto flex w-full max-w-[992px] flex-col gap-[42px]">
                  <div className="flex flex-col gap-[42px]">
                    <div className="px-4 sm:px-0">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-4">
                          <h2 className="text-[20px] font-medium leading-[120%] text-[#7F7F7F]">
                            Асуулт {currentIndex + 1}
                          </h2>
                          <div className="flex h-10 items-center justify-center rounded-[26px] bg-[#E5E5E5] px-5 text-[15px] leading-[120%] text-black">
                            {currentQuestion.points} оноо
                          </div>
                        </div>

                        {currentPassage && (
                          <div className="rounded-2xl bg-[#FAFAFA] p-4">
                            <div className="mb-2 text-sm font-medium text-[#7F32F5]">
                              {currentPassage.title || "Нэмэлт өгөгдөл"}
                            </div>
                            <MathContent
                              html={currentPassage.content_html}
                              text={currentPassage.content}
                              className="prose prose-sm max-w-none text-foreground"
                            />
                          </div>
                        )}

                        <MathContent
                          html={currentQuestion.content_html}
                          text={currentQuestion.content}
                          className="prose prose-base max-w-none text-[20px] leading-[120%] text-black"
                        />

                        {currentQuestion.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={currentQuestion.image_url}
                            alt="Асуултын зураг"
                            className="max-h-64 rounded-xl"
                          />
                        )}
                      </div>
                    </div>

                    <div className="w-full border-t border-black/20" />
                  </div>

                  <div className="flex flex-col gap-[26px] px-4 sm:px-0">
                    {currentQuestion.type === "multiple_choice" && (
                      <div className="flex flex-col gap-[26px]">
                        {currentQuestionOptions.map((option, i) => {
                          const optionValue = String(option);
                          const isSelected = answers[currentQuestion.id] === optionValue;

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
                              className={`relative flex h-[60px] w-full items-center justify-between px-[34px] text-left transition-all ${
                                isSelected
                                  ? "border-l-4 border-l-[#C59CFC] bg-white shadow-[0_4px_12px_rgba(197,156,252,0.2)]"
                                  : "bg-white"
                              }`}
                            >
                              <MathContent
                                text={optionValue}
                                className="prose prose-sm max-w-none text-base leading-[120%] text-black"
                              />
                              <span
                                className={`h-5 w-5 rounded-full ${
                                  isSelected ? "bg-[#6BBF7A]" : "border border-[#949494]"
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {currentQuestion.type === "multiple_response" && (
                      <div className="flex flex-col gap-[26px]">
                        {currentQuestionOptions.map((option, i) => {
                          const optionValue = String(option);
                          const isSelected = currentMultipleAnswers.includes(optionValue);

                          return (
                            <button
                              key={i}
                              onClick={() => {
                                const nextAnswers = isSelected
                                  ? currentMultipleAnswers.filter((item) => item !== optionValue)
                                  : [...currentMultipleAnswers, optionValue];

                                handleAnswer(
                                  currentQuestion.id,
                                  JSON.stringify(nextAnswers),
                                  currentQuestion.type
                                );
                              }}
                              className={`relative flex h-[60px] w-full items-center justify-between px-[34px] text-left transition-all ${
                                isSelected
                                  ? "border-l-4 border-l-[#C59CFC] bg-white shadow-[0_4px_12px_rgba(197,156,252,0.2)]"
                                  : "bg-white"
                              }`}
                            >
                              <MathContent
                                text={optionValue}
                                className="prose prose-sm max-w-none text-base leading-[120%] text-black"
                              />
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full text-[12px] ${
                                  isSelected
                                    ? "bg-[#6BBF7A] text-white"
                                    : "border border-[#949494]"
                                }`}
                              >
                                {isSelected ? "✓" : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {currentQuestion.type === "essay" && (
                      <textarea
                        className="min-h-[180px] w-full rounded-2xl border border-black/10 px-6 py-5 focus:outline-none focus:ring-2 focus:ring-[#C59CFC]"
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

                    {currentQuestion.type === "fill_blank" && (
                      <input
                        type="text"
                        className="h-14 w-full rounded-2xl border border-black/10 px-6 focus:outline-none focus:ring-2 focus:ring-[#C59CFC]"
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
                        {currentMatchingPrompts.map((leftPrompt, index) => (
                          <div
                            key={`${leftPrompt}-${index}`}
                            className="grid gap-3 rounded-2xl border border-black/10 p-4 md:grid-cols-2"
                          >
                            <div className="rounded-xl bg-[#FAFAFA] px-4 py-3 font-medium">
                              <MathContent
                                text={leftPrompt}
                                className="prose prose-sm max-w-none text-foreground"
                              />
                            </div>
                            <select
                              className="rounded-xl border border-black/10 bg-white px-4 py-3"
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
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {currentIndex < displayQuestions.length - 1 ? (
                <div className="mt-6 flex items-center justify-center gap-6">
                  <Button
                    variant="ghost"
                    onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                    disabled={currentIndex === 0}
                    className="h-10 rounded-full bg-[#E5E5E5] px-0 text-[20px] leading-[120%] text-[#6B6B6B] hover:bg-[#dbdbdb] disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D1D1D1]">
                      <ArrowIcon direction="left" />
                    </span>
                    <span className="px-4">Өмнөх</span>
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() =>
                      setCurrentIndex((p) =>
                        Math.min(displayQuestions.length - 1, p + 1)
                      )
                    }
                    className="h-10 rounded-full bg-[#E5E5E5] px-0 text-[20px] leading-[120%] text-[#6B6B6B] hover:bg-[#dbdbdb]"
                  >
                    <span className="px-4">Дараах</span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D1D1D1]">
                      <ArrowIcon direction="right" />
                    </span>
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowSubmitConfirm(true)}
                  loading={isSubmitting}
                  loadingText="Илгээж байна..."
                  className="mx-auto mt-6 h-11 w-full max-w-[208px] rounded-full bg-[#7F32F5] text-[20px] font-normal leading-[120%] text-white hover:bg-[#712adf]"
                >
                  Дуусгах
                </Button>
              )}
            </div>

            {showMathReference ? (
              <>
                <div className="hidden shrink-0 xl:flex xl:w-[108px] xl:flex-col xl:gap-4">
                  <ToolTile
                    icon={<Calculator className="h-[18px] w-[18px]" />}
                    label="Тооцоолуур"
                    disabled
                  />
                  <ToolTile
                    icon={
                      referenceOpen ? (
                        <PanelRightClose className="h-[18px] w-[18px]" />
                      ) : (
                        <PanelRightOpen className="h-[18px] w-[18px]" />
                      )
                    }
                    label="Лавлах"
                    active={referenceOpen}
                    onClick={() => setReferenceOpen((current) => !current)}
                  />
                  <ToolTile
                    icon={<SquarePen className="h-[18px] w-[18px]" />}
                    label="Ноорог"
                    disabled
                  />
                </div>

                {referenceOpen ? (
                  <div className="hidden h-[720px] w-[340px] shrink-0 xl:block">
                    <MathReferencePanel
                      className="h-full"
                      onClose={() => setReferenceOpen(false)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 py-3 shadow-[0_-10px_30px_-20px_rgba(15,23,42,0.28)] backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="flex-1"
          >
            Өмнөх
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setQuestionSheetOpen(true)}
            className="flex-1"
          >
            Жагсаалт
          </Button>
          {currentIndex < displayQuestions.length - 1 ? (
            <Button
              type="button"
              onClick={() =>
                setCurrentIndex((prev) =>
                  Math.min(displayQuestions.length - 1, prev + 1)
                )
              }
              className="flex-1"
            >
              Дараах
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowSubmitConfirm(true)}
              className="flex-1"
            >
              Дуусгах
            </Button>
          )}
        </div>
      </div>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`fixed z-[120] rounded-2xl border-2 bg-black object-cover shadow-lg transition-opacity ${
          shouldPinCameraPreview ? "opacity-100" : "opacity-0 pointer-events-none"
        } ${
          isMobileStandard
            ? "left-4 right-4 top-20 h-44 w-auto"
            : "right-4 top-20 h-28 w-36"
        }`}
      />
    </div>
  );
}
