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

  // Format Date Helper
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

  // Canvas Icon Drawing Helpers
  const drawCanvasUserIcon = (ix: number, iy: number, isize: number) => {
    ctx.save();
    ctx.strokeStyle = '#0B6CB8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ix + isize / 2, iy + isize / 3, isize / 5, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(ix + isize / 2, iy + isize * 0.85, isize / 2.2, isize / 4, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  };

  const drawCanvasIdCardIcon = (ix: number, iy: number, isize: number) => {
    ctx.save();
    ctx.strokeStyle = '#0B6CB8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ix, iy + isize * 0.1, isize, isize * 0.75);
    ctx.strokeRect(ix + 3, iy + isize * 0.25, isize * 0.35, isize * 0.4);
    ctx.beginPath();
    ctx.moveTo(ix + isize * 0.5, iy + isize * 0.38);
    ctx.lineTo(ix + isize * 0.85, iy + isize * 0.38);
    ctx.moveTo(ix + isize * 0.5, iy + isize * 0.55);
    ctx.lineTo(ix + isize * 0.85, iy + isize * 0.55);
    ctx.stroke();
    ctx.restore();
  };

  const drawCanvasBriefcaseIcon = (ix: number, iy: number, isize: number) => {
    ctx.save();
    ctx.strokeStyle = '#0B6CB8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ix, iy + isize * 0.2, isize, isize * 0.6);
    ctx.strokeRect(ix + isize * 0.3, iy + isize * 0.02, isize * 0.4, isize * 0.18);
    ctx.restore();
  };

  const drawCanvasBuildingIcon = (ix: number, iy: number, isize: number) => {
    ctx.save();
    ctx.strokeStyle = '#0B6CB8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ix + isize * 0.15, iy, isize * 0.7, isize);
    ctx.strokeRect(ix + isize * 0.28, iy + isize * 0.2, isize * 0.15, isize * 0.15);
    ctx.strokeRect(ix + isize * 0.57, iy + isize * 0.2, isize * 0.15, isize * 0.15);
    ctx.strokeRect(ix + isize * 0.28, iy + isize * 0.5, isize * 0.15, isize * 0.15);
    ctx.strokeRect(ix + isize * 0.57, iy + isize * 0.5, isize * 0.15, isize * 0.15);
    ctx.restore();
  };

  const drawCanvasGenderIcon = (ix: number, iy: number, isize: number) => {
    ctx.save();
    ctx.strokeStyle = '#0B6CB8';
    ctx.lineWidth = 2.5;
    const isFemale = (member.gender || 'Female').toLowerCase() === 'female';
    if (isFemale) {
      ctx.beginPath();
      ctx.arc(ix + isize / 2, iy + isize / 3, isize / 4.5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ix + isize / 2, iy + isize * 0.55);
      ctx.lineTo(ix + isize / 2, iy + isize * 0.95);
      ctx.moveTo(ix + isize * 0.3, iy + isize * 0.75);
      ctx.lineTo(ix + isize * 0.7, iy + isize * 0.75);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(ix + isize * 0.4, iy + isize * 0.6, isize / 4.5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ix + isize * 0.55, iy + isize * 0.45);
      ctx.lineTo(ix + isize * 0.85, iy + isize * 0.15);
      ctx.moveTo(ix + isize * 0.6, iy + isize * 0.15);
      ctx.lineTo(ix + isize * 0.85, iy + isize * 0.15);
      ctx.lineTo(ix + isize * 0.85, iy + isize * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  };

  // --- 1. Background Fill and Gradient ---
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(0.7, '#FFFFFF');
  bgGrad.addColorStop(1, '#EAF5FF');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- 2. Faint Blueprint Grid (Opacity ~4%) ---
  ctx.strokeStyle = 'rgba(11, 108, 184, 0.04)';
  ctx.lineWidth = 1;
  const gridSize = 25;
  for (let gx = gridSize; gx < canvas.width; gx += gridSize) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, canvas.height);
    ctx.stroke();
  }
  for (let gy = gridSize; gy < canvas.height; gy += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(canvas.width, gy);
    ctx.stroke();
  }

  // --- 3. Abstract Background Circles & Curves ---
  ctx.strokeStyle = 'rgba(11, 108, 184, 0.04)';
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

  // --- 4. Security Watermark (Middle, 4% Opacity) ---
  if (schoolLogoBase64) {
    try {
      const wmImg = await loadImage(schoolLogoBase64);
      ctx.save();
      ctx.globalAlpha = 0.04;
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
  ctx.fillStyle = 'rgba(0, 62, 126, 0.06)';
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.translate(25, 450);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('ST. PAUL SEC. SCH SECURITY DOCUMENT', 0, 0);
  ctx.restore();

  // --- 6. Double Rounded Borders ---
  ctx.strokeStyle = '#003E7E';
  ctx.lineWidth = 8;
  drawRoundedRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 38);
  ctx.stroke();

  ctx.strokeStyle = '#EAF5FF';
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, 11, 11, canvas.width - 22, canvas.height - 22, 30);
  ctx.stroke();

  // --- 7. Header Section ---
  const crestX = 40;
  const crestY = 28;
  const crestSize = 98;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#EAF5FF';
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

  ctx.fillStyle = '#003E7E';
  ctx.font = 'bold 30px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ST. PAUL SECONDARY SCHOOL, NASUTI', 152, 68);

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 18px "Poppins", "Montserrat", sans-serif';
  ctx.fillText('P.O. BOX 678, NASUTI, IGANGA', 152, 102);

  const badgeW = 125;
  const badgeH = 36;
  const badgeX = canvas.width - badgeW - 40;
  const badgeY = 56;
  ctx.fillStyle = '#0B6CB8';
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STAFF', badgeX + badgeW / 2, badgeY + 24);

  // Horizontal Header Divider
  ctx.strokeStyle = '#0B6CB8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(40, 142);
  ctx.lineTo(canvas.width - 40, 142);
  ctx.stroke();

  // --- 8. Center Pill: STAFF IDENTITY CARD ---
  const pillW = 360;
  const pillH = 40;
  const pillX = canvas.width / 2 - pillW / 2;
  const pillY = 158;
  
  const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
  pillGrad.addColorStop(0, '#0B6CB8');
  pillGrad.addColorStop(1, '#003E7E');
  ctx.fillStyle = pillGrad;
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 20);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STAFF IDENTITY CARD', pillX + pillW / 2, pillY + 25);

  // --- 9. Left Column: Passport Photo Frame (140x170px proportional size: 240x292px) ---
  const photoX = 40;
  const photoY = 215;
  const photoW = 240;
  const photoH = 292;

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
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.arc(photoX + photoW / 2, photoY + 95, 50, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(photoX + photoW / 2, photoY + 250, 90, 60, 0, 0, Math.PI, true);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.arc(photoX + photoW / 2, photoY + 95, 50, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(photoX + photoW / 2, photoY + 250, 90, 60, 0, 0, Math.PI, true);
    ctx.fill();
  }
  ctx.restore();

  // Border over photo frame
  ctx.strokeStyle = '#0B6CB8';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 15);
  ctx.stroke();

  // Glowing Cyan Bubble Overlay
  ctx.save();
  ctx.globalAlpha = 0.8;
  const bubbleGrad = ctx.createRadialGradient(
    photoX + photoW, photoY + photoH / 2, 0,
    photoX + photoW, photoY + photoH / 2, 30
  );
  bubbleGrad.addColorStop(0, '#7DD3FC');
  bubbleGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = bubbleGrad;
  ctx.beginPath();
  ctx.arc(photoX + photoW, photoY + photoH / 2, 30, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  // --- 10. Middle Column: Staff Details List with Vector Icons ---
  const iconX = 310;
  const labelX = 350;
  const valueX = 510; // Perfectly aligned values column
  
  const startRowY = 245;
  const rowSpacing = 54;

  const labels = ['NAME:', 'STAFF NO:', 'DESIGNATION:', 'DEPARTMENT:', 'GENDER:'];
  const fullName = `${member.firstName || ''} ${member.middleName ? member.middleName + ' ' : ''}${member.lastName || ''}`.toUpperCase().trim() || member.name || 'Not Available';
  const staffNo = member.employeeNumber || member.id || 'Not Available';
  const position = (member.position || 'Not Available').toUpperCase();
  const department = (member.department || 'Not Available').toUpperCase();
  const gender = (member.gender || 'Female').toUpperCase();
  const values = [fullName, staffNo, position, department, gender];
  const drawIcons = [
    drawCanvasUserIcon,
    drawCanvasIdCardIcon,
    drawCanvasBriefcaseIcon,
    drawCanvasBuildingIcon,
    drawCanvasGenderIcon
  ];

  ctx.textAlign = 'left';
  for (let i = 0; i < labels.length; i++) {
    const rowY = startRowY + i * rowSpacing;

    // Draw Vector Icon
    drawIcons[i](iconX, rowY - 20, 26);

    // Label styling
    ctx.fillStyle = '#003E7E';
    ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
    ctx.save();
    let currentX = labelX;
    const letterSpacing = 3;
    for (let charIdx = 0; charIdx < labels[i].length; charIdx++) {
      const char = labels[i][charIdx];
      ctx.fillText(char, currentX, rowY);
      currentX += ctx.measureText(char).width + letterSpacing;
    }
    ctx.restore();

    // Value styling
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px "Poppins", "Montserrat", sans-serif';
    let valStr = values[i];
    // Truncate if too long to prevent overlapping right column
    if (ctx.measureText(valStr).width > 240) {
      while (ctx.measureText(valStr + '...').width > 240 && valStr.length > 0) {
        valStr = valStr.substring(0, valStr.length - 1);
      }
      valStr += '...';
    }
    ctx.fillText(valStr, valueX, rowY);
  }

  // --- 11. Redesigned QR Verification Box (Aspect ratio matches 135x165px)
  const qrBoxW = 240;
  const qrBoxH = 292;
  const qrBoxX = canvas.width - qrBoxW - 40;
  const qrBoxY = 215;

  // Outer shadow (soft gray offset)
  ctx.save();
  ctx.fillStyle = '#F2F5FA';
  drawRoundedRect(ctx, qrBoxX + 4, qrBoxY + 4, qrBoxW, qrBoxH, 15);
  ctx.fill();
  ctx.restore();

  // Main Box (White bg, blue border)
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0B6CB8';
  ctx.lineWidth = 2.5; // thin blue border
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxW, qrBoxH, 15);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // QR Code Container (occupies ~72.5% width)
  const qrSize = 174;
  const qrX = qrBoxX + (qrBoxW - qrSize) / 2;
  const qrY = qrBoxY + 24;

  // Scanned QR code URL: points to /staff/verify/{staffNumber}
  try {
    const qrUrl = `${window.location.origin}/staff/verify/${member.employeeNumber || member.id}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, errorCorrectionLevel: 'M' });
    const qrImg = await loadImage(qrDataUrl);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  } catch (e) {
    console.warn('Failed to draw QR image on PNG:', e);
  }

  // SCAN TO VERIFY label underneath QR
  ctx.fillStyle = '#0B6CB8';
  ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO VERIFY', qrBoxX + qrBoxW / 2, qrBoxY + 260);

  // --- 12. Bottom Row: 4 equal columns separated by vertical divider lines ---
  const bottomY = 530;

  // Divider Line
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, bottomY);
  ctx.lineTo(canvas.width - 40, bottomY);
  ctx.stroke();

  // Vertical Separators
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Div 1
  ctx.moveTo(253, bottomY + 10);
  ctx.lineTo(253, canvas.height - 25);
  // Div 2
  ctx.moveTo(506, bottomY + 10);
  ctx.lineTo(506, canvas.height - 25);
  // Div 3
  ctx.moveTo(759, bottomY + 10);
  ctx.lineTo(759, canvas.height - 25);
  ctx.stroke();

  const footerLabelY = bottomY + 28;
  const footerValY = bottomY + 68;

  // Issue Date (Col 1)
  let issueDateStr = 'Not Available';
  if (member.activeCard?.issue_date) {
    issueDateStr = formatDate(member.activeCard.issue_date);
  } else {
    issueDateStr = formatDate(member.createdAt || new Date());
  }
  ctx.fillStyle = '#0B6CB8';
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ISSUE DATE', 126.5, footerLabelY);
  
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 16px "Courier New", Courier, monospace';
  ctx.fillText(issueDateStr, 126.5, footerValY);

  // Holder's Signature (Col 2)
  ctx.fillStyle = '#0B6CB8';
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("HOLDER'S SIGNATURE", 379.5, footerLabelY);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(300, footerValY + 5);
  ctx.lineTo(459, footerValY + 5);
  ctx.stroke();

  // Authorised Signature (Col 3)
  ctx.fillStyle = '#0B6CB8';
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AUTHORISED SIGNATURE', 632.5, footerLabelY);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(553, footerValY + 5);
  ctx.lineTo(712, footerValY + 5);
  ctx.stroke();

  // Draw signatures if signature exists
  if (member.signature) {
    try {
      const sigImg = await loadImage(member.signature);
      ctx.drawImage(sigImg, 310, footerValY - 32, 140, 36);
      ctx.drawImage(sigImg, 563, footerValY - 32, 140, 36);
    } catch (e) {
      console.warn('Failed to draw signature image on PNG:', e);
    }
  } else {
    const sigText = member.lastName || 'Staff';
    ctx.fillStyle = '#475569';
    ctx.font = 'italic 16px "Courier New", Courier, monospace';
    ctx.fillText(sigText, 379.5, footerValY - 5);
    ctx.fillText('Authorized', 632.5, footerValY - 5);
  }

  // Expiry Date (Col 4)
  let expDateStr = 'Not Available';
  if (member.activeCard?.expiry_date) {
    expDateStr = formatDate(member.activeCard.expiry_date);
  } else {
    const expDate = member.createdAt ? new Date(member.createdAt) : new Date();
    expDate.setFullYear(expDate.getFullYear() + 5);
    expDateStr = formatDate(expDate);
  }
  ctx.fillStyle = '#0B6CB8';
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXPIRY DATE', 885.5, footerLabelY);
  
  ctx.fillStyle = '#DC2626'; // Expired date in red
  ctx.font = 'bold 16px "Courier New", Courier, monospace';
  ctx.fillText(expDateStr, 885.5, footerValY);

  return canvas.toDataURL('image/png');
}

/**
 * Generates high-resolution PNGs for multiple staff members and packages them into a ZIP.
 */
export async function generateStaffIdCardsPngZip(
  staffMembers: Staff[],
  schoolLogoBase64?: string | null,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const zip = new JSZip();
  const total = staffMembers.length;

  for (let i = 0; i < total; i++) {
    const member = staffMembers[i];
    const dataUrl = await generateStaffIdCardPng(member, schoolLogoBase64);
    
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
