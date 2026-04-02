"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { logProctorEvent } from "@/lib/student/actions";
import { getPreferredCameraConstraints } from "@/lib/proctoring-client";

export type CameraStatus = "pending" | "granted" | "denied" | "unavailable";

interface UseCameraMonitorOptions {
  sessionId: string;
  /** Set to false to skip camera entirely (e.g. SEB not detected when required). */
  enabled?: boolean;
  preferFrontCamera?: boolean;
}

export interface UseCameraMonitorResult {
  cameraStatus: CameraStatus;
  /** Attach to a <video> element to get the live feed (useful for Phase 2 gaze detection). */
  videoRef: RefObject<HTMLVideoElement | null>;
}

/**
 * Requests camera permission on mount.
 * - Logs a single `camera_denied` proctor event if permission is refused.
 * - Cleans up the media stream on unmount.
 * - Never throws; safe to call even if MediaDevices API is absent.
 */
export function useCameraMonitor({
  sessionId,
  enabled = true,
  preferFrontCamera = true,
}: UseCameraMonitorOptions): UseCameraMonitorResult {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("pending");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Prevent logging camera_denied more than once per session mount.
  const deniedLoggedRef = useRef(false);
  const cameraApiAvailable =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const effectiveCameraStatus: CameraStatus =
    !enabled || (typeof navigator !== "undefined" && !cameraApiAvailable)
      ? "unavailable"
      : cameraStatus;

  useEffect(() => {
    if (!enabled || !cameraApiAvailable) {
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia(getPreferredCameraConstraints(preferFrontCamera))
      .then((stream) => {
        if (cancelled) {
          // Unmounted before stream arrived — release immediately.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraStatus("granted");
      })
      .catch(() => {
        if (cancelled) return;
        setCameraStatus("denied");

        // Log once per mount — never spam.
        if (!deniedLoggedRef.current) {
          deniedLoggedRef.current = true;
          void logProctorEvent(sessionId, "camera_denied", {
            reason: "permission_denied",
          });
        }
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraApiAvailable, sessionId, enabled, preferFrontCamera]);

  // Secondary attach: if the video element mounted after getUserMedia resolved
  // (common on iOS Safari where React may defer the ref assignment), ensure the
  // stream is assigned to srcObject before the component renders.
  useEffect(() => {
    if (cameraStatus !== "granted") return;
    const video = videoRef.current;
    if (video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraStatus]);

  return { cameraStatus: effectiveCameraStatus, videoRef };
}
