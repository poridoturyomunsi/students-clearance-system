const { jsPDF } = require('jspdf');
const QRCode = require('qrcode');

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function lightenColor(rgb, amount = 0.25) {
  return {
    r: Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount)),
    g: Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount)),
    b: Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount))
  };
}

const CODE39_PATTERNS = {
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

function drawPdfBarcode(doc, x, y, value, height, scaleWidth) {
  const formatted = value.toUpperCase().trim();
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
  doc.setFillColor(0, 0, 0);

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

function drawSafeWatermark(doc, logoBase64, x, y, w, h, opacity = 0.05) {
  if (!logoBase64) return;
  try {
    const isSvg = logoBase64.includes('svg+xml');
    const isJpeg = logoBase64.includes('jpeg') || logoBase64.includes('jpg');
    const format = isSvg ? 'SVG' : (isJpeg ? 'JPEG' : 'PNG');
    
    let hasGState = false;
    try {
      const gStateClass = doc.GState || (doc.constructor && doc.constructor.GState);
      if (gStateClass) {
        const gStateObj = new gStateClass({ opacity });
        doc.saveGraphicsState();
        doc.setGState(gStateObj);
        hasGState = true;
      }
    } catch (err) {
      console.warn("Could not set GState for watermark transparency:", err);
    }

    doc.addImage(logoBase64, format, x, y, w, h, undefined, 'FAST');

    if (hasGState) {
      try {
        doc.restoreGraphicsState();
      } catch (err) {
        try {
          const gStateClass = doc.GState || (doc.constructor && doc.constructor.GState);
          doc.setGState(new gStateClass({ opacity: 1.0 }));
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error("Error drawing safe watermark:", e);
  }
}

function drawCalendarPdf(doc, x, y, monthName, startDayOfWeek, totalDays, cellW = 3.2, cellH = 2.6) {
  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const scale = cellW / 4.8;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5 * scale);
  doc.setTextColor(0, 0, 0);
  doc.text(`${monthName.toUpperCase()} 2026`, x + (7 * cellW) / 2, y + 2.0 * scale, { align: 'center' });
  
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.line(x, y + 3.0 * scale, x + (7 * cellW), y + 3.0 * scale);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.0 * scale);
  doc.setTextColor(0, 0, 0);
  
  for (let dIdx = 0; dIdx < 7; dIdx++) {
    doc.text(daysOfWeek[dIdx], x + dIdx * cellW + cellW / 2 + 0.3, y + 5.2 * scale, { align: 'center' });
  }
  
  const padding = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
  let cellXIdx = padding;
  let cellYIdx = 0;
  
  for (let curDay = 1; curDay <= totalDays; curDay++) {
    const rx = x + cellXIdx * cellW;
    const ry = y + (6.5 * scale) + cellYIdx * cellH;
    
    const dIndex = (startDayOfWeek - 1 + curDay - 1) % 7;
    const isWeekend = dIndex === 5 || dIndex === 6;

    if (isWeekend) {
      doc.setFillColor(250, 245, 235);
      doc.setDrawColor(180, 180, 180);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(180, 180, 180);
    }
    
    doc.setLineWidth(0.16);
    doc.roundedRect(rx + 0.1, ry + 0.1, cellW - 0.2, cellH - 0.2, 0.4, 0.4, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6 * scale);
    doc.setTextColor(0, 0, 0);
    doc.text(curDay.toString(), rx + cellW / 2, ry + (cellH / 2) + 0.8 * scale, { align: 'center' });
    
    cellXIdx++;
    if (cellXIdx >= 7) {
      cellXIdx = 0;
      cellYIdx++;
    }
  }
}

function getClassTheme(gradeClass) {
  const clean = gradeClass ? gradeClass.trim().toUpperCase() : 'S.1';
  if (clean.startsWith('S.1')) return { border: '#15803d', gradientStart: '#166534', gradientEnd: '#22c55e', text: '#166534', badgeBg: '#f0fdf4', primary: '#15803d' };
  if (clean.startsWith('S.2')) return { border: '#0369a1', gradientStart: '#075985', gradientEnd: '#38bdf8', text: '#075985', badgeBg: '#f0f9ff', primary: '#0369a1' };
  if (clean.startsWith('S.3')) return { border: '#1d4ed8', gradientStart: '#1e40af', gradientEnd: '#3b82f6', text: '#1e40af', badgeBg: '#eff6ff', primary: '#1d4ed8' };
  if (clean.startsWith('S.4')) return { border: '#a16207', gradientStart: '#854d0e', gradientEnd: '#eab308', text: '#854d0e', badgeBg: '#fefbeb', primary: '#a16207' };
  if (clean.startsWith('S.5')) return { border: '#cbd5e1', gradientStart: '#f8fafc', gradientEnd: '#ffffff', text: '#1e293b', badgeBg: '#f1f5f9', primary: '#ffffff' };
  if (clean.startsWith('S.6')) return { border: '#cbd5e1', gradientStart: '#f8fafc', gradientEnd: '#ffffff', text: '#1e293b', badgeBg: '#f1f5f9', primary: '#ffffff' };
  return { border: '#15803d', gradientStart: '#166534', gradientEnd: '#22c55e', text: '#166534', badgeBg: '#f0fdf4', primary: '#15803d' };
}

function drawCardFrontPdf(
  doc, 
  x, 
  y, 
  student, 
  cw, 
  ch, 
  logoBase64,
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

  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  const r1 = themeGStart.r, g1 = themeGStart.g, b1 = themeGStart.b;
  const r2 = themeGEnd.r, g2 = themeGEnd.g, b2 = themeGEnd.b;
  
  // 1. Base rectangle border
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');
  
  // 2. Header gradient ribbon
  doc.setFillColor(r1, g1, b1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 8.0, 8.0, 8.0, 'F');
  
  doc.setFillColor(r2, g2, b2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 15.5, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 8.0, 8.0, 8.0, 'F');
  
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
    doc.rect(gStartX + i * stepW, y + 0.5, stepW + 0.1, 16.0, 'F');
  }
  
  let hasImageDrawn = false;
  const logoSize = 13.2;
  const logoX = x + 3.0;
  const logoY = y + 1.8;

  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      const isJpeg = logoBase64.includes('jpeg') || logoBase64.includes('jpg');
      const format = isSvg ? 'SVG' : (isJpeg ? 'JPEG' : 'PNG');
      doc.addImage(logoBase64, format, logoX, logoY, logoSize, logoSize, undefined, 'FAST');
      hasImageDrawn = true;
    } catch (e) {
      console.warn("Could not draw logoBase64 directly via addImage:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(19, 15, 60);
    doc.roundedRect(logoX, logoY, logoSize, logoSize, 1.4, 1.4, 'F');
    doc.setFillColor(124, 58, 45);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.24);
    doc.triangle(logoX + 0.4, logoY + 0.4, logoX + logoSize - 0.4, logoY + 0.4, logoX + logoSize / 2, logoY + logoSize - 1.0, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(19, 15, 60);
    doc.setLineWidth(0.12);
    doc.triangle(logoX + 1.4, logoY + 1.2, logoX + logoSize - 1.4, logoY + 1.2, logoX + logoSize / 2, logoY + logoSize - 2.0, 'FD');
  }
  
  // School Info left-aligned next to crest logo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + 16.0, y + 6.8);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI IGANGA', x + 16.0, y + 10.8);

  // TERM 2, 2026 badge aligned to top-right corner, pushed down for perfect vertical centering in header
  const termBadgeX = x + cw - 23.5;
  const termBadgeY = y + 7.8;
  const termBadgeW = 20.5;
  const termBadgeH = 6.2;

  doc.setFillColor(11, 25, 66); // Dark navy badge matching mockup
  doc.roundedRect(termBadgeX, termBadgeY, termBadgeW, termBadgeH, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(255, 255, 255);
  doc.text('TERM 2, 2026', termBadgeX + termBadgeW / 2, termBadgeY + 4.2, { align: 'center' });

  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 1.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }

  // 6. Large Container immediately below school header containing everything related to student
  const containerX = x + 2.5;
  const containerY = y + 16.5;
  const containerW = cw - 5.0;
  const containerH = ch - 22.0;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(themePrimary.r, themePrimary.g, themePrimary.b);
  doc.setLineWidth(0.4);
  doc.roundedRect(containerX, containerY, containerW, containerH, 2.0, 2.0, 'FD');

  // Title at top center with thin blue horizontal line across container
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('STUDENT CLEARANCE CARD', x + cw / 2, containerY + 3.8, { align: 'center' });

  doc.setDrawColor(themePrimary.r, themePrimary.g, themePrimary.b);
  doc.setLineWidth(0.2);
  doc.line(containerX + 1.0, containerY + 5.2, containerX + containerW - 1.0, containerY + 5.2);

  // Left Column: Framed Passport Photo with blue/theme border and rounded corners (Enlarged by ~18%)
  const photoFrameX = containerX + 2.0;
  const photoFrameY = containerY + 6.0;
  const photoFrameW = 23.5;
  const photoFrameH = 26.5;

  doc.setDrawColor(themePrimary.r, themePrimary.g, themePrimary.b);
  doc.setLineWidth(0.35);
  doc.roundedRect(photoFrameX, photoFrameY, photoFrameW, photoFrameH, 1.2, 1.2, 'D');

  const photoImgX = photoFrameX + 0.8;
  const photoImgY = photoFrameY + 0.8;
  const photoImgW = photoFrameW - 1.6;
  const photoImgH = photoFrameH - 1.6;

  let hasStudentPhotoDrawn = false;
  if (student.photo) {
    try {
      const fmtMatch = student.photo.match(/^data:image\/([a-zA-Z]+);base64,/);
      const format = fmtMatch ? fmtMatch[1].toUpperCase() : 'JPEG';
      doc.addImage(student.photo, format, photoImgX, photoImgY, photoImgW, photoImgH, undefined, 'FAST');
      hasStudentPhotoDrawn = true;
    } catch (e) {
      console.warn("Could not draw student passport photo in card front:", e);
    }
  }

  if (!hasStudentPhotoDrawn) {
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(photoImgX, photoImgY, photoImgW, photoImgH, 0.8, 0.8, 'F');
    doc.setLineWidth(0.2);
    doc.setDrawColor(180, 180, 180);
    doc.ellipse(photoImgX + photoImgW / 2, photoImgY + 6.0, 2.5, 2.5);
    doc.ellipse(photoImgX + photoImgW / 2, photoImgY + 14.0, 5.5, 3.0, 'S');
  }

  // Right Column: Information section with school logo watermark at 4% opacity behind Student SurePay Code
  const infoX = photoFrameX + photoFrameW + 5.0;
  const fieldYStart = photoFrameY + 2.0;
  const fieldSpacing = 5.8;

  if (logoBase64 && showWatermark) {
    drawSafeWatermark(doc, logoBase64, infoX + 2.0, photoFrameY - 1.0, 26.0, 26.0, 0.05);
  }

  const rawCode = (student.studentNo || student.adminNo || '').toUpperCase();
  const formattedSurePay = rawCode.length >= 6 ? rawCode.replace(/(.{4})/g, '$1  ').trim() : rawCode;

  const fields = [
    { label: 'STUDENT SUREPAY CODE', val: formattedSurePay },
    { label: 'NAME', val: (student.name || '').toUpperCase() },
    { label: 'CLASS', val: (student.gradeClass || '').toUpperCase() },
    { label: 'STATUS', val: (student.boardingStatus === 'Hosteller' || student.boardingStatus === 'Boarder' ? 'HOSTELLER' : 'DAY SCHOLAR').toUpperCase() },
    { label: 'GENDER', val: (student.gender || 'Male').toUpperCase() }
  ];

  fields.forEach((f, idx) => {
    const fy = fieldYStart + idx * fieldSpacing;
    // Blue uppercase smaller label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.6);
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
    doc.text(f.label, infoX, fy);

    // Bold black value directly below label with larger readable font size
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(0, 0, 0);
    doc.text(f.val, infoX, fy + 2.5);
  });

  // Draw QR Code Frame in Bottom Right Corner of Card Front
  const qrFrameX = containerX + containerW - 17.5;
  const qrFrameY = containerY + containerH - 18.5;
  const qrFrameW = 16.0;
  const qrFrameH = 17.2;

  doc.setDrawColor(themePrimary.r, themePrimary.g, themePrimary.b);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.3);
  doc.roundedRect(qrFrameX, qrFrameY, qrFrameW, qrFrameH, 1.0, 1.0, 'FD');

  if (student.qrCodeBase64) {
    try {
      doc.addImage(student.qrCodeBase64, 'PNG', qrFrameX + 0.8, qrFrameY + 0.8, 14.4, 14.4, undefined, 'FAST');
    } catch (e) {
      console.warn("Could not draw student QR code image:", e);
    }
  }

  // Draw "Scan to Verify" badge at bottom of QR Code frame
  doc.setFillColor(themeText.r, themeText.g, themeText.b);
  doc.roundedRect(qrFrameX + 1.2, qrFrameY + 14.2, 13.6, 2.4, 0.4, 0.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(3.6);
  doc.setTextColor(255, 255, 255);
  doc.text('Scan to Verify', qrFrameX + 8.0, qrFrameY + 15.9, { align: 'center' });

  // 7. Card Footer band containing return instructions text
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  doc.line(x, y + ch - 4.5, x + cw, y + ch - 4.5);
  doc.rect(x + 0.3, y + ch - 4.5, cw - 0.6, 4.3, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(0, 0, 0);
  doc.text('If found, please return to the above address.', x + cw / 2, y + ch - 1.6, { align: 'center' });
}

function drawCardBackPdf(
  doc, 
  x, 
  y, 
  student, 
  cw, 
  ch, 
  logoBase64,
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

  doc.setLineWidth(0.35);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');
  
  const bgR1 = themeGStart.r, bgG1 = themeGStart.g, bgB1 = themeGStart.b;
  const bgR2 = themeGEnd.r, bgG2 = themeGEnd.g, bgB2 = themeGEnd.b;

  doc.setFillColor(bgR1, bgG1, bgB1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 8.5, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 5.0, 8.0, 4.0, 'F');
  
  doc.setFillColor(bgR2, bgG2, bgB2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 8.5, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 5.0, 8.0, 4.0, 'F');
  
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
    doc.rect(gStartXBack + i * stepWBack, y + 0.5, stepWBack + 0.1, 8.5, 'F');
  }

  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 1.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }
  
  let hasImageDrawn = false;
  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      const isJpeg = logoBase64.includes('jpeg') || logoBase64.includes('jpg');
      const format = isSvg ? 'SVG' : (isJpeg ? 'JPEG' : 'PNG');
      doc.addImage(logoBase64, format, x + 2.4, y + 1.1, 7.5, 7.5, undefined, 'FAST');
      hasImageDrawn = true;
    } catch (e) {
      console.error("Error drawing logo in back PDF:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(245, 158, 11);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.12);
    doc.roundedRect(x + 2.4, y + 1.1, 7.5, 7.5, 0.8, 0.8, 'FD');
    doc.setFillColor(153, 27, 27);
    doc.triangle(x + 3.4, y + 2.4, x + 8.9, y + 2.4, x + 6.15, y + 7.5, 'FD');
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + 11.2, y + 4.5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.3);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI', x + 11.2, y + 7.2);

  doc.setFillColor(themePrimary.r, themePrimary.g, themePrimary.b);
  doc.roundedRect(x + cw - 24, y + 1.8, 20.5, 4.6, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('MEALS', x + cw - 19.5, y + 5.1);

  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.15);
  doc.rect(x + 0.5, y + 9.0, cw - 1.0, 3.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('MEAL RECORD & ATTENDANCE CARD', x + cw / 2, y + 11.4, { align: 'center' });
  
  drawCalendarPdf(doc, x + 3.1, y + 13.0, 'June', 1, 30, 5.8, 5.0);
  
  doc.setFont('helvetica', 'bold');
  drawCalendarPdf(doc, x + cw - 43.7, y + 13.0, 'July', 3, 31, 5.8, 5.0);
  
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  doc.line(x, y + ch - 7.5, x + cw, y + ch - 7.5);
  doc.rect(x + 0.3, y + ch - 7.5, cw - 0.6, 7.3, 'F');
  
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('"God is Our Guide"', x + cw / 2, y + ch - 3.3, { align: 'center' });
}

function drawCardPaymentPdf(
  doc, 
  x, 
  y, 
  student, 
  cw, 
  ch, 
  logoBase64,
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

  doc.setLineWidth(0.35);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');

  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 1.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }

  const bgR1 = themeGStart.r, bgG1 = themeGStart.g, bgB1 = themeGStart.b;
  const bgR2 = themeGEnd.r, bgG2 = themeGEnd.g, bgB2 = themeGEnd.b;

  doc.setFillColor(bgR1, bgG1, bgB1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 8.5, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 5.0, 8.0, 4.0, 'F');
  
  doc.setFillColor(bgR2, bgG2, bgB2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 8.5, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 5.0, 8.0, 4.0, 'F');

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
    doc.rect(gStartXBack + i * stepWBack, y + 0.5, stepWBack + 0.1, 8.5, 'F');
  }

  let hasImageDrawn = false;
  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      const isJpeg = logoBase64.includes('jpeg') || logoBase64.includes('jpg');
      const format = isSvg ? 'SVG' : (isJpeg ? 'JPEG' : 'PNG');
      doc.addImage(logoBase64, format, x + 2.4, y + 1.1, 7.5, 7.5, undefined, 'FAST');
      hasImageDrawn = true;
    } catch (e) {
      console.error("Error drawing logo in payment card:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(245, 158, 11);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.12);
    doc.roundedRect(x + 2.4, y + 1.1, 7.5, 7.5, 0.8, 0.8, 'FD');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + 11.2, y + 4.5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.3);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI', x + 11.2, y + 7.2);

  doc.setFillColor(themePrimary.r, themePrimary.g, themePrimary.b);
  doc.roundedRect(x + cw - 24, y + 1.8, 20.5, 4.6, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('PAYMENT', x + cw - 21.0, y + 5.1);

  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.15);
  doc.rect(x + 0.5, y + 9.0, cw - 1.0, 3.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('OFFICIAL SCHOOL FEES PAYMENT LEDGER', x + cw / 2, y + 11.4, { align: 'center' });

  const ty = y + 13.5;
  const th = 4.4;
  const trh = 10.0;

  const colW1 = 19.5;
  const colW2 = 21.0;
  const colW3 = 19.5;
  const colW4 = 25.0;
  const tableW = colW1 + colW2 + colW3 + colW4;
  const tx = x + 2.5;

  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.rect(tx, ty, tableW, th, 'F');

  doc.setLineWidth(0.22);
  doc.setDrawColor(0, 0, 0);
  doc.rect(tx, ty, tableW, th + 3 * trh, 'D');

  doc.line(tx + colW1, ty, tx + colW1, ty + th + 3 * trh);
  doc.line(tx + colW1 + colW2, ty, tx + colW1 + colW2, ty + th + 3 * trh);
  doc.line(tx + colW1 + colW2 + colW3, ty, tx + colW1 + colW2 + colW3, ty + th + 3 * trh);

  doc.line(tx, ty + th, tx + tableW, ty + th);
  doc.line(tx, ty + th + trh, tx + tableW, ty + th + trh);
  doc.line(tx, ty + th + 2 * trh, tx + tableW, ty + th + 2 * trh);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('INSTALLMENT', tx + colW1 / 2, ty + 3.2, { align: 'center' });
  doc.text('AMOUNT (UGX)', tx + colW1 + colW2 / 2, ty + 3.2, { align: 'center' });
  doc.text('BAL (UGX)', tx + colW1 + colW2 + colW3 / 2, ty + 3.2, { align: 'center' });
  doc.text('BURSAR SIGN', tx + colW1 + colW2 + colW3 + colW4 / 2, ty + 3.2, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.2);
  doc.setTextColor(0, 0, 0);
  doc.text('1st Installment', tx + 1.8, ty + th + 6.3);
  doc.text('2nd Installment', tx + 1.8, ty + th + trh + 6.3);
  doc.text('3rd Installment', tx + 1.8, ty + th + 2 * trh + 6.3);

  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  const footerY = y + ch - 3.7;
  doc.line(x, footerY, x + cw, footerY);
  doc.rect(x + 0.3, footerY, cw - 0.6, 3.5, 'F');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('"God is Our Guide"', x + cw / 2, y + ch - 1.2, { align: 'center' });
}

function drawCardAugustPdf(
  doc, 
  x, 
  y, 
  student, 
  cw, 
  ch, 
  logoBase64,
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

  doc.setLineWidth(0.35);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.roundedRect(x, y, cw, ch, 3.5, 3.5, 'D');

  if (logoBase64 && showWatermark) {
    const wmSize = 34.0;
    const wmX = x + (cw - wmSize) / 2;
    const wmY = y + (ch - wmSize) / 2 + 1.0;
    drawSafeWatermark(doc, logoBase64, wmX, wmY, wmSize, wmSize, watermarkOpacityVal);
  }

  const bgR1 = themeGStart.r, bgG1 = themeGStart.g, bgB1 = themeGStart.b;
  const bgR2 = themeGEnd.r, bgG2 = themeGEnd.g, bgB2 = themeGEnd.b;

  doc.setFillColor(bgR1, bgG1, bgB1);
  doc.roundedRect(x + 0.5, y + 0.5, 8.0, 8.5, 3.5, 3.5, 'F');
  doc.rect(x + 0.5, y + 5.0, 8.0, 4.0, 'F');
  
  doc.setFillColor(bgR2, bgG2, bgB2);
  doc.roundedRect(x + cw - 8.5, y + 0.5, 8.0, 8.5, 3.5, 3.5, 'F');
  doc.rect(x + cw - 8.5, y + 5.0, 8.0, 4.0, 'F');

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
    doc.rect(gStartXBack + i * stepWBack, y + 0.5, stepWBack + 0.1, 8.5, 'F');
  }

  let hasImageDrawn = false;
  if (logoBase64) {
    try {
      const isSvg = logoBase64.includes('svg+xml');
      const isJpeg = logoBase64.includes('jpeg') || logoBase64.includes('jpg');
      const format = isSvg ? 'SVG' : (isJpeg ? 'JPEG' : 'PNG');
      doc.addImage(logoBase64, format, x + 2.4, y + 1.1, 7.5, 7.5, undefined, 'FAST');
      hasImageDrawn = true;
    } catch (e) {
      console.error("Error drawing logo in payment card:", e);
    }
  }

  if (!hasImageDrawn) {
    doc.setFillColor(245, 158, 11);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.12);
    doc.roundedRect(x + 2.4, y + 1.1, 7.5, 7.5, 0.8, 0.8, 'FD');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('ST. PAUL SECONDARY SCHOOL, NASUTI', x + 11.2, y + 4.5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.3);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('P.O.BOX 678, NASUTI', x + 11.2, y + 7.2);

  doc.setFillColor(themePrimary.r, themePrimary.g, themePrimary.b);
  doc.roundedRect(x + cw - 24, y + 1.8, 20.5, 4.6, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.4);
  if (classTheme.isDark) {
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setTextColor(themeText.r, themeText.g, themeText.b);
  }
  doc.text('MEALS', x + cw - 20.0, y + 5.1);

  doc.setFillColor(themeBadgeBg.r, themeBadgeBg.g, themeBadgeBg.b);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.15);
  doc.rect(x + 0.5, y + 9.0, cw - 1.0, 3.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.8);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('AUGUST STUDENT MEALS VALIDATION CARD', x + cw / 2, y + 11.4, { align: 'center' });

  drawCalendarPdf(doc, x + 3.0, y + 13.0, 'August', 6, 31, 5.9, 4.5);

  // Ream of Papers Contribution Box on Right
  const bx = x + 46.5;
  const by = y + 13.0;
  const bw = 40.5;
  const bh = 29.0;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.25);
  doc.roundedRect(bx, by, bw, bh, 1.2, 1.2, 'FD');

  // Heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('REAM OF PAPERS CONTRIBUTION', bx + bw / 2, by + 3.2, { align: 'center' });

  doc.setLineWidth(0.18);
  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.line(bx + 1.5, by + 4.2, bx + bw - 1.5, by + 4.2);

  // Stacked Paper Reams Illustration
  const rx = bx + bw / 2 - 11.0;
  const ry = by + 4.8;
  const rw = 22.0;
  const rh = 2.6;

  // Top Ream
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.12);
  doc.roundedRect(rx, ry, rw, rh, 0.3, 0.3, 'FD');
  doc.setFillColor(29, 78, 216); // Blue band
  doc.rect(rx, ry, 5.5, rh, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(3.0);
  doc.setFont('helvetica', 'bold');
  doc.text('A4', rx + 2.7, ry + 1.8, { align: 'center' });
  doc.setTextColor(70, 80, 95);
  doc.setFontSize(2.8);
  doc.text('PREMIUM PAPER 500 SH', rx + 6.2, ry + 1.8);

  // Bottom Ream
  doc.setFillColor(235, 238, 242);
  doc.setDrawColor(160, 160, 160);
  doc.roundedRect(rx, ry + 2.2, rw, rh, 0.3, 0.3, 'FD');
  doc.setFillColor(30, 58, 138); // Darker blue band
  doc.rect(rx, ry + 2.2, 5.5, rh, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(3.0);
  doc.text('A4', rx + 2.7, ry + 4.0, { align: 'center' });
  doc.setTextColor(70, 80, 95);
  doc.setFontSize(2.8);
  doc.text('PREMIUM PAPER 500 SH', rx + 6.2, ry + 4.0);

  // Table Outer Frame
  const tx = bx + 1.2;
  const ty = by + 10.5;
  const tw = bw - 2.4;
  const th = 16.5;

  doc.setDrawColor(themeBorder.r, themeBorder.g, themeBorder.b);
  doc.setLineWidth(0.18);
  doc.roundedRect(tx, ty, tw, th, 0.6, 0.6, 'D');

  // Header Row
  doc.setFillColor(themeText.r, themeText.g, themeText.b);
  doc.rect(tx, ty, tw, 3.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(3.6);
  doc.setTextColor(255, 255, 255);
  doc.text('REQUIREMENT', tx + 1.5, ty + 2.3);
  doc.text('RECEIVED', tx + 15.0, ty + 2.3, { align: 'center' });
  doc.text('DATE', tx + 22.5, ty + 2.3, { align: 'center' });
  doc.text("OFFICER'S SIGN", tx + 31.5, ty + 2.3, { align: 'center' });

  // Vertical grid lines
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.12);
  doc.line(tx + 12.0, ty, tx + 12.0, ty + th);
  doc.line(tx + 18.0, ty, tx + 18.0, ty + th);
  doc.line(tx + 27.0, ty, tx + 27.0, ty + th);

  // Row 1
  const r1y = ty + 3.4;
  const rh1 = 6.5;

  // Number circle 1
  doc.setFillColor(themeText.r, themeText.g, themeText.b);
  doc.ellipse(tx + 2.0, r1y + 3.2, 1.0, 1.0, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(3.4);
  doc.setFont('helvetica', 'bold');
  doc.text('1', tx + 2.0, r1y + 3.9, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(3.6);
  doc.text('1 REAM', tx + 3.6, r1y + 2.8);
  doc.setFontSize(3.2);
  doc.text('OF PAPER', tx + 3.6, r1y + 5.3);

  // Received Checkbox
  doc.setDrawColor(80, 80, 80);
  doc.rect(tx + 13.8, r1y + 2.0, 2.4, 2.4, 'D');

  // Date Line
  doc.line(tx + 19.2, r1y + 4.8, tx + 25.8, r1y + 4.8);

  // Officer Line
  doc.line(tx + 28.2, r1y + 4.8, tx + 36.8, r1y + 4.8);

  // Row Divider
  doc.setDrawColor(210, 210, 210);
  doc.line(tx, r1y + rh1, tx + tw, r1y + rh1);

  // Row 2
  const r2y = r1y + rh1;

  // Number circle 2
  doc.setFillColor(themeText.r, themeText.g, themeText.b);
  doc.ellipse(tx + 2.0, r2y + 3.2, 1.0, 1.0, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(3.4);
  doc.setFont('helvetica', 'bold');
  doc.text('2', tx + 2.0, r2y + 3.9, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(3.6);
  doc.text('1 REAM', tx + 3.6, r2y + 2.8);
  doc.setFontSize(3.2);
  doc.text('OF PAPER', tx + 3.6, r2y + 5.3);

  // Received Checkbox
  doc.setDrawColor(80, 80, 80);
  doc.rect(tx + 13.8, r2y + 2.0, 2.4, 2.4, 'D');

  // Date Line
  doc.line(tx + 19.2, r2y + 4.8, tx + 25.8, r2y + 4.8);

  // Officer Line
  doc.line(tx + 28.2, r2y + 4.8, tx + 36.8, r2y + 4.8);

  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 250, 250);
  doc.setLineWidth(0.2);
  doc.line(x, y + ch - 5.5, x + cw, y + ch - 5.5);
  doc.rect(x + 0.3, y + ch - 5.5, cw - 0.6, 5.3, 'F');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.0);
  doc.setTextColor(themeText.r, themeText.g, themeText.b);
  doc.text('"God is Our Guide"', x + cw / 2, y + ch - 2.4, { align: 'center' });
}

async function generateClearancePdf({
  layoutMode,
  students,
  schoolLogoBase64,
  printSide = 'both',
  increasePdfBrightness = true,
  showWatermark = true,
  watermarkOpacity = 25,
  onProgress = null
}) {
  const watermarkOpacityVal = watermarkOpacity / 100;
  const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));
  
  let currentStep = 0;
  const totalSteps = students.length; // Removed QR code generation step

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true, // Enable built-in PDF compression
  });

  const cardW = 90;
  const cardH = 58;
  const marginX = 10;
  const marginY = 13;
  const spacingX = 10;
  const spacingY = 13;

  // Pre-generate unique QR codes for every student if not present
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    if (!student.qrCodeBase64) {
      try {
        const stdIdentifier = student.studentNo || student.adminNo || student.id;
        const secureUrl = `https://stpaulss-eportal.vercel.app/verify/student/${encodeURIComponent(stdIdentifier)}`;
        student.qrCodeBase64 = await QRCode.toDataURL(secureUrl, { margin: 1, width: 250, errorCorrectionLevel: 'M' });
      } catch (e) {
        console.warn(`Could not generate QR code for student ${student.id}:`, e);
      }
    }
  }

  if (layoutMode === 'front-back-paired') {
    let studentCounter = 0;
    
    if (printSide === 'front') {
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const rowIdx = studentCounter % 4;
        const py = marginY + rowIdx * (cardH + spacingY);

        drawCardBackPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);

        studentCounter++;
        if (studentCounter % 4 === 0 && i < students.length - 1) {
          doc.addPage();
        }
        currentStep++;
        if (onProgress) onProgress(currentStep, totalSteps);
        await yieldEventLoop();
      }
    } else if (printSide === 'back') {
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const rowIdx = studentCounter % 4;
        const py = marginY + rowIdx * (cardH + spacingY);

        drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
        drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);

        studentCounter++;
        if (studentCounter % 4 === 0 && i < students.length - 1) {
          doc.addPage();
        }
        currentStep++;
        if (onProgress) onProgress(currentStep, totalSteps);
        await yieldEventLoop();
      }
    } else {
      const studentsPerPage = 4;
      const totalPagesNeeded = Math.ceil(students.length / studentsPerPage);

      for (let pageIdx = 0; pageIdx < totalPagesNeeded; pageIdx++) {
        if (pageIdx > 0) {
          doc.addPage();
        }

        const startIndex = pageIdx * studentsPerPage;
        const pageStudents = students.slice(startIndex, startIndex + studentsPerPage);

        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardBackPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          await yieldEventLoop();
        }

        doc.addPage();
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          
          currentStep++;
          if (onProgress) onProgress(currentStep, totalSteps);
          await yieldEventLoop();
        }
      }
    }
  } else {
    const studentsPerPage = 4;
    const totalPagesNeeded = Math.ceil(students.length / studentsPerPage);

    for (let pageIdx = 0; pageIdx < totalPagesNeeded; pageIdx++) {
      if (pageIdx > 0) {
        doc.addPage();
      }

      const startIndex = pageIdx * studentsPerPage;
      const pageStudents = students.slice(startIndex, startIndex + studentsPerPage);

      if (printSide === 'front') {
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardBackPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          
          currentStep++;
          if (onProgress) onProgress(currentStep, totalSteps);
          await yieldEventLoop();
        }
      } else if (printSide === 'back') {
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          
          currentStep++;
          if (onProgress) onProgress(currentStep, totalSteps);
          await yieldEventLoop();
        }
      } else {
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardBackPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardFrontPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          await yieldEventLoop();
        }

        doc.addPage();
        for (let sIdx = 0; sIdx < pageStudents.length; sIdx++) {
          const student = pageStudents[sIdx];
          const row = sIdx;
          const py = marginY + row * (cardH + spacingY);

          drawCardPaymentPdf(doc, marginX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          drawCardAugustPdf(doc, marginX + cardW + spacingX, py, student, cardW, cardH, schoolLogoBase64, showWatermark, watermarkOpacityVal, increasePdfBrightness);
          
          currentStep++;
          if (onProgress) onProgress(currentStep, totalSteps);
          await yieldEventLoop();
        }
      }
    }
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.saveGraphicsState();
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.18);

    for (let r = 1; r < 4; r++) {
      const y = marginY + r * (cardH + spacingY) - spacingY / 2;
      doc.line(0, y, 210, y);
    }
    
    doc.restoreGraphicsState();
  }

  return doc;
}

module.exports = {
  generateClearancePdf
};
