"use client";

import { useState } from "react";
import { addMemberToGroup } from "@/lib/group/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddMemberFormProps {
  groupId: string;
}

export default function AddMemberForm({ groupId }: AddMemberFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    const studentEmail = String(formData.get("student_email") ?? "").trim();

    setLoading(true);
    setError(null);

    const result = await addMemberToGroup(groupId, studentEmail);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setEmail("");
    setLoading(false);
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <div className="space-y-2">
        <Label htmlFor="student_email">Сурагчийн имэйл</Label>
        <Input
          id="student_email"
          name="student_email"
          type="email"
          placeholder="student@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? "Нэмж байна..." : "Гишүүн нэмэх"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
