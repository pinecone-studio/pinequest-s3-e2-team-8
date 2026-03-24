"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuestionPassage } from "@/lib/question/actions";
import type { QuestionPassage } from "@/types";
import LatexShortcutPanel from "@/components/math/LatexShortcutPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditPassageDialogProps {
  examId: string;
  passage: QuestionPassage;
}

export default function EditPassageDialog({
  examId,
  passage,
}: EditPassageDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setError(null);
      setSaving(false);
    }

    setOpen(nextOpen);
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    const result = await updateQuestionPassage(examId, passage.id, formData);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Засах
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Passage block засах</DialogTitle>
          <DialogDescription>
            Унших эх, тайлбар, зураг эсвэл formula context-оо шинэчилнэ.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" action={handleSubmit}>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`passage-title-${passage.id}`}>Гарчиг</Label>
            <Input
              id={`passage-title-${passage.id}`}
              name="title"
              defaultValue={passage.title ?? ""}
              placeholder="Жишээ: Унших эх 1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`passage-content-${passage.id}`}>Passage текст</Label>
            <Textarea
              id={`passage-content-${passage.id}`}
              name="content"
              rows={4}
              defaultValue={passage.content}
              placeholder="Нийтлэг эх, бодлогын нөхцөл, тайлбар..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`passage-html-${passage.id}`}>Форматтай контент (HTML)</Label>
            <Textarea
              id={`passage-html-${passage.id}`}
              name="content_html"
              rows={4}
              defaultValue={passage.content_html ?? ""}
              placeholder="<p>Formula, онцгой формат, холбоос...</p>"
            />
            <LatexShortcutPanel targetId={`passage-html-${passage.id}`} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`passage-image-${passage.id}`}>Зургийн URL</Label>
            <Input
              id={`passage-image-${passage.id}`}
              name="image_url"
              type="url"
              defaultValue={passage.image_url ?? ""}
              placeholder="https://example.com/passage-image.png"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Хадгалж байна..." : "Өөрчлөлт хадгалах"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
