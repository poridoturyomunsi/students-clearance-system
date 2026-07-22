import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Award, Calendar, User, Briefcase, FileText, CheckCircle, RefreshCw, XCircle, Clock, GraduationCap, Check, AlertCircle } from 'lucide-react';
import { verifyDocumentToken } from '../utils/api.ts';
import ParticleBackground from './ParticleBackground.tsx';

interface VerificationResult {
  success: boolean;
  status: string;
  documentType?: string;
  error?: string;
  metadata?: {
    name: string;
    studentId?: string;
    adminNo?: string;
    studentNo?: string;
    staffId?: string;
    photo: string | null;
    gradeClass?: string;
    boardingStatus?: string;
    gender?: string;
    isCleared?: boolean;
    category?: string;
    department?: string;
    position?: string;
    employmentStatus?: string;
    issueDate?: string;
    expiryDate?: string;
    status?: string;
    attendanceStatus?: string;
    timeIn?: string | null;
    timeOut?: string | null;
    [key: string]: any;
  };
}

export default function DocumentVerificationPortal() {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    // Extract token from path: /verify/student/:token or /verify/:token
    const path = window.location.pathname;
    let extracted = '';
    if (path.includes('/verify/student/')) {
      extracted = path.split('/verify/student/').pop() || '';
    } else if (path.includes('/verify/')) {
      extracted = path.split('/verify/').pop() || '';
    } else if (path.includes('/staff/verify/')) {
      extracted = path.split('/staff/verify/').pop() || '';
    }
    
    extracted = decodeURIComponent(extracted.trim());
    console.log(`[VERIFY-PORTAL-DEBUG] Extracted token from path (${path}):`, extracted);
    setToken(extracted);

    if (extracted) {
      performVerification(extracted);
    } else {
      setLoading(false);
    }
  }, []);

  const performVerification = async (verifyToken: string) => {
    setLoading(true);
    console.log(`[VERIFY-PORTAL-DEBUG] Calling verifyDocumentToken for: "${verifyToken}"`);
    try {
      const response = await verifyDocumentToken(verifyToken);
      console.log(`[VERIFY-PORTAL-DEBUG] Verification API Response:`, response);
      setResult(response);
    } catch (err: any) {
      console.error(`[VERIFY-PORTAL-ERROR] Verification failed:`, err);
      setResult({
        success: false,
        status: 'Error',
        error: err.message || 'Failed to complete verification.'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-screen w-full bg-[#05070f] flex flex-col items-center justify-center p-4 font-sans select-none antialiased overflow-hidden">
        <ParticleBackground />
        <div className="z-10 flex flex-col items-center gap-4 bg-[#0a0f24]/50 border border-white/10 backdrop-blur-xl p-8 rounded-2xl shadow-2xl shadow-blue-500/5">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
          <h2 className="text-xl font-semibold text-white/90">Authenticating Document...</h2>
          <p className="text-white/40 text-sm">Verifying digital credentials in St. Paul Database</p>
        </div>
      </div>
    );
  }

  const isVerified = result?.success;
  const statusLabel = result?.status || 'Unknown';
  const docType = result?.documentType || 'Student Clearance Card';
  const isStaffCard = docType === 'Staff ID';
  const isStudentCard = docType.includes('Student');

  return (
    <div className="relative min-h-screen w-full bg-[#05070f] flex flex-col items-center justify-center p-4 font-sans antialiased overflow-y-auto py-12">
      <ParticleBackground />

      <div className="z-10 w-full max-w-lg bg-[#0a0f24]/60 border border-white/10 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/10">
        
        {/* Status Header */}
        <div className={`p-8 text-center border-b border-white/5 relative overflow-hidden flex flex-col items-center justify-center gap-4 ${
          isVerified 
            ? 'bg-gradient-to-b from-green-500/10 to-transparent' 
            : 'bg-gradient-to-b from-red-500/10 to-transparent'
        }`}>
          {isVerified ? (
            <>
              <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 shadow-lg shadow-green-500/20 animate-pulse">
                <ShieldCheck className="w-12 h-12" />
              </div>
              <div className="space-y-1">
                <div className="bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm mx-auto">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {isStaffCard ? '🟢 VALID STAFF ID' : '🟢 VALID STUDENT CLEARANCE CARD'}
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight mt-3">
                  ✔ VERIFIED
                </h1>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-black">
                  ST. PAUL SECONDARY SCHOOL, NASUTI
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
                <ShieldAlert className="w-12 h-12" />
              </div>
              <div className="space-y-1">
                <div className="bg-rose-950/80 border border-rose-500/30 text-rose-400 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm mx-auto">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  {isStaffCard ? '🔴 INVALID OR REVOKED STAFF ID' : '🔴 STUDENT RECORD NOT FOUND'}
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight mt-3">
                  {isStaffCard ? '❌ INVALID STAFF ID' : '❌ STUDENT RECORD NOT FOUND'}
                </h1>
                <p className="text-xs text-rose-300 max-w-xs font-bold leading-normal mt-2">
                  {result?.error || 'Student record not found. Please register the student first.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Content Body */}
        <div className="p-8 space-y-6">
          {!result || !result.metadata ? (
            <div className="text-center py-6">
              <p className="text-red-400 font-bold text-sm mb-2">{result?.error || 'Student record not found. Please register the student first.'}</p>
              <p className="text-white/40 text-xs max-w-xs mx-auto leading-relaxed">
                The scanned clearance card identifier <span className="font-mono text-indigo-400">"{token}"</span> does not match any active student record in St. Paul Secondary School Registry.
              </p>
            </div>
          ) : (
            <>
              {/* Photo & Identity Banner */}
              <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 bg-white/5 border border-white/5 p-6 rounded-2xl">
                {result.metadata.photo ? (
                  <img
                    src={result.metadata.photo}
                    alt={result.metadata.name}
                    className="w-24 h-28 object-cover rounded-xl border border-white/10 bg-[#0d1330] shadow-md"
                  />
                ) : (
                  <div className="w-24 h-28 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-white/30 flex-shrink-0">
                    <User className="w-10 h-10" />
                  </div>
                )}
                <div className="text-center sm:text-left space-y-2 py-1 flex-1 min-w-0">
                  <span className="px-2.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/20 text-[9px] uppercase font-bold text-indigo-400 tracking-wider">
                    {isStaffCard ? 'OFFICIAL STAFF MEMBER' : 'REGISTERED STUDENT'}
                  </span>
                  <h2 className="text-xl font-bold text-white leading-tight uppercase truncate">
                    {result.metadata.name}
                  </h2>
                  <div className="text-white/70 text-xs font-semibold space-y-1">
                    {isStaffCard ? (
                      <>
                        <p className="flex justify-center sm:justify-start gap-1">
                          <span className="text-white/40 font-normal">Staff ID:</span>
                          <span className="font-mono text-indigo-400">{result.metadata.staffId || token}</span>
                        </p>
                        <p className="flex justify-center sm:justify-start gap-1">
                          <span className="text-white/40 font-normal">Designation:</span>
                          <span>{result.metadata.position || 'N/A'}</span>
                        </p>
                        <p className="flex justify-center sm:justify-start gap-1">
                          <span className="text-white/40 font-normal">Department:</span>
                          <span>{result.metadata.department || 'N/A'}</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="flex justify-center sm:justify-start gap-1">
                          <span className="text-white/40 font-normal">Student Number:</span>
                          <span className="font-mono text-indigo-400 font-bold">{result.metadata.adminNo || result.metadata.studentNo || token}</span>
                        </p>
                        <p className="flex justify-center sm:justify-start gap-1">
                          <span className="text-white/40 font-normal">Class:</span>
                          <span className="text-amber-300 font-bold">{result.metadata.gradeClass || 'N/A'}</span>
                        </p>
                        <p className="flex justify-center sm:justify-start gap-1">
                          <span className="text-white/40 font-normal">Boarding Status:</span>
                          <span>{result.metadata.boardingStatus || 'Day Scholar'}</span>
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Attendance Clock In / Out Banner for Students */}
              {isStudentCard && (
                <div className="bg-slate-900/90 border border-indigo-500/20 p-4 rounded-xl flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-indigo-400" />
                    <div>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Today's Gate Attendance</p>
                      <p className="text-xs font-bold text-white">
                        {result.metadata.attendanceStatus === 'PRESENT' && (
                          <span className="text-emerald-400 flex items-center gap-1">
                            🟢 Clocked In ({result.metadata.timeIn || 'Today'})
                          </span>
                        )}
                        {result.metadata.attendanceStatus === 'CHECKED OUT' && (
                          <span className="text-amber-400 flex items-center gap-1">
                            🚪 Clocked Out ({result.metadata.timeOut || 'Today'})
                          </span>
                        )}
                        {(!result.metadata.attendanceStatus || result.metadata.attendanceStatus === 'ABSENT') && (
                          <span className="text-slate-400">⚪ Not Checked In Today</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    Live Gate Sync
                  </span>
                </div>
              )}

              {/* Credential Data List */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase font-bold text-white/30 tracking-wider border-b border-white/5 pb-2">
                  Card Authentication Details
                </h3>

                {isStaffCard ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Award className="w-3.5 h-3.5 text-blue-400" />
                        Category
                      </div>
                      <p className="text-white/90 text-sm font-semibold">
                        {result.metadata.category || 'Staff'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                        Employment Status
                      </div>
                      <p className="text-white/90 text-sm font-semibold">
                        {result.metadata.employmentStatus || 'Permanent'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        Issue Date
                      </div>
                      <p className="text-white/90 text-sm font-semibold">
                        {result.metadata.issueDate || 'N/A'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        Expiry Date
                      </div>
                      <p className="text-white/90 text-sm font-semibold">
                        {result.metadata.expiryDate || 'N/A'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <GraduationCap className="w-3.5 h-3.5 text-blue-400" />
                        Class & Stream
                      </div>
                      <p className="text-white/90 text-sm font-semibold">
                        {result.metadata.gradeClass || 'N/A'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        Gender
                      </div>
                      <p className="text-white/90 text-sm font-semibold">
                        {result.metadata.gender || 'N/A'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Award className="w-3.5 h-3.5 text-blue-400" />
                        Boarding Type
                      </div>
                      <p className="text-white/90 text-sm font-semibold">
                        {result.metadata.boardingStatus || 'Day Scholar'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                        Clearance Status
                      </div>
                      <p className="text-emerald-400 text-sm font-bold">
                        {result.metadata.isCleared ? 'Cleared' : (result.metadata.status || 'Pending')}
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-white/40">Credential Status:</span>
                  <span className={`text-xs font-black uppercase px-2.5 py-0.5 rounded ${
                    isVerified 
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-rose-950 text-rose-400 border border-rose-500/20'
                  }`}>
                    {result.metadata.status || statusLabel}
                  </span>
                </div>

                <div className="space-y-1 pt-2">
                  <div className="flex items-center gap-1.5 text-white/40 text-xs">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    Secure Verification Token / Reference
                  </div>
                  <p className="text-white/50 text-[10px] font-mono break-all bg-black/30 p-2.5 rounded-lg border border-white/5 select-all">
                    {token}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Card Footer Stamp */}
        <div className="bg-white/5 px-8 py-5 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isVerified ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <span className="text-[11px] font-bold tracking-wider uppercase text-white/60">
              {isVerified ? 'Authentic Credential' : 'Invalid Credential'}
            </span>
          </div>
          <span className="text-[10px] text-white/30 font-medium">
            SPSS Verification Portal
          </span>
        </div>
      </div>
      
      {/* Branding Link */}
      <p className="z-10 mt-6 text-white/30 text-xs text-center">
        Powered by St Paul Secondary School Digital Clearance & Registry System
      </p>
    </div>
  );
}
