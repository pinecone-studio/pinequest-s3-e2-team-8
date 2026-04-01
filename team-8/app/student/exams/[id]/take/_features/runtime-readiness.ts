export interface ExamRuntimeReadiness {
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
}

type StoredExamStartContext = {
  sessionId: string;
  startedAt: string;
  runtimeReadiness: ExamRuntimeReadiness;
  telemetryPersisted: boolean;
  savedAt: number;
};

const STORAGE_PREFIX = "exam-start-context:";
const MAX_CONTEXT_AGE_MS = 6 * 60 * 60 * 1000;
const cachedContextByKey = new Map<string, { raw: string; parsed: StoredExamStartContext }>();

function getStorageKey(examId: string) {
  return `${STORAGE_PREFIX}${examId}`;
}

export function readStoredExamStartContext(
  examId: string,
  sessionId: string
): StoredExamStartContext | null {
  if (typeof window === "undefined") return null;

  try {
    const storageKey = getStorageKey(examId);
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;

    const cached = cachedContextByKey.get(storageKey);
    const parsed =
      cached && cached.raw === raw
        ? cached.parsed
        : (JSON.parse(raw) as StoredExamStartContext);

    if (!cached || cached.raw !== raw) {
      cachedContextByKey.set(storageKey, { raw, parsed });
    }
    if (!parsed || parsed.sessionId !== sessionId) return null;
    if (Date.now() - Number(parsed.savedAt ?? 0) > MAX_CONTEXT_AGE_MS) {
      window.sessionStorage.removeItem(storageKey);
      cachedContextByKey.delete(storageKey);
      return null;
    }

    return parsed;
  } catch {
    cachedContextByKey.delete(getStorageKey(examId));
    return null;
  }
}

export function writeStoredExamStartContext(
  examId: string,
  value: {
    sessionId: string;
    startedAt: string;
    runtimeReadiness: ExamRuntimeReadiness;
    telemetryPersisted?: boolean;
  }
) {
  if (typeof window === "undefined") return;

  const payload: StoredExamStartContext = {
    sessionId: value.sessionId,
    startedAt: value.startedAt,
    runtimeReadiness: value.runtimeReadiness,
    telemetryPersisted: Boolean(value.telemetryPersisted),
    savedAt: Date.now(),
  };

  window.sessionStorage.setItem(getStorageKey(examId), JSON.stringify(payload));
}

export function markStoredExamStartTelemetryPersisted(
  examId: string,
  sessionId: string
) {
  const existing = readStoredExamStartContext(examId, sessionId);
  if (!existing) return;

  writeStoredExamStartContext(examId, {
    sessionId,
    startedAt: existing.startedAt,
    runtimeReadiness: existing.runtimeReadiness,
    telemetryPersisted: true,
  });
}
