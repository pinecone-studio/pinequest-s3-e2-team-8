import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");

function applyEnvFile(fileName) {
  const filePath = resolve(APP_ROOT, fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

applyEnvFile(".env.local");
applyEnvFile(".env");

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin client is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildSeedUserIds() {
  return new Set([
    "10000000-0000-0000-0000-000000000001",
    ...Array.from(
      { length: 10 },
      (_, index) =>
        `20000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
    ),
    ...Array.from(
      { length: 50 },
      (_, index) =>
        `30000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
    ),
  ]);
}

function buildSeedExamIds() {
  return new Set(
    Array.from(
      { length: 11 },
      (_, index) =>
        `50000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
    )
  );
}

function buildSeedPracticeExamIds() {
  return new Set(
    Array.from(
      { length: 3 },
      (_, index) =>
        `94000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
    )
  );
}

function buildSeedExamSessionIds() {
  return new Set(
    Array.from(
      { length: 10 },
      (_, index) =>
        `60000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`
    )
  );
}

function chunk(array, size) {
  const result = [];
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }
  return result;
}

async function listAllAuthUsers(admin) {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    users.push(...(data?.users ?? []));
    if ((data?.users?.length ?? 0) < perPage) break;
    page += 1;
  }

  return users;
}

async function deleteRowsByIds(admin, table, ids, label = table, batchSize = 50) {
  if (ids.length === 0) return 0;

  let deleted = 0;
  for (const batch of chunk(ids, batchSize)) {
    const { error } = await admin.from(table).delete().in("id", batch);
    if (error) {
      throw new Error(`Failed deleting ${label}: ${error.message}`);
    }
    deleted += batch.length;
  }

  return deleted;
}

async function deleteAllRows(admin, table, idColumn = "id") {
  const { data, error } = await admin.from(table).select(idColumn);
  if (error) {
    throw new Error(`Failed to read ${table}: ${error.message}`);
  }

  const ids = (data ?? []).map((row) => String(row[idColumn]));
  return deleteRowsByIds(admin, table, ids, table);
}

async function deleteAuthUsers(admin, userIds, concurrency = 10) {
  if (userIds.length === 0) return 0;

  let deleted = 0;
  for (const batch of chunk(userIds, concurrency)) {
    await Promise.all(
      batch.map(async (userId) => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) {
          throw new Error(`Failed to delete auth user ${userId}: ${error.message}`);
        }
      })
    );
    deleted += batch.length;
  }

  return deleted;
}

async function readTableCount(admin, table) {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function getCleanupTargets(admin) {
  const seedUserIds = buildSeedUserIds();
  const seedExamIds = buildSeedExamIds();
  const seedPracticeExamIds = buildSeedPracticeExamIds();
  const seedExamSessionIds = buildSeedExamSessionIds();

  const [
    authUsers,
    examsResult,
    studentPracticeExamsResult,
    studentTopicMasteryResult,
    examSessionsResult,
    profilesResult,
    queueResult,
  ] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from("exams").select("id"),
    admin.from("student_practice_exams").select("id, student_id"),
    admin.from("student_topic_mastery").select("id, student_id"),
    admin.from("exam_sessions").select("id"),
    admin.from("profiles").select("id"),
    admin.from("student_mastery_refresh_queue").select("id"),
  ]);

  if (examsResult.error) {
    throw new Error(`Failed to read exams: ${examsResult.error.message}`);
  }
  if (studentPracticeExamsResult.error) {
    throw new Error(
      `Failed to read student_practice_exams: ${studentPracticeExamsResult.error.message}`
    );
  }
  if (studentTopicMasteryResult.error) {
    throw new Error(
      `Failed to read student_topic_mastery: ${studentTopicMasteryResult.error.message}`
    );
  }
  if (examSessionsResult.error) {
    throw new Error(`Failed to read exam_sessions: ${examSessionsResult.error.message}`);
  }
  if (profilesResult.error) {
    throw new Error(`Failed to read profiles: ${profilesResult.error.message}`);
  }
  if (queueResult.error) {
    throw new Error(
      `Failed to read student_mastery_refresh_queue: ${queueResult.error.message}`
    );
  }

  const authUserIdsToDelete = authUsers
    .map((user) => String(user.id))
    .filter((id) => !seedUserIds.has(id));

  const extraProfileIds = (profilesResult.data ?? [])
    .map((row) => String(row.id))
    .filter((id) => !seedUserIds.has(id));

  const extraExamIds = (examsResult.data ?? [])
    .map((row) => String(row.id))
    .filter((id) => !seedExamIds.has(id));

  const extraPracticeExamIds = (studentPracticeExamsResult.data ?? [])
    .filter((row) => !seedPracticeExamIds.has(String(row.id)))
    .map((row) => String(row.id));

  const extraMasteryIds = (studentTopicMasteryResult.data ?? [])
    .filter((row) => String(row.student_id) !== "30000000-0000-0000-0000-000000000050")
    .map((row) => String(row.id));

  const extraExamSessionIds = (examSessionsResult.data ?? [])
    .map((row) => String(row.id))
    .filter((id) => !seedExamSessionIds.has(id));

  const masteryQueueIds = (queueResult.data ?? []).map((row) => String(row.id));

  return {
    authUserIdsToDelete,
    extraProfileIds,
    extraExamIds,
    extraPracticeExamIds,
    extraMasteryIds,
    extraExamSessionIds,
    masteryQueueIds,
  };
}

