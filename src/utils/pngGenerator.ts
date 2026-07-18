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

  // Canvas Icon Drawing Helpers (larger size support)
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

  // --- 3b. Subtle Security Guilloche Lines along borders (4% opacity) ---
  ctx.save();
  ctx.strokeStyle = 'rgba(11, 108, 184, 0.04)';
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

  const badgeW = 145;
  const badgeH = 36;
  const badgeX = canvas.width - badgeW - 40;
  const badgeY = 56;
  ctx.fillStyle = '#0B6CB8';
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STAFF ID', badgeX + badgeW / 2, badgeY + 24);

  // Horizontal Header Divider
  ctx.strokeStyle = '#0B6CB8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(40, 142);
  ctx.lineTo(canvas.width - 40, 142);
  ctx.stroke();

  // --- 9. Left Column: Passport Photo Frame (Increased size by ~25%) ---
  const photoX = 40;
  const photoY = 152;
  const photoW = 300;
  const photoH = 365;

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
      ctx.arc(photoX + photoW / 2, photoY + 115, 60, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(photoX + photoW / 2, photoY + 300, 110, 80, 0, 0, Math.PI, true);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#F1F5F9';
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
  ctx.strokeStyle = '#0B6CB8';
  ctx.lineWidth = 2.5; // Thin blue border
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

  // --- 10. Middle Column: Staff Details List with Vector Icons (Aligned and spaced) ---
  const iconX = 370;
  const labelX = 410;
  const valueX = 540; // Perfectly aligned values column
  
  const startRowY = 190;
  const rowSpacing = 72;

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
    drawIcons[i](iconX, rowY - 22, 30);

    // Label styling
    ctx.fillStyle = '#0B6CB8';
    ctx.font = 'bold 15px "Poppins", "Montserrat", sans-serif';
    ctx.save();
    let currentX = labelX;
    const letterSpacing = 1.5;
    for (let charIdx = 0; charIdx < labels[i].length; charIdx++) {
      const char = labels[i][charIdx];
      ctx.fillText(char, currentX, rowY);
      currentX += ctx.measureText(char).width + letterSpacing;
    }
    ctx.restore();

    // Value styling
    if (i === 0) {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 22px "Poppins", "Montserrat", sans-serif';
    } else {
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 16px "Poppins", "Montserrat", sans-serif';
    }

    let valStr = values[i];
    // Truncate if too long to prevent overlapping right column (QR Box starts at 722)
    const maxWidth = 172;
    if (ctx.measureText(valStr).width > maxWidth) {
      while (ctx.measureText(valStr + '...').width > maxWidth && valStr.length > 0) {
        valStr = valStr.substring(0, valStr.length - 1);
      }
      valStr += '...';
    }
    ctx.fillText(valStr, valueX, rowY);
  }

  // --- 11. Redesigned QR Verification Box (Increased size and structured headers)
  const qrBoxW = 250;
  const qrBoxH = 365;
  const qrBoxX = canvas.width - qrBoxW - 40;
  const qrBoxY = 152;

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

  // Heading above QR code
  ctx.fillStyle = '#0B6CB8';
  ctx.font = 'bold 13px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Official Verification', qrBoxX + qrBoxW / 2, qrBoxY + 32);

  // QR Code Container (increased size)
  const qrSize = 196;
  const qrX = qrBoxX + (qrBoxW - qrSize) / 2;
  const qrY = qrBoxY + 54;

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
  ctx.font = 'bold 16px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Scan to Verify', qrBoxX + qrBoxW / 2, qrBoxY + 312);

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

  // Draw unique serial number (bottom left)
  const serialNo = `SPSSN-2026-${(member.employeeNumber || member.id || "0000").replace(/[^0-9]/g, "").slice(0, 5).padStart(5, "0")}`;
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 12px "Poppins", "Montserrat", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('S/N: ' + serialNo, 40, canvas.height - 18);

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
