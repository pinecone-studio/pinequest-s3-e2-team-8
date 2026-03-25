"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">Алдаа гарлаа</h2>
        <p className="text-sm text-muted-foreground">
          Хянах самбарын мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.
        </p>
      </div>
      <Button onClick={reset}>Дахин оролдох</Button>
    </div>
  );
}
