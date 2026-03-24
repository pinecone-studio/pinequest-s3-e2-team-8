"use client";

import { useState } from "react";
import { createExam } from "@/lib/exam/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExamForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await createExam(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Шалгалтын мэдээлэл</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Шалгалтын нэр *</Label>
            <Input id="title" name="title" placeholder="Жишээ: Математик - 1-р улирал" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Тайлбар</Label>
            <Textarea id="description" name="description" placeholder="Шалгалтын тухай товч мэдээлэл..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Эхлэх цаг *</Label>
              <Input id="start_time" name="start_time" type="datetime-local" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">Дуусах цаг *</Label>
              <Input id="end_time" name="end_time" type="datetime-local" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration_minutes">Хугацаа (минут) *</Label>
              <Input id="duration_minutes" name="duration_minutes" type="number" min="5" max="300" placeholder="60" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passing_score">Тэнцэх оноо (%)</Label>
              <Input id="passing_score" name="passing_score" type="number" min="0" max="100" placeholder="60" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="shuffle_questions" name="shuffle_questions" className="h-4 w-4 rounded border" />
            <Label htmlFor="shuffle_questions" className="cursor-pointer font-normal">
              Асуултыг санамсаргүй дарааллаар гаргах
            </Label>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Үүсгэж байна..." : "Үүсгэх ба асуулт нэмэх →"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
