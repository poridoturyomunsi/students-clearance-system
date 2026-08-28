import { Student } from '../types.ts';

// In Electron dev/prod, use localhost; in browser use the configured IP
// Default API base URL:
// - In Electron (renderer) we keep localhost:3000 for the bundled backend.
// - In browser/dev server use a relative path so Vite proxy or same-origin works.
let apiBaseUrl = import.meta.env.VITE_API_URL || '';

if (typeof window !== 'undefined' && (window as any).electron) {
  try {
    const configStr = (window as any).electron.readDataSync('db_config');
    if (configStr) {
      const config = JSON.parse(configStr);
      if (config.mode === 'client' && config.serverUrl) {
        apiBaseUrl = config.serverUrl;
      } else if (config.serverUrl) {
        apiBaseUrl = config.serverUrl;
      } else if (config.serverIp) {
        apiBaseUrl = `http://${config.serverIp}:${config.serverPort || 3000}`;
      } else {
        apiBaseUrl = 'http://localhost:3000';
      }
    } else {
      apiBaseUrl = 'http://localhost:3000';
    }
  } catch (e) {
    console.warn("Failed to load database config synchronously, falling back to localhost...", e);
    apiBaseUrl = 'http://localhost:3000';
  }
}

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.trim().replace(/\/$/, ''); // strip trailing slash
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

import { fetchWithPerf } from './fetchWithPerf';
import { getCached, setCached, simpleApiCache } from './api_cache';

export async function apiCall(path: string, options: RequestInit = {}) {
  const url = `${apiBaseUrl}${path}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('spss_token') : null;
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const method = (options && (options.method || 'GET')).toUpperCase();

  // Clear cache on mutations to avoid stale data
  if (method !== 'GET') {
    try {
      simpleApiCache.clear();
    } catch (e) {}
  }

  // Simple in-memory cache for small GET endpoints
  const cacheablePaths = [
    '/api/classes',
    '/api/streams',
    '/api/stats',
    '/api/branding',
    '/api/teachers',
    '/api/subjects',
    '/api/class-teachers',
    '/api/settings'
  ];
  if (method === 'GET' && cacheablePaths.some(p => path.startsWith(p))) {
    const cached = getCached(url);
    if (cached) return cached;
  }

  // 30-second request timeout mechanism (increased from 5s for debugging)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 30000);

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    signal: controller.signal
  };

  try {
    const response = await fetchWithPerf(url, config);
    clearTimeout(timeoutId);
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/api/auth/')) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('spss_session');
          localStorage.removeItem('spss_token');
          window.dispatchEvent(new Event('spss_unauthorized'));
        }
      }
      let errMsg = `HTTP error! status: ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.error) {
          errMsg = errJson.error;
        }
      } catch (e) {
        // use default
      }
      throw new Error(errMsg);
    }
    const json = await response.json();
    if (method === 'GET' && cacheablePaths.some(p => path.startsWith(p))) {
      try { setCached(url, json, 60 * 1000); } catch (e) {}
    }
    return json;
  } catch (err: any) {
    clearTimeout(timeoutId);
    let finalErr = err;
    if (err.name === 'AbortError') {
      finalErr = new Error('Database/API request timed out (server did not respond within 30 seconds).');
    }
    console.error(`API Call failed on ${url}:`, finalErr);
    throw finalErr;
  }
}

export async function fetchStudentsFromDb(params?: {
  page?: number;
  limit?: number;
  search?: string;
  name?: string;
  adminNo?: string;
  gradeClass?: string;
  level?: string;
  stream?: string;
  gender?: string;
  isCleared?: string;
  boardingStatus?: string;
  photo?: string;
  printStatus?: string;
  academicYear?: string;
  sortBy?: string;
}): Promise<{ data: Student[]; total: number; page: number; limit: number }> {
  let queryString = '';
  const mergedParams = { limit: -1, ...params };
  const queryParts = Object.entries(mergedParams)
    .filter(([_, val]) => val !== undefined && val !== null && val !== '')
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
  if (queryParts.length > 0) {
    queryString = '?' + queryParts.join('&');
  }
  return await apiCall(`/api/students${queryString}`);
}

