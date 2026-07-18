import React from 'react';
import { Staff } from '../types.ts';
import SchoolLogo from './SchoolLogo.tsx';
import { User, IdCard, Briefcase, Building2, Users } from 'lucide-react';

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
  
  // Format Date
  const formatDate = (dateInput: any) => {
    if (!dateInput) return 'Not Available';
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return 'Not Available';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
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
    issueDateStr = today.toLocaleDateString('en-GB');
    const nextFiveYears = new Date();
    nextFiveYears.setFullYear(nextFiveYears.getFullYear() + 5);
    expiryDateStr = nextFiveYears.toLocaleDateString('en-GB');
  }

  // Generate QR Code URL according to specification (/staff/verify/{staffNumber})
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
    window.location.origin + '/staff/verify/' + (staff.employeeNumber || staff.id)
  )}`;

  return (
    <div 
      className="relative w-full max-w-[420px] aspect-[1.585] bg-[#003E7E] rounded-[16px] p-[0.6cqw] shadow-2xl overflow-hidden flex flex-col justify-between select-none font-sans"
      style={{ 
        containerType: 'inline-size',
        boxShadow: '0 12px 30px -5px rgba(0, 62, 126, 0.3), 0 8px 16px -6px rgba(0, 62, 126, 0.25)'
      } as React.CSSProperties}
    >
      {/* Inner Card Container with Light Blue Inner Border */}
      <div className="relative w-full h-full rounded-[12px] border-[1.5px] border-[#EAF5FF] overflow-hidden bg-white bg-gradient-to-br from-white via-white to-[#EAF5FF] flex flex-col justify-between p-[3.2cqw] z-10">
        
        {/* Background Subtle Gradient & Modern Geometric Patterns */}
        <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden">
          {/* Fine grid pattern (blueprint style) at 4% opacity */}
          <div 
            className="absolute inset-0" 
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(11, 108, 184, 0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(11, 108, 184, 0.05) 1px, transparent 1px)
              `,
              backgroundSize: '2.5cqw 2.5cqw'
            }}
          />

          {/* Security Text Running Vertically on Left Margin (5% opacity) */}
          <div 
            className="absolute left-[1.2cqw] top-[38cqw] text-[1.3cqw] font-black text-[#003E7E]/5 tracking-wider uppercase select-none pointer-events-none origin-left"
            style={{ transform: 'rotate(-90deg) translate(-50%, 0)' }}
          >
            ST. PAUL SEC. SCH SECURITY DOCUMENT
          </div>

          {/* Faint Abstract Circles and Geometric Patterns (5% opacity) */}
          <svg className="absolute top-0 right-0 w-1/2 h-full opacity-[0.04] text-[#0B6CB8]" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="45,0 100,0 100,85" fill="currentColor" />
            <path d="M35,0 Q65,40 100,50" stroke="currentColor" strokeWidth="0.8" fill="none" />
            <path d="M25,0 Q60,45 100,68" stroke="currentColor" strokeWidth="0.8" fill="none" />
            <circle cx="88" cy="22" r="16" stroke="currentColor" strokeWidth="0.8" fill="none" />
            <circle cx="88" cy="22" r="10" stroke="currentColor" strokeWidth="0.8" fill="none" />
          </svg>
          
          <svg className="absolute bottom-0 left-0 w-1/3 h-1/2 opacity-[0.04] text-[#003E7E]" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="0,35 0,100 65,100" fill="currentColor" />
            <path d="M0,25 Q40,65 52,100" stroke="currentColor" strokeWidth="0.8" fill="none" />
            <path d="M0,15 Q45,70 65,100" stroke="currentColor" strokeWidth="0.8" fill="none" />
          </svg>

          {/* Faint School Crest Watermark in Center (5% opacity) */}
          {showWatermark && (
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] scale-[1.25] rotate-6">
              <SchoolLogo className="w-[48%] h-[48%]" logoBase64={logoBase64} />
            </div>
          )}
        </div>

        {/* Header (Logo, School Details, Badge) */}
        <div className="relative z-10 flex items-center justify-between pb-[1cqw] border-b-[1.5px] border-[#0B6CB8] w-full">
          <div className="flex items-center gap-[2cqw]">
            <div className="bg-white p-[0.3cqw] rounded-[0.8cqw] border border-[#EAF5FF] shadow-xs shrink-0 w-[9.2cqw] h-[9.2cqw] flex items-center justify-center">
              <SchoolLogo className="w-full h-full object-contain" logoBase64={logoBase64} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[7.14cqw] font-extrabold uppercase text-[#003E7E] leading-none tracking-wide" style={{ fontFamily: 'Poppins, sans-serif' }}>
                ST. PAUL SECONDARY SCHOOL, NASUTI
              </span>
              <span className="text-[3.6cqw] text-slate-500 font-bold uppercase tracking-wider mt-[0.4cqw] leading-none">
                P.O. BOX 678, NASUTI, IGANGA
              </span>
            </div>
          </div>
          
          {/* STAFF badge with blue gradient, rounded corners, shadow */}
          <div className="bg-gradient-to-r from-[#0B6CB8] to-[#003E7E] text-white text-[2cqw] font-black tracking-widest px-[2.8cqw] py-[0.6cqw] rounded-full uppercase shrink-0 shadow-md">
            STAFF
          </div>
        </div>

        {/* Middle Section (Body Area) */}
        <div className="relative z-10 flex-1 flex flex-col mt-[1.5cqw] min-h-0">
          
          {/* Center Pill: STAFF IDENTITY CARD */}
          <div className="flex justify-center w-full mb-[1.2cqw] shrink-0">
            <span className="bg-gradient-to-r from-[#0B6CB8] to-[#003E7E] text-white text-[4.28cqw] font-black px-[4cqw] py-[0.5cqw] rounded-full uppercase tracking-wider shadow-md">
              STAFF IDENTITY CARD
            </span>
          </div>

          {/* Three-Column Body Layout */}
          <div className="flex-1 flex items-center justify-between gap-[2cqw] min-h-0">
            
            {/* Column 1: Passport Photo (140px x 170px proportional: 33cqw by 40cqw) */}
            <div className="shrink-0 relative">
              <div className="w-[33cqw] h-[40.5cqw] bg-white border-[0.4cqw] border-[#0B6CB8] rounded-[1.8cqw] p-[0.4cqw] shadow-lg flex items-center justify-center overflow-hidden">
                {staff.photo ? (
                  <img 
                    src={staff.photo} 
                    alt={fullName} 
                    className="w-full h-full object-cover rounded-[1.2cqw]" 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center w-full h-full bg-slate-50">
                    <User className="w-[8cqw] h-[8cqw] text-slate-400" />
                    <span className="text-[1.8cqw] text-slate-500 font-bold mt-[0.5cqw] uppercase tracking-wider leading-none">No Photo</span>
                  </div>
                )}
              </div>
              
              {/* Glowing sky-blue/cyan bubble decoration on the right edge of photo */}
              <div className="absolute -right-[1.2cqw] top-1/2 -translate-y-1/2 w-[2.8cqw] h-[2.8cqw] bg-gradient-to-r from-sky-300 to-cyan-300 rounded-full opacity-80 blur-[0.5px] shadow-xs pointer-events-none z-20" />
            </div>

            {/* Column 2: Staff Details Table (spaced wider and moved to right) */}
            <div className="flex-1 flex flex-col justify-center text-left min-w-0 h-[40.5cqw] pl-[1cqw]">
              <div className="grid grid-cols-[20cqw_1fr] gap-x-[1cqw] gap-y-[1.8cqw] text-[3.8cqw] items-center text-slate-800 leading-none">
                
                {/* NAME */}
                <div className="flex items-center gap-[1cqw] text-[#003E7E]">
                  <User className="w-[2.8cqw] h-[2.8cqw] text-[#0B6CB8]" />
                  <span className="font-extrabold uppercase text-[3.57cqw]" style={{ letterSpacing: '3px' }}>NAME:</span>
                </div>
                <span className="font-extrabold text-black uppercase truncate text-[3.8cqw]">{fullName}</span>

                {/* STAFF NO */}
                <div className="flex items-center gap-[1cqw] text-[#003E7E]">
                  <IdCard className="w-[2.8cqw] h-[2.8cqw] text-[#0B6CB8]" />
                  <span className="font-extrabold uppercase text-[3.57cqw]" style={{ letterSpacing: '3px' }}>STAFF NO:</span>
                </div>
                <span className="font-extrabold text-black uppercase font-mono truncate text-[3.8cqw]">{staffNo}</span>

                {/* DESIGNATION */}
                <div className="flex items-center gap-[1cqw] text-[#003E7E]">
                  <Briefcase className="w-[2.8cqw] h-[2.8cqw] text-[#0B6CB8]" />
                  <span className="font-extrabold uppercase text-[3.57cqw]" style={{ letterSpacing: '3px' }}>DESIGNATION:</span>
                </div>
                <span className="font-extrabold text-black uppercase truncate text-[3.8cqw]">{position}</span>

                {/* DEPARTMENT */}
                <div className="flex items-center gap-[1cqw] text-[#003E7E]">
                  <Building2 className="w-[2.8cqw] h-[2.8cqw] text-[#0B6CB8]" />
                  <span className="font-extrabold uppercase text-[3.57cqw]" style={{ letterSpacing: '3px' }}>DEPARTMENT:</span>
                </div>
                <span className="font-extrabold text-black uppercase truncate text-[3.8cqw]">{department}</span>

                {/* GENDER */}
                <div className="flex items-center gap-[1cqw] text-[#003E7E]">
                  <Users className="w-[2.8cqw] h-[2.8cqw] text-[#0B6CB8]" />
                  <span className="font-extrabold uppercase text-[3.57cqw]" style={{ letterSpacing: '3px' }}>GENDER:</span>
                </div>
                <span className="font-extrabold text-black uppercase truncate text-[3.8cqw]">{staff.gender || 'Female'}</span>
              </div>
            </div>

            {/* Column 3: Redesigned White QR Verification Box */}
            <div className="shrink-0 bg-white border-[2px] border-[#0B6CB8] rounded-[18px] shadow-[0_4px_12px_rgba(11,108,184,0.08)] w-[32.14cqw] h-[39.28cqw] flex flex-col items-center justify-between p-[2.5cqw] z-10">
              <div className="w-[22.62cqw] h-[22.62cqw] flex items-center justify-center bg-white overflow-hidden">
                <img src={qrCodeUrl} alt="Verification QR" className="w-full h-full object-contain" />
              </div>
              <span className="text-[2.85cqw] font-black text-[#0B6CB8] tracking-[1px] text-center uppercase leading-none mt-[0.5cqw]">
                Scan to Verify
              </span>
            </div>

          </div>
        </div>

        {/* Bottom Section (4 equally sized columns with vertical separation lines) */}
        <div className="relative z-10 grid grid-cols-4 items-end justify-between pt-[1.2cqw] border-t border-slate-200 mt-[1.8cqw] shrink-0 h-[7.5cqw] w-full text-center">
          
          {/* Column 1: Issue Date */}
          <div className="flex flex-col items-center justify-end h-full">
            <span className="text-[2.85cqw] text-[#0B6CB8] font-bold uppercase tracking-wider leading-none">
              Issue Date
            </span>
            <span className="text-black font-mono font-bold text-[3.8cqw] mt-[0.3cqw] leading-none">
              {issueDateStr}
            </span>
          </div>

          {/* Vertical divider */}
          <div className="absolute left-[25%] bottom-[0.5cqw] w-[1px] h-[5cqw] bg-slate-300" />

          {/* Column 2: Holder's Signature */}
          <div className="flex flex-col items-center justify-end h-full relative">
            <span className="text-[2.85cqw] text-[#0B6CB8] font-bold uppercase tracking-wider leading-none mb-[0.2cqw]">
              Holder's Signature
            </span>
            <div className="h-[3.6cqw] border-b border-slate-200 w-[16cqw] flex items-end justify-center pb-[0.2cqw]">
              {staff.signature ? (
                <img 
                  src={staff.signature} 
                  alt="Staff signature" 
                  className="max-h-full object-contain" 
                />
              ) : (
                <span className="text-[2cqw] font-mono italic text-slate-400 capitalize">
                  {staff.lastName || 'Staff'}
                </span>
              )}
            </div>
          </div>

          {/* Vertical divider */}
          <div className="absolute left-[50%] bottom-[0.5cqw] w-[1px] h-[5cqw] bg-slate-300" />

          {/* Column 3: Authorised Signature */}
          <div className="flex flex-col items-center justify-end h-full relative">
            <span className="text-[2.85cqw] text-[#0B6CB8] font-bold uppercase tracking-wider leading-none mb-[0.2cqw]">
              Authorised Signature
            </span>
            <div className="h-[3.6cqw] border-b border-slate-200 w-[16cqw] flex items-end justify-center pb-[0.2cqw]">
              {staff.signature ? (
                <img 
                  src={staff.signature} 
                  alt="Authorized signature" 
                  className="max-h-full object-contain brightness-95" 
                />
              ) : (
                <span className="text-[2cqw] font-mono italic text-slate-400 capitalize">
                  {staff.lastName || 'Authorized'}
                </span>
              )}
            </div>
          </div>

          {/* Vertical divider */}
          <div className="absolute left-[75%] bottom-[0.5cqw] w-[1px] h-[5cqw] bg-slate-300" />

          {/* Column 4: Expiry Date */}
          <div className="flex flex-col items-center justify-end h-full">
            <span className="text-[2.85cqw] text-[#0B6CB8] font-bold uppercase tracking-wider leading-none">
              Expiry Date
            </span>
            <span className="text-rose-600 font-mono font-bold text-[3.8cqw] mt-[0.3cqw] leading-none">
              {expiryDateStr}
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}
