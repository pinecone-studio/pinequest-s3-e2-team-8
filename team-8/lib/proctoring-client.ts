"use client";

import type {
  ProctorDisplayMode,
  StudentDeviceType,
} from "@/lib/proctoring";

export function isDesktopLikeDevice() {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const mobileMatchers = [
    "android",
    "iphone",
    "ipad",
    "ipod",
    "mobile",
  ];

  return !mobileMatchers.some((token) => userAgent.includes(token));
}

export function getStudentDeviceType(): StudentDeviceType {
  return isDesktopLikeDevice() ? "desktop" : "mobile";
}

export function getPlatformLabel() {
  if (typeof navigator === "undefined") return "unknown";

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("android")) return "android";
  if (userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("ipod")) {
    return "ios";
  }
  if (userAgent.includes("mac os")) return "macos";
  if (userAgent.includes("windows")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

export function getDisplayMode(): ProctorDisplayMode {
  if (typeof window === "undefined") return "unknown";
  if (document.fullscreenElement) return "fullscreen";
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  ) {
    return "standalone";
  }
  return "browser";
}

export function isStandaloneDisplayMode() {
  const displayMode = getDisplayMode();
  return displayMode === "standalone" || displayMode === "fullscreen";
}

export function getOrientationMode() {
  if (typeof window === "undefined") return "portrait" as const;
  return window.matchMedia("(orientation: portrait)").matches
    ? ("portrait" as const)
    : ("landscape" as const);
}

export function getPreferredCameraConstraints(preferFrontCamera = true) {
  return {
    video: preferFrontCamera ? { facingMode: "user" } : true,
    audio: false,
  } as const;
}

function createScaledCanvas(video: HTMLVideoElement, size = 48) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  context.drawImage(video, 0, 0, size, size);
  return { canvas, context };
}

export function captureVideoSnapshot(
  video: HTMLVideoElement,
  width = 320,
  quality = 0.72
) {
  const aspectRatio =
    video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoHeight / video.videoWidth
      : 0.75;
  const height = Math.max(Math.round(width * aspectRatio), 180);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function computeBrightnessScore(video: HTMLVideoElement) {
  const { context } = createScaledCanvas(video, 40);
  const { data } = context.getImageData(0, 0, 40, 40);

  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += (data[index] + data[index + 1] + data[index + 2]) / 3;
  }

  return Math.round(total / (data.length / 4));
}

export function computeVideoFingerprint(video: HTMLVideoElement) {
  const { context } = createScaledCanvas(video, 16);
  const { data } = context.getImageData(0, 0, 16, 16);
  const grayValues: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    grayValues.push((data[index] + data[index + 1] + data[index + 2]) / 3);
  }

  const average =
    grayValues.reduce((sum, value) => sum + value, 0) / grayValues.length;

  return grayValues
    .map((value) => (value >= average ? "1" : "0"))
    .join("");
}

export function getHashDistance(left: string, right: string) {
  if (!left || !right || left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }

  return distance;
}