export async function fetchPrintHistoryFromDb(): Promise<any[]> {
  return await apiCall('/api/print-history');
}

export async function fetchAuditLogsFromDb(): Promise<any[]> {
  return await apiCall('/api/audit-logs');
}

export async function generatePdfOnServer(payload: {
  layoutMode: string;
  studentIds: string[];
  filters?: any;
  printSide: string;
  increasePdfBrightness: boolean;
  showWatermark: boolean;
  watermarkOpacity: number;
  schoolLogoBase64: string | null;
}): Promise<{ success: boolean; taskId: string }> {
  return await apiCall('/api/pdf/generate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchPdfTaskStatus(taskId: string): Promise<{
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  filename: string | null;
  filePath: string | null;
  error: string | null;
  historyId?: number;
}> {
  return await apiCall(`/api/pdf/status/${taskId}`);
}

export async function fetchStudentFromDb(id: string): Promise<Student> {
  return await apiCall(`/api/students/${id}`);
}

export async function saveStudentInDb(student: Student): Promise<{ success: boolean; id: string }> {
  return await apiCall('/api/students', {
    method: 'POST',
    body: JSON.stringify(student),
  });
}

export async function updateStudentInDb(id: string, student: Student): Promise<{ success: boolean }> {
  return await apiCall(`/api/students/${id}`, {
    method: 'PUT',
    body: JSON.stringify(student),
  });
}

export async function deleteStudentInDb(id: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/students/${id}`, {
    method: 'DELETE',
  });
}

export async function saveStudentsBulkInDb(students: Student[]): Promise<{ success: boolean; count: number }> {
  return await apiCall('/api/students/bulk', {
    method: 'POST',
    body: JSON.stringify({ students }),
  });
}

export async function deleteStudentsBulkInDb(ids: string[]): Promise<{ success: boolean; count: number }> {
  return await apiCall('/api/students/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function mergeDuplicateStudentsInDb(
  keepStudentId: string,
  duplicateStudentIds: string[],
  newAdminNo?: string
): Promise<{ success: boolean; mergedCount: number; keptStudentId: string; removedStudentIds: string[] }> {
  return await apiCall('/api/admin/students/merge-duplicates', {
    method: 'POST',
    body: JSON.stringify({ keepStudentId, duplicateStudentIds, newAdminNo }),
  });
}

export async function fetchSuspectedDuplicates(): Promise<{ success: boolean; groups: any[] }> {
  return await apiCall('/api/admin/students/suspected-duplicates');
}

export async function fetchSchoolLogoFromDb(): Promise<{ logo: string | null; authorizedSignature?: string | null }> {
  return await apiCall('/api/branding');
}

export async function saveSchoolLogoInDb(logoBase64: string | null): Promise<{ success: boolean; logo?: string }> {
  return await apiCall('/api/branding', {
    method: 'POST',
    body: JSON.stringify({ logo: logoBase64 }),
  });
}

export async function saveAuthorizedSignatureInDb(sigBase64: string | null): Promise<{ success: boolean; authorizedSignature?: string }> {
  return await apiCall('/api/branding', {
    method: 'POST',
    body: JSON.stringify({ authorizedSignature: sigBase64 }),
  });
}


export async function fetchConfigStatus(): Promise<{ dbConnected: boolean; config: any }> {
  return await apiCall('/api/config-status');
}

// --- NEW MYSQL ENDPOINTS HELPERS ---
export async function fetchClassesFromDb(): Promise<{ id: number; name: string }[]> {
  return await apiCall('/api/classes');
}

export async function saveClassInDb(name: string): Promise<{ success: boolean }> {
  return await apiCall('/api/classes', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function fetchStreamsFromDb(): Promise<{ id: number; name: string }[]> {
  return await apiCall('/api/streams');
}

export async function saveStreamInDb(name: string): Promise<{ success: boolean }> {
  return await apiCall('/api/streams', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function fetchStudentMarksFromDb(studentId: string): Promise<any[]> {
  return await apiCall(`/api/marks/${studentId}`);
}

export async function saveMarkInDb(mark: {
  student_id: string;
  subject: string;
  marks_obtained: number;
  max_marks?: number;
  term: string;
  year: number;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/marks', {
    method: 'POST',
    body: JSON.stringify(mark),
  });
}

export async function deleteMarkInDb(id: number): Promise<{ success: boolean }> {
  return await apiCall(`/api/marks/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchStudentAttendanceFromDb(studentId: string): Promise<any[]> {
  return await apiCall(`/api/attendance/${studentId}`);
}

export async function saveAttendanceInDb(log: {
  student_id: string;
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  remarks?: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/attendance', {
    method: 'POST',
    body: JSON.stringify(log),
  });
}

export async function fetchStudentFeesFromDb(studentId: string): Promise<any[]> {
  return await apiCall(`/api/fees/${studentId}`);
}

export async function saveFeesInDb(feeRecord: {
  student_id: string;
  term: string;
  year: number;
  amount_due: number;
  amount_paid: number;
  payment_status?: 'Paid' | 'Pending' | 'Overdue';
}): Promise<{ success: boolean }> {
  return await apiCall('/api/fees', {
    method: 'POST',
    body: JSON.stringify(feeRecord),
  });
}

export async function recordPaymentInDb(payment: {
  student_id: string;
  term: string;
  year: number;
  amount_paid: number;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/fees/payment', {
    method: 'POST',
    body: JSON.stringify(payment),
  });
}