async function collectCounts(admin) {
  const tables = [
    "profiles",
    "subjects",
    "student_groups",
    "student_group_members",
    "teacher_subjects",
    "teaching_assignments",
    "question_bank",
    "question_passages",
    "exams",
    "questions",
    "exam_assignments",
    "exam_recipients",
    "exam_sessions",
    "answers",
    "proctor_events",
    "notifications",
    "sample_exams",
    "sample_exam_items",
    "student_topic_mastery",
    "student_subject_study_plans",
    "student_practice_exams",
    "student_practice_questions",
    "student_practice_attempts",
    "student_practice_answers",
    "student_mastery_refresh_queue",
    "exam_identity_enrollments",
    "exam_session_question_variants",
    "exam_schedules",
  ];

  const counts = {};
  for (const table of tables) {
    counts[table] = await readTableCount(admin, table);
  }
  return counts;
}

async function main() {
  const admin = createAdminClient();

  const beforeCounts = await collectCounts(admin);
  const targets = await getCleanupTargets(admin);

  console.log(
    JSON.stringify(
      {
        phase: "before",
        targets: {
          authUsersToDelete: targets.authUserIdsToDelete.length,
          extraProfiles: targets.extraProfileIds.length,
          extraExams: targets.extraExamIds.length,
          extraPracticeExams: targets.extraPracticeExamIds.length,
          extraMasteryRows: targets.extraMasteryIds.length,
          extraExamSessions: targets.extraExamSessionIds.length,
          masteryQueueRows: targets.masteryQueueIds.length,
        },
        counts: beforeCounts,
      },
      null,
      2
    )
  );

  const deleted = {};

  deleted.notifications = await deleteAllRows(admin, "notifications");
  deleted.masteryQueue = await deleteRowsByIds(
    admin,
    "student_mastery_refresh_queue",
    targets.masteryQueueIds,
    "student_mastery_refresh_queue"
  );
  deleted.extraPracticeExams = await deleteRowsByIds(
    admin,
    "student_practice_exams",
    targets.extraPracticeExamIds,
    "student_practice_exams"
  );
  deleted.extraMasteryRows = await deleteRowsByIds(
    admin,
    "student_topic_mastery",
    targets.extraMasteryIds,
    "student_topic_mastery"
  );
  deleted.extraExamSessions = await deleteRowsByIds(
    admin,
    "exam_sessions",
    targets.extraExamSessionIds,
    "exam_sessions"
  );
  deleted.extraExams = await deleteRowsByIds(
    admin,
    "exams",
    targets.extraExamIds,
    "exams"
  );

  const stressGroupDelete = await admin
    .from("student_groups")
    .delete()
    .eq("id", "72000000-0000-0000-0000-000000000001");
  if (stressGroupDelete.error) {
    throw new Error(
      `Failed to delete stress student group: ${stressGroupDelete.error.message}`
    );
  }
  deleted.stressGroup = 1;

  const stressSubjectDelete = await admin
    .from("subjects")
    .delete()
    .eq("id", "71000000-0000-0000-0000-000000000001");
  if (stressSubjectDelete.error) {
    throw new Error(
      `Failed to delete stress subject: ${stressSubjectDelete.error.message}`
    );
  }
  deleted.stressSubject = 1;

  deleted.authUsers = await deleteAuthUsers(admin, targets.authUserIdsToDelete);
  deleted.orphanProfiles = await deleteRowsByIds(
    admin,
    "profiles",
    targets.extraProfileIds,
    "profiles"
  );

  const afterCounts = await collectCounts(admin);

  console.log(
    JSON.stringify(
      {
        phase: "after",
        deleted,
        counts: afterCounts,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
