import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Student } from '../types.ts';
import SchoolLogo from './SchoolLogo.tsx';
import { Utensils, ShieldCheck, Lock, Shield } from 'lucide-react';
import { getClassTheme } from '../utils/classColors.ts';
import { getApiBaseUrl } from '../utils/api.ts';

interface ClearanceCardProps {
  student: Student;
  side?: 'front' | 'back' | 'payment' | 'both' | 'payment-only' | 'august-only';
  interactive?: boolean;
  logoBase64?: string | null;
  showWatermark?: boolean;
  watermarkOpacity?: number; // 0 to 1
}

export default function ClearanceCard({
  student,
  side = 'both',
  interactive = false,
  logoBase64,
  showWatermark = true,
  watermarkOpacity = 0.05,
}: ClearanceCardProps) {
  // Read class color configuration dynamically
  const classTheme = getClassTheme(student.gradeClass);

  const [photoUrl, setPhotoUrl] = useState<string | null>(student.photo || (student.hasPhoto
    ? `${getApiBaseUrl()}/api/students/${student.id}/photo?t=${student.updatedAt ? new Date(student.updatedAt).getTime() : ''}`
    : null));
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const stdIdentifier = student.studentNo || student.adminNo || student.id;
    const secureUrl = `https://stpaulss-eportal.vercel.app/verify/student/${encodeURIComponent(stdIdentifier)}`;

    QRCode.toDataURL(secureUrl, { margin: 1, width: 120, color: { dark: '#000000', light: '#ffffff' } })
      .then(url => {
        if (isMounted) setQrCodeUrl(url);
      })
      .catch(err => {
        console.warn("QR code generation error:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [student]);

  // Calendar days helper for 2026
  // June 2026 (Starts Monday, 30 days)
  // July 2026 (Starts Wednesday, 31 days)
  // August 2026 (Starts Saturday, 31 days)
  const renderCalendar = (monthName: string, startDayOfWeek: number, totalDays: number, isSmall = false) => {
    const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const cells: (number | null)[] = [];

    // Fill in empty slots for padding
    const padding = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    for (let i = 0; i < padding; i++) {
      cells.push(null);
    }

    // Fill days
    for (let d = 1; d <= totalDays; d++) {
      cells.push(d);
    }

    const cellClass = isSmall
      ? 'w-[19px] h-[19px] text-[11px] rounded-[3px]'
      : 'w-[19.5px] h-[19.5px] text-[11.5px] rounded-[3.5px]';

    const textClass = isSmall
      ? 'text-[10.5px] font-extrabold'
      : 'text-[11px] font-extrabold';

    return (
      <div className={`flex flex-col bg-slate-50 border border-slate-300 rounded-md shadow-2xs flex-1 min-w-0 ${isSmall ? 'p-1.5' : 'p-2'}`}>
        <div className={`text-center font-sans uppercase tracking-wider font-black text-[var(--theme-text)] border-b border-slate-300 pb-1 mb-1.5 bg-[var(--theme-badge-bg)] rounded-t-[2px] ${isSmall ? 'text-[9px]' : 'text-[11px]'}`}>
          {monthName} 2026
        </div>
        <div className={`grid grid-cols-7 gap-[3px] text-center font-black text-slate-500 mb-1 ${isSmall ? 'text-[8px]' : 'text-[9.5px]'}`}>
          {daysOfWeek.map((day, idx) => (
            <div key={idx} className="w-full h-4.5 flex items-center justify-center font-black">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[3px] justify-items-center w-full">
          {cells.map((day, idx) => {
            const isWeekend = day
              ? ((startDayOfWeek - 1 + day - 1) % 7 === 5 || (startDayOfWeek - 1 + day - 1) % 7 === 6)
              : false;

            return (
              <div
                key={idx}
                className={`flex items-center justify-center border transition-colors duration-150 relative ${cellClass} ${
                  day
                    ? isWeekend
                      ? 'bg-amber-50/95 border-amber-300 text-amber-950 font-black hover:bg-amber-100/90'
                      : 'bg-white border-slate-300 text-slate-950 font-black hover:bg-slate-100'
                    : 'bg-transparent border-transparent'
                }`}
              >
                {day ? (
                  <span className={`font-mono leading-none ${textClass}`}>{day}</span>
                ) : (
                  ''
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const serialNo = `SPSSN-2026-${(student.adminNo || student.id || "0000").replace(/[^0-9]/g, "").slice(0, 5).padStart(5, "0")}`;

  const formatSurePayCode = (codeStr: string) => {
    const cleaned = (codeStr || '').replace(/\s+/g, '').toUpperCase();
    if (cleaned.length >= 6) {
      return cleaned.replace(/(.{4})/g, '$1  ').trim();
    }
    return cleaned;
  };

  const renderFrontCard = () => (
    <div
      id={`card-front-${student.id}`}
      className="relative w-full max-w-[340px] h-[230px] print:w-full print:h-full bg-white rounded-xl shadow-sm border-[1.8px] border-[var(--theme-border)] flex flex-col justify-between overflow-hidden shrink-0 select-none shadow-[var(--theme-badge-bg)] mx-auto"
    >
      {/* SVG Guilloché Security Pattern Background */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.035] pointer-events-none z-[0]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`guilloche-${student.id}`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 0 20 Q 10 0, 20 20 T 40 20" fill="none" stroke="#d4af37" strokeWidth="0.8"/>
            <path d="M 0 20 Q 10 40, 20 20 T 40 20" fill="none" stroke="#07153d" strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#guilloche-${student.id})`} />
      </svg>

      {/* Watermark Logo behind content */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-[0]"
        style={{ opacity: showWatermark ? watermarkOpacity : 0 }}
      >
        <SchoolLogo className="w-40 h-40 scale-[1.2] rotate-12" logoBase64={logoBase64} />
      </div>

      {/* Top Header stripe with metallic gold divider line */}
      <div className="pl-3 pr-3 text-[var(--theme-title-text)] flex justify-between items-center relative z-10 theme-gradient-bar h-[52px] min-h-[52px] select-none border-b border-[#d4af37]/40 shadow-xs">
        {/* Left: Crest */}
        <div className="shrink-0 flex items-center justify-center">
          <SchoolLogo className="w-[40px] h-[40px] object-contain drop-shadow-xs" logoBase64={logoBase64} />
        </div>

        {/* Middle: School Info left-aligned next to crest */}
        <div className="flex-1 flex flex-col items-start justify-center pl-2.5 pr-2 min-w-0">
          <span 
            className="tracking-wide uppercase leading-tight text-white truncate max-w-[190px] text-[9.5px] font-[800]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            ST. PAUL SECONDARY SCHOOL, NASUTI
          </span>
          <span 
            className="opacity-90 tracking-wider leading-none uppercase mt-0.5 text-white truncate w-full text-[6.5px] font-[500]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
          >
            P.O.BOX 678, NASUTI IGANGA
          </span>
        </div>

        {/* Right: Term Badge aligned to top-right corner */}
        <div className="shrink-0 flex items-center justify-center translate-y-[16px]">
          <div className="bg-[#0b1942] text-[#d4af37] border border-[#d4af37]/60 px-2.5 py-1 rounded-md text-[7.5px] font-mono font-[800] uppercase shrink-0 tracking-wider text-center shadow-xs">
            TERM 2, 2026
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-2.5 pt-1.5 pb-1 flex flex-col z-10 select-none animate-fade-in min-h-0 justify-between">
        {/* ONE LARGE ROUNDED CONTAINER IMMEDIATELY BELOW SCHOOL HEADER */}
        <div className="flex-1 border-[1.8px] border-[var(--theme-primary)] rounded-xl p-2.5 bg-white/95 flex flex-col justify-between shadow-2xs min-h-0 relative">
          {/* TITLE AT TOP CENTER WITH GOLD/BLUE DIVIDER LINE */}
          <div className="border-b-[1.5px] border-[var(--theme-primary)] pb-1 mb-1 leading-none shrink-0 flex items-center justify-between">
            <div 
              className="text-center w-full uppercase tracking-wider text-[var(--theme-text)] text-[11px] font-[800]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
            >
              STUDENT CLEARANCE CARD
            </div>
          </div>

          {/* TWO COLUMNS: Left Framed Photo, Right Wide Info Area */}
          <div className="flex-1 flex items-stretch justify-between gap-2 min-w-0 pt-0.5">
            {/* Left Column: Passport Photo framed inside rectangular box with gold outer border & white inner border */}
            <div className="w-[102px] h-full shrink-0 border-[1.5px] border-[#d4af37] rounded-xl p-[2px] bg-gradient-to-b from-amber-200 via-yellow-100 to-amber-300 flex items-center justify-center overflow-hidden shadow-sm">
              <div className="w-full h-full bg-white border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={student.name}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover object-center brightness-[1.05] contrast-[1.05]"
                    style={{ imageRendering: 'auto' }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-1">
                    <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[5px] text-slate-500 font-extrabold tracking-widest uppercase mt-0.5 leading-none">NO PHOTO</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Information section with QR Code Box in Bottom Right Corner */}
            <div className="flex-1 flex flex-col justify-between h-full min-w-0 pl-3 pr-0.5 py-0.5 relative overflow-hidden">
              {/* School Logo Watermark behind Student SurePay Code section at 4% opacity */}
              {showWatermark && (
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-[0]"
                  style={{ opacity: 0.04 }}
                >
                  <SchoolLogo className="w-28 h-28 object-contain scale-110 rotate-6" logoBase64={logoBase64} />
                </div>
              )}

              {/* 1. STUDENT SUREPAY CODE (Formatted Bank Card Grouped Style) */}
              <div className="flex flex-col justify-center pr-[52px] relative z-10 mb-[10px]" style={{ marginBottom: '10px' }}>
                <span 
                  className="text-[7px] font-[700] text-[var(--theme-text)] uppercase tracking-wider leading-none"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  STUDENT SUREPAY CODE
                </span>
                <span 
                  className="text-[11.5px] font-[800] text-slate-950 leading-tight uppercase truncate mt-[2px] tracking-[0.05em]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
                >
                  {formatSurePayCode(student.studentNo || student.adminNo || '')}
                </span>
              </div>

              {/* 2. NAME */}
              <div className="flex flex-col justify-center pr-[52px] relative z-10 mb-[10px]" style={{ marginBottom: '10px' }}>
                <span 
                  className="text-[7px] font-[700] text-[var(--theme-text)] uppercase tracking-wider leading-none"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  NAME
                </span>
                <span 
                  className="text-[11.5px] font-[800] text-slate-950 leading-tight uppercase truncate mt-[2px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
                >
                  {student.name}
                </span>
              </div>

              {/* 3. CLASS */}
              <div className="flex flex-col justify-center pr-[52px] relative z-10 mb-[10px]" style={{ marginBottom: '10px' }}>
                <span 
                  className="text-[7px] font-[700] text-[var(--theme-text)] uppercase tracking-wider leading-none"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  CLASS
                </span>
                <span 
                  className="text-[11.5px] font-[700] text-slate-950 leading-tight uppercase truncate mt-[2px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  {student.gradeClass}
                </span>
              </div>

              {/* 4. STATUS */}
              <div className="flex flex-col justify-center pr-[52px] relative z-10 mb-[10px]" style={{ marginBottom: '10px' }}>
                <span 
                  className="text-[7px] font-[700] text-[var(--theme-text)] uppercase tracking-wider leading-none"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  STATUS
                </span>
                <span 
                  className="text-[11.5px] font-[700] text-slate-950 leading-tight uppercase truncate mt-[2px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  {student.boardingStatus === 'Hosteller' || (student.boardingStatus as string) === 'Boarder' ? 'HOSTELLER' : 'DAY SCHOLAR'}
                </span>
              </div>

              {/* 5. GENDER */}
              <div className="flex flex-col justify-center pr-[52px] relative z-10">
                <span 
                  className="text-[7px] font-[700] text-[var(--theme-text)] uppercase tracking-wider leading-none"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  GENDER
                </span>
                <span 
                  className="text-[11.5px] font-[700] text-slate-950 leading-tight uppercase truncate mt-[2px]"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
                >
                  {(student.gender || 'Male').toUpperCase()}
                </span>
              </div>

              {/* Secure Digital Verification QR Feature (Smart Card Badge) */}
              <div className="absolute bottom-0 right-0 flex flex-col items-center justify-center border-[1.5px] border-[#d4af37] rounded-xl p-1 bg-gradient-to-b from-slate-900 via-slate-950 to-[#07153d] shadow-sm z-20">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="Scan to Verify QR Code"
                    className="w-[46px] h-[46px] object-contain rounded-md bg-white p-0.5"
                  />
                ) : (
                  <div className="w-[46px] h-[46px] bg-slate-50 rounded-md flex items-center justify-center text-[6px] font-bold text-slate-400">
                    QR CODE
                  </div>
                )}
                <div className="flex items-center gap-0.5 bg-[#d4af37] text-[#07153d] text-[5.5px] font-extrabold uppercase px-1.5 py-[1.5px] rounded-[4px] mt-[1.5px] tracking-wider leading-none text-center shadow-3xs">
                  <ShieldCheck className="w-2 h-2 text-[#07153d]" />
                  <span>SECURE VERIFY</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Remaining Unchanged Below Container */}
        <div 
          className="mt-1 bg-slate-50 border border-slate-300 rounded-md py-0.5 px-2 flex justify-between items-center text-[7px] font-[600] text-slate-600 relative z-10 select-none shrink-0"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
        >
          <span className="italic truncate max-w-[210px]">If found, please return to the above address.</span>
          <span className="font-mono text-[6px] font-bold text-slate-400 tracking-wider uppercase shrink-0">{serialNo}</span>
        </div>
      </div>
    </div>
  );

  const renderBackCard = () => (
    <div
      id={`card-back-${student.id}`}
      className="relative w-full max-w-[340px] h-[215px] print:w-full print:h-full bg-white rounded-xl shadow-sm border-[1.8px] border-[var(--theme-border)] flex flex-col justify-between overflow-hidden shrink-0 select-none text-slate-800 shadow-[var(--theme-badge-bg)] mx-auto"
    >
      {/* Watermark Logo behind content */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-[0]"
        style={{ opacity: showWatermark ? watermarkOpacity : 0 }}
      >
        <SchoolLogo className="w-40 h-40 scale-[1.2] rotate-12" logoBase64={logoBase64} />
      </div>

      {/* Header */}
      <div className="pl-3.5 pr-3.5 text-[var(--theme-title-text)] flex justify-between items-center relative z-10 theme-gradient-bar h-[70px] min-h-[70px] select-none">
        {/* Left: Crest */}
        <div className="shrink-0 flex items-center justify-center">
          <SchoolLogo className="w-[50px] h-[50px] object-contain" logoBase64={logoBase64} />
        </div>

        {/* Center: School Info */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 min-w-0">
          <span className="text-[11px] font-black tracking-wide uppercase leading-tight font-sans text-center text-white">
            ST. PAUL SECONDARY SCHOOL, NASUTI
          </span>
          <span className="text-[7.5px] opacity-90 font-medium tracking-wider leading-none uppercase text-center mt-1 text-white">
            P.O.BOX 678, NASUTI
          </span>
        </div>

        {/* Right: Meals Badge */}
        <div className="shrink-0 flex items-center justify-center">
          <div className="bg-white text-[var(--theme-text)] border border-slate-205/30 rounded-lg px-2 py-1 flex flex-col items-center justify-center shadow-2xs font-sans select-none">
            <span className="text-[8px] font-black tracking-wider leading-none">MEALS</span>
            <span className="text-[5px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">RECORD</span>
          </div>
        </div>
      </div>

      {/* Upgraded Student Metadata Header */}
      <div className="bg-[var(--theme-badge-bg)] border-b border-slate-200 px-3 py-1 flex justify-center items-center text-[7.5px] font-sans font-black text-[var(--theme-text)] tracking-wider relative z-10 shrink-0">
        MEAL RECORD & ATTENDANCE CARD
      </div>

      {/* Triple Calendar Grids */}
      <div className="flex-1 px-2.5 py-1.5 flex gap-2.5 justify-center items-center bg-white relative z-10">
        {renderCalendar('June', 1, 30)}
        {renderCalendar('July', 3, 31)}
      </div>

      {/* Footer authorization details */}
      <div className="bg-slate-50 px-2.5 py-1 border-t border-slate-205 flex flex-col justify-center items-center relative z-10 shrink-0 select-none">
        <div className="text-center font-sans text-[7px] italic font-black text-[var(--theme-text)] select-none">
          "God is Our Guide"
        </div>
      </div>
    </div>
  );

  const renderPaymentCard = () => (
    <div
      id={`card-payment-${student.id}`}
      className="relative w-full max-w-[340px] h-[215px] print:w-full print:h-full bg-white rounded-xl shadow-sm border-[1.8px] border-[var(--theme-border)] flex flex-col justify-between overflow-hidden shrink-0 select-none text-slate-800 transition-all duration-300 shadow-[var(--theme-badge-bg)] mx-auto"
    >
      {/* Watermark Logo behind content */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-[0]"
        style={{ opacity: showWatermark ? watermarkOpacity : 0 }}
      >
        <SchoolLogo className="w-40 h-40 scale-[1.2] rotate-12" logoBase64={logoBase64} />
      </div>

      {/* Top Bar with School Name */}
      <div className="pl-3.5 pr-3.5 text-[var(--theme-title-text)] flex justify-between items-center relative z-10 theme-gradient-bar h-[70px] min-h-[70px] select-none">
        {/* Left: Crest */}
        <div className="shrink-0 flex items-center justify-center">
          <SchoolLogo className="w-[50px] h-[50px] object-contain" logoBase64={logoBase64} />
        </div>

        {/* Center: School Info */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 min-w-0">
          <span className="text-[11px] font-black tracking-wide uppercase leading-tight font-sans text-center text-white">
            ST. PAUL SECONDARY SCHOOL, NASUTI
          </span>
          <span className="text-[7.5px] opacity-90 font-medium tracking-wider leading-none uppercase text-center mt-1 text-white">
            P.O.BOX 678, NASUTI IGANGA
          </span>
        </div>

        {/* Right: Payment Badge */}
        <div className="shrink-0 flex items-center justify-center">
          <div className="bg-white text-[var(--theme-text)] border border-slate-205/30 rounded-lg px-2 py-1 flex flex-col items-center justify-center shadow-2xs font-sans select-none">
            <span className="text-[8px] font-black tracking-wider leading-none">FEES</span>
            <span className="text-[5px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">PAYMENT</span>
          </div>
        </div>
      </div>

      {/* Student Details Row */}
      <div className="bg-[var(--theme-badge-bg)] border-b border-slate-200 px-2.5 py-1 flex justify-center items-center text-[7.5px] font-sans font-black text-[var(--theme-text)] tracking-wider relative z-10 shrink-0">
        OFFICIAL SCHOOL FEES PAYMENT LEDGER
      </div>

      {/* Main Area: Table */}
      <div className="flex-1 px-2.5 py-1 relative z-10 flex flex-col justify-center min-h-0 overflow-hidden bg-white/95">
        <table className="w-full border-collapse border border-slate-950 text-[7px] text-black bg-white shadow-3xs">
          <thead>
            <tr className="bg-slate-200 font-bold uppercase text-center text-black tracking-wider text-[7px] border-b border-slate-950">
              <th className="border border-slate-950 py-1.5 px-2 w-[22%] font-black text-left truncate">Installment</th>
              <th className="border border-slate-950 py-1.5 px-1.5 w-[24%] font-black text-center truncate">Amount (UGX)</th>
              <th className="border border-slate-950 py-1.5 px-1.5 w-[23%] font-black text-center truncate">Balance (UGX)</th>
              <th className="border border-slate-950 py-1.5 px-2 w-[31%] font-black text-left truncate">Bursar's Sign</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white">
              <td className="border border-slate-950 py-[12px] px-2 font-black font-sans text-[7.8px] text-black truncate">1st Installment</td>
              <td className="border border-slate-950 py-[12px] px-1.5"></td>
              <td className="border border-slate-950 py-[12px] px-1.5"></td>
              <td className="border border-slate-950 py-[12px] px-2"></td>
            </tr>
            <tr className="bg-slate-50">
              <td className="border border-slate-950 py-[12px] px-2 font-black font-sans text-[7.8px] text-black truncate">2nd Installment</td>
              <td className="border border-slate-950 py-[12px] px-1.5"></td>
              <td className="border border-slate-950 py-[12px] px-1.5"></td>
              <td className="border border-slate-950 py-[12px] px-2"></td>
            </tr>
            <tr className="bg-white">
              <td className="border border-slate-950 py-[12px] px-2 font-black font-sans text-[7.8px] text-black truncate">3rd Installment</td>
              <td className="border border-slate-950 py-[12px] px-1.5"></td>
              <td className="border border-slate-950 py-[12px] px-1.5"></td>
              <td className="border border-slate-950 py-[12px] px-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer bar */}
      <div className="bg-slate-50 px-2.5 py-1 border-t border-slate-205 flex flex-col justify-center items-center relative z-10 shrink-0 select-none">
        <div className="text-center font-sans text-[7px] italic font-black text-[var(--theme-text)] select-none">
          "God is Our Guide"
        </div>
      </div>
    </div>
  );

  const renderAugustCard = () => (
    <div
      id={`card-august-${student.id}`}
      className="relative w-full max-w-[340px] h-[215px] print:w-full print:h-full bg-white rounded-xl shadow-sm border-[1.8px] border-[var(--theme-border)] flex flex-col justify-between overflow-hidden shrink-0 select-none text-slate-800 transition-all duration-300 shadow-[var(--theme-badge-bg)] mx-auto"
    >
      {/* Watermark Logo behind content */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-[0]"
        style={{ opacity: showWatermark ? watermarkOpacity : 0 }}
      >
        <SchoolLogo className="w-40 h-40 scale-[1.2] rotate-12" logoBase64={logoBase64} />
      </div>

      {/* Top Bar with School Name */}
      <div className="pl-3.5 pr-3.5 text-[var(--theme-title-text)] flex justify-between items-center relative z-10 theme-gradient-bar h-[70px] min-h-[70px] select-none">
        {/* Left: Crest */}
        <div className="shrink-0 flex items-center justify-center">
          <SchoolLogo className="w-[50px] h-[50px] object-contain" logoBase64={logoBase64} />
        </div>

        {/* Center: School Info */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2 min-w-0">
          <span className="text-[11px] font-black tracking-wide uppercase leading-tight font-sans text-center text-white">
            ST. PAUL SECONDARY SCHOOL, NASUTI
          </span>
          <span className="text-[7.5px] opacity-90 font-medium tracking-wider leading-none uppercase text-center mt-1 text-white">
            P.O.BOX 678, NASUTI IGANGA
          </span>
        </div>

        {/* Right: Meals Badge */}
        <div className="shrink-0 flex items-center justify-center">
          <div className="bg-white text-[var(--theme-text)] border border-slate-205/30 rounded-lg px-2 py-1 flex flex-col items-center justify-center shadow-2xs font-sans select-none">
            <span className="text-[8px] font-black tracking-wider leading-none">MEALS</span>
            <span className="text-[5px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">AUGUST</span>
          </div>
        </div>
      </div>

      {/* Student Details Row */}
      <div className="bg-[var(--theme-badge-bg)] border-b border-slate-200 px-2.5 py-1 flex justify-center items-center text-[7.5px] font-sans font-black text-[var(--theme-text)] tracking-wider relative z-10 shrink-0">
        AUGUST STUDENT MEALS VALIDATION CARD
      </div>

      {/* Main Area: Side-By-Side Calendar */}
      <div className="flex-1 px-2.5 py-1 relative z-10 flex gap-3 items-center justify-between min-h-0 overflow-hidden bg-white/95">
        <div className="w-[170px] shrink-0">
          {renderCalendar('August', 6, 31, true)}
        </div>

        <div className="flex-1 h-full flex flex-col justify-between bg-white border border-[var(--theme-border)] rounded-lg p-1.5 min-w-0 shadow-2xs">
          {/* Section Heading */}
          <div className="text-center font-black text-[8.5px] uppercase tracking-wider text-[var(--theme-text)] border-b border-[var(--theme-border)] pb-0.5 mb-1 leading-none font-sans">
            REAM OF PAPERS CONTRIBUTION
          </div>

          {/* Illustration of 2 stacked A4 paper reams */}
          <div className="flex justify-center items-center my-0.5">
            <div className="relative w-28 h-8 flex flex-col items-center justify-center">
              {/* Top Ream */}
              <div className="absolute top-0 w-26 h-4 bg-slate-50 border border-slate-300 rounded-[2px] shadow-3xs flex items-center justify-between px-1.5 overflow-hidden">
                <div className="bg-blue-700 text-white px-1 py-0.5 text-[4.5px] font-black tracking-tighter rounded-[1px] leading-none">A4</div>
                <span className="text-[4.5px] font-extrabold text-slate-700 tracking-tighter">PREMIUM PAPER</span>
                <span className="text-[4px] font-black text-blue-900 leading-none">500 SH</span>
              </div>
              {/* Bottom Ream */}
              <div className="absolute top-2.5 w-26 h-4 bg-slate-100 border border-slate-400 rounded-[2px] shadow-2xs flex items-center justify-between px-1.5 overflow-hidden">
                <div className="bg-blue-800 text-white px-1 py-0.5 text-[4.5px] font-black tracking-tighter rounded-[1px] leading-none">A4</div>
                <span className="text-[4.5px] font-extrabold text-slate-800 tracking-tighter">PREMIUM PAPER</span>
                <span className="text-[4px] font-black text-blue-900 leading-none">500 SH</span>
              </div>
            </div>
          </div>

          {/* Record Keeping Table */}
          <div className="border border-[var(--theme-border)] rounded overflow-hidden mt-0.5">
            {/* Table Header */}
            <div className="bg-[var(--theme-text)] text-white grid grid-cols-12 gap-0.5 text-center text-[4.8px] font-black uppercase py-0.5 px-0.5 tracking-tighter">
              <div className="col-span-4 text-left pl-1">REQUIREMENT</div>
              <div className="col-span-2">RECEIVED</div>
              <div className="col-span-3">DATE</div>
              <div className="col-span-3">OFFICER'S SIGN</div>
            </div>

            {/* Row 1 */}
            <div className="grid grid-cols-12 gap-0.5 items-center py-1 px-0.5 border-b border-slate-200 bg-white">
              <div className="col-span-4 flex items-center gap-1 pl-0.5">
                <span className="w-3 h-3 bg-[var(--theme-text)] text-white rounded-full flex items-center justify-center text-[5px] font-black shrink-0 leading-none">1</span>
                <span className="text-[5px] font-extrabold text-slate-900 leading-none tracking-tighter">1 REAM OF PAPER</span>
              </div>
              <div className="col-span-2 flex justify-center">
                <div className="w-2.5 h-2.5 border border-slate-700 rounded-[1px] bg-white" />
              </div>
              <div className="col-span-3 px-0.5">
                <div className="border-b border-slate-400 h-1.5" />
              </div>
              <div className="col-span-3 px-0.5">
                <div className="border-b border-slate-400 h-1.5" />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-12 gap-0.5 items-center py-1 px-0.5 bg-slate-50/50">
              <div className="col-span-4 flex items-center gap-1 pl-0.5">
                <span className="w-3 h-3 bg-[var(--theme-text)] text-white rounded-full flex items-center justify-center text-[5px] font-black shrink-0 leading-none">2</span>
                <span className="text-[5px] font-extrabold text-slate-900 leading-none tracking-tighter">1 REAM OF PAPER</span>
              </div>
              <div className="col-span-2 flex justify-center">
                <div className="w-2.5 h-2.5 border border-slate-700 rounded-[1px] bg-white" />
              </div>
              <div className="col-span-3 px-0.5">
                <div className="border-b border-slate-400 h-1.5" />
              </div>
              <div className="col-span-3 px-0.5">
                <div className="border-b border-slate-400 h-1.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="bg-slate-50 px-2.5 py-1 border-t border-slate-205 flex flex-col justify-center items-center relative z-10 shrink-0 select-none">
        <div className="text-center font-sans text-[7px] italic font-black text-[var(--theme-text)] select-none">
          "God is Our Guide"
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 items-center w-full print:p-0 print:m-0 print:gap-0 print:block" id={`card-container-${student.id}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        
        #card-container-${student.id} {
          --theme-primary: ${classTheme.primary};
          --theme-gradient-start: ${classTheme.gradientStart};
          --theme-gradient-end: ${classTheme.gradientEnd};
          --theme-text: ${classTheme.text};
          --theme-badge-bg: ${classTheme.badgeBg};
          --theme-border: ${classTheme.border};
          --theme-title-text: ${classTheme.titleText};
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        #card-container-${student.id} * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        #card-container-${student.id} .theme-gradient-bar {
          background: linear-gradient(90deg, var(--theme-gradient-start), var(--theme-gradient-end));
        }
      `}</style>
      {side === 'both' ? (
        <div className="flex flex-col gap-6 items-center w-full">
          {/* Front Side Section */}
          <div className="w-full flex flex-col items-center gap-1.5 animate-fade-in">
            <span className="text-[9.5px] font-mono font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
              <span className="w-1.5 h-1.5 bg-indigo-550 rounded-full shrink-0" />
              FRONT SIDE: IDENTIFICATION & ATTENDANCE (JUNE & JULY)
            </span>
            <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 items-center justify-center w-full mt-1 font-sans">
              {renderBackCard()}
              {renderFrontCard()}
            </div>
          </div>

          {/* Back Side Section */}
          <div className="w-full flex flex-col items-center gap-1.5 animate-fade-in">
            <span className="text-[9.5px] font-mono font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
              BACK SIDE: FINANCIAL LEDGER & ATTENDANCE (AUGUST)
            </span>
            <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 items-center justify-center w-full mt-1">
              {renderPaymentCard()}
              {renderAugustCard()}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 items-center justify-center w-full animate-fade-in print:flex-row print:gap-0 print:p-0 print:m-0 print:w-full print:h-full">
          {side === 'front' && renderFrontCard()}
          {side === 'back' && renderBackCard()}
          {side === 'payment-only' && renderPaymentCard()}
          {side === 'august-only' && renderAugustCard()}
          {side === 'payment' && (
            <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 items-center justify-center w-full print:flex-row print:gap-2.5 print:p-0 print:m-0 print:w-full print:h-full">
              {renderPaymentCard()}
              {renderAugustCard()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
