/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Student } from './types.ts';

export const SCHOOL_CLASSES = [
  'S.1 A', 'S.1 B', 'S.1 C',
  'S.2 A', 'S.2 B', 'S.2 C',
  'S.3 A', 'S.3 B', 'S.3 C',
  'S.4 A', 'S.4 B', 'S.4 C',
  'S.5 Arts', 'S.5 Sciences',
  'S.6 Arts', 'S.6 Sciences'
];

export const INITIAL_STUDENTS: Student[] = [
  {
    id: 'stud-1',
    adminNo: 'ADM-2026-001',
    name: 'Liam Mwansa',
    gender: 'Male',
    gradeClass: 'S.4 A',
    boardingStatus: 'Hosteller',
    isCleared: true,
    gateClearanceDate: '2026-05-18',
    mealsClearanceDate: '2026-05-18',
    remarks: 'Full fees paid. Cleared for Term 3.',
  },
  {
    id: 'stud-2',
    adminNo: 'ADM-2026-002',
    name: 'Sarah Tembo',
    gender: 'Female',
    gradeClass: 'S.1 B',
    boardingStatus: 'Day Scholar',
    isCleared: false,
    gateClearanceDate: '2026-05-19',
    remarks: 'Day Scholar. Not eligible for subsidized school dinner meals, lunch only.',
  },
  {
    id: 'stud-3',
    adminNo: 'ADM-2026-003',
    name: 'Chipo Moyo',
    gender: 'Female',
    gradeClass: 'S.6 Arts',
    boardingStatus: 'Hosteller',
    isCleared: true,
    gateClearanceDate: '2026-05-15',
    mealsClearanceDate: '2026-05-15',
    remarks: 'Prefect clearance active.',
  },
  {
    id: 'stud-4',
    adminNo: 'ADM-2026-004',
    name: 'Fatima Diop',
    gender: 'Female',
    gradeClass: 'S.5 Sciences',
    boardingStatus: 'Hosteller',
    isCleared: false,
    mealsClearanceDate: '2026-05-20',
    remarks: 'Awaiting gate pass security review.',
  },
  {
    id: 'stud-5',
    adminNo: 'ADM-2026-005',
    name: 'Kofi Addo',
    gender: 'Male',
    gradeClass: 'S.2 C',
    boardingStatus: 'Day Scholar',
    isCleared: false,
    gateClearanceDate: '2026-05-20',
    remarks: 'Day scholar meal plan review on fee installment hold.',
  },
  {
    id: 'stud-6',
    adminNo: 'ADM-2026-006',
    name: 'Priya Patel',
    gender: 'Female',
    gradeClass: 'S.3 B',
    boardingStatus: 'Hosteller',
    isCleared: true,
    gateClearanceDate: '2026-05-17',
    mealsClearanceDate: '2026-05-17',
    remarks: 'Cleared by Accounts.',
  },
  {
    id: 'stud-7',
    adminNo: 'ADM-2026-007',
    name: 'Michael Chen',
    gender: 'Male',
    gradeClass: 'S.1 A',
    boardingStatus: 'Hosteller',
    isCleared: false,
    remarks: 'Registration hold active. Please refer student to Bursar office.',
  },
  {
    id: 'stud-8',
    adminNo: 'ADM-2026-008',
    name: 'Aminata Diallo',
    gender: 'Female',
    gradeClass: 'S.3 C',
    boardingStatus: 'Day Scholar',
    isCleared: true,
    gateClearanceDate: '2026-05-16',
    mealsClearanceDate: '2026-05-16',
    remarks: 'Special diet clearance approved.',
  },
  {
    id: 'stud-9',
    adminNo: 'ADM-2026-009',
    name: 'John Jackson',
    gender: 'Male',
    gradeClass: 'S.2 A',
    boardingStatus: 'Day Scholar',
    isCleared: false,
    gateClearanceDate: '2026-05-20',
    remarks: 'Fees clearance incomplete. Blocked from meal slip printing.',
  },
  {
    id: 'stud-10',
    adminNo: 'ADM-2026-010',
    name: 'Mercy Chepkoech',
    gender: 'Female',
    gradeClass: 'S.6 Sciences',
    boardingStatus: 'Hosteller',
    isCleared: true,
    gateClearanceDate: '2026-05-15',
    mealsClearanceDate: '2026-05-15',
    remarks: 'Outstanding sports captain.',
  },
  {
    id: 'stud-11',
    adminNo: 'ADM-2026-011',
    name: 'Daniel Nwachukwu',
    gender: 'Male',
    gradeClass: 'S.4 B',
    boardingStatus: 'Hosteller',
    isCleared: true,
    gateClearanceDate: '2026-05-19',
    mealsClearanceDate: '2026-05-19',
    remarks: 'Full term fee receipt #8902 verified.',
  },
  {
    id: 'stud-12',
    adminNo: 'ADM-2026-012',
    name: 'Tendai Mutasa',
    gender: 'Female',
    gradeClass: 'S.5 Arts',
    boardingStatus: 'Day Scholar',
    isCleared: false,
    mealsClearanceDate: '2026-05-20',
    remarks: 'Awaiting parent request letter.',
  }
];

