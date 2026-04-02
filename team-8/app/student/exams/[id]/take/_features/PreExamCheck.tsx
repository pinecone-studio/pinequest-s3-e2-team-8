"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BatteryCharging,
  Camera,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Wifi,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  computeBrightnessScore,
  computeVideoFingerprint,
  getDisplayMode,
  getHashDistance,
  getOrientationMode,
  getPlatformLabel,
  getPreferredCameraConstraints,
  getStudentDeviceType,
} from "@/lib/proctoring-client";
import { getIdentityEnrollment } from "@/lib/student/actions";
import type {
  DevicePolicy,
  ProctorDisplayMode,
  ProctoringMode,
} from "@/lib/proctoring";
import type { ExamRuntimeReadiness } from "./runtime-readiness";

type ReadinessPayload = ExamRuntimeReadiness;

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

type EnrollmentState = {
  referenceImageData: string;
  referenceHash: string;
  updatedAt: string;
} | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function StatusIndicator({ status }: { status: CheckStatus }) {
  const textClass =
    status === "checking"
      ? "text-gray-400"
      : status === "error"
        ? "text-[#E05252]"
        : status === "warning"
          ? "text-[#E6A23C]"
          : "text-[#3B8748]";

  return (
    <div className="flex flex-col items-center gap-0.5">
      {status === "checking" ? (
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      ) : status === "error" ? (
        <XCircle className="h-6 w-6 text-[#E05252]" />
      ) : status === "warning" ? (
        <AlertTriangle className="h-6 w-6 text-[#E6A23C]" />
      ) : (
        <CheckCircle2 className="h-6 w-6 text-[#6BBF7A]" />
      )}

      <span className={`text-[12px] leading-none ${textClass}`}>
        {status === "checking"
          ? "Шалгаж байна"
          : status === "warning"
            ? "Анхаар"
            : status === "error"
              ? "Алдаа"
              : "Хэвийн"}
      </span>
    </div>
  );
}

