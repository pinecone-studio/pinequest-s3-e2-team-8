import type { Profile } from "@/types";

export type StudentProfileDisplay = {
  name: string;
  initials: string;
  avatarUrl: string | null;
};

function getInitials(source: string) {
  const tokens = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return "ST";
  }

  return tokens
    .slice(0, 2)
    .map((token) => token.charAt(0).toUpperCase())
    .join("");
}

export function getStudentProfileDisplay(
  profile: Pick<Profile, "full_name" | "email" | "avatar_url">,
): StudentProfileDisplay {
  const name = profile.full_name.trim() || profile.email;

  return {
    name,
    initials: getInitials(name),
    avatarUrl: profile.avatar_url,
  };
}
