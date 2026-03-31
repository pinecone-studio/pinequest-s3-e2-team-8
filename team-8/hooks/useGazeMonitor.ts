"use client";

import { useEffect, useRef, useCallback, type RefObject } from "react";
import { logProctorEvent } from "@/lib/student/actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Wide center zone — small/normal head movement stays "center".
// Nose must be clearly off-center before we classify as left/right.
const GAZE_LEFT_THRESHOLD = 0.35;
const GAZE_RIGHT_THRESHOLD = 0.65;

// Both of the following conditions must be met simultaneously to fire a warning:
//   1. The suspicious state has been confirmed on this many consecutive frames
//      (at ~10 fps, 25 frames ≈ 2.5 s of uninterrupted off-center state).
//   2. At least GAZE_HOLD_MS has elapsed since the streak started.
// A single "center" frame resets BOTH counters.
const MIN_CONSECUTIVE_FRAMES = 25;
const GAZE_HOLD_MS = 3000; // ms

// After a warning fires, suppress new warnings for this long.
const COOLDOWN_MS = 8000; // ms

// Detection runs at most every 100 ms (~10 fps) to keep CPU low.
const DETECTION_INTERVAL_MS = 100;

// Hard cap on warnings — never exceeded.
const MAX_WARNINGS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// Internal classification for each detection frame.
type FrameState = "center" | "left" | "right" | "face_missing" | "multi_face";

export interface UseGazeMonitorOptions {
  sessionId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  /** Called with total warning count each time a warning fires. Always ≤ MAX_WARNINGS. */
  onWarning: (totalWarnings: number) => void;
  /** Called exactly once when total warnings reach MAX_WARNINGS. */
  onMaxWarnings: () => void;
  /** Called on every processed frame with the dominant face direction. */
  onStateChange?: (
    state: "center" | "left" | "right" | "missing" | "multi_face",
    faceCount: number
  ) => void;
}

