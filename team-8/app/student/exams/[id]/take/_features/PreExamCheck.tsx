"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Wifi,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  captureVideoSnapshot,
  computeBrightnessScore,
  computeVideoFingerprint,
  getDisplayMode,
  getHashDistance,
  getOrientationMode,
  getPlatformLabel,
  getPreferredCameraConstraints,
  getStudentDeviceType,
} from "@/lib/proctoring-client";
import { getIdentityEnrollment, upsertIdentityEnrollment } from "@/lib/student/actions";
import type {
  DevicePolicy,
  ProctorDisplayMode,
  ProctoringMode,
  StudentDeviceType,
} from "@/lib/proctoring";

type ReadinessPayload = {
  isDesktop: boolean;
  deviceType: StudentDeviceType;
  displayMode: ProctorDisplayMode;
  orientation: "portrait" | "landscape";
  isStandalonePwa: boolean;
  platform: string;
  fullscreenReady: boolean;
  cameraReady: boolean;
  identityVerified: boolean;
  brightnessScore: number | null;
  identityHash: string | null;
};

type CheckStatus = "checking" | "ok" | "warning" | "error";

interface Props {
  examTitle?: string;
  proctoringMode: ProctoringMode;
  devicePolicy: DevicePolicy;
  requireFullscreen: boolean;
  requireCamera: boolean;
  identityVerification: boolean;
  resumeMode?: boolean;
  onStart: (payload: ReadinessPayload) => Promise<void> | void;
}

type EnrollmentState =
  | {
      referenceImageData: string;
      referenceHash: string;
      updatedAt: string;
    }
  | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "ok") {
    return <Badge className="bg-emerald-100 text-emerald-700">OK</Badge>;
  }
  if (status === "warning") {
    return <Badge className="bg-amber-100 text-amber-700">Warning</Badge>;
  }
  if (status === "checking") {
    return <Badge variant="outline">Checking</Badge>;
  }
  return <Badge variant="destructive">Error</Badge>;
}

