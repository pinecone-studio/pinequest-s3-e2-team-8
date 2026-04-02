"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/types";
import { ArrowLeft } from "lucide-react";

function getDisplayName(profile: Profile) {
  const fullName = profile.full_name.trim();

  if (fullName.length > 0) {
    return fullName.split(/\s+/).at(-1) ?? fullName;
  }

  return profile.email.split("@")[0] || "Багш";
}

function getInitials(profile: Profile) {
  const source = profile.full_name.trim() || profile.email;

  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "Б"
  );
}

export default function Header({ profile }: { profile: Profile }) {
  const displayName = getDisplayName(profile);
  const initials = getInitials(profile);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subjectId = searchParams.get("subjectId");

  const isExamsPage = pathname === "/educator/exams";
  const isExamBuilderPage =
    pathname === "/educator/create-exam" ||
    (pathname?.startsWith("/educator/exams/") && pathname?.endsWith("/edit"));
  const hideEntireHeader =
    pathname?.startsWith("/educator/exams/") && pathname?.endsWith("/results");

  const hideGreeting =
    isExamsPage ||
    isExamBuilderPage ||
    pathname === "/educator/groups" ||
    pathname?.startsWith("/educator/question-bank") ||
    pathname?.startsWith("/educator/grading");

  const showGroupsBackLink = pathname?.startsWith("/educator/groups/");
  const showDashboardBackLink = pathname?.startsWith("/educator/grading");
  const showQuestionBankBackLink =
    pathname?.startsWith("/educator/question-bank") && Boolean(subjectId);
  const questionBankBackHref = pathname?.startsWith(
    "/educator/question-bank/private",
  )
    ? "/educator/question-bank/private"
    : "/educator/question-bank";

  if (hideEntireHeader) {
    return null;
  }

  const headerHeightClass = isExamBuilderPage
    ? "h-[40px] py-0"
    : isExamsPage
      ? "min-h-[72px] py-4"
      : "h-30.5 py-2";

  return (
    <header
      className={`flex flex-col gap-5 sm:flex-row sm:items-center ${headerHeightClass} ${
        hideGreeting &&
        !showGroupsBackLink &&
        !showQuestionBankBackLink &&
        !showDashboardBackLink
          ? "sm:justify-end"
          : showGroupsBackLink ||
              showQuestionBankBackLink ||
              showDashboardBackLink
            ? "sm:justify-start"
            : "sm:justify-between"
      }`}
    >
      {showGroupsBackLink ? (
        <Link
          href="/educator/groups"
          className="text-[15px] font-medium text-[#111111] hover:text-[#1f2937]"
        >
          <div className="flex items-center gap-1 text-[#030217]">
            <ArrowLeft size={16} />
            Ангиуд руу буцах
          </div>
        </Link>
      ) : showDashboardBackLink ? (
        <Link
          href="/educator"
          className="text-[15px] font-medium text-[#111111] hover:text-[#1f2937]"
        >
          <div className="flex items-center gap-1 text-[#030217]">
            <ArrowLeft size={16} />
            Нүүр хуудас руу буцах
          </div>
        </Link>
      ) : showQuestionBankBackLink ? (
        <Link
          href={questionBankBackHref}
          className="text-[15px] font-medium text-[#111111] hover:text-[#1f2937] hover:underline"
        >
          <div className="flex items-center gap-1 text-[#030217]">
            <ArrowLeft size={16} />
            Асуултын сан руу буцах
          </div>
        </Link>
      ) : !hideGreeting ? (
        <div className="h-[49px] w-[344px] min-w-0">
          <h1 className="text-[22px] font-medium leading-tight tracking-[-0.03em] text-[#111111]">
            Сайн байна уу, {displayName}
          </h1>
          <p className="mt-[6px] text-[15px] text-[#6f7782]">
            Ухаалаг шалгалтын системд тавтай морил!
          </p>
        </div>
      ) : null}

      <div
        className={`flex h-[40px] w-[100px] items-center justify-end gap-[20px] self-end sm:self-auto ${
          showGroupsBackLink || showQuestionBankBackLink || showDashboardBackLink
            ? "sm:ml-auto"
            : ""
        }`}
      >
        <NotificationBell />

        <Link
          href="/educator/profile"
          aria-label="Профайл руу очих"
          className="rounded-full transition-transform duration-200 hover:scale-[1.02]"
        >
          <Avatar className="h-10 w-10 overflow-hidden bg-[#f7d9b5] shadow-[0_10px_24px_rgba(122,103,72,0.14)]">
            {profile.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={profile.full_name || profile.email}
              />
            ) : null}
            <AvatarFallback className="bg-[#f7d9b5] text-sm font-semibold text-[#8a4d20]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