const LOCAL_STORAGE_KEY = 'clearance_printer_students';

// IndexedDB Helper for high-capacity persistent storage in browser mode (prevents 5MB localStorage quota resets)
function getIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not available'));
    }
    const request = window.indexedDB.open('ClearancePrinterDB', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setIndexedDbItem(key: string, value: string): Promise<void> {
  try {
    const db = await getIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      const store = tx.objectStore('store');
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB write failed:', err);
  }
}

async function getIndexedDbItem(key: string): Promise<string | null> {
  try {
    const db = await getIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('store', 'readonly');
      const store = tx.objectStore('store');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB read failed:', err);
    return null;
  }
}

function readStudentsFromStorage(): string | null {
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.readDataSync) {
      const electronData = (window as any).electron.readDataSync('students');
      if (electronData) {
        return electronData;
      }
    }
  } catch (err) {
    console.warn('Unable to read students from Electron store:', err);
  }

  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY) ?? sessionStorage.getItem(LOCAL_STORAGE_KEY);
  } catch (e) {
    console.warn('Unable to access localStorage; trying sessionStorage fallback.', e);
    try {
      return sessionStorage.getItem(LOCAL_STORAGE_KEY);
    } catch (sessionErr) {
      console.error('Unable to access sessionStorage fallback for student data.', sessionErr);
    }
  }
  return null;
}

async function readStudentsFromStorageAsync(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.readData) {
      const electronData = await (window as any).electron.readData('students');
      if (electronData) {
        return electronData;
      }
    }
  } catch (err) {
    console.warn('Unable to read students from Electron store asynchronously:', err);
  }

  try {
    if (typeof window !== 'undefined' && (window as any).electron?.readDataSync) {
      const electronData = (window as any).electron.readDataSync('students');
      if (electronData) {
        return electronData;
      }
    }
  } catch (err) {
    // fallback
  }

  // Check localStorage first
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (local) return local;
  } catch (e) {
    // ignore
  }

  // Check IndexedDB next (high capacity persistent browser storage)
  try {
    const idbData = await getIndexedDbItem(LOCAL_STORAGE_KEY);
    if (idbData) return idbData;
  } catch (e) {
    // ignore
  }

  // Check sessionStorage fallback
  try {
    return sessionStorage.getItem(LOCAL_STORAGE_KEY);
  } catch (sessionErr) {
    console.error('Unable to access sessionStorage fallback for student data.', sessionErr);
  }
  return null;
}

export function getStudents(): Student[] {
  try {
    const data = readStudentsFromStorage();
    if (data) {
      const parsed = JSON.parse(data) as any[];
      return parsed.map(std => {
        let gender = std.gender;
        if (!gender && std.name) {
          const nameLower = std.name.toLowerCase();
          const femalePatterns = /\b(sarah|chipo|fatima|priya|aminata|mercy|tendai|rachel|racheal|reachel|rachele|mary|maria|marie|mariam|mariama|jane|grace|joyce|esther|ruth|doris|alice|beatrice|florence|rose|agnes|helen|evelyn|margaret|anne|anna|lucy|milly|clara|fiona|irene|gloria|winifred|judith|lillian|patricia|hannah|sharon|naomi|rebecca|miriam|tabitha|deborah|priscilla|phoebe|lydia|peace|hope|charity|faith|joy|providence|patience|comfort|blessing|vicky|victoria|elizabeth|edith|damaris|lynda|linda|brenda|shiela|sheila|tracy|stella|anitah|anita|dorcus|diana|daisy|jackline|jacqueline|daphine|daphne|peninah|proscoviya|proscovia|mrs|miss|lady|female|queen|hadassah|abigail|sandra|favour|loice|milika|naiga|nakato|babirye|namubiru|nankya|najjuma|nakanwagi|nakazibwe|namaganda|nsubuga|nanfuka|namutebi|nambi|nakasi|namara|natukunda|tumusiime|kemigisha|atukwatse|ankunda|kyomugisha|arinda|karungi|kabasinguzi|atwooki|abwooli|katusiime|asimwe|asiimwe|mbabazi|akiteng|amaro|apio|aceng|atyo|akello|awor|aber|anena|alomol|akurut|asijo|adong|alanyo|amit|akoli|among|amulen|aspen|rehema|hadija|fatuma|asha|zara|halima|shifa|mariana|zahra|layla|amina|yasmin|safia|zainab|khadija|rukayah|nuru|muna|warda|nadia|fatma|leila)\b/i;
          gender = femalePatterns.test(nameLower) ? 'Female' : 'Male';
        }
        return {
          ...std,
          gender: gender || 'Male'
        };
      });
    }
  } catch (e) {
    console.error('Failed to load students from storage:', e);
  }
  return INITIAL_STUDENTS;
}

