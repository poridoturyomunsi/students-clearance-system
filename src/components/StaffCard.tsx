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

  return (
    <div 
      className="relative w-full max-w-[420px] aspect-[1.585] bg-[#0B4A8B] rounded-[16px] p-[0.6cqw] shadow-2xl overflow-hidden flex flex-col justify-between select-none font-sans"
      style={{ 
        containerType: 'inline-size',
        boxShadow: '0 12px 30px -5px rgba(11, 74, 139, 0.3), 0 8px 16px -6px rgba(11, 74, 139, 0.25)'
      } as React.CSSProperties}
    >
      {/* Inner Card Container with Light Blue Inner Border */}
      <div className="relative w-full h-full rounded-[12px] border-[1.5px] border-[#EAF5FF] overflow-hidden bg-gradient-to-br from-white via-[#F4FAFF] to-[#EAF4FF] flex flex-col justify-between p-[3cqw] z-10">
        
        {/* Background Subtle Gradient */}
        <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden bg-gradient-to-br from-white via-[#F4FAFF] to-[#EAF4FF]" />

        {/* Security Text Running Vertically on Left Margin (5% opacity) */}
        <div 
          className="absolute left-[1.2cqw] top-[38cqw] text-[1.3cqw] font-black text-[#0B4A8B]/5 tracking-wider uppercase select-none pointer-events-none origin-left"
          style={{ transform: 'rotate(-90deg) translate(-50%, 0)' }}
        >
          ST. PAUL SEC. SCH SECURITY DOCUMENT
        </div>

        {/* Security Microtext Border at the top edge */}
        <div className="absolute left-[3cqw] top-[0.6cqw] text-[0.8cqw] font-mono tracking-widest text-[#2F80ED]/30 uppercase select-none pointer-events-none">
          ST. PAUL SECONDARY SCHOOL OFFICIAL SECURITY CREDENTIAL • VERIFY ONLINE
        </div>

        {/* Subtle Security Guilloche Lines around the border (4% opacity) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04] text-[#2F80ED]" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M 3,3 C 25,1 75,1 97,3 C 99,25 99,75 97,97 C 75,99 25,99 3,97 C 1,75 1,25 3,3 Z" fill="none" stroke="currentColor" strokeWidth="0.25" />
          <path d="M 4,4 C 25,2 75,2 96,4 C 98,25 98,75 96,96 C 75,98 25,98 4,96 C 2,75 2,25 4,4 Z" fill="none" stroke="currentColor" strokeWidth="0.15" />
        </svg>

        {/* Faint School Crest Watermark in Center (softer 2% opacity) */}
        {showWatermark && (
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] scale-[1.25] rotate-6">
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
              
              {/* Hologram security badge placeholder in top-right corner */}
              <div className="absolute top-[1.2cqw] right-[1.2cqw] w-[5cqw] h-[5cqw] rounded-full bg-gradient-to-tr from-yellow-300 via-pink-400 to-cyan-300 opacity-80 border border-white/40 shadow-xs flex items-center justify-center pointer-events-none select-none overflow-hidden">
                <div className="w-full h-full bg-radial-gradient" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 80%)' }} />
              </div>

              {/* Glowing sky-blue/cyan bubble decoration on the right edge of photo */}
              <div className="absolute -right-[1cqw] top-1/2 -translate-y-1/2 w-[2.4cqw] h-[2.4cqw] bg-gradient-to-r from-sky-300 to-cyan-300 rounded-full opacity-80 blur-[0.5px] shadow-xs pointer-events-none z-20" />
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
            <div className="shrink-0 w-[25cqw] h-[50cqw] flex flex-col items-center justify-end pb-[2cqw] z-10">
              <div className="bg-[#EAF4FF] border border-[#2F80ED]/20 rounded-xl p-[1.5cqw] flex flex-col items-center justify-center gap-[1cqw] shadow-xs w-full">
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