export default function PreExamCheck({
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
  const [internetMessage, setInternetMessage] = useState(
    "Сүлжээг шалгаж байна...",
  );
  const [batteryStatus, setBatteryStatus] = useState<CheckStatus>("checking");
  const [batteryMessage, setBatteryMessage] = useState("Цэнэг шалгаж байна...");
  const [cameraStatus, setCameraStatus] = useState<CheckStatus>(
    requireCamera ? "checking" : "ok",
  );
  const [cameraMessage, setCameraMessage] = useState(
    requireCamera
      ? "Камерыг ачаалж байна..."
      : "Энэ шалгалтад камер заавал шаардлагагүй.",
  );
  const [, setFullscreenStatus] = useState<CheckStatus>(
    requireFullscreen ? "warning" : "ok",
  );
  const [, setFullscreenMessage] = useState(
    requireFullscreen
      ? "Шалгалтаас өмнө fullscreen горимд орно."
      : "Fullscreen заавал биш.",
  );
  const [identityStatus, setIdentityStatus] = useState<CheckStatus>(
    identityVerification ? "checking" : "ok",
  );
  const [, setIdentityMessage] = useState(
    identityVerification
      ? "Identity enrollment мэдээлэл уншиж байна..."
      : "Identity verification унтраалттай.",
  );
  const [brightnessScore, setBrightnessScore] = useState<number | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentState>(null);
  const [, setLoadingEnrollment] = useState(identityVerification);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setPwaStatus] = useState<CheckStatus>("checking");
  const [, setPwaMessage] = useState("PWA төлөв шалгаж байна...");
  const [, setOrientationStatus] = useState<CheckStatus>("checking");
  const [, setOrientationMessage] = useState(
    "Дэлгэцийн байрлалыг шалгаж байна...",
  );
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const deviceType = useMemo(() => getStudentDeviceType(), []);
  const isDesktop = deviceType === "desktop";
  const [displayMode, setDisplayMode] = useState<ProctorDisplayMode>(() =>
    getDisplayMode(),
  );
  const isStandalonePwa =
    displayMode === "standalone" || displayMode === "fullscreen";
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(() =>
    getOrientationMode(),
  );
  const platform = useMemo(() => getPlatformLabel(), []);
  const isProctored = proctoringMode !== "off";
  const requiresDesktop = devicePolicy === "desktop_only";
  const shouldEnforceFullscreen =
    requireFullscreen &&
    !(deviceType === "mobile" && proctoringMode === "standard");
  const canStart =
    internetStatus !== "error" &&
    (!requiresDesktop || isDesktop) &&
    (!requireCamera || cameraStatus === "ok" || cameraStatus === "warning") &&
    (!identityVerification || identityStatus === "ok");
  const readinessSettled =
    batteryStatus !== "checking" &&
    internetStatus !== "checking" &&
    (!requireCamera || cameraStatus !== "checking") &&
    (!identityVerification || identityStatus !== "checking");

  useEffect(() => {
    let cancelled = false;

    async function checkBattery() {
      const nav = navigator as Navigator & {
        getBattery?: () => Promise<{
          level: number;
          charging: boolean;
        }>;
      };

      if (!nav.getBattery) {
        if (!cancelled) {
          setBatteryStatus("ok");
          setBatteryMessage("Цэнэгийн мэдээлэл уншигдахгүй байна.");
        }
        return;
      }

      try {
        const battery = await nav.getBattery();
        if (cancelled) return;

        const percentage = Math.round(battery.level * 100);
        const isHealthy = percentage >= 20 || battery.charging;
        setBatteryStatus(isHealthy ? "ok" : "warning");
        setBatteryMessage(
          battery.charging
            ? `Цэнэг ${percentage}% (цэнэглэж байна)`
            : `Цэнэг ${percentage}%`,
        );
      } catch {
        if (!cancelled) {
          setBatteryStatus("ok");
          setBatteryMessage("Цэнэгийн мэдээллийг шалгаж чадсангүй.");
        }
      }
    }

    void checkBattery();
    return () => {
      cancelled = true;
    };
  }, []);

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
            : `Холболт хэвийн байна (${latency}ms).`,
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
          setCameraMessage(
            "Орчны гэрэл бага байна. Илүү гэрэлтэй газар сууна уу.",
          );
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
      const standalone =
        nextDisplayMode === "standalone" || nextDisplayMode === "fullscreen";
      setPwaStatus(standalone ? "ok" : isProctored ? "warning" : "ok");
      setPwaMessage(
        standalone
          ? "Standalone/PWA горим идэвхтэй байна."
          : isProctored
            ? "App хэлбэрээр нээвэл илүү тогтвортой ажиллана."
            : "Browser горим хангалттай.",
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
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
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
          : "Landscape горимд ажиллах боломжтой ч portrait илүү тогтвортой.",
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
        setIdentityMessage(
          "Reference selfie олдлоо. Start хийхийн өмнө live verification хийнэ.",
        );
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
        active ? "ok" : shouldEnforceFullscreen ? "warning" : "ok",
      );
      setFullscreenMessage(
        active
          ? "Fullscreen идэвхтэй байна."
          : shouldEnforceFullscreen
            ? "Start хийхийн өмнө fullscreen горимд орно."
            : "Mobile standard дээр fullscreen нь нэмэлт signal байдлаар бүртгэгдэнэ.",
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
        setIdentityMessage(
          `Identity verification амжилттай (${distance} diff).`,
        );
        return { ok: true, hash: liveHash };
      }

      setIdentityStatus("error");
      setIdentityMessage(
        `Identity verification амжилтгүй (${distance} diff). Камерын өнцөг, гэрлээ засна уу.`,
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
    <div
      className="flex min-h-screen justify-center px-4 pb-10 pt-[84px] md:pt-[118px]"
      style={{
        background:
          "linear-gradient(180deg, rgba(249,240,252,0.98) 0%, rgba(255,255,255,0.98) 100%)",
      }}
    >
      <div className="w-full max-w-[664px] space-y-[30px]">
        <div className="mx-auto flex w-full max-w-[580px] flex-col items-center gap-5 text-center">
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[100px] bg-[#D1D1D1]">
            <ShieldCheck className="h-8 w-8 text-black" />
          </div>
          <div className="flex flex-col items-center gap-[6px]">
            <h1 className="text-[24px] font-semibold leading-[120%] text-black">
              Системийн шалгалт
            </h1>
            <p className="text-[16px] font-normal leading-[120%] text-[#6B6B6B]">
              Таны төхөөрөмж шалгалтад бэлэн эсэхийг шалгаж байна. Түр хүлээнэ
              үү.
            </p>
          </div>
        </div>

        {!isDesktop && requiresDesktop ? (
          <div className="rounded-[16px] border border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            Энэ шалгалтыг mobile төхөөрөмж дээр эхлүүлэхгүй. Desktop эсвэл
            laptop ашиглана уу.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[16px] border border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex w-full flex-col items-center gap-[9px] px-0 md:px-[10px]">
          <div
            className="flex h-[70px] w-full max-w-[644px] items-center justify-between rounded-[16px] bg-white px-6"
            style={{ border: "0.5px solid #BDBDBD" }}
          >
            <div className="flex items-center gap-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                <BatteryCharging className="h-8 w-8 text-black" />
              </div>
              <div className="flex flex-col gap-[6px]">
                <p className="text-[16px] font-medium leading-[120%] text-black">
                  Цэнэг
                </p>
                <p className="text-[14px] font-normal leading-[120%] text-[#6B6B6B]">
                  {batteryMessage}
                </p>
              </div>
            </div>
            <StatusIndicator status={batteryStatus} />
          </div>

          <div
            className="flex h-[70px] w-full max-w-[644px] items-center justify-between rounded-[16px] bg-white px-6"
            style={{ border: "0.5px solid #BDBDBD" }}
          >
            <div className="flex items-center gap-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                <Wifi className="h-8 w-8 text-black" />
              </div>
              <div className="flex flex-col gap-[6px]">
                <p className="text-[16px] font-medium leading-[120%] text-black">
                  Интернет холболт
                </p>
                <p className="text-[14px] font-normal leading-[120%] text-[#6B6B6B]">
                  {internetMessage}
                </p>
              </div>
            </div>
            <StatusIndicator status={internetStatus} />
          </div>

          <div
            className="flex h-[70px] w-full max-w-[644px] items-center justify-between rounded-[16px] bg-white px-6"
            style={{ border: "0.5px solid #BDBDBD" }}
          >
            <div className="flex items-center gap-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                <Camera className="h-8 w-8 text-black" />
              </div>
              <div className="flex flex-col gap-[6px]">
                <p className="text-[16px] font-medium leading-[120%] text-black">
                  Камер
                </p>
                <p className="text-[14px] font-normal leading-[120%] text-[#6B6B6B]">
                  {brightnessScore !== null
                    ? `${cameraMessage}${cameraMessage.endsWith(".") ? "" : "."}`
                    : cameraMessage}
                </p>
              </div>
            </div>
            <StatusIndicator status={cameraStatus} />
          </div>

          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />

          {canStart && readinessSettled ? (
            <div
              className="flex h-[44px] w-full max-w-[644px] items-center rounded-[16px] bg-[#DBF0DF] px-6 text-[14px] font-medium leading-[120%] text-[#3B8748]"
              style={{ border: "0.4px solid #6BBF7A" }}
            >
              Бүгд хэвийн. Таны төхөөрөмж шалгалтад бэлэн байна.
            </div>
          ) : null}

          <div
            className="w-full max-w-[644px] rounded-[16px] bg-[#FBE9E9] p-5 text-[#E05252]"
            style={{ border: "0.4px solid #E05252", minHeight: "176px" }}
          >
            <div className="flex flex-col gap-[10px]">
              <div className="flex items-center gap-[10px]">
                <AlertTriangle className="h-8 w-8 shrink-0" />
                <p className="text-[16px] font-medium leading-[120%]">
                  Анхааруулга
                </p>
              </div>
              <div className="flex flex-col gap-[10px] text-[14px] leading-[140%]">
                <p className="font-normal">
                  Шалгалтын явцад таны камер идэвхтэй ажиллаж, таны үйлдлийг
                  хянах болно. Иймд шалгалтын хугацаанд өөр таб нээх, цонх
                  солих, гаднын эх сурвалж ашиглах зэрэг зөрчил гаргавал систем
                  илрүүлж, тухайн үйлдлийг хуулбарлах оролдлого гэж үзнэ.
                </p>
                <p className="font-medium">
                  Ийм тохиолдолд таны шалгалтыг хүчингүйд тооцох боломжтойг
                  анхаарна уу.
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-[644px] flex-col gap-3 md:h-10 md:flex-row md:gap-[28px]">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 rounded-[8px] bg-white text-[14px] font-medium text-black hover:bg-zinc-50"
              style={{ border: "0.4px solid #BDBDBD" }}
              onClick={() => window.location.reload()}
            >
              Дахин шалгах
            </Button>
            <Button
              type="button"
              className="h-10 flex-1 rounded-[8px] bg-black text-[14px] font-medium text-white hover:bg-black/90"
              onClick={() => void handleStart()}
              disabled={
                !canStart || actionLoading || (requiresDesktop && !isDesktop)
              }
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
    </div>
  );
}
