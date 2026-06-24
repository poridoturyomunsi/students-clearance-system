import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Trash2,
  Check,
  Loader2,
  Image as ImageIcon,
  HelpCircle,
  AlertTriangle,
  Settings,
  Plus,
  Play
} from 'lucide-react';
import { Student, BoardingStatus, NamingPattern } from '../types.ts';
import { SCHOOL_CLASSES } from '../data.ts';
import { parseSheetName, DEFAULT_NAMING_PATTERNS } from '../utils/excelParser.ts';

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

// Detect and parse class heading e.g. "SENIOR 4C", "S.4C", "Senior 4 C", "S.4 C", etc.
function parseClassHeading(text: string): string | null {
  if (!text) return null;
  const clean = text.trim().toLowerCase().replace(/\s+/g, ' ');
  
  // Matches "senior 4c", "senior 4 c", "s4c", "s.4c", "s.4 c", "s.5 sciences", "senior 5 sciences", etc.
  const regex = /^(?:senior|s\.?)\s*([1-6])\s*\.?\s*([a-c]|arts|sciences?|science)?$/;
  const match = clean.match(regex);
  if (match) {
    const num = match[1];
    let stream = match[2] || '';
    
    if (stream.includes('art')) {
      stream = 'Arts';
    } else if (stream.includes('science')) {
      stream = 'Sciences';
    } else {
      stream = stream.toUpperCase();
    }
    
    let standardName = '';
    if (['1', '2', '3', '4'].includes(num)) {
      if (!stream || !['A', 'B', 'C'].includes(stream)) {
        stream = 'A';
      }
      standardName = `S.${num} ${stream}`;
    } else {
      if (!stream || !['Arts', 'Sciences'].includes(stream)) {
        stream = 'Sciences';
      }
      standardName = `S.${num} ${stream}`;
    }
    
    if (SCHOOL_CLASSES.includes(standardName)) {
      return standardName;
    }
  }
  
  return null;
}

interface ZipPhoto {
  name: string; // "1.jpg"
  stem: string; // "1" (trimmed, normalized stem)
  dataUrl: string; // Base64 data URI
}

interface ExcelStudentRow {
  studentNo: string; // Raw input (e.g., "1" or "ADM-2026-123")
  name: string;
  gradeClass: string;
  gender: 'Male' | 'Female';
  boardingStatus: BoardingStatus;
  isCleared: boolean;
  sheetName?: string; // Workbook sheet source
  rowIndex?: number;
}

interface MatchCandidate {
  id: string; // Generated id
  rowIndex?: number; // Excel row number for validation display
  studentNo: string; // Key "1" or "ADM-2026-123"
  name: string;
  gradeClass: string;
  gender: 'Male' | 'Female';
  boardingStatus: BoardingStatus;
  isCleared: boolean;
  photoDataUrl?: string; // Assigned Base64
  photoFilename?: string; // e.g. "1.jpg"
  sheetName?: string; // Workbook sheet source
  errors?: string[];
}

interface ProcessedSheet {
  name: string; // Sheet name (e.g. "S.1A")
  detectedClass: string; // Standardized detected class e.g. "S.1 A" or empty
  studentCount: number;
  isValid: boolean;
}

interface BulkPhotoMatcherProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (newStudents: Student[]) => void;
  existingStudents: Student[];
}

