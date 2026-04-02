export type UserRole = "student" | "teacher" | "admin";
export type ProctoringMode = "off" | "standard" | "strict";
export type EvidenceMode = "metadata_only" | "metadata_snapshots";
export type DevicePolicy = "any" | "mobile_preferred" | "desktop_only";
export type StudentDeviceType = "desktop" | "mobile";
export type ProctorDisplayMode = "browser" | "standalone" | "fullscreen" | "unknown";
export type ProctorRiskLevel = "low" | "medium" | "high" | "critical";
export type ProctorFlagStatus = "clear" | "flagged" | "reviewed" | "escalated";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  parent_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface QuestionPassage {
  id: string;
  exam_id: string;
  title: string | null;
  content: string;
  content_html: string | null;
  image_url: string | null;
  order_index: number;
  created_by: string;
  created_at: string;
}

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  created_by: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  passing_score: number | null;
  proctoring_mode: ProctoringMode;
  device_policy: DevicePolicy;
  require_fullscreen: boolean;
  require_camera: boolean;
  identity_verification: boolean;
  evidence_mode: EvidenceMode;
  post_exam_similarity_enabled: boolean;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  published_snapshot?: PublishedExamSnapshot | null;
}

export interface PublishedExamSnapshotGroup {
  id: string;
  name: string;
  grade: number | null;
  group_type: string;
  member_count: number;
}

export interface PublishedExamSnapshotStats {
  question_count: number;
  passage_count: number;
  total_points: number;
  assignment_count: number;
  assigned_student_count: number;
  has_essay_questions: boolean;
}

export interface PublishedExamSnapshot {
  version: number;
  created_at: string;
  exam: {
    id: string;
    title: string;
    description: string | null;
    subject_id: string | null;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    max_attempts: number;
    shuffle_questions: boolean;
    shuffle_options: boolean;
    passing_score: number | null;
    proctoring_mode: ProctoringMode;
    device_policy: DevicePolicy;
    require_fullscreen: boolean;
    require_camera: boolean;
    identity_verification: boolean;
    evidence_mode: EvidenceMode;
    post_exam_similarity_enabled: boolean;
    published_at: string;
  };
  questions: Question[];
  passages: QuestionPassage[];
  assigned_groups: PublishedExamSnapshotGroup[];
  stats: PublishedExamSnapshotStats;
}

export type QuestionType =
  | "multiple_choice"
  | "multiple_response"
  | "essay"
  | "fill_blank"
  | "matching";
export type AiQuestionVariantMode = "per_student" | "two_fixed";
export type Difficulty = "easy" | "medium" | "hard";
export type DifficultyLevel = 1 | 2 | 3;
export type QuestionBankVisibility =
  | "private"
  | "shared_subject"
  | "admin_curated"
  | "archived";

export interface Question {
  id: string;
  exam_id: string;
  subject_id?: string | null;
  passage_id?: string | null;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
  order_index: number;
  explanation: string | null;
  subtopic?: string | null;
  source_question_bank_id?: string | null;
  topic_label_source?: string | null;
  topic_label_confidence?: number | null;
  ai_variant_enabled: boolean;
  ai_variant_mode: AiQuestionVariantMode;
  created_at: string;
  question_passages?: QuestionPassage | null;
}

export interface QuestionBank {
  id: string;
  subject_id: string | null;
  created_by: string;
  visibility: QuestionBankVisibility;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
  difficulty: Difficulty;
  difficulty_level: DifficultyLevel;
  grade_level: number | null;
  subtopic: string | null;
  tags: string[];
  explanation: string | null;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  subjects?: { name: string } | null;
}

export interface QuestionBankSummary {
  total: number;
  manageable: number;
  private_count: number;
  shared_subject_count: number;
  admin_curated_count: number;
  archived_count: number;
  total_usage_count: number;
  recently_used_count: number;
}

export interface SampleExam {
  id: string;
  title: string;
  description: string | null;
  subject_id: string;
  grade_level: number;
  subtopic: string | null;
  difficulty_level: DifficultyLevel;
  duration_minutes: number;
  question_count: number;
  total_points: number;
  created_at: string;
  updated_at: string;
  subjects?: { name: string } | null;
  sample_exam_items?: SampleExamItem[];
}

export interface SampleExamItem {
  id: string;
  sample_exam_id: string;
  question_bank_id: string;
  order_index: number;
  created_at: string;
  question_bank?: QuestionBank | null;
}

export interface QuestionImportMatchingPair {
  left: string;
  right: string;
}

export interface QuestionImportDraft {
  draftId: string;
  sourceRow: number;
  type: QuestionType;
  content: string;
  contentHtml: string;
  imageUrl: string;
  explanation: string;
  points: number;
  options: string[];
  correctAnswer: string;
  multipleCorrectAnswers: string[];
  matchingPairs: QuestionImportMatchingPair[];
  warnings: string[];
  errors: string[];
}

export interface TeacherSubject {
  teacher_id: string;
  subject_id: string;
  assigned_by: string | null;
  created_at: string;
}

export interface TeachingAssignment {
  id: string;
  teacher_id: string;
  group_id: string;
  subject_id: string;
  is_active: boolean;
  assigned_by: string | null;
  created_at: string;
}

