/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, lazy, Suspense, useRef, useCallback } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Printer,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit2,
  UserPlus,
  BookOpen,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  SlidersHorizontal,
  ArrowRightLeft,
  Info,
  Calendar,
  ClipboardList,
  Check,
  Users,
  Utensils,
  LogOut,
  Upload,
  Award,
  Camera,
  Paintbrush,
  Sparkles,
  Database,
  Server,
  Wifi,
  X,
  Settings,
  History,
  Menu,
  Clock
} from 'lucide-react';
import { Student, ClearanceStatus, BoardingStatus } from './types.ts';
import { getStudentsAsync, saveStudentsAsync, SCHOOL_CLASSES, INITIAL_STUDENTS } from './data.ts';
import { 
  loadStudentsFromFirestore, 
  saveStudentsToFirestore, 
  saveStudentInFirestore,
  deleteStudentInFirestore,
  deleteMultipleStudentsInFirestore,
  loadBrandingFromFirestore, 
  saveBrandingToFirestore, 
  deleteBrandingFromFirestore 
} from './lib/firebaseStore.ts';
import { auth, ensureSignedIn, GoogleAuthProvider, signInWithPopup, signOut, isFallbackDbActive } from './lib/firebase.ts';
import firebaseConfig from '../firebase-applet-config.json';
import { onAuthStateChanged, User } from 'firebase/auth';
import Loading from './components/Loading.tsx';

function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig && 
    firebaseConfig.apiKey && 
    !firebaseConfig.apiKey.includes('remixed') && 
    firebaseConfig.projectId && 
    !firebaseConfig.projectId.includes('remixed')
  );
}

import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import SchoolLogo, { DEFAULT_SCHOOL_LOGO } from './components/SchoolLogo.tsx';
import { generateClearancePdf } from './utils/pdfGenerator.ts';
import { removeLogoBackground, processStudentPhoto, analyzeImageQuality, compressStudentPhoto, BackgroundQualityReport } from './utils/imageProcessor.ts';
// Lazy-load Dashboard to keep startup light
import SidebarLayout from './components/SidebarLayout.tsx';
import AiAssistantPopup from './components/AiAssistantPopup.tsx';

// UI modules and utilities statically imported to prevent dynamic import fetch errors
import ClearanceCard from './components/ClearanceCard.tsx';
import BulkPhotoMatcher from './components/BulkPhotoMatcher.tsx';
import WebcamCapture from './components/WebcamCapture.tsx';
import ManualBackgroundEditor from './components/ManualBackgroundEditor.tsx';
import LoginGateway from './components/LoginGateway.tsx';
import StudentPortal from './components/StudentPortal.tsx';
import StudentForcePasswordChange from './components/StudentForcePasswordChange.tsx';
import StaffPortal from './components/StaffPortal.tsx';
import DocumentVerificationPortal from './components/DocumentVerificationPortal.tsx';
import AdminPortalExtensions from './components/AdminPortalExtensions.tsx';
import AdminSettingsView from './components/AdminSettingsView.tsx';

// Statically imported feature modules
import StudentsModule from './components/modules/StudentsModule.tsx';
import StaffModule from './components/modules/StaffModule.tsx';
import SubjectsModule from './components/modules/SubjectsModule.tsx';
import ExamsModule from './components/modules/ExamsModule.tsx';
import ClearanceModule from './components/modules/ClearanceModule.tsx';
import FeesModule from './components/modules/FeesModule.tsx';
import AttendanceModule from './components/modules/AttendanceModule.tsx';
import ParentPortal from './components/ParentPortal.tsx';
import SettingsModule from './components/modules/SettingsModule.tsx';
import AiAssistantModule from './components/modules/AiAssistantModule.tsx';
import {
  setApiBaseUrl,
  getApiBaseUrl,
  fetchStudentsFromDb,
  saveStudentInDb,
  uploadImage,
  deleteStudentInDb,
  saveStudentsBulkInDb,
  deleteStudentsBulkInDb,
  mergeDuplicateStudentsInDb,
  fetchSchoolLogoFromDb,
  saveSchoolLogoInDb,
  fetchConfigStatus,
  fetchDatabaseConfig,
  fetchDatabaseStatus,
  testDatabaseConnection,
  fetchPrintHistoryFromDb,
  fetchAuditLogsFromDb,
  generatePdfOnServer,
  fetchPdfTaskStatus,
  fetchStudentFromDb,
  fetchStatsFromDb,
  fetchClassTeachers,
  generateReportCards,
  triggerFileDownload,
  fetchParentContacts,
  saveParentContacts,
  fetchStudentGateHistory,
  saveStudentsBulkInDbTask,
  calculateRankingsTask
} from './utils/api.ts';

// Top-level helper so it's available before App renders
function parseClassAndStream(combined: string): { className: string; streamName: string } {
  if (!combined) return { className: '', streamName: '' };
  let normalized = combined.trim();
  const sNoDotMatch = normalized.match(/^[sS]([1-6])(\s.*|$)/);
  if (sNoDotMatch) {
    normalized = 'S.' + sNoDotMatch[1] + sNoDotMatch[2];
  }
  const parts = normalized.split(/\s+/);
  if (parts.length >= 2) return { className: parts[0], streamName: parts.slice(1).join(' ') };
  const m = normalized.match(/^(.*?)([A-Za-z])$/);
  if (m) return { className: m[1], streamName: m[2] };
  return { className: normalized, streamName: '' };
}

// Normalize grade class from Excel text
function normalizeGradeClass(input: string): string {
  if (!input) return SCHOOL_CLASSES[0];
  const clean = input.trim().toLowerCase().replace(/\s+/g, ' ');
  
  const sMatch = clean.match(/^(?:s|senior|s\.)\s*([1-6])\s*(a|b|c|arts|science|sciences)?$/);
  if (sMatch) {
    const num = sMatch[1];
    let stream = sMatch[2] || '';
    
    if (stream.includes('arts')) {
      stream = 'Arts';
    } else if (stream.includes('science')) {
      stream = 'Sciences';
    } else {
      stream = stream.toUpperCase();
    }
    
    if (['1', '2', '3', '4'].includes(num)) {
      if (!stream || !['A', 'B', 'C'].includes(stream)) {
        stream = 'A';
      }
      return `S.${num} ${stream}`;
    } else if (['5', '6'].includes(num)) {
      if (!stream || !['Arts', 'Sciences'].includes(stream)) {
        stream = 'Sciences';
      }
      return `S.${num} ${stream}`;
    }
  }
  
  const matched = SCHOOL_CLASSES.find(sc => sc.toLowerCase() === clean);
  if (matched) return matched;
  return SCHOOL_CLASSES[0];
}