export default function BulkPhotoMatcher({
  isOpen,
  onClose,
  onImport,
  existingStudents,
}: BulkPhotoMatcherProps) {
  // Main states
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  
  // Results
  const [students, setStudents] = useState<MatchCandidate[]>([]);
  const [invalidRows, setInvalidRows] = useState<MatchCandidate[]>([]);
  const [photos, setPhotos] = useState<ZipPhoto[]>([]);
  const [activeTab, setActiveTab] = useState<'matched' | 'missing' | 'unmatched'>('matched');

  // Duplication tracking states
  const [duplicates, setDuplicates] = useState<{ name: string; gradeClass: string; type: 'internal' | 'external' }[]>([]);
  const [statsSummary, setStatsSummary] = useState<{ totalFound: number; successCount: number; errorCount: number }>({
    totalFound: 0,
    successCount: 0,
    errorCount: 0
  });

  // Drag and drop helper states
  const [excelDragOver, setExcelDragOver] = useState<boolean>(false);
  const [zipDragOver, setZipDragOver] = useState<boolean>(false);

  // File Input Refs
  const excelInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Multi-Sheet & custom patterns states
  const [customPatterns, setCustomPatterns] = useState<NamingPattern[]>(() => {
    try {
      const saved = localStorage.getItem('clearance_custom_naming_patterns');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to load custom naming patterns:", e);
    }
    return [];
  });
  const [processedSheets, setProcessedSheets] = useState<ProcessedSheet[]>([]);
  const [showPatternsAdmin, setShowPatternsAdmin] = useState<boolean>(false);

  // New pattern form states
  const [newPatternName, setNewPatternName] = useState<string>('');
  const [newPatternRegex, setNewPatternRegex] = useState<string>('');
  const [newPatternClassGroup, setNewPatternClassGroup] = useState<number>(1);
  const [newPatternStreamGroup, setNewPatternStreamGroup] = useState<number>(2);

  // Real-time pattern test states
  const [testSheetName, setTestSheetName] = useState<string>('');
  const [testResult, setTestResult] = useState<string | null>(null);

  // Effect to handle real-time naming pattern validation tests
  React.useEffect(() => {
    if (!testSheetName.trim() || !newPatternRegex.trim()) {
      setTestResult(null);
      return;
    }
    try {
      const testPat: NamingPattern = {
        id: 'test',
        name: 'test',
        pattern: newPatternRegex,
        classGroup: newPatternClassGroup,
        streamGroup: newPatternStreamGroup,
        isSystem: false
      };
      const parsed = parseSheetName(testSheetName, [testPat]);
      if (parsed) {
        setTestResult(`✓ Match success! Detected: Class = ${parsed.className}, Stream = ${parsed.streamName} (${parsed.gradeClass})`);
      } else {
        setTestResult('✖ Mismatched. Check capture groups or regular expression syntax.');
      }
    } catch (e) {
      setTestResult(`✖ Invalid regular expression syntax: ${(e as Error).message}`);
    }
  }, [testSheetName, newPatternRegex, newPatternClassGroup, newPatternStreamGroup]);

  if (!isOpen) return null;

  // Normalizes a string for matching purposes (cleans whitespace, converts to lowercase)
  const normalizeKey = (str: string): string => {
    return str.toString().trim().toLowerCase().replace(/\s+/g, '');
  };

  const handleExcelDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setExcelDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      setExcelFile(file);
      setErrorMsg(null);
    } else {
      setErrorMsg('Invalid spreadsheet format. Please upload an Excel (.xlsx, .xls) or CSV file.');
    }
  };

  const handleZipDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZipDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.zip') || file.type.includes('zip'))) {
      setZipFile(file);
      setErrorMsg(null);
    } else {
      setErrorMsg('Invalid archive format. Please upload a ZIP folder containing student photos.');
    }
  };

  // Perform processing
  const startMatching = async () => {
    if (!excelFile) {
      setErrorMsg('Please upload the student list spreadsheet.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setStatusText('Reading Excel student spreadsheet...');

    try {
      // 1. Process Excel
      const { rows: excelData, sheets: sheetsList } = await readExcel(excelFile);
      if (excelData.length === 0) {
        throw new Error('No students detected in the spreadsheet. Please check columns and formatting.');
      }

      setProcessedSheets(sheetsList);

      // 2. Process Zip if provided
      let zipPhotos = [];
      if (zipFile) {
        setStatusText('Extracting zipped photos (this might take a few seconds)...');
        zipPhotos = await readZip(zipFile);
      }

      // 3. Match
      setStatusText(zipFile ? 'Running matching algorithms...' : 'Processing spreadsheet records...');
      const results: MatchCandidate[] = [];
      const invalidRows: MatchCandidate[] = [];
      const usedPhotoStems = new Set<string>();
      const dups: { name: string; gradeClass: string; type: 'internal' | 'external' }[] = [];
      const seenInternalNameClasses = new Set<string>();
      const seenInternalNums = new Set<string>();

      // Pre-index existing students for O(1) matching and duplicate checks
      const existingByAdmin = new Map<string, Student>();
      const existingByNameClass = new Map<string, Student>();
      existingStudents.forEach(s => {
        const sAdmin = normalizeKey(s.adminNo);
        if (sAdmin) {
          existingByAdmin.set(sAdmin, s);
        }
        const sNameClass = `${normalizeKey(s.name)}|${normalizeKey(s.gradeClass)}`;
        if (sNameClass) {
          existingByNameClass.set(sNameClass, s);
        }
        if (Array.isArray(s.aliases)) {
          s.aliases.forEach(alias => {
            const aliasKey = `${normalizeKey(alias)}|${normalizeKey(s.gradeClass)}`;
            if (aliasKey) {
              existingByNameClass.set(aliasKey, s);
            }
          });
        }
      });

      // Pre-index photos for O(1) matching
      const photosByStem = new Map<string, ZipPhoto>();
      zipPhotos.forEach(p => {
        const stemNorm = normalizeKey(p.stem);
        if (stemNorm) {
          photosByStem.set(stemNorm, p);
        }
      });

      excelData.forEach((row, index) => {
        const rowIndex = row.rowIndex || index + 1;
        const normName = normalizeKey(row.name || '');
        const normStudentNo = normalizeKey(row.studentNo || '');
        const nameClassKey = `${normName}|${normalizeKey(row.gradeClass || '')}`;

        const errors: string[] = [];
        if (!row.studentNo) {
          errors.push('Missing StudentNo');
        }
        if (!row.name) {
          errors.push('Missing Name');
        }
        if (!row.gradeClass) {
          errors.push('Missing Class/Stream');
        }
        if (!row.boardingStatus) {
          errors.push('Missing Boarding Status');
        }

        if (errors.length > 0) {
          invalidRows.push({
            id: `invalid-${Date.now()}-${index}`,
            rowIndex,
            studentNo: row.studentNo || '',
            name: row.name || '',
            gradeClass: row.gradeClass || '',
            gender: row.gender || 'Male',
            boardingStatus: row.boardingStatus || 'Boarder',
            isCleared: row.isCleared,
            sheetName: row.sheetName,
            errors
          });
          return;
        }

        // A. Internal duplicate check (same studentNo or same name inside the same class/stream in imported workbook)
        if (seenInternalNameClasses.has(nameClassKey) || (normStudentNo && seenInternalNums.has(normStudentNo))) {
          dups.push({ name: row.name, gradeClass: row.gradeClass, type: 'internal' });
          return;
        }

        // B. External duplicate check (same name inside the same class/stream in database)
        if (existingByNameClass.has(nameClassKey)) {
          dups.push({ name: row.name, gradeClass: row.gradeClass, type: 'external' });
          return;
        }

        const matchedPhoto = normStudentNo ? photosByStem.get(normStudentNo) : undefined;

        seenInternalNameClasses.add(nameClassKey);
        if (normStudentNo) seenInternalNums.add(normStudentNo);

        const candidate: MatchCandidate = {
          id: `bulk-${Date.now()}-${index}`,
          rowIndex,
          studentNo: row.studentNo,
          name: row.name,
          gradeClass: row.gradeClass,
          gender: row.gender,
          boardingStatus: row.boardingStatus,
          isCleared: row.isCleared,
          sheetName: row.sheetName
        };

        if (matchedPhoto) {
          candidate.photoDataUrl = matchedPhoto.dataUrl;
          candidate.photoFilename = matchedPhoto.name;
          usedPhotoStems.add(normalizeKey(matchedPhoto.stem));
        }

        results.push(candidate);
      });

      setStudents(results);
      setInvalidRows(invalidRows);
      setPhotos(zipPhotos);
      setDuplicates(dups);
      setStatsSummary({
        totalFound: excelData.length,
        successCount: results.length,
        errorCount: dups.length + invalidRows.length
      });
      setIsProcessing(false);
      
      // Default tab to missing if no zip was provided or if we imported list only
      if (!zipFile) {
        setActiveTab('missing');
      } else {
        setActiveTab(results.some(r => r.photoDataUrl) ? 'matched' : 'missing');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Failed to match rosters. Verify spreadsheet structure.');
      setIsProcessing(false);
    }
  };

  // Extract Zip Photos using JSZip
  const readZip = (file: File): Promise<ZipPhoto[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const zip = await JSZip.loadAsync(buffer);
          const results: ZipPhoto[] = [];

          // Scan through zip keys
          const files = Object.keys(zip.files);
          let index = 0;
          for (const filename of files) {
            const fileEntry = zip.files[filename];
            
            // Ignore directory entries, macOS metadata (e.g., __MACOSX), and non-images
            if (
              fileEntry.dir || 
              filename.includes('__MACOSX') || 
              !(filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.png') || filename.toLowerCase().endsWith('.jpeg'))
            ) {
              continue;
            }

            index++;
            setStatusText(`Processing photo ZIP archive (${index}/${files.length})...`);
            
            // Convert file to Base64
            const base64Data = await fileEntry.async('base64');
            const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            const dataUrl = `data:${mimeType};base64,${base64Data}`;

            // Clean stem (extract file name without extension)
            const baseName = filename.split('/').pop() || '';
            const lastDotIdx = baseName.lastIndexOf('.');
            const stem = lastDotIdx !== -1 ? baseName.substring(0, lastDotIdx) : baseName;

            results.push({
              name: baseName,
              stem: stem.trim(),
              dataUrl
            });
          }
          resolve(results);
        } catch (err) {
          reject(new Error('Zip format corrupted or unsupported. Ensure files inside are valid images.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read photo ZIP file.'));
      reader.readAsArrayBuffer(file);
    });
  };
  // Parse Excel workbook containing multiple sheets
  const readExcel = (file: File): Promise<{ rows: ExcelStudentRow[]; sheets: ProcessedSheet[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames.length) {
            throw new Error('Empty spreadsheet Workbook');
          }

          const allRows: ExcelStudentRow[] = [];
          const sheetsList: ProcessedSheet[] = [];

          workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetArr = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

            if (sheetArr.length === 0) {
              sheetsList.push({
                name: sheetName,
                detectedClass: '',
                studentCount: 0,
                isValid: false
              });
              return;
            }

            // Detect if this sheet name maps to a class/stream
            const parsedInfo = parseSheetName(sheetName, customPatterns);
            const detectedClass = parsedInfo ? parsedInfo.gradeClass : '';

            // Detect if layout is Heading-based or Tabular
            let hasClassHeadings = false;
            for (let i = 0; i < Math.min(20, sheetArr.length); i++) {
              const firstCell = sheetArr[i]?.[0];
              if (firstCell && typeof firstCell === 'string' && parseClassHeading(firstCell)) {
                hasClassHeadings = true;
                break;
              }
            }

            const sheetRows: ExcelStudentRow[] = [];
            let activeClass = detectedClass || 'S.1 A'; // fallback if no sheet name mapped and no headings found

            if (hasClassHeadings) {
              for (let i = 0; i < sheetArr.length; i++) {
                const row = sheetArr[i];
                if (!row || row.length === 0) continue;
                
                const cellVal = row[0] !== undefined ? String(row[0]).trim() : '';
                if (!cellVal) continue;
                
                const matchedHeading = parseClassHeading(cellVal);
                if (matchedHeading) {
                  activeClass = matchedHeading;
                } else {
                  const lowerCell = cellVal.toLowerCase();
                  if (lowerCell === 'student name' || lowerCell === 'names' || lowerCell === 'name' || lowerCell === 'student list') {
                    continue;
                  }
                  
                  const number = `B-${existingStudents ? existingStudents.length + allRows.length + sheetRows.length + 1 : allRows.length + sheetRows.length + 1}`;
                  let gender: 'Male' | 'Female' = 'Male';
                  const femalePatterns = /\b(sarah|chipo|fatima|priya|aminata|mercy|tendai|rachel|racheal|reachel|rachele|mary|maria|marie|mariam|mariama|jane|grace|joyce|esther|ruth|doris|alice|beatrice|florence|rose|agnes|helen|evelyn|margaret|anne|anna|lucy|milly|clara|fiona|irene|gloria|winifred|judith|lillian|patricia|hannah|sharon|naomi|rebecca|miriam|tabitha|deborah|priscilla|phoebe|lydia|peace|hope|charity|faith|joy|providence|patience|comfort|blessing|vicky|victoria|elizabeth|edith|damaris|lynda|linda|brenda|shiela|sheila|tracy|stella|anitah|anita|dorcus|diana|daisy|jackline|jacqueline|daphine|daphne|peninah|proscoviya|proscovia|mrs|miss|lady|female|queen|hadassah|abigail|sandra|favour|loice|milika|naiga|nakato|babirye|namubiru|nankya|najjuma|nakanwagi|nakazibwe|namaganda|nsubuga|nanfuka|namutebi|nambi|nakasi|namara|natukunda|tumusiime|kemigisha|atukwatse|ankunda|kyomugisha|arinda|karungi|kabasinguzi|atwooki|abwooli|katusiime|asimwe|asiimwe|mbabazi|akiteng|amaro|apio|aceng|atyo|akello|awor|aber|anena|alomol|akurut|asijo|adong|alanyo|amit|akoli|among|amulen|aspen|rehema|hadija|fatuma|asha|zara|halima|shifa|mariana|zahra|layla|amina|yasmin|safia|zainab|khadija|rukayah|nuru|muna|warda|nadia|fatma|leila)\b/i;
                  if (femalePatterns.test(cellVal.toLowerCase())) {
                    gender = 'Female';
                  }
                  
                  sheetRows.push({
                    studentNo: number,
                    name: cellVal,
                    gradeClass: activeClass,
                    gender,
                    boardingStatus: 'Boarder',
                    isCleared: false,
                    sheetName
                  });
                }
              }
            } else {
              // Standard Tabular column parser
              let studentNoIdx = -1;
              let nameIdx = -1;
              let classIdx = -1;
              let streamIdx = -1;
              let genderIdx = -1;
              let boardingIdx = -1;
              let statusIdx = -1;

              let headerRowIdx = 0;
              for (let r = 0; r < Math.min(3, sheetArr.length); r++) {
                const row = sheetArr[r];
                const isHeader = row.some(cell => {
                  if (typeof cell !== 'string') return false;
                  const cl = cell.toLowerCase().trim();
                  return cl.includes('studentno') || cl.includes('student no') || cl.includes('name') || cl.includes('class') || cl.includes('grade') || cl.includes('stream') || cl.includes('gender') || cl.includes('boarding') || cl.includes('boardingstatus');
                });
                if (isHeader) {
                  headerRowIdx = r;
                  break;
                }
              }

              const header = sheetArr[headerRowIdx];
              header.forEach((cell, idx) => {
                if (typeof cell !== 'string') return;
                const cl = cell.toLowerCase().trim();
                if (cl === 'studentno' || cl === 'student no' || cl === 'student number' || cl === 'student id' || cl === 'id' || cl === 'adm' || cl === 'admission' || cl === 'admission number' || cl === 'number' || cl === 'no' || cl === 'num' || cl === 'serial' || cl === 'code') {
                  studentNoIdx = idx;
                } else if (cl.includes('name') || cl.includes('student') || cl === 'full name') {
                  nameIdx = idx;
                } else if (cl.includes('class') || cl.includes('grade') || cl.includes('form')) {
                  classIdx = idx;
                } else if (cl.includes('stream')) {
                  streamIdx = idx;
                } else if (cl.includes('gender') || cl.includes('sex')) {
                  genderIdx = idx;
                } else if (cl.includes('boarding')) {
                  boardingIdx = idx;
                } else if (cl.includes('status') || cl.includes('clear') || cl.includes('state') || cl.includes('active')) {
                  statusIdx = idx;
                }
              });

              if (studentNoIdx === -1) studentNoIdx = 0;
              if (nameIdx === -1) nameIdx = 1;
              if (classIdx === -1) classIdx = 2;
              if (genderIdx === -1) genderIdx = 4;
              if (boardingIdx === -1) boardingIdx = 5;
              if (statusIdx === -1) statusIdx = 6;

              const startIdx = headerRowIdx + 1;
              for (let i = startIdx; i < sheetArr.length; i++) {
                const row = sheetArr[i];
                if (!row || row.length === 0) continue;

                const rowNumberLabel = i + 1;
                const studentNo = row[studentNoIdx] !== undefined ? String(row[studentNoIdx]).trim() : '';
                const name = row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
                const classRaw = row[classIdx] !== undefined ? String(row[classIdx]).trim() : '';
                const streamRaw = row[streamIdx] !== undefined ? String(row[streamIdx]).trim() : '';
                const genderRaw = row[genderIdx] !== undefined ? String(row[genderIdx]).trim() : '';
                const boardingRaw = row[boardingIdx] !== undefined ? String(row[boardingIdx]).trim() : '';
                const statusRaw = row[statusIdx] !== undefined ? String(row[statusIdx]).trim() : '';

                if (!studentNo && !name && !classRaw && !streamRaw) {
                  continue;
                }

                const errors: string[] = [];
                if (!studentNo) {
                  errors.push('Missing StudentNo');
                }
                if (!name) {
                  errors.push('Missing Name');
                }

                let gradeClass = activeClass;
                if (classRaw) {
                  gradeClass = normalizeGradeClass(streamRaw ? `${classRaw} ${streamRaw}` : classRaw);
                } else if (streamRaw && !activeClass) {
                  gradeClass = normalizeGradeClass(streamRaw);
                }
                if (!gradeClass) {
                  errors.push('Missing or invalid Class/Stream');
                }

                let gender: 'Male' | 'Female' = 'Male';
                if (genderRaw) {
                  const genStr = genderRaw.toLowerCase();
                  if (genStr === 'female' || genStr === 'f' || genStr === 'girl') {
                    gender = 'Female';
                  }
                } else {
                  const femalePatterns = /\b(sarah|chipo|fatima|priya|aminata|mercy|tendai|rachel|racheal|reachel|rachele|mary|maria|marie|mariam|mariama|jane|grace|joyce|esther|ruth|doris|alice|beatrice|florence|rose|agnes|helen|evelyn|margaret|anne|anna|lucy|milly|clara|fiona|irene|gloria|winifred|judith|lillian|patricia|hannah|sharon|naomi|rebecca|miriam|tabitha|deborah|priscilla|phoebe|lydia|peace|hope|charity|faith|joy|providence|patience|comfort|blessing|vicky|victoria|elizabeth|edith|damaris|lynda|linda|brenda|shiela|sheila|tracy|stella|anitah|anita|dorcus|diana|daisy|jackline|jacqueline|daphine|daphne|peninah|proscoviya|proscovia|mrs|miss|lady|female|queen|hadassah|abigail|sandra|favour|loice|milika|naiga|nakato|babirye|namubiru|nankya|najjuma|nakanwagi|nakazibwe|namaganda|nsubuga|nanfuka|namutebi|nambi|nakasi|namara|natukunda|tumusiime|kemigisha|atukwatse|ankunda|kyomugisha|arinda|karungi|kabasinguzi|atwooki|abwooli|katusiime|asimwe|asiimwe|mbabazi|akiteng|amaro|apio|aceng|atyo|akello|awor|aber|anena|alomol|akurut|asijo|adong|alanyo|amit|akoli|among|amulen|aspen|rehema|hadija|fatuma|asha|zara|halima|shifa|mariana|zahra|layla|amina|yasmin|safia|zainab|khadija|rukayah|nuru|muna|warda|nadia|fatma|leila)\b/i;
                  if (femalePatterns.test(name.toLowerCase())) {
                    gender = 'Female';
                  }
                }

                let boardingStatus: BoardingStatus = 'Boarder';
                if (boardingRaw) {
                  const b = boardingRaw.toLowerCase();
                  if (b.includes('day')) {
                    boardingStatus = 'Day Scholar';
                  }
                }

                const isCleared = statusRaw ? (statusRaw.toLowerCase().includes('clear') || statusRaw === 'yes' || statusRaw === 'true' || statusRaw === '1') : false;



                const rowItem: ExcelStudentRow = {
                  studentNo,
                  name,
                  gradeClass,
                  gender,
                  boardingStatus,
                  isCleared,
                  sheetName,
                  rowIndex: rowNumberLabel
                };

                sheetRows.push(rowItem);
              }
            }

            allRows.push(...sheetRows);
            sheetsList.push({
              name: sheetName,
              detectedClass: detectedClass,
              studentCount: sheetRows.length,
              isValid: !!detectedClass || sheetRows.length === 0
            });
          });

          resolve({ rows: allRows, sheets: sheetsList });
        } catch (err) {
          reject(new Error('Excel format invalid. Please upload a standard xlsx sheet file.'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading Excel spreadsheet.'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Reset Matches
  const handleReset = () => {
    setExcelFile(null);
    setZipFile(null);
    setStudents([]);
    setPhotos([]);
    setDuplicates([]);
    setProcessedSheets([]);
    setStatsSummary({ totalFound: 0, successCount: 0, errorCount: 0 });
    setErrorMsg(null);
    if (excelInputRef.current) excelInputRef.current.value = '';
    if (zipInputRef.current) zipInputRef.current.value = '';
  };

  const handleSheetOverride = (sheetName: string, selectedClass: string) => {
    setProcessedSheets(prev => prev.map(s => {
      if (s.name === sheetName) {
        return {
          ...s,
          detectedClass: selectedClass,
          isValid: true
        };
      }
      return s;
    }));

    // Update students belonging to this sheet
    setStudents(prev => prev.map(std => {
      if (std.sheetName === sheetName) {
        return {
          ...std,
          gradeClass: selectedClass
        };
      }
      return std;
    }));
  };

  const handleAddPattern = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatternName.trim() || !newPatternRegex.trim()) {
      alert("Please fill in the pattern name and regular expression.");
      return;
    }
    try {
      new RegExp(newPatternRegex); // test if it compiles
    } catch (err) {
      alert(`Invalid regex syntax: ${(err as Error).message}`);
      return;
    }

    const nextPat: NamingPattern = {
      id: `pat-${Date.now()}`,
      name: newPatternName.trim(),
      pattern: newPatternRegex.trim(),
      classGroup: newPatternClassGroup,
      streamGroup: newPatternStreamGroup,
      isSystem: false
    };

    const nextList = [...customPatterns, nextPat];
    setCustomPatterns(nextList);
    localStorage.setItem('clearance_custom_naming_patterns', JSON.stringify(nextList));

    // Reset form
    setNewPatternName('');
    setNewPatternRegex('');
    setNewPatternClassGroup(1);
    setNewPatternStreamGroup(2);
    setTestSheetName('');
    setTestResult(null);
  };

  const handleDeletePattern = (id: string) => {
    const nextList = customPatterns.filter(p => p.id !== id);
    setCustomPatterns(nextList);
    localStorage.setItem('clearance_custom_naming_patterns', JSON.stringify(nextList));
  };

  // Tab calculations
  const matchedStudents = Array.isArray(students) ? students.filter(s => !!s.photoDataUrl) : [];
  const missingStudents = Array.isArray(students) ? students.filter(s => !s.photoDataUrl) : [];
  
  // Find photos in ZIP that are not matched to any active candidate
  const matchedPhotoNames = new Set(Array.isArray(matchedStudents) ? matchedStudents.map(m => m.photoFilename) : []);
  const unmatchedPhotos = photos.filter(p => !matchedPhotoNames.has(p.name));

  // Manual Correction: Assign an unmatched photo to a missing student
  const assignPhoto = (studentId: string, photo: ZipPhoto) => {
    setStudents(prev => Array.isArray(prev) ? prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          photoDataUrl: photo.dataUrl,
          photoFilename: photo.name
        };
      }
      return s;
    }) : (prev || []));
  };

  // Manual Correction: Remove photo assignment
  const removePhoto = (studentId: string) => {
    setStudents(prev => Array.isArray(prev) ? prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          photoDataUrl: undefined,
          photoFilename: undefined
        };
      }
      return s;
    }) : (prev || []));
  };

  // Manual Correction: Hand-upload a single photo for a student
  const handleLocalPhotoUpload = (studentId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target?.result as string;
      setStudents(prev => Array.isArray(prev) ? prev.map(s => {
        if (s.id === studentId) {
          return {
            ...s,
            photoDataUrl: b64,
            photoFilename: file.name
          };
        }
        return s;
      }) : (prev || []));
    };
    reader.readAsDataURL(file);
  };

  // Perform Final Save And Sync
  const handleSaveAll = () => {
    if (students.length === 0) return;

    // Check for unmapped sheets with students
    const unmappedSheets = processedSheets.filter(s => !s.detectedClass && s.studentCount > 0);
    if (unmappedSheets.length > 0) {
      const sheetNamesStr = unmappedSheets.map(s => ` - ${s.name} (${s.studentCount} students)`).join('\n');
      const confirmSave = window.confirm(
        `Warning: The following sheet(s) have not been mapped to any class:\n\n${sheetNamesStr}\n\n` +
        `Students in these sheets will be assigned to fallback class S.1 A if you proceed. Do you want to continue importing?`
      );
      if (!confirmSave) return;
    }

    const formattedList: Student[] = Array.isArray(students) ? students.map((c: any, index) => {
      const today = new Date().toISOString().split('T')[0];
      return {
        id: `stud-bulk-${Date.now()}-${index}`,
        adminNo: c.studentNo,
        name: c.name,
        gender: c.gender,
        gradeClass: c.gradeClass,
        boardingStatus: c.boardingStatus || 'Boarder',
        isCleared: c.isCleared,
        gateClearanceDate: c.isCleared ? today : undefined,
        mealsClearanceDate: c.isCleared ? today : undefined,
        remarks: 'Batch imported via Bulk Spreadsheet & Photo Matcher.',
        photo: c.photoDataUrl,
      };
    }) : [];

    onImport(formattedList);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Numeric Bulk Spreadsheet &amp; Photo ZIP Matcher
            </h2>
            <p className="text-[10px] text-slate-400 mt-1">
              Upload Excel rosters and zipped student photos to automatically associate them using the Excel Number column.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 px-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-100 bg-slate-900 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WORKSPACE AREA */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-slate-900">
          
          {/* STEP 1: UPLOAD STATE */}
          {students.length === 0 && (
            <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full py-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* EXCEL CARD */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setExcelDragOver(true); }}
                  onDragLeave={() => setExcelDragOver(false)}
                  onDrop={handleExcelDrop}
                  onClick={() => excelInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150 relative ${
                    excelFile 
                      ? 'border-emerald-500/80 bg-emerald-950/10' 
                      : excelDragOver 
                        ? 'border-indigo-400 bg-slate-800/40' 
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/60'
                  }`}
                >
                  <input
                    type="file"
                    ref={excelInputRef}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setExcelFile(file);
                    }}
                  />
                  <FileSpreadsheet className={`w-12 h-12 mb-4 ${excelFile ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                    {excelFile ? 'Roster Sheet Loaded' : 'Upload Student Spreadsheet'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-2 max-w-xs leading-relaxed">
                    Select or drag &amp; drop your student roster file (<strong className="text-slate-300 font-mono">.xlsx, .xls, .csv</strong>)
                  </p>
                  
                  {excelFile && (
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[10px] font-semibold bg-emerald-900/35 border border-emerald-800/60 text-emerald-300 py-1 px-2.5 rounded-md">
                      <span className="truncate">{excelFile.name}</span>
                      <span className="shrink-0 font-mono">{(excelFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                  )}
                </div>

                {/* ZIP CARD */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setZipDragOver(true); }}
                  onDragLeave={() => setZipDragOver(false)}
                  onDrop={handleZipDrop}
                  onClick={() => zipInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150 relative ${
                    zipFile 
                      ? 'border-emerald-500/80 bg-emerald-950/10' 
                      : zipDragOver 
                        ? 'border-indigo-400 bg-slate-800/40' 
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/60'
                  }`}
                >
                  <input
                    type="file"
                    ref={zipInputRef}
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setZipFile(file);
                    }}
                  />
                  <FileArchive className={`w-12 h-12 mb-4 ${zipFile ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                    {zipFile ? 'Photo ZIP Loaded' : 'Upload Photos ZIP Folder (Optional)'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-2 max-w-xs leading-relaxed">
                    Optional. Drag &amp; drop a ZIP containing photos named by student number (<strong className="text-slate-300 font-mono">e.g. 1.jpg, 2.png</strong>). Leave blank if importing roster text only.
                  </p>
                  
                  {zipFile && (
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[10px] font-semibold bg-emerald-900/35 border border-emerald-800/60 text-emerald-300 py-1 px-2.5 rounded-md">
                      <span className="truncate">{zipFile.name}</span>
                      <span className="shrink-0 font-mono">{(zipFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                  )}
                </div>

              </div>

              {/* NAMING PATTERNS ACCORDION TOGGLER */}
              <div className="flex justify-center shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPatternsAdmin(!showPatternsAdmin)}
                  className={`px-4 py-2 border rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                    showPatternsAdmin 
                      ? 'bg-indigo-955 border-indigo-500 text-indigo-300' 
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  {showPatternsAdmin ? 'Hide Custom Naming Settings' : 'Configure Class Naming Rules'}
                </button>
              </div>

              {/* NAMING PATTERNS ADMINISTRATION DASHBOARD */}
              {showPatternsAdmin && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-indigo-400" />
                      Roster Sheets Naming Pattern Rules
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      Configure regular expression rules to automatically match S-Class and Stream names from the Excel sheet tabs. Spelled-out numeral indicators like "One" to "Six" are translated automatically.
                    </p>
                  </div>

                  {/* Active list */}
                  <div className="max-h-48 overflow-y-auto border border-slate-850 bg-slate-900/40 rounded-lg p-2 divide-y divide-slate-855">
                    {[...customPatterns, ...DEFAULT_NAMING_PATTERNS].map((pat) => (
                      <div key={pat.id} className="py-2.5 flex justify-between items-center text-[10.5px] font-sans">
                        <div className="min-w-0">
                          <span className="font-extrabold text-slate-200 block truncate leading-snug">{pat.name}</span>
                          <span className="font-mono text-[9px] text-slate-500 block select-all mt-0.5">{pat.pattern}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4 font-mono text-[8.5px]">
                          <span className="bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400">Class: G{pat.classGroup}</span>
                          <span className="bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400">Stream: G{pat.streamGroup}</span>
                          
                          {pat.isSystem ? (
                            <span className="bg-indigo-950 border border-indigo-900 text-indigo-400 px-1.5 py-0.5 rounded font-black font-sans text-[8px] uppercase">Default</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeletePattern(pat.id)}
                              className="text-rose-400 hover:text-rose-350 p-1 hover:bg-rose-955 rounded cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add rule form */}
                  <form onSubmit={handleAddPattern} className="border-t border-slate-850 pt-4 flex flex-col gap-3">
                    <span className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-wider">Add New Mapping Pattern:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 font-bold uppercase font-mono">Rule Title:</label>
                        <input
                          type="text"
                          required
                          value={newPatternName}
                          onChange={(e) => setNewPatternName(e.target.value)}
                          placeholder="e.g., S.1 Form A"
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="text-[9px] text-slate-500 font-bold uppercase font-mono">Regex Pattern Pattern (RegExp):</label>
                        <input
                          type="text"
                          required
                          value={newPatternRegex}
                          onChange={(e) => setNewPatternRegex(e.target.value)}
                          placeholder="e.g. ^Senior-([1-6])-([A-C])$"
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 font-bold uppercase font-mono">Class Group Index:</label>
                        <select
                          value={newPatternClassGroup}
                          onChange={(e) => setNewPatternClassGroup(Number(e.target.value))}
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer focus:border-indigo-500"
                        >
                          <option value={1}>Group 1 (First match)</option>
                          <option value={2}>Group 2 (Second match)</option>
                          <option value={3}>Group 3 (Third match)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 font-bold uppercase font-mono">Stream Group Index:</label>
                        <select
                          value={newPatternStreamGroup}
                          onChange={(e) => setNewPatternStreamGroup(Number(e.target.value))}
                          className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer focus:border-indigo-500"
                        >
                          <option value={1}>Group 1 (First match)</option>
                          <option value={2}>Group 2 (Second match)</option>
                          <option value={3}>Group 3 (Third match)</option>
                        </select>
                      </div>

                      {/* Live Pattern Test Bench */}
                      <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-[9px] text-indigo-400 font-bold uppercase font-mono">Live Regex Testbench:</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={testSheetName}
                            onChange={(e) => setTestSheetName(e.target.value)}
                            placeholder="Type test sheet name, e.g. Senior-4-C"
                            className="flex-1 bg-slate-900 border border-indigo-950/40 rounded px-2 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="submit"
                            className="bg-indigo-650 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-wider px-4 rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" /> Save Rule
                          </button>
                        </div>
                      </div>
                    </div>

                    {testResult && (
                      <div className={`text-[10px] leading-snug px-3 py-1.5 rounded-lg border font-mono ${
                        testResult.startsWith('✓') 
                          ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400' 
                          : 'bg-rose-950/30 border-rose-900/40 text-rose-400'
                      }`}>
                        {testResult}
                      </div>
                    )}
                  </form>
                </div>
              )}

              {/* TUTORIAL INFO */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex gap-3 text-[11px] leading-relaxed text-slate-300">
                <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex-1 flex flex-col gap-1">
                  <span className="font-sans font-bold uppercase tracking-wider text-indigo-300 text-[10px]">How Bulk Auto-Matching Works:</span>
                  <p>
                    Ensure your Excel spreadsheet has a column capturing student sequences (e.g., <strong className="text-slate-100">"1", "2"</strong>, etc. or <strong className="text-slate-100">"ADM-2026-004"</strong>). Store student pictures directly in a ZIP file using matched filenames: e.g. <strong className="text-slate-100 font-mono">"1.jpg"</strong>, <strong className="text-slate-100 font-mono">"2.png"</strong>. The system ignores file extensions, cases, and spacing issues dynamically!
                  </p>
                </div>
              </div>

              {/* TRIGGER PROCESS COMPONENT */}
              <div className="flex flex-col gap-3 items-center justify-center mt-4">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <span className="text-xs font-bold text-slate-400 font-mono animate-pulse">{statusText}</span>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={!excelFile && !zipFile}
                      onClick={handleReset}
                      className="px-4 py-2 hover:bg-slate-850 text-slate-400 border border-slate-800 hover:border-slate-700 uppercase tracking-widest font-black text-[10px] rounded-lg cursor-pointer transition-all disabled:opacity-40"
                    >
                      Clear Uploads
                    </button>
                    <button
                      type="button"
                      onClick={startMatching}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest rounded-lg transition-all shadow-md  cursor-pointer"
                    >
                      {zipFile ? 'Generate Matches' : 'Process Spreadsheet'}
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <p className="text-xs font-semibold text-rose-400 bg-rose-950/20 py-2.5 px-4 rounded-lg border border-rose-900/40 text-center max-w-lg mt-3">
                    {errorMsg}
                  </p>
                )}
              </div>

            </div>
          )}

          {/* STEP 2: RESULTS PREVIEW & CORRECTION */}
          {(students.length > 0 || invalidRows.length > 0) && (
            <div className="space-y-6 flex-1 flex flex-col overflow-hidden h-full">
              
              {/* BENTO STATS SUMMARY */}
              {!zipFile ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  <div className="p-3 bg-slate-900 border border-slate-800/50 rounded-lg flex flex-col justify-between">
                    <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-wider">Total Found in Sheet</span>
                    <div className="text-xl font-black text-slate-200 mt-1">{statsSummary.totalFound} Students</div>
                  </div>
                  <div className="p-3 bg-emerald-950/20 border border-emerald-900/20 rounded-lg flex flex-col justify-between">
                    <span className="text-[9px] font-bold text-emerald-400 uppercase font-mono tracking-wider">Successfully Parsed</span>
                    <div className="text-xl font-black text-emerald-300 mt-1">{statsSummary.successCount} Students</div>
                    <span className="text-[8.5px] text-slate-400 font-medium">Ready to import (no duplicates)</span>
                  </div>
                  <div className={`p-3 rounded-lg flex flex-col justify-between ${
                    statsSummary.errorCount > 0 
                      ? 'bg-amber-950/25 border border-amber-900/30' 
                      : 'bg-slate-900 border border-slate-800/50'
                  }`}>
                    <span className={`text-[9px] font-bold uppercase font-mono tracking-wider ${
                      statsSummary.errorCount > 0 ? 'text-amber-400' : 'text-slate-500'
                    }`}>Duplicates Filtered</span>
                    <div className={`text-xl font-black mt-1 ${
                      statsSummary.errorCount > 0 ? 'text-amber-300' : 'text-slate-200'
                    }`}>{statsSummary.errorCount} Duplicates</div>
                    {statsSummary.errorCount > 0 && (
                      <span className="text-[8.5px] text-amber-400 font-semibold animate-pulse">Automatically filtered out</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  <div className="p-3 bg-slate-900 border border-slate-800/50 rounded-lg">
                    <span className="text-[9px] font-bold text-slate-500 uppercase font-mono tracking-wider">Total in Excel</span>
                    <div className="text-xl font-black text-slate-200 mt-1">{statsSummary.totalFound} Students</div>
                  </div>
                  <div className="p-3 bg-emerald-950/20 border border-emerald-900/20 rounded-lg">
                    <span className="text-[9px] font-bold text-emerald-400 uppercase font-mono tracking-wider">Matched Photos</span>
                    <div className="text-xl font-black text-emerald-300 mt-1 flex items-baseline gap-1.5">
                      {matchedStudents.length}
                      <span className="text-xs text-slate-500 font-bold">({((matchedStudents.length / students.length) * 100).toFixed(0)}%)</span>
                    </div>
                  </div>
                  <div className="p-3 bg-rose-950/15 border border-rose-950/30 rounded-lg">
                    <span className="text-[9px] font-bold text-rose-400 uppercase font-mono tracking-wider">Missing Photos</span>
                    <div className="text-xl font-black text-rose-300 mt-1">{missingStudents.length} Students</div>
                  </div>
                  <div className="p-3 bg-indigo-950/15 border border-indigo-950/30 rounded-lg">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase font-mono tracking-wider">Duplicates Filtered</span>
                    <div className="text-xl font-black text-indigo-300 mt-1">{statsSummary.errorCount} Issues</div>
                  </div>
                </div>
              )}

              {/* INVALID ROWS REPORT */}
              {invalidRows.length > 0 && (
                <div className="bg-rose-950/15 border border-rose-900/30 rounded-xl p-4 text-slate-200">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-rose-300">Validation Errors</div>
                      <div className="text-sm font-black text-slate-100">{invalidRows.length} row(s) require correction before import</div>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                    {invalidRows.map((row) => (
                      <div key={row.id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-3 mb-2 text-[10px] text-slate-400 font-mono">
                          <span>Row: {row.rowIndex}</span>
                          <span>StudentNo: {row.studentNo || 'N/A'}</span>
                        </div>
                        <div className="text-[11px] text-slate-200 font-semibold mb-1">{row.name || 'Unnamed Student'} • {row.gradeClass || 'No Class'}</div>
                        <div className="text-[10px] text-amber-300 space-y-1">
                          {row.errors?.map((err, idx) => (
                            <div key={idx}>• {err}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MULTI-SHEET OVERVIEW PANEL */}
              {processedSheets.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 shrink-0">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      Workbook Sheets Directory
                    </h3>
                    <span className="text-[9px] font-mono font-bold uppercase text-indigo-400 bg-indigo-950/40 border border-indigo-900/30 px-2 py-0.5 rounded">
                      {processedSheets.length} Sheets Detected
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-40 overflow-y-auto pr-1">
                    {processedSheets.map((sheet) => {
                      const hasWarning = !sheet.detectedClass;
                      return (
                        <div key={sheet.name} className={`p-3 rounded-lg border flex flex-col gap-2 transition-all ${
                          hasWarning 
                            ? 'bg-rose-950/10 border-rose-900/40' 
                            : 'bg-slate-900 border-slate-800/80 hover:border-slate-800'
                        }`}>
                          <div className="flex justify-between items-center min-w-0">
                            <span className="text-[10px] font-mono font-bold text-slate-350 truncate mr-2" title={sheet.name}>
                              📄 {sheet.name}
                            </span>
                            <span className="text-[9px] font-mono text-slate-500 font-bold shrink-0">
                              {sheet.studentCount} Students
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-950/40">
                            <span className="text-[8px] font-bold text-slate-500 uppercase font-mono">Assigned to:</span>
                            <select
                              value={sheet.detectedClass || ''}
                              onChange={(e) => handleSheetOverride(sheet.name, e.target.value)}
                              className="flex-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[9px] text-slate-300 font-bold font-mono outline-none cursor-pointer focus:border-indigo-500"
                            >
                              <option value="" disabled className="text-slate-600">-- Choose Class --</option>
                              {SCHOOL_CLASSES.map(cls => (
                                <option className="bg-slate-950 text-slate-200" key={cls} value={cls}>
                                  {cls.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </div>

                          {hasWarning && (
                            <span className="text-[8px] text-rose-400 font-extrabold flex items-center gap-1 mt-0.5">
                              ⚠️ Pattern mismatch. Select S-Class manually.
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DUPLICATE REPORT LIST */}
              {duplicates.length > 0 && (
                <div className="bg-amber-950/25 border border-amber-900/30 rounded-xl p-4 flex flex-col gap-2 mx-auto w-full select-text">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider font-mono">Duplicates Warning Report ({duplicates.length})</span>
                  </div>
                  <p className="text-[11px] text-amber-300 font-bold leading-normal">
                    A student with this name already exists in the selected stream. Please verify before saving.
                  </p>
                  <p className="text-[9.5px] text-slate-400 leading-relaxed">
                    The following duplicate student records were detected in the Excel sheet and automatically omitted to preserve database integrity:
                  </p>
                  <div className="max-h-28 overflow-y-auto border border-amber-950/40 bg-slate-950/60 rounded-lg p-2.5 divide-y divide-slate-850">
                    {duplicates.map((dup, idx) => (
                      <div key={idx} className="py-1 flex justify-between items-center text-[10px] font-mono text-slate-350">
                        <span>{dup.name} ({dup.gradeClass})</span>
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-950/65 border border-amber-900/30 text-amber-400 shrink-0 ml-4">
                          {dup.type === 'internal' ? 'Duplicate inside sheet' : 'Already in database'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RE-UPLOAD / CLEAR BUTTON IN PREVIEW MODE */}
              <div className="flex justify-between items-center bg-slate-950 p-2 border border-slate-800 rounded-xl px-4 shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('matched')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                      activeTab === 'matched' 
                        ? 'bg-emerald-600 text-white shadow-md' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Matched ({matchedStudents.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('missing')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                      activeTab === 'missing' 
                        ? 'bg-rose-600 text-white shadow-md' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Missing Photos ({missingStudents.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('unmatched')}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                      activeTab === 'unmatched' 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Unmatched Photos ({unmatchedPhotos.length})
                  </button>
                </div>
                
                <button
                  onClick={handleReset}
                  className="px-3 py-1 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-all rounded-lg font-black uppercase tracking-wider text-[9px] cursor-pointer"
                >
                  Clear and Start Over
                </button>
              </div>

              {/* ACTIVE TAB DISPLAY GRID */}
              <div className="flex-1 overflow-y-auto">
                
                {/* MATCHED STUDENTS VIEW */}
                {activeTab === 'matched' && (
                  matchedStudents.length === 0 ? (
                    <div className="text-center p-12 border border-slate-800 border-dashed rounded-xl py-20">
                      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto opacity-60 mb-3" />
                      <span className="text-xs font-black uppercase text-slate-400">Zero matches parsed</span>
                      <p className="text-[10px] text-slate-500 mt-2">Check if your StudentNo values match your ZIP photograph names exactly!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {matchedStudents.map((curr) => (
                        <div key={curr.id} className="bg-slate-950 border border-slate-800 hover:border-slate-700/80 rounded-xl p-3 flex gap-3 relative group select-none transition-all">
                          {/* Image block */}
                          <div className="w-16 h-20 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative">
                            {curr.photoDataUrl && (
                              <img src={curr.photoDataUrl} alt={curr.name} className="w-full h-full object-cover" />
                            )}
                          </div>
                          
                          {/* Student basic info */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                            <div>
                              <div className="flex justify-between items-start gap-1">
                                <h4 className="text-xs font-black text-slate-200 uppercase truncate leading-snug">{curr.name}</h4>
                                <span className="text-[8px] font-mono font-black text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 px-1 rounded">
                                  #{curr.studentNo}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1 font-semibold">{curr.gradeClass} • {curr.gender}</p>
                              <span className={`inline-block mt-2 text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                                curr.isCleared 
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' 
                                  : 'bg-amber-950/40 text-amber-500 border border-amber-900/30'
                              }`}>
                                {curr.isCleared ? 'Cleared' : 'Clearance Hold'}
                              </span>
                            </div>
                            
                            {/* Actions block */}
                            <div className="flex justify-between items-center text-[9px] text-slate-500 mt-2 border-t border-slate-900 pt-1.5 font-mono">
                              <span className="truncate max-w-[100px]" title={curr.photoFilename}>{curr.photoFilename}</span>
                              <button
                                onClick={() => removePhoto(curr.id)}
                                className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/20 cursor-pointer"
                                title="Unmatch photo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* MISSING PHOTOS VIEW */}
                {activeTab === 'missing' && (
                  missingStudents.length === 0 ? (
                    <div className="text-center p-12 bg-emerald-950/10 border border-emerald-800/40 rounded-xl py-20 flex flex-col items-center justify-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                      <span className="text-xs font-black uppercase text-emerald-300">Perfect match! All Students Cleared with Photos</span>
                      <p className="text-[10px] text-slate-400 mt-1.5">No missing photos identified. Roster ready to build in database.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {missingStudents.map((curr) => (
                        <div key={curr.id} className="bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl p-3 flex flex-col justify-between gap-3 relative select-none">
                          <div className="flex gap-3 min-w-0">
                            {/* Empty image block with manual uploader click */}
                            <label className="w-16 h-20 bg-slate-900 border border-slate-800/80 rounded-lg hover:border-slate-700/80 flex flex-col items-center justify-center text-slate-500 hover:text-slate-350 cursor-pointer transition-colors relative group overflow-hidden">
                              <input 
                                type="file" 
                                accept="image/png, image/jpeg" 
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleLocalPhotoUpload(curr.id, file);
                                }}
                              />
                              <ImageIcon className="w-6 h-6 transform group-hover:scale-110 transition-transform" />
                              <span className="text-[7px] font-sans font-black tracking-wider uppercase mt-1 leading-none text-center">Add Photo</span>
                            </label>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-1">
                                <h4 className="text-xs font-black text-slate-200 uppercase truncate leading-none mt-1">{curr.name}</h4>
                                <span className="text-[8px] font-mono font-black text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1 rounded">
                                  #{curr.studentNo}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-none">{curr.gradeClass} • {curr.gender}</p>
                              
                              <p className="text-[9px] text-rose-400/80 italic mt-3 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" /> No image matched
                              </p>
                            </div>
                          </div>

                          {/* Interactive Match Dropper */}
                          {unmatchedPhotos.length > 0 ? (
                            <div className="border-t border-slate-900 pt-2 flex items-center justify-between gap-1">
                              <span className="text-[8px] font-bold text-slate-500 uppercase font-mono tracking-wider shrink-0">Pair with:</span>
                              <select 
                                className="flex-1 max-w-[200px] bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 font-mono outline-none cursor-pointer focus:border-indigo-500"
                                onChange={(e) => {
                                  if (e.target.value) {
                                    const match = unmatchedPhotos.find(p => p.name === e.target.value);
                                    if (match) assignPhoto(curr.id, match);
                                  }
                                }}
                                defaultValue=""
                              >
                                <option value="" disabled>-- Choose Unmatched Photo --</option>
                                {unmatchedPhotos.map(p => (
                                  <option key={p.name} value={p.name}>{p.name} (Stem: {p.stem})</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="text-[8px] text-slate-600 border-t border-slate-900 pt-2 font-mono italic text-center leading-none">
                              No unmatched photos left in Zip folder. Please upload a picture manually.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* UNMATCHED PHOTOS VIEW */}
                {activeTab === 'unmatched' && (
                  unmatchedPhotos.length === 0 ? (
                    <div className="text-center p-12 bg-emerald-950/10 border border-emerald-800/40 rounded-xl py-20 flex flex-col items-center justify-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                      <span className="text-xs font-black uppercase text-emerald-300">Perfect utilization! All Images matched</span>
                      <p className="text-[10px] text-slate-400 mt-1.5">No spare photos detected in ZIP folder.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                      {unmatchedPhotos.map((photo) => (
                        <div key={photo.name} className="bg-slate-950 border border-slate-800 hover:border-slate-700 p-2 rounded-xl flex flex-col justify-between gap-2 transition-all">
                          <div className="aspect-[3/4] bg-slate-900 rounded-lg overflow-hidden border border-slate-850 relative group">
                            <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                          </div>
                          
                          <div className="space-y-1">
                            <span className="text-[9px] font-mono leading-tight font-bold text-slate-400 block truncate" title={photo.name}>
                              {photo.name}
                            </span>
                          </div>

                          {/* Quick Mapping Dropdown */}
                          {missingStudents.length > 0 ? (
                            <select 
                              className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[9px] text-slate-300 outline-none cursor-pointer focus:border-indigo-500"
                              onChange={(e) => {
                                if (e.target.value) {
                                  assignPhoto(e.target.value, photo);
                                }
                              }}
                              defaultValue=""
                            >
                              <option value="" disabled>Assign to...</option>
                              {missingStudents.map(ms => (
                                <option key={ms.id} value={ms.id}>
                                  #{ms.studentNo} - {ms.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[8px] text-slate-600 block text-center italic font-mono">No students missing photos</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

              </div>

            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
          <span className="text-[10px] text-slate-500 font-mono">
            Powered by SheetJS Spreadsheet SDK &amp; JSZip Engine
          </span>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 uppercase tracking-widest font-black text-[10px] rounded-lg border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
            >
              Cancel
            </button>
            
            {students.length > 0 && (
              <button
                onClick={handleSaveAll}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest rounded-lg transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                Save and Import ({students.length})
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