export async function getStudentsAsync(): Promise<Student[]> {
  try {
    const data = await readStudentsFromStorageAsync();
    if (data) {
      const parsed = JSON.parse(data) as any[];
      return parsed.map(std => {
        let gender = std.gender;
        if (!gender && std.name) {
          const nameLower = std.name.toLowerCase();
          const femalePatterns = /\b(sarah|chipo|fatima|priya|aminata|mercy|tendai|rachel|racheal|reachel|rachele|mary|maria|marie|mariam|mariama|jane|grace|joyce|esther|ruth|doris|alice|beatrice|florence|rose|agnes|helen|evelyn|margaret|anne|anna|lucy|milly|clara|fiona|irene|gloria|winifred|judith|lillian|patricia|hannah|sharon|naomi|rebecca|miriam|tabitha|deborah|priscilla|phoebe|lydia|peace|hope|charity|faith|joy|providence|patience|comfort|blessing|vicky|victoria|elizabeth|edith|damaris|lynda|linda|brenda|shiela|sheila|tracy|stella|anitah|anita|dorcus|diana|daisy|jackline|jacqueline|daphine|daphne|peninah|proscoviya|proscovia|mrs|miss|lady|female|queen|hadassah|abigail|sandra|favour|loice|milika|naiga|nakato|babirye|namubiru|nankya|najjuma|nakanwagi|nakazibwe|namaganda|nsubuga|nanfuka|namutebi|nambi|nakasi|namara|natukunda|tumusiime|kemigisha|atukwatse|ankunda|kyomugisha|arinda|karungi|kabasinguzi|atwooki|abwooli|katusiime|asimwe|asiimwe|mbabazi|akiteng|amaro|apio|aceng|atyo|akello|awor|aber|anena|alomol|akurut|asijo|adong|alanyo|amit|akoli|among|amulen|aspen|rehema|hadija|fatuma|asha|zara|halima|shifa|mariana|zahra|layla|amina|yasmin|safia|zainab|khadija|rukayah|nuru|muna|warda|nadia|fatma|leila)\b/i;
          gender = femalePatterns.test(nameLower) ? 'Female' : 'Male';
        }
        return {
          ...std,
          gender: gender || 'Male'
        };
      });
    }
  } catch (e) {
    console.error('Failed to load students from storage asynchronously:', e);
  }
  return INITIAL_STUDENTS;
}

function sanitizeForStorage(students: Student[]): string {
  if (!Array.isArray(students)) return '[]';
  // Omit massive redundant base64 images from local storage cache to prevent local storage quota exhaustion and UI thread freezes
  const sanitized = students.map(s => {
    let p = s.photo;
    let po = s.photoOriginal;
    let pe = s.photoEnhanced;

    // Remove excessive temporary photo variants if too large, but keep main photo intact
    if (po && po.startsWith('data:image') && po.length > 500000) po = undefined;
    if (pe && pe.startsWith('data:image') && pe.length > 500000) pe = undefined;

    return {
      ...s,
      photo: p,
      photoOriginal: po,
      photoEnhanced: pe
    };
  });
  return JSON.stringify(sanitized);
}

export function saveStudents(students: Student[]): void {
  const payload = sanitizeForStorage(students);
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.writeDataSync) {
      (window as any).electron.writeDataSync('students', payload);
    }
  } catch (err) {
    console.warn('Unable to save students to Electron store:', err);
  }

  // Save asynchronously to IndexedDB in background
  setIndexedDbItem(LOCAL_STORAGE_KEY, payload).catch(e => console.warn('IndexedDB background sync failed:', e));

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    return;
  } catch (e) {
    console.warn('Unable to save student data to localStorage; attempting sessionStorage fallback.', e);
  }

  try {
    sessionStorage.setItem(LOCAL_STORAGE_KEY, payload);
  } catch (sessionErr) {
    console.error('Failed to save students to both localStorage and sessionStorage:', sessionErr);
  }
}

export async function saveStudentsAsync(students: Student[]): Promise<void> {
  const payload = sanitizeForStorage(students);
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.writeData) {
      await (window as any).electron.writeData('students', payload);
    }
  } catch (err) {
    console.warn('Unable to save students to Electron store asynchronously:', err);
  }

  // Always persist to IndexedDB for browser mode (supports hundreds of MBs, won't reset on tab refresh)
  await setIndexedDbItem(LOCAL_STORAGE_KEY, payload).catch(e => console.warn('IndexedDB save failed:', e));

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    return;
  } catch (e) {
    console.warn('Unable to save student data to localStorage; attempting sessionStorage fallback.', e);
  }

  try {
    sessionStorage.setItem(LOCAL_STORAGE_KEY, payload);
  } catch (sessionErr) {
    console.error('Failed to save students to both localStorage and sessionStorage:', sessionErr);
  }
}

