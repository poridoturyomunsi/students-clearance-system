/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ClearanceStatus = 'Cleared' | 'Hold' | 'Denied';
export type BoardingStatus = 'Boarder' | 'Day Scholar';

export type PrintStatus = 'Printed' | 'Not Printed';

export interface Student {
  id: string; // Internal database ID (UUID or similar hash)
  adminNo?: string; // School admission/ID number (e.g., ADM-2026-004) — deprecated, use `studentNo`
  studentNo?: string; // School Student Number (preferred identifier)
  name: string; // Official name
  aliases?: string[]; // Alternative name variations linked to same Student Number
  gender: 'Male' | 'Female';
  gradeClass: string; // Class / Form (e.g., Form 4 West, Grade 10B)
  boardingStatus: BoardingStatus;
  isCleared: boolean; // General clearance state (true: Cleared, false: Hold / Not Cleared)
  gateStatus?: ClearanceStatus; // Deprecated but kept optional for backward compatibility
  mealsStatus?: ClearanceStatus; // Deprecated but kept optional for backward compatibility
  gateClearanceDate?: string;
  mealsClearanceDate?: string;
  remarks?: string;
  photo?: string; // Enhanced passport photo (default display)
  photoOriginal?: string; // Original uploaded image base64
  photoEnhanced?: string; // Optimized enhanced image base64
  printStatus?: PrintStatus;
  hasPhoto?: boolean;
  updatedAt?: string;
}

export type CardSide = 'front' | 'back' | 'payment' | 'both';

export interface PageLayout {
  cardsPerPage: 1 | 2 | 4 | 6 | 8;
  showFront: boolean;
  showBack: boolean;
  doubleSidedMode: 'side-by-side' | 'independent-pages';
}

export interface StudentBalance {
  studentId: string;
  amountDue: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  updatedAt: string;
}

export interface DepartmentalClearance {
  id: string;
  studentId: string;
  department: 'Bursar' | 'Library' | 'Headteacher' | 'Meals' | 'Gate';
  status: 'Cleared' | 'Hold';
  remarks?: string;
  clearedBy?: string;
  approvedAt?: string;
}

export interface PrintQueueItem {
  id: string;
  studentId: string;
  queuedAt: string;
  status: 'Queued' | 'Printed' | 'Failed';
}

export interface NamingPattern {
  id: string;
  name: string;
  pattern: string; // Regex string e.g. "^Senior\s*([1-6])\s*([A-C]|Arts|Sciences?)$"
  classGroup: number; // 1-indexed regex group for Class
  streamGroup: number; // 1-indexed regex group for Stream
  isSystem: boolean; // Protect default rules from deletion
}

export interface Teacher {
  id: string;
  username: string;
  name: string;
  gender?: string;
  subjects: string[];
  classes: string[];
  assignments?: { subject: string, grade_class: string }[];
  classTeacherFor?: string[];
  position?: string;
  signature?: string;
  photo?: string;
  status?: string;
  createdAt?: string;
  hasSignature?: boolean;
}

export interface OLevelMark {
  id?: number;
  student_id: string;
  name?: string;
  adminNo?: string;
  subject: string;
  integration1: number | null;
  integration2: number | null;
  integration3: number | null;
  exam_score: number | null;
  term: string;
  year: number;
  teacher_id?: string;
  status: 'Draft' | 'Submitted' | 'Approved';
  updatedAt?: string;
}

export interface UACEMark {
  id?: number;
  student_id: string;
  name?: string;
  adminNo?: string;
  subject: string;
  subject_type: 'Principal' | 'Subsidiary' | 'General Paper';
  score: number;
  grade?: string;
  points?: number;
  term: string;
  year: number;
  teacher_id?: string;
  status: 'Draft' | 'Submitted' | 'Approved';
  updatedAt?: string;
}

export interface AuthSession {
  role: 'admin' | 'teacher' | 'student';
  user: {
    id?: string;
    name: string;
    username: string;
    subjects?: string[];
    classes?: string[];
    assignments?: { subject: string; grade_class: string }[];
    adminNo?: string;
    gradeClass?: string;
  };
}

export interface DatabaseConfig {
  serverIp: string;
  serverPort: number;
  databaseHost: string;
  databasePort: number;
  databaseName: string;
  databaseUsername: string;
  databasePassword: string;
}

export interface DatabaseConnectionStatus {
  connected: boolean;
  lastSuccessfulConnection: string | null;
  lastConnectionAttempt: string | null;
  errorMessage: string | null;
  connectionMode: 'network' | 'offline';
}
