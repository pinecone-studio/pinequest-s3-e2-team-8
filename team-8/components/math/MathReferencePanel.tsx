"use client";

import { BookOpen, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MathReferencePanelProps {
  className?: string;
  compact?: boolean;
  onClose?: () => void;
}

function FormulaBlock({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-[8px]">
      <div className="flex h-[138px] w-full items-center justify-center">
        {children}
      </div>
      {label ? (
        <p className="text-center font-serif text-[18px] font-semibold leading-[1.05] text-[#3A3A3A]">
          {label}
        </p>
      ) : null}
    </div>
  );
}

function FormulaText({
  top,
  bottom,
}: {
  top?: string;
  bottom: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-[#4B4B4B]">
      {top ? (
        <p
          className="text-center font-serif text-[33px] leading-none italic"
          dangerouslySetInnerHTML={{ __html: top }}
        />
      ) : null}
      <p
        className="text-center font-serif text-[33px] leading-none italic"
        dangerouslySetInnerHTML={{ __html: bottom }}
      />
    </div>
  );
}

function CircleDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <circle cx="60" cy="44" r="31" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <circle cx="60" cy="44" r="3.5" fill="#6B6B6B" />
      <line x1="60" y1="44" x2="91" y2="44" stroke="#6B6B6B" strokeWidth="2" />
      <text x="78" y="36" fontSize="18" fill="#6B6B6B" fontStyle="italic">r</text>
    </svg>
  );
}

function RectangleDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <rect x="22" y="34" width="62" height="32" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <text x="50" y="29" fontSize="18" fill="#6B6B6B" fontStyle="italic">ℓ</text>
      <text x="88" y="52" fontSize="18" fill="#6B6B6B" fontStyle="italic">w</text>
    </svg>
  );
}

function TriangleAreaDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <polygon points="24,86 92,86 50,30" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <line x1="50" y1="30" x2="50" y2="86" stroke="#9B87F5" strokeWidth="2" strokeDasharray="4 4" />
      <text x="56" y="61" fontSize="18" fill="#6B6B6B" fontStyle="italic">h</text>
      <text x="53" y="101" fontSize="18" fill="#6B6B6B" fontStyle="italic">b</text>
    </svg>
  );
}

function PythagorasDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <polygon points="24,86 92,86 46,38" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <text x="30" y="62" fontSize="18" fill="#6B6B6B" fontStyle="italic">b</text>
      <text x="66" y="55" fontSize="18" fill="#6B6B6B" fontStyle="italic">c</text>
      <text x="56" y="101" fontSize="18" fill="#6B6B6B" fontStyle="italic">a</text>
    </svg>
  );
}

function ThirtySixtyDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <polygon points="16,84 88,84 88,40" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <text x="34" y="60" fontSize="18" fill="#6B6B6B" fontStyle="italic">2x</text>
      <text x="94" y="64" fontSize="18" fill="#6B6B6B" fontStyle="italic">x</text>
      <text x="46" y="100" fontSize="18" fill="#6B6B6B" fontStyle="italic">x√3</text>
      <text x="66" y="54" fontSize="14" fill="#6B6B6B">60°</text>
      <text x="34" y="76" fontSize="14" fill="#6B6B6B">30°</text>
    </svg>
  );
}

function FortyFiveDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <polygon points="20,86 84,86 20,22" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <line x1="52" y1="16" x2="52" y2="94" stroke="#56A7FF" strokeWidth="2" strokeDasharray="4 4" />
      <text x="4" y="57" fontSize="18" fill="#6B6B6B" fontStyle="italic">s</text>
      <text x="86" y="58" fontSize="18" fill="#6B6B6B" fontStyle="italic">s√2</text>
      <text x="54" y="102" fontSize="18" fill="#6B6B6B" fontStyle="italic">s</text>
      <text x="8" y="42" fontSize="14" fill="#6B6B6B">45°</text>
      <text x="57" y="72" fontSize="14" fill="#6B6B6B">45°</text>
    </svg>
  );
}

function PrismDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <polygon points="24,46 62,46 62,78 24,78" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <polygon points="62,46 82,34 82,66 62,78" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <polygon points="24,46 44,34 82,34" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <text x="42" y="98" fontSize="18" fill="#6B6B6B" fontStyle="italic">ℓ</text>
      <text x="84" y="79" fontSize="18" fill="#6B6B6B" fontStyle="italic">w</text>
      <text x="88" y="48" fontSize="18" fill="#6B6B6B" fontStyle="italic">h</text>
    </svg>
  );
}

function CylinderDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <ellipse cx="54" cy="36" rx="25" ry="10" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <path d="M29 36v40c0 5.5 11.2 10 25 10s25-4.5 25-10V36" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <ellipse cx="54" cy="76" rx="25" ry="10" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <line x1="54" y1="36" x2="72" y2="36" stroke="#6B6B6B" strokeWidth="2" />
      <text x="61" y="30" fontSize="18" fill="#6B6B6B" fontStyle="italic">r</text>
      <text x="86" y="59" fontSize="18" fill="#6B6B6B" fontStyle="italic">h</text>
    </svg>
  );
}

function SphereDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <circle cx="54" cy="54" r="31" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <ellipse cx="54" cy="54" rx="31" ry="10" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <line x1="54" y1="54" x2="79" y2="54" stroke="#6B6B6B" strokeWidth="2" />
      <text x="65" y="48" fontSize="18" fill="#6B6B6B" fontStyle="italic">r</text>
    </svg>
  );
}

function ConeDiagram() {
  return (
    <svg viewBox="0 0 120 120" className="h-[122px] w-[122px]">
      <ellipse cx="58" cy="84" rx="28" ry="8" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <path d="M58 24 30 84M58 24l28 60" fill="none" stroke="#6B6B6B" strokeWidth="2" />
      <line x1="58" y1="24" x2="58" y2="84" stroke="#6B6B6B" strokeWidth="2" />
      <line x1="58" y1="68" x2="74" y2="68" stroke="#6B6B6B" strokeWidth="2" />
      <text x="64" y="57" fontSize="18" fill="#6B6B6B" fontStyle="italic">h</text>
      <text x="66" y="81" fontSize="18" fill="#6B6B6B" fontStyle="italic">r</text>
    </svg>
  );
}

export default function MathReferencePanel({
  className,
  compact = false,
  onClose,
}: MathReferencePanelProps) {
  return (
    <aside
      className={cn("flex flex-col overflow-hidden bg-white", className)}
      style={{
        width: compact ? "100%" : "557.27px",
        height: compact ? "100%" : "981px",
      }}
    >
      <div
        className="relative shrink-0 bg-[#7F32F5]"
        style={{ height: compact ? "40px" : "38.69px" }}
      >
        <div className="absolute left-[11.86px] top-[9.36px] flex items-center gap-[21.84px] text-white">
          <BookOpen className="h-[19.97px] w-[19.97px]" strokeWidth={1.8} />
          <span className="text-[14.98px] leading-[18px] font-normal text-white">
            Лавлах
          </span>
        </div>

        <div className="absolute right-[9.3px] top-[9.36px] flex items-center gap-[49.3px]">
          <button
            type="button"
            className="flex h-[19.97px] w-[19.97px] items-center justify-center text-white"
            aria-label="Томруулах"
          >
            <Maximize2 className="h-[19.97px] w-[19.97px]" strokeWidth={1.8} />
          </button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-[19.97px] w-[19.97px] rounded-none p-0 text-white hover:bg-transparent hover:text-white"
              onClick={onClose}
            >
              <X className="h-[19.97px] w-[19.97px]" strokeWidth={1.8} />
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto border-l border-[#66A3FF] bg-white px-[26px] py-[18px]"
        style={{ height: compact ? "calc(100% - 40px)" : "942.31px" }}
      >
        <div className="mx-auto grid max-w-[430px] grid-cols-2 gap-x-[52px] gap-y-[26px] pt-[6px]">
          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <CircleDiagram />
              <FormulaText top={"A = πr²"} bottom={"C = 2πr"} />
            </div>
          </FormulaBlock>

          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <RectangleDiagram />
              <FormulaText bottom={"A = ℓw"} />
            </div>
          </FormulaBlock>

          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <TriangleAreaDiagram />
              <FormulaText bottom={"A = 1⁄2 bh"} />
            </div>
          </FormulaBlock>

          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <PythagorasDiagram />
              <FormulaText bottom={"c² = a² + b²"} />
            </div>
          </FormulaBlock>

          <FormulaBlock label="Special Right Triangles">
            <ThirtySixtyDiagram />
          </FormulaBlock>

          <FormulaBlock>
            <FortyFiveDiagram />
          </FormulaBlock>

          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <PrismDiagram />
              <FormulaText bottom={"V = ℓwh"} />
            </div>
          </FormulaBlock>

          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <CylinderDiagram />
              <FormulaText bottom={"V = πr²h"} />
            </div>
          </FormulaBlock>

          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <SphereDiagram />
              <FormulaText bottom={"V = 4⁄3 πr³"} />
            </div>
          </FormulaBlock>

          <FormulaBlock>
            <div className="flex flex-col items-center gap-1">
              <ConeDiagram />
              <FormulaText bottom={"V = 1⁄3 πr²h"} />
            </div>
          </FormulaBlock>
        </div>
      </div>
    </aside>
  );
}
