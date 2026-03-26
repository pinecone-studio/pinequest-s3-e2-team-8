"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const signature = useMemo(() => `${html ?? ""}\u0000${text ?? ""}`, [html, text]);
  const fallbackText = useMemo(() => text ?? "", [text]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const currentSignature = `${html ?? ""}\u0000${text ?? ""}`;

    const runTypeset = () => {
      if (cancelled || !ref.current) return;

      const mathJax = window.MathJax;
      if (mathJax?.typesetPromise) {
        mathJax.typesetClear?.([ref.current]);
        void mathJax
          .typesetPromise([ref.current])
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

      if (attempts < 20) {
        attempts += 1;
        window.setTimeout(runTypeset, 250);
      }
    };

    runTypeset();

    return () => {
      cancelled = true;
    };
  }, [html, text]);

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
      {text}
    </div>
  );
}