function CheckRow({
  icon,
  title,
  message,
  status,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  status: CheckStatus;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
            {icon}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-zinc-950">{title}</p>
              <StatusBadge status={status} />
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">{message}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

export default function PreExamCheck({
  examTitle,
  proctoringMode,
  devicePolicy,
  requireFullscreen,
  requireCamera,
  identityVerification,
  resumeMode = false,
  onStart,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [internetStatus, setInternetStatus] = useState<CheckStatus>("checking");
  const [internetMessage, setInternetMessage] = useState("Сүлжээг шалгаж байна...");
  const [cameraStatus, setCameraStatus] = useState<CheckStatus>(
    requireCamera ? "checking" : "ok"
  );
  const [cameraMessage, setCameraMessage] = useState(
    requireCamera
      ? "Камерыг ачаалж байна..."
      : "Энэ шалгалтад камер заавал шаардлагагүй."
  );
  const [fullscreenStatus, setFullscreenStatus] = useState<CheckStatus>(
    requireFullscreen ? "warning" : "ok"
  );
  const [fullscreenMessage, setFullscreenMessage] = useState(
    requireFullscreen
      ? "Шалгалтаас өмнө fullscreen горимд орно."
      : "Fullscreen заавал биш."
  );
  const [identityStatus, setIdentityStatus] = useState<CheckStatus>(
    identityVerification ? "checking" : "ok"
  );
  const [identityMessage, setIdentityMessage] = useState(
    identityVerification
      ? "Identity enrollment мэдээлэл уншиж байна..."
      : "Identity verification унтраалттай."
  );
  const [brightnessScore, setBrightnessScore] = useState<number | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentState>(null);
  const [loadingEnrollment, setLoadingEnrollment] = useState(identityVerification);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwaStatus, setPwaStatus] = useState<CheckStatus>("checking");
  const [pwaMessage, setPwaMessage] = useState("PWA төлөв шалгаж байна...");
  const [orientationStatus, setOrientationStatus] = useState<CheckStatus>("checking");
  const [orientationMessage, setOrientationMessage] = useState(
    "Дэлгэцийн байрлалыг шалгаж байна..."
  );
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const deviceType = useMemo(() => getStudentDeviceType(), []);
  const isDesktop = deviceType === "desktop";
  const [displayMode, setDisplayMode] = useState<ProctorDisplayMode>(() =>
    getDisplayMode()
  );
  const isStandalonePwa =
    displayMode === "standalone" || displayMode === "fullscreen";
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(() =>
    getOrientationMode()
  );
  const platform = useMemo(() => getPlatformLabel(), []);
  const isProctored = proctoringMode !== "off";
  const requiresDesktop = devicePolicy === "desktop_only";
  const shouldEnforceFullscreen =
    requireFullscreen && !(deviceType === "mobile" && proctoringMode === "standard");
  const canStart =
    internetStatus !== "error" &&
    (!requiresDesktop || isDesktop) &&
    (!requireCamera || cameraStatus === "ok" || cameraStatus === "warning") &&
    (!shouldEnforceFullscreen || fullscreenStatus === "ok") &&
    (!identityVerification || identityStatus === "ok");

  useEffect(() => {
    let cancelled = false;

    async function checkInternet() {
      if (!navigator.onLine) {
        if (!cancelled) {
          setInternetStatus("error");
          setInternetMessage("Интернэт холболт алга байна.");
        }
        return;
      }

      try {
        const startedAt = performance.now();
        await fetch("/api/ping", { cache: "no-store" });
        const latency = Math.round(performance.now() - startedAt);
        if (cancelled) return;
        setInternetStatus(latency > 450 ? "warning" : "ok");
        setInternetMessage(
          latency > 450
            ? `Холболт удаан байна (${latency}ms).`
            : `Холболт хэвийн байна (${latency}ms).`
        );
      } catch {
        if (!cancelled) {
          setInternetStatus("error");
          setInternetMessage("Сервертэй холбогдож чадсангүй.");
        }
      }
    }

    void checkInternet();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requireCamera) {
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia(getPreferredCameraConstraints(true))
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraStatus("ok");
        setCameraMessage("Камер бэлэн байна.");
      })
      .catch((cameraError: DOMException) => {
        if (cancelled) return;
        setCameraStatus("error");
        if (cameraError?.name === "NotAllowedError") {
          setCameraMessage("Камерын зөвшөөрөл өгөөгүй байна.");
        } else {
          setCameraMessage("Камерийг нээж чадсангүй.");
        }
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [requireCamera]);

  useEffect(() => {
    if (!requireCamera) return;

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      try {
        const score = computeBrightnessScore(video);
        setBrightnessScore(score);
        if (score < 30) {
          setCameraStatus("warning");
          setCameraMessage("Орчны гэрэл бага байна. Илүү гэрэлтэй газар сууна уу.");
        } else if (score >= 30) {
          setCameraStatus("ok");
          setCameraMessage("Камер бэлэн байна.");
        }
      } catch {
        // Ignore intermittent canvas sampling errors.
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [requireCamera]);

  useEffect(() => {
    const updatePwaState = () => {
      const nextDisplayMode = getDisplayMode();
      setDisplayMode(nextDisplayMode);
      const standalone = nextDisplayMode === "standalone" || nextDisplayMode === "fullscreen";
      setPwaStatus(standalone ? "ok" : isProctored ? "warning" : "ok");
      setPwaMessage(
        standalone
          ? "Standalone/PWA горим идэвхтэй байна."
          : isProctored
            ? "App хэлбэрээр нээвэл илүү тогтвортой ажиллана."
            : "Browser горим хангалттай."
      );
    };

    updatePwaState();

    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const handleStandaloneChange = () => updatePwaState();
    standaloneQuery.addEventListener?.("change", handleStandaloneChange);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      updatePwaState();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      standaloneQuery.removeEventListener?.("change", handleStandaloneChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [isProctored]);

  useEffect(() => {
    const updateOrientation = () => {
      const nextOrientation = getOrientationMode();
      setOrientation(nextOrientation);
      setOrientationStatus(nextOrientation === "portrait" ? "ok" : "warning");
      setOrientationMessage(
        nextOrientation === "portrait"
          ? "Portrait байрлал mobile дээр тохиромжтой байна."
          : "Landscape горимд ажиллах боломжтой ч portrait илүү тогтвортой."
      );
    };

    updateOrientation();
    window.addEventListener("orientationchange", updateOrientation);
    window.addEventListener("resize", updateOrientation);
    return () => {
      window.removeEventListener("orientationchange", updateOrientation);
      window.removeEventListener("resize", updateOrientation);
    };
  }, []);

  useEffect(() => {
    if (!identityVerification) {
      return;
    }

    let cancelled = false;
    setLoadingEnrollment(true);
    void getIdentityEnrollment().then((result) => {
      if (cancelled) return;
      setEnrollment(result);
      setLoadingEnrollment(false);
      if (result) {
        setIdentityStatus("warning");
        setIdentityMessage("Reference selfie олдлоо. Start хийхийн өмнө live verification хийнэ.");
      } else {
        setIdentityStatus("warning");
        setIdentityMessage("Enrollment selfie бүртгүүлээгүй байна.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [identityVerification]);

  useEffect(() => {
    if (!requireFullscreen) {
      setFullscreenStatus("ok");
      setFullscreenMessage("Fullscreen заавал биш.");
      return;
    }

    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setDisplayMode(getDisplayMode());
      setFullscreenStatus(
        active ? "ok" : shouldEnforceFullscreen ? "warning" : "ok"
      );
      setFullscreenMessage(
        active
          ? "Fullscreen идэвхтэй байна."
          : shouldEnforceFullscreen
            ? "Start хийхийн өмнө fullscreen горимд орно."
            : "Mobile standard дээр fullscreen нь нэмэлт signal байдлаар бүртгэгдэнэ."
      );
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [requireFullscreen, shouldEnforceFullscreen]);

  async function ensureFullscreen() {
    if (!shouldEnforceFullscreen || document.fullscreenElement) {
      return true;
    }

    try {
      await document.documentElement.requestFullscreen();
      return Boolean(document.fullscreenElement);
    } catch {
      setError("Fullscreen горим руу шилжиж чадсангүй.");
      return false;
    }
  }

  async function promptInstall() {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) {
      setPwaMessage(
        platform === "ios"
          ? "Safari дээр Share товчоор Add to Home Screen хийж суулгаарай."
          : "Browser тань install prompt дэмжихгүй байна."
      );
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => undefined);
    deferredPromptRef.current = null;
    const nextDisplayMode = getDisplayMode();
    setDisplayMode(nextDisplayMode);
    setPwaStatus(
      nextDisplayMode === "standalone" || nextDisplayMode === "fullscreen"
        ? "ok"
        : "warning"
    );
  }

  async function createEnrollment() {
    const video = videoRef.current;
    if (!video) {
      setError("Камерын preview хараахан бэлэн болоогүй байна.");
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const snapshot = captureVideoSnapshot(video);
      const hash = computeVideoFingerprint(video);
      const result = await upsertIdentityEnrollment(snapshot, hash);
      if (result?.error) {
        setError(result.error);
        return;
      }

      setEnrollment({
        referenceImageData: snapshot,
        referenceHash: hash,
        updatedAt: new Date().toISOString(),
      });
      setIdentityStatus("warning");
      setIdentityMessage("Enrollment selfie хадгалагдлаа. Одоо live verification хийнэ.");
    } catch {
      setError("Enrollment selfie үүсгэж чадсангүй.");
    } finally {
      setActionLoading(false);
    }
  }

  async function verifyIdentity() {
    if (!identityVerification) {
      return { ok: true, hash: null };
    }

    if (!enrollment?.referenceHash) {
      setIdentityStatus("error");
      setIdentityMessage("Start хийхийн өмнө reference selfie бүртгэнэ үү.");
      return { ok: false, hash: null };
    }

    const video = videoRef.current;
    if (!video) {
      setIdentityStatus("error");
      setIdentityMessage("Камерын preview бэлэн болоогүй байна.");
      return { ok: false, hash: null };
    }

    try {
      const liveHash = computeVideoFingerprint(video);
      const distance = getHashDistance(enrollment.referenceHash, liveHash);
      if (distance <= 56) {
        setIdentityStatus("ok");
        setIdentityMessage(`Identity verification амжилттай (${distance} diff).`);
        return { ok: true, hash: liveHash };
      }

      setIdentityStatus("error");
      setIdentityMessage(
        `Identity verification амжилтгүй (${distance} diff). Камерын өнцөг, гэрлээ засна уу.`
      );
      return { ok: false, hash: liveHash };
    } catch {
      setIdentityStatus("error");
      setIdentityMessage("Identity verification хийх үед алдаа гарлаа.");
      return { ok: false, hash: null };
    }
  }

  async function handleStart() {
    setActionLoading(true);
    setError(null);

    try {
      const fullscreenReady = shouldEnforceFullscreen
        ? await ensureFullscreen()
        : Boolean(document.fullscreenElement);
      const identityResult = await verifyIdentity();

      if (shouldEnforceFullscreen && !fullscreenReady) {
        setActionLoading(false);
        return;
      }

      const payload: ReadinessPayload = {
        isDesktop,
        deviceType,
        displayMode,
        orientation,
        isStandalonePwa,
        platform,
        fullscreenReady,
        cameraReady: !requireCamera || cameraStatus !== "error",
        identityVerified: identityResult.ok,
        brightnessScore,
        identityHash: identityResult.hash,
      };

      await onStart(payload);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-950">
            {resumeMode ? "Шалгалтыг үргэлжлүүлэхийн өмнөх шалгалт" : "Шалгалтын өмнөх систем шалгалт"}
          </h1>
          {examTitle ? (
            <p className="mt-1 text-sm text-zinc-500">{examTitle}</p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-500">
            {isProctored
              ? `Энэ шалгалт ${proctoringMode} integrity profile ашиглаж байна.`
              : "Энэ шалгалтад basic readiness check ажиллана."}
          </p>
        </div>

        {!isDesktop && requiresDesktop ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Энэ шалгалтыг mobile төхөөрөмж дээр эхлүүлэхгүй. Desktop эсвэл laptop ашиглана уу.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <CheckRow
              icon={<Wifi className="h-5 w-5" />}
              title="Internet"
              status={internetStatus}
              message={internetMessage}
            />
            <CheckRow
              icon={<Camera className="h-5 w-5" />}
              title="Camera"
              status={cameraStatus}
              message={
                brightnessScore !== null
                  ? `${cameraMessage} Brightness: ${brightnessScore}.`
                  : cameraMessage
              }
            />
            <CheckRow
              icon={<Monitor className="h-5 w-5" />}
              title="Fullscreen"
              status={fullscreenStatus}
              message={fullscreenMessage}
              action={
                shouldEnforceFullscreen ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void ensureFullscreen()}
                  >
                    Идэвхжүүлэх
                  </Button>
                ) : undefined
              }
            />
            <CheckRow
              icon={<Monitor className="h-5 w-5" />}
              title="PWA / App mode"
              status={pwaStatus}
              message={pwaMessage}
              action={
                !isStandalonePwa && deviceType === "mobile" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void promptInstall()}
                  >
                    App болгох
                  </Button>
                ) : undefined
              }
            />
            <CheckRow
              icon={<Monitor className="h-5 w-5" />}
              title="Orientation"
              status={orientationStatus}
              message={orientationMessage}
            />
            <CheckRow
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Identity"
              status={loadingEnrollment ? "checking" : identityStatus}
              message={loadingEnrollment ? "Enrollment шалгаж байна..." : identityMessage}
              action={
                identityVerification ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void createEnrollment()}
                      disabled={actionLoading || cameraStatus === "error"}
                    >
                      <RefreshCw className="mr-1 h-4 w-4" />
                      Enroll
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void verifyIdentity()}
                      disabled={actionLoading || !enrollment}
                    >
                      Verify
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-zinc-950">Live preview</p>
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-[4/3] w-full object-cover"
              />
              {cameraStatus === "checking" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Камер ачаалж байна...
                </div>
              ) : null}
            </div>

            {enrollment?.referenceImageData ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Reference selfie
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollment.referenceImageData}
                  alt="Reference selfie"
                  className="h-24 w-24 rounded-2xl border object-cover"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
          {canStart ? (
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Start хийхэд бэлэн байна.
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-700">
              <XCircle className="h-4 w-4" />
              Дээрх шалгалтуудыг гүйцээгээд дахин оролдоно уу.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Дахин шалгах
          </Button>
          <Button
            type="button"
            onClick={() => void handleStart()}
            disabled={!canStart || actionLoading || (requiresDesktop && !isDesktop)}
          >
            {actionLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Бэлтгэж байна...
              </>
            ) : resumeMode ? (
              "Шалгалтыг үргэлжлүүлэх"
            ) : (
              "Шалгалт эхлүүлэх"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