export type ExamSessionStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "timed_out";

export type AnswerScoreSource = "objective" | "ai" | "teacher";

export type AnswerReviewStatus = "none" | "requested" | "resolved";

export interface ExamSession {
  id: string;
  exam_id: string;
  user_id: string;
  status: ExamSessionStatus;
  started_at: string;
  submitted_at: string | null;
  total_score: number | null;
  max_score: number | null;
  attempt_number: number;
  risk_score: number;
  risk_level: ProctorRiskLevel;
  flag_status: ProctorFlagStatus;
  flag_summary: string | null;
  identity_verified_at: string | null;
  last_heartbeat_at: string | null;
  challenge_count: number;
  last_snapshot_at: string | null;
  review_note: string | null;
  device_type: StudentDeviceType;
  display_mode: ProctorDisplayMode;
  platform: string | null;
  spot_check_count: number;
  last_spot_check_at: string | null;
}

export interface Answer {
  id: string;
  session_id: string;
  question_id: string;
  user_id: string;
  answer: string | null;
  is_correct: boolean | null;
  score: number | null;
  graded_by: string | null;
  graded_at: string | null;
  feedback: string | null;
  submitted_at: string;
  ai_score: number | null;
  ai_feedback: string | null;
  ai_graded_at: string | null;
  score_source: AnswerScoreSource;
  review_status: AnswerReviewStatus;
  review_requested_at: string | null;
  review_reason: string | null;
  review_resolved_at: string | null;
  first_answered_at: string | null;
  last_changed_at: string | null;
  change_count: number;
}

export interface StudentTopicMastery {
  id: string;
  student_id: string;
  subject_id: string;
  topic_key: string;
  topic_label: string;
  official_correct_points: number;
  official_total_points: number;
  practice_correct_points: number;
  practice_total_points: number;
  official_question_count: number;
  practice_question_count: number;
  mastery_score: number;
  updated_at: string;
}

export interface StudentLearningSubjectSummary {
  subject_id: string;
  subject_name: string;
  mastery_score: number;
  official_question_count: number;
  practice_question_count: number;
  weak_topic_count: number;
  needs_topic_backfill: boolean;
}

export interface StudentLearningTopicSummary {
  subject_id: string;
  subject_name: string;
  topic_key: string;
  topic_label: string;
  mastery_score: number;
  official_question_count: number;
  practice_question_count: number;
  official_percentage: number | null;
  practice_percentage: number | null;
}

export interface StudentSubjectStudyPlan {
  student_id: string;
  subject_id: string;
  mastery_updated_at: string;
  pending_mastery_updated_at: string | null;
  generated_at: string;
  requested_at: string;
  status: "pending" | "ready" | "failed";
  last_error: string | null;
  summary: string;
  priorities: string[];
  steps: string[];
  next_practice_focus: string[];
}

export interface StudentPracticeExam {
  id: string;
  student_id: string;
  subject_id: string;
  title: string;
  description: string | null;
  status: "building" | "ready" | "failed";
  build_error: string | null;
  build_requested_at: string | null;
  ready_at: string | null;
  selected_topics: Array<{ topic_key: string; topic_label: string }>;
  question_count: number;
  created_at: string;
  updated_at: string;
}

export interface StudentPracticeQuestion {
  id: string;
  practice_exam_id: string;
  subject_id: string;
  source_type: "bank" | "ai";
  source_question_bank_id: string | null;
  topic_key: string;
  subtopic: string | null;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
  order_index: number;
  explanation: string | null;
}

export interface StudentPracticeQuestionForTake {
  id: string;
  practice_exam_id: string;
  subject_id: string;
  topic_key: string;
  subtopic: string | null;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  points: number;
  order_index: number;
}

export interface StudentPracticeAttempt {
  id: string;
  practice_exam_id: string;
  student_id: string;
  status: "in_progress" | "graded";
  started_at: string;
  submitted_at: string | null;
  total_score: number | null;
  max_score: number | null;
  attempt_number: number;
  draft_answers: Record<string, string>;
  draft_saved_at: string | null;
}

export interface StudentPracticeAnswer {
  id: string;
  practice_attempt_id: string;
  practice_question_id: string;
  student_id: string;
  answer: string | null;
  is_correct: boolean | null;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
}

export interface ExamSchedule {
  id: string;
  exam_id: string;
  room: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
}

export type GroupType = "class" | "elective" | "mixed";

export interface StudentGroup {
  id: string;
  name: string;
  grade: number | null;
  group_type: GroupType;
  subject_id: string | null;
  created_by: string;
  created_at: string;
}

export interface StudentGroupMember {
  group_id: string;
  student_id: string;
  joined_at: string;
}

export interface ExamAssignment {
  id: string;
  exam_id: string;
  group_id: string;
  assigned_by: string | null;
  assigned_at: string;
}

export interface ExamRecipientOverride {
  exam_id: string;
  student_id: string;
  access_start_time: string | null;
  access_end_time: string | null;
  max_attempts_override: number | null;
  excused_at: string | null;
  excused_by: string | null;
  status_note: string | null;
  assigned_by: string | null;
  assigned_at: string;
}
