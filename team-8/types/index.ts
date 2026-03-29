export type UserRole = "student" | "teacher" | "admin";

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
  ai_variant_enabled: boolean;
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
