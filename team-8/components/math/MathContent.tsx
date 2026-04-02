"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeMathText } from "@/components/math/math-text";

declare global {
  interface Window {
    MathJax?: {
      typesetClear?: (elements?: Element[]) => void;
      typesetPromise?: (elements?: Element[]) => Promise<void>;
    };
  }
}

interface MathContentProps {
  html?: string | null;
  text?: string | null;
  className?: string;
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hasMathRenderError(element: Element) {
  return Boolean(element.querySelector("mjx-merror, [data-mjx-error]"));
}

export default function MathContent({
  html,
  text,
  className,
}: MathContentProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [typesetError, setTypesetError] = useState<{
    signature: string;
    message: string;
  } | null>(null);
  const normalizedText = useMemo(() => normalizeMathText(text), [text]);
  const signature = useMemo(
    () => `${html ?? ""}\u0000${normalizedText}`,
    [html, normalizedText]
  );
  const fallbackText = useMemo(() => {
    if (normalizedText) return normalizedText;
    if (html) return stripHtmlTags(html);
    return "";
  }, [html, normalizedText]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const currentSignature = `${html ?? ""}\u0000${normalizedText}`;

    const runTypeset = () => {
      if (cancelled || !ref.current) return;

      const mathJax = window.MathJax;
      if (mathJax?.typesetPromise) {
        mathJax.typesetClear?.([ref.current]);
        void mathJax
          .typesetPromise([ref.current])
          .then(() => {
            if (cancelled || !ref.current) return;

            if (hasMathRenderError(ref.current)) {
              setTypesetError({
                signature: currentSignature,
                message: "Math render error",
              });
              return;
            }

            setTypesetError((currentError) =>
              currentError?.signature === currentSignature ? null : currentError
            );
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            const message =
              err instanceof Error
                ? err.message
                : typeof err === "string"
                  ? err
                  : "Math typeset error";
            setTypesetError({ signature: currentSignature, message });
          });
        return;
      }

      if (attempts < 60) {
        attempts += 1;
        window.setTimeout(runTypeset, 250);
      }
    };

    runTypeset();

    return () => {
      cancelled = true;
    };
  }, [html, normalizedText]);

  if (typesetError?.signature === signature) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Томьёоны формат алдаатай байна. Текстээр харууллаа.
        </div>
        <div className={className}>{fallbackText}</div>
      </div>
    );
  }

  if (html) {
    return (
      <div
        ref={ref}
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div ref={ref} className={className}>
      {normalizedText}
    </div>
  );
}
