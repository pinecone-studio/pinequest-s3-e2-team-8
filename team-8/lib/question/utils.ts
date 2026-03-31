import type { QuestionBank } from "@/types";

/** Хамгийн олон хувийн бодлоготой (тэнцвэл сүүлд шинэчлэгдсэн) хичээлийн ID. */
export function suggestSubjectIdFromPrivateBank(
  allowedSubjectIds: string[],
  privateQuestions: QuestionBank[]
): string | null {
  const allowed = new Set(allowedSubjectIds);
  const stats = new Map<string, { count: number; latest: string }>();

  for (const question of privateQuestions) {
    const sid = question.subject_id;
    if (!sid || !allowed.has(sid)) continue;
    const stamp = question.updated_at ?? question.created_at ?? "";
    const existing = stats.get(sid);
    if (!existing) {
      stats.set(sid, { count: 1, latest: stamp });
    } else {
      existing.count += 1;
      if (stamp > existing.latest) {
        existing.latest = stamp;
      }
    }
  }

  let best: string | null = null;
  let bestCount = -1;
  let bestLatest = "";
  for (const [sid, { count, latest }] of stats) {
    if (count > bestCount || (count === bestCount && latest > bestLatest)) {
      best = sid;
      bestCount = count;
      bestLatest = latest;
    }
  }

  return best;
}

