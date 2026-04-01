export type ProctoringMode = "off" | "standard" | "strict";
export type EvidenceMode = "metadata_only" | "metadata_snapshots";
export type DevicePolicy = "any" | "mobile_preferred" | "desktop_only";
export type StudentDeviceType = "desktop" | "mobile";
export type ProctorDisplayMode = "browser" | "standalone" | "fullscreen" | "unknown";
export type ProctorSeverity = "low" | "medium" | "high" | "critical";
export type ProctorRiskLevel = "low" | "medium" | "high" | "critical";
export type ProctorFlagStatus = "clear" | "flagged" | "reviewed" | "escalated";

export type ProctorEventType =
  | "tab_hidden"
  | "window_blur"
  | "copy_attempt"
  | "paste_attempt"
  | "context_menu"
  | "camera_denied"
  | "look_left"
  | "look_right"
  | "face_missing"
  | "fullscreen_exit"
  | "camera_disconnected"
  | "multi_face"
  | "heartbeat_lost"
  | "app_hidden"
  | "page_frozen"
  | "offline_started"
  | "offline_restored"
  | "spot_check_required"
  | "spot_check_passed"
  | "spot_check_failed"
  | "orientation_changed"
  | "identity_failed"
  | "challenge_required"
  | "challenge_passed"
  | "challenge_failed"
  | "identity_verified"
  | "multi_monitor"
  | "keyboard_shortcut";

export interface ProctoringSettings {
  proctoring_mode: ProctoringMode;
  device_policy: DevicePolicy;
  require_fullscreen: boolean;
  require_camera: boolean;
  identity_verification: boolean;
  evidence_mode: EvidenceMode;
  post_exam_similarity_enabled: boolean;
}

export interface AnswerChangeAnalytics {
  firstAnsweredAt: string | null;
  lastChangedAt: string | null;
  changeCount: number;
}

export interface ProctorEventPolicy {
  severity: ProctorSeverity;
  riskDelta: number;
}

export interface ProctorEventContext {
  deviceType?: StudentDeviceType | null;
  displayMode?: ProctorDisplayMode | null;
  proctoringMode?: ProctoringMode | null;
}

export const DEFAULT_PROCTORING_SETTINGS: ProctoringSettings = {
  proctoring_mode: "off",
  device_policy: "any",
  require_fullscreen: false,
  require_camera: false,
  identity_verification: false,
  evidence_mode: "metadata_only",
  post_exam_similarity_enabled: false,
};

export const PROCTOR_EVENT_POLICIES: Record<ProctorEventType, ProctorEventPolicy> = {
  tab_hidden: { severity: "high", riskDelta: 16 },
  window_blur: { severity: "medium", riskDelta: 8 },
  copy_attempt: { severity: "low", riskDelta: 4 },
  paste_attempt: { severity: "low", riskDelta: 4 },
  context_menu: { severity: "low", riskDelta: 4 },
  camera_denied: { severity: "high", riskDelta: 18 },
  look_left: { severity: "medium", riskDelta: 10 },
  look_right: { severity: "medium", riskDelta: 10 },
  face_missing: { severity: "medium", riskDelta: 12 },
  fullscreen_exit: { severity: "high", riskDelta: 18 },
  camera_disconnected: { severity: "critical", riskDelta: 30 },
  multi_face: { severity: "critical", riskDelta: 30 },
  heartbeat_lost: { severity: "high", riskDelta: 18 },
  app_hidden: { severity: "high", riskDelta: 20 },
  page_frozen: { severity: "high", riskDelta: 18 },
  offline_started: { severity: "high", riskDelta: 14 },
  offline_restored: { severity: "low", riskDelta: 0 },
  spot_check_required: { severity: "medium", riskDelta: 6 },
  spot_check_passed: { severity: "low", riskDelta: 0 },
  spot_check_failed: { severity: "critical", riskDelta: 34 },
  orientation_changed: { severity: "medium", riskDelta: 8 },
  identity_failed: { severity: "high", riskDelta: 24 },
  challenge_required: { severity: "medium", riskDelta: 6 },
  challenge_passed: { severity: "low", riskDelta: 0 },
  challenge_failed: { severity: "critical", riskDelta: 36 },
  identity_verified: { severity: "low", riskDelta: 0 },
  multi_monitor: { severity: "high", riskDelta: 20 },
  keyboard_shortcut: { severity: "low", riskDelta: 6 },
};

