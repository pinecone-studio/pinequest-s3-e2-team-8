"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuestionPassage } from "@/lib/question/actions";
import type { QuestionPassage } from "@/types";
import MathContent from "@/components/math/MathContent";
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
  const [title, setTitle] = useState(passage.title ?? "");
  const [content, setContent] = useState(passage.content);
  const [contentHtml, setContentHtml] = useState(passage.content_html ?? "");
  const [imageUrl, setImageUrl] = useState(passage.image_url ?? "");
  const [isFormulaToolOpen, setIsFormulaToolOpen] = useState(false);
  const [activeFormulaTarget, setActiveFormulaTarget] = useState({
    id: `passage-content-${passage.id}`,
    label: "Эх материалын текст",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setTitle(passage.title ?? "");
      setContent(passage.content);
      setContentHtml(passage.content_html ?? "");
      setImageUrl(passage.image_url ?? "");
    } else {
      setError(null);
      setSaving(false);
      setIsFormulaToolOpen(false);
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
          <DialogTitle>Эх материал засах</DialogTitle>
          <DialogDescription>
            Нэг зураг, нэг текст, хүснэгт эсвэл бодлогын өгөгдлөө шинэчилнэ.
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
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Жишээ: Унших эх 1"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`passage-content-${passage.id}`}>
                Эх материалын текст
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsFormulaToolOpen((prev) => !prev)}
              >
                Томьёоны самбар
                <span className="ml-2 text-xs text-muted-foreground">
                  {isFormulaToolOpen ? "Хаах" : "Нээх"}
                </span>
              </Button>
            </div>
            <Textarea
              id={`passage-content-${passage.id}`}
              name="content"
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onFocus={() =>
                setActiveFormulaTarget({
                  id: `passage-content-${passage.id}`,
                  label: "Эх материалын текст",
                })
              }
              placeholder="Нийтлэг эх, бодлогын нөхцөл, тайлбар..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`passage-html-${passage.id}`}>
              Форматтай контент / хүснэгт (HTML)
            </Label>
            <Textarea
              id={`passage-html-${passage.id}`}
              name="content_html"
              rows={4}
              value={contentHtml}
              onChange={(event) => setContentHtml(event.target.value)}
              onFocus={() =>
                setActiveFormulaTarget({
                  id: `passage-html-${passage.id}`,
                  label: "HTML контент",
                })
              }
              placeholder="<p>Formula, хүснэгт, онцгой формат, холбоос...</p>"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`passage-image-${passage.id}`}>Зургийн URL</Label>
            <Input
              id={`passage-image-${passage.id}`}
              name="image_url"
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://example.com/passage-image.png"
            />
          </div>

          {isFormulaToolOpen && (
            <LatexShortcutPanel
              targetId={activeFormulaTarget.id}
              targetLabel={activeFormulaTarget.label}
              minimal
            />
          )}

          {(content.trim() || contentHtml.trim() || imageUrl.trim()) && (
            <div className="space-y-3 rounded-xl border bg-muted/10 p-4">
              <p className="text-sm font-medium">Урьдчилан харах</p>
              {title.trim() && <p className="font-medium">{title.trim()}</p>}
              <MathContent
                html={contentHtml || null}
                text={content || null}
                className="prose prose-sm max-w-none text-foreground"
              />
              {imageUrl.trim() && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Эх материалын зураг"
                  className="max-h-56 rounded-lg border"
                />
              )}
            </div>
          )}

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
