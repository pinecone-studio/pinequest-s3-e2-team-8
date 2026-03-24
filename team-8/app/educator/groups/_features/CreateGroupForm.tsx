"use client";

import { useState } from "react";
import { createGroup } from "@/lib/group/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export default function CreateGroupForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    const result = await createGroup(formData);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        <PlusCircle className="mr-2 h-4 w-4" />
        Шинэ бүлэг үүсгэх
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Шинэ бүлэг үүсгэх</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="name">Бүлгийн нэр</Label>
            <Input id="name" name="name" placeholder="Жишээ: 10А анги" required />
          </div>
          <div className="w-24">
            <Label htmlFor="grade">Анги</Label>
            <Input id="grade" name="grade" type="number" min="6" max="12" placeholder="10" />
          </div>
          <div className="w-36">
            <Label>Төрөл</Label>
            <Select name="group_type" defaultValue="class">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Анги</SelectItem>
                <SelectItem value="elective">Сонголт</SelectItem>
                <SelectItem value="mixed">Холимог</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Үүсгэж байна..." : "Үүсгэх"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Болих
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
