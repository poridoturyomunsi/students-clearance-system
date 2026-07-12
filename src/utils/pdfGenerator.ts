/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { Student } from '../types.ts';
import { getClassTheme } from './classColors.ts';
import { enhanceStudentPhotoForPdf } from './imageProcessor.ts';
import { DEFAULT_SCHOOL_LOGO } from '../components/SchoolLogo.tsx';
import { getApiBaseUrl } from './api.ts';

async function fetchStudentPhotoAsBase64(studentId: string): Promise<string | null> {
  try {
    const url = `${getApiBaseUrl()}/api/students/${studentId}/photo`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Failed to fetch photo for student ${studentId}:`, error);
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function lightenColor(rgb: { r: number; g: number; b: number }, amount: number = 0.25): { r: number; g: number; b: number } {
  return {
    r: Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount)),
    g: Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount)),
    b: Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount))
  };
}

// Code 39 lookup table
const CODE39_PATTERNS: Record<string, string> = {
  '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN',
  '4': 'NNNWWNNNW', '5': 'WNNWWNNNN', '6': 'NNWWWNNNN', '7': 'NNNWNNWNW',
  '8': 'WNNWNNWNN', '9': 'NNWWNNWNN', 'A': 'WNNNNWNNW', 'B': 'NNWNNWNNW',
  'C': 'WNWNNWNNN', 'D': 'NNNNWWNNW', 'E': 'WNNNWWNNN', 'F': 'NNWNWWNNN',
  'G': 'NNNNNWWNW', 'H': 'WNNNNWWNN', 'I': 'NNWNNWWNN', 'J': 'NNNNWWWNN',
  'K': 'WNNNNNNWW', 'L': 'NNWNNNNWW', 'M': 'WNWNNNNWN', 'N': 'NNNNWNNWW',
  'O': 'WNNNWNNWN', 'P': 'NNWNWNNWN', 'Q': 'NNNNNNWWW', 'R': 'WNNNNNWWN',
  'S': 'NNWNNNWWN', 'T': 'NNNNWNWWN', 'U': 'WWNNNNNNW', 'V': 'NWWNNNNNW',
  'W': 'WWWNNNNNN', 'X': 'NWNNWNNNW', 'Y': 'WWNNWNNNN', 'Z': 'NWWNWNNNN',
  '-': 'NWNNNNWNW', '.': 'WWNNNNWNN', ' ': 'NWWNNNWNN', '*': 'NWNNWNNWN',
};

// Draw a native vector Code 39 barcode in the PDF
function drawPdfBarcode(doc: jsPDF, x: number, y: number, value: string, height: number, scaleWidth: number) {
  const formatted = value.toUpperCase().trim();
  // Filter barcode input
  let filtered = '';
  for (let idx = 0; idx < formatted.length; idx++) {
    const char = formatted[idx];
    if (CODE39_PATTERNS[char] !== undefined) {
      filtered += char;
    } else {
      filtered += '-';
    }
  }
  const code = `*${filtered}*`;
  
  const narrow = 0.22 * scaleWidth;
  const wide = 0.65 * scaleWidth;
  const interGap = 0.3 * scaleWidth;
  
  let curX = x;
  doc.setFillColor(0, 0, 0); // Black

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const pat = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];
    for (let j = 0; j < 9; j++) {
      const isBar = j % 2 === 0;
      const bit = pat[j];
      const w = bit === 'W' ? wide : narrow;
      if (isBar) {
        doc.rect(curX, y, w, height, 'F');
      }
      curX += w;
    }
    curX += interGap;
  }
}

// Draw a semi-transparent watermark logo in the center of cards
function drawSafeWatermark(
  doc: jsPDF, 
  logoBase64: string | null | undefined, 
  x: number, 
  y: number, 
  w: number, 
  h: number, 
  opacity = 0.08
) {
  if (!logoBase64) return;
  try {
    const isSvg = logoBase64.includes('svg+xml');
    const format = isSvg ? 'SVG' : 'PNG';
    
    let hasGState = false;
    try {
      // jsPDF v2+ support GState for alpha transparency, wrap safely to prevent unexpected runtime errors
      const gStateClass = (doc as any).GState || (doc.constructor as any).GState;
      if (gStateClass) {
        const gStateObj = new gStateClass({ opacity });
        doc.saveGraphicsState();
        doc.setGState(gStateObj);
        hasGState = true;
      }
    } catch (err) {
      console.warn("Could not set GState for watermark transparency:", err);
    }

    doc.addImage(logoBase64, format, x, y, w, h, undefined, 'NONE');

    if (hasGState) {
      try {
        doc.restoreGraphicsState();
      } catch (err) {
        try {
          const gStateClass = (doc as any).GState || (doc.constructor as any).GState;
          doc.setGState(new gStateClass({ opacity: 1.0 }));
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error("Error drawing safe watermark:", e);
  }
}

// Generate the cells and lay the calendar grid out in vector PDF coordinates (fully scalable)
function drawCalendarPdf(
  doc: jsPDF, 
  x: number, 
  y: number, 
  monthName: string, 
  startDayOfWeek: number, 
  totalDays: number, 
  cellW = 3.2, 
  cellH = 2.6
) {
  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const scale = cellW / 4.8;
  
  // Set month title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5 * scale);
  doc.setTextColor(0, 0, 0); // Solid black for extreme print contrast
  doc.text(`${monthName.toUpperCase()} 2026`, x + (7 * cellW) / 2, y + 2.0 * scale, { align: 'center' });
  
  // Underline for month title
  doc.setDrawColor(120, 120, 120); // Darker gray divider
  doc.setLineWidth(0.25);
  doc.line(x, y + 3.0 * scale, x + (7 * cellW), y + 3.0 * scale);
  
  // Draw weekdays letters
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.0 * scale);
  doc.setTextColor(0, 0, 0); // Dark text to prevent fading
  
  for (let dIdx = 0; dIdx < 7; dIdx++) {
    doc.text(daysOfWeek[dIdx], x + dIdx * cellW + cellW / 2 + 0.3, y + 5.2 * scale, { align: 'center' });
  }
  
  // Render grid numbers
  // Mon-indexed start days padding
  const padding = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
  let cellXIdx = padding;
  let cellYIdx = 0;
  
  for (let curDay = 1; curDay <= totalDays; curDay++) {
    const rx = x + cellXIdx * cellW;
    const ry = y + (6.5 * scale) + cellYIdx * cellH;
    
    const dIndex = (startDayOfWeek - 1 + curDay - 1) % 7;
    const isWeekend = dIndex === 5 || dIndex === 6;

    // Draw tiny light border cell with weekend highlight backgrounds
    if (isWeekend) {
      doc.setFillColor(250, 245, 235); // Sharp weekend bg
      doc.setDrawColor(180, 180, 180); // Darker border
    } else {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(180, 180, 180); // Darker border
    }
    
    doc.setLineWidth(0.16);
    doc.roundedRect(rx + 0.1, ry + 0.1, cellW - 0.2, cellH - 0.2, 0.4, 0.4, 'FD');
    
    // Print day number centered vertically and horizontally inside the box
    doc.setFont('helvetica', 'bold'); // Cleaner and sharper standard sans-serif font
    doc.setFontSize(5.6 * scale);
    doc.setTextColor(0, 0, 0); // Pitched solid black text
    doc.text(curDay.toString(), rx + cellW / 2, ry + (cellH / 2) + 0.8 * scale, { align: 'center' });
    
    // Increment indices
    cellXIdx++;
    if (cellXIdx >= 7) {
      cellXIdx = 0;
      cellYIdx++;
    }
  }
}

// Draw the front of the student card in vector PDF format
function drawCardFrontPdf(
  doc: jsPDF, 
  x: number, 
  y: number, 
  student: Student, 
  cw: number, 
  ch: number, 
  logoBase64?: string | null,
  showWatermark = true,
  watermarkOpacityVal = 0.25,
  increasePdfBrightness = false
) {
  const serialNo = `SPSSN-2026-${(student.adminNo || student.id || "0000").replace(/[^0-9]/g, "").slice(0, 5).padStart(5, "0")}`;
  
  const classTheme = getClassTheme(student.gradeClass);
  let themeBorder = hexToRgb(classTheme.border);
  let themeGStart = hexToRgb(classTheme.gradientStart);
  let themeGEnd = hexToRgb(classTheme.gradientEnd);
  let themeText = hexToRgb(classTheme.text);
  let themeBadgeBg = hexToRgb(classTheme.badgeBg);
  let themePrimary = hexToRgb(classTheme.primary);

  if (increasePdfBrightness) {
    themeBorder = lightenColor(themeBorder, 0.25);
    themeGStart = lightenColor(themeGStart, 0.25);
    themeGEnd = lightenColor(themeGEnd, 0.25);
    themeBadgeBg = lightenColor(themeBadgeBg, 0.25);
    themePrimary = lightenColor(themePrimary, 0.25);
    // Ensure text remains dark and clear
    themeText = { r: Math.max(0, themeText.r - 20), g: Math.max(0, themeText.g - 20), b: Math.max(0, themeText.b - 20) };
  }

  // Set Card stroke color and gradient configuration
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  const r1 = themeGStart.r, g1 = themeGStart.g, b1 = themeGStart.b;
  const r2 = themeGEnd.r, g2 = themeGEnd.g, b2 = themeGEnd.b;
  
  // 1. Draw solid rounded border card base (thin clean border for high contrast printing)
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');
  
  // 2. Clear border card headers gradient ribbon color overlay
  // Rounded corners base with color 1 on left and color 2 on right
  doc.setFillColor(r1, g1, b1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 22.0, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 10.0, 8.0, 12.5, 'F');
  
  doc.setFillColor(r2, g2, b2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 22.0, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 10.0, 8.0, 12.5, 'F');
  
  // Transition gradient slices in the flat middle section (from x+4.0 to x+cw-4.0)
  const gStartX = x + 4.0;
  const gWidth = cw - 8.0;
  const steps = 30;
  const stepW = gWidth / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const gr = Math.round(r1 + (r2 - r1) * t);
    const gg = Math.round(g1 + (g2 - g1) * t);
    const gb = Math.round(b1 + (b2 - b1) * t);
    doc.setFillColor(gr, gg, gb);
    doc.rect(gStartX + i * stepW, y + 0.5, stepW + 0.1, 22.5, 'F');
  }
  
  // Draw school logo icon (increased size by an additional 20% to 16.2mm)
  let hasImageDrawn = false;
  const logoSize = 16.2;
  const logoX = x + 3.0;
  const logoY = y + 3.4;

  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      doc.addImage(logoBase64, isSvg ? 'SVG' : 'PNG', logoX, logoY, logoSize, logoSize, undefined, 'NONE');
      hasImageDrawn = true;
    } catch (e) {
      console.warn("Could not draw logoBase64 directly via addImage, using fallback:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(19, 15, 60);
    doc.roundedRect(logoX, logoY, logoSize, logoSize, 2.0, 2.0, 'F');
    doc.setFillColor(124, 58, 45);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.35);
    doc.triangle(logoX + 0.8, logoY + 0.8, logoX + logoSize - 0.8, logoY + 0.8, logoX + logoSize / 2, logoY + logoSize - 1.8, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(19, 15, 60);
    doc.setLineWidth(0.2);
    doc.triangle(logoX + 2.4, logoY + 2.4, logoX + logoSize - 2.4, logoY + 2.4, logoX + logoSize / 2, logoY + logoSize - 3.6, 'FD');
  }
  
  // Card title centered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + cw / 2, y + 7.2, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI IGANGA', x + cw / 2, y + 11.2, { align: 'center' });
  
  // White right badge on Header (centered under details)
  doc.setFillColor(255, 255, 255, 0.18);
  doc.roundedRect(x + cw / 2 - 10.5, y + 14.5, 21.0, 4.5, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('TERM 2, 2026', x + cw / 2, y + 17.7, { align: 'center' });

  // Draw passport photo on the far right of the header
  const headerPicW = 13.5;
  const headerPicH = 17.0;
  const headerPicX = x + cw - 16.5;
  const headerPicY = y + 3.0; // Centered vertically in 23mm height (with 3mm padding top/bottom)

  // Thin outer border/mask representing card framing in header
  doc.setDrawColor(255, 255, 255, 0.5);
  doc.setFillColor(255, 255, 255, 0.2);
  doc.setLineWidth(0.15);
  doc.roundedRect(headerPicX, headerPicY, headerPicW, headerPicH, 0.6, 0.6, 'FD');

  let hasStudentPhotoDrawn = false;
  if (student.photo) {
    try {
      const fmtMatch = student.photo.match(/^data:image\/([a-zA-Z]+);base64,/);
      const format = fmtMatch ? fmtMatch[1].toUpperCase() : 'JPEG';
      doc.addImage(student.photo, format, headerPicX + 0.2, headerPicY + 0.2, headerPicW - 0.4, headerPicH - 0.4, undefined, 'NONE');
      hasStudentPhotoDrawn = true;
    } catch (e) {
      console.warn("Could not draw student passport photo in header:", e);
    }
  }

  if (!hasStudentPhotoDrawn) {
    doc.setLineWidth(0.25);
    doc.setDrawColor(255, 255, 255);
    doc.ellipse(headerPicX + headerPicW / 2, headerPicY + 5.0, 1.8, 1.8); // Head
    doc.ellipse(headerPicX + headerPicW / 2, headerPicY + 10.5, 4.2, 2.0, 'S'); // Shoulders
  }

  // Draw safe luxury white frame outline over photo
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.roundedRect(headerPicX + 0.05, headerPicY + 0.05, headerPicW - 0.1, headerPicH - 0.1, 0.5, 0.5, 'D');

  // School logo background watermark
  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 3.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }

  // 6. Main Details Container (Full-width table-like presentation)
  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b); // Professional Custom color border
  doc.setLineWidth(0.3); // Medium border thickness
  doc.roundedRect(x + 3.0, y + 24.5, cw - 6.0, 5.2, 0.8, 0.8, 'FD'); // Spanning the full width of details panel with rounded corners

  // Add the student clearance card banner labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(themeText.r, themeText.g, themeText.b); // Professional color to match border
  doc.text('STUDENT CLEARANCE CARD', x + 5.0, y + 28.1);
  doc.text(`ID: ${student.adminNo}`, x + cw - 5.0, y + 28.1, { align: 'right' });

  // Two-column layout details values
  const col1X = x + 5.0;
  const col2X = x + 46.0;
  const colonOffset1 = 13.0;
  const colonOffset2 = 16.0;
  const valueOffset1 = 15.5;
  const valueOffset2 = 18.5;

  // Row 1: NAME (spans full width)
  const r1Y = y + 34.0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('NAME', col1X, r1Y);
  doc.text(':', col1X + colonOffset1, r1Y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  doc.text(student.name.toUpperCase(), col1X + valueOffset1, r1Y);

  doc.setDrawColor(240, 240, 240);
  doc.setLineWidth(0.15);
  doc.line(col1X, y + 36.0, x + cw - 5.0, y + 36.0);

  // Row 2: CLASS & GENDER
  const r2Y = y + 40.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('CLASS', col1X, r2Y);
  doc.text(':', col1X + colonOffset1, r2Y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  doc.text(student.gradeClass.toUpperCase(), col1X + valueOffset1, r2Y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('GENDER', col2X, r2Y);
  doc.text(':', col2X + colonOffset2, r2Y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  doc.text((student.gender || 'Male').toUpperCase(), col2X + valueOffset2, r2Y);

  doc.line(col1X, y + 42.5, col1X + 38.0, y + 42.5);
  doc.line(col2X, y + 42.5, x + cw - 5.0, y + 42.5);

  // Row 3: STATUS & ELIGIBILITY
  const r3Y = y + 47.0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('STATUS', col1X, r3Y);
  doc.text(':', col1X + colonOffset1, r3Y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 0, 0);
  const boardLabel = (student.boardingStatus === 'Hosteller' ? 'HOSTELLER' : 'DAY SCHOLAR').toUpperCase();
  doc.text(boardLabel, col1X + valueOffset1, r3Y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('ELIGIBILITY', col2X, r3Y);
  doc.text(':', col2X + colonOffset2, r3Y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  if (student.isCleared) {
    doc.setTextColor(16, 120, 60);
    doc.text('CLEARED', col2X + valueOffset2, r3Y);
  } else {
    doc.setTextColor(200, 30, 30);
    doc.text('ON HOLD', col2X + valueOffset2, r3Y);
  }

  doc.setDrawColor(240, 240, 240);
  doc.setLineWidth(0.15);
  doc.line(col1X, y + 49.0, col1X + 38.0, y + 49.0);
  doc.line(col2X, y + 49.0, x + cw - 5.0, y + 49.0);
  
  // 7. Card Footer band containing return instructions text (User specified)
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  doc.line(x, y + ch - 4.5, x + cw, y + ch - 4.5);
  doc.rect(x + 0.3, y + ch - 4.5, cw - 0.6, 4.3, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(0, 0, 0); // High contrast solid black for printer readability
  doc.text('If found, please return to the above address.', x + cw / 2, y + ch - 1.6, { align: 'center' });
}

// Draw the back of the student card in vector PDF format
function drawCardBackPdf(
  doc: jsPDF, 
  x: number, 
  y: number, 
  student: Student, 
  cw: number, 
  ch: number, 
  logoBase64?: string | null,
  showWatermark = true,
  watermarkOpacityVal = 0.25,
  increasePdfBrightness = false
) {
  const serialNo = `SPSSN-2026-${(student.adminNo || student.id || "0000").replace(/[^0-9]/g, "").slice(0, 5).padStart(5, "0")}`;

  const classTheme = getClassTheme(student.gradeClass);
  let themeBorder = hexToRgb(classTheme.border);
  let themeGStart = hexToRgb(classTheme.gradientStart);
  let themeGEnd = hexToRgb(classTheme.gradientEnd);
  let themeText = hexToRgb(classTheme.text);
  let themeBadgeBg = hexToRgb(classTheme.badgeBg);
  let themePrimary = hexToRgb(classTheme.primary);

  if (increasePdfBrightness) {
    themeBorder = lightenColor(themeBorder, 0.25);
    themeGStart = lightenColor(themeGStart, 0.25);
    themeGEnd = lightenColor(themeGEnd, 0.25);
    themeBadgeBg = lightenColor(themeBadgeBg, 0.25);
    themePrimary = lightenColor(themePrimary, 0.25);
    themeText = { r: Math.max(0, themeText.r - 20), g: Math.max(0, themeText.g - 20), b: Math.max(0, themeText.b - 20) };
  }

  // 1. Base rectangle border for BACK card (thin clean border)
  doc.setLineWidth(0.35);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');
  
  // 2. Add header ribbon
  const bgR1 = themeGStart.r, bgG1 = themeGStart.g, bgB1 = themeGStart.b;
  const bgR2 = themeGEnd.r, bgG2 = themeGEnd.g, bgB2 = themeGEnd.b;

  doc.setFillColor(bgR1, bgG1, bgB1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 8.0, 8.0, 8.0, 'F');
  
  doc.setFillColor(bgR2, bgG2, bgB2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 8.0, 8.0, 8.0, 'F');
  
  // Transition gradient slices in the flat middle section (from x+4.0 to x+cw-4.0)
  const gStartXBack = x + 4.0;
  const gWidthBack = cw - 8.0;
  const stepsBack = 30;
  const stepWBack = gWidthBack / stepsBack;
  for (let i = 0; i < stepsBack; i++) {
    const t = i / (stepsBack - 1);
    const gr = Math.round(bgR1 + (bgR2 - bgR1) * t);
    const gg = Math.round(bgG1 + (bgG2 - bgG1) * t);
    const gb = Math.round(bgB1 + (bgB2 - bgB1) * t);
    doc.setFillColor(gr, gg, gb);
    doc.rect(gStartXBack + i * stepWBack, y + 0.5, stepWBack + 0.1, 16.0, 'F');
  }

  // School logo background watermark
  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 1.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }
  
  // Draw school logo (increased size by ~20% to 13.2mm for back cards)
  let hasImageDrawn = false;
  const backLogoSize = 13.2;
  const backLogoX = x + 3.0;
  const backLogoY = y + 1.8;

  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      doc.addImage(logoBase64, isSvg ? 'SVG' : 'PNG', backLogoX, backLogoY, backLogoSize, backLogoSize, undefined, 'NONE');
      hasImageDrawn = true;
    } catch (e) {
      console.error("Error drawing custom logo in back PDF:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(245, 158, 11);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.12);
    doc.roundedRect(backLogoX, backLogoY, backLogoSize, backLogoSize, 0.8, 0.8, 'FD');
    doc.setFillColor(153, 27, 27);
    doc.triangle(backLogoX + 1.4, backLogoY + 2.2, backLogoX + backLogoSize - 1.4, backLogoY + 2.2, backLogoX + backLogoSize / 2, backLogoY + backLogoSize - 1.8, 'FD');
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + cw / 2, y + 4.8, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI', x + cw / 2, y + 7.8, { align: 'center' });

  // Center title badge subtext in the header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('MEALS VALIDATION', x + cw / 2, y + 11.2, { align: 'center' });

  // MEAL CARD high visibility right badge (Strict specification)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x + cw - 18.0, y + 2.5, 15.0, 9.5, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('MEALS', x + cw - 10.5, y + 6.2, { align: 'center' });
  doc.setFontSize(4.0);
  doc.setTextColor(100, 100, 100);
  doc.text('RECORD', x + cw - 10.5, y + 9.8, { align: 'center' });

  // 3. Upgraded Student Details Bar right below the header (Uniform)
  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.15);
  doc.rect(x + 0.5, y + 17.5, cw - 1.0, 3.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('MEAL RECORD & ATTENDANCE CARD', x + cw / 2, y + 19.9, { align: 'center' });
  
  // 4. Render calendars for June and July shifted down slightly to accommodate bar
  // June: Starts Monday (1), 30 days
  drawCalendarPdf(doc, x + 3.1, y + 21.5, 'June', 1, 30, 5.1, 4.2);
  
  // July: Starts Wednesday (3), 31 days
  doc.setFont('helvetica', 'bold');
  drawCalendarPdf(doc, x + cw - 38.8, y + 18.5, 'July', 3, 31, 5.1, 4.4);
  
  // 5. Draw footer box with stamps signoff
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  doc.line(x, y + ch - 7.5, x + cw, y + ch - 7.5);
  doc.rect(x + 0.3, y + ch - 7.5, cw - 0.6, 7.3, 'F');
  
  // Stamps row removed (Bursar Stamp removed)

  // Centered Motto/Core Values (P.O. Box removed)
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('"God is Our Guide"', x + cw / 2, y + ch - 3.3, { align: 'center' });
}

// Draw the payment mode page in vector PDF format
function drawCardPaymentPdf(
  doc: jsPDF, 
  x: number, 
  y: number, 
  student: Student, 
  cw: number, 
  ch: number, 
  logoBase64?: string | null,
  showWatermark = true,
  watermarkOpacityVal = 0.25,
  increasePdfBrightness = false
) {
  const serialNo = `SPSSN-2026-${(student.adminNo || student.id || "0000").replace(/[^0-9]/g, "").slice(0, 5).padStart(5, "0")}`;

  const classTheme = getClassTheme(student.gradeClass);
  let themeBorder = hexToRgb(classTheme.border);
  let themeGStart = hexToRgb(classTheme.gradientStart);
  let themeGEnd = hexToRgb(classTheme.gradientEnd);
  let themeText = hexToRgb(classTheme.text);
  let themeBadgeBg = hexToRgb(classTheme.badgeBg);
  let themePrimary = hexToRgb(classTheme.primary);

  if (increasePdfBrightness) {
    themeBorder = lightenColor(themeBorder, 0.25);
    themeGStart = lightenColor(themeGStart, 0.25);
    themeGEnd = lightenColor(themeGEnd, 0.25);
    themeBadgeBg = lightenColor(themeBadgeBg, 0.25);
    themePrimary = lightenColor(themePrimary, 0.25);
    themeText = { r: Math.max(0, themeText.r - 20), g: Math.max(0, themeText.g - 20), b: Math.max(0, themeText.b - 20) };
  }

  // 1. Base rectangle border for PAYMENT card (thin clean border for high contrast)
  doc.setLineWidth(0.35);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');

  // School logo background watermark
  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 1.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }

  // 3. Header Gradient
  const bgR1 = themeGStart.r, bgG1 = themeGStart.g, bgB1 = themeGStart.b;
  const bgR2 = themeGEnd.r, bgG2 = themeGEnd.g, bgB2 = themeGEnd.b;

  doc.setFillColor(bgR1, bgG1, bgB1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 8.0, 8.0, 8.0, 'F');
  
  doc.setFillColor(bgR2, bgG2, bgB2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 8.0, 8.0, 8.0, 'F');

  // Horizontal gradient Transition slices
  const gStartXBack = x + 4.0;
  const gWidthBack = cw - 8.0;
  const stepsBack = 30;
  const stepWBack = gWidthBack / stepsBack;
  for (let i = 0; i < stepsBack; i++) {
    const t = i / (stepsBack - 1);
    const gr = Math.round(bgR1 + (bgR2 - bgR1) * t);
    const gg = Math.round(bgG1 + (bgG2 - bgG1) * t);
    const gb = Math.round(bgB1 + (bgB2 - bgB1) * t);
    doc.setFillColor(gr, gg, gb);
    doc.rect(gStartXBack + i * stepWBack, y + 0.5, stepWBack + 0.1, 16.0, 'F');
  }

  // Draw school logo icon (increased size by ~20% to 13.2mm)
  let hasImageDrawn = false;
  const backLogoSize = 13.2;
  const backLogoX = x + 3.0;
  const backLogoY = y + 1.8;

  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      doc.addImage(logoBase64, isSvg ? 'SVG' : 'PNG', backLogoX, backLogoY, backLogoSize, backLogoSize, undefined, 'NONE');
      hasImageDrawn = true;
    } catch (e) {
      console.error("Error drawing logo in payment card:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(245, 158, 11);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.12);
    doc.roundedRect(backLogoX, backLogoY, backLogoSize, backLogoSize, 0.8, 0.8, 'FD');
  }

  // Title centered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + cw / 2, y + 4.8, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI', x + cw / 2, y + 7.8, { align: 'center' });

  // Center title badge subtext in the header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('FINANCIAL LEDGER', x + cw / 2, y + 11.2, { align: 'center' });

  // Badge: PAYMENT MODE Right Side Tag
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x + cw - 18.0, y + 2.5, 15.0, 9.5, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('FEES', x + cw - 10.5, y + 6.2, { align: 'center' });
  doc.setFontSize(4.0);
  doc.setTextColor(100, 100, 100);
  doc.text('PAYMENT', x + cw - 10.5, y + 9.8, { align: 'center' });

  // 4. Student Metadata Row (Uniform)
  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.15);
  doc.rect(x + 0.5, y + 17.5, cw - 1.0, 3.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('OFFICIAL SCHOOL FEES PAYMENT LEDGER', x + cw / 2, y + 19.9, { align: 'center' });

  // 5. Draw the table structure at center, stretching entire card width (Excellent spacing)
  const ty = y + 21.5;
  const th = 4.0; // Header row
  const trh = 8.0; // Optimized row height for hand-writing space under taller header

  // Table widths expanded for maximum possible space
  const colW1 = 19.5; // Installment
  const colW2 = 21.0; // Amount paid
  const colW3 = 19.5; // Balance
  const colW4 = 25.0; // Remarks / Sign
  const tableW = colW1 + colW2 + colW3 + colW4; // 85 mm width (leaving equal 2.5 mm margins)
  const tx = x + 2.5; // Table start X

  // Header background
  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.rect(tx, ty, tableW, th, 'F');

  // Draw table outline & grids (Thick, highly-defined black lines)
  doc.setLineWidth(0.22);
  doc.setDrawColor(0, 0, 0); // Solid black grid lines
  doc.rect(tx, ty, tableW, th + 3 * trh, 'D');

  // Column vertical grid lines
  doc.line(tx + colW1, ty, tx + colW1, ty + th + 3 * trh);
  doc.line(tx + colW1 + colW2, ty, tx + colW1 + colW2, ty + th + 3 * trh);
  doc.line(tx + colW1 + colW2 + colW3, ty, tx + colW1 + colW2 + colW3, ty + th + 3 * trh);

  // Row horizontal lines
  doc.line(tx, ty + th, tx + tableW, ty + th);
  doc.line(tx, ty + th + trh, tx + tableW, ty + th + trh);
  doc.line(tx, ty + th + 2 * trh, tx + tableW, ty + th + 2 * trh);

  // Header labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('INSTALLMENT', tx + colW1 / 2, ty + 2.9, { align: 'center' });
  doc.text('AMOUNT (UGX)', tx + colW1 + colW2 / 2, ty + 2.9, { align: 'center' });
  doc.text('BAL (UGX)', tx + colW1 + colW2 + colW3 / 2, ty + 2.9, { align: 'center' });
  doc.text('BURSAR SIGN', tx + colW1 + colW2 + colW3 + colW4 / 2, ty + 2.9, { align: 'center' });

  // Rows Content (Installment labels - Bolder and pitch black, vertically aligned in taller rows)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.2);
  doc.setTextColor(0, 0, 0); // Pitch black row labels
  doc.text('1st Installment', tx + 1.8, ty + th + 6.3);
  doc.text('2nd Installment', tx + 1.8, ty + th + trh + 6.3);
  doc.text('3rd Installment', tx + 1.8, ty + th + 2 * trh + 6.3);

  // 7. Gray Footer Band - Lowered to fit the taller stretched table perfectly
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  const footerY = y + ch - 3.7;
  doc.line(x, footerY, x + cw, footerY);
  doc.rect(x + 0.3, footerY, cw - 0.6, 3.5, 'F');

  // Centered Motto/Core Values (P.O. Box removed)
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('"God is Our Guide"', x + cw / 2, y + ch - 1.2, { align: 'center' });
}

// Draw the August meal card page in vector PDF format
function drawCardAugustPdf(
  doc: jsPDF, 
  x: number, 
  y: number, 
  student: Student, 
  cw: number, 
  ch: number, 
  logoBase64?: string | null,
  showWatermark = true,
  watermarkOpacityVal = 0.25,
  increasePdfBrightness = false
) {
  const serialNo = `SPSSN-2026-${(student.adminNo || student.id || "0000").replace(/[^0-9]/g, "").slice(0, 5).padStart(5, "0")}`;

  const classTheme = getClassTheme(student.gradeClass);
  let themeBorder = hexToRgb(classTheme.border);
  let themeGStart = hexToRgb(classTheme.gradientStart);
  let themeGEnd = hexToRgb(classTheme.gradientEnd);
  let themeText = hexToRgb(classTheme.text);
  let themeBadgeBg = hexToRgb(classTheme.badgeBg);
  let themePrimary = hexToRgb(classTheme.primary);

  if (increasePdfBrightness) {
    themeBorder = lightenColor(themeBorder, 0.25);
    themeGStart = lightenColor(themeGStart, 0.25);
    themeGEnd = lightenColor(themeGEnd, 0.25);
    themeBadgeBg = lightenColor(themeBadgeBg, 0.25);
    themePrimary = lightenColor(themePrimary, 0.25);
    themeText = { r: Math.max(0, themeText.r - 20), g: Math.max(0, themeText.g - 20), b: Math.max(0, themeText.b - 20) };
  }

  // 1. Base rectangle border for AUGUST card (thin clean border for printing clarity)
  doc.setLineWidth(0.35);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');

  // School logo background watermark
  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 1.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }

  // 3. Header Gradient
  const bgR1 = themeGStart.r, bgG1 = themeGStart.g, bgB1 = themeGStart.b;
  const bgR2 = themeGEnd.r, bgG2 = themeGEnd.g, bgB2 = themeGEnd.b;

  doc.setFillColor(bgR1, bgG1, bgB1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 8.0, 8.0, 8.0, 'F');
  
  doc.setFillColor(bgR2, bgG2, bgB2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 8.0, 8.0, 8.0, 'F');

  // Gradient transitions
  const gStartXBack = x + 4.0;
  const gWidthBack = cw - 8.0;
  const stepsBack = 30;
  const stepWBack = gWidthBack / stepsBack;
  for (let i = 0; i < stepsBack; i++) {
    const t = i / (stepsBack - 1);
    const gr = Math.round(bgR1 + (bgR2 - bgR1) * t);
    const gg = Math.round(bgG1 + (bgG2 - bgG1) * t);
    const gb = Math.round(bgB1 + (bgB2 - bgB1) * t);
    doc.setFillColor(gr, gg, gb);
    doc.rect(gStartXBack + i * stepWBack, y + 0.5, stepWBack + 0.1, 16.0, 'F');
  }

  // Draw school logo icon (increased size by ~20% to 13.2mm)
  let hasImageDrawn = false;
  const backLogoSize = 13.2;
  const backLogoX = x + 3.0;
  const backLogoY = y + 1.8;

  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      doc.addImage(logoBase64, isSvg ? 'SVG' : 'PNG', backLogoX, backLogoY, backLogoSize, backLogoSize, undefined, 'NONE');
      hasImageDrawn = true;
    } catch (e) {
      console.error("Error drawing logo in payment card:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(245, 158, 11);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.12);
    doc.roundedRect(backLogoX, backLogoY, backLogoSize, backLogoSize, 0.8, 0.8, 'FD');
  }

  // Title centered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + cw / 2, y + 4.8, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI', x + cw / 2, y + 7.8, { align: 'center' });

  // Center title badge subtext in the header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('AUGUST VALIDATION', x + cw / 2, y + 11.2, { align: 'center' });

  // Badge: AUGUST MEALS Right Side Tag
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x + cw - 18.0, y + 2.5, 15.0, 9.5, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('MEALS', x + cw - 10.5, y + 6.2, { align: 'center' });
  doc.setFontSize(4.0);
  doc.setTextColor(100, 100, 100);
  doc.text('AUGUST', x + cw - 10.5, y + 9.8, { align: 'center' });

  // 4. Student Metadata Row (Uniform)
  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.15);
  doc.rect(x + 0.5, y + 17.5, cw - 1.0, 3.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('AUGUST STUDENT MEALS VALIDATION CARD', x + cw / 2, y + 19.9, { align: 'center' });

  // 5. Main Area: August Calendar on left (Saturday start, 31 days) and Cafeteria notes on right
  drawCalendarPdf(doc, x + 3.0, y + 21.5, 'August', 6, 31, 5.2, 4.0);

  // Cafeteria Rules Box on Right
  const bx = x + 44.5;
  const by = y + 21.5;
  const bw = 42.5; // Optimized to fit the calendar elegantly
  const bh = 25.5;

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b); // Tie rule box border to class color!
  doc.setLineWidth(0.2);
  doc.roundedRect(bx, by, bw, bh, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(themeText.r, themeText.g, themeText.b); // Tie title to class accent color!
  doc.text('CAFETERIA GUIDE', bx + 2.0, by + 4.5);

  doc.setLineWidth(0.18);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b); // Tie line to class accent color border!
  doc.line(bx + 2.0, by + 5.8, bx + bw - 2.0, by + 5.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(0, 0, 0); // Pitch black content bullets
  doc.text('• Present card on request.', bx + 2.0, by + 10.5);
  doc.text('• Strictly non-transferable.', bx + 2.0, by + 15.8);
  doc.text('• Report loss immediately.', bx + 2.0, by + 21.1);

  // 6. Gray Footer Band at very bottom
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  doc.line(x, y + ch - 5.5, x + cw, y + ch - 5.5);
  doc.rect(x + 0.3, y + ch - 5.5, cw - 0.6, 5.3, 'F');

  // Centered Motto/Core Values (P.O. Box removed)
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('"God is Our Guide"', x + cw / 2, y + ch - 2.4, { align: 'center' });
}

// Layout modes supported for easy PDF exports
export interface PdfExportOptions {
  layoutMode: 'front-back-paired' | 'printable-grid';
  students: Student[];
  onProgress?: (index: number, total: number) => void;
  schoolLogoBase64?: string | null;
  printSide?: 'front' | 'back' | 'both';
  enablePhotoEnhancement?: boolean;
  increasePdfBrightness?: boolean;
  showWatermark?: boolean;
  watermarkOpacity?: number; // 0 to 100
  highQualityPrintMode?: boolean;
}

// Helper to convert SVG data URL to a raster PNG URL inside browsers using HTML5 Canvas
async function convertSvgToPng(svgDataUrl: string, targetWidth = 1000, targetHeight = 1000): Promise<string> {
  if (!svgDataUrl || (!svgDataUrl.includes('svg+xml') && !svgDataUrl.startsWith('data:image/svg'))) {
    return svgDataUrl;
  }
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(svgDataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const pngUrl = canvas.toDataURL('image/png');
          resolve(pngUrl);
        } else {
          resolve(svgDataUrl);
        }
      } catch (err) {
        console.error("Error drawing SVG to canvas in convertSvgToPng:", err);
        resolve(svgDataUrl);
      }
    };
    img.onerror = (e) => {
      console.error("Error loading SVG in convertSvgToPng:", e);
      resolve(svgDataUrl);
    };
    img.src = svgDataUrl;
  });
}

export async function generateClearancePdf({
  layoutMode,
  students,
  onProgress,
  schoolLogoBase64,
  printSide = 'both',
  enablePhotoEnhancement = true,
  increasePdfBrightness = true,
  showWatermark = true,
  watermarkOpacity = 25,
  highQualityPrintMode = true
}: PdfExportOptions): Promise<jsPDF> {
  const watermarkOpacityVal = watermarkOpacity / 100;

  // Convert custom logo or default logo to PNG first to avoid any SVG addImage errors in jsPDF
  let activeLogoPng: string | null = null;
  if (schoolLogoBase64) {
    activeLogoPng = await convertSvgToPng(schoolLogoBase64, 1000, 1000);
  } else {
    try {
      activeLogoPng = await convertSvgToPng(DEFAULT_SCHOOL_LOGO, 1000, 1000);
    } catch (err) {
      console.warn("Failed to convert default fallback logo to PNG, falling back to original:", err);
    }
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Ensure students is an array to avoid runtime errors when mapping
  students = Array.isArray(students) ? students : [];

  const cardW = 90;
  const cardH = 58;
  const marginX = 10;
  const marginY = 13;
  const spacingX = 10;
  const spacingY = 13;

  // Pre-fetch any missing student photos that exist on the server
  await Promise.all(
    students.map(async (student) => {
      if (!student.photo && student.hasPhoto) {
        try {
          const photoBase64 = await fetchStudentPhotoAsBase64(student.id);
          if (photoBase64) {
            student.photo = photoBase64;
          }
        } catch (e) {
          console.error("Failed to pre-fetch photo for student", student.id, e);
        }
      }
    })
  );

  const enhancedPhotoMap: Record<string, string> = {};
  await Promise.all(
    students.map(async (student) => {
      if (student.photo) {
        try {
          if (enablePhotoEnhancement) {
            const brightnessBoost = increasePdfBrightness ? 1.35 : 1.25;
            enhancedPhotoMap[student.id] = await enhanceStudentPhotoForPdf(student.photo, {
              brightnessBoost,
              contrastBoost: 1.10,
              sharpen: true
            });
          } else {
            enhancedPhotoMap[student.id] = student.photo;
          }
        } catch (e) {
          console.error("Failed to enhance photo for student", student.id, e);
          enhancedPhotoMap[student.id] = student.photo;
        }
      }
    })
  );

  // Map students array to use enhanced photos purely for the PDF rendering
  students = students.map(student => ({
    ...student,
    photo: enhancedPhotoMap[student.id] || student.photo
  }));

  if (layoutMode === 'front-back-paired') {
    let studentCounter = 0;
    
    if (printSide === 'front') {
      // Draw Row A only: fits up to 4 students per page (total 8 cards = 4 rows × 2 cols)
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        if (onProgress) onProgress(i + 1, students.length);

        const rowIdx = studentCounter % 4;
        const py = marginY + rowIdx * (cardH + spacingY);

        drawCardBackPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);

        studentCounter++;
        if (studentCounter % 4 === 0 && i < students.length - 1) {
          doc.addPage();
        }
        // Yield to prevent thread block
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } else if (printSide === 'back') {
      // Draw Row B only: fits up to 4 students per page (total 8 cards = 4 rows × 2 cols)
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        if (onProgress) onProgress(i + 1, students.length);

        const rowIdx = studentCounter % 4;
        const py = marginY + rowIdx * (cardH + spacingY);

        drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);

        studentCounter++;
        if (studentCounter % 4 === 0 && i < students.length - 1) {
          doc.addPage();
        }
        // Yield to prevent thread block
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } else {
      // Draw both: Generates Front page first, then Back page of paired sheet for each batch of 4 students (8 cards per page)
      const studentsPerPage = 4;
      const totalPagesNeeded = Math.ceil(students.length / studentsPerPage);

      for (let pageIdx = 0; pageIdx < totalPagesNeeded; pageIdx++) {
        if (pageIdx > 0) {
          doc.addPage();
        }

        const startIndex = pageIdx * studentsPerPage;
        const pageStudents = students.slice(startIndex, startIndex + studentsPerPage);

        // PAGE A: Front Cards Grid (Page 1 of paired sheet - 8 cards total)
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const globalIdx = startIndex + sIdx;
          if (onProgress) onProgress(globalIdx + 1, students.length);

          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardBackPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        }

        // PAGE B: Back Cards Grid (Page 2 of paired sheet - 8 cards total)
        doc.addPage();
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];

          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        }
        // Yield to prevent thread block
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } else {
    // Mode 2: Printable Duplex Grid (4 students = 8 cards = 4 rows total)
    const studentsPerPage = 4;
    const totalPagesNeeded = Math.ceil(students.length / studentsPerPage);

    for (let pageIdx = 0; pageIdx < totalPagesNeeded; pageIdx++) {
      if (pageIdx > 0) {
        doc.addPage();
      }

      const startIndex = pageIdx * studentsPerPage;
      const pageStudents = students.slice(startIndex, startIndex + studentsPerPage);

      if (printSide === 'front') {
        // PAGE A ONLY (Fronts)
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const globalIdx = startIndex + sIdx;
          if (onProgress) onProgress(globalIdx + 1, students.length);

          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardBackPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        }
      } else if (printSide === 'back') {
        // PAGE B ONLY (Backs)
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const globalIdx = startIndex + sIdx;
          if (onProgress) onProgress(globalIdx + 1, students.length);

          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        }
      } else {
        // PAGE A: Front Cards Grid (Page 1 of paired sheet - 8 cards total)
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const globalIdx = startIndex + sIdx;
          if (onProgress) onProgress(globalIdx + 1, students.length);

          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardBackPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        }

        // PAGE B: Back Cards Grid (Page 2 of paired sheet - mirrored column layout)
        doc.addPage();
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];

          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, activeLogoPng, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        }
      }
      // Yield to prevent thread block
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Draw thin, visible crop/cut guide lines separating all rows and columns on all sheets
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.saveGraphicsState();
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.setDrawColor(180, 180, 180); // Thin medium-gray guide stroke that prints cleanly
    doc.setLineWidth(0.18);

    // Three horizontal guidelines separating Row 1/2, Row 2/3, and Row 3/4
    for (let r = 1; r < 4; r++) {
      const y = marginY + r * (cardH + spacingY) - spacingY / 2;
      doc.line(0, y, 210, y);
    }
    
    doc.restoreGraphicsState();
  }

  return doc;
}
