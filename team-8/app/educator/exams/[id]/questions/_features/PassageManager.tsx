"use client";

import { useState } from "react";
import {
  addQuestionPassage,
  deleteQuestionPassage,
} from "@/lib/question/actions";
import type { QuestionPassage } from "@/types";
import MathContent from "@/components/math/MathContent";
import LatexShortcutPanel from "@/components/math/LatexShortcutPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import EditPassageDialog from "./EditPassageDialog";

interface PassageManagerProps {
  examId: string;
  passages: QuestionPassage[];
}

export default function PassageManager({
  examId,
  passages,
}: PassageManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const result = await addQuestionPassage(examId, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const form = document.getElementById("passage-form") as HTMLFormElement | null;
    form?.reset();
    setLoading(false);
  }

  async function handleDelete(passageId: string) {
    setRemovingId(passageId);
    setError(null);
    const result = await deleteQuestionPassage(examId, passageId);
    if (result?.error) {
      setError(result.error);
    }
    setRemovingId(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reading / Passage block</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Нэг эх, тайлбар, зураг эсвэл formula context-ийг олон асуултад
          хуваалцахад ашиглана.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form id="passage-form" action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="passage_title">Гарчиг</Label>
            <Input
              id="passage_title"
              name="title"
              placeholder="Жишээ: Унших эх 1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="passage_content">Passage текст *</Label>
            <Textarea
              id="passage_content"
              name="content"
              placeholder="Нийтлэг эх, тайлбар эсвэл бодлогын нөхцөл..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="passage_content_html">Форматтай контент (HTML)</Label>
            <Textarea
              id="passage_content_html"
              name="content_html"
              placeholder="<p>LaTeX, онцлох хэсэг, холбоос, формат...</p>"
              rows={4}
            />
            <LatexShortcutPanel targetId="passage_content_html" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="passage_image_url">Зургийн URL</Label>
            <Input
              id="passage_image_url"
              name="image_url"
              type="url"
              placeholder="https://example.com/passage-image.png"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Нэмж байна..." : "Passage block нэмэх"}
          </Button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Блокуудаа</h3>
            <Badge variant="outline">{passages.length}</Badge>
          </div>

          {passages.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Одоогоор passage block байхгүй байна.
            </div>
          ) : (
            passages.map((passage, index) => (
              <div key={passage.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Block {index + 1}</Badge>
                      {passage.title && (
                        <span className="font-medium">{passage.title}</span>
                      )}
                    </div>
                    <MathContent
                      html={passage.content_html}
                      text={passage.content}
                      className="prose prose-sm line-clamp-4 max-w-none text-foreground"
                    />
                    {passage.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={passage.image_url}
                        alt="Passage зураг"
                        className="max-h-48 rounded-lg border"
                      />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <EditPassageDialog examId={examId} passage={passage} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(passage.id)}
                      disabled={removingId === passage.id}
                    >
                      {removingId === passage.id ? "..." : "Устгах"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
