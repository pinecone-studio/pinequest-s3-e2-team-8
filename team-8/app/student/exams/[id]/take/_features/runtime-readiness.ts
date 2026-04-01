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
const STORAGE_EVENT = "exam-start-context-change";
const cachedContextByKey = new Map<string, { raw: string; parsed: StoredExamStartContext }>();

function getStorageKey(examId: string) {
  return `${STORAGE_PREFIX}${examId}`;
}

function isStoredExamStartContextFresh(parsed: StoredExamStartContext | null) {
  if (!parsed) return false;
  return Date.now() - Number(parsed.savedAt ?? 0) <= MAX_CONTEXT_AGE_MS;
}

function parseStoredExamStartContextRaw(raw: string | null) {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredExamStartContext;
  } catch {
    return null;
  }
}

function emitStoredExamStartContextChange(examId: string, raw: string | null) {
  if (typeof window === "undefined") return null;

  window.dispatchEvent(
    new CustomEvent(STORAGE_EVENT, {
      detail: {
        key: getStorageKey(examId),
        raw,
      },
    })
  );
}

export function subscribeStoredExamStartContext(
  examId: string,
  onStoreChange: () => void
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const storageKey = getStorageKey(examId);
  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.sessionStorage) return;
    if (event.key !== storageKey) return;
    onStoreChange();
  };
  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{ key?: string }>;
    if (customEvent.detail?.key !== storageKey) return;
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, handleCustomEvent);
  };
}

export function readStoredExamStartContextSnapshot(examId: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(getStorageKey(examId));
  } catch {
    return null;
  }
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

export function parseStoredExamStartContext(
  raw: string | null,
  sessionId: string
): StoredExamStartContext | null {
  const parsed = parseStoredExamStartContextRaw(raw);
  if (!parsed || parsed.sessionId !== sessionId) return null;
  if (!isStoredExamStartContextFresh(parsed)) return null;
  return parsed;
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

  const storageKey = getStorageKey(examId);
  const raw = JSON.stringify(payload);

  window.sessionStorage.setItem(storageKey, raw);
  emitStoredExamStartContextChange(examId, raw);
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
