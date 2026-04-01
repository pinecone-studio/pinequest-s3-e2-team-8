"use client";

import { useState } from "react";
import { X } from "lucide-react";
import MathContent from "@/components/math/MathContent";
import { formulaGroups } from "@/components/math/LatexShortcutPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MathReferencePanelProps {
  className?: string;
  compact?: boolean;
  onClose?: () => void;
}

export default function MathReferencePanel({
  className,
  compact = false,
  onClose,
}: MathReferencePanelProps) {
  const [activeGroupId, setActiveGroupId] = useState<string>("geometry");
  const activeGroup =
    formulaGroups.find((group) => group.id === activeGroupId) ?? formulaGroups[0];

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[24px] border border-[#DCC7FF] bg-white shadow-[0_20px_45px_rgba(127,50,245,0.12)]",
        className
      )}
    >
      <div className="flex items-center justify-between bg-[#C59CFC] px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Лавлах</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
            Математик
          </span>
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-white hover:bg-white/15 hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="border-b border-[#EADFFF] bg-[#FAF7FF] px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {formulaGroups.map((group) => {
            const active = group.id === activeGroupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroupId(group.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-[#C59CFC] text-white shadow-sm"
                    : "bg-white text-[#6B6B6B] hover:bg-[#F2EAFF]"
                )}
              >
                {group.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-[#6B6B6B]">
          {activeGroup.description}
        </p>
      </div>

      <div className="grid flex-1 gap-3 overflow-y-auto p-4">
        {activeGroup.items.map((item) => (
          <div
            key={item.id}
            className="rounded-[18px] border border-[#EFE7FF] bg-[#FCFBFF] p-4"
          >
            <div className="flex min-h-20 items-center justify-center rounded-2xl border border-[#E9DEFF] bg-white px-3 py-4">
              <MathContent
                text={item.latex}
                className={cn(
                  "max-w-none text-[#1F1F1F]",
                  compact ? "prose prose-sm" : "prose prose-base"
                )}
              />
            </div>
            <p className="mt-3 text-sm font-medium text-[#2C2C2C]">{item.label}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
