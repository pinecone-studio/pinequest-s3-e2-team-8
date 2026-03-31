"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BatteryMedium,
  Wifi,
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckStatus = "pending" | "checking" | "ok" | "warning" | "error";

interface CheckResult {
  status: CheckStatus;
  message: string;
}

interface SystemChecks {
  battery: CheckResult;
  internet: CheckResult;
  camera: CheckResult;
  // Easy to extend: add fullscreen, faceDetection, tabSwitch, etc. here
}

interface PreExamCheckProps {
  /** Called when the student confirms they are ready to start the exam. */
  onStart: () => void;
  examTitle?: string;
}

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

async function runBatteryCheck(): Promise<CheckResult> {
  // Battery Status API has limited support – treat unsupported as warning, not error.
  if (!("getBattery" in navigator)) {
    return {
      status: "warning",
      message:
        "Battery level cannot be checked automatically on this browser. Please check your charge manually.",
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const battery = await (navigator as any).getBattery();
    const level = Math.round(battery.level * 100);
    if (!battery.charging && level < 20) {
      return {
        status: "error",
        message: `Battery is low (${level}%). Please connect your charger before starting the exam.`,
      };
    }
    if (!battery.charging && level < 40) {
      return {
        status: "warning",
        message: `Battery level is ${level}%. Consider connecting your charger to avoid interruptions.`,
      };
    }
    return {
      status: "ok",
      message: `Battery level is ${level}%${battery.charging ? " (charging)" : ""}.`,
    };
  } catch {
    return {
      status: "warning",
      message:
        "Battery level cannot be checked automatically on this browser. Please check your charge manually.",
    };
  }
}

async function runInternetCheck(): Promise<CheckResult> {
  if (!navigator.onLine) {
    return {
      status: "error",
      message: "No internet connection detected. Please check your network and try again.",
    };
  }

  try {
    const start = performance.now();
    await fetch("/api/ping", { cache: "no-store" });
    const latency = Math.round(performance.now() - start);

    // Optionally read Network Information API as extra context (support is limited)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection;
    const extra =
      conn?.effectiveType && conn.effectiveType !== "4g"
        ? ` (network type: ${conn.effectiveType})`
        : "";

    if (latency < 150) {
      return {
        status: "ok",
        message: `Connection is stable (${latency}ms latency${extra}).`,
      };
    }
    if (latency < 400) {
      return {
        status: "warning",
        message: `Connection is slow (${latency}ms latency${extra}). This may affect your experience during the exam.`,
      };
    }
    return {
      status: "warning",
      message: `Connection is very slow (${latency}ms latency${extra}). Consider switching to a better network before starting.`,
    };
  } catch {
    return {
      status: "error",
      message: "Unable to reach the server. Please check your internet connection.",
    };
  }
}

/**
 * Requests camera access, stops tracks immediately after the test.
 * Structured so a live preview can be added later by keeping the stream
 * alive instead of calling stop() here.
 */
async function runCameraCheck(): Promise<CheckResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Stop tracks – no live preview needed at this stage.
    // To add a preview later: pass `stream` out and attach to a <video> element.
    stream.getTracks().forEach((t) => t.stop());
    return { status: "ok", message: "Camera is accessible and ready." };
  } catch (err) {
    const name = (err as DOMException).name;
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        status: "error",
        message:
          "Camera access was denied. Please allow camera permission in your browser settings and try again.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        status: "error",
        message: "No camera found. Please connect a camera to continue.",
      };
    }
    return {
      status: "error",
      message: "Camera check failed. Please ensure your camera is connected and accessible.",
    };
  }
}

// ---------------------------------------------------------------------------
// Status icon + badge helpers
// ---------------------------------------------------------------------------

const CHECKING_RESULT: CheckResult = { status: "checking", message: "Checking…" };

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pending") {
    return <Loader2 className="size-5 text-muted-foreground" />;
  }
  if (status === "checking") {
    return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  }
  if (status === "ok") return <CheckCircle2 className="size-5 text-emerald-500" />;
  if (status === "warning") return <AlertTriangle className="size-5 text-amber-500" />;
  return <XCircle className="size-5 text-destructive" />;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "pending" || status === "checking") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {status === "checking" ? "Checking…" : "Pending"}
      </Badge>
    );
  }
  if (status === "ok") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
        OK
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        Warning
      </Badge>
    );
  }
  return <Badge variant="destructive">Error</Badge>;
}

