"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const runTypeset = () => {
      if (cancelled || !ref.current) return;

      const mathJax = window.MathJax;
      if (mathJax?.typesetPromise) {
        mathJax.typesetClear?.([ref.current]);
        void mathJax.typesetPromise([ref.current]);
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
