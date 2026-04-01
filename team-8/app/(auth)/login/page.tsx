"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/auth/actions";

type LoginRole = "admin" | "teacher" | "student";

const ROLE_META: Record<
  LoginRole,
  {
    cardTitle: string;
    cardSubtitle: string;
    loginTitle: string;
    iconPath: string;
    iconTint: string;
    iconBox: string;
    emailPlaceholder: string;
    titleTone: "link" | "plain";
  }
> = {
  teacher: {
    cardTitle: "Багш",
    cardSubtitle: "Шалгалт удирдах",
    loginTitle: "Багшаар нэвтрэх",
    iconPath: "/educator-icons/import_contacts.png",
    iconTint: "#5d92e8",
    iconBox: "#eef4ff",
    emailPlaceholder: "example@school.edu.mn",
    titleTone: "link",
  },
  admin: {
    cardTitle: "Сургалтын\nменежер",
    cardSubtitle: "Хянах",
    loginTitle: "Менежерээр нэвтрэх",
    iconPath: "/educator-icons/admin-shield.svg",
    iconTint: "#f2a15f",
    iconBox: "#fff0e6",
    emailPlaceholder: "example@school.edu.mn",
    titleTone: "plain",
  },
  student: {
    cardTitle: "Сурагч",
    cardSubtitle: "Шалгалт өгөх",
    loginTitle: "Сурагчаар нэвтрэх",
    iconPath: "/educator-icons/classes.png",
    iconTint: "#d2a1ff",
    iconBox: "#fcf3ff",
    emailPlaceholder: "example@school.edu.mn",
    titleTone: "plain",
  },
};

function createMaskStyle(iconPath: string, color: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${iconPath})`,
    maskImage: `url(${iconPath})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    backgroundColor: color,
  };
}

function BrandBlock() {
  return (
    <div className="mb-[20px] space-y-[9px] text-center">
      <div className="inline-flex items-end justify-center gap-1">
        <h1
          className="font-['Trebuchet_MS','Arial_Rounded_MT_Bold',sans-serif] text-[23px] font-bold tracking-[-0.04em] text-[#f7e5b0] sm:text-[27px]"
          style={{
            textShadow:
              "-1px -1px 0 #6a79a2, 1px -1px 0 #6a79a2, -1px 1px 0 #6a79a2, 1px 1px 0 #6a79a2, 0 1.5px 0 rgba(102,118,166,0.24)",
          }}
        >
          Smart Exam
        </h1>
        <span className="mb-[2px] text-[7px] font-semibold tracking-[0.06em] text-[#6676a6] sm:text-[8px]">
          v2.0
        </span>
      </div>

      <p className="text-[12px] font-medium text-[#6e6e6e] sm:text-[13px]">
        Ухаалаг шалгалтын удирдлагын систем
      </p>
    </div>
  );
}

