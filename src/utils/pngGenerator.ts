/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Staff } from '../types.ts';
import QRCode from 'qrcode';
import JSZip from 'jszip';

// Helper to load image securely with base64/URL support in Canvas
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image: ' + src));
    img.src = src;
  });
};

// Standard helper for manual rounded rectangle drawing on 2D canvas context
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates a high-resolution PNG data URL for a given staff card.
 * Dimensions: 1012 x 638 pixels (300 DPI for CR80 card)
 */
export async function generateStaffIdCardPng(
  member: Staff,
  schoolLogoBase64?: string | null,
  authorizedSignatureBase64?: string | null,
  side: 'front' | 'back' = 'front'
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1012;
  canvas.height = 638;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from canvas');

  if (side === 'back') {
    // 1. Background Fill (White)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);



    // 3. Faint School Crest Watermark in Center (10% opacity)
    if (schoolLogoBase64) {
      try {
        ctx.save();
        ctx.globalAlpha = 0.10;
        const logoImg = await loadImage(schoolLogoBase64);
        ctx.drawImage(logoImg, (canvas.width - 260) / 2, (canvas.height - 260) / 2, 260, 260);
        ctx.restore();
      } catch (e) {
        console.warn('Failed drawing watermark on PNG card back:', e);
      }
    }

    // 4. Header Section
    // Top Left: School name and address
    ctx.fillStyle = '#062C54'; // Dark Navy Blue
    ctx.font = 'bold 24px "Montserrat", "Poppins", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ST. PAUL SECONDARY SCHOOL, NASUTI', 50, 55);

    ctx.fillStyle = '#475569'; // Slate Gray
    ctx.font = '500 17px "Montserrat", "Poppins", sans-serif';
    ctx.fillText('P.O. Box 678, Nasuti, Iganga', 50, 95);

    // Top Right: Card ID
    const barcodeVal = member.employeeNumber || member.id || 'Not Available';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '500 17px "Montserrat", sans-serif';
    ctx.fillText('ID Card Number: ', canvas.width - 50 - ctx.measureText(barcodeVal).width - 4, 55);
    ctx.fillStyle = '#062C54';
    ctx.font = 'bold 17px "Montserrat", sans-serif';
    ctx.fillText(barcodeVal, canvas.width - 50, 55);

    // Header border bottom line
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(50, 135);
    ctx.lineTo(canvas.width - 50, 135);
    ctx.stroke();

    // 5. Card Ownership Statement & Rules
    ctx.fillStyle = '#062C54';
    ctx.font = 'bold 18px "Montserrat", "Poppins", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CARD OWNERSHIP STATEMENT & RULES:', 50, 165);

    // Underline
    const titleW = ctx.measureText('CARD OWNERSHIP STATEMENT & RULES:').width;
    ctx.strokeStyle = '#062C54';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(50, 192);
    ctx.lineTo(50 + titleW, 192);
    ctx.stroke();

    // Rules text (medium gray and easy to read)
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 17px "Inter", "Poppins", sans-serif';
    const rules = [
      '1. This card is the property of St. Paul Secondary School, Nasuti.',
      '2. If found, please return to the school administration office at the address listed above.',
      '3. In the event of loss, this card must be reported immediately to the School Administration Office.'
    ];
    let ry = 225;
    rules.forEach(rule => {
      ctx.fillText(rule, 50, ry);
      ry += 40;
    });

    // 6. Thicker gray horizontal line separating main from footer
    ctx.strokeStyle = '#CBD5E1'; // Slate 300
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(50, 460);
    ctx.lineTo(canvas.width - 50, 460);
    ctx.stroke();

    // 7. Footer Block
    const footerY = 495;

    // Deterministic card serial number
    let hash = 0;
    for (let i = 0; i < barcodeVal.length; i++) {
      hash = (hash << 5) - hash + barcodeVal.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().slice(0, 8).padStart(8, '0');
    const serialStr = `SN-${hex}`;

    // Bottom Left Info Block aligned perfectly along common baseline
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 16px "Montserrat", sans-serif';
    ctx.fillText('TEL:', 50, footerY);
    ctx.fillStyle = '#1E293B';
    ctx.font = '500 16px "Montserrat", sans-serif';
    ctx.fillText('+256 776246610', 95, footerY);

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 16px "Montserrat", sans-serif';
    ctx.fillText('EMAIL:', 50, footerY + 30);
    ctx.fillStyle = '#1E293B';
    ctx.font = '500 16px "Montserrat", sans-serif';
    ctx.fillText('stpaulssnasuti2022@gmail.com', 120, footerY + 30);

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 16px "Montserrat", sans-serif';
    ctx.fillText('SERIAL:', 50, footerY + 60);
    ctx.fillStyle = '#062C54';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText(serialStr, 130, footerY + 60);

    // Bottom Right Barcode Block (scaled up by ~25%)
    const barcodeX = canvas.width - 290;
    const barcodeY = footerY - 20;
    const barcodeW = 240;
    const barcodeH = 65;

    // Draw simulated Code 128 barcode lines
    ctx.save();
    ctx.fillStyle = '#000000';
    const pattern = [2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 2, 4, 1, 2, 3, 1, 2, 4, 1, 2, 3, 1, 2, 4, 1, 2, 3, 1, 2, 4, 2];
    let currX = barcodeX + (barcodeW - (63 * 2.8)) / 2; // Center inside barcode container
    for (let i = 0; i < pattern.length; i++) {
      const w = pattern[i] * 2.8;
      if (i % 2 === 0) {
        ctx.fillRect(currX, barcodeY, w, barcodeH);
      }
      currX += w;
    }
    ctx.restore();

    // Spaced out card number text printed beneath barcode perfectly aligned along common baseline (footerY + 60)
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'center';
    const spacedBarcode = barcodeVal.split('').join(' ');
    ctx.fillText(spacedBarcode, barcodeX + barcodeW / 2, footerY + 60);

    // Redraw inner border to cleanly frame the footer area
    ctx.strokeStyle = '#EAF4FF';
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 20);
    ctx.stroke();

    return canvas.toDataURL('image/png');
  }

  // Format Date Helper to '24 Jun 2026'
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

  // --- 1. Background Fill and Gradient ---
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(0.7, '#F4FAFF');
  bgGrad.addColorStop(1, '#EAF4FF');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);




  // --- 4. Security Watermark (Middle, 4% Opacity) ---
  if (schoolLogoBase64) {
    try {
      const wmImg = await loadImage(schoolLogoBase64);
      ctx.save();
      ctx.globalAlpha = 0.02;
      const wmSize = 340;
      ctx.drawImage(
        wmImg,
        canvas.width / 2 - wmSize / 2,
        canvas.height / 2 - wmSize / 2,
        wmSize,
        wmSize
      );
      ctx.restore();
    } catch (e) {
      console.warn('Failed to draw watermark on PNG:', e);
    }
  }

  // --- 5. Security Margin Text ---
  ctx.save();
  ctx.fillStyle = 'rgba(11, 74, 139, 0.05)'; // Primary Blue #0B4A8B
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.translate(25, 450);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('ST. PAUL SEC. SCH SECURITY DOCUMENT', 0, 0);
  ctx.restore();

  // --- 6. Double Rounded Borders ---
  ctx.strokeStyle = '#0B4A8B'; // Primary Blue
  ctx.lineWidth = 8;
  drawRoundedRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 38);
  ctx.stroke();

  ctx.strokeStyle = '#EAF4FF'; // Light Blue
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, 11, 11, canvas.width - 22, canvas.height - 22, 30);
  ctx.stroke();

  // --- 7. Header Section ---
  const crestX = 40;
  const crestY = 28;
  const crestSize = 98;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#EAF4FF';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, crestX, crestY, crestSize, crestSize, 10);
  ctx.fill();
  ctx.stroke();
  
  if (schoolLogoBase64) {
    try {
      const logoImg = await loadImage(schoolLogoBase64);
      ctx.drawImage(logoImg, crestX + 8, crestY + 8, crestSize - 16, crestSize - 16);
    } catch (e) {
      console.warn('Failed to draw header logo on PNG:', e);
    }
  }
  ctx.restore();

  ctx.fillStyle = '#0B4A8B'; // Primary Blue
  ctx.font = 'bold 30px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ST. PAUL SECONDARY SCHOOL, NASUTI', 152, 68);

  ctx.fillStyle = '#6B7280'; // Neutral Gray
  ctx.font = 'bold 18px "Poppins", "Montserrat", sans-serif';
  ctx.fillText('P.O. BOX 678, NASUTI, IGANGA', 152, 102);

  // STAFF badge (pill shaped corner badge)
  const badgeW = 90;
  const badgeH = 34;
  const badgeX = canvas.width - badgeW - 40;
  const badgeY = 96;

  ctx.save();
  ctx.fillStyle = '#0B4A8B';
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 17);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STAFF', badgeX + badgeW / 2, badgeY + 22);
  ctx.restore();

  // Divider Line
  ctx.strokeStyle = '#2F80ED'; // Accent Blue
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 142);
  ctx.lineTo(canvas.width - 40, 142);
  ctx.stroke();

  // --- Centered Pill: STAFF IDENTITY CARD (shifted right) ---
  const pillW = 440;
  const pillH = 42;
  const pillX = 350;
  const pillY = 158;
  
  const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
  pillGrad.addColorStop(0, '#0B4A8B');
  pillGrad.addColorStop(1, '#2F80ED');
  ctx.fillStyle = pillGrad;
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 21);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STAFF IDENTITY CARD', pillX + pillW / 2, pillY + 27);

  // --- 9. Left Column: Passport Photo Frame (Shifted down slightly, reduced by 10%) ---
  const photoX = 40;
  const photoW = 270;
  const photoH = 270;
  const photoY = 225; // center vertically inside middle body Y range (210 to 510)

  // Shadow for passport frame
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 15);
  ctx.fill();
  ctx.restore();

  // Render Image inside photo frame
  ctx.save();
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 15);
  ctx.clip();
  if (member.photo) {
    try {
      const photoImg = await loadImage(member.photo);
      ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
    } catch (e) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.arc(photoX + photoW / 2, photoY + 115, 60, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(photoX + photoW / 2, photoY + 300, 110, 80, 0, 0, Math.PI, true);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.arc(photoX + photoW / 2, photoY + 115, 60, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(photoX + photoW / 2, photoY + 300, 110, 80, 0, 0, Math.PI, true);
    ctx.fill();
  }
  ctx.restore();

  // Border over photo frame
  ctx.strokeStyle = 'rgba(47, 128, 237, 0.2)'; // Accent blue border at 20% opacity
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 15);
  ctx.stroke();



  // --- 10. Middle Column: Staff Details List (Sentence Case & Premium Hierarchy) ---
  const labelX = 360;
  const valueX = 490;
  
  const startRowY = 255;
  const rowSpacing = 53;

  const labels = ['Name:', 'Staff No:', 'Designation:', 'Department:', 'Gender:'];
  const fullName = `${member.firstName || ''} ${member.middleName ? member.middleName + ' ' : ''}${member.lastName || ''}`.toUpperCase().trim() || member.name || 'Not Available';
  const staffNo = member.employeeNumber || member.id || 'Not Available';
  const position = (member.position || 'Not Available').toUpperCase();
  const department = (member.department || 'Not Available').toUpperCase();
  const gender = (member.gender || 'Female').toUpperCase();
  const values = [fullName, staffNo, position, department, gender];

  // Wrap name if it exceeds details width (782 - 490 = 292 pixels)
  ctx.save();
  ctx.textAlign = 'left';
  
  // Set font to measure name lines
  ctx.font = 'bold 22px "Poppins", "Montserrat", sans-serif';
  const maxNameWidth = 280;
  const nameWords = fullName.split(' ');
  let nameLine1 = '';
  let nameLine2 = '';
  
  for (let i = 0; i < nameWords.length; i++) {
    const testLine = nameLine1 ? nameLine1 + ' ' + nameWords[i] : nameWords[i];
    if (ctx.measureText(testLine).width <= maxNameWidth && !nameLine2) {
      nameLine1 = testLine;
    } else {
      nameLine2 = nameLine2 ? nameLine2 + ' ' + nameWords[i] : nameWords[i];
    }
  }

  let currentY = 230;

  // Draw Name Row (allow 2 lines if needed)
  ctx.fillStyle = '#6B7280'; // Neutral Gray
  ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
  if (nameLine2) {
    ctx.fillText('Name:', labelX, currentY - 5);
    ctx.fillStyle = '#0B4A8B'; // Primary Blue
    ctx.font = 'bold 20px "Poppins", "Montserrat", sans-serif';
    ctx.fillText(nameLine1, valueX, currentY - 5);
    ctx.fillText(nameLine2, valueX, currentY + 16);
    currentY += 42; // Next row start
  } else {
    ctx.fillText('Name:', labelX, currentY);
    ctx.fillStyle = '#0B4A8B'; // Primary Blue
    ctx.font = 'bold 22px "Poppins", "Montserrat", sans-serif';
    ctx.fillText(nameLine1, valueX, currentY);
    currentY += 32; // Next row start (approx 8px gap after name text height)
  }

  const drawPngRow = (lbl: string, val: string, yPos: number) => {
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
    ctx.fillText(lbl, labelX, yPos);

    ctx.fillStyle = '#1E3A5F';
    ctx.font = 'bold 17px "Poppins", "Montserrat", sans-serif';
    
    let valStr = val || 'Not Available';
    const maxValW = 280;
    if (ctx.measureText(valStr).width > maxValW) {
      while (ctx.measureText(valStr + '...').width > maxValW && valStr.length > 0) {
        valStr = valStr.substring(0, valStr.length - 1);
      }
      valStr += '...';
    }
    ctx.fillText(valStr, valueX, yPos);
  };

  drawPngRow('Staff ID:', staffNo, currentY);
  currentY += 40;
  drawPngRow('Designation:', position, currentY);
  currentY += 40;
  drawPngRow('Department:', department, currentY);
  currentY += 40;
  drawPngRow('Gender:', gender, currentY);
  ctx.restore();

  // --- 11. Verification Box containing QR Code & Label (narrower, 20% smaller QR) ---
  const qrBoxW = 160;
  const qrBoxH = 210; // smaller box height (less padding)
  const qrBoxX = canvas.width - qrBoxW - 40;
  const qrBoxY = 222; // pushed down slightly

  ctx.save();
  ctx.fillStyle = '#FFFFFF'; // White background
  ctx.strokeStyle = '#2F80ED'; // Solid Blue border
  ctx.lineWidth = 2.0;
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxW, qrBoxH, 18);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const qrSize = 130; // smaller QR size to fit the smaller box
  const qrX = qrBoxX + (qrBoxW - qrSize) / 2;
  const qrY = qrBoxY + 34; // pushed down inside box (more top padding)

  try {
    const qrUrl = `${window.location.origin}/staff/verify/${member.employeeNumber || member.id}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, errorCorrectionLevel: 'M' });
    const qrImg = await loadImage(qrDataUrl);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  } catch (e) {
    console.warn('Failed to draw QR image on PNG:', e);
  }

  // Subtexts inside QR container box
  ctx.fillStyle = '#0B4A8B'; // Primary Blue
  ctx.font = 'bold 14px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Scan QR Code', qrBoxX + qrBoxW / 2, qrBoxY + 188); // positioned nicely inside smaller box

  // --- 12. Bottom Row: 4 equal columns separated by vertical divider lines ---
  const bottomY = 515;

  // Solid shaded background for the footer to cover any grid, watermark, or security text (#F8FAFC)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(10, bottomY, canvas.width - 20, canvas.height - 10 - bottomY);

  // Divider Line
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, bottomY);
  ctx.lineTo(canvas.width - 40, bottomY);
  ctx.stroke();

  // Vertical Separators (thin light-gray lines)
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // Div 1
  ctx.moveTo(253, bottomY + 15);
  ctx.lineTo(253, canvas.height - 20);
  // Div 2
  ctx.moveTo(506, bottomY + 15);
  ctx.lineTo(506, canvas.height - 20);
  // Div 3
  ctx.moveTo(759, bottomY + 15);
  ctx.lineTo(759, canvas.height - 20);
  ctx.stroke();

  // Render Mini-Icons in Footer using canvas vector commands
  ctx.save();
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 1.8;
  
  // Calendar Icon (Col 1)
  ctx.beginPath();
  ctx.rect(30, bottomY + 20, 20, 20);
  ctx.moveTo(30, bottomY + 26);
  ctx.lineTo(50, bottomY + 26);
  ctx.moveTo(35, bottomY + 17);
  ctx.lineTo(35, bottomY + 22);
  ctx.moveTo(45, bottomY + 17);
  ctx.lineTo(45, bottomY + 22);
  ctx.stroke();

  // Pen Tool Icon (Col 2)
  ctx.beginPath();
  ctx.moveTo(275, bottomY + 38);
  ctx.lineTo(290, bottomY + 23);
  ctx.moveTo(277, bottomY + 35);
  ctx.lineTo(275, bottomY + 38);
  ctx.stroke();

  // Check Seal Icon (Col 3)
  ctx.beginPath();
  ctx.arc(538, bottomY + 30, 10, 0, Math.PI * 2);
  ctx.moveTo(533, bottomY + 30);
  ctx.lineTo(536, bottomY + 33);
  ctx.lineTo(543, bottomY + 26);
  ctx.stroke();

  // Clock Icon (Col 4)
  ctx.beginPath();
  ctx.arc(790, bottomY + 30, 10, 0, Math.PI * 2);
  ctx.moveTo(790, bottomY + 30);
  ctx.lineTo(790, bottomY + 24);
  ctx.moveTo(790, bottomY + 30);
  ctx.lineTo(795, bottomY + 30);
  ctx.stroke();
  ctx.restore();

  // Labels (sentence case, left-aligned alongside icons)
  ctx.save();
  ctx.fillStyle = '#6B7280'; // Neutral Gray
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'left';
  
  ctx.fillText('Issue Date', 58, bottomY + 33);
  ctx.fillText('Holder Signature', 300, bottomY + 33);
  ctx.fillText('Authorized Signature', 556, bottomY + 33);
  ctx.fillText('Expiry Date', 808, bottomY + 33);

  // Col 1 Value: Issue Date
  let issueDateStr = 'Not Available';
  if (member.activeCard?.issue_date) {
    issueDateStr = formatDate(member.activeCard.issue_date);
  } else {
    issueDateStr = formatDate(member.createdAt || new Date());
  }
  ctx.save();
  ctx.fillStyle = '#1E3A5F'; // Dark Blue #1E3A5F
  ctx.font = '500 14px "Montserrat", "Poppins", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '1.5px';
  }
  ctx.fillText(issueDateStr, 30, bottomY + 76);
  ctx.restore();

  // Col 2 Value: Holder Signature
  if (member.signature) {
    try {
      const sigImg = await loadImage(member.signature);
      ctx.drawImage(sigImg, 275, bottomY + 48, 140, 36);
    } catch (e) {
      console.warn('Failed to draw signature image on PNG:', e);
    }
  } else {
    ctx.save();
    ctx.fillStyle = '#94A3B8';
    ctx.font = '15px "Courier New", Courier, monospace';
    ctx.fillText('...........................', 275, bottomY + 76);
    ctx.restore();
  }

  // Col 3 Value: Authorised Signature
  const isHeadTeacher = (member.position || '').replace(/\s+/g, '').toUpperCase() === 'HEADTEACHER';
  const displayAuthSig = isHeadTeacher
    ? (member.signature || authorizedSignatureBase64)
    : (authorizedSignatureBase64 || null);

  if (displayAuthSig) {
    try {
      const sigImg = await loadImage(displayAuthSig);
      ctx.drawImage(sigImg, 528, bottomY + 48, 140, 36);
    } catch (e) {
      console.warn('Failed to draw signature image on PNG:', e);
    }
  } else {
    const authText = isHeadTeacher ? (member.lastName || 'Head Teacher') : 'Authorized';
    ctx.fillStyle = '#475569';
    ctx.font = 'italic 15px "Courier New", Courier, monospace';
    ctx.fillText(authText, 528, bottomY + 76);
  }

  // Col 4 Value: Expiry Date
  let expDateStr = 'Not Available';
  if (member.activeCard?.expiry_date) {
    expDateStr = formatDate(member.activeCard.expiry_date);
  } else {
    const expDate = member.createdAt ? new Date(member.createdAt) : new Date();
    expDate.setFullYear(expDate.getFullYear() + 5);
    expDateStr = formatDate(expDate);
  }
  ctx.save();
  ctx.fillStyle = '#2F80ED'; // Accent Blue
  ctx.font = '500 14px "Montserrat", "Poppins", sans-serif';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '1.5px';
  }
  ctx.fillText(expDateStr, 780, bottomY + 76);
  ctx.restore();



  // Redraw inner border to cleanly frame the footer area
  ctx.strokeStyle = '#EAF4FF';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 20);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/**
 * Generates high-resolution PNGs for multiple staff members and packages them into a ZIP.
 */
export async function generateStaffIdCardsPngZip(
  staffMembers: Staff[],
  schoolLogoBase64?: string | null,
  authorizedSignatureBase64?: string | null,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const total = staffMembers.length;

  for (let i = 0; i < total; i++) {
    const member = staffMembers[i];
    const frontUrl = await generateStaffIdCardPng(member, schoolLogoBase64, authorizedSignatureBase64, 'front');
    const backUrl = await generateStaffIdCardPng(member, schoolLogoBase64, authorizedSignatureBase64, 'back');
    
    // Extract base64 data bytes
    const frontBase64 = frontUrl.split(',')[1];
    const backBase64 = backUrl.split(',')[1];
    const baseName = `staff_id_${member.employeeNumber || member.id || i}`;
    
    zip.file(`${baseName}_front.png`, frontBase64, { base64: true });
    zip.file(`${baseName}_back.png`, backBase64, { base64: true });

    if (onProgress) {
      onProgress(i + 1, total);
    }
    // Yield execution to keep the UI responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return await zip.generateAsync({ type: 'blob' });
}
