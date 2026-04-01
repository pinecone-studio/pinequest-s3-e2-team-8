export interface Subject {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  grade: number | null;
  group_type: string;
}

export interface Assignment {
  id: string;
  group_id: string;
  subject_id: string;
  student_groups: Group | null;
  subjects: Subject | null;
}

export interface TeacherAssignmentTeacher {
  id: string;
  email: string;
  full_name: string;
  subjects: Subject[];
  assignments: Assignment[];
}