function RoleCard({
  role,
  disabled,
  onClick,
  featured = false,
}: {
  role: LoginRole;
  disabled: boolean;
  onClick: () => void;
  featured?: boolean;
}) {
  const meta = ROLE_META[role];
  const iconStyle = useMemo(
    () => createMaskStyle(meta.iconPath, meta.iconTint),
    [meta.iconPath, meta.iconTint]
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center rounded-[8px] border border-[#d7d7d7] bg-white text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)] disabled:cursor-not-allowed disabled:opacity-70 ${
        featured
          ? "min-h-[156px] w-[168px] px-4 py-[16px]"
          : "min-h-[134px] px-4 py-[14px]"
      }`}
    >
      <span
        className="flex h-[48px] w-[48px] items-center justify-center rounded-[8px]"
        style={{ backgroundColor: meta.iconBox }}
      >
        <span aria-hidden="true" className="h-[22px] w-[22px]" style={iconStyle} />
      </span>

      <span
        className={`mt-4 whitespace-pre-line text-[#1c1c1c] ${
          featured
            ? "text-[17px] font-semibold leading-[1.18]"
            : "text-[17px] font-semibold leading-none"
        }`}
      >
        {meta.cardTitle}
      </span>
      <span
        className={`text-[14px] font-medium text-[#808080] ${
          featured ? "mt-[8px] leading-none" : "mt-[10px] leading-none"
        }`}
      >
        {meta.cardSubtitle}
      </span>
    </button>
  );
}

function RolePicker({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (role: LoginRole) => void;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="w-full max-w-[382px] text-center">
      <BrandBlock />

      <section className="rounded-[16px] border border-[#e5e5e5] bg-white/92 px-[16px] pb-[14px] pt-[18px] shadow-[0_10px_24px_rgba(104,113,132,0.2)] backdrop-blur-[2px]">
        <div className="space-y-[16px]">
          <div className="space-y-[8px]">
            <h2 className="text-[18px] font-semibold text-[#202020] sm:text-[19px]">
              Нэвтрэх
            </h2>
            <p className="text-[14px] font-medium text-[#808080]">
              Та ямар хэрэглэгч вэ?
            </p>
          </div>

          <div className="flex justify-center">
            <RoleCard
              role="admin"
              featured
              disabled={disabled}
              onClick={() => onSelect("admin")}
            />
          </div>

          <div className="grid grid-cols-2 gap-[16px]">
            <RoleCard
              role="teacher"
              disabled={disabled}
              onClick={() => onSelect("teacher")}
            />
            <RoleCard
              role="student"
              disabled={disabled}
              onClick={() => onSelect("student")}
            />
          </div>
        </div>
      </section>

      <footer className="mt-[16px] text-[13px] font-medium text-[#8a8a8a]">
        {currentYear} SmartExam. Бүх эрх хуулиар хамгаалагдсан.
      </footer>
    </div>
  );
}

function RoleLoginCard({
  role,
  error,
  isPending,
  onSubmit,
  onBack,
}: {
  role: LoginRole;
  error: string | null;
  isPending: boolean;
  onSubmit: (formData: FormData) => void;
  onBack: () => void;
}) {
  const meta = ROLE_META[role];
  const iconStyle = useMemo(
    () => createMaskStyle(meta.iconPath, meta.iconTint),
    [meta.iconPath, meta.iconTint]
  );
  const [showPassword, setShowPassword] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <div className="w-full max-w-[315px] text-center">
      <BrandBlock />

      <section className="min-h-[412px] rounded-[19px] border border-[#ddd8d3] bg-white/94 px-[25px] pb-[22px] pt-[24px] shadow-[0_2px_4px_rgba(76,87,110,0.14),0_10px_24px_rgba(104,113,132,0.14)] backdrop-blur-[2px]">
        <div
          className="mx-auto flex h-[48px] w-[48px] items-center justify-center rounded-[8px]"
          style={{ backgroundColor: meta.iconBox }}
        >
          <span aria-hidden="true" className="h-[22px] w-[22px]" style={iconStyle} />
        </div>

        {meta.titleTone === "link" ? (
          <button
            type="button"
            onClick={onBack}
            className="mt-[14px] inline-block text-[16px] font-semibold text-[#355fa4] underline decoration-[1.5px] underline-offset-[2px]"
          >
            {meta.loginTitle}
          </button>
        ) : (
          <div className="mt-[14px] text-[16px] font-semibold text-[#3b3b3b]">
            {meta.loginTitle}
          </div>
        )}

        {error ? (
          <div className="mt-5 flex items-start gap-2 rounded-[10px] border border-[#f0b8b8] bg-[#fff1f1] px-3 py-2 text-left text-[12px] text-[#bc4a4a]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <form action={onSubmit} className="mt-[36px] space-y-[16px] text-left">
          <div className="space-y-[7px]">
            <label
              htmlFor="email"
              className="block text-[12px] font-semibold text-[#4b4b4b]"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder={meta.emailPlaceholder}
              className="h-[36px] w-full rounded-[10px] border border-[#d9d9d9] bg-[#f8f8f8] px-[13px] text-[13px] text-[#333333] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none placeholder:text-[#a4a4a4] focus:border-[#98b8ef]"
            />
          </div>

          <div className="space-y-[7px]">
            <label
              htmlFor="password"
              className="block text-[12px] font-semibold text-[#4b4b4b]"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="******"
                className="h-[36px] w-full rounded-[10px] border border-[#d9d9d9] bg-[#f8f8f8] px-[13px] pr-11 text-[13px] text-[#333333] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none placeholder:text-[#a4a4a4] focus:border-[#98b8ef]"
              />
              <button
                type="button"
                aria-label={showPassword ? "Нууц үг нуух" : "Нууц үг харуулах"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#aaaaaa]"
              >
                {showPassword ? (
                  <EyeOff className="h-[14px] w-[14px]" strokeWidth={1.8} />
                ) : (
                  <Eye className="h-[14px] w-[14px]" strokeWidth={1.8} />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-[1px]">
            <label className="flex items-center gap-[7px] text-[12px] font-medium text-[#6f6f6f]">
              <input
                type="checkbox"
                name="remember_me"
                className="h-[14px] w-[14px] rounded-[4px] border border-[#d8d8d8] accent-[#35519b]"
              />
              Намайг сана
            </label>

            <button
              type="button"
              className="text-[12px] font-medium text-[#648de4]"
            >
              Нууц үг мартсан?
            </button>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="mt-[8px] h-[38px] w-full rounded-[10px] bg-[#334d95] text-[15px] font-semibold text-white shadow-[0_4px_10px_rgba(53,81,155,0.18)] transition-colors hover:bg-[#2f4789] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Нэвтэрч байна..." : "Нэвтрэх"}
          </button>

          <div className="pt-[2px] text-center">
            <Link
              href="/register"
              className="text-[14px] font-medium text-[#648de4]"
            >
              Бүртгүүлэх
            </Link>
          </div>
        </form>
      </section>

      <footer className="mt-[18px] text-[13px] font-medium text-[#8a8a8a]">
        {currentYear} SmartExam. Бүх эрх хуулиар хамгаалагдсан.
      </footer>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roleParam = searchParams.get("role");
  const selectedRole =
    roleParam === "teacher" || roleParam === "student" || roleParam === "admin"
      ? roleParam
      : null;

  function handleRoleSelect(role: LoginRole) {
    setError(null);
    router.push(`/login?role=${role}`);
  }

  function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await login(formData);

      if (result?.error) {
        setError(result.error);
      }
    });
  }

  const backgroundImage =
    selectedRole === "student"
      ? "radial-gradient(circle at 50% 48%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.97) 24%, rgba(250,247,255,0.95) 44%, rgba(236,225,255,0.9) 70%, rgba(207,183,255,0.86) 100%), radial-gradient(circle at 8% 10%, rgba(214,195,255,0.62) 0%, rgba(214,195,255,0) 32%), radial-gradient(circle at 96% 9%, rgba(238,186,210,0.55) 0%, rgba(238,186,210,0) 30%), radial-gradient(circle at 94% 82%, rgba(160,115,255,0.62) 0%, rgba(160,115,255,0) 30%), radial-gradient(circle at 7% 92%, rgba(255,211,219,0.46) 0%, rgba(255,211,219,0) 26%)"
      : selectedRole === "admin"
        ? "radial-gradient(circle at 50% 48%, rgba(255,255,255,0.985) 0%, rgba(255,255,255,0.97) 24%, rgba(244,246,255,0.95) 46%, rgba(224,213,244,0.9) 74%, rgba(202,188,232,0.84) 100%), radial-gradient(circle at 0% 0%, rgba(171,133,246,0.7) 0%, rgba(171,133,246,0) 42%), radial-gradient(circle at 0% 100%, rgba(245,157,118,0.72) 0%, rgba(245,157,118,0) 40%), radial-gradient(circle at 100% 96%, rgba(111,153,229,0.72) 0%, rgba(111,153,229,0) 42%), radial-gradient(circle at 100% 8%, rgba(193,210,243,0.5) 0%, rgba(193,210,243,0) 28%)"
      : "radial-gradient(circle at 50% 48%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.96) 24%, rgba(246,249,255,0.94) 44%, rgba(220,232,255,0.9) 70%, rgba(187,209,245,0.86) 100%), radial-gradient(circle at 7% 88%, rgba(126,165,237,0.6) 0%, rgba(126,165,237,0) 34%), radial-gradient(circle at 99% 10%, rgba(226,181,191,0.42) 0%, rgba(226,181,191,0) 28%), radial-gradient(circle at 99% 92%, rgba(147,166,216,0.45) 0%, rgba(147,166,216,0) 33%), radial-gradient(circle at 8% 12%, rgba(163,196,248,0.34) 0%, rgba(163,196,248,0) 28%)";

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
      style={{
        backgroundColor:
          selectedRole === "student"
            ? "#ecdffe"
            : selectedRole === "admin"
              ? "#d8cfe8"
              : "#dbe9ff",
        backgroundImage,
      }}
    >
      {selectedRole ? (
        <RoleLoginCard
          role={selectedRole}
          error={error}
          isPending={isPending}
          onSubmit={handleSubmit}
          onBack={() => {
            setError(null);
            router.push("/login");
          }}
        />
      ) : (
        <RolePicker disabled={isPending} onSelect={handleRoleSelect} />
      )}
    </main>
  );
}
