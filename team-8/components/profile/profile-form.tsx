"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateCurrentProfile } from "@/lib/profile/actions";
import type { Profile } from "@/types";

function getRoleLabel(role: Profile["role"]) {
  if (role === "teacher") return "Багш";
  if (role === "student") return "Сурагч";
  return "Сургалтын менежер";
}

function getInitials(profile: Profile) {
  if (profile.full_name) {
    return profile.full_name
      .split(" ")
      .map((name) => name[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return profile.email[0]?.toUpperCase() ?? "U";
}

export default function ProfileForm({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await updateCurrentProfile(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setSuccess(result?.message ?? "Профайл амжилттай шинэчлэгдлээ.");
    setNewPassword("");
    setConfirmPassword("");
    setLoading(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Миний профайл</CardTitle>
          <CardDescription>
            Бүртгэлийн үндсэн мэдээллээ эндээс харж, шинэчилнэ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName || profile.email} /> : null}
              <AvatarFallback>{getInitials({ ...profile, full_name: fullName, avatar_url: avatarUrl || null })}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="text-base font-semibold">{fullName || "Нэр оруулаагүй"}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <p className="text-sm text-muted-foreground">{getRoleLabel(profile.role)}</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Профайлын төлөв</p>
              <p className="text-muted-foreground">
                Шалгалтын систем дээр таны нэр, зураг, нэвтрэх мэдээллийг
                шинэчилнэ.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Мэдээлэл шинэчлэх</CardTitle>
          <CardDescription>
            Нэр, зураг болон нууц үгээ шинэчлэх боломжтой.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                {success}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="full_name">Нэр</Label>
              <Input
                id="full_name"
                name="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Нэрээ оруулна уу"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Имэйл</Label>
              <Input id="email" value={profile.email} disabled readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatar_url">Зургийн холбоос</Label>
              <Input
                id="avatar_url"
                name="avatar_url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new_password">Шинэ нууц үг</Label>
                <Input
                  id="new_password"
                  name="new_password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Хоосон үлдээж болно"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Нууц үг давтах</Label>
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Шинэ нууц үгээ давтана"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Нууц үгээ солихгүй бол хоосон орхино уу. Хэрэв шинэчилбэл дор хаяж
              8 тэмдэгттэй байна.
            </p>

            <Button type="submit" disabled={loading}>
              {loading ? "Хадгалж байна..." : "Өөрчлөлт хадгалах"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
