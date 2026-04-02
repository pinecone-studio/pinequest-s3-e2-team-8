"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ComponentProps } from "react";
import {
  ChevronDown,
  FileText,
  ImagePlus,
  Loader2,
  XIcon,
} from "lucide-react";
import {
  createPrivateBankEntryFromImage,
  createPrivateBankEntryFromText,
} from "@/lib/question/actions";
import type { Subject } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import { cn } from "@/lib/utils";

interface PrivateBankAddMaterialProps {
  subjects: Subject[];
  viewerIsAdmin?: boolean;
}

const textMaterialSelectClass =
  "h-[39px] w-full cursor-pointer appearance-none rounded-lg border border-border bg-transparent px-3 pr-9 text-sm text-foreground shadow-none outline-none focus-visible:ring-2 focus-visible:ring-[#3B6CB0]/25 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent";

function TextMaterialSelect({
  id,
  name,
  className,
  children,
  ...props
}: Omit<ComponentProps<"select">, "className"> & {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <div className="relative w-full">
      <select
        id={id}
        name={name}
        className={cn(textMaterialSelectClass, className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
        strokeWidth={2}
        aria-hidden
      />
    </div>
  );
}

export default function PrivateBankAddMaterial({
  subjects,
  viewerIsAdmin = false,
}: PrivateBankAddMaterialProps) {
  const router = useRouter();
  const [textOpen, setTextOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [imageFileLabel, setImageFileLabel] = useState<string | null>(null);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [pendingImage, setPendingImage] = useState(false);
  const [pendingText, setPendingText] = useState(false);
  const [errorImage, setErrorImage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [questionContent, setQuestionContent] = useState("");
  const [mcOptions, setMcOptions] = useState(["", "", "", ""]);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [textQuestionType, setTextQuestionType] = useState<
    "multiple_choice" | "essay"
  >("multiple_choice");

  const sortedSubjects = [...subjects].sort((a, b) =>
    a.name.localeCompare(b.name, "mn"),
  );

  const subjectRequired = !viewerIsAdmin && sortedSubjects.length > 0;
  const subjectDisabled = sortedSubjects.length === 0 && !viewerIsAdmin;
  const submitDisabled = !viewerIsAdmin && sortedSubjects.length === 0;

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
    if (!questionContent.trim()) {
      setErrorText("Асуултаа оруулна уу.");
      return;
    }
    const form = event.currentTarget;
    const type = textQuestionType;

    const formData = new FormData(form);
    formData.set("content", questionContent.trim());
    formData.set("question_type", type);

    if (type === "multiple_choice") {
      const slots = mcOptions.map((o) => o.trim());
      const opts = slots.filter(Boolean);
      if (opts.length < 2) {
        setErrorText("Дор хаяж 2 хариулт бөглөнө үү.");
        return;
      }
      const correct = slots[correctOptionIndex]?.trim();
      if (!correct || !opts.includes(correct)) {
        setErrorText("Зөв хариултаа бөглөж, түүнийгээ радио товчоор сонгоно уу.");
        return;
      }
      formData.set("options_json", JSON.stringify(opts));
      formData.set("correct_answer", correct);
    }

    setPendingText(true);
    const result = await createPrivateBankEntryFromText(formData);
    setPendingText(false);

    if (result && "error" in result && result.error) {
      setErrorText(result.error);
      return;
    }

    form.reset();
    setQuestionContent("");
    setMcOptions(["", "", "", ""]);
    setCorrectOptionIndex(0);
    setTextQuestionType("multiple_choice");
    setTextOpen(false);
    setErrorText(null);
    router.refresh();
  }

  const textFieldClass =
    "h-[39px] w-full rounded-lg border border-border bg-[#f4f4f5] px-3 text-sm text-foreground shadow-none ring-0 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-[#3B6CB0]/25";
  const textLabelClass =
    "text-xs font-medium leading-snug text-[#364153] [font-family:Inter,ui-sans-serif,system-ui,sans-serif]";

  return (
    <div className="flex h-[45px] shrink-0 items-center max-sm:ml-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            className="box-border flex h-[39px] w-[243px] shrink-0 items-center justify-center gap-[10px] rounded-[8px] bg-[#5199F6] px-[16px] py-[10px] text-sm font-semibold text-white shadow-sm transition hover:bg-[#3d87f0]"
          >
            <span>Шинэ материал оруулах</span>
            <ChevronDown className="h-4 w-4 opacity-90" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="flex h-[69px] w-[167px] min-w-[167px] max-w-[167px] flex-col divide-y divide-border overflow-hidden p-0"
        >
          <DropdownMenuItem
            className="min-h-0 flex-1 gap-2 rounded-none px-3 py-0"
            onSelect={() => {
              setErrorImage(null);
              setImageOpen(true);
            }}
          >
            <ImagePlus className="h-4 w-4" />
            Зурагаар
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-0 flex-1 gap-2 rounded-none px-3 py-0"
            onSelect={() => {
              setQuestionContent("");
              setMcOptions(["", "", "", ""]);
              setCorrectOptionIndex(0);
              setTextQuestionType("multiple_choice");
              setErrorText(null);
              setTextOpen(true);
            }}
          >
            <FileText className="h-4 w-4" />
            Текстээр
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={textOpen}
        onOpenChange={(open) => {
          if (open) {
            setQuestionContent("");
            setMcOptions(["", "", "", ""]);
            setCorrectOptionIndex(0);
            setTextQuestionType("multiple_choice");
            setErrorText(null);
          }
          setTextOpen(open);
        }}
      >
        <DialogContent
          className="flex h-[min(716px,90vh)] w-[min(430px,calc(100vw-2rem))] max-w-[430px] flex-col gap-0 overflow-hidden rounded-[8px] border border-border bg-white p-0 shadow-lg"
          showCloseButton={false}
        >
          <div className="shrink-0 bg-white px-[16px] pt-[16px] pb-0">
            <div className="mx-auto box-border flex h-[56.74px] w-full max-w-[398px] min-w-0 items-center justify-between rounded-[8px] bg-[#f4f4f5] px-[16px] py-0">
              <DialogTitle
                className="m-0 h-[19px] w-[205px] max-w-[205px] shrink-0 truncate text-[16px] leading-[19px] font-medium text-[#0A0A0A]"
                style={{
                  fontFamily:
                    'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
                }}
              >
                Текстээр материал нэмэх
              </DialogTitle>
              <DialogClose asChild>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#0A0A0A] transition-colors hover:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6CB0]/30"
                  aria-label="Хаах"
                >
                  <XIcon className="size-4" strokeWidth={2} aria-hidden />
                </button>
              </DialogClose>
            </div>
          </div>
          <form
            onSubmit={handleTextSubmit}
            className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[16px] pt-[16px] pb-[2px]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="pb-t-batch" className={textLabelClass}>
                Багцын нэр (Заавал биш)
              </Label>
              <Input
                id="pb-t-batch"
                name="batch_label"
                placeholder="Жишээ: ЭЕШ 2026"
                className={textFieldClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pb-t-subject" className={textLabelClass}>
                  Хичээл{subjectRequired ? " *" : ""}
                </Label>
                <TextMaterialSelect
                  id="pb-t-subject"
                  name="subject_id"
                  required={subjectRequired}
                  disabled={subjectDisabled}
                  defaultValue=""
                >
                  <option value="">
                    {viewerIsAdmin ? "Сонгох (заавал биш)" : "Сонгох"}
                  </option>
                  {sortedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </TextMaterialSelect>
                {sortedSubjects.length === 0 && !viewerIsAdmin ? (
                  <p className="text-xs text-amber-700">
                    Танд хичээл оноогдоогүй байна. Админтай холбогдоно уу.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pb-t-type" className={textLabelClass}>
                  Төрөл
                </Label>
                <TextMaterialSelect
                  id="pb-t-type"
                  name="question_type"
                  value={textQuestionType}
                  onChange={(e) =>
                    setTextQuestionType(
                      e.target.value === "essay"
                        ? "essay"
                        : "multiple_choice",
                    )
                  }
                >
                  <option value="multiple_choice">Олон сонголттой</option>
                  <option value="essay">Нээлттэй</option>
                </TextMaterialSelect>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pb-t-difficulty" className={textLabelClass}>
                  Түвшин
                </Label>
                <TextMaterialSelect
                  id="pb-t-difficulty"
                  name="difficulty_level"
                  defaultValue="2"
                >
                  <option value="1">Амархан</option>
                  <option value="2">Дунд</option>
                  <option value="3">Хүнд</option>
                </TextMaterialSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pb-t-points" className={textLabelClass}>
                  Оноо
                </Label>
                <TextMaterialSelect
                  id="pb-t-points"
                  name="points"
                  defaultValue="1"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                </TextMaterialSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pb-t-content" className={textLabelClass}>
                Асуултаа бичнэ үү.
              </Label>
              <Input
                id="pb-t-content"
                value={questionContent}
                onChange={(e) => setQuestionContent(e.target.value)}
                placeholder="Жишээ: Монголын эзэнт гүрэн"
                className={textFieldClass}
                autoComplete="off"
              />
            </div>

            {textQuestionType === "multiple_choice" ? (
              <div className="space-y-2">
                <p className={cn(textLabelClass, "block")}>
                  Хариултын тохиргоо
                </p>
                <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="mc-correct-visual"
                        checked={correctOptionIndex === i}
                        onChange={() => setCorrectOptionIndex(i)}
                        className="size-4 shrink-0 border-slate-300 accent-[#5199F6]"
                        aria-label={`Зөв хариулт: ${i + 1}`}
                      />
                      <Input
                        value={mcOptions[i]}
                        onChange={(e) => {
                          const next = [...mcOptions];
                          next[i] = e.target.value;
                          setMcOptions(next);
                        }}
                        placeholder={`Хариулт ${i + 1}`}
                        className={cn(textFieldClass, "min-w-0 flex-1")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {errorText ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorText}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={pendingText || submitDisabled}
              className="h-11 w-full rounded-lg bg-[#5199F6] text-sm font-semibold text-white shadow-sm hover:bg-[#3d87f0] disabled:opacity-60"
            >
              {pendingText ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Хадгалж байна...
                </>
              ) : (
                "Хадгалах"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={imageOpen}
        onOpenChange={(open) => {
          setImageOpen(open);
          if (!open) {
            setErrorImage(null);
            setImageFileLabel(null);
            setImageDropActive(false);
          }
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,720px)] w-[min(430px,calc(100vw-2rem))] max-w-[430px] flex-col gap-0 overflow-hidden rounded-[8px] border border-[#E5E7EB] bg-white p-0 shadow-lg"
          showCloseButton={false}
        >
          <div className="shrink-0 bg-white px-[16px] pt-[16px] pb-0">
            <div className="flex h-14 w-full items-center justify-between rounded-[8px] bg-[#F9FAFB] px-[16px]">
              <DialogTitle
                className="m-0 text-base font-semibold text-[#111827]"
                style={{
                  fontFamily:
                    'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
                }}
              >
                Зурагаар материал нэмэх
              </DialogTitle>
              <DialogClose asChild>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#374151] transition-colors hover:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6CB0]/30"
                  aria-label="Хаах"
                >
                  <XIcon className="size-4" strokeWidth={2} aria-hidden />
                </button>
              </DialogClose>
            </div>
          </div>
          <form
            onSubmit={handleImageSubmit}
            className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[16px] py-[16px]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="pb-img-batch" className={textLabelClass}>
                Багцын нэр (Заавал биш)
              </Label>
              <Input
                id="pb-img-batch"
                name="batch_label"
                placeholder="Жишээ: ЭЕШ 2026"
                className={textFieldClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pb-img-subject" className={textLabelClass}>
                  Хичээл{subjectRequired ? " *" : ""}
                </Label>
                <TextMaterialSelect
                  id="pb-img-subject"
                  name="subject_id"
                  required={subjectRequired}
                  disabled={subjectDisabled}
                  defaultValue=""
                  className="bg-white"
                >
                  <option value="">
                    {viewerIsAdmin ? "Сонгох (заавал биш)" : "Сонгох"}
                  </option>
                  {sortedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </TextMaterialSelect>
                {sortedSubjects.length === 0 && !viewerIsAdmin ? (
                  <p className="text-xs text-amber-700">
                    Танд хичээл оноогдоогүй байна. Админтай холбогдоно уу.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pb-img-type-visual" className={textLabelClass}>
                  Төрөл
                </Label>
                <TextMaterialSelect
                  id="pb-img-type-visual"
                  name="pb_image_type_ui"
                  disabled
                  value="image"
                  onChange={() => {}}
                  className="cursor-not-allowed bg-white opacity-100"
                  aria-readonly
                >
                  <option value="image">Зурагт суурилсан</option>
                </TextMaterialSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pb-image" className={textLabelClass}>
                Зураг
              </Label>
              <input
                ref={imageFileInputRef}
                id="pb-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                required
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setImageFileLabel(f?.name ?? null);
                }}
              />
              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setImageDropActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setImageDropActive(false);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setImageDropActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  const ok =
                    file.type === "image/jpeg" ||
                    file.type === "image/png" ||
                    file.type === "image/webp" ||
                    file.type === "image/gif";
                  if (!ok) return;
                  const input = imageFileInputRef.current;
                  if (!input) return;
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  input.files = dt.files;
                  setImageFileLabel(file.name);
                }}
                className={cn(
                  "mx-auto flex h-[192px] w-[396px] max-w-full flex-col items-center justify-center gap-[8px] rounded-[8px] border-2 border-dashed p-[16px] transition-colors",
                  imageDropActive
                    ? "border-[#4A80C4] bg-[#F0F6FC]"
                    : "border-[#93C5FD] bg-white",
                )}
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-[#DBEAFE] text-[#2563EB]">
                  <ImagePlus className="size-6" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-medium text-[#1E40AF]">
                  {imageFileLabel ?? "Drop your image here"}
                </span>
                <span className="text-center text-xs text-[#64748B]">
                  PNG, JPG, WEBP эсвэл GIF (макс. 5MB)
                </span>
              </button>
            </div>

            <div className="flex gap-[16px] rounded-[8px]">
              <input
                type="checkbox"
                name="use_ai"
                id="pb-img-use-ai"
                defaultChecked
                className="mt-0.5 size-4 shrink-0 rounded border-[#CBD5E1] accent-[#4A80C4]"
              />
              <label htmlFor="pb-img-use-ai" className="cursor-pointer">
                <span
                  className={cn(
                    textLabelClass,
                    "block text-sm font-medium text-[#364153]",
                  )}
                >
                  Зургийн текстийг AI-аар уншуулах
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[#6B7280]">
                  Идэвхгүй бол зургийг л холбоно, текстийг &quot;Засах&quot;-аар
                  нэмнэ.
                </span>
              </label>
            </div>

            {errorImage ? (
              <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorImage}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={pendingImage || submitDisabled}
              className="h-11 w-full rounded-[8px] bg-[#4A80C4] text-sm font-semibold text-white shadow-sm hover:bg-[#3d6dad] disabled:opacity-60"
            >
              {pendingImage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Хадгалж байна...
                </>
              ) : (
                "Хадгалах"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