const STREAM_ORDER = ['A', 'B', 'C', 'Arts', 'Sciences'];
const orderStreams = (streams: string[]) => {
  const uniqueStreams = Array.from(new Set(streams));
  return uniqueStreams.sort((a, b) => {
    const aIndex = STREAM_ORDER.indexOf(a);
    const bIndex = STREAM_ORDER.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
};

function resolveInitialModule(): string {
  return 'clearance';
}

function clearLegacyClearanceRouteCache() {
  try {
    localStorage.removeItem('legacy_clearance_route');
    localStorage.removeItem('old_clearance_page');
    localStorage.removeItem('previous_route');
    localStorage.removeItem('lastRoute');
    localStorage.removeItem('lastPath');
    localStorage.removeItem('lastVisited');
  } catch (e) {
    // ignore if storage unavailable
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function AppContent() {
  const [activeModule, setActiveModule] = useState<string | null>(resolveInitialModule());
  // Ensure `schoolLogo` state is initialized early to avoid TDZ errors
  const [schoolLogo, setSchoolLogo] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('clearance_printer_school_logo');
      if (cached) return cached;
    }
    return DEFAULT_SCHOOL_LOGO;
  });
  const [authorizedSignature, setAuthorizedSignature] = useState<string | null>(null);

  const [authSession, setAuthSession] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('spss_session');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore parse errors
    }
    return null;
  });
  const [adminUser, setAdminUser] = useState<any>(null);
  const [dbConfig, setDbConfig] = useState<any>(null);
  const [dbStats, setDbStats] = useState<any>({});
  const [dbConnectionError, setDbConnectionError] = useState<boolean>(false);
  const [syncQueueCount, setSyncQueueCount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [hasSetInitialModule, setHasSetInitialModule] = useState<boolean>(false);

  // UI filters, sorting and view state used throughout the admin lists
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchInputValue, setSearchInputValue] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('All');
  const [lowerExpanded, setLowerExpanded] = useState<boolean>(true);
  const [upperExpanded, setUpperExpanded] = useState<boolean>(true);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({
    'S.1': false,
    'S.2': false,
    'S.3': false,
    'S.4': false,
    'S.5': false,
    'S.6': false
  });
  const [filterClass, setFilterClass] = useState<string>('All');
  const [filterStream, setFilterStream] = useState<string>('All');
  const [filterGender, setFilterGender] = useState<string>('All');
  const [filterClearance, setFilterClearance] = useState<string>('All');
  const [filterBoarding, setFilterBoarding] = useState<string>('All');
  const [filterAcademicYear, setFilterAcademicYear] = useState<string>('All');
  const [filterPhoto, setFilterPhoto] = useState<string>('All');
  const [exportScope, setExportScope] = useState<'Current' | 'All' | 'ByClass' | 'ByStream'>('Current');
  const [isTableLoading, setIsTableLoading] = useState<boolean>(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photosZipInputRef = useRef<HTMLInputElement | null>(null);
  const [exportClass, setExportClass] = useState<string>('All');
  const [exportStream, setExportStream] = useState<string>('All');
  const [exportPreset, setExportPreset] = useState<'None' | 'New' | 'WithPhotos' | 'NewWithPhotos'>('None');
  const [printNewOnly, setPrintNewOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('name');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [activeBoardClass, setActiveBoardClass] = useState<string>('S.4');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Background Tasks Queue States
  interface BackgroundTask {
    id: string;
    type: 'pdf' | 'report' | 'import' | 'ranking' | 'backup' | 'restore';
    name: string;
    status: 'processing' | 'completed' | 'failed';
    progress: number;
    total: number;
    filename: string | null;
    error: string | null;
  }
  const [bgTasks, setBgTasks] = useState<BackgroundTask[]>([]);
  const [isBgTasksOpen, setIsBgTasksOpen] = useState<boolean>(false);

  const startPollingTask = (taskId: string, targetStudentIds?: string[]) => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetchPdfTaskStatus(taskId);
        setBgTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            if (res.status === 'completed') {
              clearInterval(intervalId);
              
              if (t.status === 'processing') {
                if (res.filename) {
                  const downloadUrl = `${getApiBaseUrl()}/api/pdf/download/${res.filename}`;
                  triggerFileDownload(downloadUrl, res.filename!);
                }

                if (t.type === 'import' || t.type === 'restore') {
                  // Reload students list if we imported students or restored database
                  loadStudentsFromServer();
                }

                if (t.type === 'pdf') {
                  setStudents(prevStudents => {
                    const updated = Array.isArray(prevStudents) ? prevStudents.map(s => {
                      if (targetStudentIds && targetStudentIds.includes(s.id)) {
                        return { ...s, printStatus: 'Printed' as const };
                      }
                      return s;
                    }) : [];
                    
                    // Persist local cache asynchronously
                    saveStudentsAsync(updated).catch(e => console.warn('Local cache save failed:', e));
                    
                    // Persist to MySQL and Firestore databases asynchronously
                    const changed = updated.filter(s => {
                      const original = (prevStudents || []).find(o => o.id === s.id);
                      return original && original.printStatus !== s.printStatus;
                    });
                    if (changed.length > 0) {
                      if (!dbConnectionError) {
                        saveStudentsBulkInDb(changed).catch(e => console.error('MySQL bulk update failed:', e));
                      }
                      if (isFirebaseConfigured()) {
                        Promise.all(changed.map(s => saveStudentInFirestore(s))).catch(e => console.warn('Firestore sync failed:', e));
                      }
                    }
                    return updated;
                  });
                }
              }
              return {
                ...t,
                status: 'completed',
                progress: res.total,
                total: res.total,
                filename: res.filename
              };
            } else if (res.status === 'failed') {
              clearInterval(intervalId);
              return {
                ...t,
                status: 'failed',
                error: res.error || 'Failed to complete task.'
              };
            } else {
              return {
                ...t,
                progress: res.progress,
                total: res.total
              };
            }
          }
          return t;
        }));
      } catch (err: any) {
        console.error('Error polling task status:', err);
      }
    }, 1500);
  };

  const handleAddTask = useCallback((task: {
    type: 'pdf' | 'report' | 'import' | 'ranking' | 'backup' | 'restore';
    name: string;
    taskId: string;
    total: number;
    targetStudentIds?: string[];
  }) => {
    setBgTasks(prev => [
      ...prev,
      {
        id: task.taskId,
        type: task.type,
        name: task.name,
        status: 'processing',
        progress: 0,
        total: task.total,
        filename: null,
        error: null
      }
    ]);
    setIsBgTasksOpen(true);
    startPollingTask(task.taskId, task.targetStudentIds);
  }, []);

  // PDF export / print controls (initialize to safe defaults)
  const [pdfExportScope, setPdfExportScope] = useState<'selected' | 'first-n' | 'custom-range' | 'all'>('selected');
  const [pdfExportCount, setPdfExportCount] = useState<number>(50);
  const [pdfExportStart, setPdfExportStart] = useState<number>(1);
  const [pdfExportEnd, setPdfExportEnd] = useState<number>(50);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [reportProgress, setReportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isCompilingReport, setIsCompilingReport] = useState<boolean>(false);

  // Missing Print Settings & Document Layout States
  const [pdfLayoutMode, setPdfLayoutMode] = useState<'front-back-paired' | 'printable-grid'>('front-back-paired');
  const [printSide, setPrintSide] = useState<'front' | 'back' | 'both'>('both');
  const [enablePhotoEnhancement, setEnablePhotoEnhancement] = useState<boolean>(true);
  const [increasePdfBrightness, setIncreasePdfBrightness] = useState<boolean>(true);
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(25);
  const [highQualityPrintMode, setHighQualityPrintMode] = useState<boolean>(true);
  const [previewCardSide, setPreviewCardSide] = useState<'front' | 'back' | 'payment' | 'both' | 'payment-only' | 'august-only'>('both');
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);

  // Missing Database Configuration & Diagnostic States
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dbFormConfig, setDbFormConfig] = useState<any>({
    mode: 'network',
    db: { host: '', port: 3306, database: '', user: '', password: '' },
    serverUrl: ''
  });

  // Missing Bulk Import & Export States
  const [bulkInput, setBulkInput] = useState<string>('');
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);
  const [queueSuccessMessage, setQueueSuccessMessage] = useState<string | null>(null);
  const [queueCountInput, setQueueCountInput] = useState<number>(50);
  const [selectedStreamForQueue, setSelectedStreamForQueue] = useState<string>('A');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);
  const [exportedStudentsCount, setExportedStudentsCount] = useState<number | null>(null);
  const [lastExportedStudents, setLastExportedStudents] = useState<Student[]>([]);

  // Missing Print History, Logs & Teachers States
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [printHistory, setPrintHistory] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [isProcessingPhotosZip, setIsProcessingPhotosZip] = useState<boolean>(false);
  const [photosZipProgress, setPhotosZipProgress] = useState<string>('');

  const loadHistoryAndLogs = async () => {
    setLoadingHistory(true);
    setLoadingLogs(true);
    try {
      const history = await fetchPrintHistoryFromDb();
      if (Array.isArray(history)) {
        setPrintHistory(history);
      }
    } catch (e) {
      console.error("Failed to load print history:", e);
    } finally {
      setLoadingHistory(false);
    }

    try {
      const logs = await fetchAuditLogsFromDb();
      if (Array.isArray(logs)) {
        setAuditLogs(logs);
      }
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (!authSession || !authSession.token) return;
    let mounted = true;
    (async () => {
      try {
        const ct = await fetchClassTeachers();
        if (mounted && Array.isArray(ct)) {
          setClassTeachers(ct);
        }
      } catch (err) {
        console.warn("Failed to load class teachers:", err);
      }
    })();
    return () => { mounted = false; };
  }, [authSession]);

  // Unified app configuration and database startup initialization
  useEffect(() => {
    let mounted = true;
    const initializeApp = async () => {
      try {
        // 1. Resolve API base URL from Electron configuration if running inside Electron
        if (typeof window !== 'undefined' && (window as any).electron?.getDbConfig) {
          try {
            const loadedConfig = await (window as any).electron.getDbConfig();
            if (loadedConfig && loadedConfig.serverUrl) {
              setApiBaseUrl(loadedConfig.serverUrl);
              console.log("[App Init] Set API base URL to:", loadedConfig.serverUrl);
            }
          } catch (e) {
            console.warn("[App Init] Failed to load DB config from Electron:", e);
          }
        }

        // 2. Fetch school logo branding, database status, and stats (if authenticated) in parallel
        const promises: Promise<any>[] = [
          fetchSchoolLogoFromDb().catch(logoErr => {
            console.warn("[App Init] Failed to load branding school logo:", logoErr);
            return null;
          }),
          fetchDatabaseStatus().catch(statusErr => {
            console.warn("[App Init] Failed to load database status:", statusErr);
            return null;
          })
        ];

        if (authSession) {
          promises.push(
            fetchStatsFromDb().catch(statsErr => {
              console.warn("[App Init] Failed to load dashboard statistics:", statsErr);
              return null;
            })
          );
        }

        const [brandingRes, statusRes, statsRes] = await Promise.all(promises);

        if (mounted) {
          // Process branding logo
          // Process branding logo and authorized signature
          if (brandingRes) {
            if (brandingRes.logo) {
              setSchoolLogo(brandingRes.logo);
              localStorage.setItem('clearance_printer_school_logo', brandingRes.logo);
              console.log("[App Init] Successfully loaded branding school logo.");
            } else {
              setSchoolLogo(DEFAULT_SCHOOL_LOGO);
              localStorage.removeItem('clearance_printer_school_logo');
              localStorage.removeItem('clearance_printer_school_logo_cleaned_v2');
            }
            if (brandingRes.authorizedSignature) {
              setAuthorizedSignature(brandingRes.authorizedSignature);
            }
          }

          // Process database connection status
          if (statusRes) {
            setDbConfig(statusRes.config);
            setDbFormConfig({
              mode: statusRes.connectionMode || 'network',
              db: statusRes.config || { host: '', port: 3306, database: '', user: '', password: '' },
              serverUrl: statusRes.config ? `http://${statusRes.config.host}:${statusRes.config.port}` : ''
            });

            const isDegradedMode = !!statusRes.degraded;
            if (isDegradedMode) {
              console.warn('[App Init] Database is unavailable; continuing in degraded local mode.');
              setDbConnectionError(false);
            } else {
              setDbConnectionError(!statusRes.connected);
            }
          }

          // Process dashboard statistics
          if (authSession && statsRes) {
            setDbStats(statsRes);
            setDbConnectionError(false);
          }
        }
      } catch (err: any) {
        console.error("[App Init] Critical initialization failure:", err);
        if (mounted) {
          setDbConnectionError(true);
        }
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    };

    initializeApp();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    clearLegacyClearanceRouteCache();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleUnauthorized = () => {
        console.warn('[App] Session unauthorized or expired. Resetting auth session...');
        setAuthSession(null);
        setDbConnectionError(false);
      };
      window.addEventListener('spss_unauthorized', handleUnauthorized);
      return () => window.removeEventListener('spss_unauthorized', handleUnauthorized);
    }
  }, []);

  // Dynamically update the browser tab favicon to match the school logo
  useEffect(() => {
    if (typeof window !== 'undefined' && schoolLogo) {
      let resolvedSrc = schoolLogo;
      if (schoolLogo.startsWith('/')) {
        resolvedSrc = `${getApiBaseUrl()}${schoolLogo}`;
      }
      
      const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (link) {
        link.href = resolvedSrc;
      } else {
        const newLink = document.createElement('link');
        newLink.type = 'image/png';
        newLink.rel = 'icon';
        newLink.href = resolvedSrc;
        document.getElementsByTagName('head')[0].appendChild(newLink);
      }
    }
  }, [schoolLogo]);

  // Load full student list from backend (or fallback to local storage)
  const loadStudentsFromServer = useCallback(async () => {
    if (dbConnectionError) return;
    if (!authSession) return; // Wait until authenticated to fetch from backend
    setIsTableLoading(true);
    setTableError(null);
    try {
      const shouldFetchAll = viewMode === 'board' || pageSize === -1;
      const params: any = {
        page: shouldFetchAll ? 1 : currentPage,
        limit: shouldFetchAll ? -1 : pageSize,
        search: searchQuery,
        level: filterLevel === 'All' ? undefined : filterLevel,
        gradeClass: viewMode === 'board' ? activeBoardClass : (filterClass === 'All' ? undefined : filterClass),
        stream: filterStream === 'All' ? undefined : filterStream,
        gender: filterGender === 'All' ? undefined : filterGender,
        isCleared: filterClearance === 'All' ? undefined : filterClearance,
        boardingStatus: filterBoarding === 'All' ? undefined : filterBoarding,
        photo: filterPhoto === 'All' ? undefined : filterPhoto,
        printStatus: printNewOnly ? 'Not Printed' : undefined,
        academicYear: filterAcademicYear === 'All' ? undefined : filterAcademicYear,
        sortBy
      };

      if (shouldFetchAll) {
        params.limit = -1;
      }

      const res = await fetchStudentsFromDb(params);
      if (res && Array.isArray(res.data)) {
        setStudents(res.data);
        setTotalStudentsCount(res.total || res.data.length || 0);
        setDbConnectionError(false);
      } else {
        throw new Error("Invalid response format from database server.");
      }
    } catch (err: any) {
      console.warn('Failed to load students from server:', err);
      
      const isCentralized = dbConfig && (dbConfig.mode === 'network' || dbConfig.mode === 'client' || dbConfig.mode === 'cloud' || dbConfig.host);
      
      if (!isCentralized) {
        try {
          const local = await getStudentsAsync();
          setStudents(Array.isArray(local) ? local : INITIAL_STUDENTS);
          setTotalStudentsCount(Array.isArray(local) ? local.length : INITIAL_STUDENTS.length);
        } catch (e) {
          setStudents(INITIAL_STUDENTS);
          setTotalStudentsCount(INITIAL_STUDENTS.length);
        }
      } else {
        setStudents([]);
        setTotalStudentsCount(0);
      }
      const isAuthError = err?.message && (
        err.message.includes('token') ||
        err.message.includes('expired') ||
        err.message.includes('unauthorized') ||
        err.message.includes('Forbidden') ||
        err.message.includes('Unauthorized') ||
        err.message.includes('log in') ||
        err.message.includes('401') ||
        err.message.includes('403')
      );
      if (!isAuthError) {
        setDbConnectionError(true);
      }
      setTableError(err?.message || 'Unable to load student records from server.');
    } finally {
      setIsTableLoading(false);
    }
  }, [dbConnectionError, viewMode, pageSize, currentPage, searchQuery, filterLevel, filterClass, filterStream, filterGender, filterClearance, filterBoarding, filterPhoto, printNewOnly, filterAcademicYear, sortBy, activeBoardClass]);

  const handleExportScopeCsv = async () => {
    try {
      let rows: any[] = [];
      if (exportScope === 'Current') {
        rows = studentsToExport;
      } else {
        const params: any = { limit: -1 };
        if (exportScope === 'ByClass' && exportClass && exportClass !== 'All') params.gradeClass = exportClass;
        if (exportScope === 'ByStream' && exportStream && exportStream !== 'All') params.stream = exportStream;

        if (exportPreset === 'New') {
          params.printStatus = 'Not Printed';
        } else if (exportPreset === 'WithPhotos') {
          params.photo = 'WithPhoto';
        } else if (exportPreset === 'NewWithPhotos') {
          params.printStatus = 'Not Printed';
          params.photo = 'WithPhoto';
        } else {
          if (filterPhoto && filterPhoto !== 'All') params.photo = filterPhoto;
          if (printNewOnly) params.printStatus = 'Not Printed';
        }

        const res = await fetchStudentsFromDb(params);
        rows = Array.isArray(res?.data) ? res.data : [];
      }

      if (!rows || rows.length === 0) {
        alert('No students found for the selected export scope.');
        return;
      }

      const headers = ['S/N','Student Number','Full Name','Gender','Class/Form','Boarding Status','Clearance Status','Print Status','Has Photo','Remarks'];
      const csvLines = [headers.join(',')];
      rows.forEach((s: any, idx: number) => {
        const vals = [
          idx + 1,
          s.adminNo,
          s.name,
          s.gender,
          s.gradeClass,
          s.boardingStatus === 'Hosteller' ? 'Hosteller (Boarding)' : 'Day Scholar',
          s.isCleared ? 'Cleared' : 'On Hold',
          s.printStatus || 'Not Printed',
          s.hasPhoto ? 'Yes' : 'No',
          s.remarks || ''
        ].map(v => {
          const str = v === null || v === undefined ? '' : String(v);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        });
        csvLines.push(vals.join(','));
      });

      const csvContent = csvLines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `student-export-${exportScope.toLowerCase()}-${dateStr}.csv`;

      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await (window as any).electron.saveFileBase64(filename, base64Data, [{ name: 'CSV Document', extensions: ['csv'] }]);
        };
        reader.readAsDataURL(blob);
      } else {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Scoped CSV export failed:', err);
      alert('CSV export failed.');
    }
  };

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInputValue.trim());
      setCurrentPage(1);
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInputValue]);

  useEffect(() => {
    if (!dbConnectionError) {
      loadStudentsFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession, dbConnectionError, searchQuery, filterLevel, filterClass, filterStream, filterGender, filterClearance, filterBoarding, filterAcademicYear, filterPhoto, printNewOnly, sortBy, currentPage, pageSize, viewMode, activeBoardClass]);


  // Minimal shell: avoid loading large datasets until user navigates to those modules.
  // Show skeletons while heavy modules load lazily.

  // Restored UI state (was accidentally removed) — admin tabs, modals, and core lists
  const [adminActiveTab, setAdminActiveTab] = useState<'cards' | 'school' | 'profile' | 'database' | 'controls' | 'assistant' | 'attendance'>('cards');
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [showDbSettingsModal, setShowDbSettingsModal] = useState<boolean>(false);
  const [showBulkPhotoMatcher, setShowBulkPhotoMatcher] = useState<boolean>(false);
  const [showBulkImporter, setShowBulkImporter] = useState<boolean>(false);
  const [showWebcamCapture, setShowWebcamCapture] = useState<boolean>(false);

  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS || []);
  const [totalStudentsCount, setTotalStudentsCount] = useState<number>(INITIAL_STUDENTS ? INITIAL_STUDENTS.length : 0);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formInputs, setFormInputs] = useState<any>({ adminNo: '', name: '', aliases: '', gender: 'Male', gradeClass: SCHOOL_CLASSES[0], boardingStatus: 'Hosteller', isCleared: true, remarks: '', photo: undefined, printStatus: 'Not Printed' });

  const [modalTab, setModalTab] = useState<'details' | 'parent' | 'attendance'>('details');
  const [modalParentContacts, setModalParentContacts] = useState<any>({
    father_name: '', father_phone: '', father_whatsapp: '',
    mother_name: '', mother_phone: '', mother_whatsapp: '',
    guardian_name: '', guardian_phone: '', guardian_whatsapp: '',
    relationship: 'Guardian', home_address: '', email: '',
    emergency_contact: '', occupation: '', preferred_notification: 'SMS'
  });
  const [modalAttendanceHistory, setModalAttendanceHistory] = useState<any[]>([]);
  const [modalParentSaving, setModalParentSaving] = useState<boolean>(false);
  const [modalAttendanceLoading, setModalAttendanceLoading] = useState<boolean>(false);

  const handleSaveAndSync = async (updatedStudents: Student[]) => {
    // 1. Identify changed/new students and deleted students by comparing with current state
    const currentMap = new Map(Array.isArray(students) ? students.map(s => [s.id, s]) : []);
    const updatedMap = new Map(Array.isArray(updatedStudents) ? updatedStudents.map(s => [s.id, s]) : []);

    const changedStudents: Student[] = [];
    const deletedIds: string[] = [];

    // Find new and changed students
    for (const student of updatedStudents) {
      const current = currentMap.get(student.id);
      if (!current) {
        changedStudents.push(student);
      } else {
        if (
          current.name !== student.name ||
          current.adminNo !== student.adminNo ||
          current.gender !== student.gender ||
          current.gradeClass !== student.gradeClass ||
          current.boardingStatus !== student.boardingStatus ||
          current.isCleared !== student.isCleared ||
          current.printStatus !== student.printStatus ||
          current.photo !== student.photo ||
          current.remarks !== student.remarks ||
          current.gateClearanceDate !== student.gateClearanceDate ||
          current.mealsClearanceDate !== student.mealsClearanceDate
        ) {
          changedStudents.push(student);
        }
      }
    }

    // Find deleted students
    if (Array.isArray(students)) {
      for (const student of students) {
        if (!updatedMap.has(student.id)) {
          deletedIds.push(student.id);
        }
      }
    }

    // 2. Update React state locally
    setStudents(updatedStudents);

    // 3. Persist local cache asynchronously (non-blocking)
    setTimeout(() => {
      saveStudentsAsync(updatedStudents).catch(err => {
        console.warn('Unable to persist student list locally during sync:', err);
      });
    }, 50);

    // 4. Persist to MySQL database server in the background (if connected)
    if (!dbConnectionError) {
      try {
        if (changedStudents.length > 0) {
          console.log(`[Sync-Database] Saving ${changedStudents.length} new/modified student(s) to MySQL...`);
          await saveStudentsBulkInDb(changedStudents);
        }
        if (deletedIds.length > 0) {
          console.log(`[Sync-Database] Deleting ${deletedIds.length} student(s) from MySQL...`);
          await deleteStudentsBulkInDb(deletedIds);
        }
      } catch (dbErr) {
        console.error('Failed to synchronize changes with MySQL database:', dbErr);
      }
    }

    // 5. Cloud Database Sync (Firestore - Non-blocking background sync)
    if (isFirebaseConfigured()) {
      try {
        if (changedStudents.length > 0) {
          console.log(`[Sync-Firestore] Saving ${changedStudents.length} student(s) to Firestore...`);
          Promise.all(changedStudents.map(s => saveStudentInFirestore(s)))
            .then(() => console.log("[Sync-Firestore] Firestore sync completed successfully."))
            .catch(fireErr => console.warn("[Sync-Firestore] Firestore sync failed:", fireErr));
        }
        if (deletedIds.length > 0) {
          console.log(`[Sync-Firestore] Deleting ${deletedIds.length} student(s) from Firestore...`);
          deleteMultipleStudentsInFirestore(deletedIds)
            .then(() => console.log("[Sync-Firestore] Firestore deletion completed successfully."))
            .catch(fireErr => console.warn("[Sync-Firestore] Firestore deletion failed:", fireErr));
        }
      } catch (fireErr) {
        console.warn("[Sync-Firestore] Pre-sync checks or triggers failed:", fireErr);
      }
    }
  };

  const handleOpenDbSettings = () => {
    setShowDbSettingsModal(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('spss_session');
    localStorage.removeItem('spss_token');
    try {
      sessionStorage.removeItem('spss_session');
      sessionStorage.removeItem('spss_token');
    } catch (e) {}
    setAuthSession(null);
    try {
      window.location.href = '/';
    } catch (e) {}
  };

  const handleRetryConnection = () => {
    // Simple reload to re-initialize the renderer and re-run startup checks.
    try {
      window.location.reload();
    } catch (e) {
      console.warn('Reload failed, fallback to open DB settings:', e);
      setShowDbSettingsModal(true);
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeLevel, setActiveLevel] = useState<'master'|'selective'|'history'|'class-stream'>('master');
  const [selectiveMatchedIds, setSelectiveMatchedIds] = useState<string[]>([]);
  const [selectiveSelectedIds, setSelectiveSelectedIds] = useState<string[]>([]);
  const [selectiveParsedRowsCount, setSelectiveParsedRowsCount] = useState<number>(0);
  const [selectiveUnmatchedRows, setSelectiveUnmatchedRows] = useState<string[]>([]);
  const [selectiveInputText, setSelectiveInputText] = useState<string>('');
  const [selectiveSearchQuery, setSelectiveSearchQuery] = useState<string>('');
  const [selectiveFileError, setSelectiveFileError] = useState<string | null>(null);

  const [previewStudentId, setPreviewStudentId] = useState<string | null>(null);
  const [previewStudentFull, setPreviewStudentFull] = useState<Student | null>(null);

  const [cameraDiagnostic, setCameraDiagnostic] = useState<{ status: 'ok' | 'testing' | 'error'; message: string }>({
    status: 'error',
    message: 'No webcam detected on this system. Please connect a USB camera.'
  });

  const runCameraDiagnostic = async () => {
    setCameraDiagnostic({ status: 'testing', message: 'Testing webcam connectivity...' });
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if (videoDevices.length > 0) {
          setCameraDiagnostic({ status: 'ok', message: 'Camera ready' });
        } else {
          setCameraDiagnostic({ status: 'error', message: 'No webcam detected on this system. Please connect a USB camera.' });
        }
      } else {
        setCameraDiagnostic({ status: 'error', message: 'Media devices API not supported in this browser.' });
      }
    } catch (err: any) {
      setCameraDiagnostic({ status: 'error', message: `Camera diagnostic error: ${err.message || err}` });
    }
  };

  useEffect(() => {
    runCameraDiagnostic();
  }, []);

  const [photoRaw, setPhotoRaw] = useState<string | null>(null);
  const [photoOriginal, setPhotoOriginal] = useState<string | null>(null);
  const [photoZoom, setPhotoZoom] = useState<number>(1.0);
  const [photoPanX, setPhotoPanX] = useState<number>(0);
  const [photoPanY, setPhotoPanY] = useState<number>(0);
  const [photoWhiten, setPhotoWhiten] = useState<number>(45);
  const [photoAutoCenter, setPhotoAutoCenter] = useState<boolean>(true);
  const [photoFilter, setPhotoFilter] = useState<string>('studio');
  const [photoBgColor, setPhotoBgColor] = useState<'white' | 'none' | 'light-blue' | 'light-gray'>('white');
  const [photoQualityReport, setPhotoQualityReport] = useState<BackgroundQualityReport | null>(null);
  const [isPhotoProcessing, setIsPhotoProcessing] = useState<boolean>(false);
  const [showManualBgEditor, setShowManualBgEditor] = useState<boolean>(false);
  const [hasManualBgEdits, setHasManualBgEdits] = useState<boolean>(false);

  const isSupportedPhotoFile = (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return allowedTypes.includes(file.type.toLowerCase());
  };

  const loadFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read file as Base64.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  };

  const processStudentPhotoPreview = async (rawBase64: string) => {
    setIsPhotoProcessing(true);
    try {
      const enhanced = await processStudentPhoto(rawBase64, {
        zoom: photoZoom,
        offsetX: photoPanX,
        offsetY: photoPanY,
        whitenIntensity: photoWhiten,
        autoCenter: photoAutoCenter,
        filter: photoFilter,
        bgReplacementColor: photoBgColor
      });
      setFormInputs((prev: any) => ({ ...prev, photo: enhanced }));
      if (!photoOriginal) {
        setPhotoOriginal(rawBase64);
      }
      try {
        const quality = await analyzeImageQuality(enhanced);
        setPhotoQualityReport(quality);
      } catch (qualityErr) {
        console.warn('Photo quality analysis failed:', qualityErr);
        setPhotoQualityReport(null);
      }
    } catch (err) {
      console.error('Failed to process student passport photo:', err);
    } finally {
      setIsPhotoProcessing(false);
    }
  };

  useEffect(() => {
    if (!photoRaw || hasManualBgEdits) return;
    let cancelled = false;

    const runPreview = async () => {
      setIsPhotoProcessing(true);
      try {
        const enhanced = await processStudentPhoto(photoRaw, {
          zoom: photoZoom,
          offsetX: photoPanX,
          offsetY: photoPanY,
          whitenIntensity: photoWhiten,
          autoCenter: photoAutoCenter,
          filter: photoFilter,
          bgReplacementColor: photoBgColor
        });
        if (cancelled) return;
        setFormInputs((prev: any) => ({ ...prev, photo: enhanced }));
        if (!photoOriginal) {
          setPhotoOriginal(photoRaw);
        }
        try {
          const quality = await analyzeImageQuality(enhanced);
          if (!cancelled) setPhotoQualityReport(quality);
        } catch (qualityErr) {
          console.warn('Photo quality analysis failed:', qualityErr);
          if (!cancelled) setPhotoQualityReport(null);
        }
      } catch (err) {
        console.error('Failed to process student passport photo preview:', err);
      } finally {
        if (!cancelled) setIsPhotoProcessing(false);
      }
    };

    runPreview();
    return () => {
      cancelled = true;
    };
  }, [photoRaw, photoZoom, photoPanX, photoPanY, photoWhiten, photoAutoCenter, photoFilter, photoBgColor, hasManualBgEdits]);

  const setFormInputsPhoto = (enhancedBase64: string, originalBase64?: string) => {
    setFormInputs((prev: any) => ({ ...prev, photo: enhancedBase64 }));
    if (originalBase64 && !photoOriginal) {
      setPhotoOriginal(originalBase64);
    }
  };

  const handlePhotoFileChange = async (file: File | undefined) => {
    if (!file) return;
    if (!isSupportedPhotoFile(file)) {
      alert('Invalid image format. Only JPG, JPEG, PNG, and WebP files are allowed.');
      return;
    }
    const rawBase64 = await loadFileAsBase64(file);
    setPhotoRaw(rawBase64);
    setPhotoOriginal(rawBase64);
    setPhotoZoom(1.0);
    setPhotoPanX(0);
    setPhotoPanY(0);
    setPhotoWhiten(45);
    setPhotoAutoCenter(true);
    setPhotoFilter('studio');
    setPhotoBgColor('white');
    setHasManualBgEdits(false);
    setFormInputs((prev: any) => ({ ...prev, photo: rawBase64, photoOriginal: rawBase64, photoEnhanced: undefined }));
  };

  const handleResetPhoto = () => {
    setPhotoRaw(null);
    setPhotoOriginal(null);
    setPhotoQualityReport(null);
    setFormInputs((prev: any) => ({ ...prev, photo: undefined, photoOriginal: undefined, photoEnhanced: undefined }));
  };

  const handleRestoreAutoEnhancement = () => {
    if (!photoRaw) return;
    setHasManualBgEdits(false);
    processStudentPhotoPreview(photoRaw);
  };

  // Early dashboard stats load is handled in the unified initializeApp effect above.

  useEffect(() => {
    if (
      authSession &&
      !hasSetInitialModule &&
      (authSession.role === 'admin' || authSession.role === 'teacher')
    ) {
      setActiveModule('clearance');
      setHasSetInitialModule(true);
    }
  }, [authSession, hasSetInitialModule]);

  const getAcademicYear = (s: Student) => {
    // best-effort: derive from student record or fallback
    // Student records in this app may not include an explicit academic year; use 2026 as default
    return (s as any).academicYear || (s as any).year || '2026';
  };

  // OPTIMIZED: Memoize filter handlers to prevent re-renders of child components
  const handleSetFilterClass = useCallback((value: string) => setFilterClass(value), []);
  const handleSetFilterStream = useCallback((value: string) => setFilterStream(value), []);
  const handleSetFilterGender = useCallback((value: string) => setFilterGender(value), []);
  const handleSetFilterClearance = useCallback((value: string) => setFilterClearance(value), []);
  const handleSetFilterBoarding = useCallback((value: string) => setFilterBoarding(value), []);
  const handleSetSortBy = useCallback((value: string) => setSortBy(value), []);
  const handleSetViewMode = useCallback((mode: 'list' | 'board') => setViewMode(mode), []);
  const handleSetSearchInput = useCallback((value: string) => setSearchInputValue(value), []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.2 * 1024 * 1024) {
      alert("Strict size limit: please upload an image smaller than 1.2MB for upload safety.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      
      // Instantly run high-precision background removal to discard white outer box
      removeLogoBackground(base64String, 45).then(async (cleanedLogo) => {
        setSchoolLogo(cleanedLogo);
        localStorage.setItem('clearance_printer_school_logo', cleanedLogo);
        localStorage.setItem('clearance_printer_school_logo_cleaned_v2', 'true');
        try {
          if ((window as any).electron?.writeDataSync) {
            (window as any).electron.writeDataSync('school_logo', cleanedLogo);
          }
        } catch (e) {
          console.warn("Failed to write cleaned logo to Electron:", e);
        }
        
        try {
          const res = await saveSchoolLogoInDb(cleanedLogo);
          if (res && res.logo) {
            setSchoolLogo(res.logo);
            localStorage.setItem('clearance_printer_school_logo', res.logo);
          }
        } catch (err) {
          console.error("MySQL database branding write failed:", err);
        }

        if (isFirebaseConfigured()) {
          try {
            await saveBrandingToFirestore(cleanedLogo, true);
          } catch (err) {
            console.error("Cloud database branding write failed:", err);
          }
        }
      }).catch(async (err) => {
        console.warn("Failed background removal, using original:", err);
        setSchoolLogo(base64String);
        localStorage.setItem('clearance_printer_school_logo', base64String);
        try {
          if ((window as any).electron?.writeDataSync) {
            (window as any).electron.writeDataSync('school_logo', base64String);
          }
        } catch (e) {
          console.warn("Failed to write logo to Electron:", e);
        }
        
        try {
          const res = await saveSchoolLogoInDb(base64String);
          if (res && res.logo) {
            setSchoolLogo(res.logo);
            localStorage.setItem('clearance_printer_school_logo', res.logo);
          }
        } catch (err) {
          console.error("MySQL database branding write failed:", err);
        }

        if (isFirebaseConfigured()) {
          try {
            await saveBrandingToFirestore(base64String, false);
          } catch (dbErr) {
            console.error("Cloud database branding write failed:", dbErr);
          }
        }
      });
    };
    reader.onerror = () => {
      alert("Trouble parsing image. Try another standard PNG/JPG image.");
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = async () => {
    setSchoolLogo(DEFAULT_SCHOOL_LOGO);
    localStorage.removeItem('clearance_printer_school_logo');
    localStorage.removeItem('clearance_printer_school_logo_cleaned_v2');
    try {
      if ((window as any).electron?.writeDataSync) {
        (window as any).electron.writeDataSync('school_logo', '');
      }
    } catch (e) {
      console.warn("Failed to clear logo in Electron:", e);
    }
    
    try {
      await saveSchoolLogoInDb(null);
    } catch (err) {
      console.error("MySQL database branding reset failed:", err);
    }

    if (isFirebaseConfigured()) {
      try {
        await deleteBrandingFromFirestore();
      } catch (err) {
        console.error("Cloud database branding reset failed:", err);
      }
    }
  };



  // --- EXTRACT UNIQUE CLASSES AND STREAMS FOR FILTER DROPDOWN ---
  const uniqueClasses = useMemo(() => {
    const classes = new Set<string>();
    students.forEach((s) => {
      const { className } = parseClassAndStream(s.gradeClass);
      if (className) classes.add(className);
    });
    // default standard fallback classes
    ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'].forEach((c) => classes.add(c));
    return ['All', ...Array.from(classes).sort()];
  }, [students]);

  const uniqueStreams = useMemo(() => {
    const streams = new Set<string>();
    students.forEach((s) => {
      const { streamName } = parseClassAndStream(s.gradeClass);
      if (streamName) streams.add(streamName);
    });
    // default standard fallback streams
    ['A', 'B', 'C', 'Arts', 'Sciences'].forEach((str) => streams.add(str));
    return ['All', ...orderStreams(Array.from(streams))];
  }, [students]);

  const classesWithStreams = useMemo(() => {
    const mapping: Record<string, string[]> = {
      'S.1': ['A', 'B', 'C'],
      'S.2': ['A', 'B', 'C'],
      'S.3': ['A', 'B', 'C'],
      'S.4': ['A', 'B', 'C'],
      'S.5': ['Sciences', 'Arts'],
      'S.6': ['Sciences', 'Arts']
    };

    students.forEach((s) => {
      const { className, streamName } = parseClassAndStream(s.gradeClass);
      if (className && streamName) {
        if (!mapping[className]) {
          mapping[className] = [];
        }
        if (!mapping[className].includes(streamName)) {
          mapping[className].push(streamName);
        }
      }
    });

    Object.keys(mapping).forEach((c) => {
      mapping[c] = orderStreams(mapping[c]);
    });

    return mapping;
  }, [students]);

  const uniqueYears = ['All', '2024', '2025', '2026', '2027', '2028'];

  // --- FILTERED AND SORTED STUDENTS (Optimized case-insensitive sorting) ---
  const filteredStudents = useMemo(() => {
    if (!dbConnectionError) {
      return students;
    }
    const query = searchQuery.trim().toLowerCase();
    
    // 1. Filter first
    const matched = students.filter((s) => {
      const matchesQuery = !query ? true : (
        s.name.toLowerCase().includes(query) ||
        s.adminNo.toLowerCase().includes(query) ||
        s.gradeClass.toLowerCase().includes(query) ||
        (Array.isArray(s.aliases) && s.aliases.some((alias: string) => alias.toLowerCase().includes(query)))
      );

      const { className, streamName } = parseClassAndStream(s.gradeClass);

      let matchesLevel = true;
      if (filterLevel === 'Lower') {
        matchesLevel = ['S.1', 'S.2', 'S.3', 'S.4'].includes(className);
      } else if (filterLevel === 'Upper') {
        matchesLevel = ['S.5', 'S.6'].includes(className);
      }

      const matchesClass = filterClass === 'All' || className === filterClass;
      const matchesStream = filterStream === 'All' || streamName === filterStream;
      const matchesGender = filterGender === 'All' || s.gender === filterGender;

      const matchesClearance =
        filterClearance === 'All' ||
        (filterClearance === 'Cleared' && s.isCleared) ||
        (filterClearance === 'Hold' && !s.isCleared);

      const matchesBoarding = filterBoarding === 'All' || s.boardingStatus === filterBoarding;
      
      const matchesAcademicYear = filterAcademicYear === 'All' || getAcademicYear(s) === filterAcademicYear;
      
      const matchesPrintStatus = !printNewOnly || s.printStatus === 'Not Printed' || !s.printStatus;
      const matchesPhoto =
        filterPhoto === 'All' ||
        (filterPhoto === 'WithPhoto' && (s.hasPhoto || !!s.photo)) ||
        (filterPhoto === 'NoPhoto' && !s.hasPhoto && !s.photo);

      return (
        matchesQuery &&
        matchesLevel &&
        matchesClass &&
        matchesStream &&
        matchesGender &&
        matchesClearance &&
        matchesBoarding &&
        matchesAcademicYear &&
        matchesPrintStatus &&
        matchesPhoto
      );
    });

    // 2. Fast comparison sort (eliminates slow localeCompare)
    return matched.sort((a, b) => {
      let fieldA = '';
      let fieldB = '';
      if (sortBy === 'name') {
        fieldA = a.name;
        fieldB = b.name;
      } else if (sortBy === 'adminNo') {
        fieldA = a.adminNo;
        fieldB = b.adminNo;
      } else if (sortBy === 'gradeClass') {
        fieldA = a.gradeClass;
        fieldB = b.gradeClass;
      } else {
        return 0;
      }
      
      const fA = fieldA.toLowerCase();
      const fB = fieldB.toLowerCase();
      if (fA < fB) return -1;
      if (fA > fB) return 1;
      return 0;
    });
  }, [
    students,
    searchQuery,
    filterLevel,
    filterClass,
    filterStream,
    filterGender,
    filterClearance,
    filterBoarding,
    filterAcademicYear,
    filterPhoto,
    sortBy,
    printNewOnly,
    dbConnectionError
  ]);

  // --- HIGH-PERFORMANCE BOARD VIEW MEMOIZATION (Avoids recalculating in render loops) ---
  const boardViewData = useMemo(() => {
    if (viewMode !== 'board') {
      return { streams: [], studentsByStream: {}, maxRows: 0, boardStudentsLength: 0 };
    }

    const defaults = ['S.5', 'S.6'].includes(activeBoardClass)
      ? ['Arts', 'Sciences']
      : ['A', 'B', 'C'];
    
    // Get streams for this class
    const registeredInClass = Array.isArray(students) ? students.filter(s => {
      const parts = (s.gradeClass || '').trim().split(/\s+/);
      return parts[0] === activeBoardClass;
    }) : [];
    
    const customStreams = Array.from(new Set<string>(Array.isArray(registeredInClass) ? registeredInClass.map(s => {
      const parts = (s.gradeClass || '').trim().split(/\s+/);
      return parts.slice(1).join(' ') || 'A';
    }) : [])).filter(sn => sn && !defaults.includes(sn));
    
    const streams = [...defaults, ...customStreams];

    // Filter board students
    const boardStudents = Array.isArray(students) ? students.filter(s => {
      const parsed = parseClassAndStream(s.gradeClass);
      if (parsed.className !== activeBoardClass) return false;
      
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery = !query ? true : (
        s.name.toLowerCase().includes(query) ||
        s.adminNo.toLowerCase().includes(query) ||
        s.gradeClass.toLowerCase().includes(query)
      );
      
      const matchesStream = filterStream === 'All' || parsed.streamName === filterStream;
      const matchesGender = filterGender === 'All' || s.gender === filterGender;
      
      const matchesClearance =
        filterClearance === 'All' ||
        (filterClearance === 'Cleared' && s.isCleared) ||
        (filterClearance === 'Hold' && !s.isCleared);
      const matchesBoarding = filterBoarding === 'All' || s.boardingStatus === filterBoarding;
      const matchesAcademicYear = filterAcademicYear === 'All' || getAcademicYear(s) === filterAcademicYear;
      const matchesPrintStatus = !printNewOnly || s.printStatus === 'Not Printed' || !s.printStatus;
      const matchesPhoto =
        filterPhoto === 'All' ||
        (filterPhoto === 'WithPhoto' && (s.hasPhoto || !!s.photo)) ||
        (filterPhoto === 'NoPhoto' && !s.hasPhoto && !s.photo);
      
      return (
        matchesQuery &&
        matchesStream &&
        matchesGender &&
        matchesClearance &&
        matchesBoarding &&
        matchesAcademicYear &&
        matchesPrintStatus &&
        matchesPhoto
      );
    }) : [];

    // Group boardStudents by stream
    const studentsByStream: Record<string, Student[]> = {};
    streams.forEach(stream => {
      studentsByStream[stream] = Array.isArray(boardStudents) ? boardStudents.filter(s => {
        const parsed = parseClassAndStream(s.gradeClass);
        return parsed.streamName === stream;
      }) : [];
    });

    // Find max rows across streams
    const maxRows = Math.max(...streams.map(stream => studentsByStream[stream]?.length || 0), 5);

    return {
      streams,
      studentsByStream,
      maxRows,
      boardStudentsLength: boardStudents.length,
      boardStudentIds: Array.isArray(boardStudents) ? boardStudents.map(s => s.id) : []
    };
  }, [
    students,
    activeBoardClass,
    searchQuery,
    filterClearance,
    filterBoarding,
    filterPhoto,
    viewMode,
    printNewOnly,
    filterStream,
    filterGender,
    filterAcademicYear
  ]);

  const paginatedStudents = useMemo(() => {
    if (!dbConnectionError) {
      return students;
    }
    if (pageSize === -1) return filteredStudents;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredStudents.slice(startIndex, startIndex + pageSize);
  }, [filteredStudents, currentPage, pageSize, dbConnectionError, students]);

  const effectiveTotalCount = useMemo(() => {
    return dbConnectionError ? filteredStudents.length : totalStudentsCount;
  }, [dbConnectionError, filteredStudents.length, totalStudentsCount]);

  // Selected Student Object references
  const selectedStudentsData = useMemo(() => {
    if (activeLevel === 'master') {
      return students.filter((s) => selectedIds.includes(s.id));
    } else if (activeLevel === 'selective') {
      return students.filter((s) => selectiveMatchedIds.includes(s.id) && selectiveSelectedIds.includes(s.id));
    }
    return [];
  }, [students, activeLevel, selectedIds, selectiveMatchedIds, selectiveSelectedIds]);

  const studentsToExport = useMemo(() => {
    if (activeLevel === 'history') return [];
    const baseList = activeLevel === 'master' ? filteredStudents : students.filter((s) => selectiveMatchedIds.includes(s.id));
    
    if (pdfExportScope === 'selected') {
      if (activeLevel === 'master') {
        return students.filter((s) => selectedIds.includes(s.id));
      } else {
        return students.filter((s) => selectiveSelectedIds.includes(s.id));
      }
    } else if (pdfExportScope === 'first-n') {
      return baseList.slice(0, Math.min(pdfExportCount, baseList.length));
    } else if (pdfExportScope === 'custom-range') {
      const startIdx = Math.max(0, pdfExportStart - 1);
      const endIdx = Math.min(pdfExportEnd, baseList.length);
      if (startIdx >= baseList.length || startIdx > endIdx) return [];
      return baseList.slice(startIdx, endIdx);
    } else if (pdfExportScope === 'all') {
      return baseList;
    }
    return [];
  }, [
    activeLevel,
    filteredStudents,
    students,
    selectedIds,
    selectiveSelectedIds,
    selectiveMatchedIds,
    pdfExportScope,
    pdfExportCount,
    pdfExportStart,
    pdfExportEnd
  ]);

  const getStudentPhotoUrl = (student: Student | null): string | undefined => {
    if (!student) return undefined;
    if (student.photo) return student.photo; // in-memory base64 (e.g. newly loaded/edited)
    if (student.hasPhoto) {
      return `${getApiBaseUrl()}/api/students/${student.id}/photo?t=${student.updatedAt ? new Date(student.updatedAt).getTime() : ''}`;
    }
    return undefined;
  };

  const activePreviewStudent = useMemo(() => {
    if (activeLevel === 'history') return null;
    const listStudent = activeLevel === 'master'
      ? (students.find((s) => s.id === previewStudentId) || students[0] || null)
      : (students.filter((s) => selectiveMatchedIds.includes(s.id)).find((s) => s.id === previewStudentId) || students[0] || null);

    if (previewStudentFull && listStudent && previewStudentFull.id === listStudent.id) {
      return previewStudentFull;
    }
    return listStudent;
  }, [students, activeLevel, previewStudentId, selectiveMatchedIds, previewStudentFull]);

  // Dynamically computed list of registered stream names
  const dynamicStreamOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      const parts = (s.gradeClass || '').trim().split(/\s+/);
      const stream = parts.slice(1).join(' ');
      if (stream) set.add(stream);
    });
    // Add defaults to ensure they are available even on fresh load
    ['A', 'B', 'C', 'Arts', 'Sciences'].forEach((x) => set.add(x));
    return orderStreams(Array.from(set));
  }, [students]);

  // --- STATS COMPUTATION ---
  const stats = useMemo(() => {
    const selectCount = activeLevel === 'master' 
      ? selectedIds.length 
      : (activeLevel === 'selective' ? selectiveSelectedIds.length : 0);
    return {
      ...dbStats,
      clearedCount: dbStats.cleared || 0,
      balanceCount: dbStats.pending || 0,
      photoCount: dbStats.withPhoto || 0,
      lowerSecondaryTotal: dbStats.lowerSecondaryTotal || 0,
      upperSecondaryTotal: dbStats.upperSecondaryTotal || 0,
      selectCount
    };
  }, [dbStats, selectedIds, selectiveSelectedIds, activeLevel]);

  const isAdmin = useMemo(() => {
    return !isFirebaseConfigured() || !!adminUser;
  }, [adminUser]);

  // --- LEVEL 2 (SELECTIVE PRINTING) MATCHED FILTERED LIST ---
  const filteredSelectiveStudents = useMemo(() => {
    return students
      .filter((s) => selectiveMatchedIds.includes(s.id))
      .filter((s) => {
        if (!selectiveSearchQuery.trim()) return true;
        const query = selectiveSearchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(query) ||
          s.adminNo.toLowerCase().includes(query) ||
          s.gradeClass.toLowerCase().includes(query)
        );
      });
  }, [students, selectiveMatchedIds, selectiveSearchQuery]);

  // Cascading Auto-Matching Algorithm (Level 2)
  const handleRunAutoMatch = (inputTextContent: string) => {
    setSelectiveFileError(null);
    if (!inputTextContent.trim()) {
      alert("Please paste some student names or student numbers first.");
      return;
    }

    const lines = inputTextContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const matchedIds: string[] = [];
    const unmatched: string[] = [];

    lines.forEach((line) => {
      // Split line using comma, tab, or pipe in case multiple columns pasted
      const parts = line.split(/[,\t|]+/).map((p) => p.trim()).filter((p) => p.length > 0);
      let matchedStudent: Student | null = null;

      for (const s of students) {
        const studentAdmin = s.adminNo.toLowerCase().trim();
        const studentName = s.name.toLowerCase().trim();

        // 1. Exact admin code match
        const matchAdminExactly = parts.some(p => p.toLowerCase() === studentAdmin) || line.toLowerCase() === studentAdmin;
        if (matchAdminExactly) {
          matchedStudent = s;
          break;
        }

        // 2. Exact name match
        const matchNameExactly = parts.some(p => p.toLowerCase() === studentName) || line.toLowerCase() === studentName;
        if (matchNameExactly) {
          matchedStudent = s;
          break;
        }

        // 3. Substring check
        const lineLower = line.toLowerCase();
        if (lineLower.includes(studentAdmin) || studentAdmin.includes(lineLower)) {
          matchedStudent = s;
          break;
        }
        if (lineLower.includes(studentName) || studentName.includes(lineLower)) {
          matchedStudent = s;
          break;
        }
      }

      if (matchedStudent) {
        if (!matchedIds.includes(matchedStudent.id)) {
          matchedIds.push(matchedStudent.id);
        }
      } else {
        unmatched.push(line);
      }
    });

    setSelectiveMatchedIds(matchedIds);
    setSelectiveUnmatchedRows(unmatched);
    setSelectiveSelectedIds(matchedIds); // Automatically pre-select all matches for the print queue!
    setSelectiveParsedRowsCount(lines.length);

    if (matchedIds.length > 0) {
      setPreviewStudentId(matchedIds[0]);
    } else {
      alert("No matched students were found in the Master Database. Double check spellings or registration IDs.");
    }
  };

  const handleSelectiveFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectiveFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setSelectiveFileError("File too large. Maximum size is 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setSelectiveInputText(text);
        handleRunAutoMatch(text);
      }
    };
    reader.onerror = () => {
      setSelectiveFileError("Error reading file.");
    };
    reader.readAsText(file);
  };

  const handleResetSelectiveSession = () => {
    setSelectiveInputText('');
    setSelectiveMatchedIds([]);
    setSelectiveUnmatchedRows([]);
    setSelectiveSelectedIds([]);
    setSelectiveParsedRowsCount(0);
    setSelectiveSearchQuery('');
    setSelectiveFileError(null);
  };

  // --- BURSAR'S ADVANCED QUEUE SELECTOR ---
  // Select first N matching students from active filtered lists
  const handleSelectFirstN = (n: number) => {
    const count = Math.min(n, filteredStudents.length);
    if (count === 0) {
      setQueueSuccessMessage("No matching students found to queue. Check filters.");
      setTimeout(() => setQueueSuccessMessage(null), 5000);
      return;
    }
    const firstNIds = Array.isArray(filteredStudents) ? filteredStudents.slice(0, count).map((s) => s.id) : [];
    setSelectedIds(firstNIds);
    setQueueSuccessMessage(`Successfully queued ${count} student passes! Press the export buttons to start printing.`);
    setTimeout(() => setQueueSuccessMessage(null), 7000);
  };

  // --- BATCH STATUS MODIFIER ---
  const handleBulkUpdate = (cleared: boolean) => {
    if (selectedIds.length === 0) return;
    const dateToday = new Date().toISOString().split('T')[0];

    const updated = Array.isArray(students) ? students.map((s) => {
      if (selectedIds.includes(s.id)) {
        return {
          ...s,
          isCleared: cleared,
          gateClearanceDate: cleared ? dateToday : undefined,
          mealsClearanceDate: cleared ? dateToday : undefined,
        };
      }
      return s;
    }) : [];

    handleSaveAndSync(updated);
  };

  const handleResetFilters = useCallback(() => {
    setSearchInputValue('');
    setSearchQuery('');
    setCurrentPage(1);
    setFilterClass('All');
    setFilterStream('All');
    setFilterGender('All');
    setFilterClearance('All');
    setFilterBoarding('All');
    setFilterAcademicYear('All');
    setFilterPhoto('All');
    setPrintNewOnly(false);
  }, []);

  // Dev shortcut: directly render StaffPortal when visiting /_dev_teacher
  if (typeof window !== 'undefined' && window.location && window.location.pathname === '/_dev_teacher') {
    return (
      <Suspense fallback={<Loading message="Loading Staff Portal..." />}>
        <StaffPortal
          staffId="dev-teacher-1"
          staffName="Dev Teacher"
          staffUsername="biirokeneth"
          category="Teaching"
          assignedClasses={["S.4"]}
          assignedSubjects={["Mathematics"]}
          schoolLogo={schoolLogo || DEFAULT_SCHOOL_LOGO}
          onLogout={() => { window.location.href = '/'; }}
        />
      </Suspense>
    );
  }

  // --- INDIVIDUAL ROW QUICK ACCENT TOGGLERS ---
  const toggleRowStatus = (id: string) => {
    const today = new Date().toISOString().split('T')[0];
    const updated = Array.isArray(students) ? students.map((s) => {
      if (s.id === id) {
        const next = !s.isCleared;
        return {
          ...s,
          isCleared: next,
          gateClearanceDate: next ? today : undefined,
          mealsClearanceDate: next ? today : undefined,
        };
      }
      return s;
    }) : [];
    handleSaveAndSync(updated);
  };

  // --- INDIVIDUAL DELETE STUDENT ---
  const handleDeleteStudent = async (id: string) => {
    const studentToDelete = students.find((s) => s.id === id);
    const confirmName = studentToDelete ? studentToDelete.name : "this student";
    const confirmDelete = window.confirm(`Are you sure you want to permanently delete ${confirmName}?`);
    if (!confirmDelete) return;

    // Track locally deleted student IDs to prevent resurrection during sync
    try {
      const deletedIdsStr = localStorage.getItem('clearance_printer_deleted_ids') || '[]';
      const deletedIds: string[] = JSON.parse(deletedIdsStr);
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem('clearance_printer_deleted_ids', JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.warn("Failed to save deleted ID to tracking list:", e);
    }

    try {
      setIsSaving(true);

      // Delete from MySQL DB directly
      try {
        await deleteStudentInDb(id);
      } catch (apiErr) {
        console.warn("Delete via MySQL API failed, queuing for offline sync:", apiErr);
        // Fallback to queueing deletes for offline sync
        let queue: Array<{ type: 'save' | 'delete'; id: string; student?: Student }> = [];
        try {
          const queueStr = localStorage.getItem('clearance_printer_sync_queue') || '[]';
          queue = JSON.parse(queueStr);
        } catch (e) {}
        queue = queue.filter(item => !(item.id === id && item.type === 'save'));
        queue.push({ type: 'delete', id });
        localStorage.setItem('clearance_printer_sync_queue', JSON.stringify(queue));
        setSyncQueueCount(queue.length);
        setDbConnectionError(true);
      }

      // Perform Firestore deletion in background
      if (isFirebaseConfigured()) {
        try {
          await deleteStudentInFirestore(id);
        } catch (err) {
          console.error("Failed to delete student from Firestore:", err);
        }
      }

      // Update local state and cache immediately
      const updated = students.filter((s) => s.id !== id);
      setStudents(updated);
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      
      setTimeout(() => {
        saveStudentsAsync(updated).catch(e => console.warn('Local cache save failed:', e));
      }, 50);

      if (previewStudentId === id && updated.length > 0) {
        setPreviewStudentId(updated[0].id);
      } else if (updated.length === 0) {
        setPreviewStudentId(null);
      }

      alert(`${confirmName} deleted successfully.`);
    } catch (err: any) {
      console.error("Deletion failed:", err);
      alert(`Failed to delete student: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // --- BATCH DELETE SELECTED ---
  const handleDeleteSelected = async () => {
    const count = activeLevel === 'master' ? selectedIds.length : (activeLevel === 'selective' ? selectiveSelectedIds.length : 0);
    const idsToDelete = activeLevel === 'master' ? [...selectedIds] : (activeLevel === 'selective' ? [...selectiveSelectedIds] : []);

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the selected students?\nSelected students count: ${count}`
    );
    if (!confirmDelete) return;

    try {
      setIsSaving(true);

      // Delete from MySQL DB in bulk
      try {
        await deleteStudentsBulkInDb(idsToDelete);
      } catch (apiErr) {
        console.warn("Bulk delete via MySQL API failed, queuing for offline sync:", apiErr);
        // Fallback to queueing deletes for offline sync
        let queue: Array<{ type: 'save' | 'delete'; id: string; student?: Student }> = [];
        try {
          const queueStr = localStorage.getItem('clearance_printer_sync_queue') || '[]';
          queue = JSON.parse(queueStr);
        } catch (e) {}
        idsToDelete.forEach(id => {
          queue = queue.filter(item => !(item.id === id && item.type === 'save'));
          queue.push({ type: 'delete', id });
        });
        localStorage.setItem('clearance_printer_sync_queue', JSON.stringify(queue));
        setSyncQueueCount(queue.length);
        setDbConnectionError(true);
      }

      // Delete from Firebase Firestore (and Storage)
      if (isFirebaseConfigured()) {
        try {
          await deleteMultipleStudentsInFirestore(idsToDelete);
        } catch (fsErr) {
          console.error("Failed to delete students in Firestore:", fsErr);
        }
      }

      // Update tracking of deleted IDs
      try {
        const deletedIdsStr = localStorage.getItem('clearance_printer_deleted_ids') || '[]';
        const deletedIds: string[] = JSON.parse(deletedIdsStr);
        idsToDelete.forEach(id => {
          if (!deletedIds.includes(id)) {
            deletedIds.push(id);
          }
        });
        localStorage.setItem('clearance_printer_deleted_ids', JSON.stringify(deletedIds));
      } catch (e) {
        console.warn("Failed to save deleted IDs to tracking list:", e);
      }

      // Update local UI state and cache (non-blocking disk write)
      const updated = students.filter((s) => !idsToDelete.includes(s.id));
      setStudents(updated);
      setTimeout(() => {
        saveStudentsAsync(updated).catch(e => console.warn('Local cache save failed:', e));
      }, 50);

      // Reset selection
      if (activeLevel === 'master') {
        setSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)));
      } else if (activeLevel === 'selective') {
        setSelectiveSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)));
        setSelectiveMatchedIds(prev => prev.filter(id => !idsToDelete.includes(id)));
      }

      alert(`${count} students deleted successfully.`);
    } catch (err: any) {
      console.error("Deletion failed:", err);
      alert(`Failed to delete students: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAllStudents = async () => {
    const totalCount = Array.isArray(students) ? students.length : 0;
    if (totalCount === 0) {
      alert("No students in database to delete.");
      return;
    }

    const confirmFirst = window.confirm(
      `WARNING: Are you sure you want to permanently delete ALL ${totalCount} students from the database and storage? This action cannot be undone.`
    );
    if (!confirmFirst) return;

    const userInput = window.prompt(
      `Please type "DELETE" to confirm you want to delete all ${totalCount} students:`
    );
    if (userInput !== "DELETE") {
      alert("Verification failed. Deletion cancelled.");
      return;
    }

    try {
      setIsSaving(true);
      const allIds = Array.isArray(students) ? students.map((s) => s.id) : [];

      // Delete from MySQL DB
      try {
        await deleteStudentsBulkInDb(allIds);
      } catch (apiErr) {
        console.warn("Delete all via MySQL API failed, queuing for offline sync:", apiErr);
        // Queue deletes for offline sync
        let queue: Array<{ type: 'save' | 'delete'; id: string; student?: Student }> = [];
        try {
          const queueStr = localStorage.getItem('clearance_printer_sync_queue') || '[]';
          queue = JSON.parse(queueStr);
        } catch (e) {}
        allIds.forEach(id => {
          queue = queue.filter(item => !(item.id === id && item.type === 'save'));
          queue.push({ type: 'delete', id });
        });
        localStorage.setItem('clearance_printer_sync_queue', JSON.stringify(queue));
        setSyncQueueCount(queue.length);
        setDbConnectionError(true);
      }

      // Delete from Firebase Firestore (and Storage)
      if (isFirebaseConfigured()) {
        try {
          await deleteMultipleStudentsInFirestore(allIds);
        } catch (fsErr) {
          console.error("Failed to delete all students in Firestore:", fsErr);
        }
      }

      // Update tracking of deleted IDs
      try {
        const deletedIdsStr = localStorage.getItem('clearance_printer_deleted_ids') || '[]';
        const deletedIds: string[] = JSON.parse(deletedIdsStr);
        allIds.forEach(id => {
          if (!deletedIds.includes(id)) {
            deletedIds.push(id);
          }
        });
        localStorage.setItem('clearance_printer_deleted_ids', JSON.stringify(deletedIds));
      } catch (e) {
        console.warn("Failed to save deleted IDs to tracking list:", e);
      }

      // Update local UI state (non-blocking disk write)
      setStudents([]);
      setSelectedIds([]);
      setSelectiveSelectedIds([]);
      setTimeout(() => {
        saveStudentsAsync([]).catch(e => console.warn('Local cache save failed:', e));
      }, 50);

      alert(`${totalCount} students deleted successfully.`);
    } catch (err: any) {
      console.error("Failed to delete all students:", err);
      alert(`Deletion failed: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // --- ADD / CHANGE SINGLE STUDENT RECOGNITION ---
  const handleOpenAddForm = () => {
    setEditingStudent(null);
    
    // Dynamically calculate the next unique sequential admin number
    let maxNum = 0;
    const regex = /ADM-2026-(\d+)/i;
    students.forEach(s => {
      const match = s.adminNo ? s.adminNo.match(regex) : null;
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    });
    const nextAdminNo = `ADM-2026-${(maxNum + 1).toString().padStart(3, '0')}`;

    setFormInputs({
      adminNo: nextAdminNo,
      name: '',
      aliases: '',
      gender: 'Male',
      gradeClass: SCHOOL_CLASSES[0],
      boardingStatus: 'Hosteller',
      isCleared: true,
      remarks: '',
      photo: undefined,
      printStatus: 'Not Printed'
    });
    setPhotoRaw(null);
    setPhotoZoom(1.0);
    setPhotoPanX(0);
    setPhotoPanY(0);
    setPhotoWhiten(45);
    setPhotoAutoCenter(true);
    setPhotoFilter('studio');
    setShowWebcamCapture(false);
    setModalTab('details');
    setShowFormModal(true);
  };

  const handleOpenEditForm = async (student: Student) => {
    let fullStudent = student;
    if (!dbConnectionError) {
      setIsTableLoading(true);
      try {
        const dbStudent = await fetchStudentFromDb(student.id);
        if (dbStudent) {
          fullStudent = dbStudent;
        }
      } catch (err) {
        console.warn('Failed to fetch full student details from DB, using roster copy:', err);
      } finally {
        setIsTableLoading(false);
      }
    }

    setEditingStudent(fullStudent);
    setFormInputs({
      adminNo: fullStudent.adminNo,
      name: fullStudent.name,
      aliases: Array.isArray(fullStudent.aliases) ? fullStudent.aliases.join(', ') : '',
      gender: fullStudent.gender || 'Male',
      gradeClass: fullStudent.gradeClass,
      boardingStatus: fullStudent.boardingStatus,
      isCleared: fullStudent.isCleared,
      remarks: fullStudent.remarks || '',
      photo: fullStudent.photo,
      printStatus: fullStudent.printStatus || 'Not Printed'
    });
    setPhotoRaw(fullStudent.photoOriginal || fullStudent.photo || null);
    setPhotoOriginal(fullStudent.photoOriginal || fullStudent.photo || null);
    setPhotoZoom(1.0);
    setPhotoPanX(0);
    setPhotoPanY(0);
    setPhotoWhiten(fullStudent.photo ? 0 : 45);
    setPhotoAutoCenter(false);
    setPhotoFilter('studio');
    setPhotoBgColor('white'); // Default background to white when editing
    setHasManualBgEdits(false);
    setShowWebcamCapture(false);
    setModalTab('details');
    
    // Clear previous details
    setModalParentContacts({
      father_name: '', father_phone: '', father_whatsapp: '',
      mother_name: '', mother_phone: '', mother_whatsapp: '',
      guardian_name: '', guardian_phone: '', guardian_whatsapp: '',
      relationship: 'Guardian', home_address: '', email: '',
      emergency_contact: '', occupation: '', preferred_notification: 'SMS'
    });
    setModalAttendanceHistory([]);

    setShowFormModal(true);

    // Fetch parent contacts in background
    try {
      const pc = await fetchParentContacts(fullStudent.id);
      if (pc) {
        setModalParentContacts(pc);
      }
    } catch (err) {
      console.warn('Failed to fetch parent contacts:', err);
    }

    // Fetch gate logs history in background
    try {
      setModalAttendanceLoading(true);
      const history = await fetchStudentGateHistory(fullStudent.id);
      setModalAttendanceHistory(history || []);
    } catch (err) {
      console.warn('Failed to fetch gate history:', err);
    } finally {
      setModalAttendanceLoading(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("[Save Student] Starting save registration workflow...");
    setIsSaving(true);

    try {
      // 1. Stage: Form Validation
      console.log("[Save Student] Stage: Form validation started.");
      const name = formInputs.name.trim();
      const adminNo = formInputs.adminNo.trim();
      if (!name) {
        console.warn("[Save Student] Validation failed: Student Name is missing.");
        alert('Student Name is required.');
        return;
      }
      if (!adminNo) {
        console.warn("[Save Student] Validation failed: Student Number is missing.");
        alert('Student Number is required.');
        return;
      }
      const aliasesInput = typeof formInputs.aliases === 'string' ? formInputs.aliases : '';
      const aliases = aliasesInput
        .split(/[,;\n]/)
        .map((value: string) => value.trim())
        .filter((value: string) => value.length > 0);
      if (!formInputs.photo) {
        console.warn("[Save Student] Validation failed: Passport photo is missing.");
        alert('Student portrait photo is required.');
        return;
      }
      console.log("[Save Student] Stage: Form validation passed.", { name, adminNo });

      // 2. Stage: Photo Processing Check
      console.log("[Save Student] Stage: Photo processing check...");
      console.log("[Save Student] Photo format verified. Length:", formInputs.photo ? formInputs.photo.length : 0);

      // 3. Verify Database Connection
      console.log("[Save Student] Stage: Verifying database connection before saving...");
      try {
        const dbStatus = await fetchConfigStatus();
        if (!dbStatus || !dbStatus.dbConnected) {
          throw new Error("MySQL database is not connected on the backend Express server. Please configure Database Settings.");
        }
        console.log("[Save Student] Database connection verified successfully.");
      } catch (dbErr: any) {
        console.error("[Save Student] Database connection verification failed:", dbErr);
        throw new Error(`Database connection offline: ${dbErr.message || dbErr}`);
      }

      // 4. Stage: Student Record Creation
      console.log("[Save Student] Stage: Creating student record...");
      const today = new Date().toISOString().split('T')[0];
      
      // Compress portrait photo using canvas before storing it
      let compressedPhoto = formInputs.photo;
      if (compressedPhoto && compressedPhoto.startsWith('data:image')) {
        console.log("[Save Student] Compressing portrait photo to max 300x400 JPG...");
        try {
          compressedPhoto = await compressStudentPhoto(compressedPhoto, 300, 400, 0.80);
          console.log("[Save Student] Compression completed. Original length:", formInputs.photo.length, "Compressed length:", compressedPhoto.length);
        } catch (compErr) {
          console.warn("[Save Student] Compression failed, saving original photo:", compErr);
        }
      }

      let originalPhoto = formInputs.photoOriginal || photoOriginal || undefined;
      if (originalPhoto && originalPhoto.startsWith('data:image')) {
        console.log("[Save Student] Compressing raw original photo to max 800x1000 JPG to optimize transfer size...");
        try {
          originalPhoto = await compressStudentPhoto(originalPhoto, 800, 1000, 0.85);
          console.log("[Save Student] Original photo compressed successfully.");
        } catch (compErr) {
          console.warn("[Save Student] Original photo compression failed:", compErr);
        }
      }
      const studentId = editingStudent ? editingStudent.id : `stud-${Date.now()}`;

      // Upload photos to Cloudinary in parallel to reduce registration latency
      let uploadedPhoto = compressedPhoto;
      let uploadedOriginal = originalPhoto;
      const uploadPromises: Promise<void>[] = [];

      if (compressedPhoto && compressedPhoto.startsWith('data:image')) {
        console.log("[Save Student] Queuing compressed portrait photo upload...");
        uploadPromises.push(
          uploadImage(compressedPhoto, `student_${studentId}_photo`)
            .then((uploadRes) => {
              if (uploadRes && uploadRes.url) {
                uploadedPhoto = uploadRes.url;
                console.log("[Save Student] Portrait photo uploaded successfully. URL:", uploadedPhoto);
              }
            })
            .catch((uploadErr) => {
              console.warn("[Save Student] Portrait photo upload failed, passing base64 fallback:", uploadErr);
            })
        );
      }

      if (originalPhoto && originalPhoto.startsWith('data:image')) {
        console.log("[Save Student] Queuing raw original photo upload...");
        uploadPromises.push(
          uploadImage(originalPhoto, `student_${studentId}_original`)
            .then((uploadRes) => {
              if (uploadRes && uploadRes.url) {
                uploadedOriginal = uploadRes.url;
                console.log("[Save Student] Original photo uploaded successfully. URL:", uploadedOriginal);
              }
            })
            .catch((uploadErr) => {
              console.warn("[Save Student] Original photo upload failed, passing base64 fallback:", uploadErr);
            })
        );
      }

      if (uploadPromises.length > 0) {
        console.log("[Save Student] Initiating parallel Cloudinary uploads...");
        await Promise.all(uploadPromises);
        console.log("[Save Student] Parallel uploads completed.");
      }

      const uploadedEnhanced = uploadedPhoto;

      let studentToSave: Student;

      if (editingStudent) {
        // Edit mode
        studentToSave = {
          ...editingStudent,
          ...formInputs,
          photo: uploadedPhoto,
          photoOriginal: uploadedOriginal,
          photoEnhanced: uploadedEnhanced,
          name,
          adminNo,
          aliases,
          gateClearanceDate: formInputs.isCleared ? (editingStudent.gateClearanceDate || today) : undefined,
          mealsClearanceDate: formInputs.isCleared ? (editingStudent.mealsClearanceDate || today) : undefined,
        };
        console.log("[Save Student] Operating in EDIT mode for student:", studentToSave.id);
      } else {
        // Add mode
        studentToSave = {
          id: studentId,
          ...formInputs,
          photo: uploadedPhoto,
          photoOriginal: uploadedOriginal,
          photoEnhanced: uploadedEnhanced,
          name,
          adminNo,
          aliases,
          gateClearanceDate: formInputs.isCleared ? today : undefined,
          mealsClearanceDate: formInputs.isCleared ? today : undefined,
        };
        console.log("[Save Student] Operating in ADD mode. Generated ID:", studentToSave.id);
      }

      // 5. Stage: Database Insert
      console.log("[Save Student] Stage: Inserting student record into MySQL database...", studentToSave);
      const dbResponse = await saveStudentInDb(studentToSave);
      console.log("[Save Student] Database insert completed successfully.", dbResponse);

      // 6. Cloud Database Sync (Firestore - Non-blocking background sync)
      if (isFirebaseConfigured()) {
        console.log("[Save Student] Firebase is configured. Starting background Firestore sync...");
        saveStudentInFirestore(studentToSave)
          .then(() => console.log("[Save Student] Firebase Firestore sync completed in background."))
          .catch(fireErr => console.warn("[Save Student] Firebase sync failed in background:", fireErr));
      } else {
        console.log("[Save Student] Firebase is not configured. Skipping cloud sync.");
      }

      // 7. Local Cache Update (non-blocking disk write to prevent UI freeze)
      console.log("[Save Student] Updating local cache and state...");
      const updatedList = editingStudent
        ? (Array.isArray(students) ? students.map(s => s.id === editingStudent.id ? studentToSave : s) : [])
        : [...students, studentToSave];
      setStudents(updatedList);
      setTimeout(() => {
        saveStudentsAsync(updatedList).catch(e => console.warn('Local cache save failed:', e));
      }, 50);
      console.log("[Save Student] Local state and cache scheduled to update in background.");

      // 8. Stage: Success Response
      console.log("[Save Student] Stage: Processing success response...");
      console.log("[Save Student] Success notification displayed.");
      alert("Student saved successfully.");
      console.log("[Save Student] Success notification dismissed.");

      // Clear the form
      setFormInputs({
        adminNo: '',
        name: '',
        gender: 'Male',
        gradeClass: SCHOOL_CLASSES[0],
        boardingStatus: 'Hosteller',
        isCleared: true,
        remarks: '',
        photo: undefined,
        printStatus: 'Not Printed'
      });
      setPhotoRaw(null);
      setPhotoZoom(1.0);
      setPhotoPanX(0);
      setPhotoPanY(0);
      setPhotoWhiten(45);
      setPhotoAutoCenter(true);
      setPhotoFilter('studio');
      setPhotoBgColor('none');
      setHasManualBgEdits(false);

      setShowFormModal(false);
      setEditingStudent(null);
      console.log("[Save Student] Form cleared and modal closed. Save workflow finished successfully.");
    } catch (err: any) {
      console.error("[Save Student] CRITICAL ERROR occurred in save workflow:", err);
      if (err.stack) {
        console.error("[Save Student] Error stack trace:", err.stack);
      }
      
      const errMsg = err.message || '';
      const isConnectionError = 
        errMsg.toLowerCase().includes('connect') || 
        errMsg.toLowerCase().includes('timeout') || 
        errMsg.toLowerCase().includes('time out') || 
        errMsg.toLowerCase().includes('network') || 
        errMsg.toLowerCase().includes('fetch') || 
        errMsg.toLowerCase().includes('abort') || 
        errMsg.toLowerCase().includes('sql') || 
        errMsg.toLowerCase().includes('database');

      if (isConnectionError) {
        alert("Unable to connect to the database. Please try again in a few seconds.");
      } else {
        alert(`Failed to save student: ${err.message || 'Unknown error'}`);
      }
    } finally {
      console.log("[Save Student] Re-enabling Save button (setting isSaving to false).");
      setIsSaving(false);
    }
  };

  // --- INTUITIVE COOPERATIVE BULK SPREADSHEET IMPORTER ---
  // Accepts tab-separated, CSV, or human-delimited lines (comma or pipe)
  const handleBulkImport = () => {
    setBulkImportError(null);
    if (!bulkInput.trim()) {
      setBulkImportError('Roster input field is empty.');
      return;
    }

    const rows = bulkInput.split('\n');
    const parsedStudents: Student[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Default indices based on typical column distribution
    let nameIdx = 0;
    let classIdx = 1;
    let adminIdx = 2;
    let boardingIdx = 3;
    let genderIdx = 4;
    
    let startRow = 0;

    if (rows.length > 0) {
      const firstLineParts = rows[0].split(/[,\t|]+/);
      const isHeader = firstLineParts.some((part) => {
        const lp = part.toLowerCase().trim();
        return (
          lp === 'name' ||
          lp === 'student' ||
          lp === 'full name' ||
          lp === 'class' ||
          lp === 'grade' ||
          lp === 'gender' ||
          lp === 'sex' ||
          lp === 'admin' ||
          lp === 'admin no' ||
          lp === 'id' ||
          lp === 'boarding' ||
          lp === 'boarding status'
        );
      });

      if (isHeader) {
        // Skip header line and map dynamic columns based on exact metadata headings
        startRow = 1;
        firstLineParts.forEach((part, idx) => {
          const lp = part.toLowerCase().trim();
          if (lp.includes('name') || lp === 'student') {
            nameIdx = idx;
          } else if (lp.includes('class') || lp.includes('grade') || lp.includes('form')) {
            classIdx = idx;
          } else if (lp.includes('admin') || lp.includes('id') || lp.includes('no') || lp.includes('number')) {
            adminIdx = idx;
          } else if (lp.includes('board') || lp.includes('hostel') || lp.includes('status')) {
            boardingIdx = idx;
          } else if (lp.includes('gender') || lp.includes('sex')) {
            genderIdx = idx;
          }
        });
      }
    }

    for (let i = startRow; i < rows.length; i++) {
      const line = rows[i].trim();
      if (!line) continue;

      // Split line using comma, tab, or pipe
      let parts = line.split(/[,\t|]+/);
      if (parts.length <= nameIdx || parts[nameIdx].trim() === '') {
        continue;
      }

      const name = parts[nameIdx].trim();
      const gradeClass = parts[classIdx] ? normalizeGradeClass(parts[classIdx]) : 'S.4 A';
      
      // Auto-generate admin no or read from parts
      const customNo = parts[adminIdx] && parts[adminIdx].trim().length > 3 
        ? parts[adminIdx].trim() 
        : `ADM-2026-${(students.length + parsedStudents.length + 1).toString().padStart(3, '0')}`;
      
      // Parse Boarder schema
      let boarding: BoardingStatus = 'Hosteller';
      if (parts[boardingIdx] && parts[boardingIdx].toLowerCase().includes('day')) {
        boarding = 'Day Scholar';
      }

      let gender: 'Male' | 'Female' = 'Male';
      if (parts[genderIdx] && (parts[genderIdx].toLowerCase().trim() === 'female' || parts[genderIdx].toLowerCase().trim() === 'f')) {
        gender = 'Female';
      } else {
        const nameLower = name.toLowerCase();
        // High coverage regex matching typical female names, biblicals & regional Ganda/Ugandan female indicators
        const femalePatterns = /\b(sarah|chipo|fatima|priya|aminata|mercy|tendai|rachel|racheal|reachel|rachele|mary|maria|marie|mariam|mariama|jane|grace|joyce|esther|ruth|doris|alice|beatrice|florence|rose|agnes|helen|evelyn|margaret|anne|anna|lucy|milly|clara|fiona|irene|gloria|winifred|judith|lillian|patricia|hannah|sharon|naomi|rebecca|miriam|tabitha|deborah|priscilla|phoebe|lydia|peace|hope|charity|faith|joy|providence|patience|comfort|blessing|vicky|victoria|elizabeth|edith|damaris|lynda|linda|brenda|shiela|sheila|tracy|stella|anitah|anita|dorcus|diana|daisy|jackline|jacqueline|daphine|daphne|peninah|proscoviya|proscovia|mrs|miss|lady|female|queen|hadassah|abigail|sandra|favour|loice|milika|naiga|nakato|babirye|namubiru|nankya|najjuma|nakanwagi|nakazibwe|namaganda|nsubuga|nanfuka|namutebi|nambi|nakasi|namara|natukunda|tumusiime|kemigisha|atukwatse|ankunda|kyomugisha|arinda|karungi|kabasinguzi|atwooki|abwooli|katusiime|asimwe|asiimwe|mbabazi|akiteng|amaro|apio|aceng|atyo|akello|awor|aber|anena|alomol|akurut|asijo|adong|alanyo|amit|akoli|among|amulen|aspen|rehema|hadija|fatuma|asha|zara|halima|shifa|mariana|zahra|layla|amina|yasmin|safia|zainab|khadija|rukayah|nuru|muna|warda|nadia|fatma|leila)\b/i;
        if (femalePatterns.test(nameLower)) {
          gender = 'Female';
        }
      }

      parsedStudents.push({
        id: `stud-bulk-${Date.now()}-${i}`,
        adminNo: customNo,
        name,
        gender,
        gradeClass,
        boardingStatus: boarding,
        isCleared: true,
        gateClearanceDate: today,
        mealsClearanceDate: today,
        remarks: 'Batch imported via roster paste.',
        printStatus: 'Not Printed'
      });
    }

    if (parsedStudents.length > 0) {
      const newList = [...students, ...parsedStudents];
      handleSaveAndSync(newList);
      setBulkInput('');
      setShowBulkImporter(false);
      alert(`Successfully registered ${parsedStudents.length} students in Term 2 database!`);
    }
  };

  const handleRemoveDuplicates = async () => {
    // 1. Group students by normalized name
    const grouped = new Map<string, Student[]>();
    students.forEach((s) => {
      const normName = s.name.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!grouped.has(normName)) {
        grouped.set(normName, []);
      }
      grouped.get(normName)!.push(s);
    });

    // 2. Separate into those to keep and those to delete, while building merge groups
    const toKeep: Student[] = [];
    const toDeleteIds: string[] = [];
    const duplicateGroups: Array<{ keep: Student; duplicateIds: string[] }> = [];
    let duplicateCount = 0;

    for (const [name, list] of grouped.entries()) {
      if (list.length === 1) {
        toKeep.push(list[0]);
      } else {
        // We have duplicates!
        duplicateCount += (list.length - 1);
        // Find the best candidate to keep:
        // Priority 1: Has photo
        // Priority 2: First in the array
        let keepIndex = 0;
        for (let i = 1; i < list.length; i++) {
          if (!list[keepIndex].photo && list[i].photo) {
            keepIndex = i;
          }
        }

        const duplicateIds: string[] = [];
        list.forEach((s, idx) => {
          if (idx === keepIndex) {
            toKeep.push(s);
          } else {
            toDeleteIds.push(s.id);
            duplicateIds.push(s.id);
          }
        });

        duplicateGroups.push({ keep: list[keepIndex], duplicateIds });
      }
    }

    if (duplicateCount === 0) {
      alert("No duplicate student names found in the active registry database!");
      return;
    }

    const confirmed = window.confirm(
      `Found ${duplicateCount} duplicate student record(s) by name grouped into ${duplicateGroups.length} duplicate set(s).\n\n` +
      `We will keep the record with passport photos if available, or the first recorded entry, and merge all duplicate records into that student where possible.\n\n` +
      `Do you want to proceed?`
    );

    if (!confirmed) {
      return;
    }

    let successfulMerge = false;
    if (!dbConnectionError && duplicateGroups.length > 0) {
      try {
        for (const group of duplicateGroups) {
          await mergeDuplicateStudentsInDb(group.keep.id, group.duplicateIds, group.keep.adminNo || undefined);
        }
        successfulMerge = true;
      } catch (mergeErr: any) {
        console.error('Failed to merge duplicate students via backend:', mergeErr);
        alert(`Duplicate merge failed: ${mergeErr?.message || mergeErr}. Falling back to local cleanup.`);
      }
    }

    if (successfulMerge) {
      try {
        await loadStudentsFromServer();
      } catch (refreshErr) {
        console.warn('Unable to refresh student list after merge:', refreshErr);
      }
      setSelectedIds(prev => prev.filter(id => !toDeleteIds.includes(id)));
      if (toDeleteIds.includes(previewStudentId)) {
        setPreviewStudentId(students.find((s) => !toDeleteIds.includes(s.id))?.id || null);
      }
      alert(`Successfully merged ${duplicateCount} duplicate student record(s) into ${duplicateGroups.length} keep record(s).`);
      return;
    }

    await handleSaveAndSync(toKeep);
    setSelectedIds(prev => prev.filter(id => !toDeleteIds.includes(id)));
    if (toDeleteIds.includes(previewStudentId)) {
      setPreviewStudentId(toKeep[0]?.id || '');
    }
    alert(`Successfully removed ${duplicateCount} duplicate student records locally.`);
  };

  const handlePhotosZipUpload = async (file: File) => {
    if (!file) return;
    setIsProcessingPhotosZip(true);
    setPhotosZipProgress('Loading ZIP archive...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const zip = await JSZip.loadAsync(buffer);
        const files = Object.keys(zip.files);
        
        let index = 0;
        let matchedCount = 0;
        let unmatchedCount = 0;

        // Build a map of normalized admin numbers / IDs to student IDs for quick lookup
        const studentLookup = new Map<string, string>();
        students.forEach(s => {
          const normAdmin = s.adminNo.trim().toLowerCase().replace(/\s+/g, '');
          if (normAdmin) studentLookup.set(normAdmin, s.id);
          const normId = s.id.trim().toLowerCase();
          if (normId) studentLookup.set(normId, s.id);
        });

        const updatedStudents = [...students];

        for (const filename of files) {
          const fileEntry = zip.files[filename];
          if (
            fileEntry.dir || 
            filename.includes('__MACOSX') || 
            !(filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.png') || filename.toLowerCase().endsWith('.jpeg'))
          ) {
            continue;
          }

          index++;
          setPhotosZipProgress(`Extracting photo ${index}...`);

          const base64Data = await fileEntry.async('base64');
          const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          const dataUrl = `data:${mimeType};base64,${base64Data}`;

          const baseName = filename.split('/').pop() || '';
          const lastDotIdx = baseName.lastIndexOf('.');
          const stem = lastDotIdx !== -1 ? baseName.substring(0, lastDotIdx) : baseName;
          const normStem = stem.trim().toLowerCase().replace(/\s+/g, '');

          const matchedId = studentLookup.get(normStem);
          if (matchedId) {
            const studentIdx = updatedStudents.findIndex(s => s.id === matchedId);
            if (studentIdx !== -1) {
              updatedStudents[studentIdx] = {
                ...updatedStudents[studentIdx],
                photo: dataUrl
              };
              matchedCount++;
            }
          } else {
            unmatchedCount++;
          }
        }

        if (matchedCount > 0) {
          await handleSaveAndSync(updatedStudents);
          alert(`Success: Automatically matched and updated ${matchedCount} student passport photos!\n\n${unmatchedCount} photos in the ZIP did not match any student names/student numbers and were skipped.`);
        } else {
          alert(`No matching students found. Ensure the image filenames in the ZIP archive match the student numbers (e.g. "123.jpg" for student with student number "123").`);
        }
      } catch (err: any) {
        console.error("Failed to process photo ZIP archive:", err);
        alert(`Error processing ZIP: ${err.message || 'Check if the file is a valid ZIP archive.'}`);
      } finally {
        setIsProcessingPhotosZip(false);
        setPhotosZipProgress('');
      }
    };

    reader.onerror = () => {
      alert("Failed to read the selected file.");
      setIsProcessingPhotosZip(false);
      setPhotosZipProgress('');
    };

    reader.readAsArrayBuffer(file);
  };

  const markAsPrinted = (studentIds: string[]) => {
    const updated = Array.isArray(students) ? students.map((s) => {
      if (studentIds.includes(s.id)) {
        return {
          ...s,
          printStatus: 'Printed' as const,
        };
      }
      return s;
    }) : [];
    handleSaveAndSync(updated);
  };

  const handleReprintSelected = () => {
    if (selectedIds.length === 0) return;
    const updated = Array.isArray(students) ? students.map((s) => {
      if (selectedIds.includes(s.id)) {
        return {
          ...s,
          printStatus: 'Not Printed' as const,
        };
      }
      return s;
    }) : [];
    handleSaveAndSync(updated);
    setSelectedIds([]);
    alert(`Successfully reset print status to 'Not Printed' for ${selectedIds.length} students.`);
  };

  // --- TRIGGER NATIVE BROWSER PRINT DIALOG ---
  const handleTriggerWebPrint = async () => {
    if (selectedStudentsData.length === 0) {
      alert('Please check/select at least one student card to queue for printing.');
      return;
    }

    // Wait for all images inside the print section to load completely
    const printSection = document.getElementById('print-section');
    if (printSection) {
      const images = Array.from(printSection.getElementsByTagName('img'));
      const loadPromises = images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => {
            console.warn(`Failed to load image: ${img.src}`);
            resolve(); // Resolve anyway so print dialog still opens
          };
        });
      });
      await Promise.all(loadPromises);
    }

    window.print();
    const printedIds = Array.isArray(selectedStudentsData) ? selectedStudentsData.map(s => s.id) : [];
    markAsPrinted(printedIds);
  };

  const handleAdminLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Admin Google login failed:", err);
      alert("Admin Sign-In failed: " + (err.message || err));
    }
  };

  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      console.error("Admin logout failed:", err);
    }
  };

  const handleTriggerPdfExport = async (customStudents?: Student[] | React.MouseEvent) => {
    const targetStudents = Array.isArray(customStudents) ? customStudents : [...studentsToExport];
    if (targetStudents.length === 0) {
      alert('No students fit the active export criteria / range.');
      return;
    }

    try {
      const targetStudentIds = Array.isArray(targetStudents) ? targetStudents.map(s => s.id) : [];
      const res = await generatePdfOnServer({
        layoutMode: pdfLayoutMode,
        studentIds: targetStudentIds,
        printSide: printSide,
        increasePdfBrightness,
        showWatermark,
        watermarkOpacity,
        schoolLogoBase64: schoolLogo
      });

      if (res.success && res.taskId) {
        handleAddTask({
          type: 'pdf',
          name: `Clearance Cards (${targetStudentIds.length} students)`,
          taskId: res.taskId,
          total: targetStudentIds.length,
          targetStudentIds: targetStudentIds
        });
        alert('Clearance card generation started in the background. Check progress in the Background Tasks panel (bottom right).');
      }
    } catch (e: any) {
      console.error('Server PDF generation failed:', e);
      alert(`Server PDF generation failed: ${e.message}`);
    }
  };

  // --- PRINT HOSTELLERS ONLY QUICK ACTION ---
  const handlePrintHostellersOnly = async () => {
    if (!dbConnectionError) {
      try {
        const academicYear = filterAcademicYear === 'All' ? undefined : filterAcademicYear;
        const res = await generatePdfOnServer({
          layoutMode: pdfLayoutMode,
          studentIds: [],
          filters: {
            search: searchQuery,
            gradeClass: filterClass === 'All' ? undefined : filterClass,
            stream: filterStream === 'All' ? undefined : filterStream,
            gender: filterGender === 'All' ? undefined : filterGender,
            isCleared: filterClearance === 'All' ? undefined : filterClearance,
            boardingStatus: 'Hosteller',
            photo: filterPhoto === 'All' ? undefined : filterPhoto,
            printStatus: printNewOnly ? 'Not Printed' : undefined,
            academicYear
          },
          printSide: printSide,
          increasePdfBrightness,
          showWatermark,
          watermarkOpacity,
          schoolLogoBase64: schoolLogo
        });

        if (res.success && res.taskId) {
          handleAddTask({
            type: 'pdf',
            name: 'Hosteller Clearance Cards',
            taskId: res.taskId,
            total: 50
          });
          alert('Hosteller clearance card generation started in the background. Check progress in the Background Tasks panel (bottom right).');
        }
      } catch (e: any) {
        console.error('Server PDF generation failed:', e);
        alert(`Server PDF generation failed: ${e.message}`);
      }
      return;
    }

    // Local fallback when dbConnectionError is true
    setIsGeneratingPdf(true);
    setPdfProgress({ current: 0, total: 100 });
    try {
      const hostellers = students.filter(s => {
        const query = searchQuery.trim().toLowerCase();
        const matchesQuery = !query ? true : (
          s.name.toLowerCase().includes(query) ||
          s.adminNo.toLowerCase().includes(query) ||
          s.gradeClass.toLowerCase().includes(query)
        );
        
        const { className, streamName } = parseClassAndStream(s.gradeClass);
        const matchesClass = filterClass === 'All' || className === filterClass;
        const matchesStream = filterStream === 'All' || streamName === filterStream;
        const matchesGender = filterGender === 'All' || s.gender === filterGender;
        
        const matchesClearance =
          filterClearance === 'All' ||
          (filterClearance === 'Cleared' && s.isCleared) ||
          (filterClearance === 'Hold' && !s.isCleared);
          
        const matchesBoarding = s.boardingStatus === 'Boarder' || s.boardingStatus === 'Hosteller';
        const matchesAcademicYear = filterAcademicYear === 'All' || getAcademicYear(s) === filterAcademicYear;
        const matchesPrintStatus = !printNewOnly || s.printStatus === 'Not Printed' || !s.printStatus;
        const matchesPhoto =
          filterPhoto === 'All' ||
          (filterPhoto === 'WithPhoto' && !!s.photo) ||
          (filterPhoto === 'NoPhoto' && !s.photo);

        return (
          matchesQuery &&
          matchesClass &&
          matchesStream &&
          matchesGender &&
          matchesClearance &&
          matchesBoarding &&
          matchesAcademicYear &&
          matchesPrintStatus &&
          matchesPhoto
        );
      });

      if (hostellers.length === 0) {
        alert('No hostellers fit the current matching criteria.');
        setIsGeneratingPdf(false);
        setPdfProgress(null);
        return;
      }

      const targetHostellers = [...hostellers];
      markAsPrinted(Array.isArray(targetHostellers) ? targetHostellers.map(s => s.id) : []);
      setFilterBoarding('Hosteller');

      setPdfProgress({ current: 0, total: targetHostellers.length });
      
      const doc = await generateClearancePdf({
        layoutMode: pdfLayoutMode,
        students: targetHostellers,
        onProgress: (current, total) => {
          setPdfProgress({ current, total });
        },
        schoolLogoBase64: schoolLogo,
        printSide: printSide,
        enablePhotoEnhancement,
        increasePdfBrightness,
        showWatermark,
        watermarkOpacity,
        highQualityPrintMode,
      });

      const filename = `clearance-cards-hostellers-${new Date().toISOString().split('T')[0]}.pdf`;
      
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const pdfDataUri = doc.output('datauristring');
        const base64Data = pdfDataUri.substring(pdfDataUri.indexOf(',') + 1);
        const result = await (window as any).electron.saveFileBase64(filename, base64Data, [{ name: 'PDF Documents', extensions: ['pdf'] }]);
        if (result.success) {
          alert(`PDF saved successfully to:\n${result.filePath}`);
        } else if (result.error !== 'Cancelled') {
          alert(`Failed to save PDF: ${result.error}`);
        }
      } else {
        doc.save(filename);
      }
    } catch (e: any) {
      console.error('Print Hostellers failed:', e);
      alert(`Print Hostellers failed: ${e.message}`);
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  };

  // --- PRINT REPORT CARD QUICK ACTION ---
  const handlePrintReportCard = async (studentId: string) => {
    setIsCompilingReport(true);
    setReportProgress({ current: 0, total: 1 });
    try {
      const res = await generateReportCards({
        studentIds: [studentId],
        term: '2',
        year: 2026
      });

      if (res.success && res.taskId) {
        const taskId = res.taskId;
        let done = false;
        
        while (!done) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const statusRes = await fetchPdfTaskStatus(taskId);
          
          if (statusRes.status === 'processing') {
            setReportProgress({ current: statusRes.progress, total: statusRes.total });
          } else if (statusRes.status === 'completed') {
            done = true;
            setReportProgress({ current: statusRes.total, total: statusRes.total });
            const downloadUrl = `${getApiBaseUrl()}/api/pdf/download/${statusRes.filename}`;
            await triggerFileDownload(downloadUrl, statusRes.filename!);
          } else if (statusRes.status === 'failed') {
            throw new Error(statusRes.error || 'Compilation failed.');
          }
        }
      }
    } catch (e: any) {
      console.error('Failed to compile report card:', e);
      alert(`Failed to compile report card: ${e.message}`);
    } finally {
      setIsCompilingReport(false);
      setReportProgress(null);
    }
  };

  // --- EXPORT ACTIVE MATCHES TO EXCEL SPREADSHEET ---
  const handleExportToExcel = async () => {
    if (studentsToExport.length === 0) {
      alert('No students fit the active export criteria / range.');
      return;
    }

    try {
      const data = studentsToExport.map((s, idx) => ({
        'S/N': idx + 1,
        'Student Number': s.adminNo,
        'Full Name': s.name,
        'Gender': s.gender,
        'Class/Form': s.gradeClass,
        'Boarding Status': s.boardingStatus === 'Boarder' || s.boardingStatus === 'Hosteller' ? 'Hosteller (Boarding)' : 'Day Scholar',
        'Clearance Status': s.isCleared ? 'Cleared' : 'On Hold',
        'Print Status': s.printStatus || 'Not Printed',
        'Remarks': s.remarks || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered Students');

      const maxLens = Object.keys(data[0] || {}).reduce((acc: Record<string, number>, key) => {
        acc[key] = key.length;
        return acc;
      }, {});
      
      data.forEach(row => {
        Object.keys(row).forEach(key => {
          const val = row[key as keyof typeof row];
          const len = val ? String(val).length : 0;
          if (len > maxLens[key]) {
            maxLens[key] = len;
          }
        });
      });

      worksheet['!cols'] = Object.keys(maxLens).map(key => ({
        wch: Math.max(maxLens[key] + 3, 10)
      }));

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `student-roster-${dateStr}.xlsx`;

      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        const result = await (window as any).electron.saveFileBase64(filename, base64Data, [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }]);
        if (result.success) {
          alert(`Excel file saved successfully to:\n${result.filePath}`);
        } else if (result.error !== 'Cancelled') {
          alert(`Failed to save Excel file: ${result.error}`);
        }
      } else {
        XLSX.writeFile(workbook, filename);
      }
    } catch (err) {
      console.error('Excel export failed:', err);
      alert('An issue occurred during Excel generation.');
    }
  };

  // Export students by scope: All / Current filtered / By Class / By Stream
  const handleExportScopeExcel = async () => {
    try {
      let rows: any[] = [];
      if (exportScope === 'Current') {
        rows = studentsToExport;
      } else {
        // Build params for server fetch
        const params: any = { limit: -1 };
        if (exportScope === 'All') {
          // no extra params
        } else if (exportScope === 'ByClass' && exportClass && exportClass !== 'All') {
          params.gradeClass = exportClass;
        } else if (exportScope === 'ByStream' && exportStream && exportStream !== 'All') {
          params.stream = exportStream;
        }
        // Apply combined export preset override if set
        if (exportPreset === 'New') {
          params.printStatus = 'Not Printed';
        } else if (exportPreset === 'WithPhotos') {
          params.photo = 'WithPhoto';
        } else if (exportPreset === 'NewWithPhotos') {
          params.printStatus = 'Not Printed';
          params.photo = 'WithPhoto';
        } else {
          // Respect existing UI filters when no preset selected
          if (filterPhoto && filterPhoto !== 'All') params.photo = filterPhoto;
          if (printNewOnly) params.printStatus = 'Not Printed';
        }

        const res = await fetchStudentsFromDb(params);
        rows = Array.isArray(res?.data) ? res.data : [];
      }

      if (!rows || rows.length === 0) {
        alert('No students found for the selected export scope.');
        return;
      }

      const data = rows.map((s: any, idx: number) => ({
        'S/N': idx + 1,
        'Student Number': s.adminNo,
        'Full Name': s.name,
        'Gender': s.gender,
        'Class/Form': s.gradeClass,
        'Boarding Status': s.boardingStatus === 'Boarder' || s.boardingStatus === 'Hosteller' ? 'Hosteller (Boarding)' : 'Day Scholar',
        'Clearance Status': s.isCleared ? 'Cleared' : 'On Hold',
        'Print Status': s.printStatus || 'Not Printed',
        'Has Photo': s.hasPhoto ? 'Yes' : 'No',
        'Remarks': s.remarks || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Exported Students');

      const maxLens: Record<string, number> = Object.keys(data[0] || {}).reduce((acc: Record<string, number>, key) => {
        acc[key] = key.length; return acc;
      }, {} as Record<string, number>);
      data.forEach(row => Object.keys(row).forEach(key => {
        const val = row[key as keyof typeof row];
        const len = val ? String(val).length : 0;
        if (len > maxLens[key]) maxLens[key] = len;
      }));
      worksheet['!cols'] = Object.keys(maxLens).map(k => ({ wch: Math.max(maxLens[k] + 3, 10) }));

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `student-export-${exportScope.toLowerCase()}-${dateStr}.xlsx`;

      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        const result = await (window as any).electron.saveFileBase64(filename, base64Data, [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }]);
        if (result.success) alert(`Excel file saved: ${result.filePath}`);
      } else {
        XLSX.writeFile(workbook, filename);
      }
    } catch (err) {
      console.error('Scoped export failed:', err);
      alert('An error occurred during scoped export.');
    }
  };

  const handleExportCsvDirect = async () => {
    const targetIds = activeLevel === 'master' ? selectedIds : (activeLevel === 'selective' ? selectiveSelectedIds : []);
    if (targetIds.length === 0) {
      setExportErrorMessage("Please select students to export.");
      setExportSuccessMessage(null);
      setTimeout(() => setExportErrorMessage(null), 5000);
      return;
    }

    setIsExporting(true);
    setExportErrorMessage(null);
    setExportSuccessMessage(null);
    setExportedStudentsCount(null);

    const targetStudents = students.filter(s => targetIds.includes(s.id));

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const csvFilename = `students-export-${dateStr}.csv`;

      const csvRes = await fetch(`${getApiBaseUrl()}/api/export/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: targetStudents })
      });
      if (!csvRes.ok) throw new Error("Failed to export CSV from server");
      const csvBlob = await csvRes.blob();

      // Trigger CSV Download
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await (window as any).electron.saveFileBase64(csvFilename, base64Data, [{ name: 'CSV Document', extensions: ['csv'] }]);
        };
        reader.readAsDataURL(csvBlob);
      } else {
        const url = window.URL.createObjectURL(csvBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = csvFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }

      setExportedStudentsCount(targetStudents.length);
      setLastExportedStudents(targetStudents);
      setExportSuccessMessage(`${targetStudents.length} students exported successfully.`);
      setTimeout(() => setExportSuccessMessage(null), 7000);
    } catch (err: any) {
      console.error("CSV Export failed:", err);
      setExportErrorMessage(err.message || "An issue occurred during CSV export.");
      setTimeout(() => setExportErrorMessage(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcelDirect = async () => {
    const targetIds = activeLevel === 'master' ? selectedIds : (activeLevel === 'selective' ? selectiveSelectedIds : []);
    if (targetIds.length === 0) {
      setExportErrorMessage("Please select students to export.");
      setExportSuccessMessage(null);
      setTimeout(() => setExportErrorMessage(null), 5000);
      return;
    }

    setIsExporting(true);
    setExportErrorMessage(null);
    setExportSuccessMessage(null);
    setExportedStudentsCount(null);

    const targetStudents = students.filter(s => targetIds.includes(s.id));

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const excelFilename = `students-export-${dateStr}.xlsx`;

      const excelRes = await fetch(`${getApiBaseUrl()}/api/export/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: targetStudents })
      });
      if (!excelRes.ok) throw new Error("Failed to export Excel from server");
      const excelBlob = await excelRes.blob();

      // Trigger Excel Download
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await (window as any).electron.saveFileBase64(excelFilename, base64Data, [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }]);
        };
        reader.readAsDataURL(excelBlob);
      } else {
        const url = window.URL.createObjectURL(excelBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = excelFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }

      setExportedStudentsCount(targetStudents.length);
      setLastExportedStudents(targetStudents);
      setExportSuccessMessage(`${targetStudents.length} students exported successfully.`);
      setTimeout(() => setExportSuccessMessage(null), 7000);
    } catch (err: any) {
      console.error("Excel Export failed:", err);
      setExportErrorMessage(err.message || "An issue occurred during Excel export.");
      setTimeout(() => setExportErrorMessage(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSelectedToFiles = async () => {
    const targetIds = activeLevel === 'master' ? selectedIds : (activeLevel === 'selective' ? selectiveSelectedIds : []);
    if (targetIds.length === 0) {
      setExportErrorMessage("Please select students to export.");
      setExportSuccessMessage(null);
      setTimeout(() => setExportErrorMessage(null), 5000);
      return;
    }

    setIsExporting(true);
    setExportErrorMessage(null);
    setExportSuccessMessage(null);
    setExportedStudentsCount(null);
    setLastExportedStudents(null);

    const targetStudents = students.filter(s => targetIds.includes(s.id));

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const csvFilename = `students-export-${dateStr}.csv`;
      const excelFilename = `students-export-${dateStr}.xlsx`;

      // 1. Export CSV
      const csvRes = await fetch(`${getApiBaseUrl()}/api/export/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: targetStudents })
      });
      if (!csvRes.ok) throw new Error("Failed to export CSV from server");
      const csvBlob = await csvRes.blob();

      // Trigger CSV Download
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await (window as any).electron.saveFileBase64(csvFilename, base64Data, [{ name: 'CSV Document', extensions: ['csv'] }]);
        };
        reader.readAsDataURL(csvBlob);
      } else {
        const url = window.URL.createObjectURL(csvBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = csvFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }

      // 2. Export Excel
      const excelRes = await fetch(`${getApiBaseUrl()}/api/export/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: targetStudents })
      });
      if (!excelRes.ok) throw new Error("Failed to export Excel from server");
      const excelBlob = await excelRes.blob();

      // Trigger Excel Download
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await (window as any).electron.saveFileBase64(excelFilename, base64Data, [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }]);
        };
        reader.readAsDataURL(excelBlob);
      } else {
        const url = window.URL.createObjectURL(excelBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = excelFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }

      // Success State
      setExportedStudentsCount(targetStudents.length);
      setLastExportedStudents(targetStudents);
      setExportSuccessMessage(`${targetStudents.length} students exported successfully.`);
      setTimeout(() => setExportSuccessMessage(null), 7000);
    } catch (err: any) {
      console.error("Export process failed:", err);
      setExportErrorMessage(err.message || "An issue occurred during file exports.");
      setTimeout(() => setExportErrorMessage(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadCsvOnly = async () => {
    if (!lastExportedStudents || lastExportedStudents.length === 0) return;
    setIsExporting(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const csvFilename = `students-export-${dateStr}.csv`;
      const csvRes = await fetch(`${getApiBaseUrl()}/api/export/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: lastExportedStudents })
      });
      if (!csvRes.ok) throw new Error("Failed to download CSV");
      const csvBlob = await csvRes.blob();
      
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await (window as any).electron.saveFileBase64(csvFilename, base64Data, [{ name: 'CSV Document', extensions: ['csv'] }]);
        };
        reader.readAsDataURL(csvBlob);
      } else {
        const url = window.URL.createObjectURL(csvBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = csvFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setExportErrorMessage(err.message || "Failed to download CSV.");
      setTimeout(() => setExportErrorMessage(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadExcelOnly = async () => {
    if (!lastExportedStudents || lastExportedStudents.length === 0) return;
    setIsExporting(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const excelFilename = `students-export-${dateStr}.xlsx`;
      const excelRes = await fetch(`${getApiBaseUrl()}/api/export/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: lastExportedStudents })
      });
      if (!excelRes.ok) throw new Error("Failed to download Excel");
      const excelBlob = await excelRes.blob();

      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await (window as any).electron.saveFileBase64(excelFilename, base64Data, [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }]);
        };
        reader.readAsDataURL(excelBlob);
      } else {
        const url = window.URL.createObjectURL(excelBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = excelFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setExportErrorMessage(err.message || "Failed to download Excel.");
      setTimeout(() => setExportErrorMessage(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  // --- SESSION RENDER GATEWAYS ---
  // Public route bypass for Document Verification Portal
  if (typeof window !== 'undefined' && window.location && (window.location.pathname.startsWith('/verify/') || window.location.pathname.startsWith('/staff/verify/'))) {
    return (
      <Suspense fallback={<Loading message="Opening secure verification link..." />}>
        <DocumentVerificationPortal />
      </Suspense>
    );
  }

  if (!authSession || !authSession.user) {
    return (
      <LoginGateway
        onLogin={(session) => {
          // Remove any legacy route caches and prevent restoring last-used pages
          clearLegacyClearanceRouteCache();
          try {
            localStorage.removeItem('lastRoute');
            localStorage.removeItem('lastPath');
            localStorage.removeItem('lastVisited');
            sessionStorage.removeItem('lastRoute');
            sessionStorage.removeItem('lastPath');
            sessionStorage.removeItem('lastVisited');
          } catch (e) {
            // ignore storage errors
          }

          // Persist session and ensure UI state resets to the Term 2 Student Clearance landing page
          setAuthSession(session);
          try { localStorage.setItem('spss_session', JSON.stringify(session)); } catch (e) { /* ignore */ }

          // Force the clearance workspace and master database section as the landing view
          setActiveModule && setActiveModule('clearance');
          setActiveLevel && setActiveLevel('master');
          setAdminActiveTab && setAdminActiveTab('cards');
          setHasSetInitialModule && setHasSetInitialModule(true);

          // Always navigate to the Term 2 Student Clearance landing page via client-side path replacement
          if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            window.history.replaceState({}, '', '/student-clearance');
          }
        }}
        schoolLogo={schoolLogo}
        dbConnectionError={dbConnectionError}
      />
    );
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col items-center justify-center space-y-6">
          <div className="relative flex items-center justify-center">
            {/* Outer glowing spinner ring */}
            <div className="absolute w-40 h-40 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg p-4 backdrop-blur-md">
              <SchoolLogo className="w-full h-full object-contain" logoBase64={schoolLogo} />
            </div>
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-sm font-black uppercase text-slate-200 font-mono tracking-widest">St. Paul Secondary School Management System</h2>
            <p className="text-[10px] text-slate-500 font-mono">Verifying database connection & initializing modules...</p>
          </div>
        </div>
      </div>
    );
  }

  if (dbConnectionError) {
    const isCloudProduction = typeof window !== 'undefined' && !(window as any).electron;
    if (isCloudProduction) {
      return (
        <div className="min-h-screen w-full bg-radial from-slate-900 via-slate-950 to-black flex items-center justify-center p-4 font-sans select-none antialiased relative">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="w-full max-w-lg bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl space-y-6 relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-violet-500 to-indigo-500 opacity-60" />
            
            <div className="flex flex-col items-center gap-4">
              <div className="p-3.5 bg-rose-500/10 rounded-2xl border border-rose-500/25 shadow-inner text-rose-400 flex items-center justify-center">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">Database Connection Failed</h2>
                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-1">Cloud Production Mode</p>
              </div>
            </div>

            <div className="bg-slate-955/65 border border-slate-850 rounded-2xl p-5 text-xs text-slate-300 leading-relaxed text-left space-y-3 font-medium">
              <p className="text-slate-205 font-bold text-rose-400/90">
                The application was unable to establish a secure connection to the database.
              </p>
              <p className="text-slate-450 text-[10.5px]">
                In Cloud Production mode, settings inputs are locked. Database credentials must be configured on the host server environment variables.
              </p>
              <div className="pt-2 border-t border-slate-850 space-y-1.5">
                <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block">Required Environment Variables:</span>
                <code className="block p-2 bg-slate-950 rounded border border-slate-850 font-mono text-[9.5px] text-slate-300 whitespace-pre-wrap select-all">
                  DATABASE_URL (Recommended) or{"\n"}
                  DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE
                </code>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleRetryConnection}
                className="w-full py-3 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg border border-indigo-500 shadow-indigo-950/40 transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 font-sans"
              >
                <RefreshCw className="w-4 h-4" /> Retry Connection
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen w-full bg-radial from-slate-900 via-slate-950 to-black flex items-center justify-center p-4 font-sans select-none antialiased relative">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-full max-w-md bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl space-y-6 relative overflow-hidden text-center">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-violet-500 to-indigo-500 opacity-60" />
          
          <div className="flex flex-col items-center gap-4">
            <div className="p-3.5 bg-rose-500/10 rounded-2xl border border-rose-500/25 shadow-inner text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">Database Unreachable</h2>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-1">St. Paul Secondary School</p>
            </div>
          </div>

          <div className="bg-slate-955/60 border border-slate-850 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed text-left space-y-2 font-medium">
            <p className="text-slate-205 font-semibold">
              {(dbConfig?.mode === 'network' || dbConfig?.mode === 'client') 
                ? 'Centralized Network Database configured. Offline Mode is disabled to prevent data discrepancy.' 
                : 'The application cannot connect to the shared database server.'}
            </p>
            <p className="text-slate-400 text-[10px]">
              {(dbConfig?.mode === 'network' || dbConfig?.mode === 'client')
                ? 'Please ensure your computer is connected to the local network and the database server is running. Standalone offline mode is disabled.'
                : 'Please ensure your computer is connected to the network and the MySQL database server is running and accessible.'}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleRetryConnection}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg border border-indigo-500 shadow-indigo-950/40 transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 font-sans"
            >
              <RefreshCw className="w-4 h-4" /> Try Reconnecting
            </button>
            <button
              onClick={handleOpenDbSettings}
              className="w-full py-3 bg-slate-955/80 hover:bg-slate-850 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-850 transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 font-sans"
            >
              <Database className="w-4 h-4 text-indigo-400" /> Connection Settings
            </button>
          </div>
        </div>

        {/* Global settings modal rendering when database is offline */}
        {showDbSettingsModal && (
          <div className="no-print fixed inset-0 z-50 bg-slate-955/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <span>Database Connection Settings</span>
                </h3>
                <button
                  onClick={() => setShowDbSettingsModal(false)}
                  className="text-slate-550 hover:text-slate-350 transition-colors cursor-pointer"
                >
                  <XCircle className="w-5 h-5 text-slate-550 hover:text-slate-400" />
                </button>
              </div>

              <div className="space-y-4 text-left">
                {/* Mode Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Operational Mode</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-955 rounded-lg border border-slate-850">
                    <button
                      type="button"
                      onClick={() => setDbFormConfig((prev: any) => ({ ...prev, mode: 'network' }))}
                      className={`py-2 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        dbFormConfig.mode === 'network' || dbFormConfig.mode === 'host'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5" />
                      Network DB (Host)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDbFormConfig((prev: any) => ({ ...prev, mode: 'client' }))}
                      className={`py-2 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        dbFormConfig.mode === 'client'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      Network Client (Device)
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-505 leading-normal font-medium">
                    {dbFormConfig.mode === 'network' || dbFormConfig.mode === 'host'
                      ? 'Network Database Mode (Server/Host) runs the local API server and connects to the shared network MySQL server.'
                      : 'Network Client Mode (Client Device) connects to an existing Host API server URL running on the network.'}
                  </p>
                </div>

                {dbFormConfig.mode === 'host' || dbFormConfig.mode === 'network' ? (
                  <div className="space-y-3 p-3 bg-slate-955 border border-slate-850 rounded-lg">
                    <span className="text-[9.5px] text-indigo-400 font-black uppercase tracking-wider block">
                      MySQL Connection Parameters
                    </span>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 flex flex-col gap-1">
                        <label className="text-[8.5px] text-slate-505 font-bold uppercase">Host</label>
                        <input
                          type="text"
                          value={dbFormConfig.db?.host || ''}
                          onChange={(e) => setDbFormConfig((prev: any) => ({
                            ...prev,
                            db: { ...prev.db, host: e.target.value }
                          }))}
                          className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8.5px] text-slate-505 font-bold uppercase">Port</label>
                        <input
                          type="number"
                          value={dbFormConfig.db?.port || 3306}
                          onChange={(e) => setDbFormConfig((prev: any) => ({
                            ...prev,
                            db: { ...prev.db, port: parseInt(e.target.value) || 3306 }
                          }))}
                          className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[8.5px] text-slate-505 font-bold uppercase">Database Name</label>
                      <input
                        type="text"
                        value={dbFormConfig.db?.database || ''}
                        onChange={(e) => setDbFormConfig((prev: any) => ({
                          ...prev,
                          db: { ...prev.db, database: e.target.value }
                        }))}
                        className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8.5px] text-slate-505 font-bold uppercase">Username</label>
                        <input
                          type="text"
                          value={dbFormConfig.db?.user || ''}
                          onChange={(e) => setDbFormConfig((prev: any) => ({
                            ...prev,
                            db: { ...prev.db, user: e.target.value }
                          }))}
                          className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8.5px] text-slate-505 font-bold uppercase">Password</label>
                        <input
                          type="password"
                          value={dbFormConfig.db?.password || ''}
                          onChange={(e) => setDbFormConfig((prev: any) => ({
                            ...prev,
                            db: { ...prev.db, password: e.target.value }
                          }))}
                          className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-3 bg-slate-955 border border-slate-850 rounded-lg">
                    <span className="text-[9.5px] text-indigo-400 font-black uppercase tracking-wider block">
                      Remote Host Configuration
                    </span>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8.5px] text-slate-505 font-bold uppercase">Server API Address</label>
                      <input
                        type="text"
                        value={dbFormConfig.serverUrl || ''}
                        onChange={(e) => setDbFormConfig((prev: any) => ({
                          ...prev,
                          serverUrl: e.target.value
                        }))}
                        className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                        placeholder="e.g. http://192.168.1.15:3000"
                      />
                    </div>
                  </div>
                )}

                {connectionTestResult && (
                  <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    connectionTestResult.success
                      ? 'bg-emerald-500/10 border border-emerald-505/20 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-505/20 text-rose-400'
                  }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{connectionTestResult.message}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={async () => {
                    setTestingConnection(true);
                    setConnectionTestResult(null);
                    let testSuccess = false;
                    let errorMessage = '';

                    try {
                      if (dbFormConfig.mode === 'host' || dbFormConfig.mode === 'network') {
                        if ((window as any).electron?.testDbConnection) {
                          const res = await (window as any).electron.testDbConnection(dbFormConfig.db);
                          testSuccess = res.success;
                          errorMessage = res.error || '';
                        } else {
                          const response = await fetch(`${getApiBaseUrl()}/api/test-db-connection`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(dbFormConfig.db)
                          });
                          if (response.ok) {
                            const res = await response.json();
                            testSuccess = res.success;
                            errorMessage = res.error || '';
                          } else {
                            errorMessage = `HTTP error! status: ${response.status}`;
                          }
                        }
                      } else {
                        if ((window as any).electron?.testApiConnection) {
                          const res = await (window as any).electron.testApiConnection(dbFormConfig.serverUrl);
                          testSuccess = res.success;
                          errorMessage = res.error || '';
                        } else {
                          testSuccess = true;
                        }
                      }
                    } catch (err: any) {
                      errorMessage = err.message || 'Unknown test error';
                    } finally {
                      setTestingConnection(false);
                    }

                    if (testSuccess) {
                      setConnectionTestResult({ success: true, message: 'Connection established successfully!' });
                    } else {
                      const mappedError = errorMessage.toLowerCase().includes('access denied') || errorMessage.toLowerCase().includes('using password')
                        ? 'Invalid MySQL credentials'
                        : `Connection failed: ${errorMessage}`;
                      setConnectionTestResult({ success: false, message: mappedError });
                    }
                  }}
                  disabled={testingConnection}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-750 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDbSettingsModal(false)}
                    className="px-4 py-2 bg-slate-955 hover:bg-slate-850 text-slate-400 border border-slate-850 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setTestingConnection(true);
                      setConnectionTestResult(null);
                      let testSuccess = false;
                      let errorMessage = '';

                      try {
                        if (dbFormConfig.mode === 'host' || dbFormConfig.mode === 'network') {
                          if ((window as any).electron?.testDbConnection) {
                            const res = await (window as any).electron.testDbConnection(dbFormConfig.db);
                            testSuccess = res.success;
                            errorMessage = res.error || '';
                          } else {
                            const response = await fetch(`${getApiBaseUrl()}/api/test-db-connection`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(dbFormConfig.db)
                            });
                            if (response.ok) {
                              const res = await response.json();
                              testSuccess = res.success;
                              errorMessage = res.error || '';
                            } else {
                              errorMessage = `HTTP error! status: ${response.status}`;
                            }
                          }
                        } else {
                          if ((window as any).electron?.testApiConnection) {
                            const res = await (window as any).electron.testApiConnection(dbFormConfig.serverUrl);
                            testSuccess = res.success;
                            errorMessage = res.error || '';
                          } else {
                            testSuccess = true;
                          }
                        }
                      } catch (err: any) {
                        errorMessage = err.message || 'Unknown test error';
                      } finally {
                        setTestingConnection(false);
                      }

                      if (!testSuccess) {
                        const mappedError = errorMessage.toLowerCase().includes('access denied') || errorMessage.toLowerCase().includes('using password')
                          ? 'Invalid MySQL credentials'
                          : `Connection failed: ${errorMessage}`;
                        setConnectionTestResult({ success: false, message: mappedError });
                        return;
                      }

                      try {
                        if ((window as any).electron?.saveDbConfig) {
                          const success = await (window as any).electron.saveDbConfig(dbFormConfig);
                          if (success) {
                            setShowDbSettingsModal(false);
                            alert('Connection settings saved successfully. The application will now reload to apply the configuration.');
                            window.location.reload();
                          } else {
                            setConnectionTestResult({ success: false, message: 'Failed to save connection settings.' });
                          }
                        } else {
                          const response = await fetch(`${getApiBaseUrl()}/api/save-db-config`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(dbFormConfig)
                          });
                          if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                          }
                          const res = await response.json();
                          if (res.success) {
                            setShowDbSettingsModal(false);
                            alert('Connection settings saved successfully (via API). The application will now reload to apply the configuration.');
                            window.location.reload();
                          } else {
                            setConnectionTestResult({ success: false, message: 'Failed to save connection settings.' });
                          }
                        }
                      } catch (err: any) {
                        setConnectionTestResult({ success: false, message: `Failed to save settings: ${err.message}` });
                      }
                    }}
                    disabled={testingConnection}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white border border-indigo-500 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                  >
                    {testingConnection ? 'Saving...' : 'Save & Apply'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        </div>
      );
    }



  if (authSession.role === 'student') {
    if (authSession.user.needsPasswordChange) {
      return (
        <Suspense fallback={<Loading message="Loading..." />}>
          <StudentForcePasswordChange
            studentId={authSession.user.id}
            studentName={authSession.user.name}
            adminNo={authSession.user.adminNo}
            schoolLogo={schoolLogo}
            onPasswordChanged={() => {
              const updated = {
                ...authSession,
                user: {
                  ...authSession.user,
                  needsPasswordChange: false
                }
              };
              setAuthSession(updated);
              localStorage.setItem('spss_session', JSON.stringify(updated));
            }}
            onLogout={handleLogout}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<Loading message="Loading student portal..." />}>
        <StudentPortal
          studentId={authSession.user.id}
          studentName={authSession.user.name}
          adminNo={authSession.user.adminNo}
          schoolLogo={schoolLogo}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (authSession.role === 'parent') {
    return (
      <Suspense fallback={<Loading message="Loading Parent Portal..." />}>
        <ParentPortal
          studentId={authSession.user.studentId || authSession.user.id}
          studentName={authSession.user.studentName || authSession.user.name}
          adminNo={authSession.user.adminNo}
          schoolLogo={schoolLogo}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (authSession.role === 'teacher') {
    return (
      <Suspense fallback={<Loading message="Loading Staff Portal..." />}>
        <StaffPortal
          staffId={authSession.user.id}
          staffName={authSession.user.name}
          staffUsername={authSession.user.username}
          category={authSession.user.category || 'Teaching'}
          assignedClasses={authSession.user.classes || []}
          assignedSubjects={authSession.user.subjects || []}
          teacherAssignments={authSession.user.assignments || []}
          schoolLogo={schoolLogo}
          authorizedSignature={authorizedSignature}
          gender={authSession.user.gender}
          photo={authSession.user.photo}
          classTeacherFor={authSession.user.classTeacherFor}
          onLogout={handleLogout}
          position={authSession.user.position}
          forcePasswordChange={authSession.user.forcePasswordChange || false}
        />
      </Suspense>
    );
  }

  // Admin early return removed so that administrators fall through to the main Full Clearance Dashboard.
  return (
    <>
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* HEADER NAVBAR */}
      <header className="no-print bg-slate-950 border-b border-slate-800 shrink-0 px-4 py-4 md:px-6 flex flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="relative p-1 bg-slate-900/45 rounded-lg border border-slate-800 shrink-0 shadow-inner">
            <SchoolLogo className="w-12 h-12" logoBase64={schoolLogo} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-xl font-black text-slate-100 uppercase tracking-tight">The Mighty System</h1>
              {dbConnectionError ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-rose-500/10 border border-rose-500/25 text-rose-400" title="MySQL connection offline. Working on local cache. Changes will automatically sync once connection is restored.">
                  ⚠️ MySQL Offline (Caching)
                </span>
              ) : syncQueueCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-amber-500/10 border border-amber-500/25 text-amber-400 animate-pulse" title={`Connected to MySQL. Syncing ${syncQueueCount} pending changes...`}>
                  ✓ MySQL Online (Syncing {syncQueueCount}...)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/25 text-emerald-400" title="Connected to MySQL database. Data is fully synchronized.">
                  ✓ MySQL Online
                </span>
              )}
              {cameraDiagnostic.status === 'ok' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/25 text-emerald-400" title={cameraDiagnostic.message || ''}>
                  📷 Camera Ready
                </span>
              ) : cameraDiagnostic.status === 'testing' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 animate-pulse">
                  📷 Testing Camera...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-rose-550/15 border border-rose-500/25 text-rose-400" title={cameraDiagnostic.message || ''}>
                  📷 Camera Alert
                </span>
              )}
            </div>
            <p className="text-[9px] sm:text-xs text-slate-400 mt-0.5 max-w-[200px] sm:max-w-none truncate sm:whitespace-normal">ST. PAUL SECONDARY SCHOOL, NASUTI • P.O.BOX 678, NASUTI IGANGA • "God is My Guide"</p>
          </div>
        </div>
        
        {/* Mobile Hamburger menu toggler button */}
        <div className="flex sm:hidden">
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg shadow-sm transition-all"
            title="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        
        <div className="hidden sm:flex gap-2.5 self-stretch sm:self-auto flex-wrap">
          <button
            onClick={handleOpenAddForm}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg border border-indigo-500 shadow-sm transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Student
          </button>

          <button
            onClick={() => setShowBulkImporter(!showBulkImporter)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
          >
            <Upload className="w-4 h-4" /> Bulk Excel Paste
          </button>
          <button
            onClick={() => setShowBulkPhotoMatcher(true)}
            className="flex-1 sm:flex-initial flex items-center justify-semibold gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" /> Upload Excel File (.xlsx)
          </button>
          <button
            onClick={handleRemoveDuplicates}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-255 border border-rose-800 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
            title="Clean duplicate student records by name"
          >
            <Trash2 className="w-4 h-4 text-rose-455" /> Remove Duplicates
          </button>
          {isAdmin && (
            <button
              onClick={handleDeleteAllStudents}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-700/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/35 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
              title="Delete all student records from database and storage"
            >
              <Trash2 className="w-4 h-4 text-rose-500" /> Delete All Students
            </button>
          )}
          <button
            onClick={() => photosZipInputRef.current?.click()}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-955/60 hover:bg-indigo-900 text-indigo-250 border border-indigo-800 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
            title="Upload multiple passport photos in a ZIP folder (e.g. 123.jpg matches student 123)"
          >
            <Camera className="w-4 h-4 text-indigo-400" /> Match Photos ZIP
          </button>
          <input
            type="file"
            ref={photosZipInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotosZipUpload(file);
              e.target.value = ''; // Reset file input
            }}
            accept=".zip"
            className="hidden"
          />

            <div className="flex-1 sm:flex-initial flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg shadow-inner">
              <div className="w-6 h-6 bg-indigo-650 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase">
                A
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-[10px] font-black text-slate-200 truncate max-w-[120px]">
                  {authSession?.user?.name || 'Administrator'}
                </div>
                <div className="text-[8px] text-indigo-400 font-mono font-bold tracking-wider uppercase">ADMIN PORTAL</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-red-400 transition-colors cursor-pointer rounded-md hover:bg-slate-800"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
        </div>
      </header>

      {/* Mobile Actions Dropdown Menu */}
      {showMobileMenu && (
        <div className="sm:hidden no-print bg-slate-950 border-b border-slate-800 p-4 flex flex-col gap-2.5 animate-slide-down">
          <button
            onClick={() => { handleOpenAddForm(); setShowMobileMenu(false); }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg border border-indigo-500 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Add Student
          </button>

          <button
            onClick={() => { setShowBulkImporter(!showBulkImporter); setShowMobileMenu(false); }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all"
          >
            <Upload className="w-4 h-4" /> Bulk Excel Paste
          </button>
          <button
            onClick={() => { setShowBulkPhotoMatcher(true); setShowMobileMenu(false); }}
            className="w-full flex items-center justify-semibold gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" /> Upload Excel File (.xlsx)
          </button>
          <button
            onClick={() => { handleRemoveDuplicates(); setShowMobileMenu(false); }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-955/60 hover:bg-rose-900 text-rose-255 border border-rose-800 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all"
          >
            <Trash2 className="w-4 h-4 text-rose-455" /> Remove Duplicates
          </button>
          {isAdmin && (
            <button
              onClick={() => { handleDeleteAllStudents(); setShowMobileMenu(false); }}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-700/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/35 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all"
            >
              <Trash2 className="w-4 h-4 text-rose-500" /> Delete All Students
            </button>
          )}
          <button
            onClick={() => { photosZipInputRef.current?.click(); setShowMobileMenu(false); }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-955/60 hover:bg-indigo-900 text-indigo-250 border border-indigo-800 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all"
          >
            <Camera className="w-4 h-4 text-indigo-400" /> Match Photos ZIP
          </button>

          <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg shadow-inner mt-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-650 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase">
                A
              </div>
              <div className="text-left">
                <div className="text-[10px] font-black text-slate-200 truncate max-w-[150px]">
                  {authSession?.user?.name || 'Administrator'}
                </div>
                <div className="text-[8px] text-indigo-400 font-mono font-bold tracking-wider uppercase">ADMIN PORTAL</div>
              </div>
            </div>
            <button
              onClick={() => { handleLogout(); setShowMobileMenu(false); }}
              className="p-1.5 text-slate-400 hover:text-red-400 transition-colors cursor-pointer rounded-md hover:bg-slate-800 flex items-center gap-1.5 text-xs font-bold uppercase"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      )}

      {/* ADMIN TABS SWITCHER */}
      <div className="no-print bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 shrink-0 px-4 md:px-6 py-3 flex flex-col lg:flex-row justify-between items-center gap-4 animate-fade-in">
        <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800/70 w-full sm:w-auto shadow-lg shadow-black/20 overflow-x-auto gap-1">
          <button
            onClick={() => setAdminActiveTab('cards')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
              adminActiveTab === 'cards'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" /> Clearance Workspace
          </button>
          <button
            onClick={() => setAdminActiveTab('school')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
              adminActiveTab === 'school'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
            }`}
          >
            <BookOpen className="w-4 h-4" /> School & Staff Management (Uganda EMIS)
          </button>
          <button
            onClick={() => setAdminActiveTab('attendance')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
              adminActiveTab === 'attendance'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
            }`}
          >
            <Clock className="w-4 h-4" /> Gate Attendance Workspace
          </button>
          <button
            onClick={() => setAdminActiveTab('profile')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
              adminActiveTab === 'profile'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
            }`}
          >
            <Settings className="w-4 h-4" /> Profile & Settings
          </button>

          <button
            onClick={() => setAdminActiveTab('assistant')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
              adminActiveTab === 'assistant'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/50'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" /> St.Paul AI Assistant
          </button>
        </div>
        
        <button
          onClick={() => setAdminActiveTab('controls')}
          className={`px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
            adminActiveTab === 'controls'
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50 scale-[1.02]'
              : 'text-indigo-400 bg-indigo-950/30 border border-indigo-500/20 shadow-inner'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          <span>ST. PAUL ADMIN CONTROLS</span>
        </button>
      </div>

      {/* Mobile slide-down menu - appears when hamburger toggled */}

        {/* Webcam Warning Banner */}
      {cameraDiagnostic.status !== 'ok' && cameraDiagnostic.status !== 'testing' && (
        <div className="bg-amber-500/15 border-b border-amber-500/35 px-4 py-2 flex items-center justify-between gap-3 text-[11px] text-amber-300 font-mono no-print">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span><strong>WEBCAM DIAGNOSTIC:</strong> {cameraDiagnostic.message}</span>
          </div>
          <button 
            type="button"
            onClick={runCameraDiagnostic}
            className="underline hover:text-white uppercase font-bold shrink-0 cursor-pointer text-[10px]"
          >
            Retry Diagnostic
          </button>
        </div>
      )}

      {adminActiveTab === 'cards' && (
        <>
          {/* LEVEL WORKFLOW SELECTOR BAR */}
          <div className="no-print bg-slate-900 border-b border-slate-800 shrink-0 px-4 md:px-6 py-2.5 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
          <button
            onClick={() => setActiveLevel('master')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeLevel === 'master'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" /> Level 1: Master Database
          </button>
          <button
            onClick={() => setActiveLevel('selective')}
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeLevel === 'selective'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Printer className="w-4 h-4" /> Level 2: Selective Printing Suite
          </button>
          <button
            onClick={() => setActiveLevel('history')}
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeLevel === 'history'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" /> Level 3: History &amp; Audits
          </button>
          <button
            onClick={() => setActiveLevel('class-stream')}
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeLevel === 'class-stream'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" /> Level 4: Class Stream Clearance
          </button>
        </div>
        
        <div className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider bg-slate-955 px-3 py-1.5 rounded-lg border border-slate-800">
          {activeLevel === 'master' ? (
            <span className="text-indigo-400">● Database Administration Mode</span>
          ) : activeLevel === 'selective' ? (
            <span className="text-amber-400">● Bursar Interactive Print Session</span>
          ) : activeLevel === 'history' ? (
            <span className="text-emerald-400">● EMIS Audit and History Trails</span>
          ) : (
            <span className="text-violet-400">● Class &amp; Stream Clearance Workspace</span>
          )}
        </div>
      </div>

      {/* METRICS BENTO GRID */}
      <section className="no-print grid grid-cols-2 lg:grid-cols-7 gap-4 p-4 md:p-6 bg-slate-950 border-b border-slate-900 shrink-0 select-none">
        <div className="rounded-xl bg-slate-900 p-4 border border-slate-800/80 hover:border-slate-800 transition-all duration-150 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">
            <span>Roster Total</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black mt-2 text-slate-100">{stats.total}</div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">Term 2 2026 Students Registered</p>
        </div>

        <div className="rounded-xl bg-slate-900 p-4 border border-slate-800/80 hover:border-slate-800 transition-all duration-150 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">
            <span>Lower Secondary</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black mt-2 text-slate-100">{stats.lowerSecondaryTotal}</div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">S.1 – S.4 Students (U.C.E)</p>
        </div>

        <div className="rounded-xl bg-slate-900 p-4 border border-slate-800/80 hover:border-slate-800 transition-all duration-150 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">
            <span>Upper Secondary</span>
            <Users className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-black mt-2 text-slate-100">{stats.upperSecondaryTotal}</div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">S.5 – S.6 Students (U.A.C.E)</p>
        </div>

        <div className="rounded-xl bg-slate-900 p-4 border border-slate-800/80 hover:border-slate-800 transition-all duration-150 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">
            <span>Cleared Students</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black mt-2 text-slate-100 flex items-baseline gap-2">
            <span>{stats.clearedCount}</span>
            <span className="text-xs font-bold text-emerald-400">({stats.clearedPct}%)</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">Students Cleared &amp; Validated</p>
        </div>

        <div className="rounded-xl bg-slate-900 p-4 border border-slate-800/80 hover:border-slate-800 transition-all duration-150 shadow-sm">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">
            <span>Clearance Hold</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black mt-2 text-slate-100 flex items-baseline gap-2">
            <span>{stats.balanceCount}</span>
            <span className="text-xs font-bold text-amber-400">({stats.total > 0 ? 100 - stats.clearedPct : 0}%)</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">Students Awaiting Clearance</p>
        </div>

        <div 
          onClick={() => setFilterPhoto(prev => prev === 'WithPhoto' ? 'All' : 'WithPhoto')}
          className={`rounded-xl p-4 border transition-all duration-150 shadow-sm cursor-pointer ${
            filterPhoto === 'WithPhoto'
              ? 'bg-emerald-950/20 border-emerald-500/50 shadow-emerald-950/10 shadow-inner'
              : 'bg-slate-900 border-slate-800/80 hover:border-slate-800'
          }`}
          title="Click to toggle showing only students with photos"
        >
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">
            <span>Passport Photos</span>
            <Camera className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black mt-2 text-slate-100 flex items-baseline gap-2">
            <span>{stats.photoCount}</span>
            <span className="text-xs font-bold text-emerald-400">({stats.photoPct}%)</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">Click to toggle filter</p>
        </div>

        <div className="rounded-xl bg-slate-900 p-4 border border-indigo-500/30 bg-indigo-950/20 shadow-indigo-950/10 shadow-inner">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold uppercase tracking-wider font-mono">
            <span>Print Queue Selected</span>
            <Printer className="w-4 h-4 text-indigo-400 animate-pulse" />
          </div>
          <div className="text-2xl font-black mt-2 text-indigo-300">{stats.selectCount}</div>
          <p className="text-[10px] text-indigo-400 mt-1 font-mono">Total Badges Queued</p>
        </div>
      </section>

      {/* SOLE INTEGRATED DASHBOARD WORKSPACE */}
      {activeLevel === 'class-stream' ? (
        <main className="no-print flex-1 overflow-y-auto p-4 md:p-6 bg-slate-900">
          <Suspense fallback={<Loading message="Loading Clearance Workspace..." />}>
            <ClearanceModule />
          </Suspense>
        </main>
      ) : (
        <main className="no-print flex-1 flex flex-col lg:flex-row overflow-hidden md:h-0">
          
          {/* COLLAPSIBLE DIVISION SIDEBAR MENU */}
          <aside className="w-64 bg-slate-950 border-r border-slate-850 p-4 flex flex-col gap-4 overflow-y-auto no-print shrink-0">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Education Levels</span>
              
              <button
                onClick={() => {
                  setFilterLevel('All');
                  setFilterClass('All');
                  setFilterStream('All');
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-black transition flex items-center justify-between border ${
                  filterLevel === 'All' && filterClass === 'All'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-900/50 border-slate-800 text-slate-350 hover:text-slate-100 hover:bg-slate-900'
                }`}
              >
                <span>🏫 All Students</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* 1. LOWER SECONDARY SECTION */}
              <div className="space-y-1">
                <div className="flex items-center justify-between bg-slate-900/30 border border-slate-850/50 rounded-lg pr-1">
                  <button
                    onClick={() => {
                      setFilterLevel('Lower');
                      setFilterClass('All');
                      setFilterStream('All');
                    }}
                    className={`flex-1 text-left px-3 py-2 rounded-l-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      filterLevel === 'Lower' && filterClass === 'All'
                        ? 'text-indigo-400 font-extrabold'
                        : 'text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    <span className="text-sm select-none">📁</span>
                    <span className="truncate">Lower Secondary (U.C.E)</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLowerExpanded(!lowerExpanded);
                    }}
                    className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                  >
                    <span className="text-[9px] font-bold block transition-transform duration-200" style={{ transform: lowerExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                      ▶
                    </span>
                  </button>
                </div>

                {lowerExpanded && (
                  <div className="pl-4 space-y-1.5 mt-1 border-l border-slate-850 ml-5">
                    {['S.1', 'S.2', 'S.3', 'S.4'].map((clsName) => {
                      const isClsActive = filterClass === clsName;
                      const isClsExpanded = expandedClasses[clsName];
                      const streams = classesWithStreams[clsName] || [];

                      return (
                        <div key={clsName} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => {
                                setFilterLevel('All');
                                setFilterClass(clsName);
                                setFilterStream('All');
                              }}
                              className={`flex-1 text-left px-2 py-1 rounded transition text-xs flex items-center gap-1.5 ${
                                isClsActive && filterStream === 'All'
                                  ? 'bg-indigo-600/20 text-indigo-400 font-bold border border-indigo-500/10'
                                  : 'hover:bg-slate-900/40 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span>├──</span>
                              <span>{clsName}</span>
                            </button>
                            {streams.length > 0 && (
                              <button
                                onClick={() => {
                                  setExpandedClasses((prev) => ({
                                    ...prev,
                                    [clsName]: !prev[clsName],
                                  }));
                                }}
                                className="px-1 text-slate-650 hover:text-slate-400 text-[10px] cursor-pointer"
                              >
                                {isClsExpanded ? '▼' : '►'}
                              </button>
                            )}
                          </div>

                          {isClsExpanded && streams.length > 0 && (
                            <div className="pl-6 space-y-1 border-l border-slate-850/60 ml-2">
                              {streams.map((stream) => {
                                const isStreamActive = isClsActive && filterStream === stream;
                                return (
                                  <button
                                    key={stream}
                                    onClick={() => {
                                      setFilterLevel('All');
                                      setFilterClass(clsName);
                                      setFilterStream(stream);
                                    }}
                                    className={`w-full text-left px-2 py-0.5 rounded text-[10px] flex items-center gap-1.5 transition ${
                                      isStreamActive
                                        ? 'text-indigo-400 font-extrabold bg-indigo-950/20'
                                        : 'text-slate-500 hover:text-slate-350'
                                    }`}
                                  >
                                    <span>↳</span>
                                    <span>{stream}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {isClsActive && (
                            <div className="pl-6 py-1.5 pr-2 space-y-1 my-1 border-l border-indigo-500/20 ml-2">
                              <span className="text-[9px] font-black uppercase text-indigo-400 font-mono tracking-wider block">Boarding Filter</span>
                              <select
                                value={filterBoarding}
                                onChange={(e) => setFilterBoarding(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 font-bold outline-none cursor-pointer uppercase font-mono"
                              >
                                <option value="All">All Students</option>
                                <option value="Hosteller">Hostellers</option>
                                <option value="Day Scholar">Day Scholars</option>
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. UPPER SECONDARY SECTION */}
              <div className="space-y-1">
                <div className="flex items-center justify-between bg-slate-900/30 border border-slate-850/50 rounded-lg pr-1">
                  <button
                    onClick={() => {
                      setFilterLevel('Upper');
                      setFilterClass('All');
                      setFilterStream('All');
                    }}
                    className={`flex-1 text-left px-3 py-2 rounded-l-lg text-xs font-bold transition flex items-center gap-1.5 ${
                      filterLevel === 'Upper' && filterClass === 'All'
                        ? 'text-indigo-400 font-extrabold'
                        : 'text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    <span className="text-sm select-none">📁</span>
                    <span className="truncate">Upper Secondary (A'Level)</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setUpperExpanded(!upperExpanded);
                    }}
                    className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                  >
                    <span className="text-[9px] font-bold block transition-transform duration-200" style={{ transform: upperExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                      ▶
                    </span>
                  </button>
                </div>

                {upperExpanded && (
                  <div className="pl-4 space-y-1.5 mt-1 border-l border-slate-850 ml-5">
                    {['S.5', 'S.6'].map((clsName) => {
                      const isClsActive = filterClass === clsName;
                      const isClsExpanded = expandedClasses[clsName];
                      const streams = classesWithStreams[clsName] || [];

                      return (
                        <div key={clsName} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => {
                                setFilterLevel('All');
                                setFilterClass(clsName);
                                setFilterStream('All');
                              }}
                              className={`flex-1 text-left px-2 py-1 rounded transition text-xs flex items-center gap-1.5 ${
                                isClsActive && filterStream === 'All'
                                  ? 'bg-indigo-600/20 text-indigo-400 font-bold border border-indigo-500/10'
                                  : 'hover:bg-slate-900/40 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span>├──</span>
                              <span>{clsName}</span>
                            </button>
                            {streams.length > 0 && (
                              <button
                                onClick={() => {
                                  setExpandedClasses((prev) => ({
                                    ...prev,
                                    [clsName]: !prev[clsName],
                                  }));
                                }}
                                className="px-1 text-slate-650 hover:text-slate-400 text-[10px] cursor-pointer"
                              >
                                {isClsExpanded ? '▼' : '►'}
                              </button>
                            )}
                          </div>

                          {isClsExpanded && streams.length > 0 && (
                            <div className="pl-6 space-y-1 border-l border-slate-850/60 ml-2">
                              {streams.map((stream) => {
                                const isStreamActive = isClsActive && filterStream === stream;
                                return (
                                  <button
                                    key={stream}
                                    onClick={() => {
                                      setFilterLevel('All');
                                      setFilterClass(clsName);
                                      setFilterStream(stream);
                                    }}
                                    className={`w-full text-left px-2 py-0.5 rounded text-[10px] flex items-center gap-1.5 transition ${
                                      isStreamActive
                                        ? 'text-indigo-400 font-extrabold bg-indigo-950/20'
                                        : 'text-slate-500 hover:text-slate-355'
                                    }`}
                                  >
                                    <span>↳</span>
                                    <span>{stream}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {isClsActive && (
                            <div className="pl-6 py-1.5 pr-2 space-y-1 my-1 border-l border-indigo-500/20 ml-2">
                              <span className="text-[9px] font-black uppercase text-indigo-400 font-mono tracking-wider block">Boarding Filter</span>
                              <select
                                value={filterBoarding}
                                onChange={(e) => setFilterBoarding(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 font-bold outline-none cursor-pointer uppercase font-mono"
                              >
                                <option value="All">All Students</option>
                                <option value="Hosteller">Hostellers</option>
                                <option value="Day Scholar">Day Scholars</option>
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        
        {/* LEFT WORKSPACE PANEL: STUDENT TABLE & MANAGEMENT */}
        <section className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 border-r border-slate-800 gap-4">
          
          {activeLevel === 'master' ? (
            <>
              {/* BULK EXCEL PASTE CONTAINER (COLLAPSIBLE) */}
          {showBulkImporter && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">Roster Copy-Paste Importer</h3>
                <span className="text-[10px] text-indigo-400 font-mono">Comma (*,*), Tab, or Pipe (*|*) delimiter</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Paste names and grade forms directly from Excel. <span className="text-slate-200 font-semibold font-mono">One student per line</span>. Format optionally: <span className="text-indigo-400 font-mono">Name, Class/Grade, AdminID, Dorm/Day</span>.
              </p>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="Examples:&#10;Kofi Mensah, S.1 A, ADM-101, Boarder&#10;Winfred Banda, S.5 Sciences, ADM-102, Day Scholar"
                className="w-full h-28 bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600"
              />
              {bulkImportError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/20 p-2.5 rounded-lg border border-rose-900/40">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bulkImportError}</span>
                </div>
              )}
              <div className="flex gap-2 self-end">
                <button
                  onClick={() => setShowBulkImporter(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded-md text-xs font-bold uppercase tracking-wider border border-slate-700 hover:bg-slate-700 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkImport}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-bold uppercase tracking-wider border border-indigo-500 hover:bg-indigo-500 transition-colors shadow-sm cursor-pointer"
                >
                  Parse and Save
                </button>
              </div>
            </div>
          )}

          {/* BULK ACTIONS / QUEUING AND QUICK-SELECT WIDGETS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* bursars requested "print a certain number of students" */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> Bursar's Print Queuer
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                  Queue a sequence of students instantly, then choose an option to download or print high fidelity badges.
                </p>
              </div>

              {queueSuccessMessage && (
                <div className="text-[10px] leading-snug bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 p-2 rounded-lg flex items-center gap-1.5 font-semibold animate-pulse">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{queueSuccessMessage}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1 flex bg-slate-900 border border-slate-800 rounded-lg items-center px-2.5 py-1.5">
                  <label className="text-[10px] text-slate-500 font-bold uppercase mr-2 font-mono">Count:</label>
                  <input
                    type="number"
                    min={1}
                    max={filteredStudents.length}
                    value={queueCountInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSelectFirstN(queueCountInput);
                      }
                    }}
                    onChange={(e) => setQueueCountInput(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-transparent text-slate-100 placeholder:text-slate-700 text-xs font-black border-none focus:outline-none focus:ring-0 pr-1 select-all"
                  />
                </div>
                <button
                  onClick={() => handleSelectFirstN(queueCountInput)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 font-bold text-xs uppercase tracking-wider rounded-lg transition-all duration-150 shrink-0 shadow-sm cursor-pointer"
                  title="Select N students in table to queue them for printing"
                >
                  Queue Selected
                </button>
              </div>

              {/* Select All by Stream Selector */}
              <div className="border-t border-slate-900/60 pt-2.5 mt-1 space-y-2">
                <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase font-mono font-bold tracking-wider">
                  <span>Select / Queue All by Stream:</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex bg-slate-900 border border-slate-800 rounded-lg items-center px-2 py-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-1.5" />
                    <select
                      value={selectedStreamForQueue}
                      onChange={(e) => setSelectedStreamForQueue(e.target.value)}
                      className="bg-transparent text-slate-300 text-[10px] w-full font-bold border-none focus:outline-none focus:ring-0 uppercase tracking-widest cursor-pointer"
                    >
                      {dynamicStreamOptions.map((stream) => (
                        <option className="bg-slate-950 text-slate-200" key={stream} value={stream}>
                          STREAM {stream.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      const streamStudents = Array.isArray(students) ? students.filter(s => {
                        const parts = (s.gradeClass || '').trim().split(/\s+/);
                        const stream = parts.slice(1).join(' ') || 'A';
                        return stream.trim().toLowerCase() === selectedStreamForQueue.trim().toLowerCase();
                      }) : [];
                      const streamIds = Array.isArray(streamStudents) ? streamStudents.map(s => s.id) : [];
                      if (streamIds.length > 0) {
                        setSelectedIds(prev => {
                          const otherIds = prev.filter(id => !streamIds.includes(id));
                          return [...otherIds, ...streamIds];
                        });
                        setQueueSuccessMessage(`Queued all ${streamStudents.length} students in Stream ${selectedStreamForQueue.toUpperCase()}!`);
                        setTimeout(() => setQueueSuccessMessage(null), 4000);
                      } else {
                        setQueueSuccessMessage(`No students found for Stream ${selectedStreamForQueue.toUpperCase()}`);
                        setTimeout(() => setQueueSuccessMessage(null), 4000);
                      }
                    }}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 font-bold text-xs uppercase tracking-wider rounded-lg transition-all duration-150 shrink-0 shadow-sm cursor-pointer"
                    title="Queue all students of this stream"
                  >
                    Select Stream
                  </button>
                </div>
              </div>

              {selectedIds.length > 0 ? (
                <div className="border-t border-slate-900 pt-2.5 mt-1 space-y-2">
                  <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase font-mono font-bold tracking-wider">
                    <span>Selection Actions:</span>
                    <span className="text-indigo-400 font-extrabold">{selectedIds.length} Student{selectedIds.length > 1 ? 's' : ''} Selected</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleDeleteSelected}
                      className="flex items-center justify-center gap-1.5 p-2.5 bg-rose-955/40 hover:bg-rose-900/35 text-rose-350 hover:text-rose-200 font-extrabold text-[9.5px] uppercase tracking-wider rounded-lg border border-rose-900/40 transition-all duration-150 shadow-sm cursor-pointer"
                      title="Delete Selected Students"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-455" />
                      <span>Delete Selected</span>
                    </button>
                    <button
                      onClick={handleTriggerWebPrint}
                      className="flex items-center justify-center gap-1.5 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-[9.5px] uppercase tracking-wider rounded-lg border border-slate-700 transition-all duration-150 shadow-sm cursor-pointer"
                      title="Print Selected Badges"
                    >
                      <Printer className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Print Selected</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const targets = activeLevel === 'master' 
                          ? students.filter((s) => selectedIds.includes(s.id))
                          : students.filter((s) => selectiveSelectedIds.includes(s.id));
                        handleTriggerPdfExport(targets);
                      }}
                      className="flex flex-col items-center justify-center gap-1 py-2 bg-indigo-650 hover:bg-indigo-550 text-white font-extrabold text-[9px] uppercase tracking-wider rounded-lg border border-indigo-500 transition-all duration-150 shadow-sm cursor-pointer"
                      title="Download PDF Student Cards"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsvDirect}
                      className="flex flex-col items-center justify-center gap-1 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-[9px] uppercase tracking-wider rounded-lg border border-emerald-650 transition-all duration-150 shadow-sm cursor-pointer"
                      title="Export Selected to CSV"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportExcelDirect}
                      className="flex flex-col items-center justify-center gap-1 py-2 bg-teal-700 hover:bg-teal-600 text-white font-extrabold text-[9px] uppercase tracking-wider rounded-lg border border-teal-650 transition-all duration-150 shadow-sm cursor-pointer"
                      title="Export Selected to Excel"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Export Excel</span>
                    </button>
                  </div>
                  {/* Export Success/Error Banner in Sidebar */}
                  {exportSuccessMessage && (
                    <div className="text-[10px] leading-snug bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 p-2.5 rounded-lg flex flex-col gap-1.5 font-semibold">
                      <div className="flex items-center gap-1.5 animate-pulse">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{exportSuccessMessage}</span>
                      </div>
                      {exportedStudentsCount !== null && (
                        <div className="flex gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={handleDownloadCsvOnly}
                            className="flex-1 flex items-center justify-center gap-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9px] uppercase tracking-wider rounded-md transition-all cursor-pointer"
                          >
                            <Download className="w-3 h-3" /> Download CSV
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadExcelOnly}
                            className="flex-1 flex items-center justify-center gap-1 py-1 bg-emerald-650 hover:bg-emerald-555 text-white font-bold text-[9px] uppercase tracking-wider rounded-md transition-all cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3 h-3" /> Download Excel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {exportErrorMessage && (
                    <div className="text-[10px] bg-rose-955/70 border border-rose-900/40 text-rose-350 p-2.5 rounded-lg flex items-center gap-1.5 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-455 shrink-0" />
                      <span>{exportErrorMessage}</span>
                    </div>
                  )}
                  {isExporting && (
                    <div className="text-[10px] bg-indigo-950/40 border border-indigo-900/30 text-indigo-300 p-2.5 rounded-lg flex items-center gap-2 font-mono font-bold animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                      <span>EXPORTING SELECTED TO FILES...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[9.5px] text-slate-500 italic flex items-center gap-1">
                  <Info className="w-3 h-3 text-slate-600 shrink-0" />
                  <span>Enter student count, click 'Queue Selected', or select students to enable actions!</span>
                </div>
              )}
            </div>

            {/* BATCH STATUS MODIFIER CODES */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Bulk Status Action
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                  Clear checked students, place them on hold, or reset their print status to reprint.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleBulkUpdate(true)}
                  disabled={selectedIds.length === 0}
                  className="w-full bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/50 py-2 text-[9px] font-black tracking-wider text-emerald-300 uppercase rounded-lg transition-all disabled:opacity-30 cursor-pointer text-center"
                >
                  ✔ Clear
                </button>
                <button
                  onClick={() => handleBulkUpdate(false)}
                  disabled={selectedIds.length === 0}
                  className="w-full bg-rose-950 hover:bg-rose-900 border border-rose-800/50 py-2 text-[9px] font-black tracking-wider text-rose-300 uppercase rounded-lg transition-all disabled:opacity-30 cursor-pointer text-center"
                >
                  ✖ Hold
                </button>
                <button
                  onClick={handleReprintSelected}
                  disabled={selectedIds.length === 0}
                  className="w-full bg-indigo-955 hover:bg-indigo-900 border border-indigo-800/50 py-2 text-[9px] font-black tracking-wider text-indigo-300 uppercase rounded-lg transition-all disabled:opacity-30 cursor-pointer text-center"
                  title="Reset status of selected students to Not Printed"
                >
                  ⟳ Reprint
                </button>
              </div>
            </div>

          </div>

          {/* ACTIVE REGISTRY CONTROL: ADVANCED FILTERS */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <div className="flex bg-slate-900 border border-slate-850 rounded-lg items-center px-3 py-1.5">
                  <Search className="w-4 h-4 text-slate-500 shrink-0 mr-2" />
                  <input
                    type="text"
                    value={searchInputValue}
                    onChange={(e) => setSearchInputValue(e.target.value)}
                    placeholder="Search students by Name, ADM ID, or Form Class..."
                    className="w-full bg-transparent text-slate-100 placeholder:text-slate-600 text-xs border-none focus:outline-none focus:ring-0"
                  />
                </div>
                {searchInputValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInputValue('');
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Class Filter */}
              <div className="flex bg-slate-900 border border-slate-850 rounded-lg items-center px-2 py-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-1.5" />
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="bg-transparent text-slate-300 text-[10px] font-bold border-none focus:outline-none focus:ring-0 uppercase tracking-widest cursor-pointer"
                >
                  <option value="All">FORM / CLASS: ALL</option>
                  {uniqueClasses.filter(c => c !== 'All').map((c) => (
                    <option key={c} value={c}>{c.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Micro Filter Chips row */}
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Filters:</span>
              
              <select
                value={filterClearance}
                onChange={(e) => setFilterClearance(e.target.value)}
                className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 font-medium rounded-md focus:outline-none uppercase cursor-pointer"
              >
                <option value="All">CLEARANCE: ALL</option>
                <option value="Cleared">CLEARED ONLY</option>
                <option value="Hold">ON HOLD</option>
              </select>

              <select
                value={filterStream}
                onChange={(e) => setFilterStream(e.target.value)}
                className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 font-medium rounded-md focus:outline-none uppercase cursor-pointer"
              >
                <option value="All">STREAM: ALL</option>
                {uniqueStreams.filter(s => s !== 'All').map((s) => (
                  <option key={s} value={s}>{s.toUpperCase()}</option>
                ))}
              </select>

              <select
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
                className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 font-medium rounded-md focus:outline-none uppercase cursor-pointer"
              >
                <option value="All">GENDER: ALL</option>
                <option value="Male">MALE</option>
                <option value="Female">FEMALE</option>
              </select>

              <select
                value={filterBoarding}
                onChange={(e) => setFilterBoarding(e.target.value)}
                className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 font-medium rounded-md focus:outline-none uppercase cursor-pointer"
              >
                <option value="All">Boarding Status: All Students</option>
                <option value="Hosteller">Hostellers</option>
                <option value="Day Scholar">Day Scholars</option>
              </select>

              <select
                value={filterAcademicYear}
                onChange={(e) => setFilterAcademicYear(e.target.value)}
                className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 font-medium rounded-md focus:outline-none uppercase cursor-pointer"
              >
                <option value="All">YEAR: ALL</option>
                {uniqueYears.filter(y => y !== 'All').map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                value={filterPhoto}
                onChange={(e) => setFilterPhoto(e.target.value)}
                className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 font-medium rounded-md focus:outline-none uppercase cursor-pointer"
              >
                <option value="All">PHOTO: ALL</option>
                <option value="WithPhoto">WITH PHOTO ONLY</option>
                <option value="NoPhoto">WITHOUT PHOTO</option>
              </select>

              <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 border border-slate-850 rounded-md text-[10px] text-slate-400 font-medium cursor-pointer select-none hover:bg-slate-800/80 transition-all">
                <input
                  type="checkbox"
                  checked={printNewOnly}
                  onChange={(e) => setPrintNewOnly(e.target.checked)}
                  className="accent-indigo-500 rounded border-slate-700 bg-slate-800 text-indigo-500 cursor-pointer w-3.5 h-3.5"
                />
                <span className="font-bold uppercase tracking-wider font-mono">Print New Students Only</span>
              </label>

              <button
                onClick={handleResetFilters}
                className="text-[10px] text-indigo-400 font-bold hover:text-indigo-300 ml-auto px-2 py-1 rounded hover:bg-slate-900 uppercase font-mono tracking-wider cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* TABLE CONTAINER */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-md flex-1 min-h-[300px] flex flex-col justify-between">
            {/* CONTAINER HEADER SWITCHER */}
            <div className="bg-slate-900/40 p-3 border-b border-slate-850 flex items-center justify-between flex-wrap gap-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-550 animate-pulse" />
                <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">
                  Active Student Registry Database
                </h3>
              </div>
              
              <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex gap-1 text-[9px] font-bold font-mono tracking-wider leading-none select-none uppercase">
                <button
                  onClick={() => setViewMode('board')}
                  className={`px-2.5 py-1.5 rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${
                    viewMode === 'board' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Grouped Board
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 py-1.5 rounded-md cursor-pointer transition-all flex items-center gap-1.5 ${
                    viewMode === 'list' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5" /> Registry List
                </button>
              </div>
            </div>

            {/* Selection Action Banner */}
            {selectedIds.length > 0 && (
              <div className="bg-indigo-950/20 border-b border-indigo-900/30 px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in no-print">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  <span className="text-xs font-mono uppercase font-black text-indigo-300 tracking-wider">
                    {selectedIds.length} Student{selectedIds.length > 1 ? 's' : ''} Selected
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-955/50 hover:bg-rose-900/40 border border-rose-900/40 text-rose-350 hover:text-rose-200 font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all duration-150 shadow-sm cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-455" /> Delete Selected
                  </button>
                  <button
                    onClick={handleTriggerWebPrint}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all duration-150 shadow-sm cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-indigo-400" /> Print Selected
                  </button>
                  <button
                    onClick={() => {
                      const targets = activeLevel === 'master' 
                        ? students.filter((s) => selectedIds.includes(s.id))
                        : students.filter((s) => selectiveSelectedIds.includes(s.id));
                      handleTriggerPdfExport(targets);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-550 border border-indigo-500 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all duration-150 shadow-sm cursor-pointer"
                    title="Download PDF student cards"
                  >
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </button>
                  <button
                    onClick={handleExportCsvDirect}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-650 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all duration-150 shadow-sm cursor-pointer"
                    title="Export selected students to CSV"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
                  </button>
                  <button
                    onClick={handleExportExcelDirect}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-600 border border-teal-650 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all duration-150 shadow-sm cursor-pointer"
                    title="Export selected students to Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
                  </button>

                  {isExporting && (
                    <span className="text-[10px] font-mono text-indigo-400 animate-pulse font-bold uppercase">
                      Exporting...
                    </span>
                  )}

                  {exportedStudentsCount !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase animate-pulse">
                        ✓ {exportedStudentsCount} Exported!
                      </span>
                      <button
                        type="button"
                        onClick={handleDownloadCsvOnly}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                      >
                        <Download className="w-3 h-3" /> Download CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadExcelOnly}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-650 hover:bg-emerald-555 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3 h-3" /> Download Excel
                      </button>
                    </div>
                  )}
                  
                  <span className="text-slate-700 mx-1">|</span>
                  
                  <button
                    onClick={() => setSelectedIds([])}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all duration-150 cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            {/* GROUPED BOARD VIEW (Board Mode) */}
            {viewMode === 'board' ? (
              <div className="flex-1 flex flex-col min-h-[400px] bg-slate-950/40 select-none">
                {/* CLASS SELECTOR TABS FOR BOARD VIEW */}
                <div className="bg-slate-900 border-b border-slate-850 p-2.5 flex items-center justify-between overflow-x-auto select-none gap-3">
                  <div className="flex items-center gap-2 pl-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-[10px] font-black font-mono uppercase text-slate-400 tracking-widest shrink-0">
                      Active Class View:
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'].map((className) => {
                      const isActive = activeBoardClass === className;
                      
                      let badgeColor = '';
                      if (className === 'S.1') badgeColor = isActive ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 ring-2 ring-emerald-500/10 font-extrabold shadow-sm' : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:border-emerald-500/30 hover:text-emerald-400';
                      if (className === 'S.2') badgeColor = isActive ? 'bg-sky-500/15 border-sky-500/50 text-sky-400 ring-2 ring-sky-500/10 font-extrabold shadow-sm' : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:border-sky-500/30 hover:text-sky-400';
                      if (className === 'S.3') badgeColor = isActive ? 'bg-blue-500/15 border-blue-500/50 text-blue-400 ring-2 ring-blue-500/10 font-extrabold shadow-sm' : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:border-blue-500/30 hover:text-blue-400';
                      if (className === 'S.4') badgeColor = isActive ? 'bg-amber-500/15 border-amber-500/50 text-amber-400 ring-2 ring-amber-500/10 font-extrabold shadow-sm' : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:border-amber-500/30 hover:text-amber-400';
                      if (className === 'S.5' || className === 'S.6') badgeColor = isActive ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-400 ring-2 ring-indigo-500/10 font-extrabold shadow-sm' : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:border-indigo-500/30 hover:text-indigo-400';

                      return (
                        <button
                          key={className}
                          onClick={() => setActiveBoardClass(className)}
                          className={`px-3 py-1 text-xs font-bold tracking-wider uppercase font-mono border rounded-lg transition-all cursor-pointer ${badgeColor}`}
                        >
                          {className}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const { streams, studentsByStream, maxRows, boardStudentsLength } = boardViewData;

                  const parseClassAndStream = (gradeClassStr: string) => {
                    const parts = (gradeClassStr || '').trim().split(/\s+/);
                    const className = parts[0] || 'Unknown';
                    const streamName = parts.slice(1).join(' ') || 'A';
                    return { className, streamName };
                  };

                  if (boardStudentsLength === 0) {
                    return (
                      <div className="w-full flex-1 flex flex-col items-center justify-center p-12 text-slate-500 font-medium">
                        <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
                        <span>No records found in Class {activeBoardClass} matching active search criteria.</span>
                      </div>
                    );
                  }

                  return (
                    <div className="flex-1 overflow-auto max-h-[500px] scrollbar-thin scrollbar-thumb-slate-800">
                      <table className="w-full min-w-[1000px] text-left border-collapse select-none border border-slate-850 bg-slate-950/30 table-fixed">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/60 font-mono text-[9px] font-black tracking-widest uppercase">
                            {/* Top-Left Blank Google Sheets cell with Select All */}
                            <th className="py-2.5 px-3 w-12 border-r border-slate-850 text-slate-550 text-center bg-slate-900/80 align-middle">
                              <div className="flex flex-col items-center gap-1 justify-center">
                                <input
                                  type="checkbox"
                                  checked={!!boardViewData.boardStudentIds && boardViewData.boardStudentIds.length > 0 && boardViewData.boardStudentIds.every((id: string) => selectedIds.includes(id))}
                                  onChange={(e) => {
                                    const boardIds = boardViewData.boardStudentIds || [];
                                    if (e.target.checked) {
                                      setSelectedIds(prev => Array.from(new Set([...prev, ...boardIds])));
                                    } else {
                                      setSelectedIds(prev => prev.filter(id => !boardIds.includes(id)));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                  title="Select/Deselect all in board view"
                                />
                                <span className="text-[7.5px] font-black text-slate-500 font-mono tracking-tighter leading-none">ALL</span>
                              </div>
                            </th>
                            {streams.map((stream) => {
                              const streamStudents = studentsByStream[stream] || [];
                              const activeStreamIds = Array.isArray(streamStudents) ? streamStudents.map(s => s.id) : [];
                              const allSelected = activeStreamIds.length > 0 && activeStreamIds.every(id => selectedIds.includes(id));
                              return (
                                <th 
                                  key={stream} 
                                  className="py-2 px-3 border-r border-slate-850 text-slate-350 font-bold font-mono tracking-widest text-[11px] relative bg-slate-900/80 align-middle"
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex items-center shrink-0">
                                      <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedIds(prev => {
                                              const distinct = new Set([...prev, ...activeStreamIds]);
                                              return Array.from(distinct);
                                            });
                                          } else {
                                            setSelectedIds(prev => prev.filter(id => !activeStreamIds.includes(id)));
                                          }
                                        }}
                                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                        title="Select/Deselect all in this stream column"
                                      />
                                    </div>
                                    <span className="flex-1 text-center truncate">
                                      {stream.toUpperCase() === 'ARTS' || stream.toUpperCase() === 'SCIENCES' 
                                        ? `${stream.toUpperCase()} STREAM` 
                                        : `STREAM ${stream.toUpperCase()}`}
                                    </span>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
                          {Array.from({ length: maxRows }).map((_, rowIndex) => (
                            <tr key={rowIndex} className="border-b border-slate-855 hover:bg-slate-900/10">
                              {/* Left Side Google Sheets row numbering */}
                              <td className="py-2 text-center text-[10px] font-black font-mono text-slate-500 bg-slate-900/40 select-none border-r border-slate-850">
                                {rowIndex + 1}
                              </td>

                              {streams.map((stream) => {
                                const list = studentsByStream[stream] || [];
                                const s = list[rowIndex];

                                if (s) {
                                  const isChecked = selectedIds.includes(s.id);
                                  const isFocused = previewStudentId === s.id;
                                  const numIndex = rowIndex + 1;

                                  return (
                                    <td 
                                      key={stream + '-' + s.id}
                                      onClick={() => setPreviewStudentId(s.id)}
                                      className={`p-2 border-r border-slate-850 relative cursor-pointer select-none transition-all duration-100 ${
                                        isFocused 
                                          ? 'bg-indigo-950/40 shadow-inner' 
                                          : 'hover:bg-slate-900/50'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        {/* Action Stack */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => {
                                              setSelectedIds((prev) =>
                                                prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                                              );
                                            }}
                                            className="w-3.5 h-3.5 rounded border-slate-750 bg-slate-850 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                          />
                                          <span 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleRowStatus(s.id);
                                            }}
                                            className={`w-2 h-2 rounded-full cursor-pointer shrink-0 border border-slate-900 ${
                                              s.isCleared ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                                            }`}
                                            title="Click to toggle status"
                                          />
                                          {/* Mini Number Badge */}
                                          <span className="text-[9px] font-black font-mono text-slate-500 bg-slate-900 border border-slate-800 w-4.5 h-4.5 flex items-center justify-center rounded">
                                            {numIndex}
                                          </span>
                                        </div>

                                        {/* Student Details with Photo */}
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <div className="w-[30px] h-[40px] bg-slate-900 rounded border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center shadow-3xs">
                                            {getStudentPhotoUrl(s) ? (
                                              <img 
                                                src={getStudentPhotoUrl(s)} 
                                                alt={s.name} 
                                                loading="lazy"
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                              />
                                            ) : (
                                              <svg className="w-5 h-5 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                              </svg>
                                            )}
                                          </div>
                                          <div className="min-w-0">
                                            <h4 className={`text-[10px] font-extrabold leading-tight truncate ${isFocused ? 'text-indigo-300' : 'text-slate-100'}`}>
                                              {s.name}
                                            </h4>
                                            <span className="text-[8px] font-mono text-slate-500 block leading-none select-all mt-0.5">
                                              {s.adminNo}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Status Tag & actions hover overlay */}
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span className={`text-[7.5px] font-black font-mono px-1 py-0.5 rounded leading-none ${
                                            s.isCleared ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/40' : 'bg-rose-950/60 text-rose-400 border border-rose-900/40'
                                          }`}>
                                            {s.isCleared ? 'OK' : 'HOLD'}
                                          </span>
                                          <span className={`text-[7.5px] font-black font-mono px-1 py-0.5 rounded leading-none ${
                                            s.printStatus === 'Printed'
                                              ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-900/40'
                                              : 'bg-amber-955/65 text-amber-450 border border-amber-900/40'
                                          }`} title={`Print Status: ${s.printStatus || 'Not Printed'}`}>
                                            {s.printStatus === 'Printed' ? 'PRN' : 'NEW'}
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenEditForm(s);
                                            }}
                                            className="text-slate-500 hover:text-emerald-400 p-0.5 transition-colors cursor-pointer"
                                            title="Edit student"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteStudent(s.id);
                                            }}
                                            className="text-slate-500 hover:text-rose-455 p-0.5 transition-colors cursor-pointer"
                                            title="Remove student"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  );
                                } else {
                                  return (
                                    <td 
                                      key={`empty-${stream}-${rowIndex}`}
                                      className="p-2 border-r border-slate-850 bg-slate-950/10 text-center"
                                    >
                                      <span className="text-[10px] text-slate-750 font-mono select-none">-</span>
                                    </td>
                                  );
                                }
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left border-collapse select-none">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={Array.isArray(filteredStudents) && filteredStudents.length > 0 && filteredStudents.every(s => selectedIds.includes(s.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => {
                              const distinct = new Set([...prev, ...(Array.isArray(filteredStudents) ? filteredStudents.map((s) => s.id) : [])]);
                              return Array.from(distinct);
                            });
                          } else {
                            const filteredIds = Array.isArray(filteredStudents) ? filteredStudents.map((s) => s.id) : [];
                            setSelectedIds(prev => prev.filter((id) => !filteredIds.includes(id)));
                          }
                        }}
                        className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        title="Select/Deselect all filtered students"
                      />
                    </th>
                    <th className="py-3 px-3">Student Details</th>
                    <th className="py-3 px-3">Admin No</th>
                    <th className="py-3 px-3">Class &amp; Stream</th>
                    <th className="py-3 px-3">Class Teacher</th>
                    <th className="py-3 px-3 text-center">Print Status</th>
                    <th className="py-3 px-3 text-center">Clearance Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-xs">
                  {isTableLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`skeleton-${i}`} className="animate-pulse">
                        <td className="py-4 px-3 text-center"><div className="w-4 h-4 bg-slate-800 rounded mx-auto" /></td>
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 bg-slate-800 rounded-full" />
                            <div className="w-8 h-10 bg-slate-800 rounded" />
                            <div className="space-y-1.5 flex-1">
                              <div className="h-3 bg-slate-800 rounded w-28" />
                              <div className="h-2 bg-slate-800 rounded w-16" />
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-3"><div className="h-3 bg-slate-800 rounded w-20" /></td>
                        <td className="py-4 px-3"><div className="h-3 bg-slate-800 rounded w-16" /></td>
                        <td className="py-4 px-3"><div className="h-3 bg-slate-800 rounded w-20" /></td>
                        <td className="py-4 px-3 text-center"><div className="h-4 bg-slate-800 rounded w-12 mx-auto" /></td>
                        <td className="py-4 px-3 text-center"><div className="h-4 bg-slate-800 rounded w-14 mx-auto" /></td>
                        <td className="py-4 px-3 text-right"><div className="h-6 bg-slate-800 rounded w-12 ml-auto" /></td>
                      </tr>
                    ))
                  ) : (!Array.isArray(paginatedStudents) || paginatedStudents.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                        No student records found matching active metrics.
                      </td>
                    </tr>
                  ) : (
                    Array.isArray(paginatedStudents) && paginatedStudents.map((s) => {
                      const isChecked = selectedIds.includes(s.id);
                      return (
                        <tr
                          key={s.id}
                          className={`hover:bg-slate-900/40 transition-colors duration-100 ${
                            isChecked ? 'bg-indigo-950/20' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedIds((prev) =>
                                  prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                                );
                              }}
                              className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                            />
                          </td>

                          {/* Student Info */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-3">
                              {/* Selection Highlight Pointer */}
                              <button
                                onClick={() => setPreviewStudentId(s.id)}
                                className={`w-2.5 h-2.5 rounded-full transition-colors shrink-0 cursor-pointer ${
                                  previewStudentId === s.id ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700 hover:bg-slate-500'
                                }`}
                                title="Set Focus preview card"
                              />

                              {/* Mini Passport Photo Thumbnail */}
                              <div className="w-8 h-9 rounded bg-slate-950 border border-slate-800/85 flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative">
                                {getStudentPhotoUrl(s) ? (
                                  <img src={getStudentPhotoUrl(s)} alt={s.name} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                ) : (
                                  <svg className="w-4 h-4 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span
                                    onClick={() => setPreviewStudentId(s.id)}
                                    className="font-bold text-slate-100 hover:text-indigo-400 cursor-pointer transition-colors"
                                  >
                                    {s.name}
                                  </span>
                                  {!s.hasPhoto && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wide">
                                      ⚠️ Missing Photo
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-indigo-400 font-semibold mt-0.5">
                                  {s.boardingStatus === 'Boarder' || s.boardingStatus === 'Hosteller' ? 'Hosteller' : 'Day Scholar'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Admin No */}
                          <td className="py-3 px-3 font-mono font-bold text-slate-400">{s.adminNo}</td>

                          {/* Class & Stream */}
                          <td className="py-3 px-3 font-semibold text-slate-350">
                            {(() => {
                              const clsParts = (s.gradeClass || '').split(' ');
                              return (
                                <div className="flex flex-col">
                                  <span className="text-slate-200 font-bold">{clsParts[0]}</span>
                                  <span className="text-[9.5px] text-slate-500 font-bold uppercase tracking-wider">
                                    Stream {clsParts.slice(1).join(' ') || 'A'}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Class Teacher */}
                          <td className="py-3 px-3">
                            {(() => {
                              const ct = classTeachers.find(item => item.grade_class === s.gradeClass);
                              return ct ? (
                                <div className="flex flex-col">
                                  <span className="text-slate-200 font-bold text-xs uppercase">{ct.teacher_name}</span>
                                  <span className="text-[9px] text-indigo-400 font-bold tracking-widest uppercase mt-0.5">
                                    Class Teacher
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500 italic text-[10px]">Unassigned</span>
                                </div>
                              );
                            })()}
                          </td>
                          {/* Print Status */}
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-flex px-3 py-1 rounded-full font-mono font-black text-[9px] tracking-wider uppercase border text-center ${
                              s.printStatus === 'Printed'
                                ? 'bg-indigo-950/40 border-indigo-800/60 text-indigo-400'
                                : 'bg-amber-950/40 border-amber-800/60 text-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.15)]'
                            }`}>
                              {s.printStatus || 'Not Printed'}
                            </span>
                          </td>
                                                   {/* Clearance Status */}
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => toggleRowStatus(s.id)}
                              className={`inline-flex px-3 py-1 rounded-full font-mono font-black text-[9px] tracking-wider uppercase border text-center cursor-pointer transition-colors duration-200 ${
                                s.isCleared
                                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/30'
                                  : 'bg-rose-950/40 border-rose-800/60 text-rose-400 hover:bg-rose-900/30'
                              }`}
                              title="Click to toggle clearance status"
                            >
                              {s.isCleared ? 'CLEARED' : 'HOLD'}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex gap-1.5 align-middle">
                              <button
                                onClick={() => handlePrintReportCard(s.id)}
                                className="p-1 text-slate-400 hover:bg-slate-800 rounded-md hover:text-violet-400 cursor-pointer transition-all duration-150"
                                title="Print Academic Report Card"
                              >
                                <Award className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenEditForm(s)}
                                className="p-1 text-slate-400 hover:bg-slate-800 rounded-md hover:text-emerald-400 cursor-pointer transition-all duration-150"
                                title="Edit registration"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(s.id)}
                                className="p-1 text-slate-400 hover:bg-slate-800 rounded-md hover:text-rose-400 cursor-pointer transition-all duration-150"
                                title="Remove Student"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            )}

            {/* Table Footer Actions & Pagination */}
            <div className="p-4 border-t border-slate-850 bg-slate-900/40 flex flex-col md:flex-row gap-4 justify-between items-center text-xs select-none">
              <div className="flex items-center gap-3">
                <span className="text-slate-500 font-mono">
                  Showing {effectiveTotalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(effectiveTotalCount, currentPage * pageSize)} of {effectiveTotalCount} matching ({students.length} total)
                </span>
                <span className="text-slate-700">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-mono">Page Size:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-800 border border-slate-700 text-slate-300 rounded px-1.5 py-0.5 outline-none cursor-pointer text-[11px]"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={-1}>All</option>
                  </select>
                </div>
              </div>

              {/* Pagination Controls */}
              {pageSize !== -1 && effectiveTotalCount > pageSize && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-colors font-mono cursor-pointer"
                  >
                    Prev
                  </button>
                  <span className="text-slate-400 font-mono">
                    Page {currentPage} of {Math.ceil(effectiveTotalCount / pageSize)}
                  </span>
                  <button
                    disabled={currentPage >= Math.ceil(effectiveTotalCount / pageSize)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(effectiveTotalCount / pageSize), prev + 1))}
                    className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none transition-colors font-mono cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              )}
              {/* Selection actions now handled at top Selection Action Banner */}
            </div>
          </div>
        </>
      ) : activeLevel === 'selective' ? (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-black uppercase text-slate-100 tracking-wider">Bursar's Selective Card Printing Suite</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide font-mono">Temporary session-based printing workspace</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Generate IDs and attendance clearance logs for a custom selection of students. Paste student numbers or names from an Excel sheet, or upload a roster list. The system matches students from the Master Database automatically, without affecting any permanent database states.
            </p>
          </div>

          {/* TWO COLUMN SELECTIVE ROSTER INPUT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Textarea Paste Roster Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <ClipboardList className="w-4 h-4 text-indigo-400" /> Paste Student List / IDs
              </h4>
              <p className="text-[10px] text-slate-400 leading-normal font-medium">
                Copy a list of registration codes or student names from Excel (one student per line) and paste them below:
              </p>
              <textarea
                value={selectiveInputText}
                onChange={(e) => setSelectiveInputText(e.target.value)}
                placeholder="Examples (one per line):&#10;ADM-2026-001&#10;Tendai Mutasa&#10;Arthur Pendelton&#10;S.1 Stream A names"
                className="w-full h-32 bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-700"
              />
            </div>

            {/* Drag and Drop File Upload Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Upload className="w-4 h-4 text-emerald-400" /> Upload Spreadsheet / CSV
                </h4>
                <p className="text-[10px] text-slate-400 leading-normal mt-2 font-medium">
                  Upload a comma-separated roster (CSV) or a plain text file containing your target list of students to cross-reference:
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950/60 p-4 rounded-xl text-center cursor-pointer transition-all relative">
                <input
                  type="file"
                  accept=".csv, .txt"
                  onChange={handleSelectiveFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                <span className="block text-[10px] uppercase font-black text-slate-300 tracking-wider">Drag &amp; Drop List File</span>
                <span className="block text-[8.5px] text-slate-500 font-mono mt-1">Accepts UTF-8 CSV or Plain Text (.txt) up to 2MB</span>
              </div>

              {selectiveFileError && (
                <div className="text-[10px] text-rose-450 font-bold bg-rose-955/20 border border-rose-900/40 p-2 rounded-md font-mono">
                  Error: {selectiveFileError}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                {selectiveMatchedIds.length > 0 && (
                  <button
                    onClick={handleResetSelectiveSession}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 hover:text-white border border-slate-700 text-slate-400 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Reset Session
                  </button>
                )}
                <button
                  onClick={() => handleRunAutoMatch(selectiveInputText)}
                  disabled={!selectiveInputText.trim()}
                  className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-black text-[10px] uppercase tracking-wider border border-indigo-500 shadow-sm transition-all duration-100 cursor-pointer"
                >
                  🔍 Run Auto-Match Process
                </button>
              </div>
            </div>
          </div>

          {/* DYNAMIC MATCH REPORT STATUS BAR */}
          {selectiveParsedRowsCount > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950 border border-slate-850 p-3 rounded-xl">
              <div className="bg-slate-900/60 p-2 border border-slate-850/60 rounded-lg text-center">
                <span className="block text-[8px] font-mono text-slate-500 uppercase font-black">Lines Analyzed</span>
                <span className="text-base font-black text-slate-300 mt-0.5 block">{selectiveParsedRowsCount}</span>
              </div>
              <div className="bg-slate-900/60 p-2 border border-slate-850/60 rounded-lg text-center">
                <span className="block text-[8px] font-mono text-emerald-400 uppercase font-black">Matched Students</span>
                <span className="text-base font-black text-emerald-400 mt-0.5 block">{selectiveMatchedIds.length}</span>
              </div>
              <div className="bg-slate-900/60 p-2 border border-slate-850/60 rounded-lg text-center">
                <span className="block text-[8px] font-mono text-amber-400 uppercase font-black">Queued for Print</span>
                <span className="text-base font-black text-amber-400 mt-0.5 block">{selectiveSelectedIds.length}</span>
              </div>
              <div className="bg-slate-900/60 p-2 border border-slate-850/60 rounded-lg text-center">
                <span className="block text-[8px] font-mono text-rose-455 uppercase font-black">Unmatched Names</span>
                <span className="text-base font-black text-rose-455 mt-0.5 block">{selectiveUnmatchedRows.length}</span>
              </div>
            </div>
          )}

          {/* UNMATCHED ENTRIES ALERTS */}
          {selectiveUnmatchedRows.length > 0 && (
            <div className="bg-rose-955/10 border border-rose-900/40 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-rose-400 font-extrabold uppercase font-mono text-[10px] tracking-wider">
                <AlertCircle className="w-4 h-4" />
                <span>Cross-Reference Warnings: {selectiveUnmatchedRows.length} Unmatched Lines Found</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-medum">
                The following entries from your Excel or list upload could not be paired with any active student record in the Master Register. Please verify spelling, typos, or exact registration keycards:
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-950/80 rounded-lg border border-slate-850">
                {selectiveUnmatchedRows.map((row, rIdx) => (
                  <span key={`unmatched-${rIdx}`} className="px-2 py-0.5 bg-rose-955/35 border border-rose-900/30 text-rose-450 rounded text-[9px] font-mono leading-none font-bold">
                    {row}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* MATCHED PREVIEW ROSTER & ACTIONS */}
          {selectiveMatchedIds.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm">
              {/* Header list controls */}
              <div className="p-4 bg-slate-950 border-b border-slate-850 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div>
                  <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Matched Session Preview Roster</h4>
                  <p className="text-[9px] text-slate-500 font-mono mt-0.5 uppercase tracking-wide">Select individual boxes below to queue for layout compilation</p>
                </div>

                <div className="flex gap-2 w-full sm:w-auto items-center">
                  <div className="relative flex-1 sm:w-48">
                    <input
                      type="text"
                      value={selectiveSearchQuery}
                      onChange={(e) => setSelectiveSearchQuery(e.target.value)}
                      placeholder="Search matched session..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 pl-7 pr-3 text-xs text-slate-350 placeholder:text-slate-600 focus:outline-none"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 top-2" />
                  </div>

                  <button
                    onClick={() => {
                      if (selectiveSelectedIds.length === selectiveMatchedIds.length) {
                        setSelectiveSelectedIds([]);
                      } else {
                        setSelectiveSelectedIds([...selectiveMatchedIds]);
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-755 border border-slate-700 rounded-lg text-[9px] font-black uppercase font-mono text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    {selectiveSelectedIds.length === selectiveMatchedIds.length ? 'Deselect All' : 'Select All Match'}
                  </button>
                </div>
              </div>

              {/* list table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left border-collapse select-none">
                  <thead>
                    <tr className="border-b border-slate-850 bg-slate-950/20 text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                      <th className="py-2.5 px-3 w-10 text-center">Checked</th>
                      <th className="py-2.5 px-3">Student Details</th>
                      <th className="py-2.5 px-3">Admin No</th>
                      <th className="py-2.5 px-3">Class stream</th>
                      <th className="py-2.5 px-3">Class Teacher</th>
                      <th className="py-2.5 px-3 text-center">Clearance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
                    {(!Array.isArray(filteredSelectiveStudents) || filteredSelectiveStudents.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500 font-mono text-[10px]">
                          No matched records match the active search word.
                        </td>
                      </tr>
                      ) : (
                      Array.isArray(filteredSelectiveStudents) && filteredSelectiveStudents.map((s) => {
                        const isChecked = selectiveSelectedIds.includes(s.id);
                        return (
                          <tr
                            key={`selective-tr-${s.id}`}
                            className={`hover:bg-slate-900/30 transition-colors duration-100 ${
                              isChecked ? 'bg-indigo-950/25' : ''
                            }`}
                          >
                            {/* Print Queue Checkbox */}
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectiveSelectedIds((prev) =>
                                    prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                                  );
                                }}
                                className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                              />
                            </td>

                            {/* Student Details */}
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={() => setPreviewStudentId(s.id)}
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    previewStudentId === s.id ? 'bg-indigo-500 animate-pulse' : 'bg-slate-800 hover:bg-slate-600'
                                  }`}
                                  title="Focus card preview"
                                />
                                {/* Small avatar thumbnail */}
                                <div className="w-7 h-9 rounded bg-slate-950 border border-slate-850 overflow-hidden shrink-0">
                                  {getStudentPhotoUrl(s) ? (
                                    <img src={getStudentPhotoUrl(s)} alt={s.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                  ) : (
                                    <svg className="w-3.5 h-3.5 text-slate-700 mx-auto mt-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span
                                    onClick={() => setPreviewStudentId(s.id)}
                                    className="font-bold text-slate-200 hover:text-indigo-400 cursor-pointer transition-colors block text-xs"
                                  >
                                    {s.name}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-bold block">{s.boardingStatus === 'Boarder' || s.boardingStatus === 'Hosteller' ? 'Hosteller' : 'Day Scholar'}</span>
                                </div>
                              </div>
                            </td>

                            {/* Registration Code */}
                            <td className="py-2.5 px-3 font-mono font-bold text-[10.5px] text-slate-400">{s.adminNo}</td>

                            {/* Class Stream */}
                            <td className="py-2.5 px-3 font-bold text-slate-350">{s.gradeClass}</td>

                            {/* Class Teacher */}
                            <td className="py-2.5 px-3">
                              {(() => {
                                const ct = classTeachers.find(item => item.grade_class === s.gradeClass);
                                return ct ? (
                                  <span className="text-slate-200 font-semibold">{ct.teacher_name}</span>
                                ) : (
                                  <span className="text-slate-550 italic text-[10.5px]">Unassigned</span>
                                );
                              })()}
                            </td>

                            {/* Clearance status badge */}
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full font-mono text-[8.5px] font-black tracking-wider uppercase border border-solid ${
                                s.isCleared
                                  ? 'bg-emerald-950/30 border-emerald-855 text-emerald-400'
                                  : 'bg-rose-950/30 border-rose-855 text-rose-400'
                              }`}>
                                {s.isCleared ? 'CLEARED' : 'HOLD'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary row footer */}
              <div className="p-3 bg-slate-950 border-t border-slate-850 text-[10px] flex justify-between items-center text-slate-500 font-mono">
                <span>
                  Cross-referenced {selectiveMatchedIds.length} of {students.length} Master Students
                </span>
                <span className="font-bold text-indigo-400">
                  Queue state: {selectiveSelectedIds.length} Matched Cards Selected
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-black uppercase text-slate-100 tracking-wider">Level 3: Print History &amp; Audit Logs</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide font-mono">EMIS Uganda Compliance Roster Tracking</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Track all exported clearance cards, print batches, and system transactions. Access and re-download previously generated PDF cards without re-running layouts on the database.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* PRINT HISTORY CARD */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-sm animate-fade-in">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-indigo-400" /> Print Job History Log
                </span>
                <button
                  onClick={loadHistoryAndLogs}
                  className="text-[9px] hover:text-indigo-400 text-slate-400 font-extrabold uppercase transition-colors cursor-pointer pointer-events-auto"
                >
                  Refresh Logs
                </button>
              </h4>
              
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full min-w-[600px] text-left border-collapse select-none">
                  <thead>
                    <tr className="border-b border-slate-850 bg-slate-950/20 text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                      <th className="py-2.5 px-3">Date &amp; Time</th>
                      <th className="py-2.5 px-3 text-center">Layout</th>
                      <th className="py-2.5 px-3 text-center">Students</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-xs text-slate-350 font-mono">
                    {loadingHistory ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500 text-[10px]">
                          Loading print history...
                        </td>
                      </tr>
                    ) : printHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500 text-[10px]">
                          No card print history recorded yet.
                        </td>
                      </tr>
                    ) : (
                      printHistory.map((hItem) => {
                        let count = 0;
                        try {
                          const ids = JSON.parse(hItem.student_ids);
                          count = ids.length;
                        } catch (e) {
                          count = 1;
                        }
                        return (
                          <tr key={`history-${hItem.id}`} className="hover:bg-slate-900/30 transition-colors">
                            <td className="py-2.5 px-3 text-[11px] text-slate-400">
                              {new Date(hItem.print_date).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] uppercase text-indigo-400 font-bold">
                              {hItem.layout_mode}
                            </td>
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-200 font-bold">
                              {count}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <a
                                href={`${getApiBaseUrl()}/api/pdf/download/${hItem.pdf_path}`}
                                download={hItem.pdf_path}
                                onClick={(e) => {
                                  if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
                                    e.preventDefault();
                                    triggerFileDownload(`${getApiBaseUrl()}/api/pdf/download/${hItem.pdf_path}`, hItem.pdf_path);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 hover:text-white border border-indigo-900/50 rounded-md text-[9px] font-bold uppercase transition-all pointer-events-auto cursor-pointer"
                              >
                                <Download className="w-3 h-3" /> Re-Download
                              </a>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AUDIT LOGS CARD */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-sm animate-fade-in">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-400" /> EMIS Uganda System Audit Trails
                </span>
                <span className="text-[9px] text-slate-500 font-mono">Real-Time Transactions</span>
              </h4>
              
              <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                <table className="w-full min-w-[700px] text-left border-collapse select-none">
                  <thead>
                    <tr className="border-b border-slate-850 bg-slate-950/20 text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                      <th className="py-2.5 px-3 w-44">Timestamp</th>
                      <th className="py-2.5 px-3 w-36">Action</th>
                      <th className="py-2.5 px-3">Transaction Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-xs text-slate-355 font-mono">
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-500 text-[10px]">
                          Loading transaction logs...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-500 text-[10px]">
                          No system transactions audited yet.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((logItem) => (
                        <tr key={`log-${logItem.id}`} className="hover:bg-slate-900/30 transition-colors text-[11px]">
                          <td className="py-2.5 px-3 text-slate-500">
                            {new Date(logItem.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400 uppercase font-bold text-[10px]">
                            {logItem.action}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 font-sans leading-relaxed">
                            {logItem.details}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>

    {/* RIGHT PREVIEW PANEL: BADGE CARD STUDIO & EXPORTERS */}
      <section className="w-full lg:w-[480px] bg-slate-950 p-4 md:p-6 flex flex-col justify-start gap-4 shrink-0 overflow-y-auto border-t lg:border-t-0 border-slate-900 select-none">
        
        {activeLevel === 'history' ? (
          <>
            {/* EMIS compliance stats card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 animate-fade-in">
              <h3 className="text-sm font-extrabold text-slate-150 uppercase tracking-tight flex items-center gap-1.5 text-indigo-400 font-black">
                <History className="w-4 h-4" /> System Integrity Audits
              </h3>
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                This transaction ledger complies with EMIS Uganda specifications for data integrity, database pooling, indexing, and server-side card output archiving.
              </p>
              
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 space-y-3 text-[10px] font-mono leading-relaxed text-slate-400">
                <div>
                  <span className="text-indigo-400 font-black block">● DATABASE INTEGRATION STATS:</span>
                  <span>Pooling active with 15 connections limit. Auto indexing enforced on admin numbers and classes.</span>
                </div>
                <div>
                  <span className="text-emerald-400 font-black block">● TRANSACTION COMPLIANCE:</span>
                  <span>All additions, modifications, card print jobs, and imports are fully audited inside `audit_logs`.</span>
                </div>
              </div>
            </div>

            {/* SCHOOL LOGO & CREST SETTINGS CARD (HISTORY TAB VIEW) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 animate-fade-in">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-500" /> School Branding Logo
                </span>
                {schoolLogo && (
                  <button
                    type="button"
                    onClick={handleResetLogo}
                    className="text-[9px] hover:text-rose-455 text-slate-400 font-extrabold uppercase transition-colors pointer-events-auto cursor-pointer"
                    title="Restore default St. Paul Secondary School crest"
                  >
                    Reset Crest
                  </button>
                )}
              </h3>
              
              <div className="flex gap-3 items-center bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                <div className="relative shrink-0 w-11 h-11 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden">
                  <SchoolLogo className="w-9 h-9" logoBase64={schoolLogo} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-[10px] uppercase font-bold text-slate-450 tracking-wider">Active Credentials Seal</span>
                  <span className="block text-[8.5px] text-slate-500 truncate mt-0.5 leading-relaxed">
                    {schoolLogo ? 'Custom Uploaded Official Logo' : 'St. Paul Fallback Vector Crest'}
                  </span>
                </div>
              </div>

              <div className="relative">
                <label 
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 hover:text-slate-100 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-slate-700 cursor-pointer text-center select-none transition-all duration-150"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload Brand Logo
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/jpg, image/svg+xml" 
                    onChange={handleLogoUpload} 
                    className="hidden" 
                  />
                </label>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-extrabold text-slate-150 uppercase tracking-tight flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-indigo-400" /> Print Preview Workspace
              </h3>
          <h3 className="text-sm font-extrabold text-slate-150 uppercase tracking-tight flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4 text-indigo-400" /> Print Preview Workspace
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            Select student on the grid to update live preview parameters. Flip card using toggle controls.
          </p>

          {activePreviewStudent ? (
            <div className="mt-4 flex flex-col items-center gap-4">
              {/* Active Card Frame */}
              <div className="p-1 px-2 bg-slate-100/5 border border-slate-700 rounded-full flex gap-1 text-[9px] font-bold font-mono text-slate-400 uppercase tracking-widest leading-none flex-wrap justify-center">
                <button
                  onClick={() => setPreviewCardSide('both')}
                  className={`px-3 py-1 rounded-full cursor-pointer transition-all ${
                    previewCardSide === 'both' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-slate-800'
                  }`}
                >
                  All Sides
                </button>
                <button
                  onClick={() => setPreviewCardSide('front')}
                  className={`px-3 py-1 rounded-full cursor-pointer transition-all ${
                    previewCardSide === 'front' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-slate-800'
                  }`}
                >
                  Front
                </button>
                <button
                  onClick={() => setPreviewCardSide('back')}
                  className={`px-3 py-1 rounded-full cursor-pointer transition-all ${
                    previewCardSide === 'back' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-slate-800'
                  }`}
                >
                  Meal Calendar
                </button>
                <button
                  onClick={() => setPreviewCardSide('payment')}
                  className={`px-3 py-1 rounded-full cursor-pointer transition-all ${
                    previewCardSide === 'payment' ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-slate-800'
                  }`}
                >
                  Payment Mode
                </button>
              </div>

              <div className="scale-[1.1] md:scale-[1.15] lg:scale-[1.25] origin-top flex flex-col gap-4 my-6">
                <ClearanceCard
                  student={activePreviewStudent}
                  side={previewCardSide}
                  interactive={false}
                  logoBase64={schoolLogo}
                  showWatermark={showWatermark}
                  watermarkOpacity={watermarkOpacity / 100}
                />
              </div>
                
                {/* Micro info */}
                <div className="w-full bg-slate-950 rounded-lg p-2.5 border border-slate-850 text-[10px] text-left">
                  <div className="flex justify-between font-mono font-bold text-slate-400 border-b border-slate-850 pb-1 mb-1">
                    <span>Admin Code</span>
                    <span className="text-slate-200">{activePreviewStudent.adminNo}</span>
                  </div>
                  {activePreviewStudent.remarks && (
                    <p className="text-slate-500 italic mt-0.5 leading-relaxed font-sans">
                      "{activePreviewStudent.remarks}"
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-slate-500 font-medium">
                Please register a student to load active layouts.
              </div>
            )}
          </div>

          {/* SCHOOL LOGO & CREST SETTINGS CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" /> School Branding Logo
              </span>
              {schoolLogo && (
                <button
                  type="button"
                  onClick={handleResetLogo}
                  className="text-[9px] hover:text-rose-450 text-slate-400 font-extrabold uppercase transition-colors pointer-events-auto cursor-pointer"
                  title="Restore default St. Paul Secondary School crest"
                >
                  Reset Crest
                </button>
              )}
            </h3>
            
            <div className="flex gap-3 items-center bg-slate-950 p-2.5 rounded-lg border border-slate-850">
              <div className="relative shrink-0 w-11 h-11 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden">
                <SchoolLogo className="w-9 h-9" logoBase64={schoolLogo} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-[10px] uppercase font-bold text-slate-450 tracking-wider">Active Credentials Seal</span>
                <span className="block text-[8.5px] text-slate-500 truncate mt-0.5 leading-relaxed">
                  {schoolLogo ? 'Custom Uploaded Official Logo' : 'St. Paul Fallback Vector Crest'}
                </span>
              </div>
            </div>

            <div className="relative">
              <label 
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 hover:text-slate-100 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-slate-700 cursor-pointer text-center select-none transition-all duration-150"
              >
                <Upload className="w-3.5 h-3.5" /> Upload Brand Logo
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/jpg, image/svg+xml" 
                  onChange={handleLogoUpload} 
                  className="hidden" 
                />
              </label>
            </div>
            <p className="text-[8.5px] leading-relaxed text-slate-450 font-mono">
              For best print results, replace the default logo with a transparent background PNG logo of at least 1000×1000 resolution (max 1.2MB). This dynamically applies the seal to clearance layouts, scan mobile links, and high-fidelity PDF exports    </p>
          </div>

          {/* PRINT ACTIONS AREA */}
          <div className="bg-slate-900 border border-indigo-505/20 bg-indigo-950/5 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-indigo-400" /> Export Clearance Passes
            </h3>
            
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Export vector multi-page PDF documents or execute high-fidelity paper sheets via browser layout.
            </p>

            {/* Current Matching Students Count widget */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-bold uppercase tracking-wider font-mono">Matched Students:</span>
              <span className="font-extrabold text-indigo-400 font-mono text-xs">{filteredStudents.length} entries</span>
            </div>

            <div className="space-y-2 mt-1">
              {/* PDF Settings Layout select */}
              <div className="flex flex-col bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">PDF Sheets Alignment Method:</label>
                <select
                  value={pdfLayoutMode}
                  onChange={(e) => setPdfLayoutMode(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-slate-200 uppercase mt-1 focus:outline-none"
                >
                  <option value="front-back-paired">Stacked (Front & Back Side-by-Side)</option>
                  <option value="printable-grid">Grid (8-Cards Duplex Mirrored Roster)</option>
                </select>
                <p className="text-[8.5px] text-slate-500 mt-1 leading-normal">
                  {pdfLayoutMode === 'front-back-paired' 
                    ? 'Best for direct single A4 handouts. Front is side-by-side with Back calendar.'
                    : 'Best for standard duplex printers. Generates Page 1 (Fronts) and Page 2 (Backs) paired.'}
                </p>
              </div>

              {/* Printing Option Select */}
              <div className="flex flex-col bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Printing Option:</label>
                <select
                  value={printSide}
                  onChange={(e) => setPrintSide(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-slate-220 uppercase mt-1 focus:outline-none"
                >
                  <option value="both">Print Front and Back</option>
                  <option value="front">Print Front Only</option>
                  <option value="back">Print Back Only</option>
                </select>
                <p className="text-[8.5px] text-slate-500 mt-1 leading-normal">
                  {printSide === 'both' 
                    ? 'Generates complete student clearance front and back card pages.'
                    : printSide === 'front'
                    ? 'Generates only front student ID and attendance calendar sheets.'
                    : 'Generates only payment logs and August validation sheets.'}
                </p>
              </div>

              {/* PRINT SETTINGS GROUP (Requirement 7) */}
              <div className="flex flex-col bg-slate-950 p-3 rounded-lg border border-slate-850 gap-2.5">
                <span className="text-[9.5px] text-indigo-400 font-black uppercase tracking-wider font-mono">Print Settings:</span>
                
                {/* Enable Photo Enhancement */}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enablePhotoEnhancement}
                    onChange={(e) => setEnablePhotoEnhancement(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Enable Photo Enhancement</span>
                </label>

                {/* Increase PDF Brightness */}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={increasePdfBrightness}
                    onChange={(e) => setIncreasePdfBrightness(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Increase PDF Brightness</span>
                </label>

                {/* Show Watermark */}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Show Watermark</span>
                </label>

                {/* Watermark Opacity Control Slider */}
                {showWatermark && (
                  <div className="flex flex-col pl-6 gap-1">
                    <div className="flex justify-between text-[9px] font-mono font-bold text-slate-500 uppercase">
                      <span>Watermark Opacity:</span>
                      <span className="text-slate-300">{watermarkOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={watermarkOpacity}
                      onChange={(e) => setWatermarkOpacity(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}

                {/* High Quality Print Mode */}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={highQualityPrintMode}
                    onChange={(e) => setHighQualityPrintMode(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <span>High Quality Print Mode</span>
                </label>
              </div>

              {/* Boarding Status filter (Requirement 2) */}
              <div className="flex flex-col bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Filter Boarding Status:</label>
                <select
                  value={filterBoarding}
                  onChange={(e) => setFilterBoarding(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-200 mt-1 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Students</option>
                  <option value="Hosteller">Hostellers</option>
                  <option value="Day Scholar">Day Scholars</option>
                </select>
                <p className="text-[8.5px] text-slate-500 mt-1 leading-normal">
                  Filter student lists before printing or exporting.
                </p>
              </div>

              {/* Export Scope / Selection Area */}
              <div className="flex flex-col bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Export Student Range / Scope:</label>
                <select
                  value={pdfExportScope}
                  onChange={(e) => setPdfExportScope(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-slate-200 mt-1 focus:outline-none cursor-pointer uppercase"
                >
                  <option className="bg-slate-950 text-slate-200" value="selected">Selected ({activeLevel === 'master' ? selectedIds.length : selectiveSelectedIds.length} checked)</option>
                  <option className="bg-slate-950 text-slate-200" value="first-n">First N Students (Specify count)</option>
                  <option className="bg-slate-950 text-slate-200" value="custom-range">Custom Index Range (e.g. 1-50)</option>
                  <option className="bg-slate-950 text-slate-200" value="all">All Filtered Matches ({filteredStudents.length} entries)</option>
                </select>

                {/* Conditional range inputs */}
                {pdfExportScope === 'first-n' && (
                  <div className="mt-2 pt-2 border-t border-slate-900 flex items-center justify-between gap-2">
                    <span className="text-[9px] text-slate-400 font-bold uppercase font-mono shrink-0">Print Limit:</span>
                    <input
                      type="number"
                      min={1}
                      max={filteredStudents.length}
                      value={pdfExportCount}
                      onChange={(e) => setPdfExportCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs font-mono text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[8px] text-slate-500 leading-none">Max matches: {filteredStudents.length}</span>
                  </div>
                )}

                {pdfExportScope === 'custom-range' && (
                  <div className="mt-2 pt-2 border-t border-slate-900 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 font-bold uppercase font-mono shrink-0">Start:</span>
                      <input
                        type="number"
                        min={1}
                        max={filteredStudents.length}
                        value={pdfExportStart}
                        onChange={(e) => setPdfExportStart(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs font-mono text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 font-bold uppercase font-mono shrink-0">End:</span>
                      <input
                        type="number"
                        min={1}
                        max={filteredStudents.length}
                        value={pdfExportEnd}
                        onChange={(e) => setPdfExportEnd(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs font-mono text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
                
                <p className="text-[8.5px] text-slate-500 mt-1 leading-normal font-mono">
                  {pdfExportScope === 'selected' 
                    ? 'Only student clearance cards ticked or checked in the database table roster.'
                    : pdfExportScope === 'first-n'
                    ? `First ${pdfExportCount} students from current active table display list.`
                    : pdfExportScope === 'custom-range'
                    ? `From Student index ${pdfExportStart} to ${pdfExportEnd} of the displaying sequence list.`
                    : `Exports all ${filteredStudents.length} matching students according to the selected top bar filters.`}
                </p>
              </div>

              {/* Progress feedback under generation */}
              {isGeneratingPdf && pdfProgress && (
                <div className="bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-900/30 flex flex-col gap-1.5 text-[10px] font-mono">
                  <div className="flex justify-between font-bold text-indigo-300">
                    <span>COMPILING VECTOR BARCODES...</span>
                    <span>{pdfProgress.current} / {pdfProgress.total}</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-100"
                      style={{ width: `${(pdfProgress.current / pdfProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handleTriggerPdfExport}
                  disabled={studentsToExport.length === 0 || isGeneratingPdf}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-lg border border-indigo-500 shadow-md transition-all duration-150 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download PDF ({studentsToExport.length} cards)
                </button>

                <button
                  type="button"
                  onClick={handlePrintHostellersOnly}
                  disabled={isGeneratingPdf}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-955/65 hover:bg-indigo-900 border border-indigo-800/40 text-indigo-300 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
                >
                  ⚡ Print Hostellers Only
                </button>

                <div className="flex gap-2">
                  <select value={exportScope} onChange={e => setExportScope(e.target.value as any)} className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 rounded-md">
                    <option value="Current">Export: Current View</option>
                    <option value="All">Export: All Students</option>
                    <option value="ByClass">Export: By Class</option>
                    <option value="ByStream">Export: By Stream</option>
                  </select>

                  {exportScope === 'ByClass' && (
                    <select value={exportClass} onChange={e => setExportClass(e.target.value)} className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 rounded-md">
                      {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}

                  {exportScope === 'ByStream' && (
                    <select value={exportStream} onChange={e => setExportStream(e.target.value)} className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 rounded-md">
                      {uniqueStreams.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}

                  <select value={exportPreset} onChange={e => setExportPreset(e.target.value as any)} className="bg-slate-900 border border-slate-850 py-1 px-2 text-[10px] text-slate-400 rounded-md">
                    <option value="None">Preset: None</option>
                    <option value="New">Preset: New Students Only</option>
                    <option value="WithPhotos">Preset: With Photos Only</option>
                    <option value="NewWithPhotos">Preset: New + With Photos</option>
                  </select>


                  <button onClick={handleExportScopeExcel} className="py-2 px-3 bg-emerald-700 text-white font-bold rounded-md">Export Scoped Excel</button>
                  <button onClick={handleExportScopeCsv} className="py-2 px-3 bg-emerald-800 text-white font-bold rounded-md">Export Scoped CSV</button>
                </div>

                <button
                  type="button"
                  onClick={handleExportToExcel}
                  disabled={studentsToExport.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-lg border border-emerald-650 shadow-sm transition-all duration-150 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Excel ({studentsToExport.length} students)
                </button>
                
                <button
                  type="button"
                  onClick={handleTriggerWebPrint}
                  disabled={selectedStudentsData.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 font-black text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Browser Page Handouts ({selectedStudentsData.length} cards)
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-center justify-center text-[9px] text-slate-500 leading-normal font-medium mt-1">
                <Info className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Select range above or check individual students below to queue for printing.</span>
              </div>
            </div>

          </div>
          </>
        )}

        </section>

      </main>
      )}
        </>
      )}

      {adminActiveTab === 'attendance' && (
        <div className="p-4 md:p-6 bg-slate-900 min-h-screen">
          <Suspense fallback={<Loading message="Loading Gate Attendance Workspace..." />}>
            <AttendanceModule />
          </Suspense>
        </div>
      )}

      {adminActiveTab === 'school' && (
        <div className="p-4 md:p-6 bg-slate-900 min-h-screen">
          <Suspense fallback={<Loading message="Loading School Management..." />}>
            <StaffModule />
          </Suspense>
        </div>
      )}

      {adminActiveTab === 'profile' && (
        <div className="p-4 md:p-6 bg-slate-900 min-h-screen">
          <Suspense fallback={<Loading message="Loading Profile Settings..." />}>
            <AdminSettingsView
              authSession={authSession}
              setAuthSession={setAuthSession}
              dbConfig={dbConfig}
              handleOpenDbSettings={handleOpenDbSettings}
              handleLogout={handleLogout}
              schoolLogo={schoolLogo}
              handleAddTask={handleAddTask}
            />
          </Suspense>
        </div>
      )}



      {adminActiveTab === 'controls' && (
        <div className="p-4 md:p-6 bg-slate-900 min-h-screen">
          <Suspense fallback={<Loading message="Loading Admin Controls..." />}>
            <AdminPortalExtensions
              schoolLogo={schoolLogo}
              onLogoRefresh={handleResetLogo}
              authSession={authSession}
              onAddTask={handleAddTask}
            />
          </Suspense>
        </div>
      )}

      {adminActiveTab === 'assistant' && (
        <div className="p-4 md:p-6 bg-slate-900 min-h-screen">
          <Suspense fallback={<Loading message="Loading St.Paul Assistant..." />}>
            <AiAssistantModule />
          </Suspense>
        </div>
      )}


      {/* BULK PHOTOS MATCHING DIALOG */}
      <BulkPhotoMatcher 
        isOpen={showBulkPhotoMatcher} 
        onClose={() => setShowBulkPhotoMatcher(false)} 
        onImport={async (newStudents) => {
          try {
            const res = await saveStudentsBulkInDbTask(newStudents);
            if (res && res.success) {
              handleAddTask({
                type: 'import',
                name: `Importing student spreadsheet & photos (${newStudents.length} items)`,
                taskId: res.taskId,
                total: newStudents.length
              });
              alert('Student import started in the background. Check progress in the Background Tasks panel (bottom right).');
            } else {
              alert('Failed to start bulk student import.');
            }
          } catch (e: any) {
            alert('Bulk student import failed: ' + e.message);
          }
        }} 
        existingStudents={students} 
      />

      {/* HIDDEN PHYSICAL HIGH-FIDELITY WEB PRINT CONTAINER */}
      <div id="print-section" className="hidden print:block bg-white text-black p-0">
        {(() => {
          const studentChunks = chunkArray(selectedStudentsData, 4);
          return studentChunks.map((chunk, chunkIdx) => (
            <React.Fragment key={chunkIdx}>
              {/* PAGE 1: Front Sheets (Back Card + Front Card) */}
              {(printSide === 'both' || printSide === 'front') && (
                <div className="print-page" key={`front-page-${chunkIdx}`}>
                  {chunk.map((student: Student) => (
                    <React.Fragment key={`front-${student.id}`}>
                      <div className="print-card-wrapper">
                        <ClearanceCard
                          student={student}
                          side="back"
                          logoBase64={schoolLogo}
                          showWatermark={showWatermark}
                          watermarkOpacity={watermarkOpacity / 100}
                        />
                      </div>
                      <div className="print-card-wrapper">
                        <ClearanceCard
                          student={student}
                          side="front"
                          logoBase64={schoolLogo}
                          showWatermark={showWatermark}
                          watermarkOpacity={watermarkOpacity / 100}
                        />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* PAGE 2: Back Sheets (Payment Card + August Card) */}
              {(printSide === 'both' || printSide === 'back') && (
                <div className="print-page" key={`back-page-${chunkIdx}`}>
                  {chunk.map((student: Student) => (
                    <React.Fragment key={`back-${student.id}`}>
                      <div className="print-card-wrapper">
                        <ClearanceCard
                          student={student}
                          side="payment-only"
                          logoBase64={schoolLogo}
                          showWatermark={showWatermark}
                          watermarkOpacity={watermarkOpacity / 100}
                        />
                      </div>
                      <div className="print-card-wrapper">
                        <ClearanceCard
                          student={student}
                          side="august-only"
                          logoBase64={schoolLogo}
                          showWatermark={showWatermark}
                          watermarkOpacity={watermarkOpacity / 100}
                        />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </React.Fragment>
          ));
        })()}
      </div>

      {showManualBgEditor && formInputs.photo && (
        <ManualBackgroundEditor
          imageSrc={formInputs.photo}
          onSave={(editedBase64) => {
            setFormInputs(prev => ({ ...prev, photo: editedBase64 }));
            setHasManualBgEdits(true);
            setShowManualBgEditor(false);
          }}
          onClose={() => setShowManualBgEditor(false)}
        />
      )}

      {isProcessingPhotosZip && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-[9999] select-none">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center max-w-sm shadow-2xl">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <div>
              <h4 className="text-sm font-black uppercase text-slate-100 tracking-wider">Matching Photos Archive</h4>
              <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">{photosZipProgress}</p>
            </div>
          </div>
        </div>
      )}

    {/* FORM MODAL - Rendered at top level for accessibility from all views */}
        {showFormModal && (
          <div className="no-print fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto py-8">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] md:max-h-[85vh] overflow-y-auto scrollbar-thin">
              {console.log("DEBUG MODAL STATE:", { editingStudent, showFormModal, modalTab })}
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black uppercase text-slate-100 tracking-wider">
              {editingStudent ? 'Edit Student Details' : 'Register New Student'}
            </h3>
            <button
              onClick={() => setShowFormModal(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors text-xs font-mono font-bold cursor-pointer"
            >
              [ CLOSE ]
            </button>
          </div>

          {editingStudent && (
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 text-center font-bold text-[9px] select-none gap-1 mb-3">
              <button
                type="button"
                onClick={() => setModalTab('details')}
                className={`flex-1 py-1.5 rounded-lg transition-all duration-150 cursor-pointer uppercase tracking-wider ${
                  modalTab === 'details' ? 'bg-indigo-600 text-white font-black' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setModalTab('parent')}
                className={`flex-1 py-1.5 rounded-lg transition-all duration-150 cursor-pointer uppercase tracking-wider ${
                  modalTab === 'parent' ? 'bg-indigo-600 text-white font-black' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Parent Info
              </button>
              <button
                type="button"
                onClick={() => setModalTab('attendance')}
                className={`flex-1 py-1.5 rounded-lg transition-all duration-150 cursor-pointer uppercase tracking-wider ${
                  modalTab === 'attendance' ? 'bg-indigo-600 text-white font-black' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Gate History
              </button>
            </div>
          )}

          {modalTab === 'details' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleFormSubmit(e);
              }}
              className="space-y-4"
            >
              {/* Passport Photo Upload & Capture Zone */}
              <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-850 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-18 bg-slate-950 border-2 border-dashed border-slate-800 hover:border-indigo-500 flex flex-col items-center justify-center rounded cursor-pointer overflow-hidden transition shrink-0 group">
                    {formInputs.photo ? (
                      <>
                        <img src={formInputs.photo} alt="Passport photo" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-slate-300 font-bold transition-opacity">
                          CHANGE
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center p-1">
                        <Upload className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 mb-0.5" />
                        <span className="text-[7.5px] text-slate-500 font-bold uppercase tracking-tight leading-none text-center">ADD PHOTO</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        await handlePhotoFileChange(file);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Student Passport Photo
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowWebcamCapture(!showWebcamCapture)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 hover:text-indigo-200 text-[8.5px] font-black uppercase tracking-wider rounded border border-indigo-850/60 transition cursor-pointer"
                      >
                        <Camera className="w-[11px] h-[11px]" />
                        {showWebcamCapture ? "Use File Upload" : "Webcam Capture"}
                      </button>
                    </div>
                    <p className="text-[9.5px] text-slate-450 leading-snug mt-0.5">
                      Upload standard size images or use device front camera with real-time automatic studio level enhancements.
                    </p>
                    {formInputs.photo && (
                      <button
                        type="button"
                        onClick={handleResetPhoto}
                        className="text-[9px] text-rose-400 hover:text-rose-300 font-bold uppercase mt-1 inline-block"
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>

                {showWebcamCapture && (
                  <div className="pt-2 border-t border-slate-850/50">
                    <WebcamCapture
                      onCapture={(base64Image, isPassport) => {
                        setPhotoRaw(base64Image);
                        setPhotoZoom(1.0);
                        setPhotoPanX(0);
                        setPhotoPanY(0);
                        setPhotoWhiten(45);
                        setPhotoAutoCenter(true);
                        setPhotoFilter('studio');
                        setPhotoBgColor(isPassport ? 'white' : 'none');
                        setHasManualBgEdits(false);
                        setShowWebcamCapture(false);
                      }}
                      onClose={() => setShowWebcamCapture(false)}
                    />
                  </div>
                )}

                {/* Photo Editor Adjustments */}
                {formInputs.photo && (
                  <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400">
                        <span>ZOOM</span>
                        <span>{photoZoom.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.5"
                        step="0.05"
                        value={photoZoom}
                        onChange={(e) => {
                          setPhotoZoom(parseFloat(e.target.value));
                          setPhotoAutoCenter(false);
                        }}
                        className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Background Color</label>
                      <select
                        value={photoBgColor}
                        onChange={(e) => setPhotoBgColor(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] text-slate-200 outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="white">White Background</option>
                        <option value="light-blue">Light Blue Background</option>
                        <option value="light-gray">Light Gray Background</option>
                        <option value="none">Original Background</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400">
                        <span>PAN X</span>
                        <span>{photoPanX}px</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={photoPanX}
                        onChange={(e) => {
                          setPhotoPanX(parseInt(e.target.value));
                          setPhotoAutoCenter(false);
                        }}
                        className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400">
                        <span>PAN Y</span>
                        <span>{photoPanY}px</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={photoPanY}
                        onChange={(e) => {
                          setPhotoPanY(parseInt(e.target.value));
                          setPhotoAutoCenter(false);
                        }}
                        className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={photoAutoCenter}
                          onChange={(e) => setPhotoAutoCenter(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-800 text-indigo-500 focus:ring-0 focus:ring-offset-0"
                        />
                        <span>Auto-Center</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowManualBgEditor(true)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-[9.5px] font-black uppercase tracking-wider rounded text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-400" /> Manual Backdrop Eraser
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Student Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter full name"
                  value={formInputs.name}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              {/* Alternative Names */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Alternative Names</label>
                <input
                  type="text"
                  placeholder="Enter aliases separated by commas"
                  value={formInputs.aliases}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, aliases: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                />
                <p className="text-[10px] text-slate-500">Names like alternate spellings or shortened variants are stored internally and not shown in lists.</p>
              </div>

              {/* Student Number */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Student Number</label>
                <input
                  type="text"
                  placeholder="Enter student number"
                  value={formInputs.adminNo}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, adminNo: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              {/* Grid 2 Column for Class and Stream */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Class *</label>
                  <select
                    value={(formInputs.gradeClass || '').split(' ')[0] || 'S.1'}
                    onChange={(e) => {
                      const nextClass = e.target.value;
                      const currentStream = (formInputs.gradeClass || '').split(' ').slice(1).join(' ') || 'A';
                      let nextStream = currentStream;
                      if (['S.5', 'S.6'].includes(nextClass)) {
                        if (!['Sciences', 'Arts'].includes(nextStream)) {
                          nextStream = 'Sciences';
                        }
                      } else {
                        if (!['A', 'B', 'C'].includes(nextStream)) {
                          nextStream = 'A';
                        }
                      }
                      setFormInputs(prev => ({ ...prev, gradeClass: `${nextClass} ${nextStream}`.trim() }));
                    }}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 uppercase font-black"
                  >
                    {['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'].map((clsOption) => (
                      <option key={clsOption} value={clsOption}>{clsOption}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Stream *</label>
                  <select
                    value={(formInputs.gradeClass || '').split(' ').slice(1).join(' ') || 'A'}
                    onChange={(e) => {
                      const nextStream = e.target.value;
                      const currentClass = (formInputs.gradeClass || '').split(' ')[0] || 'S.1';
                      setFormInputs(prev => ({ ...prev, gradeClass: `${currentClass} ${nextStream}`.trim() }));
                    }}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-bold"
                  >
                    {['S.1', 'S.2', 'S.3', 'S.4'].includes((formInputs.gradeClass || '').split(' ')[0]) ? (
                      <>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </>
                    ) : (
                      <>
                        <option value="Sciences">Sciences</option>
                        <option value="Arts">Arts</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Gender & Boarding */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Gender *</label>
                  <select
                    value={formInputs.gender || 'Male'}
                    onChange={(e) => setFormInputs(prev => ({ ...prev, gender: e.target.value as 'Male' | 'Female' }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-bold uppercase"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Boarding Status</label>
                  <select
                    value={formInputs.boardingStatus}
                    onChange={(e) => setFormInputs(prev => ({ ...prev, boardingStatus: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-355 focus:outline-none focus:border-indigo-500 uppercase font-semibold"
                  >
                    <option value="Hosteller">Hosteller</option>
                    <option value="Day Scholar">Day Scholar</option>
                  </select>
                </div>
              </div>

              {/* Remarks */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Remarks / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Fees fully cleared, special note"
                  value={formInputs.remarks}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, remarks: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Status Selector */}
              <div className="bg-slate-955 p-4 rounded-lg border border-slate-850 grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Overall Clearance Status</label>
                  <select
                    value={formInputs.isCleared ? "true" : "false"}
                    onChange={(e) => setFormInputs(prev => ({ ...prev, isCleared: e.target.value === "true" }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.2 text-xs text-slate-200 focus:outline-none uppercase font-bold tracking-wider cursor-pointer"
                  >
                    <option value="true">CLEARED ✔</option>
                    <option value="false">ON HOLD ✖</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Print Status</label>
                  <select
                    value={formInputs.printStatus || 'Not Printed'}
                    onChange={(e) => setFormInputs(prev => ({ ...prev, printStatus: e.target.value as any }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.2 text-xs text-slate-200 focus:outline-none uppercase font-bold tracking-wider cursor-pointer"
                  >
                    <option value="Not Printed">NOT PRINTED ✖</option>
                    <option value="Printed">PRINTED ✔</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2.5 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white border border-indigo-500 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          )}

          {modalTab === 'parent' && editingStudent && (
            <div className="space-y-4 text-xs text-left animate-fade-in">
              <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-850 space-y-2">
                <h4 className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Father Details</h4>
                <input
                  type="text"
                  placeholder="Father Name"
                  value={modalParentContacts.father_name || ''}
                  onChange={(e) => setModalParentContacts(prev => ({ ...prev, father_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-250 outline-none focus:border-indigo-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Father Phone"
                    value={modalParentContacts.father_phone || ''}
                    onChange={(e) => setModalParentContacts(prev => ({ ...prev, father_phone: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 font-mono outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Father WhatsApp"
                    value={modalParentContacts.father_whatsapp || ''}
                    onChange={(e) => setModalParentContacts(prev => ({ ...prev, father_whatsapp: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 font-mono outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-850 space-y-2">
                <h4 className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Mother Details</h4>
                <input
                  type="text"
                  placeholder="Mother Name"
                  value={modalParentContacts.mother_name || ''}
                  onChange={(e) => setModalParentContacts(prev => ({ ...prev, mother_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 outline-none focus:border-indigo-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Mother Phone"
                    value={modalParentContacts.mother_phone || ''}
                    onChange={(e) => setModalParentContacts(prev => ({ ...prev, mother_phone: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 font-mono outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Mother WhatsApp"
                    value={modalParentContacts.mother_whatsapp || ''}
                    onChange={(e) => setModalParentContacts(prev => ({ ...prev, mother_whatsapp: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 font-mono outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-850 space-y-2">
                <h4 className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Guardian / Emergency Contact</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Guardian Name"
                    value={modalParentContacts.guardian_name || ''}
                    onChange={(e) => setModalParentContacts(prev => ({ ...prev, guardian_name: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Relationship"
                    value={modalParentContacts.relationship || 'Guardian'}
                    onChange={(e) => setModalParentContacts(prev => ({ ...prev, relationship: e.target.value }))}
                    className="w-full bg-slate-955 border border-slate-850 rounded p-2 text-xs text-slate-255 outline-none focus:border-indigo-500"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Guardian Phone"
                  value={modalParentContacts.guardian_phone || ''}
                  onChange={(e) => setModalParentContacts(prev => ({ ...prev, guardian_phone: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 font-mono outline-none focus:border-indigo-500"
                />
              </div>

              <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-850 space-y-2">
                <h4 className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Address &amp; Config</h4>
                <input
                  type="text"
                  placeholder="Home Address"
                  value={modalParentContacts.home_address || ''}
                  onChange={(e) => setModalParentContacts(prev => ({ ...prev, home_address: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-xs text-slate-255 outline-none focus:border-indigo-500"
                />
                <input
                  type="email"
                  placeholder="Parent Email"
                  value={modalParentContacts.email || ''}
                  onChange={(e) => setModalParentContacts(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full bg-slate-955 border border-slate-850 rounded p-2 text-xs text-slate-255 font-mono outline-none focus:border-indigo-500"
                />
                <div className="flex items-center justify-between pt-1 font-bold text-[9px] uppercase tracking-wider text-slate-500">
                  <span>Preferred Channel</span>
                  <select
                    value={modalParentContacts.preferred_notification || 'SMS'}
                    onChange={(e) => setModalParentContacts(prev => ({ ...prev, preferred_notification: e.target.value }))}
                    className="px-2 py-1 bg-slate-950 border border-slate-850 rounded font-mono text-slate-250 outline-none cursor-pointer"
                  >
                    <option value="SMS">SMS Alerts</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Both">Both (WhatsApp + SMS)</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                disabled={modalParentSaving}
                onClick={async () => {
                  setModalParentSaving(true);
                  try {
                    const res = await saveParentContacts(editingStudent.id, modalParentContacts);
                    if (res.success) {
                      alert('Parent contacts registry synchronized.');
                    }
                  } catch (err: any) {
                    alert('Sync failed: ' + err.message);
                  } finally {
                    setModalParentSaving(false);
                  }
                }}
                className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black uppercase tracking-wider rounded-lg transition cursor-pointer"
              >
                {modalParentSaving ? 'SAVING...' : 'SAVE PARENT CONTACTS'}
              </button>
            </div>
          )}

          {modalTab === 'attendance' && (
            <div className="space-y-4 text-xs text-left font-mono animate-fade-in max-h-[50vh] overflow-y-auto pr-1">
              <h4 className="text-[10px] text-indigo-400 font-black uppercase tracking-wider font-sans border-b border-slate-850 pb-2">Student Gate Logs</h4>
              {modalAttendanceLoading ? (
                <div className="text-center py-8 text-slate-500 font-bold uppercase tracking-wider animate-pulse">Syncing logs history...</div>
              ) : modalAttendanceHistory.length === 0 ? (
                <p className="text-center py-8 text-slate-550 italic font-bold uppercase tracking-wide font-sans">No gate logs recorded.</p>
              ) : (
                <div className="space-y-2">
                  {modalAttendanceHistory.map((log: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-slate-950/60 border border-slate-850 rounded flex items-center justify-between gap-3">
                      <div>
                        <p className="text-slate-200 font-bold font-sans text-xs">{new Date(log.date).toLocaleDateString()}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-none">In: {log.time_in || '--:--'} &bull; Out: {log.time_out || '--:--'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                          log.status === 'Present' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' :
                          'bg-amber-950 text-amber-400 border border-amber-900/30'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}

    {/* Academic Report Compilation Loading Overlay */}
    {isCompilingReport && reportProgress && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
          <RefreshCw className="w-8 h-8 text-violet-400 animate-spin mx-auto" />
          <div>
            <h3 className="text-sm font-black uppercase text-slate-100">Compiling Report Card</h3>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-mono">
              Resolving Crests, Stamps &amp; Academic Data
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-400 font-bold">
              <span>PROGRESS</span>
              <span>{reportProgress.current} / {reportProgress.total}</span>
            </div>
            <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    )}
      {authSession && <AiAssistantPopup schoolLogo={schoolLogo} />}

      {/* FLOATING BACKGROUND TASKS PANEL */}
      {authSession && (
        <div className="fixed bottom-4 right-24 z-[9999] font-sans">
          {/* Trigger Button */}
          <button
            onClick={() => setIsBgTasksOpen(prev => !prev)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-full shadow-2xl transition-all duration-200"
          >
            <RefreshCw className={`w-5 h-5 ${bgTasks.some(t => t.status === 'processing') ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            <span className="font-semibold text-sm">Background Tasks</span>
            {bgTasks.filter(t => t.status === 'processing').length > 0 && (
              <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                {bgTasks.filter(t => t.status === 'processing').length}
              </span>
            )}
          </button>

          {/* Panel Drawer */}
          {isBgTasksOpen && (
            <div className="absolute bottom-16 right-0 w-80 bg-slate-950 border border-slate-800 rounded-2xl shadow-3xl overflow-hidden p-4 space-y-3 max-h-96 overflow-y-auto bg-opacity-95 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-slate-200 text-sm">Task Progress</h3>
              <button onClick={() => setIsBgTasksOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {bgTasks.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No active or recent background tasks.</p>
            ) : (
              <div className="space-y-3">
                {bgTasks.map(task => (
                  <div key={task.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-slate-350 break-words line-clamp-2">{task.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold ${
                        task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                        task.status === 'failed' ? 'bg-rose-500/10 text-rose-400' :
                        'bg-indigo-500/10 text-indigo-400 animate-pulse'
                      }`}>
                        {task.status}
                      </span>
                    </div>

                    {task.status === 'processing' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>Processing...</span>
                          <span>{task.progress} / {task.total} ({Math.round((task.progress / (task.total || 1)) * 100)}%)</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full transition-all duration-300"
                            style={{ width: `${(task.progress / (task.total || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {task.status === 'completed' && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                        </span>
                        {task.filename && (
                          <a
                            href={`${getApiBaseUrl()}/api/pdf/download/${task.filename}`}
                            download={task.filename}
                            onClick={(e) => {
                              if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
                                e.preventDefault();
                                triggerFileDownload(`${getApiBaseUrl()}/api/pdf/download/${task.filename}`, task.filename!);
                              }
                            }}
                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded font-medium transition-colors"
                          >
                            <Download className="w-3 h-3" /> Download
                          </a>
                        )}
                      </div>
                    )}

                    {task.status === 'failed' && (
                      <div className="text-[10px] text-rose-400 flex items-start gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="break-words">Error: {task.error}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
    </>
  );
}

// Simple Error Boundary to avoid blank screen when App throws during render
class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error('App render error caught by ErrorBoundary:', error, info);
  }

  render() {
    const state = (this as any).state;
    if (state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold mb-4">Application failed to load</h2>
          <p className="mb-4">An unexpected error occurred while starting the app.</p>
          <pre className="text-left max-w-prose mx-auto mb-4 overflow-auto text-sm">{String(state.error)}</pre>
          <div>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={() => window.location.reload()}>
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children as any;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading message="Loading app..." />}>
        <AppContent />
      </Suspense>
    </ErrorBoundary>
  );
}