// ---------------------------------------------------------------------------
// Check row
// ---------------------------------------------------------------------------

interface CheckRowProps {
  icon: React.ReactNode;
  label: string;
  result: CheckResult;
}

function CheckRow({ icon, label, result }: CheckRowProps) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-card px-4 py-3">
      {/* Check-type icon */}
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>

      {/* Label + message */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {result.message}
        </p>
      </div>

      {/* Status indicator */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusIcon status={result.status} />
        <StatusBadge status={result.status} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PreExamCheck({ onStart, examTitle }: PreExamCheckProps) {
  // Start in the "checking" state so the initial useEffect never needs to call
  // setState synchronously (which triggers react-hooks/set-state-in-effect).
  const [checks, setChecks] = useState<SystemChecks>({
    battery: CHECKING_RESULT,
    internet: CHECKING_RESULT,
    camera: CHECKING_RESULT,
  });
  const [isRunning, setIsRunning] = useState(true);

  // Recheck button handler – called from an event handler, not from an effect,
  // so synchronous setState calls here are fine.
  const runAllChecks = useCallback(async () => {
    setIsRunning(true);
    setChecks({ battery: CHECKING_RESULT, internet: CHECKING_RESULT, camera: CHECKING_RESULT });

    // All checks run in parallel for speed
    const [battery, internet, camera] = await Promise.all([
      runBatteryCheck(),
      runInternetCheck(),
      runCameraCheck(),
    ]);

    setChecks({ battery, internet, camera });
    setIsRunning(false);
  }, []);

  // Run checks once on mount. The effect itself does not call setState – all
  // state updates happen asynchronously after the awaited Promise.all resolves,
  // which satisfies react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;

    Promise.all([runBatteryCheck(), runInternetCheck(), runCameraCheck()]).then(
      ([battery, internet, camera]) => {
        if (!cancelled) {
          setChecks({ battery, internet, camera });
          setIsRunning(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isDone =
    !isRunning &&
    Object.values(checks).every(
      (c) => c.status !== "checking" && c.status !== "pending"
    );

  // Critical failures that block exam start.
  // Battery error alone does NOT block – student can still proceed with a warning.
  const hasBlockingError =
    checks.camera.status === "error" || checks.internet.status === "error";

  const canStart = isDone && !hasBlockingError;

  const errorCount = Object.values(checks).filter((c) => c.status === "error").length;
  const warningCount = Object.values(checks).filter((c) => c.status === "warning").length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">System Check</h1>
          {examTitle && (
            <p className="mt-1 text-sm text-muted-foreground">{examTitle}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Please wait while we verify that your device is ready for the exam.
          </p>
        </div>

        {/* Check rows */}
        <div className="space-y-2.5">
          <CheckRow
            icon={<BatteryMedium className="size-4" />}
            label="Battery"
            result={checks.battery}
          />
          <CheckRow
            icon={<Wifi className="size-4" />}
            label="Internet Connection"
            result={checks.internet}
          />
          <CheckRow
            icon={<Camera className="size-4" />}
            label="Camera"
            result={checks.camera}
          />
        </div>

        {/* Summary banner – shown once all checks finish */}
        {isDone && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              errorCount > 0
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : warningCount > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
            }`}
          >
            {errorCount > 0 ? (
              <span>
                <strong>
                  {errorCount} issue{errorCount > 1 ? "s" : ""}
                </strong>{" "}
                must be resolved before you can start. Please fix the errors above and
                recheck.
              </span>
            ) : warningCount > 0 ? (
              <span>
                <strong>
                  {warningCount} warning{warningCount > 1 ? "s" : ""}
                </strong>{" "}
                detected. You may still start the exam, but consider addressing them first.
              </span>
            ) : (
              <span>All checks passed. Your device is ready for the exam.</span>
            )}
          </div>
        )}

        {/* Low battery advisory (not blocking) */}
        {isDone && checks.battery.status === "error" && !hasBlockingError && (
          <p className="text-center text-xs text-muted-foreground">
            Battery is low, but you can still proceed. Please plug in your charger.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={runAllChecks}
            disabled={isRunning}
          >
            <RefreshCw className={`mr-2 size-4 ${isRunning ? "animate-spin" : ""}`} />
            {isRunning ? "Checking…" : "Recheck"}
          </Button>

          <Button className="flex-1" onClick={onStart} disabled={!canStart}>
            Start Exam
          </Button>
        </div>
      </div>
    </div>
  );
}
