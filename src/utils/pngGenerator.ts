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
  schoolLogoBase64?: string | null
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1012;
  canvas.height = 638;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from canvas');

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

  // --- 2. Security Microtext Border at the top edge ---
  ctx.save();
  ctx.fillStyle = 'rgba(47, 128, 237, 0.3)'; // Accent Blue #2F80ED
  ctx.font = 'bold 9px "Courier New", Courier, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ST. PAUL SECONDARY SCHOOL OFFICIAL SECURITY CREDENTIAL • VERIFY ONLINE', 120, 22);
  ctx.restore();

  // --- 3. Abstract Background Circles & Curves ---
  ctx.save();
  ctx.strokeStyle = 'rgba(47, 128, 237, 0.04)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(canvas.width, canvas.height / 2, 220, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(canvas.width, canvas.height / 2, 140, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, canvas.height, 200, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();

  // --- 3b. Subtle Security Guilloche Lines along borders (4% opacity) ---
  ctx.save();
  ctx.strokeStyle = 'rgba(47, 128, 237, 0.04)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(30, 30);
  ctx.bezierCurveTo(canvas.width / 2, 10, canvas.width / 2, 10, canvas.width - 30, 30);
  ctx.bezierCurveTo(canvas.width - 10, canvas.height / 2, canvas.width - 10, canvas.height / 2, canvas.width - 30, canvas.height - 30);
  ctx.bezierCurveTo(canvas.width / 2, canvas.height - 10, canvas.width / 2, canvas.height - 10, 30, canvas.height - 30);
  ctx.bezierCurveTo(10, canvas.height / 2, 10, canvas.height / 2, 30, 30);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(40, 40);
  ctx.bezierCurveTo(canvas.width / 2, 20, canvas.width / 2, 20, canvas.width - 40, 40);
  ctx.bezierCurveTo(canvas.width - 20, canvas.height / 2, canvas.width - 20, canvas.height / 2, canvas.width - 40, canvas.height - 40);
  ctx.bezierCurveTo(canvas.width / 2, canvas.height - 20, canvas.width / 2, canvas.height - 20, 40, canvas.height - 40);
  ctx.bezierCurveTo(20, canvas.height / 2, 20, canvas.height / 2, 40, 40);
  ctx.stroke();
  ctx.restore();

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

  // Draw Name Row (allow 2 lines if needed)
  ctx.fillStyle = '#6B7280'; // Neutral Gray
  ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
  if (nameLine2) {
    ctx.fillText('Name:', labelX, startRowY - 5);
    ctx.fillStyle = '#0B4A8B'; // Primary Blue
    ctx.font = 'bold 20px "Poppins", "Montserrat", sans-serif'; // slightly smaller for 2 lines
    ctx.fillText(nameLine1, valueX, startRowY - 5);
    ctx.fillText(nameLine2, valueX, startRowY + 18);
  } else {
    ctx.fillText('Name:', labelX, startRowY);
    ctx.fillStyle = '#0B4A8B'; // Primary Blue
    ctx.font = 'bold 22px "Poppins", "Montserrat", sans-serif';
    ctx.fillText(nameLine1, valueX, startRowY);
  }

  // Draw remaining details rows at fixed Y spacing
  for (let i = 1; i < labels.length; i++) {
    const rowY = startRowY + i * rowSpacing;

    // Label styling (sentence case, neutral gray)
    ctx.fillStyle = '#6B7280'; // Neutral Gray
    ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
    ctx.fillText(labels[i], labelX, rowY);

    // Value styling
    ctx.fillStyle = '#1E3A5F'; // Dark Blue #1E3A5F
    ctx.font = 'bold 16px "Poppins", "Montserrat", sans-serif';

    let valStr = values[i];
    const maxWidth = 280;
    if (ctx.measureText(valStr).width > maxWidth) {
      while (ctx.measureText(valStr + '...').width > maxWidth && valStr.length > 0) {
        valStr = valStr.substring(0, valStr.length - 1);
      }
      valStr += '...';
    }
    ctx.fillText(valStr, valueX, rowY);
  }
  ctx.restore();

  // --- 11. Verification Box containing QR Code & Label (narrower, 20% smaller QR) ---
  const qrBoxW = 190;
  const qrBoxH = 250; // slightly shorter box height
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

  const qrSize = 156;
  const qrX = qrBoxX + (qrBoxW - qrSize) / 2;
  const qrY = qrBoxY + 28; // pushed down inside box

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
  ctx.fillText('Scan QR Code', qrBoxX + qrBoxW / 2, qrBoxY + 218); // tighter label gap

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
  ctx.fillStyle = '#1E3A5F'; // Dark Blue #1E3A5F
  ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
  ctx.fillText(issueDateStr, 30, bottomY + 76);

  // Col 2 Value: Holder Signature
  if (member.signature) {
    try {
      const sigImg = await loadImage(member.signature);
      ctx.drawImage(sigImg, 275, bottomY + 48, 140, 36);
    } catch (e) {
      console.warn('Failed to draw signature image on PNG:', e);
    }
  } else {
    const sigText = member.lastName || 'Staff';
    ctx.fillStyle = '#475569';
    ctx.font = 'italic 15px "Courier New", Courier, monospace';
    ctx.fillText(sigText, 275, bottomY + 76);
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
  ctx.fillStyle = '#2F80ED'; // Accent Blue
  ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
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
    const dataUrl = await generateStaffIdCardPng(member, schoolLogoBase64, authorizedSignatureBase64);
    
    // Extract base64 data bytes
    const base64Data = dataUrl.split(',')[1];
    const fileName = `staff_id_${member.employeeNumber || member.id || i}.png`;
    zip.file(fileName, base64Data, { base64: true });

    if (onProgress) {
      onProgress(i + 1, total);
    }
    // Yield execution to keep the UI responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return await zip.generateAsync({ type: 'blob' });
}