export async function fetchIntegratedStudentData(studentNo: string): Promise<{
  student: Student;
  marks: any[];
  attendance: any[];
  fees: any[];
}> {
  return await apiCall(`/api/integration/student/${studentNo}`);
}

export async function fetchStatsFromDb(): Promise<any> {
  return await apiCall('/api/stats');
}

export async function loginUser(payload: any): Promise<any> {
  return await apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchTeacherClasses(teacherId: string): Promise<any> {
  return await apiCall(`/api/teacher/classes?teacherId=${encodeURIComponent(teacherId)}`);
}

export async function fetchTeacherStudents(gradeClass: string): Promise<any[]> {
  return await apiCall(`/api/teacher/students?gradeClass=${encodeURIComponent(gradeClass)}`);
}

export async function fetchTeacherMarks(params: {
  gradeClass: string;
  subject: string;
  term: string;
  year: number;
  paper?: number;
}): Promise<any[]> {
  const paperParam = params.paper !== undefined ? `&paper=${params.paper}` : '';
  return await apiCall(`/api/teacher/marks?gradeClass=${encodeURIComponent(params.gradeClass)}&subject=${encodeURIComponent(params.subject)}&term=${encodeURIComponent(params.term)}&year=${params.year}${paperParam}`);
}

export async function saveTeacherMarks(payload: any): Promise<any> {
  return await apiCall('/api/teacher/marks', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function submitTeacherMarks(payload: any): Promise<any> {
  // Approval workflow removed. Keep compatibility by returning success.
  return { success: true };
}

export async function fetchPendingMarks(): Promise<any[]> {
  // Approval workflow removed. No pending marks concept anymore.
  return [];
}

export async function approveMarks(payload: any): Promise<any> {
  // Approval workflow removed. Keep compatibility by returning success.
  return { success: true };
}

export async function promoteStudents(payload: any): Promise<any> {
  return await apiCall('/api/admin/promote', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function generateReportCards(payload: {
  studentIds: string[];
  term: string;
  year: number;
}): Promise<{ success: boolean; taskId: string }> {
  return await apiCall('/api/pdf/generate-reports', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchStudentReportData(studentId: string): Promise<any> {
  return await apiCall(`/api/reports/${studentId}`);
}

export async function fetchSettings(): Promise<any> {
  return await apiCall('/api/settings');
}

export async function saveSettings(payload: any): Promise<any> {
  return await apiCall('/api/settings', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchTeachers(): Promise<any[]> {
  return await apiCall('/api/teachers');
}

export async function fetchTeacherSignature(id: string): Promise<any> {
  return await apiCall(`/api/teachers/${id}/signature`);
}

export async function createTeacher(payload: any): Promise<any> {
  return await apiCall('/api/teachers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateTeacher(id: string, payload: any): Promise<any> {
  return await apiCall(`/api/teachers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteTeacher(id: string): Promise<any> {
  return await apiCall(`/api/teachers/${id}`, {
    method: 'DELETE'
  });
}

export async function importTeachers(teachers: any[]): Promise<any> {
  return await apiCall('/api/teachers/import', {
    method: 'POST',
    body: JSON.stringify({ teachers })
  });
}

export async function fetchClassTeachers(): Promise<any[]> {
  return await apiCall('/api/class-teachers');
}

export async function saveClassTeacher(payload: { gradeClass: string; teacherId: string | null }): Promise<any> {
  return await apiCall('/api/class-teachers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchAllWorksheets(): Promise<any[]> {
  return await apiCall('/api/admin/marks/all-worksheets');
}

export async function approveBulkMarks(payload: {
  classVal: string;
  stream: string;
  subject: string;
  term: string;
  year: number;
  action: 'Approve' | 'Reopen';
  approvedBy?: string;
}): Promise<any> {
  // Approval workflow removed. Keep compatibility by returning success.
  return { success: true };
}

export async function searchStudentsWithMarks(payload: {
  term: string;
  year: number;
  search?: string;
  gradeClass?: string;
  stream?: string;
  gender?: string;
  performanceGrade?: string;
  reportStatus?: string;
  boardingStatus?: string;
}): Promise<{ data: any[] }> {
  return await apiCall('/api/admin/students/search-with-marks', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function changeStudentPassword(payload: {
  studentId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/student/change-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchAdminStudentAccounts(params?: {
  search?: string;
  gradeClass?: string;
  stream?: string;
  status?: string;
  needsPasswordChange?: string;
}): Promise<{ data: any[] }> {
  let queryString = '';
  if (params) {
    const queryParts = Object.entries(params)
      .filter(([_, val]) => val !== undefined && val !== null && val !== '')
      .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    if (queryParts.length > 0) {
      queryString = '?' + queryParts.join('&');
    }
  }
  return await apiCall(`/api/admin/student-accounts${queryString}`);
}

export async function resetStudentPassword(payload: {
  studentId: string;
  approvedBy?: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/admin/student-accounts/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function resetBulkStudentPasswords(payload: {
  studentIds: string[];
  approvedBy?: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/admin/student-accounts/bulk-reset', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateBulkStudentStatus(payload: {
  studentIds: string[];
  status: 'Active' | 'Inactive';
  approvedBy?: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/admin/student-accounts/bulk-status', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createStudentAccountManual(payload: {
  studentId: string;
  approvedBy?: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/admin/student-accounts/create-manual', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createBulkStudentAccountsManual(payload: {
  studentIds: string[];
  approvedBy?: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/admin/student-accounts/bulk-create', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchAnnouncements(): Promise<{ data: any[] }> {
  return await apiCall('/api/announcements');
}

export async function createAnnouncement(payload: {
  title: string;
  content: string;
  author?: string;
}): Promise<{ success: boolean }> {
  return await apiCall('/api/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function deleteAnnouncement(id: number | string): Promise<{ success: boolean }> {
  return await apiCall(`/api/admin/announcements/${id}`, {
    method: 'DELETE'
  });
}

// Database Configuration Management Functions
export async function fetchDatabaseConfig(): Promise<{ success: boolean; config: any }> {
  return await apiCall('/api/database-config');
}

export async function saveDatabaseConfig(config: {
  mode?: string;
  serverIp: string;
  serverPort: number;
  databaseHost: string;
  databasePort: number;
  databaseName: string;
  databaseUsername: string;
  databasePassword: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  return await apiCall('/api/save-db-config', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function testDatabaseConnection(config: {
  serverIp?: string;
  serverPort?: number;
  databaseHost: string;
  databasePort: number;
  databaseName: string;
  databaseUsername: string;
  databasePassword: string;
}): Promise<{ success: boolean; error?: string }> {
  return await apiCall('/api/test-db-connection', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function fetchDatabaseStatus(): Promise<{
  connected: boolean;
  lastSuccessfulConnection: string | null;
  connectionMode: string;
  config: any;
}> {
  return await apiCall('/api/database-status');
}

export async function askAiAssistant(question: string): Promise<{
  question: string;
  sql: string | null;
  answer: string;
  columns: string[];
  rows: any[];
}> {
  return await apiCall('/api/ai/ask', {
    method: 'POST',
    body: JSON.stringify({ question })
  });
}

export async function saveGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  return await apiCall('/api/ai/save-api-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey })
  });
}

export async function fetchAiKeyStatus(): Promise<{ configured: boolean }> {
  return await apiCall('/api/ai/key-status');
}

export async function testAiConnection(apiKey?: string): Promise<{ success: boolean; message: string }> {
  return await apiCall('/api/ai/test-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey })
  });
}

export async function triggerFileDownload(url: string, filename: string): Promise<void> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('spss_token') : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const blob = await response.blob();
    
    if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const resultStr = reader.result as string;
          const base64 = resultStr.substring(resultStr.indexOf(',') + 1);
          resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

      const ext = filename.split('.').pop() || 'pdf';
      const result = await (window as any).electron.saveFileBase64(filename, base64Data, [
        { name: `${ext.toUpperCase()} Documents`, extensions: [ext] }
      ]);
      if (result.success) {
        alert(`File saved successfully to:\n${result.filePath}`);
      } else if (result.error !== 'Cancelled') {
        alert(`Failed to save file: ${result.error}`);
      }
    } else {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.target = '_self';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    }
  } catch (e: any) {
    console.error('Failed to download file:', e);
    alert(`Failed to download file: ${e.message}`);
  }
}

export async function uploadImage(base64Image: string, publicId?: string): Promise<{ success: boolean; url: string }> {
  return await apiCall('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ image: base64Image, publicId }),
  });
}

export async function fetchParentContacts(studentId: string): Promise<any> {
  return await apiCall(`/api/parent-contacts/${studentId}`);
}

export async function saveParentContacts(studentId: string, data: any): Promise<{ success: boolean }> {
  return await apiCall(`/api/parent-contacts/${studentId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function scanGateCard(data: {
  scanValue: string;
  gateId?: number | null;
  deviceId?: string | null;
  operatorName?: string;
  gps?: string;
  direction?: 'clock-in' | 'clock-out' | 'auto';
  departureReason?: string;
}): Promise<{ success: boolean; direction: 'in' | 'out'; student: any; log: any; message: string }> {
  return await apiCall('/api/attendance/scan', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchAttendanceDashboard(): Promise<any> {
  return await apiCall('/api/attendance/dashboard');
}

export async function fetchAttendanceGrid(period: string = 'today'): Promise<any> {
  return await apiCall(`/api/attendance/grid?period=${encodeURIComponent(period)}`);
}

export async function fetchAttendanceLogs(filters: {
  startDate?: string;
  endDate?: string;
  gradeClass?: string;
  stream?: string;
  status?: string;
  boardingStatus?: string;
  gender?: string;
  search?: string;
}): Promise<any[]> {
  const queryParams = new URLSearchParams(filters as any).toString();
  return await apiCall(`/api/attendance/logs?${queryParams}`);
}

export async function fetchStudentGateHistory(studentId: string): Promise<any[]> {
  return await apiCall(`/api/attendance/student/${studentId}`);
}

export async function fetchGatePermissions(): Promise<any[]> {
  return await apiCall('/api/attendance/permissions');
}

export async function saveGatePermission(data: {
  student_id: string;
  reason: string;
  approved_by: string;
  time_out: string;
  expected_return: string;
  remarks?: string;
}): Promise<{ success: boolean; id: number }> {
  return await apiCall('/api/attendance/permissions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function returnStudentPermission(id: number, data?: { actual_return?: string; status?: string; remarks?: string }): Promise<{ success: boolean }> {
  return await apiCall(`/api/attendance/permissions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data || {}),
  });
}

export async function fetchStaffProfile(staffId: string): Promise<any> {
  return await apiCall(`/api/staff/${staffId}`);
}

export async function fetchGateLocations(): Promise<any[]> {
  return await apiCall('/api/attendance/locations');
}

export async function saveGateLocation(data: { name: string; status?: string }): Promise<{ success: boolean }> {
  return await apiCall('/api/attendance/locations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteGateLocation(id: number): Promise<{ success: boolean }> {
  return await apiCall(`/api/attendance/locations/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchGateDevices(): Promise<any[]> {
  return await apiCall('/api/attendance/devices');
}

export async function saveGateDevice(data: { id: string; name: string; device_type: string; status?: string }): Promise<{ success: boolean }> {
  return await apiCall('/api/attendance/devices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteGateDevice(id: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/attendance/devices/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchAttendanceSettings(): Promise<any> {
  return await apiCall('/api/attendance/settings');
}

export async function saveAttendanceSettings(settings: any): Promise<{ success: boolean }> {
  return await apiCall('/api/attendance/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export async function fetchNotificationAuditLogs(filters: {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
} = {}): Promise<any[]> {
  const queryParams = new URLSearchParams(filters as any).toString();
  return await apiCall(`/api/attendance/notification-audit-logs?${queryParams}`);
}


export async function fetchParentPortalData(studentId: string): Promise<any> {
  return await apiCall(`/api/parent/student-data/${studentId}`);
}

export async function fetchBackups(): Promise<{ success: boolean; backups: any[] }> {
  return await apiCall('/api/admin/backups');
}

export async function runBackup(): Promise<{ success: boolean; taskId: string }> {
  return await apiCall('/api/admin/backups/run', { method: 'POST' });
}

export async function restoreBackup(filename: string): Promise<{ success: boolean; taskId: string }> {
  return await apiCall('/api/admin/backups/restore', {
    method: 'POST',
    body: JSON.stringify({ filename })
  });
}

export async function deleteBackup(filename: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/admin/backups/${encodeURIComponent(filename)}`, {
    method: 'DELETE'
  });
}

export async function fetchBackupConfig(): Promise<{ autoBackupEnabled: boolean; retentionDays: number }> {
  return await apiCall('/api/admin/backups/config');
}

export async function saveBackupConfig(config: { autoBackupEnabled: boolean; retentionDays: number }): Promise<{ success: boolean }> {
  return await apiCall('/api/admin/backups/config', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function saveStudentsBulkInDbTask(students: Student[]): Promise<{ success: boolean; taskId: string }> {
  return await apiCall('/api/students/bulk-task', {
    method: 'POST',
    body: JSON.stringify({ students })
  });
}

export async function calculateRankingsTask(term: string, year: number): Promise<{ success: boolean; taskId: string }> {
  return await apiCall('/api/admin/calculate-rankings', {
    method: 'POST',
    body: JSON.stringify({ term, year })
  });
}

import { Staff, LeaveRequest, TimetableSlot } from '../types';

export async function fetchStaffList(params?: {
  category?: string;
  department?: string;
  status?: string;
  search?: string;
}): Promise<Staff[]> {
  let queryString = '';
  if (params) {
    const queryParts = Object.entries(params)
      .filter(([_, val]) => val !== undefined && val !== null && val !== '')
      .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    if (queryParts.length > 0) {
      queryString = '?' + queryParts.join('&');
    }
  }
  return await apiCall(`/api/staff${queryString}`);
}

export async function fetchStaffMember(id: string): Promise<Staff> {
  return await apiCall(`/api/staff/${id}`);
}

export async function createStaffMember(payload: Partial<Staff>): Promise<{ success: boolean; id: string; username: string }> {
  return await apiCall('/api/staff', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateStaffMember(id: string, payload: Partial<Staff>): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteStaffMember(id: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${id}`, {
    method: 'DELETE'
  });
}

export async function resetStaffPassword(id: string): Promise<{ success: boolean; message: string }> {
  return await apiCall(`/api/staff/${id}/reset-password`, {
    method: 'POST'
  });
}

export async function updateStaffStatus(id: string, status: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status })
  });
}

export async function activateStaffCard(id: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${id}/card/activate`, {
    method: 'POST'
  });
}

export async function deactivateStaffCard(id: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${id}/card/deactivate`, {
    method: 'POST'
  });
}

export async function revokeStaffCard(id: string): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${id}/card/revoke`, {
    method: 'POST'
  });
}

export async function reissueStaffCard(id: string, issueDate?: string, expiryDate?: string): Promise<{ success: boolean, cardId: string, verificationToken: string }> {
  return await apiCall(`/api/staff/${id}/card/reissue`, {
    method: 'POST',
    body: JSON.stringify({ issueDate, expiryDate })
  });
}

export async function regenerateStaffQr(id: string): Promise<{ success: boolean, verificationToken: string }> {
  return await apiCall(`/api/staff/${id}/card/regenerate-qr`, {
    method: 'POST'
  });
}

export async function changeStaffPassword(payload: { oldPassword: string; newPassword: string }): Promise<{ success: boolean }> {
  return await apiCall('/api/staff/change-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function importStaffBulk(staff: any[]): Promise<{ success: boolean; report: { success: any[]; skipped: any[]; errors: any[] } }> {
  return await apiCall('/api/staff/import', {
    method: 'POST',
    body: JSON.stringify({ staff })
  });
}

export async function fetchStaffLeaveRequests(staffId: string): Promise<LeaveRequest[]> {
  return await apiCall(`/api/staff/${staffId}/leave-requests`);
}

export async function submitLeaveRequest(staffId: string, payload: Partial<LeaveRequest>): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${staffId}/leave-requests`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchAllLeaveRequestsAdmin(): Promise<LeaveRequest[]> {
  return await apiCall('/api/admin/leave-requests');
}

export async function updateLeaveRequestAdmin(id: number, payload: { status: string; remarks?: string; approvedBy?: string }): Promise<{ success: boolean }> {
  return await apiCall(`/api/admin/leave-requests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function fetchStaffTimetable(staffId: string): Promise<TimetableSlot[]> {
  return await apiCall(`/api/staff/${staffId}/timetable`);
}

export async function saveStaffTimetable(staffId: string, slots: TimetableSlot[]): Promise<{ success: boolean }> {
  return await apiCall(`/api/staff/${staffId}/timetable`, {
    method: 'POST',
    body: JSON.stringify({ slots })
  });
}

export async function fetchStaffReports(): Promise<{
  totals: { count: number; category: string }[];
  gender: { count: number; gender: string }[];
  departments: { count: number; department: string }[];
  status: { count: number; status: string }[];
  newThisYear: number;
}> {
  return await apiCall('/api/reports/staff');
}

export async function verifyDocumentToken(token: string): Promise<{
  success: boolean;
  status: string;
  documentType?: string;
  error?: string;
  metadata?: {
    name: string;
    photo: string | null;
    category?: string;
    department?: string;
    position?: string;
    employmentStatus?: string;
    issueDate?: string;
    expiryDate?: string;
    status?: string;
    [key: string]: any;
  };
}> {
  return await apiCall(`/api/verify/${token}`);
}