export function getEffectiveDevicePolicy(
  settings: Pick<ProctoringSettings, "proctoring_mode" | "device_policy">
) {
  if (settings.proctoring_mode === "strict") return "desktop_only";
  if (settings.proctoring_mode === "off") return "any";
  return settings.device_policy;
}

export function isMobileCompatibleProctoredExam(
  settings: Pick<ProctoringSettings, "proctoring_mode" | "device_policy">
) {
  return (
    settings.proctoring_mode === "standard" &&
    getEffectiveDevicePolicy(settings) !== "desktop_only"
  );
}

export function getProctorEventPolicy(
  eventType: ProctorEventType,
  context: ProctorEventContext = {}
): ProctorEventPolicy {
  const basePolicy = PROCTOR_EVENT_POLICIES[eventType];

  if (
    context.deviceType === "mobile" &&
    context.proctoringMode === "standard"
  ) {
    switch (eventType) {
      case "fullscreen_exit":
        return { severity: "low", riskDelta: 2 };
      case "window_blur":
        return { severity: "low", riskDelta: 3 };
      case "tab_hidden":
        return { severity: "medium", riskDelta: 8 };
      case "look_left":
      case "look_right":
      case "face_missing":
        return { severity: "low", riskDelta: 0 };
      default:
        return basePolicy;
    }
  }

  return basePolicy;
}

export function deriveRiskLevel(riskScore: number): ProctorRiskLevel {
  if (riskScore >= 70) return "critical";
  if (riskScore >= 40) return "high";
  if (riskScore >= 20) return "medium";
  return "low";
}

export function shouldTriggerChallenge(riskScore: number) {
  return riskScore >= 40;
}

export function shouldAutoFlag(riskScore: number) {
  return riskScore >= 70;
}

export function isProctoredExam(settings: Pick<ProctoringSettings, "proctoring_mode">) {
  return settings.proctoring_mode !== "off";
}

export function isStrictProctoredExam(
  settings: Pick<ProctoringSettings, "proctoring_mode">
) {
  return settings.proctoring_mode === "strict";
}

export function getProctorEventLabel(eventType: ProctorEventType) {
  switch (eventType) {
    case "tab_hidden":
      return "Tab эсвэл app сольсон";
    case "window_blur":
      return "Цонхны focus алдсан";
    case "copy_attempt":
      return "Copy оролдлого";
    case "paste_attempt":
      return "Paste оролдлого";
    case "context_menu":
      return "Right click оролдлого";
    case "camera_denied":
      return "Камер зөвшөөрөөгүй";
    case "look_left":
      return "Зүүн тийш харсан";
    case "look_right":
      return "Баруун тийш харсан";
    case "face_missing":
      return "Нүүр алдагдсан";
    case "fullscreen_exit":
      return "Fullscreen-ээс гарсан";
    case "camera_disconnected":
      return "Камер салсан";
    case "multi_face":
      return "Нэмэлт хүн илэрсэн";
    case "heartbeat_lost":
      return "Heartbeat тасарсан";
    case "app_hidden":
      return "App background болсон";
    case "page_frozen":
      return "Page freeze болсон";
    case "offline_started":
      return "Сүлжээ тасарсан";
    case "offline_restored":
      return "Сүлжээ сэргэсэн";
    case "spot_check_required":
      return "Spot-check шаардсан";
    case "spot_check_passed":
      return "Spot-check амжилттай";
    case "spot_check_failed":
      return "Spot-check амжилтгүй";
    case "orientation_changed":
      return "Orientation өөрчлөгдсөн";
    case "identity_failed":
      return "Identity mismatch илэрсэн";
    case "challenge_required":
      return "Challenge шаардсан";
    case "challenge_passed":
      return "Challenge амжилттай";
    case "challenge_failed":
      return "Challenge амжилтгүй";
    case "identity_verified":
      return "Identity баталгаажсан";
    case "multi_monitor":
      return "Олон дэлгэц илэрсэн";
    case "keyboard_shortcut":
      return "Хориотой товчлол дарсан";
    default:
      return eventType;
  }
}

export function summarizeProctorCounts(counts: Record<string, number>) {
  const ranked = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);

  if (ranked.length === 0) {
    return "Integrity event бүртгэгдээгүй.";
  }

  return ranked
    .map(([eventType, count]) => `${getProctorEventLabel(eventType as ProctorEventType)} ${count}`)
    .join(", ");
}