export function useGazeMonitor({
  sessionId,
  videoRef,
  enabled,
  onWarning,
  onMaxWarnings,
  onStateChange,
}: UseGazeMonitorOptions) {
  // ---------------------------------------------------------------------------
  // Pending-state tracker — all mutable, never causes re-renders.
  // ---------------------------------------------------------------------------
  // The FrameState that is currently accumulating. null = none yet.
  const pendingStateRef = useRef<FrameState | null>(null);
  // How many consecutive frames have confirmed pendingStateRef.
  const pendingStreakRef = useRef(0);
  // Timestamp of the first frame in the current streak.
  const pendingStartRef = useRef<number | null>(null);

  // Warning / submit control.
  const cooldownUntilRef = useRef<number>(0);
  const warningCountRef = useRef<number>(0);
  const maxReachedRef = useRef(false);
  const maxWarningsFiredRef = useRef(false);

  // rAF / lifecycle.
  const lastDetectionRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const destroyedRef = useRef(false);

  // Stable callback refs so the rAF loop never closes over stale values.
  const onWarningRef = useRef(onWarning);
  const onMaxWarningsRef = useRef(onMaxWarnings);
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onWarningRef.current = onWarning; }, [onWarning]);
  useEffect(() => { onMaxWarningsRef.current = onMaxWarnings; }, [onMaxWarnings]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  // ---------------------------------------------------------------------------
  // Core: called once per throttled frame with the classified state.
  // ---------------------------------------------------------------------------
  const handleFrameState = useCallback(
    (state: FrameState) => {
      if (maxReachedRef.current) return;

      const now = Date.now();

      if (state === "center") {
        // Any center frame fully resets everything.
        pendingStateRef.current = null;
        pendingStreakRef.current = 0;
        pendingStartRef.current = null;
        return;
      }

      if (state !== pendingStateRef.current) {
        // Suspicious state changed — start a fresh streak.
        pendingStateRef.current = state;
        pendingStreakRef.current = 1;
        pendingStartRef.current = now;
        return;
      }

      // Same suspicious state as last frame — extend streak.
      pendingStreakRef.current += 1;

      // Gate 1: not enough consecutive frames yet.
      if (pendingStreakRef.current < MIN_CONSECUTIVE_FRAMES) return;

      // Gate 2: not enough elapsed time yet.
      const elapsed = now - (pendingStartRef.current ?? now);
      if (elapsed < GAZE_HOLD_MS) return;

      // Gate 3: still in cooldown.
      if (now < cooldownUntilRef.current) return;

      // Gate 4: already at max.
      if (warningCountRef.current >= MAX_WARNINGS) {
        maxReachedRef.current = true;
        return;
      }

      // All gates passed — fire warning.
      cooldownUntilRef.current = now + COOLDOWN_MS;
      // Reset pending so the next warning needs a fresh sustained look-away.
      pendingStateRef.current = null;
      pendingStreakRef.current = 0;
      pendingStartRef.current = null;

      warningCountRef.current += 1;
      const total = warningCountRef.current;

      const eventType =
        state === "left"
          ? "look_left"
          : state === "right"
            ? "look_right"
            : state === "multi_face"
              ? "multi_face"
              : "face_missing";

      void logProctorEvent(sessionId, eventType, { warning_count: total });

      onWarningRef.current(total);

      if (total >= MAX_WARNINGS) {
        maxReachedRef.current = true;
        if (!maxWarningsFiredRef.current) {
          maxWarningsFiredRef.current = true;
          onMaxWarningsRef.current();
        }
      }
    },
    [sessionId]
  );

  // ---------------------------------------------------------------------------
  // MediaPipe lifecycle.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;

    destroyedRef.current = false;
    let faceLandmarker: import("@mediapipe/tasks-vision").FaceLandmarker | null = null;

    async function init() {
      const { FaceLandmarker, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );

      if (destroyedRef.current) return;

      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

      if (destroyedRef.current) return;

      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      if (destroyedRef.current) {
        faceLandmarker.close();
        return;
      }

      function detect() {
        if (destroyedRef.current || maxReachedRef.current) return;

        try {
          const video = videoRef.current;
          if (
            !video ||
            !faceLandmarker ||
            video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
          ) {
            return;
          }

          const now = performance.now();
          if (now - lastDetectionRef.current < DETECTION_INTERVAL_MS) return;
          lastDetectionRef.current = now;

          const results = faceLandmarker.detectForVideo(video, now);

          if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
            onStateChangeRef.current?.("missing", 0);
            handleFrameState("face_missing");
            return;
          }

          if (results.faceLandmarks.length > 1) {
            onStateChangeRef.current?.("multi_face", results.faceLandmarks.length);
            handleFrameState("multi_face");
            return;
          }

          const landmarks = results.faceLandmarks[0];
          const nose = landmarks[1];
          const leftEye = landmarks[133];
          const rightEye = landmarks[362];

          if (!nose || !leftEye || !rightEye) {
            onStateChangeRef.current?.("center", 1);
            handleFrameState("center");
            return;
          }

          const faceWidth = Math.abs(rightEye.x - leftEye.x);
          if (faceWidth < 0.01) {
            onStateChangeRef.current?.("center", 1);
            handleFrameState("center");
            return;
          }

          const faceCenterX = (leftEye.x + rightEye.x) / 2;
          const noseOffset = (nose.x - faceCenterX) / faceWidth + 0.5;

          let state: FrameState = "center";
          if (noseOffset < GAZE_LEFT_THRESHOLD) state = "left";
          else if (noseOffset > GAZE_RIGHT_THRESHOLD) state = "right";

          onStateChangeRef.current?.(state, 1);
          handleFrameState(state);
        } catch {
          // Any runtime error (invalid video element, MediaPipe internal error,
          // navigation teardown) — skip this frame silently.
        } finally {
          // Schedule the next frame only if still active.
          if (!destroyedRef.current && !maxReachedRef.current) {
            rafIdRef.current = requestAnimationFrame(detect);
          }
        }
      }

      detect();
    }

    init().catch(() => {
      // MediaPipe failed to load (offline, CDN blocked) — fail silently.
    });

    return () => {
      destroyedRef.current = true;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (faceLandmarker) {
        faceLandmarker.close();
        faceLandmarker = null;
      }
    };
  }, [enabled, sessionId, videoRef, handleFrameState]);
}
