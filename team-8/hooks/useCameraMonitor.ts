"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { logProctorEvent } from "@/lib/student/actions";

export type CameraStatus = "pending" | "granted" | "denied" | "unavailable";

interface UseCameraMonitorOptions {
  sessionId: string;
  /** Set to false to skip camera entirely (e.g. SEB not detected when required). */
  enabled?: boolean;
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
}: UseCameraMonitorOptions): UseCameraMonitorResult {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("pending");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Prevent logging camera_denied more than once per session mount.
  const deniedLoggedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setCameraStatus("unavailable");
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraStatus("unavailable");
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
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
    // sessionId is stable for the lifetime of a session; enabled changes at most once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, enabled]);

  return { cameraStatus, videoRef };
}
