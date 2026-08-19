import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Mic,
  X,
  Database,
  Table,
  Download,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  MessageSquare,
  Eye,
  EyeOff,
  Check,
  CheckCircle2,
  Printer,
  FileSpreadsheet,
  FileText,
  Smartphone,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { askAiAssistant, fetchAiKeyStatus, saveGeminiApiKey, testAiConnection } from '../utils/api.ts';
import SchoolLogo from './SchoolLogo.tsx';
import { 
  navigateToPage, 
  generateAttendanceReport, 
  printReport, 
  exportExcel, 
  exportCSV, 
  sendWhatsAppMessage, 
  createStudent, 
  deleteStudent 
} from '../utils/aiActionEngine.ts';

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  sql?: string | null;
  columns?: string[];
  rows?: any[];
  timestamp: Date;
  actionCompleted?: string;
  previewData?: any;
  pendingConfirmation?: {
    riskLevel: 'medium' | 'high';
    actionType: string;
    payload: any;
    prompt: string;
  };
  workflowProgress?: {
    currentStep: number;
    totalSteps: number;
    label: string;
  };
}

interface AiAssistantPopupProps {
  schoolLogo: string;
}

export default function AiAssistantPopup({ schoolLogo }: AiAssistantPopupProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isKeyConfigured, setIsKeyConfigured] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [expandedSqlIdx, setExpandedSqlIdx] = useState<number | null>(null);
  const [expandedTableIdx, setExpandedTableIdx] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Popup Setup Wizard states
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isSavingKey, setIsSavingKey] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'unchecked' | 'testing' | 'connected' | 'not_connected'>('unchecked');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<number>(1);

  const testConnection = async () => {
    if (!apiKeyInput.trim()) return;
    setTestStatus('testing');
    setTestMessage('Testing...');
    try {
      const res = await testAiConnection(apiKeyInput.trim());
      if (res && res.success) {
        setTestStatus('connected');
        setTestMessage('Connected to Gemini model successfully!');
      } else {
        setTestStatus('not_connected');
        setTestMessage(res?.message || 'Connection test failed.');
      }
    } catch (e: any) {
      setTestStatus('not_connected');
      setTestMessage(e.message || 'Verification failed.');
    }
  };

  const handleSaveKey = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    try {
      const res = await saveGeminiApiKey(apiKeyInput.trim());
      if (res && res.success) {
        setIsKeyConfigured(true);
        setApiKeyInput('');
        setTestMessage(null);
        setTestStatus('unchecked');
      } else {
        setTestMessage(res?.message || 'Failed to save key.');
      }
    } catch (err: any) {
      setTestMessage(err.message || 'Error saving key.');
    } finally {
      setIsSavingKey(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkKeyStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const checkKeyStatus = async () => {
    try {
      const res = await fetchAiKeyStatus();
      setIsKeyConfigured(res.configured);
    } catch (e) {
      setIsKeyConfigured(false);
    }
  };

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

    const lowerQuery = queryText.toLowerCase().trim();

    try {
      // 1. Navigation Action Intent
      if (lowerQuery.startsWith('take me to') || lowerQuery.startsWith('open') || lowerQuery.startsWith('go to') || lowerQuery.includes('navigate to')) {
        let pageId = lowerQuery.replace(/take me to|open|go to|navigate to/gi, '').trim();
        const navRes = navigateToPage(pageId);
        setMessages(prev => [...prev, {
          sender: 'assistant',
          text: navRes.message,
          actionCompleted: navRes.actionCompleted,
          timestamp: new Date()
        }]);
        setIsSending(false);
        return;
      }

      // 2. Report Generation Intent
      if (lowerQuery.includes('report') || lowerQuery.includes('absent') || lowerQuery.includes('attendance summary') || lowerQuery.includes('show me students')) {
        let targetClass = 'All';
        const classMatch = lowerQuery.match(/s\.?[1-6]/i) || lowerQuery.match(/grade\s*[1-8]/i);
        if (classMatch) targetClass = classMatch[0].toUpperCase();

        const reportRes = await generateAttendanceReport({ gradeClass: targetClass });
        if (reportRes.success && reportRes.previewData) {
          setMessages(prev => [...prev, {
            sender: 'assistant',
            text: `I've prepared the ${reportRes.previewData.title}. It contains ${reportRes.previewData.totalRecords} record(s). Here is your report preview:`,
            previewData: reportRes.previewData,
            rows: reportRes.previewData.rows,
            timestamp: new Date()
          }]);
          setIsSending(false);
          return;
        }
      }

      // 3. Print Intent
      if (lowerQuery.startsWith('print') || lowerQuery.includes('hard copy')) {
        const printRes = printReport("St. Paul School Attendance Report");
        setMessages(prev => [...prev, {
          sender: 'assistant',
          text: printRes.message,
          actionCompleted: printRes.actionCompleted,
          timestamp: new Date()
        }]);
        setIsSending(false);
        return;
      }

      // 4. Fallback to Gemini AI query engine
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
      if (res.rows && res.rows.length > 0) {
        setExpandedTableIdx(messages.length + 1);
      }
    } catch (err: any) {
      const errorMsg: Message = {
        sender: 'assistant',
        text: `Error: ${err.message || 'Server did not respond.'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice dictation requires Google Chrome or webkit compatible browser.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = 'en-US';
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      setInputVal(e.results[0][0].transcript);
      setIsListening(false);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const handleExportExcel = (columns: string[], rows: any[]) => {
    try {
      const exportData = rows.map(r => {
        const copy = { ...r };
        delete copy.photo;
        delete copy.photoOriginal;
        delete copy.photoEnhanced;
        return copy;
      });
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Results');
      const filename = `st-paul-quick-report-${Date.now()}.xlsx`;
      
      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        (window as any).electron.saveFileBase64(filename, base64Data, [
          { name: 'Excel Spreadsheet', extensions: ['xlsx'] }
        ]);
      } else {
        XLSX.writeFile(wb, filename);
      }
      alert('Report exported.');
    } catch (e: any) {
      alert('Export failed.');
    }
  };

  return (
    <div className="no-print font-sans select-none">
      {/* FLOATING LAUNCHER CIRCULAR BUTTON */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 z-[10000] cursor-pointer group ${
          isOpen
            ? 'bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:scale-105 active:scale-95 shadow-black/80 ring-2 ring-indigo-500/30'
            : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 border border-indigo-400/40 hover:from-indigo-500 hover:to-violet-500 hover:scale-110 active:scale-95 shadow-indigo-600/50 hover:shadow-indigo-500/70 ring-2 ring-indigo-500/20'
        }`}
        title={isOpen ? "Minimize St.Paul AI Assistant" : "Open St.Paul AI Assistant"}
        aria-label="Toggle St.Paul AI Assistant"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white transition-transform duration-200 group-hover:rotate-90" />
        ) : (
          <div className="relative flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-slate-950 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full" />
          </div>
        )}
      </button>

      {/* POPUP OVERLAY WINDOW */}
      {isOpen && (
        <div className="fixed bottom-22 sm:bottom-24 right-3 sm:right-6 w-[calc(100vw-24px)] sm:w-[400px] h-[520px] max-h-[calc(100vh-110px)] bg-slate-950/95 border border-slate-800 rounded-2xl shadow-2xl shadow-black/90 z-[10000] flex flex-col backdrop-blur-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="p-3 bg-slate-950 border-b border-slate-850 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                {schoolLogo ? (
                  <SchoolLogo className="w-6 h-6 object-contain" logoBase64={schoolLogo} />
                ) : (
                  <Sparkles className="w-4.5 h-4.5 text-indigo-400" />
                )}
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5 font-sans">
                  St.Paul AI Assistant
                </h3>
                <span className="text-[8px] uppercase font-bold text-indigo-400 font-mono block tracking-widest">
                  Quick Query Console
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white hover:bg-slate-900 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Close Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col p-3 overflow-hidden">
            {!isKeyConfigured ? (
              <div className="flex-1 flex flex-col justify-between p-2 gap-4 overflow-y-auto">
                {wizardStep === 1 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-4 animate-fade-in">
                    <Sparkles className="w-10 h-10 text-indigo-400 animate-pulse" />
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-200">AI Setup Assistant</h4>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                        To enable natural language queries, you need a Google Gemini API Key.
                      </p>
                    </div>
                    
                    <a
                      href="https://aistudio.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-350 text-[10px] font-bold uppercase rounded-lg transition"
                    >
                      Retrieve Free API Key
                    </a>
                    
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="w-full mt-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-lg cursor-pointer"
                    >
                      Next: Configure Key
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-4 p-2 animate-fade-in justify-center">
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-black uppercase text-slate-200">Enter Gemini API Key</h4>
                      <p className="text-[9.5px] text-slate-500 leading-normal">
                        Paste your API key below and click Test Connection.
                      </p>
                    </div>

                    <div className="relative flex items-center">
                      <input
                        type={showKey ? 'text' : 'password'}
                        placeholder="Paste key (AIzaSy...)"
                        value={apiKeyInput}
                        onChange={(e) => {
                          setApiKeyInput(e.target.value);
                          setTestStatus('unchecked');
                          setTestMessage(null);
                        }}
                        className="w-full bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-2 pr-8 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2.5 text-slate-500 hover:text-slate-350 cursor-pointer flex items-center justify-center h-full"
                      >
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {testStatus !== 'unchecked' && (
                      <div className={`p-2.5 rounded-lg border text-[9.5px] leading-normal font-medium ${
                        testStatus === 'connected'
                          ? 'bg-emerald-500/10 border-emerald-550/20 text-emerald-400'
                          : testStatus === 'testing'
                          ? 'bg-indigo-500/10 border-indigo-550/20 text-indigo-400'
                          : 'bg-rose-500/10 border-rose-550/20 text-rose-400'
                      }`}>
                        {testMessage}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={testConnection}
                        disabled={testStatus === 'testing' || !apiKeyInput.trim()}
                        className="flex-1 py-1.5 bg-slate-900 border border-slate-850 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-[10px] font-bold uppercase rounded-lg cursor-pointer"
                      >
                        {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>

                    <div className="flex gap-2 justify-between items-center pt-3 border-t border-slate-850 mt-2">
                      <button
                        type="button"
                        onClick={() => setWizardStep(1)}
                        className="text-[10px] text-slate-500 hover:text-slate-350 font-bold uppercase cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveKey()}
                        disabled={isSavingKey || !apiKeyInput.trim()}
                        className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-40 text-white text-[10px] font-bold uppercase rounded-lg cursor-pointer"
                      >
                        {isSavingKey ? 'Saving...' : 'Save & Connect'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden gap-3">
                {/* Chat window */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3 scrollbar-thin scrollbar-thumb-slate-900 text-xs">
                  {messages.length === 0 && (
                    <div className="py-6 text-center space-y-3">
                      <HelpCircle className="w-7 h-7 text-indigo-400 mx-auto opacity-70 animate-pulse" />
                      <div>
                        <h4 className="text-[11px] font-black uppercase text-slate-300">Quick School Database Help</h4>
                        <p className="text-[9.5px] text-slate-500 leading-normal mt-1">
                          Ask simple questions to check registers, stream counts, and clearance lists:
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 text-left">
                        {[
                          "How do I print clearance cards?",
                          "How many students are in S.4?",
                          "Which students have no photos?",
                          "Who has not cleared?"
                        ].map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(q)}
                            className="text-left px-3 py-2 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 font-bold rounded-lg truncate cursor-pointer"
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
                        className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-[8px] font-mono text-slate-650">
                          {isUser ? 'Admin' : 'St.Paul AI'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div
                          className={`max-w-[90%] rounded-xl p-2.5 text-[11px] leading-relaxed ${
                            isUser
                              ? 'bg-indigo-600/20 border border-indigo-500/20 text-slate-200 rounded-tr-none'
                              : 'bg-slate-900 border border-slate-850 text-slate-300 rounded-tl-none shadow'
                          }`}
                        >
                          <div className="whitespace-pre-line prose prose-invert max-w-none text-[11px] leading-relaxed">
                            {msg.text}
                          </div>

                          {/* Interactive Report Preview Card */}
                          {!isUser && msg.previewData && (
                            <div className="mt-3 p-3 bg-slate-950/80 border border-indigo-500/30 rounded-xl space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                                  {msg.previewData.title}
                                </span>
                                <span className="text-[9px] font-mono font-bold bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/50">
                                  {msg.previewData.totalRecords} Records
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] font-bold">
                                <div className="bg-emerald-950/50 border border-emerald-800/40 p-1.5 rounded">
                                  <span className="text-emerald-400 block text-xs font-black">{msg.previewData.presentCount}</span>
                                  <span className="text-emerald-300/80 text-[8px] uppercase">Present</span>
                                </div>
                                <div className="bg-amber-950/50 border border-amber-800/40 p-1.5 rounded">
                                  <span className="text-amber-400 block text-xs font-black">{msg.previewData.checkedOutCount}</span>
                                  <span className="text-amber-300/80 text-[8px] uppercase">Out</span>
                                </div>
                                <div className="bg-purple-950/50 border border-purple-800/40 p-1.5 rounded">
                                  <span className="text-purple-400 block text-xs font-black">{msg.previewData.absentCount}</span>
                                  <span className="text-purple-300/80 text-[8px] uppercase">Absent</span>
                                </div>
                              </div>

                              {/* Interactive Report Actions */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 pt-2 border-t border-slate-850 text-[9px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => printReport(msg.previewData.title)}
                                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded border border-slate-800 flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Printer className="w-3 h-3 text-blue-400" /> Print
                                </button>
                                <button
                                  type="button"
                                  onClick={() => exportExcel(msg.previewData.rows, `${msg.previewData.title}.xlsx`)}
                                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded border border-slate-800 flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" /> Excel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => exportCSV(msg.previewData.rows, `${msg.previewData.title}.csv`)}
                                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded border border-slate-800 flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Download className="w-3 h-3 text-purple-400" /> CSV
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const phone = prompt("Enter parent / admin phone number (+256...):", "+256700351704");
                                    if (phone) {
                                      sendWhatsAppMessage(phone, `St. Paul Attendance Report: ${msg.previewData.title} - Total: ${msg.previewData.totalRecords}`);
                                      alert(`WhatsApp alert sent to ${phone}`);
                                    }
                                  }}
                                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-emerald-400 rounded border border-emerald-900/40 flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Smartphone className="w-3 h-3 text-emerald-400" /> WhatsApp
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Data Roster Display */}
                          {!isUser && msg.rows && msg.rows.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-2">
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={() =>
                                    setExpandedTableIdx(
                                      expandedTableIdx === index ? null : index
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 text-[8.5px] uppercase font-bold text-slate-400 rounded cursor-pointer"
                                >
                                  <Table className="w-3 h-3 text-indigo-400" />
                                  {expandedTableIdx === index ? 'Hide' : `Table (${msg.rows.length})`}
                                </button>
                                <button
                                  onClick={() => handleExportExcel(msg.columns || [], msg.rows || [])}
                                  className="p-0.5 px-2 bg-emerald-950/40 border border-emerald-900/30 text-emerald-400 text-[8px] uppercase font-bold rounded flex items-center gap-1 cursor-pointer"
                                >
                                  <Download className="w-2.5 h-2.5" /> Spreadsheet
                                </button>
                              </div>

                              {expandedTableIdx === index && (
                                <div className="overflow-x-auto border border-slate-850 rounded max-h-36 overflow-y-auto">
                                  <table className="w-full text-left text-[9px] border-collapse">
                                    <thead>
                                      <tr className="bg-slate-950 text-slate-500 font-mono uppercase font-bold border-b border-slate-850">
                                        {msg.columns
                                          ?.filter(c => !['photo', 'photooriginal', 'photoenhanced', 'id'].includes(c.toLowerCase()))
                                          .slice(0, 3)
                                          .map(col => (
                                            <th key={col} className="p-1">{col}</th>
                                          ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-850 text-slate-350 font-sans">
                                      {msg.rows.slice(0, 30).map((row, rIdx) => (
                                        <tr key={rIdx} className="hover:bg-slate-950/20">
                                          {msg.columns
                                            ?.filter(c => !['photo', 'photooriginal', 'photoenhanced', 'id'].includes(c.toLowerCase()))
                                            .slice(0, 3)
                                            .map(col => {
                                              const cellVal = row[col];
                                              let textVal = String(cellVal === null || cellVal === undefined ? '' : cellVal);
                                              if (col.toLowerCase() === 'iscleared') {
                                                textVal = cellVal ? 'Cleared ✔' : 'Hold ✖';
                                              }
                                              return (
                                                <td key={col} className="p-1 whitespace-nowrap truncate max-w-[80px]">
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

                              <div>
                                <button
                                  onClick={() =>
                                    setExpandedSqlIdx(
                                      expandedSqlIdx === index ? null : index
                                    )
                                  }
                                  className="text-[8px] font-mono text-slate-550 underline cursor-pointer"
                                >
                                  {expandedSqlIdx === index ? 'Hide SQL Query' : 'View SQL Statement'}
                                </button>
                                {expandedSqlIdx === index && (
                                  <pre className="mt-1 p-2 bg-slate-950 border border-slate-850 rounded text-[8.5px] font-mono text-cyan-400 whitespace-pre-wrap select-all overflow-x-auto leading-relaxed">
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
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[8px] font-mono text-slate-500">St.Paul AI</span>
                      <div className="bg-slate-900 border border-slate-850 rounded-xl rounded-tl-none p-2.5 text-[11px] text-slate-500 flex items-center gap-1.5 animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                        <span>AI query running...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input block */}
                <div className="border-t border-slate-850 pt-2 flex gap-1.5 items-center">
                  <button
                    onClick={handleVoiceInput}
                    className={`p-2 rounded-lg border transition-all cursor-pointer ${
                      isListening
                        ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                        : 'bg-slate-900 border-slate-850 text-slate-450 hover:text-slate-200'
                    }`}
                    title="Voice command dictation"
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSendMessage();
                      }
                    }}
                    placeholder="Ask question..."
                    className="flex-1 bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputVal.trim() || isSending}
                    className="p-1.5 px-3 bg-indigo-600 hover:bg-indigo-550 text-white text-[11px] font-black uppercase rounded-lg disabled:opacity-40 transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
