import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import {
  Sparkles,
  Send,
  Mic,
  Download,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Table,
  BarChart2,
  Eye,
  EyeOff,
  Database,
  Key,
  Check,
  Info,
  Camera,
  RefreshCw,
  Trash2,
  Grid,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import {
  askAiAssistant,
  saveGeminiApiKey,
  fetchAiKeyStatus,
  fetchStudentsFromDb,
  updateStudentInDb,
  testAiConnection
} from '../../utils/api.ts';
import { Student } from '../../types.ts';
import { analyzeImageQuality, processStudentPhoto } from '../../utils/imageProcessor.ts';
import Loading from '../Loading.tsx';

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  sql?: string | null;
  columns?: string[];
  rows?: any[];
  timestamp: Date;
}

export default function AiAssistantModule() {
  const [activeTab, setActiveTab] = useState<'chat' | 'photos'>('chat');
  const [isKeyConfigured, setIsKeyConfigured] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isSavingKey, setIsSavingKey] = useState<boolean>(false);
  const [keySaveMessage, setKeySaveMessage] = useState<string>('');

  // Setup Wizard states
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [showWizardKey, setShowWizardKey] = useState<boolean>(false);
  const [wizardTesting, setWizardTesting] = useState<boolean>(false);
  const [wizardStatus, setWizardStatus] = useState<'connected' | 'not_connected' | 'testing' | 'unchecked'>('unchecked');
  const [wizardStatusMsg, setWizardStatusMsg] = useState<string | null>(null);

  const testWizardConnection = async () => {
    if (!apiKeyInput.trim()) return;
    setWizardTesting(true);
    setWizardStatus('testing');
    setWizardStatusMsg('Testing connection to Gemini models...');
    try {
      const res = await testAiConnection(apiKeyInput.trim());
      if (res && res.success) {
        setWizardStatus('connected');
        setWizardStatusMsg('Connected successfully! You can now activate the assistant.');
      } else {
        setWizardStatus('not_connected');
        setWizardStatusMsg(res?.message || 'Connection test failed.');
      }
    } catch (err: any) {
      setWizardStatus('not_connected');
      setWizardStatusMsg(err.message || 'Verification failed.');
    } finally {
      setWizardTesting(false);
    }
  };

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [selectedSqlMessageIndex, setSelectedSqlMessageIndex] = useState<number | null>(null);
  const [expandedQueryResultsIndex, setExpandedQueryResultsIndex] = useState<number | null>(null);
  const [sortField, setSortField] = useState<string>('');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Photo diagnostics states
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [filterClass, setFilterClass] = useState<string>('All');
  const [filterStream, setFilterStream] = useState<string>('All');
  const [diagnosticsRunning, setDiagnosticsRunning] = useState<boolean>(false);
  const [diagnosticResults, setDiagnosticResults] = useState<{
    missingPhoto: Student[];
    poorQuality: { student: Student; warnings: string[]; details: any }[];
    healthyCount: number;
    scannedCount: number;
  } | null>(null);
  const [selectedPhotoStudentIds, setSelectedPhotoStudentIds] = useState<string[]>([]);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [enhanceProgress, setEnhanceProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const checkApiKey = async () => {
    try {
      const res = await fetchAiKeyStatus();
      setIsKeyConfigured(res.configured);
    } catch (err) {
      console.error('Error checking API key status:', err);
      setIsKeyConfigured(false);
    }
  };

  const loadAllStudents = async () => {
    setIsLoadingStudents(true);
    try {
      const res = await fetchStudentsFromDb({ limit: -1 }); // Get all records
      if (res && Array.isArray(res.data)) {
        setAllStudents(res.data);
      }
    } catch (err) {
      console.error('Failed to load students for diagnostics:', err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const handleSaveApiKey = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    setKeySaveMessage('');
    try {
      const res = await saveGeminiApiKey(apiKeyInput.trim());
      if (res.success) {
        setIsKeyConfigured(true);
        setApiKeyInput('');
        setKeySaveMessage('API Key saved successfully!');
      } else {
        setKeySaveMessage('Failed to save API Key.');
      }
    } catch (err: any) {
      setKeySaveMessage(`Error: ${err.message || err}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  // Chat message submission
  const handleSendMessage = async (textToSend?: string) => {
    const queryText = textToSend || inputVal;
    if (!queryText.trim() || isSending) return;

    if (!textToSend) setInputVal('');

    const userMsg: Message = {
      sender: 'user',
      text: queryText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    try {
      const res = await askAiAssistant(queryText);
      const assistantMsg: Message = {
        sender: 'assistant',
        text: res.answer,
        sql: res.sql,
        columns: res.columns,
        rows: res.rows,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
      // Auto expand query results for the latest message if rows exist
      if (res.rows && res.rows.length > 0) {
        setExpandedQueryResultsIndex(messages.length + 1);
      }
    } catch (err: any) {
      const errorMsg: Message = {
        sender: 'assistant',
        text: `Sorry, I encountered an error: ${err.message || 'Unknown server error.'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // Speech Recognition API for voice commands
  const handleVoiceCommand = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please try using Google Chrome.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      setInputVal(speechToText);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Render SVG Chart based on query row results
  const renderChart = (columns: string[], rows: any[]) => {
    if (!rows || rows.length === 0 || !columns || columns.length === 0) return null;

    // Detect numeric value column and label column
    let numCol = '';
    let labelCol = '';

    // Look for count or numerical columns
    for (const col of columns) {
      const val = rows[0][col];
      const isNum = typeof val === 'number' || (!isNaN(Number(val)) && String(val).trim() !== '');
      if (isNum && !col.toLowerCase().includes('id') && !col.toLowerCase().includes('no') && !col.toLowerCase().includes('year')) {
        numCol = col;
        break;
      }
    }

    // Look for string/label column
    for (const col of columns) {
      if (col !== numCol && !col.toLowerCase().includes('id') && !col.toLowerCase().includes('photo')) {
        labelCol = col;
        break;
      }
    }

    // Default fallbacks if not detected
    if (!numCol) {
      // Find first column that is numeric
      for (const col of columns) {
        if (typeof rows[0][col] === 'number') { numCol = col; break; }
      }
    }
    if (!labelCol) {
      labelCol = columns.find(c => c !== numCol) || columns[0];
    }

    // If we still can't find numeric data, we aggregate categorical labels from the rows ourselves (e.g. counting occurrences)
    if (!numCol && rows.length > 1) {
      // We can count student distribution by stream/class/gender if they are returned as list
      const categoricalCols = columns.filter(c => ['gradeclass', 'gender', 'boardingstatus', 'printstatus', 'iscleared'].includes(c.toLowerCase()));
      if (categoricalCols.length > 0) {
        const catCol = categoricalCols[0];
        const counts: Record<string, number> = {};
        rows.forEach(r => {
          const val = String(r[catCol]);
          counts[val] = (counts[val] || 0) + 1;
        });
        const aggregatedRows = Object.entries(counts).map(([k, v]) => ({
          [catCol]: k,
          Count: v
        }));
        return drawSvgChart(catCol, 'Count', aggregatedRows);
      }
      return null;
    }

    if (!numCol || !labelCol) return null;

    return drawSvgChart(labelCol, numCol, rows);
  };

  const drawSvgChart = (labelKey: string, numKey: string, data: any[]) => {
    // Format chart values
    const chartData = data.slice(0, 10).map(d => ({
      label: String(d[labelKey]),
      value: Number(d[numKey])
    }));

    const maxVal = Math.max(...chartData.map(d => d.value), 1);
    const height = 180;
    const width = 500;
    const paddingLeft = 100;
    const paddingRight = 30;
    const paddingTop = 20;
    const paddingBottom = 40;
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;
    const barHeight = Math.max(10, Math.min(30, (graphHeight / chartData.length) - 8));

    return (
      <div className="mt-4 p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="text-xs uppercase font-black text-indigo-400 tracking-wider mb-3 flex items-center gap-1.5 font-mono">
          <BarChart2 className="w-4 h-4" /> AI Generated Metrics Chart
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="max-w-md mx-auto block overflow-visible">
            {chartData.map((d, index) => {
              const y = paddingTop + index * (graphHeight / chartData.length) + (graphHeight / chartData.length - barHeight) / 2;
              const barWidth = (d.value / maxVal) * graphWidth;
              // Modern gradient palette
              const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#10b981', '#06b6d4', '#3b82f6'];
              const color = colors[index % colors.length];

              return (
                <g key={index} className="group">
                  {/* Axis Label */}
                  <text
                    x={paddingLeft - 8}
                    y={y + barHeight / 2 + 4}
                    textAnchor="end"
                    fill="#94a3b8"
                    className="text-[9px] font-bold font-sans uppercase select-none"
                  >
                    {d.label.length > 15 ? d.label.substring(0, 13) + '..' : d.label}
                  </text>

                  {/* Glassmorphism background track */}
                  <rect
                    x={paddingLeft}
                    y={y}
                    width={graphWidth}
                    height={barHeight}
                    fill="#1e293b"
                    rx={barHeight / 2}
                    className="opacity-40"
                  />

                  {/* Value Bar */}
                  <rect
                    x={paddingLeft}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={color}
                    rx={barHeight / 2}
                    className="transition-all duration-500 ease-out origin-left"
                  />

                  {/* Value Label */}
                  <text
                    x={paddingLeft + barWidth + 8}
                    y={y + barHeight / 2 + 4}
                    fill="#f1f5f9"
                    className="text-[9.5px] font-mono font-black"
                  >
                    {d.value}
                  </text>
                </g>
              );
            })}
            {/* Grid base line */}
            <line
              x1={paddingLeft}
              y1={paddingTop - 5}
              x2={paddingLeft}
              y2={height - paddingBottom + 5}
              stroke="#334155"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </div>
    );
  };

  // Sorting results in UI
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getSortedRows = (rows: any[]) => {
    if (!sortField) return rows;
    return [...rows].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      
      const comp = typeof valA === 'number' && typeof valB === 'number'
        ? valA - valB
        : String(valA).toLowerCase().localeCompare(String(valB).toLowerCase());
      
      return sortAsc ? comp : -comp;
    });
  };

  // Export results table to CSV/Excel
  const handleExportExcel = (columns: string[], rows: any[], topic: string) => {
    try {
      const sanitizedRows = rows.map(r => {
        const copy = { ...r };
        delete copy.photo;
        delete copy.photoOriginal;
        delete copy.photoEnhanced;
        return copy;
      });

      const worksheet = XLSX.utils.json_to_sheet(sanitizedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'AIQueryResults');
      const filename = `st-paul-ai-report-${topic.replace(/[^a-zA-Z0-9]/g, '-')}.xlsx`;
      
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        (window as any).electron.saveFileBase64(filename, base64Data, [
          { name: 'Excel Spreadsheet', extensions: ['xlsx'] }
        ]);
      } else {
        XLSX.writeFile(workbook, filename);
      }
      alert('Report exported successfully.');
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // Export results to PDF Roster using jsPDF
  const handleExportPdf = (columns: string[], rows: any[], topic: string) => {
    try {
      const doc = new jsPDF();
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text('ST. PAUL INTELLIGENCE ASSISTANT', 14, 20);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Query Report: "${topic}"`, 14, 26);
      doc.text(`Date Generated: ${new Date().toLocaleString()}`, 14, 31);
      
      doc.setDrawColor(226, 232, 240); // border line
      doc.line(14, 35, 196, 35);

      // Simple Table layout
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);

      let y = 45;
      const headers = columns.filter(c => !['photo', 'photoOriginal', 'photoEnhanced', 'id'].includes(c.toLowerCase())).slice(0, 5);
      const colWidths = [30, 50, 30, 30, 40];

      // Draw Headers
      headers.forEach((h, idx) => {
        const x = 14 + colWidths.slice(0, idx).reduce((a, b) => a + b, 0);
        doc.text(h.toUpperCase(), x, y);
      });

      doc.line(14, y + 3, 196, y + 3);
      y += 8;

      doc.setFont('Helvetica', 'normal');
      
      const printRows = rows.slice(0, 50); // limit to 50 rows for simplicity in single-page format
      printRows.forEach((row, rowIdx) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
          // Re-draw headers on new page
          doc.setFont('Helvetica', 'bold');
          headers.forEach((h, idx) => {
            const x = 14 + colWidths.slice(0, idx).reduce((a, b) => a + b, 0);
            doc.text(h.toUpperCase(), x, y);
          });
          doc.line(14, y + 3, 196, y + 3);
          y += 8;
          doc.setFont('Helvetica', 'normal');
        }

        headers.forEach((h, colIdx) => {
          const x = 14 + colWidths.slice(0, colIdx).reduce((a, b) => a + b, 0);
          const cellVal = String(row[h] === null || row[h] === undefined ? '' : row[h]);
          doc.text(cellVal.substring(0, 22), x, y);
        });

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 2, 196, y + 2);
        y += 6;
      });

      if (rows.length > 50) {
        doc.setFont('Helvetica', 'italic');
        doc.text(`* Showing first 50 rows out of ${rows.length} total entries matched. Download Excel for full roster.`, 14, y + 4);
      }

      const filename = `st-paul-ai-report-${topic.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      doc.save(filename);
    } catch (err: any) {
      alert(`PDF generation failed: ${err.message}`);
    }
  };

  // Run passport photos diagnostics in batches of 100 to prevent memory exhaustion
  const runPhotoDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setDiagnosticResults(null);
    setSelectedPhotoStudentIds([]);
    
    try {
      const missingPhoto: Student[] = [];
      const poorQuality: { student: Student; warnings: string[]; details: any }[] = [];
      let healthyCount = 0;
      let scannedCount = 0;
      let totalCount = 0;
      let currentPage = 1;
      const limit = 100;
      let done = false;

      // Fetch first page to find the total matching students
      const firstRes = await fetchStudentsFromDb({
        page: 1,
        limit: limit,
        gradeClass: filterClass === 'All' ? undefined : filterClass,
        stream: filterStream === 'All' ? undefined : filterStream
      });

      totalCount = firstRes.total || (firstRes.data ? firstRes.data.length : 0);

      while (!done && scannedCount < totalCount) {
        const res = currentPage === 1 ? firstRes : await fetchStudentsFromDb({
          page: currentPage,
          limit: limit,
          gradeClass: filterClass === 'All' ? undefined : filterClass,
          stream: filterStream === 'All' ? undefined : filterStream
        });

        if (!res || !Array.isArray(res.data) || res.data.length === 0) {
          done = true;
          break;
        }

        for (const student of res.data) {
          if (!student.photo && !student.hasPhoto) {
            missingPhoto.push(student);
          } else {
            let photoSrc = student.photo || '';
            if (!photoSrc && student.hasPhoto) {
              try {
                const photoRes = await fetch(`${getApiBaseUrl()}/api/students/${student.id}/photo`);
                if (photoRes.ok) {
                  photoSrc = await photoRes.text();
                }
              } catch (e) {
                console.warn(`Failed to fetch photo for student ${student.name}`);
              }
            }

            if (photoSrc) {
              const quality = await analyzeImageQuality(photoSrc);
              if (quality.isTooDark || quality.isCluttered || quality.hasMultipleSubjects) {
                poorQuality.push({
                  student,
                  warnings: quality.warnings,
                  details: quality
                });
              } else {
                healthyCount++;
              }
            } else {
              missingPhoto.push(student);
            }
          }
          scannedCount++;
        }

        // Dynamically update the results state so progress is shown to the user
        setDiagnosticResults({
          missingPhoto: [...missingPhoto],
          poorQuality: [...poorQuality],
          healthyCount,
          scannedCount
        });

        currentPage++;
      }

      // Pre-select all poor quality students for enhancement
      setSelectedPhotoStudentIds(poorQuality.map(p => p.student.id));

    } catch (err) {
      console.error('Error running diagnostics:', err);
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  // Batch improve passport photos
  const handleEnhanceSelectedPhotos = async () => {
    if (selectedPhotoStudentIds.length === 0 || isEnhancing) return;

    setIsEnhancing(true);
    setEnhanceProgress({ current: 0, total: selectedPhotoStudentIds.length });

    try {
      let currentIdx = 0;
      for (const sid of selectedPhotoStudentIds) {
        const item = diagnosticResults?.poorQuality.find(pq => pq.student.id === sid);
        if (!item) continue;

        const student = item.student;
        let photoSrc = student.photo || '';
        if (!photoSrc && student.hasPhoto) {
          try {
            const res = await fetch(`${getApiBaseUrl()}/api/students/${student.id}/photo`);
            if (res.ok) {
              photoSrc = await res.text();
            }
          } catch (e) {
            console.error(`Could not download image for processing: ${student.name}`);
          }
        }

        if (photoSrc) {
          // 1. Process and improve photo:
          // Remove background, replace with solid white, sharpen/adjust exposure, normalize to 900x1200
          const enhanced = await processStudentPhoto(photoSrc, {
            zoom: 1.0,
            autoCenter: true,
            filter: 'studio',
            bgReplacementColor: 'white',
            whitenIntensity: 45
          });

          // 2. Save back to database
          const updatedStudent = {
            ...student,
            photo: enhanced,
            photoOriginal: student.photoOriginal || photoSrc,
            photoEnhanced: enhanced
          };

          await updateStudentInDb(student.id, updatedStudent);
        }

        currentIdx++;
        setEnhanceProgress({ current: currentIdx, total: selectedPhotoStudentIds.length });
      }

      alert('Batch photo enhancement completed! Re-running diagnostics...');
      // Refresh diagnostics
      runPhotoDiagnostics();
    } catch (err: any) {
      console.error('Failed to run batch enhancement:', err);
      alert(`Batch photo enhancement failed: ${err.message || err}`);
    } finally {
      setIsEnhancing(false);
      setEnhanceProgress(null);
    }
  };

  const getApiBaseUrl = () => {
    return typeof window !== 'undefined' && (window as any).electron
      ? 'http://localhost:3000'
      : '';
  };

  if (isKeyConfigured === null) {
    return <Loading message="Initializing St.Paul Intelligence Assistant..." />;
  }

  return (
    <div className="flex flex-col gap-5 h-full min-h-[75vh]">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-850 pb-4">
        <div>
          <h2 className="text-lg font-black uppercase text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            <span>St.Paul Intelligence Assistant</span>
          </h2>
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono mt-0.5">
            Institutional Database Expert &amp; Studio Passport Quality Enhancer
          </p>
        </div>

        {/* Gemini API Key config badge */}
        <div className="flex items-center gap-2">
          {isKeyConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase rounded-lg font-mono tracking-wide">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Gemini Service Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase rounded-lg font-mono tracking-wide animate-pulse">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              Service Key Missing
            </span>
          )}
        </div>
      </div>

      {/* AI ASSISTANT SETUP WIZARD (Visible if key is not configured) */}
      {!isKeyConfigured && (
        <div className="bg-slate-950 border border-indigo-500/20 p-6 md:p-8 rounded-2xl max-w-2xl mx-auto w-full space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          
          {/* Wizard Headers */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto text-indigo-400 border border-indigo-500/20 animate-pulse">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-200 uppercase tracking-wide">
              St.Paul AI Setup Wizard
            </h3>
            
            {/* Step Indicators */}
            <div className="flex items-center justify-center gap-3 pt-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono transition-colors ${
                      wizardStep === step
                        ? 'bg-indigo-600 text-white font-black ring-2 ring-indigo-500/50'
                        : wizardStep > step
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 border border-slate-800 text-slate-500'
                    }`}
                  >
                    {wizardStep > step ? '✓' : step}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-8 h-0.5 rounded ${
                        wizardStep > step ? 'bg-emerald-600' : 'bg-slate-850'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* STEP 1: WELCOME & OVERVIEW */}
          {wizardStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center space-y-2">
                <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Welcome to St.Paul AI Assistant</h4>
                <p className="text-[11.5px] text-slate-400 leading-relaxed max-w-lg mx-auto">
                  Activate a powerful database intelligence agent right inside your clearance card management software. Our natural language assistant turns school data operations into simple conversations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
                <div className="bg-slate-900/50 border border-slate-850 p-3.5 rounded-xl space-y-1.5 hover:border-indigo-500/20 transition-all">
                  <div className="text-indigo-400 font-bold text-xs uppercase flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" /> NLP Queries
                  </div>
                  <p className="text-[9.5px] text-slate-500 leading-relaxed">
                    Ask questions like *"How many S.4 students cleared?"* to pull data instantly in plain English.
                  </p>
                </div>
                <div className="bg-slate-900/50 border border-slate-850 p-3.5 rounded-xl space-y-1.5 hover:border-indigo-500/20 transition-all">
                  <div className="text-indigo-400 font-bold text-xs uppercase flex items-center gap-1.5">
                    <Table className="w-3.5 h-3.5" /> Data Exporters
                  </div>
                  <p className="text-[9.5px] text-slate-500 leading-relaxed">
                    Generate visual statistics charts and export query result tables directly to PDF or Excel spreadsheets.
                  </p>
                </div>
                <div className="bg-slate-900/50 border border-slate-850 p-3.5 rounded-xl space-y-1.5 hover:border-indigo-500/20 transition-all">
                  <div className="text-indigo-400 font-bold text-xs uppercase flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" /> Photo Studio
                  </div>
                  <p className="text-[9.5px] text-slate-500 leading-relaxed">
                    Run database diagnostics to identify bad student passport photos, and auto-enhance them in batches.
                  </p>
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  Get Started <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: GET API KEY */}
          {wizardStep === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center space-y-2">
                <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Step 2: Obtain your Google Gemini API Key</h4>
                <p className="text-[11.5px] text-slate-400 leading-relaxed max-w-lg mx-auto">
                  St.Paul AI runs on Google's advanced **Gemini 2.5 Flash** model. To activate the service, you will need a free API Key from Google AI Studio.
                </p>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl max-w-md mx-auto text-left space-y-2.5">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block border-b border-slate-850 pb-1.5">Instructions:</span>
                <ol className="text-[11px] text-slate-400 space-y-2 list-decimal pl-4 leading-relaxed font-medium">
                  <li>Click the **Google AI Studio** button below to open the console in a new browser tab.</li>
                  <li>Sign in with your Google account.</li>
                  <li>Click on the **Create API Key** button at the top left.</li>
                  <li>Copy the generated key (it starts with <span className="font-mono text-indigo-400">AIzaSy</span>).</li>
                </ol>
              </div>

              <div className="flex justify-center pt-2">
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider transition"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                  Open Google AI Studio
                </a>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-350 text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  className="px-5 py-2 bg-indigo-650 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  I have my API Key <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: TEST & SAVE */}
          {wizardStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center space-y-2">
                <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Step 3: Enter, Test &amp; Activate Key</h4>
                <p className="text-[11.5px] text-slate-400 leading-relaxed max-w-lg mx-auto">
                  Paste your Gemini API key below. We highly recommend testing the connection to verify key configuration works before activating.
                </p>
              </div>

              <div className="max-w-md mx-auto space-y-3.5">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Gemini API Key</label>
                  <div className="relative flex items-center">
                    <input
                      type={showWizardKey ? 'text' : 'password'}
                      placeholder="Paste AI Studio API Key (AIzaSy...)"
                      value={apiKeyInput}
                      onChange={(e) => {
                        setApiKeyInput(e.target.value);
                        setWizardStatus('unchecked');
                        setWizardStatusMsg(null);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 pr-10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWizardKey(!showWizardKey)}
                      className="absolute right-3 text-slate-500 hover:text-slate-350 cursor-pointer flex items-center justify-center h-full"
                    >
                      {showWizardKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Connection Status Box */}
                {wizardStatus !== 'unchecked' && (
                  <div className={`p-3 rounded-xl text-left text-xs font-medium border flex items-start gap-2.5 animate-fade-in ${
                    wizardStatus === 'connected'
                      ? 'bg-emerald-500/10 border-emerald-550/20 text-emerald-400'
                      : wizardStatus === 'testing'
                      ? 'bg-indigo-500/10 border-indigo-550/20 text-indigo-400'
                      : 'bg-rose-500/10 border-rose-550/20 text-rose-400'
                  }`}>
                    {wizardStatus === 'connected' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="text-[9px] font-bold block uppercase tracking-wider mb-0.5">
                        {wizardStatus === 'connected'
                          ? 'Connection Successful'
                          : wizardStatus === 'testing'
                          ? 'Checking Status...'
                          : 'Connection Error'}
                      </span>
                      <p className="text-[10px] text-slate-400 font-sans leading-normal">{wizardStatusMsg}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={testWizardConnection}
                    disabled={wizardTesting || !apiKeyInput.trim()}
                    className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 disabled:opacity-45 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                  >
                    {wizardTesting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Testing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" /> Test Connection
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-350 text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                
                <button
                  type="button"
                  onClick={() => handleSaveApiKey()}
                  disabled={isSavingKey || !apiKeyInput.trim()}
                  className="px-6 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-45 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {isSavingKey ? 'Saving...' : 'Save & Activate'}
                </button>
              </div>

              {keySaveMessage && (
                <p className="text-[10px] text-indigo-400 font-semibold font-mono uppercase tracking-wide text-center">
                  {keySaveMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* MAIN MODULE CONTENT (Visible only when API Key is active) */}
      {isKeyConfigured && (
        <div className="flex-1 flex flex-col gap-4">
          {/* TAB TOGGLES */}
          <div className="flex bg-slate-950/80 p-1 border border-slate-850 rounded-xl max-w-xs self-start text-[11px] font-black uppercase tracking-wider font-mono">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${
                activeTab === 'chat' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Chat Assistant
            </button>
            <button
              onClick={() => setActiveTab('photos')}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-all ${
                activeTab === 'photos' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Photo Diagnostics
            </button>
          </div>

          {/* TAB 1: CHAT ASSISTANT */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col gap-4 border border-slate-850 rounded-2xl p-4 bg-slate-950/40 relative min-h-[50vh]">
              {/* CHAT DISPLAY CONTAINER */}
              <div className="flex-1 overflow-y-auto max-h-[420px] pr-2 space-y-4 scrollbar-thin scrollbar-thumb-slate-850">
                {messages.length === 0 && (
                  <div className="py-12 text-center max-w-sm mx-auto space-y-4 select-none">
                    <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mx-auto border border-indigo-500/20">
                      <HelpCircle className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-300">How can I help you today?</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                        Ask questions in natural English to pull registers, counts, or summaries directly from school database tables.
                      </p>
                    </div>
                    {/* Suggested questions */}
                    <div className="flex flex-col gap-2 pt-2 text-left">
                      {[
                        "How many students are in a class?",
                        "Which students have no photos?",
                        "Which students have not cleared?",
                        "Show students by stream"
                      ].map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(q)}
                          className="w-full text-left px-3.5 py-2.5 bg-slate-900 border border-slate-800 hover:border-indigo-550/40 hover:bg-slate-850 text-[11px] text-slate-350 font-bold rounded-xl transition cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap"
                        >
                          💡 {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, index) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={index}
                      className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'} animate-fade-in`}
                    >
                      <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-550 uppercase tracking-widest">
                        <span>{isUser ? 'Administrator' : 'St.Paul Assistant'}</span>
                        <span>•</span>
                        <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                          isUser
                            ? 'bg-indigo-650/20 border border-indigo-500/30 text-indigo-100 rounded-tr-none'
                            : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-none shadow-sm'
                        }`}
                      >
                        {/* Summary text */}
                        <div className="prose prose-invert max-w-none text-xs leading-relaxed whitespace-pre-line">
                          {msg.text}
                        </div>

                        {/* RENDER TABLE RESULT IF EXIST */}
                        {!isUser && msg.rows && msg.rows.length > 0 && (
                          <div className="mt-4 border-t border-slate-800/80 pt-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() =>
                                  setExpandedQueryResultsIndex(
                                    expandedQueryResultsIndex === index ? null : index
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-755 text-slate-300 hover:text-white text-[9.5px] font-bold uppercase rounded-md transition cursor-pointer"
                              >
                                <Table className="w-3.5 h-3.5 text-indigo-400" />
                                {expandedQueryResultsIndex === index ? 'Hide Table Data' : `Show Table Data (${msg.rows.length} rows)`}
                              </button>
                              
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleExportExcel(msg.columns || [], msg.rows || [], msg.text)}
                                  className="p-1 px-2 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-900/30 text-[9px] uppercase font-bold rounded-md flex items-center gap-1 cursor-pointer"
                                  title="Export to Excel"
                                >
                                  <Download className="w-3 h-3" /> Excel
                                </button>
                                <button
                                  onClick={() => handleExportPdf(msg.columns || [], msg.rows || [], msg.text)}
                                  className="p-1 px-2 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-400 border border-indigo-900/30 text-[9px] uppercase font-bold rounded-md flex items-center gap-1 cursor-pointer"
                                  title="Export to PDF Report"
                                >
                                  <Download className="w-3 h-3" /> PDF
                                </button>
                              </div>
                            </div>

                            {/* Render metrics chart if active */}
                            {renderChart(msg.columns || [], msg.rows)}

                            {/* Expandable Table body */}
                            {expandedQueryResultsIndex === index && (
                              <div className="overflow-x-auto border border-slate-850 rounded-lg max-h-60 overflow-y-auto">
                                <table className="w-full text-left border-collapse text-[10px] font-sans">
                                  <thead>
                                    <tr className="bg-slate-950 text-slate-500 font-mono uppercase font-bold border-b border-slate-850">
                                      {msg.columns
                                        ?.filter(c => !['photo', 'photoOriginal', 'photoEnhanced', 'id'].includes(c.toLowerCase()))
                                        .map(col => (
                                          <th
                                            key={col}
                                            onClick={() => handleSort(col)}
                                            className="p-2 cursor-pointer hover:bg-slate-900 select-none"
                                          >
                                            <div className="flex items-center gap-1.5">
                                              <span>{col}</span>
                                              {sortField === col && (
                                                <span className="text-[8px] text-indigo-400">{sortAsc ? '▲' : '▼'}</span>
                                              )}
                                            </div>
                                          </th>
                                        ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-850 text-slate-350">
                                    {getSortedRows(msg.rows).map((row, rIdx) => (
                                      <tr key={rIdx} className="hover:bg-slate-950/40 transition">
                                        {msg.columns
                                          ?.filter(c => !['photo', 'photoOriginal', 'photoEnhanced', 'id'].includes(c.toLowerCase()))
                                          .map(col => {
                                            const cellVal = row[col];
                                            let textVal = String(cellVal === null || cellVal === undefined ? '' : cellVal);
                                            if (col.toLowerCase() === 'iscleared') {
                                              textVal = cellVal ? 'CLEARED ✔' : 'HOLD ✖';
                                            }
                                            return (
                                              <td key={col} className={`p-2 ${col.toLowerCase() === 'iscleared' ? (cellVal ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold') : ''}`}>
                                                {textVal}
                                              </td>
                                            );
                                          })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Expandable SQL compiler box */}
                            <div>
                              <button
                                onClick={() =>
                                  setSelectedSqlMessageIndex(
                                    selectedSqlMessageIndex === index ? null : index
                                  )
                                }
                                className="text-[9px] text-slate-550 hover:text-indigo-400 underline font-mono cursor-pointer"
                              >
                                {selectedSqlMessageIndex === index ? 'Hide SQL Code Query' : 'View Generated SQL Compiler Statement'}
                              </button>
                              {selectedSqlMessageIndex === index && (
                                <pre className="mt-2 p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-[9.5px] font-mono text-cyan-400 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed">
                                  {msg.sql}
                                </pre>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isSending && (
                  <div className="flex flex-col gap-1.5 items-start">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">St.Paul Assistant</span>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-3.5 text-xs text-slate-500 flex items-center gap-2 animate-pulse select-none">
                      <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                      <span>Assistant is compiling SQL and synthesizing summary answer...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* INPUT BAR */}
              <div className="border-t border-slate-850 pt-3 flex gap-2 items-center">
                <button
                  onClick={handleVoiceCommand}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                    isListening
                      ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Voice command recognition"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  placeholder="Ask a question in plain English (e.g. Which students have not cleared?)..."
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputVal.trim() || isSending}
                  className="p-2.5 px-4 bg-indigo-650 hover:bg-indigo-550 text-white border border-indigo-500 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PHOTO DIAGNOSTICS & STUDIO */}
          {activeTab === 'photos' && (
            <div className="flex-1 flex flex-col gap-4 border border-slate-850 rounded-2xl p-5 bg-slate-950/40 min-h-[50vh]">
              {/* RUN DIAGNOSTICS LAUNCH PANEL */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase text-slate-100 tracking-wide flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-indigo-400" />
                      Passport Quality Audit Studio
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-normal max-w-xl">
                      Run real-time background scans on the student table directory base64 files. The quality audits checks if photos are missing, under-exposed (too dark), blurred, or contain background texture clutter.
                    </p>
                  </div>
                  <button
                    onClick={runPhotoDiagnostics}
                    disabled={diagnosticsRunning || isEnhancing}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shrink-0 flex items-center gap-1.5 shadow-sm"
                  >
                    {diagnosticsRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Audit Running...
                      </>
                    ) : (
                      'Run Quality Diagnostics Audit'
                    )}
                  </button>
                </div>

                {/* Filter Selector Panel */}
                <div className="flex flex-wrap items-center gap-4 bg-slate-950/40 p-3 rounded-lg border border-slate-850/40 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-medium font-mono text-[10px] uppercase">Class:</span>
                    <select
                      value={filterClass}
                      onChange={(e) => setFilterClass(e.target.value)}
                      disabled={diagnosticsRunning || isEnhancing}
                      className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[10px]"
                    >
                      <option value="All">All Classes</option>
                      <option value="S.1">S.1</option>
                      <option value="S.2">S.2</option>
                      <option value="S.3">S.3</option>
                      <option value="S.4">S.4</option>
                      <option value="S.5">S.5</option>
                      <option value="S.6">S.6</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-medium font-mono text-[10px] uppercase">Stream:</span>
                    <select
                      value={filterStream}
                      onChange={(e) => setFilterStream(e.target.value)}
                      disabled={diagnosticsRunning || isEnhancing}
                      className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[10px]"
                    >
                      <option value="All">All Streams</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="Arts">Arts</option>
                      <option value="Sciences">Sciences</option>
                    </select>
                  </div>

                  {diagnosticsRunning && (
                    <div className="ml-auto text-[9px] font-mono text-indigo-400 animate-pulse uppercase font-bold tracking-wider">
                      Scanning in batches of 100...
                    </div>
                  )}
                </div>
              </div>

              {/* BATCH ENHANCEMENT LOADER OVERLAY */}
              {isEnhancing && enhanceProgress && (
                <div className="bg-indigo-950/30 border border-indigo-900/40 p-4 rounded-xl flex flex-col gap-2.5 font-mono text-[10px]">
                  <div className="flex justify-between font-black text-indigo-300 uppercase tracking-widest animate-pulse">
                    <span>⚡ Processing Batch Passport Studio Enhancements...</span>
                    <span>{enhanceProgress.current} / {enhanceProgress.total} processed</span>
                  </div>
                  <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-150"
                      style={{ width: `${(enhanceProgress.current / enhanceProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* DIAGNOSTICS RESULTS CONTAINER */}
              {diagnosticResults && (
                <div className="space-y-5 animate-fade-in">
                  {/* BENTO STATS FOR SCAN */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-850/60 select-none">
                    <div className="bg-slate-900/60 p-2.5 border border-slate-850/60 rounded-lg text-center">
                      <span className="block text-[8px] font-mono text-slate-500 uppercase font-black">Scanned Students</span>
                      <span className="text-lg font-black text-slate-350 mt-1 block">{diagnosticResults.scannedCount}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 border border-slate-850/60 rounded-lg text-center">
                      <span className="block text-[8px] font-mono text-emerald-400 uppercase font-black">Healthy Quality</span>
                      <span className="text-lg font-black text-emerald-400 mt-1 block">{diagnosticResults.healthyCount}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 border border-slate-850/60 rounded-lg text-center">
                      <span className="block text-[8px] font-mono text-amber-400 uppercase font-black">Poor Quality Alert</span>
                      <span className="text-lg font-black text-amber-400 mt-1 block">{diagnosticResults.poorQuality.length}</span>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 border border-slate-850/60 rounded-lg text-center">
                      <span className="block text-[8px] font-mono text-rose-455 uppercase font-black">Missing Passports</span>
                      <span className="text-lg font-black text-rose-455 mt-1 block">{diagnosticResults.missingPhoto.length}</span>
                    </div>
                  </div>

                  {/* SUB SECTION 1: POOR QUALITY ENHANCEMENTS WORKSPACE */}
                  {diagnosticResults.poorQuality.length > 0 && (
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900 shadow-sm flex flex-col gap-3">
                      <div className="p-3 bg-slate-950 border-b border-slate-850 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" /> Quality Alerts: Action Required ({diagnosticResults.poorQuality.length} students)
                          </h4>
                          <p className="text-[9px] text-slate-500 font-mono mt-0.5 uppercase tracking-wide">
                            Check student boxes below and click Auto-Improve to clean backgrounds and boost lighting
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (selectedPhotoStudentIds.length === diagnosticResults.poorQuality.length) {
                                setSelectedPhotoStudentIds([]);
                              } else {
                                setSelectedPhotoStudentIds(diagnosticResults.poorQuality.map(p => p.student.id));
                              }
                            }}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-755 text-slate-350 text-[10px] font-bold uppercase rounded-lg border border-slate-700 transition cursor-pointer"
                          >
                            {selectedPhotoStudentIds.length === diagnosticResults.poorQuality.length ? 'Deselect All' : 'Select All Alerts'}
                          </button>
                          <button
                            onClick={handleEnhanceSelectedPhotos}
                            disabled={selectedPhotoStudentIds.length === 0 || isEnhancing}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-wider rounded-lg border border-emerald-500 shadow transition cursor-pointer"
                          >
                            ⚡ Auto-Improve Selected ({selectedPhotoStudentIds.length})
                          </button>
                        </div>
                      </div>

                      {/* Diagnostic list table */}
                      <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs select-none">
                          <thead>
                            <tr className="bg-slate-950/60 border-b border-slate-850 font-mono text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              <th className="py-2.5 px-3 w-10 text-center">Ticked</th>
                              <th className="py-2.5 px-3">Student details</th>
                              <th className="py-2.5 px-3">Admin No</th>
                              <th className="py-2.5 px-3">Class stream</th>
                              <th className="py-2.5 px-3">Diagnostic failure warnings</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850 text-slate-300">
                            {diagnosticResults.poorQuality.map((item) => {
                              const s = item.student;
                              const isChecked = selectedPhotoStudentIds.includes(s.id);
                              return (
                                <tr key={s.id} className={`hover:bg-slate-950/20 transition ${isChecked ? 'bg-indigo-950/15' : ''}`}>
                                  <td className="py-2.5 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setSelectedPhotoStudentIds(prev =>
                                          prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                        );
                                      }}
                                      className="rounded border-slate-800 bg-slate-950 text-indigo-650 focus:ring-0 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-9 rounded bg-slate-950 border border-slate-850 overflow-hidden shrink-0">
                                        {s.photo ? (
                                          <img src={s.photo} alt={s.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <svg className="w-3.5 h-3.5 text-slate-700 mx-auto mt-1" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </div>
                                      <span className="font-bold text-slate-200 block text-xs">{s.name}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-450">{s.adminNo}</td>
                                  <td className="py-2.5 px-3 font-bold text-slate-350">{s.gradeClass}</td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col gap-0.5">
                                      {item.warnings.map((w, wIdx) => (
                                        <span key={wIdx} className="text-[9.5px] text-amber-400 font-bold block">
                                          ⚠ {w}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SUB SECTION 2: MISSING PASSPORT RECORDS */}
                  {diagnosticResults.missingPhoto.length > 0 && (
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900 shadow-sm flex flex-col gap-3">
                      <div className="p-3 bg-slate-950 border-b border-slate-850">
                        <h4 className="text-xs font-black uppercase text-rose-400 tracking-wider flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" /> Missing Passport Registry ({diagnosticResults.missingPhoto.length} students)
                        </h4>
                        <p className="text-[9px] text-slate-500 font-mono mt-0.5 uppercase tracking-wide">
                          The following registered students do not have any portrait photo file saved in database
                        </p>
                      </div>

                      {/* Missing photo list table */}
                      <div className="overflow-x-auto max-h-60 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs select-none">
                          <thead>
                            <tr className="bg-slate-950/60 border-b border-slate-850 font-mono text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              <th className="py-2.5 px-3">Student</th>
                              <th className="py-2.5 px-3">Admin No</th>
                              <th className="py-2.5 px-3">Class stream</th>
                              <th className="py-2.5 px-3">Clearance status</th>
                              <th className="py-2.5 px-3">Boarding status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850 text-slate-300">
                            {diagnosticResults.missingPhoto.map((s) => (
                              <tr key={s.id} className="hover:bg-slate-955/20 transition">
                                <td className="py-2 px-3">
                                  <span className="font-bold text-slate-250 block text-xs">{s.name}</span>
                                </td>
                                <td className="py-2 px-3 font-mono font-semibold text-slate-450">{s.adminNo}</td>
                                <td className="py-2 px-3 font-bold text-slate-350">{s.gradeClass}</td>
                                <td className="py-2 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold font-mono ${s.isCleared ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : 'bg-rose-955/20 text-rose-400 border border-rose-900/20'}`}>
                                    {s.isCleared ? 'CLEARED' : 'HOLD'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400">{s.boardingStatus}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* DIAGNOSTIC AUDIT SUCCESS COVERAGE WIDGET */}
                  {diagnosticResults.poorQuality.length === 0 && diagnosticResults.missingPhoto.length === 0 && (
                    <div className="bg-emerald-950/15 border border-emerald-800/40 rounded-xl p-5 text-center max-w-md mx-auto space-y-3">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-400 border border-emerald-500/20 shadow-inner">
                        <CheckCircle2 className="w-6 h-6 animate-bounce" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase text-emerald-400">100% Studio Quality Compliance!</h4>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          All students in the St. Paul Clearance Card directory register are fully equipped with centered, exposure-balanced white-background passport photos.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
