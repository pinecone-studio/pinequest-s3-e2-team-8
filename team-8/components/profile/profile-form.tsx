"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function setNextPreview(nextPreviewUrl: string | null) {
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return nextPreviewUrl;
    });
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Зөвхөн зургийн файл сонгоно уу.");
      event.target.value = "";
      return;
    }

    setError(null);
    setSuccess(null);
    setSelectedFileName(file.name);
    setNextPreview(URL.createObjectURL(file));
  }

  function clearSelectedFile() {
    setSelectedFileName(null);
    setNextPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeAvatar() {
    clearSelectedFile();
    setAvatarUrl("");
    setSuccess(null);
  }

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

    setAvatarUrl(result?.avatarUrl ?? "");
    clearSelectedFile();
    setSuccess(result?.message ?? "Профайл амжилттай шинэчлэгдлээ.");
    setNewPassword("");
    setConfirmPassword("");
    setLoading(false);
  }

  const displayAvatarUrl = previewUrl || avatarUrl;
  const canRemoveAvatar = Boolean(displayAvatarUrl);

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
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-full transition-transform hover:scale-[1.02]"
            >
              <Avatar size="lg">
                {displayAvatarUrl ? (
                  <AvatarImage
                    src={displayAvatarUrl}
                    alt={fullName || profile.email}
                  />
                ) : null}
                <AvatarFallback>
                  {getInitials({
                    ...profile,
                    full_name: fullName,
                    avatar_url: displayAvatarUrl || null,
                  })}
                </AvatarFallback>
              </Avatar>
            </button>
            <div className="space-y-1">
              <p className="text-base font-semibold">
                {fullName || "Нэр оруулаагүй"}
              </p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <p className="text-sm text-muted-foreground">
                {getRoleLabel(profile.role)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {canRemoveAvatar ? (
              <Button
                type="button"
                variant="ghost"
                onClick={removeAvatar}
                className="gap-2 px-0 text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
                Зураг арилгах
              </Button>
            ) : null}

            {selectedFileName ? (
              <p className="text-sm font-medium text-[#3B6CB0]">
                Сонгосон файл: {selectedFileName}
              </p>
            ) : null}
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
          <form
            action={handleSubmit}
            encType="multipart/form-data"
            className="space-y-5"
          >
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

            <input
              ref={fileInputRef}
              id="avatar_file"
              name="avatar_file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarFileChange}
            />

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
              <input type="hidden" name="avatar_url" value={avatarUrl} />
              <Input
                id="avatar_url"
                value={selectedFileName || avatarUrl}
                readOnly
                onClick={openFilePicker}
                onFocus={(event) => {
                  event.target.blur();
                  openFilePicker();
                }}
                placeholder="Дарж зураг сонгоно уу"
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Энэ талбар дээр дарахад folder-оос зураг сонгоно.
              </p>
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
