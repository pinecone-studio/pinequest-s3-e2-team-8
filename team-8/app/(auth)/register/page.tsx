"use client";

import { useState } from "react";
import Link from "next/link";
import { register } from "@/lib/auth/actions";
import PineconeLogo from "@/app/_icons/PineconeLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

const roles = [
  { value: "student", label: "Сурагч" },
  { value: "teacher", label: "Багш" },
  { value: "admin", label: "Сургалтын менежер" },
] as const;

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("student");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set("role", role);
    const result = await register(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-hidden bg-gradient-to-b from-background via-background to-muted/50 px-4 pt-12 md:pt-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md border-border/60 bg-background/80 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border bg-background shadow-sm">
            <PineconeLogo className="h-6 w-6 text-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              PineExam
            </CardTitle>
            <CardDescription>Шинэ бүртгэл үүсгэх</CardDescription>
          </div>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="leading-snug">{error}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="full_name">Нэр</Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="Бат-Эрдэнэ"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Имэйл</Label>
              <Input
                 id="email"
                name="email"
                type="email"
                placeholder="example@pinecone.mn"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Нууц үг</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Үүрэг</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Үүрэг сонгох" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Бүртгэж байна..." : "Бүртгүүлэх"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Бүртгэлтэй юу?{" "}
              <Link
                href="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Нэвтрэх
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
