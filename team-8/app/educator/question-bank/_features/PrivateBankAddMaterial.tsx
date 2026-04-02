"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  ImagePlus,
  Loader2,
  Upload,
} from "lucide-react";
import {
  createPrivateBankEntryFromImage,
  createPrivateBankEntryFromText,
  extractPrivateBankTextFromFile,
} from "@/lib/question/actions";
import type { Subject } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PrivateBankAddMaterialProps {
  subjects: Subject[];
  viewerIsAdmin?: boolean;
}

export default function PrivateBankAddMaterial({
  subjects,
  viewerIsAdmin = false,
}: PrivateBankAddMaterialProps) {
  const router = useRouter();
  const [textOpen, setTextOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState(false);
  const [pendingText, setPendingText] = useState(false);
  const [errorImage, setErrorImage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const [fileImportPending, setFileImportPending] = useState(false);
  const materialFileInputRef = useRef<HTMLInputElement>(null);

  const sortedSubjects = [...subjects].sort((a, b) =>
    a.name.localeCompare(b.name, "mn"),
  );

  const subjectRequired = !viewerIsAdmin && sortedSubjects.length > 0;
  const subjectDisabled = sortedSubjects.length === 0 && !viewerIsAdmin;
  const submitDisabled = !viewerIsAdmin && sortedSubjects.length === 0;

  async function handleReadMaterialFile() {
    setFileImportError(null);
    const input = materialFileInputRef.current;
    const picked = input?.files?.[0];
    if (!picked) {
      setFileImportError("Эхлээд тестийн материалын файлаа сонгоно уу.");
      return;
    }
    setFileImportPending(true);
    const formData = new FormData();
    formData.set("file", picked);
    const result = await extractPrivateBankTextFromFile(formData);
    setFileImportPending(false);

    if (result && "error" in result && result.error) {
      setFileImportError(result.error);
      return;
    }
    if (result && "success" in result && result.success && "text" in result) {
      setTextContent(result.text);
    }
  }

  async function handleImageSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorImage(null);
    const form = event.currentTarget;
    setPendingImage(true);
    const formData = new FormData(form);
    const result = await createPrivateBankEntryFromImage(formData);
    setPendingImage(false);

    if (result && "error" in result && result.error) {
      setErrorImage(result.error);
      return;
    }

    form.reset();
    setImageOpen(false);
    setErrorImage(null);
    router.refresh();
  }

  async function handleTextSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);
    if (!textContent.trim()) {
      setErrorText(
        "Материалын текстээ бичнэ эсвэл тестийн файлаас уншуулна уу.",
      );
      return;
    }
    const form = event.currentTarget;
    setPendingText(true);
    const formData = new FormData(form);
    formData.set("content", textContent.trim());
    const result = await createPrivateBankEntryFromText(formData);
    setPendingText(false);

    if (result && "error" in result && result.error) {
      setErrorText(result.error);
      return;
    }

    form.reset();
    setTextContent("");
    setTextOpen(false);
    setErrorText(null);
    router.refresh();
  }

  return (
    <div className="ml-auto flex shrink-0 items-center justify-end ">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex w-full justify-end">
            <Button
              type="button"
              className="h-9 gap-2 rounded-full bg-[#3B6CB0] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#355FA0]"
            >
              <span>Шинэ материал оруулах</span>
              <ChevronDown className="h-4 w-4 opacity-90" aria-hidden />
            </Button>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => {
              setTextContent("");
              setFileImportError(null);
              setErrorText(null);
              setTextOpen(true);
            }}
          >
            <FileText className="h-4 w-4" />
            Текстээр
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => {
              setErrorImage(null);
              setImageOpen(true);
            }}
          >
            <ImagePlus className="h-4 w-4" />
            Зурагаар
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={textOpen}
        onOpenChange={(open) => {
          if (open) {
            setTextContent("");
            setFileImportError(null);
            setErrorText(null);
          }
          setTextOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[min(90vh,640px)] gap-0 overflow-y-auto sm:max-w-xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Текстээр материал нэмэх</DialogTitle>
            <DialogDescription>
              Хувийн санд хадгална. Сонголттой асуулт бол хадгалсны дараа
              жагсаалтаас <strong>Засах</strong> дарна уу.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleTextSubmit}
            className="space-y-4 border-t bg-background/50 px-1 py-4"
          >
            <div className="space-y-2">
              <Label htmlFor="pb-t-batch">Багц нэр (заавал биш)</Label>
              <Input
                id="pb-t-batch"
                name="batch_label"
                placeholder="Жишээ: ЭЕШ 2023 · Хувилбар A"
              />
              <p className="text-xs text-muted-foreground">
                Нэг дор оруулсан материалуудаа дараа нь багцаар нь шүүж/устгахад
                тусална.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pb-t-subject">
                  Хичээл {subjectRequired ? "*" : ""}
                </Label>
                <select
                  id="pb-t-subject"
                  name="subject_id"
                  required={subjectRequired}
                  disabled={subjectDisabled}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">
                    {viewerIsAdmin ? "— (заавал биш)" : "Сонгох"}
                  </option>
                  {sortedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {sortedSubjects.length === 0 && !viewerIsAdmin ? (
                  <p className="text-xs text-amber-700">
                    Танд хичээл оноогдоогүй байна. Админтай холбогдоно уу.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pb-t-grade">Анги (заавал биш)</Label>
                <select
                  id="pb-t-grade"
                  name="grade_level"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">—</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={String(g)}>
                      {g}-р анги
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-t-subtopic">Дэд сэдэв (заавал биш)</Label>
              <Input
                id="pb-t-subtopic"
                name="subtopic"
                placeholder="Жишээ: Функцийн уламжлал"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Тестийн материал файл оруулах
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Word (.docx), Excel (.xlsx, .xls), текст (.txt) эсвэл .csv.
                  Файлаа сонгоод <strong>Унших</strong> дарвал доорх талбарт
                  оруулна — гараар засаад хадгална.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  ref={materialFileInputRef}
                  type="file"
                  accept=".txt,.csv,.docx,.xlsx,.xls,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,text/csv,text/plain"
                  className="cursor-pointer sm:min-w-0 sm:flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 gap-2"
                  disabled={fileImportPending}
                  onClick={() => void handleReadMaterialFile()}
                >
                  {fileImportPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden />
                  )}
                  Унших
                </Button>
              </div>
              {fileImportError ? (
                <p className="text-xs text-red-600">{fileImportError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-t-content">Материалын текст *</Label>
              <Textarea
                id="pb-t-content"
                rows={8}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Энд бичих эсвэл дээрх файлаас уншуулна. Жишээ: 1. Дараах..."
                className="min-h-[140px] resize-y"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-t-html">HTML (заавал биш)</Label>
              <Textarea
                id="pb-t-html"
                name="content_html"
                rows={3}
                placeholder="LaTeX/томьёо — хоосон бол зөвхөн текст харуулна."
                className="resize-y font-mono text-sm"
              />
            </div>

            {errorText ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorText}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTextOpen(false)}
                disabled={pendingText}
              >
                Болих
              </Button>
              <Button type="submit" disabled={pendingText || submitDisabled}>
                {pendingText ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Хадгалж байна...
                  </>
                ) : (
                  "Хадгалах"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={imageOpen}
        onOpenChange={(open) => {
          setImageOpen(open);
          if (!open) setErrorImage(null);
        }}
      >
        <DialogContent
          className="max-h-[min(90vh,640px)] gap-0 overflow-y-auto sm:max-w-xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Зурагаар материал нэмэх</DialogTitle>
            <DialogDescription>
              JPG / PNG / WEBP / GIF, 5MB хүртэл. Хүссэн бол AI-аар текст
              уншуулна. Дараа нь <strong>Засах</strong> товчоор төрөл
              тохируулна.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleImageSubmit}
            className="space-y-4 border-t bg-background/50 px-1 py-4"
          >
            <div className="space-y-2">
              <Label htmlFor="pb-img-batch">Багц нэр (заавал биш)</Label>
              <Input
                id="pb-img-batch"
                name="batch_label"
                placeholder="Жишээ: 10-р анги · Сорил 2"
              />
              <p className="text-xs text-muted-foreground">
                Олон бодлого салгаж хадгалсан ч нэг багцад байлгах нэр.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pb-img-subject">
                  Хичээл {subjectRequired ? "*" : ""}
                </Label>
                <select
                  id="pb-img-subject"
                  name="subject_id"
                  required={subjectRequired}
                  disabled={sortedSubjects.length === 0 && !viewerIsAdmin}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">
                    {viewerIsAdmin ? "— (заавал биш)" : "Сонгох"}
                  </option>
                  {sortedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {sortedSubjects.length === 0 && !viewerIsAdmin ? (
                  <p className="text-xs text-amber-700">
                    Танд хичээл оноогдоогүй байна. Админтай холбогдоно уу.
                  </p>
                ) : null}
                {sortedSubjects.length === 0 && viewerIsAdmin ? (
                  <p className="text-xs text-muted-foreground">
                    Хичээл сонголгүй хадгалж болно.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pb-img-grade">Анги (заавал биш)</Label>
                <select
                  id="pb-img-grade"
                  name="grade_level"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">—</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={String(g)}>
                      {g}-р анги
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-img-subtopic">Дэд сэдэв (заавал биш)</Label>
              <Input
                id="pb-img-subtopic"
                name="subtopic"
                placeholder="Жишээ: Квадрат тэгшитгэл"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-image">Зураг *</Label>
              <Input
                id="pb-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                required
                className="cursor-pointer"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-dashed p-3 text-sm">
              <input
                type="checkbox"
                name="use_ai"
                defaultChecked
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="font-medium text-foreground">
                  Зургийн текстийг AI-аар уншуулах
                </span>
                <span className="block text-muted-foreground">
                  Идэвхгүй бол зургийг л холбоно; текстийг &quot;Засах&quot;-аар
                  нэмнэ.
                </span>
              </span>
            </label>

            {errorImage ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorImage}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setImageOpen(false)}
                disabled={pendingImage}
              >
                Болих
              </Button>
              <Button type="submit" disabled={pendingImage || submitDisabled}>
                {pendingImage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Хадгалж байна...
                  </>
                ) : (
                  "Хадгалах"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
