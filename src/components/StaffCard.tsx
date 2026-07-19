import React, { useState } from 'react';
import { Staff } from '../types.ts';
import SchoolLogo from './SchoolLogo.tsx';
import { Calendar, PenTool, CheckCircle2, Clock } from 'lucide-react';

interface StaffCardProps {
  staff: Staff;
  logoBase64?: string | null;
  authorizedSignatureBase64?: string | null;
  showWatermark?: boolean;
  side?: 'front' | 'back';
}

export default function StaffCard({ staff, logoBase64, authorizedSignatureBase64, showWatermark = true, side = 'front' }: StaffCardProps) {
  // Mouse tilt hover tracking for holographic shimmer
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (x - 0.5) * 15, y: (y - 0.5) * 15 });
  };
  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const tiltStyle = {
    transform: `perspective(1000px) rotateX(${-tilt.y}deg) rotateY(${tilt.x}deg)`,
    transition: 'transform 0.1s ease-out, box-shadow 0.1s ease-out',
  };

  // Details
  const fullName = `${staff.firstName || ''} ${staff.middleName ? staff.middleName + ' ' : ''}${staff.lastName || ''}`.trim() || staff.name || 'Not Available';
  const staffNo = staff.employeeNumber || staff.id || 'Not Available';
  const position = staff.position || 'Not Available';
  const department = staff.department || 'Not Available';
  const isHeadTeacher = (staff.position || '').replace(/\s+/g, '').toUpperCase() === 'HEADTEACHER';
  
  // Format Date to '24 Jun 2026'
  const formatDate = (dateInput: any) => {
    if (!dateInput) return 'Not Available';
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return 'Not Available';
      const day = d.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = months[d.getMonth()];
      const year = d.getFullYear();
      return `${day} ${monthName} ${year}`;
    } catch {
      return 'Not Available';
    }
  };

  let issueDateStr = 'Not Available';
  let expiryDateStr = 'Not Available';

  if (staff.activeCard) {
    issueDateStr = formatDate(staff.activeCard.issue_date);
    expiryDateStr = formatDate(staff.activeCard.expiry_date);
  } else {
    // Default fallback
    const today = new Date();
    issueDateStr = formatDate(today);
    const nextFiveYears = new Date();
    nextFiveYears.setFullYear(nextFiveYears.getFullYear() + 5);
    expiryDateStr = formatDate(nextFiveYears);
  }

  // Generate QR Code URL according to specification (/staff/verify/{staffNumber})
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
    window.location.origin + '/staff/verify/' + (staff.employeeNumber || staff.id)
  )}`;

  if (side === 'back') {
    let hash = 0;
    const str = staff.employeeNumber || staff.id || '';
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().slice(0, 8).padStart(8, '0');
    const serialStr = `SN-${hex}`;

    return (
      <div 
        className="relative w-full max-w-[420px] aspect-[1.585] bg-[#0B4A8B] rounded-[16px] p-[0.6cqw] shadow-2xl overflow-hidden flex flex-col justify-between select-none font-sans group"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ 
          containerType: 'inline-size',
          boxShadow: '0 12px 30px -5px rgba(11, 74, 139, 0.3), 0 8px 16px -6px rgba(11, 74, 139, 0.25)',
          ...tiltStyle
        } as React.CSSProperties}
      >
        {/* Inner Card Container with Light Blue Inner Border */}
        <div className="relative w-full h-full rounded-[12px] border-[1.5px] border-[#EAF5FF] overflow-hidden bg-white flex flex-col justify-between p-[3cqw] z-10">
          


          {/* Security Background Layer (Subtle Grid & Wave Guilloche) */}
          <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden bg-white">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 420 265" fill="none">
              <defs>
                <pattern id="sec-grid-back" width="16" height="16" patternUnits="userSpaceOnUse">
                  <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#2F80ED" strokeWidth="0.12" strokeOpacity="0.06" />
                </pattern>
                <pattern id="guilloche-back" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 0 20 Q 10 5, 20 20 T 40 20" fill="none" stroke="#2F80ED" strokeWidth="0.12" strokeOpacity="0.06" />
                  <path d="M 0 20 Q 10 35, 20 20 T 40 20" fill="none" stroke="#2F80ED" strokeWidth="0.12" strokeOpacity="0.06" />
                </pattern>
              </defs>
              <rect width="420" height="265" fill="url(#sec-grid-back)" />
              <rect width="420" height="265" fill="url(#guilloche-back)" />
              <path d="M-20,50 C100,20 200,80 440,50" fill="none" stroke="#2F80ED" strokeWidth="0.15" strokeOpacity="0.08" />
              <path d="M-20,90 C100,60 200,120 440,90" fill="none" stroke="#2F80ED" strokeWidth="0.15" strokeOpacity="0.08" />
              <path d="M-20,130 C100,100 200,160 440,130" fill="none" stroke="#2F80ED" strokeWidth="0.15" strokeOpacity="0.08" />
              <path d="M-20,170 C100,140 200,200 440,170" fill="none" stroke="#2F80ED" strokeWidth="0.15" strokeOpacity="0.08" />
            </svg>
          </div>

          {/* Faint School Crest Watermark in Center (9% opacity for security watermark) */}
          {showWatermark && (
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.09] scale-[1.2] pointer-events-none select-none z-0">
              <SchoolLogo className="w-[45%] h-[45%]" logoBase64={logoBase64} />
            </div>
          )}

          {/* Header */}
          <div className="relative z-10 flex items-start justify-between w-full border-b border-slate-100 pb-[1.2cqw]">
            <div className="flex flex-col text-left">
              <span className="text-[2.8cqw] font-black uppercase text-[#062C54] leading-none tracking-wide" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                ST. PAUL SECONDARY SCHOOL, NASUTI
              </span>
              <span className="text-[1.9cqw] text-slate-500 font-bold uppercase tracking-wider mt-[0.5cqw] leading-none">
                P.O. Box 678, Nasuti, Iganga
              </span>
            </div>
            <div className="text-right flex flex-col items-end pr-[2cqw]">
              <span className="text-[1.9cqw] text-slate-450 font-bold tracking-wide leading-none">
                ID Card Number: <span className="text-[#062C54] font-black">{staffNo}</span>
              </span>
            </div>
          </div>

          {/* Card Ownership Statement & Rules */}
          <div className="relative z-10 flex-1 flex flex-col justify-start text-left mt-[1.8cqw] gap-[1cqw]">
            <div className="inline-self-start border-b-[1.5px] border-[#062C54] pb-[0.2cqw]">
              <span className="text-[2.2cqw] font-black uppercase text-[#062C54] tracking-wider leading-none">
                CARD OWNERSHIP STATEMENT & RULES:
              </span>
            </div>
            <div className="flex flex-col gap-[1.2cqw] text-[2.05cqw] text-slate-600 font-semibold leading-[1.3] pl-[0.5cqw]">
              <div className="flex items-start gap-[1.5cqw]">
                <span className="font-black text-[#062C54]">1.</span>
                <span>This card is the property of St. Paul Secondary School, Nasuti.</span>
              </div>
              <div className="flex items-start gap-[1.5cqw]">
                <span className="font-black text-[#062C54]">2.</span>
                <span>If found, please return to the school administration office at the address listed above.</span>
              </div>
              <div className="flex items-start gap-[1.5cqw]">
                <span className="font-black text-[#062C54]">3.</span>
                <span>In the event of loss, this card must be reported immediately to the School Administration Office.</span>
              </div>
            </div>
          </div>

          {/* Thin horizontal line separating the rules from footer */}
          <div className="w-full h-[1px] bg-slate-200/80 my-[1.2cqw] z-10 relative" />

          {/* Footer Area */}
          <div className="relative z-10 flex items-center justify-between w-full h-[10.2cqw] shrink-0 pb-[0.4cqw]">
            {/* Info Block (Bottom Left) */}
            <div className="flex flex-col text-left gap-[0.6cqw] text-[1.85cqw] pb-[0.2cqw]">
              <div className="leading-none">
                <span className="font-extrabold text-slate-500 tracking-[0.2px]">TEL:</span>{' '}
                <span className="font-medium text-slate-700">+256 776246610</span>
              </div>
              <div className="leading-none">
                <span className="font-extrabold text-slate-500 tracking-[0.2px]">EMAIL:</span>{' '}
                <span className="font-medium text-slate-700">stpaulssnasuti2022@gmail.com</span>
              </div>
              <div className="leading-none">
                <span className="font-extrabold text-slate-500 tracking-[0.2px]">SERIAL:</span>{' '}
                <span className="font-bold text-[#062C54] font-mono">{serialStr}</span>
              </div>
            </div>

            {/* Barcode Block (Bottom Right) */}
            <div className="flex flex-col items-center gap-[0.5cqw] mt-[-1cqw]">
              <div className="bg-white p-[0.4cqw] px-[1.8cqw] border border-slate-200 rounded-md flex items-center justify-center h-[6.5cqw]">
                {/* SVG Barcode representation */}
                <svg className="w-[23cqw] h-[5.5cqw]" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <g fill="#000000">
                    <rect x="0" width="2" height="24" />
                    <rect x="3" width="1" height="24" />
                    <rect x="5" width="3" height="24" />
                    <rect x="9" width="1" height="24" />
                    <rect x="11" width="2" height="24" />
                    <rect x="15" width="4" height="24" />
                    <rect x="20" width="1" height="24" />
                    <rect x="22" width="2" height="24" />
                    <rect x="25" width="3" height="24" />
                    <rect x="29" width="1" height="24" />
                    <rect x="31" width="2" height="24" />
                    <rect x="34" width="4" height="24" />
                    <rect x="39" width="1" height="24" />
                    <rect x="41" width="2" height="24" />
                    <rect x="44" width="3" height="24" />
                    <rect x="48" width="1" height="24" />
                    <rect x="50" width="2" height="24" />
                    <rect x="53" width="4" height="24" />
                    <rect x="58" width="1" height="24" />
                    <rect x="60" width="2" height="24" />
                    <rect x="63" width="3" height="24" />
                    <rect x="67" width="1" height="24" />
                    <rect x="69" width="2" height="24" />
                    <rect x="72" width="4" height="24" />
                    <rect x="77" width="1" height="24" />
                    <rect x="79" width="2" height="24" />
                    <rect x="82" width="3" height="24" />
                    <rect x="86" width="1" height="24" />
                    <rect x="88" width="2" height="24" />
                    <rect x="91" width="4" height="24" />
                    <rect x="96" width="2" height="24" />
                  </g>
                </svg>
              </div>
              <span className="text-[1.85cqw] font-bold font-mono text-slate-700 tracking-[0.08em] uppercase leading-none text-center">
                {staffNo}
              </span>
            </div>
          </div>

          {/* Transparent Holographic Laminate Overlay (screen-only reflection, invisible by default) */}
          <div 
            className="absolute inset-0 pointer-events-none z-40 overflow-hidden mix-blend-color-dodge transition-opacity duration-500 opacity-[0.02] group-hover:opacity-[0.15]"
            style={{
              background: `linear-gradient(${135 + tilt.x * 2}deg, rgba(255,255,255,0) 0%, rgba(255,0,128,0.1) 20%, rgba(0,255,255,0.12) 40%, rgba(255,255,0,0.1) 60%, rgba(0,255,128,0.1) 80%, rgba(255,255,255,0) 100%)`,
              backgroundSize: '300% 300%',
              backgroundPosition: `${50 + tilt.x * 3}% ${50 + tilt.y * 3}%`,
            }}
          >
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 420 265" fill="none">
              <defs>
                <linearGradient id="holo-laminate-rainbow-back" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff007f" stopOpacity="0.4" />
                  <stop offset="25%" stopColor="#00f3ff" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#ffe600" stopOpacity="0.4" />
                  <stop offset="75%" stopColor="#00ff66" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#ff007f" stopOpacity="0.4" />
                </linearGradient>
                
                {/* Repeating holographic logo pattern (smaller, cleaner) */}
                <pattern id="holo-logo-pattern-back" width="50" height="50" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
                  <ellipse cx="25" cy="25" rx="10" ry="3" fill="none" stroke="url(#holo-laminate-rainbow-back)" strokeWidth="0.08" strokeOpacity="0.1" />
                  <ellipse cx="25" cy="25" rx="3" ry="10" fill="none" stroke="url(#holo-laminate-rainbow-back)" strokeWidth="0.08" strokeOpacity="0.1" />
                  <path d="M25,18 L31,25 L25,32 L19,25 Z" fill="none" stroke="url(#holo-laminate-rainbow-back)" strokeWidth="0.1" strokeOpacity="0.1" />
                  <text x="25" y="40" textAnchor="middle" fill="url(#holo-laminate-rainbow-back)" fontSize="2.8" fontWeight="bold" opacity="0.12">ST. PAUL</text>
                </pattern>
              </defs>

              {/* Repeating logo pattern fill */}
              <rect width="420" height="265" fill="url(#holo-logo-pattern-back)" />

              {/* Fine holographic security waves embedded within the transparent overlay */}
              <path d="M-20,50 Q100,20 210,60 T440,40" fill="none" stroke="url(#holo-laminate-rainbow-back)" strokeWidth="0.08" strokeOpacity="0.12" />
              <path d="M-20,130 Q100,100 210,140 T440,120" fill="none" stroke="url(#holo-laminate-rainbow-back)" strokeWidth="0.08" strokeOpacity="0.12" />
              <path d="M-20,210 Q100,180 210,220 T440,200" fill="none" stroke="url(#holo-laminate-rainbow-back)" strokeWidth="0.08" strokeOpacity="0.12" />

              {/* Fine holographic microtext paths */}
              <path id="holo-wave-text-1-back" d="M-20,90 C100,70 200,110 440,90" fill="none" />
              <text className="font-bold text-[2.5px] tracking-[0.15em]" fill="url(#holo-laminate-rainbow-back)" opacity="0.12">
                <textPath href="#holo-wave-text-1-back" startOffset="0%">
                  ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE * ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE *
                </textPath>
              </text>

              <path id="holo-wave-text-2-back" d="M-20,170 C100,150 200,190 440,170" fill="none" />
              <text className="font-bold text-[2.5px] tracking-[0.15em]" fill="url(#holo-laminate-rainbow-back)" opacity="0.12">
                <textPath href="#holo-wave-text-2-back" startOffset="0%">
                  ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE * ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE *
                </textPath>
              </text>
            </svg>
          </div>

        </div>
      </div>
    );
  }

  // Spirograph generator for government-grade security print rosettes
  const getSpirographPath = (cx: number, cy: number, R: number, r: number, p: number, rotations: number = 8) => {
    let path = '';
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
      const theta = (i * Math.PI * 2 * rotations) / steps;
      const x = cx + (R - r) * Math.cos(theta) + p * Math.cos(((R - r) * theta) / r);
      const y = cy + (R - r) * Math.sin(theta) - p * Math.sin(((R - r) * theta) / r);
      if (i === 0) {
        path += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      } else {
        path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }
    }
    return path;
  };

  return (
    <div 
      className="relative w-full max-w-[420px] aspect-[1.585] bg-[#0B4A8B] rounded-[16px] p-[0.6cqw] shadow-2xl overflow-hidden flex flex-col justify-between select-none font-sans group"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ 
        containerType: 'inline-size',
        boxShadow: '0 12px 30px -5px rgba(11, 74, 139, 0.3), 0 8px 16px -6px rgba(11, 74, 139, 0.25)',
        ...tiltStyle
      } as React.CSSProperties}
    >
      {/* Inner Card Container with Light Blue Inner Border */}
      <div className="relative w-full h-full rounded-[12px] border-[1.5px] border-[#EAF5FF] overflow-hidden bg-white flex flex-col justify-between p-[3cqw] z-10">
        
        {/* Security Background Layer */}
        <div 
          className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden"
          style={{
            background: 'radial-gradient(circle at 10% 10%, #EAF4FF 0%, transparent 60%), radial-gradient(circle at 90% 10%, #EDF7ED 0%, transparent 60%), radial-gradient(circle at 90% 90%, #FAF5EC 0%, transparent 60%), radial-gradient(circle at 10% 90%, #F5EFFF 0%, transparent 60%), radial-gradient(circle at 50% 50%, #FFF5FA 0%, #FFFFFF 100%)'
          }}
        />

        {/* Security Text Running Vertically on Left Margin (5% opacity) */}
        <div 
          className="absolute left-[1.2cqw] top-[38cqw] text-[1.3cqw] font-black text-[#0B4A8B]/5 tracking-wider uppercase select-none pointer-events-none origin-left"
          style={{ transform: 'rotate(-90deg) translate(-50%, 0)' }}
        >
          ST. PAUL SEC. SCH SECURITY DOCUMENT
        </div>

        {/* Faint School Crest Watermark in Center (4% opacity) */}
        {showWatermark && (
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] scale-[1.6] rotate-6 z-0 pointer-events-none select-none">
            <SchoolLogo className="w-[48%] h-[48%]" logoBase64={logoBase64} />
          </div>
        )}

        {/* Header (Logo, School Details, Badge) */}
        <div className="relative z-10 flex items-center justify-between pb-[0.8cqw] w-full">
          <div className="flex items-center gap-[2cqw]">
            <div className="bg-white p-[0.3cqw] rounded-[0.8cqw] border border-[#EAF4FF] shadow-xs shrink-0 w-[9.2cqw] h-[9.2cqw] flex items-center justify-center">
              <SchoolLogo className="w-full h-full object-contain" logoBase64={logoBase64} />
            </div>
            <div className="flex flex-col text-left pr-[18cqw]">
              <span className="text-[6.8cqw] font-extrabold uppercase text-[#0B4A8B] leading-none tracking-wide" style={{ fontFamily: 'Poppins, sans-serif' }}>
                ST. PAUL SECONDARY SCHOOL, NASUTI
              </span>
              <span className="text-[3.4cqw] text-slate-500 font-bold uppercase tracking-wider mt-[0.4cqw] leading-none">
                P.O. BOX 678, NASUTI, IGANGA
              </span>
            </div>
          </div>
          
          {/* STAFF pill-shaped corner badge */}
          <div className="absolute top-[5.8cqw] right-0 bg-[#0B4A8B] text-white text-[1.6cqw] font-extrabold tracking-widest px-[3.2cqw] py-[0.8cqw] rounded-full uppercase shadow-xs z-20">
            STAFF
          </div>
        </div>

        {/* Centered Pill: STAFF IDENTITY CARD (shifted right) */}
        <div className="flex justify-start pl-[30cqw] mt-[1.2cqw] mb-[0.2cqw] w-full z-10 shrink-0">
          <div className="bg-gradient-to-r from-[#0B4A8B] to-[#2F80ED] text-white text-[1.9cqw] font-black tracking-widest px-[4cqw] py-[0.6cqw] rounded-full uppercase shadow-xs">
            STAFF IDENTITY CARD
          </div>
        </div>

        {/* Middle Section (Body Area - shifted down slightly for breathing room) */}
        <div className="relative z-10 flex-1 flex flex-col mt-[1.5cqw] min-h-0">
          
          {/* Three-Column Body Layout */}
          <div className="flex-1 flex items-center justify-between gap-[2cqw] min-h-0">
            
            {/* Column 1: Passport Photo (reduced size by 10%) */}
            <div className="shrink-0 relative">
              <div className="w-[37cqw] h-[45cqw] bg-white border-[0.18cqw] border-[#2F80ED]/15 rounded-[12px] p-[0.2cqw] shadow-md flex items-center justify-center overflow-hidden">
                {staff.photo ? (
                  <img 
                    src={staff.photo} 
                    alt={fullName} 
                    className="w-full h-full object-cover rounded-[10px]" 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center w-full h-full bg-slate-50">
                    <span className="text-[1.8cqw] text-slate-400 font-bold uppercase tracking-wider leading-none">No Photo</span>
                  </div>
                )}
              </div>


            </div>

            {/* Column 2: Staff Details List (expanded width) */}
            <div className="flex-1 flex flex-col justify-start pt-[3.5cqw] text-left min-w-0 h-[50cqw] pl-[1cqw] gap-[1.6cqw]">
              
              {/* Name Row */}
              <div className="flex items-start gap-[1cqw] w-full">
                <span className="font-normal text-slate-500 tracking-[0.5px] min-w-[20cqw] pt-[0.4cqw] text-[3.2cqw]">Name:</span>
                <span className="font-extrabold text-[#0B4A8B] uppercase text-[4.2cqw] leading-[1.15] break-words pr-[1cqw] flex-1">{fullName}</span>
              </div>

              {/* Staff ID Row (reduced spacing between Name and Staff ID) */}
              <div className="flex items-center gap-[1cqw] w-full mt-[-0.6cqw]">
                <span className="font-normal text-slate-500 tracking-[0.5px] min-w-[20cqw] text-[3.2cqw]">Staff No:</span>
                <span className="font-semibold text-[#1E3A5F] uppercase font-mono truncate text-[3.6cqw] flex-1">{staffNo}</span>
              </div>

              {/* Designation Row */}
              <div className="flex items-center gap-[1cqw] w-full">
                <span className="font-normal text-slate-500 tracking-[0.5px] min-w-[20cqw] text-[3.2cqw]">Designation:</span>
                <span className="font-semibold text-[#1E3A5F] uppercase truncate text-[3.6cqw] flex-1">{position}</span>
              </div>

              {/* Department Row */}
              <div className="flex items-center gap-[1cqw] w-full">
                <span className="font-normal text-slate-500 tracking-[0.5px] min-w-[20cqw] text-[3.2cqw]">Department:</span>
                <span className="font-semibold text-[#1E3A5F] uppercase truncate text-[3.6cqw] flex-1">{department}</span>
              </div>

              {/* Gender Row */}
              <div className="flex items-center gap-[1cqw] w-full">
                <span className="font-normal text-slate-500 tracking-[0.5px] min-w-[20cqw] text-[3.2cqw]">Gender:</span>
                <span className="font-semibold text-[#1E3A5F] uppercase truncate text-[3.6cqw] flex-1">{staff.gender || 'Female'}</span>
              </div>

            </div>

            {/* Column 3: Verification QR Code Section (narrower, 20% smaller QR) */}
            <div className="shrink-0 w-[17cqw] h-[50cqw] flex flex-col items-center justify-end pb-[0.5cqw] z-10">
              <div className="bg-white border border-[#2F80ED] rounded-xl p-[0.6cqw] pt-[1.4cqw] pb-[1.0cqw] flex flex-col items-center justify-center gap-[0.5cqw] shadow-xs w-full">
                <img src={qrCodeUrl} alt="Verification QR" className="w-[13cqw] h-[13cqw] object-contain mt-[0.2cqw]" />
                <div className="flex flex-col items-center leading-none text-center">
                  <span className="text-[1.8cqw] font-bold text-[#0B4A8B] tracking-[0.2px]">
                    Scan QR Code
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Section (Premium Shaded Corporate Footer with Icons) */}
        <div className="relative z-20 grid grid-cols-4 items-center justify-between pt-[1.5cqw] pb-[1cqw] mt-[1.5cqw] shrink-0 h-[10.5cqw] w-full text-center bg-[#F8FAFC]">
          
          {/* Column 1: Issue Date */}
          <div className="flex flex-col items-center justify-center h-full gap-[0.4cqw]">
            <div className="flex items-center gap-[0.8cqw] text-[#6B7280]">
              <Calendar className="w-[2.2cqw] h-[2.2cqw] stroke-[2]" />
              <span className="text-[1.8cqw] font-semibold tracking-wide uppercase leading-none">
                Issue Date
              </span>
            </div>
            <span 
              className="text-[#1E3A5F] text-[2.5cqw] leading-none tracking-[0.15em] font-medium"
              style={{ fontFamily: '"Montserrat", sans-serif' }}
            >
              {issueDateStr}
            </span>
          </div>

          {/* Vertical divider */}
          <div className="absolute left-[25%] bottom-[1cqw] w-[1px] h-[6cqw] bg-slate-200/60" />

          {/* Column 2: Holder's Signature */}
          <div className="flex flex-col items-center justify-center h-full relative gap-[0.4cqw]">
            <div className="flex items-center gap-[0.8cqw] text-[#6B7280]">
              <PenTool className="w-[2.2cqw] h-[2.2cqw] stroke-[2]" />
              <span className="text-[1.8cqw] font-semibold tracking-wide uppercase leading-none">
                Holder Signature
              </span>
            </div>
            <div className="h-[3.6cqw] flex items-center justify-center pb-[0.2cqw]">
              {staff.signature && (
                <img 
                  src={staff.signature} 
                  alt="Staff signature" 
                  className="max-h-full object-contain" 
                />
              )}
            </div>
          </div>

          {/* Vertical divider */}
          <div className="absolute left-[50%] bottom-[1cqw] w-[1px] h-[6cqw] bg-slate-200/60" />

          {/* Column 3: Authorised Signature */}
          <div className="flex flex-col items-center justify-center h-full relative gap-[0.4cqw]">
            <div className="flex items-center gap-[0.8cqw] text-[#6B7280]">
              <CheckCircle2 className="w-[2.2cqw] h-[2.2cqw] stroke-[2]" />
              <span className="text-[1.8cqw] font-semibold tracking-wide uppercase leading-none">
                Authorized Signature
              </span>
            </div>
            <div className="h-[3.6cqw] flex items-center justify-center pb-[0.2cqw]">
              {isHeadTeacher ? (
                staff.signature ? (
                  <img 
                    src={staff.signature} 
                    alt="Authorized signature" 
                    className="max-h-full object-contain brightness-95" 
                  />
                ) : authorizedSignatureBase64 ? (
                  <img 
                    src={authorizedSignatureBase64} 
                    alt="Authorized signature" 
                    className="max-h-full object-contain brightness-95" 
                  />
                ) : null
              ) : authorizedSignatureBase64 ? (
                <img 
                  src={authorizedSignatureBase64} 
                  alt="Authorized signature" 
                  className="max-h-full object-contain brightness-95" 
                />
              ) : null}
            </div>
          </div>

          {/* Vertical divider */}
          <div className="absolute left-[75%] bottom-[1cqw] w-[1px] h-[6cqw] bg-slate-200/60" />

          {/* Column 4: Expiry Date */}
          <div className="flex flex-col items-center justify-center h-full gap-[0.4cqw]">
            <div className="flex items-center gap-[0.8cqw] text-[#6B7280]">
              <Clock className="w-[2.2cqw] h-[2.2cqw] stroke-[2]" />
              <span className="text-[1.8cqw] font-semibold tracking-wide uppercase leading-none">
                Expiry Date
              </span>
            </div>
            <span 
              className="text-[#2F80ED] text-[2.5cqw] leading-none tracking-[0.15em] font-medium"
              style={{ fontFamily: '"Montserrat", sans-serif' }}
            >
              {expiryDateStr}
            </span>
          </div>

        </div>

        {/* Transparent Holographic Laminate Overlay (screen-only reflection, invisible by default) */}
        <div 
          className="absolute inset-0 pointer-events-none z-40 overflow-hidden mix-blend-color-dodge transition-opacity duration-500 opacity-[0.02] group-hover:opacity-[0.15]"
          style={{
            background: `linear-gradient(${135 + tilt.x * 2}deg, rgba(255,255,255,0) 0%, rgba(255,0,128,0.1) 20%, rgba(0,255,255,0.12) 40%, rgba(255,255,0,0.1) 60%, rgba(0,255,128,0.1) 80%, rgba(255,255,255,0) 100%)`,
            backgroundSize: '300% 300%',
            backgroundPosition: `${50 + tilt.x * 3}% ${50 + tilt.y * 3}%`,
          }}
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 420 265" fill="none">
            <defs>
              <linearGradient id="holo-laminate-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff007f" stopOpacity="0.4" />
                <stop offset="25%" stopColor="#00f3ff" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#ffe600" stopOpacity="0.4" />
                <stop offset="75%" stopColor="#00ff66" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#ff007f" stopOpacity="0.4" />
              </linearGradient>
              
              {/* Repeating holographic logo pattern (smaller, cleaner) */}
              <pattern id="holo-logo-pattern" width="50" height="50" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
                <ellipse cx="25" cy="25" rx="10" ry="3" fill="none" stroke="url(#holo-laminate-rainbow)" strokeWidth="0.08" strokeOpacity="0.1" />
                <ellipse cx="25" cy="25" rx="3" ry="10" fill="none" stroke="url(#holo-laminate-rainbow)" strokeWidth="0.08" strokeOpacity="0.1" />
                <path d="M25,18 L31,25 L25,32 L19,25 Z" fill="none" stroke="url(#holo-laminate-rainbow)" strokeWidth="0.1" strokeOpacity="0.1" />
                <text x="25" y="40" textAnchor="middle" fill="url(#holo-laminate-rainbow)" fontSize="2.8" fontWeight="bold" opacity="0.12">ST. PAUL</text>
              </pattern>
            </defs>

            {/* Repeating logo pattern fill */}
            <rect width="420" height="265" fill="url(#holo-logo-pattern)" />

            {/* Fine holographic security waves embedded within the transparent overlay */}
            <path d="M-20,50 Q100,20 210,60 T440,40" fill="none" stroke="url(#holo-laminate-rainbow)" strokeWidth="0.08" strokeOpacity="0.12" />
            <path d="M-20,130 Q100,100 210,140 T440,120" fill="none" stroke="url(#holo-laminate-rainbow)" strokeWidth="0.08" strokeOpacity="0.12" />
            <path d="M-20,210 Q100,180 210,220 T440,200" fill="none" stroke="url(#holo-laminate-rainbow)" strokeWidth="0.08" strokeOpacity="0.12" />

            {/* Fine holographic microtext paths */}
            <path id="holo-wave-text-1" d="M-20,90 C100,70 200,110 440,90" fill="none" />
            <text className="font-bold text-[2.5px] tracking-[0.15em]" fill="url(#holo-laminate-rainbow)" opacity="0.12">
              <textPath href="#holo-wave-text-1" startOffset="0%">
                ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE * ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE *
              </textPath>
            </text>

            <path id="holo-wave-text-2" d="M-20,170 C100,150 200,190 440,170" fill="none" />
            <text className="font-bold text-[2.5px] tracking-[0.15em]" fill="url(#holo-laminate-rainbow)" opacity="0.12">
              <textPath href="#holo-wave-text-2" startOffset="0%">
                ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE * ST. PAUL SECONDARY SCHOOL NASUTI * SECURE ID CARD LAMINATE *
              </textPath>
            </text>
          </svg>
        </div>

      </div>
    </div>
  );
}
