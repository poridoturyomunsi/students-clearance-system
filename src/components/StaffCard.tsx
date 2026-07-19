import React from 'react';
import { Staff } from '../types.ts';
import SchoolLogo from './SchoolLogo.tsx';
import { Calendar, PenTool, CheckCircle2, Clock } from 'lucide-react';

interface StaffCardProps {
  staff: Staff;
  logoBase64?: string | null;
  showWatermark?: boolean;
}

export default function StaffCard({ staff, logoBase64, showWatermark = true }: StaffCardProps) {
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
      className="relative w-full max-w-[420px] aspect-[1.585] bg-[#0B4A8B] rounded-[16px] p-[0.6cqw] shadow-2xl overflow-hidden flex flex-col justify-between select-none font-sans"
      style={{ 
        containerType: 'inline-size',
        boxShadow: '0 12px 30px -5px rgba(11, 74, 139, 0.3), 0 8px 16px -6px rgba(11, 74, 139, 0.25)'
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
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 420 265" fill="none">
            <defs>
              {/* Security Micro Grid Pattern */}
              <pattern id="sec-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#2F80ED" strokeWidth="0.08" strokeOpacity="0.04" />
                <circle cx="4" cy="4" r="0.25" fill="#9B51E0" fillOpacity="0.05" />
              </pattern>
              
              {/* Guilloche Pattern 1 (intersecting lines) */}
              <pattern id="guilloche-pattern" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(25)">
                <path d="M 0 8 Q 4 0 8 8 T 16 8" fill="none" stroke="#27AE60" strokeWidth="0.08" strokeOpacity="0.03" />
                <path d="M 0 8 Q 4 16 8 8 T 16 8" fill="none" stroke="#9B51E0" strokeWidth="0.08" strokeOpacity="0.03" />
              </pattern>

              {/* Diagonal Crosshatch Anti-Copy Mesh */}
              <pattern id="anti-copy-mesh" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#2F80ED" strokeWidth="0.06" strokeOpacity="0.04" />
                <path d="M 6 0 L 6 12 M 0 6 L 12 6" fill="none" stroke="#9B51E0" strokeWidth="0.06" strokeOpacity="0.03" />
              </pattern>
            </defs>

            {/* Background grid and anti-copy fills */}
            <rect width="420" height="265" fill="url(#sec-grid)" />
            <rect width="420" height="265" fill="url(#guilloche-pattern)" />
            <rect width="420" height="265" fill="url(#anti-copy-mesh)" />
            
            {/* Outer security border frame - multiple nested fine lines (passport-inspired) */}
            <rect x="4" y="4" width="412" height="257" rx="10" fill="none" stroke="#0B4A8B" strokeWidth="0.35" strokeOpacity="0.12" />
            <rect x="6" y="6" width="408" height="253" rx="8" fill="none" stroke="#2F80ED" strokeWidth="0.2" strokeOpacity="0.1" />
            <rect x="8" y="8" width="404" height="249" rx="7" fill="none" stroke="#27AE60" strokeWidth="0.12" strokeOpacity="0.08" strokeDasharray="3,1" />
            <rect x="10" y="10" width="400" height="245" rx="6" fill="none" stroke="#9B51E0" strokeWidth="0.15" strokeOpacity="0.08" />

            {/* Corner Security Accents - Geometric Line Art */}
            {/* Top Left */}
            <path d="M 4,16 C 12,16 16,12 16,4 M 4,20 C 16,20 20,16 20,4 M 4,24 C 20,24 24,20 24,4" fill="none" stroke="#2F80ED" strokeWidth="0.18" strokeOpacity="0.08" />
            {/* Top Right */}
            <path d="M 416,16 C 408,16 404,12 404,4 M 416,20 C 404,20 400,16 400,4 M 416,24 C 400,24 396,20 396,4" fill="none" stroke="#2F80ED" strokeWidth="0.18" strokeOpacity="0.08" />
            {/* Bottom Left */}
            <path d="M 4,249 C 12,249 16,253 16,261 M 4,245 C 16,245 20,249 20,261 M 4,241 C 20,241 24,245 24,261" fill="none" stroke="#9B51E0" strokeWidth="0.18" strokeOpacity="0.08" />
            {/* Bottom Right */}
            <path d="M 416,249 C 408,249 404,253 404,261 M 416,245 C 404,245 400,249 400,261 M 416,241 C 400,241 396,245 396,261" fill="none" stroke="#9B51E0" strokeWidth="0.18" strokeOpacity="0.08" />

            {/* Concentric Security Circles in background */}
            <circle cx="210" cy="132.5" r="115" fill="none" stroke="#0B4A8B" strokeWidth="0.12" strokeOpacity="0.03" />
            <circle cx="210" cy="132.5" r="100" fill="none" stroke="#2F80ED" strokeWidth="0.12" strokeOpacity="0.04" strokeDasharray="5,2" />
            <circle cx="210" cy="132.5" r="85" fill="none" stroke="#9B51E0" strokeWidth="0.12" strokeOpacity="0.03" />
            <circle cx="210" cy="132.5" r="70" fill="none" stroke="#27AE60" strokeWidth="0.12" strokeOpacity="0.04" strokeDasharray="1,3" />

            {/* Faint Map-Style Wavy Contour Textures */}
            {Array.from({ length: 6 }).map((_, i) => {
              const radius = 60 + i * 16;
              let path = '';
              const steps = 120;
              for (let j = 0; j <= steps; j++) {
                const angle = (j * Math.PI * 2) / steps;
                const wave = Math.sin(angle * 16) * 1.5 + Math.cos(angle * 8) * 0.8;
                const r = radius + wave;
                const x = 210 + r * Math.cos(angle);
                const y = 132.5 + r * Math.sin(angle);
                if (j === 0) {
                  path += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
                } else {
                  path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
                }
              }
              return (
                <path
                  key={`contour-${i}`}
                  d={path}
                  fill="none"
                  stroke="#0B4A8B"
                  strokeWidth="0.12"
                  strokeOpacity="0.035"
                />
              );
            })}

            {/* Holographic Wave Effect - Family A (Cyan-Blue) */}
            {Array.from({ length: 8 }).map((_, i) => {
              const yOffset = i * 26 + 35;
              const amplitude = 4;
              const frequency = 0.045;
              let path = `M 4 ${yOffset}`;
              for (let x = 4; x <= 416; x += 6) {
                const y = yOffset + Math.sin(x * frequency + i * 0.6) * amplitude;
                path += ` L ${x} ${y}`;
              }
              return (
                <path
                  key={`wave-a-${i}`}
                  d={path}
                  fill="none"
                  stroke="#2F80ED"
                  strokeWidth="0.14"
                  strokeOpacity="0.05"
                />
              );
            })}

            {/* Holographic Wave Effect - Family B (Violet-Purple Shifted) */}
            {Array.from({ length: 8 }).map((_, i) => {
              const yOffset = i * 26 + 37;
              const amplitude = 4;
              const frequency = 0.045;
              let path = `M 4 ${yOffset}`;
              for (let x = 4; x <= 416; x += 6) {
                const y = yOffset + Math.sin(x * frequency + i * 0.6 + 0.8) * amplitude;
                path += ` L ${x} ${y}`;
              }
              return (
                <path
                  key={`wave-b-${i}`}
                  d={path}
                  fill="none"
                  stroke="#9B51E0"
                  strokeWidth="0.12"
                  strokeOpacity="0.04"
                />
              );
            })}

            {/* UV-style fluorescent elements */}
            <path d="M 20,40 Q 110,120 200,40 T 380,40" fill="none" stroke="#39FF14" strokeWidth="0.3" strokeOpacity="0.015" />
            <path d="M 40,220 Q 150,140 260,220 T 400,220" fill="none" stroke="#FF007F" strokeWidth="0.3" strokeOpacity="0.015" />
            <circle cx="210" cy="132.5" r="55" fill="none" stroke="#00FFFF" strokeWidth="0.25" strokeOpacity="0.02" strokeDasharray="3,6" />

            {/* Concentric Ellipse Rosette - Center */}
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 360) / 24;
              return (
                <ellipse
                  key={`ros-center-${i}`}
                  cx="210"
                  cy="132.5"
                  rx="60"
                  ry="12"
                  fill="none"
                  stroke="#9B51E0"
                  strokeWidth="0.18"
                  strokeOpacity="0.07"
                  transform={`rotate(${angle} 210 132.5)`}
                />
              );
            })}
            {/* Inner Ring Rosette - Center */}
            {Array.from({ length: 18 }).map((_, i) => {
              const angle = (i * 360) / 18;
              return (
                <ellipse
                  key={`ros-center-inner-${i}`}
                  cx="210"
                  cy="132.5"
                  rx="30"
                  ry="6"
                  fill="none"
                  stroke="#2F80ED"
                  strokeWidth="0.22"
                  strokeOpacity="0.09"
                  transform={`rotate(${angle} 210 132.5)`}
                />
              );
            })}

            {/* Banknote-grade Spirograph Rosettes (Hypotrochoids) */}
            {/* Central Rosette Spirograph */}
            <path
              d={getSpirographPath(210, 132.5, 48, 18, 22, 9)}
              fill="none"
              stroke="#9B51E0"
              strokeWidth="0.2"
              strokeOpacity="0.08"
            />
            <path
              d={getSpirographPath(210, 132.5, 48.2, 18, 22, 9)}
              fill="none"
              stroke="#2F80ED"
              strokeWidth="0.2"
              strokeOpacity="0.08"
            />

            {/* Photo Rosette Spirograph (Behind Photo) */}
            <path
              d={getSpirographPath(65, 125, 32, 12, 14, 8)}
              fill="none"
              stroke="#2F80ED"
              strokeWidth="0.16"
              strokeOpacity="0.06"
            />

            {/* QR Rosette Spirograph (Behind QR) */}
            <path
              d={getSpirographPath(360, 150, 28, 10, 12, 8)}
              fill="none"
              stroke="#27AE60"
              strokeWidth="0.16"
              strokeOpacity="0.06"
            />

            {/* Rosette - Left (Behind Photo Ellipses) */}
            {Array.from({ length: 16 }).map((_, i) => {
              const angle = (i * 360) / 16;
              return (
                <ellipse
                  key={`ros-photo-${i}`}
                  cx="65"
                  cy="125"
                  rx="35"
                  ry="8"
                  fill="none"
                  stroke="#2F80ED"
                  strokeWidth="0.15"
                  strokeOpacity="0.05"
                  transform={`rotate(${angle} 65 125)`}
                />
              );
            })}

            {/* Rosette - Right (Behind QR Code Ellipses) */}
            {Array.from({ length: 16 }).map((_, i) => {
              const angle = (i * 360) / 16;
              return (
                <ellipse
                  key={`ros-qr-${i}`}
                  cx="360"
                  cy="150"
                  rx="30"
                  ry="7"
                  fill="none"
                  stroke="#27AE60"
                  strokeWidth="0.15"
                  strokeOpacity="0.05"
                  transform={`rotate(${angle} 360 150)`}
                />
              );
            })}

            {/* Fine Microtext Borders at Top and Bottom */}
            <text x="12" y="13" fontSize="2.2" fontFamily="monospace" fill="#0B4A8B" fillOpacity="0.12" letterSpacing="0.8">
              ST. PAUL SECONDARY SCHOOL OFFICIAL SECURITY CREDENTIAL • VERIFY ONLINE
            </text>
            <text x="12" y="253" fontSize="2.2" fontFamily="monospace" fill="#0B4A8B" fillOpacity="0.12" letterSpacing="0.8">
              ST. PAUL SECONDARY SCHOOL OFFICIAL SECURITY CREDENTIAL • VERIFY ONLINE
            </text>
          </svg>
        </div>

        {/* Security Text Running Vertically on Left Margin (5% opacity) */}
        <div 
          className="absolute left-[1.2cqw] top-[38cqw] text-[1.3cqw] font-black text-[#0B4A8B]/5 tracking-wider uppercase select-none pointer-events-none origin-left"
          style={{ transform: 'rotate(-90deg) translate(-50%, 0)' }}
        >
          ST. PAUL SEC. SCH SECURITY DOCUMENT
        </div>

        {/* Faint School Crest Watermark in Center (softer 5% opacity for semi-transparency) */}
        {showWatermark && (
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] scale-[1.4] rotate-6 z-0 pointer-events-none select-none">
            <SchoolLogo className="w-[48%] h-[48%]" logoBase64={logoBase64} />
          </div>
        )}

        {/* Header (Logo, School Details, Badge) */}
        <div className="relative z-10 flex items-center justify-between pb-[0.8cqw] border-b-[1.5px] border-[#2F80ED]/30 w-full">
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
            <div className="flex-1 flex flex-col justify-center text-left min-w-0 h-[50cqw] pl-[1cqw]">
              <div className="grid grid-cols-[22cqw_1fr] gap-x-[1cqw] gap-y-[2.2cqw] text-[3.2cqw] text-slate-800">
                
                {/* Name */}
                <span className="font-bold text-[#6B7280] tracking-[0.5px] self-start pt-[0.4cqw]">Name:</span>
                <span className="font-extrabold text-[#0B4A8B] uppercase text-[4.2cqw] leading-[1.15] break-words pr-[1cqw]">{fullName}</span>

                {/* Staff No */}
                <span className="font-bold text-[#6B7280] tracking-[0.5px]">Staff No:</span>
                <span className="font-bold text-[#1E3A5F] uppercase font-mono truncate text-[3.6cqw]">{staffNo}</span>

                {/* Designation */}
                <span className="font-bold text-[#6B7280] tracking-[0.5px]">Designation:</span>
                <span className="font-bold text-[#1E3A5F] uppercase truncate text-[3.6cqw]">{position}</span>

                {/* Department */}
                <span className="font-bold text-[#6B7280] tracking-[0.5px]">Department:</span>
                <span className="font-bold text-[#1E3A5F] uppercase truncate text-[3.6cqw]">{department}</span>

                {/* Gender */}
                <span className="font-bold text-[#6B7280] tracking-[0.5px]">Gender:</span>
                <span className="font-bold text-[#1E3A5F] uppercase truncate text-[3.6cqw]">{staff.gender || 'Female'}</span>
              </div>
            </div>

            {/* Column 3: Verification QR Code Section (narrower, 20% smaller QR) */}
            <div className="shrink-0 w-[25cqw] h-[50cqw] flex flex-col items-center justify-end pb-[0.5cqw] z-10">
              <div className="bg-[#EAF4FF] border border-[#2F80ED]/20 rounded-xl p-[1.5cqw] flex flex-col items-center justify-center gap-[0.4cqw] shadow-xs w-full pt-[2.2cqw]">
                <img src={qrCodeUrl} alt="Verification QR" className="w-[17cqw] h-[17cqw] object-contain rounded-md" />
                <div className="flex flex-col items-center leading-none text-center">
                  <span className="text-[1.6cqw] font-bold text-[#0B4A8B] tracking-[0.5px] uppercase">
                    Scan QR Code
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Section (Premium Shaded Corporate Footer with Icons) */}
        <div className="relative z-20 grid grid-cols-4 items-center justify-between pt-[1.5cqw] pb-[1cqw] border-t border-slate-100 mt-[1.5cqw] shrink-0 h-[10.5cqw] w-full text-center bg-[#F8FAFC]">
          
          {/* Column 1: Issue Date */}
          <div className="flex flex-col items-center justify-center h-full gap-[0.4cqw]">
            <div className="flex items-center gap-[0.8cqw] text-[#6B7280]">
              <Calendar className="w-[2.2cqw] h-[2.2cqw] stroke-[2]" />
              <span className="text-[1.8cqw] font-semibold tracking-wide uppercase leading-none">
                Issue Date
              </span>
            </div>
            <span className="text-[#1E3A5F] font-extrabold text-[2.6cqw] leading-none">
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
              {staff.signature ? (
                <img 
                  src={staff.signature} 
                  alt="Staff signature" 
                  className="max-h-full object-contain" 
                />
              ) : (
                <span className="text-[2.2cqw] font-mono italic text-slate-400 capitalize">
                  {staff.lastName || 'Staff'}
                </span>
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
              {staff.signature ? (
                <img 
                  src={staff.signature} 
                  alt="Authorized signature" 
                  className="max-h-full object-contain brightness-95" 
                />
              ) : (
                <span className="text-[2.2cqw] font-mono italic text-slate-400 capitalize">
                  {isHeadTeacher ? (staff.lastName || 'Head Teacher') : 'Authorized'}
                </span>
              )}
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
            <span className="text-[#2F80ED] font-extrabold text-[2.6cqw] leading-none">
              {expiryDateStr}
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}
