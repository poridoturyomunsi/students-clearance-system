const { jsPDF } = require('jspdf');

function getOLevelGrade(mark) {
  if (mark >= 80) return { grade: 'A', label: 'Exceptional' };
  if (mark >= 70) return { grade: 'B', label: 'Outstanding' };
  if (mark >= 60) return { grade: 'C', label: 'Satisfactory' };
  if (mark >= 50) return { grade: 'D', label: 'Basic' };
  return { grade: 'E', label: 'Elementary' };
}

function getOLevelComment(mark) {
  if (mark >= 80) return 'Demonstrates extraordinary competence and creative application of skills.';
  if (mark >= 70) return 'High level of competence applied effectively to real-life situations.';
  if (mark >= 60) return 'Adequate level of competency in applying learned knowledge.';
  if (mark >= 50) return 'Minimum level of competency in real-life applications.';
  return 'Below basic competency, but still indicates acquired skills.';
}

function getUACEPrincipalGrade(score) {
  if (score >= 70) return { grade: 'A', points: 6 };
  if (score >= 60) return { grade: 'B', points: 5 };
  if (score >= 50) return { grade: 'C', points: 4 };
  if (score >= 45) return { grade: 'D', points: 3 };
  if (score >= 40) return { grade: 'E', points: 2 };
  if (score >= 35) return { grade: 'O', points: 1 };
  return { grade: 'F', points: 0 };
}

function getUACESubGPGrade(score) {
  if (score >= 80) return { grade: 'D1', points: 1 };
  if (score >= 70) return { grade: 'D2', points: 1 };
  if (score >= 60) return { grade: 'C3', points: 1 };
  if (score >= 55) return { grade: 'C4', points: 1 };
  if (score >= 50) return { grade: 'C5', points: 1 };
  if (score >= 45) return { grade: 'C6', points: 1 };
  if (score >= 40) return { grade: 'P7', points: 1 };
  if (score >= 35) return { grade: 'P8', points: 1 };
  return { grade: 'F9', points: 0 };
}

function getGeneralComment(average) {
  if (average >= 80) return 'Exceptional academic ability. Consistent effort and exemplary behavior.';
  if (average >= 70) return 'Strong academic performance. Shows progress and steady dedication.';
  if (average >= 60) return 'Good performance. With more focused study, a higher grade is achievable.';
  if (average >= 45) return 'Fair progress made. Needs to increase effort in key subjects.';
  return 'Weak performance. Requires close supervision and targeted academic support.';
}

function getClassTeacherComment(average) {
  if (average >= 80) return 'An excellent student. Displays high academic potential and active classroom involvement.';
  if (average >= 70) return 'A very promising student. Shows regular class attendance and consistently good work.';
  if (average >= 60) return 'Good work. Attentive in class, but needs to participate more actively.';
  if (average >= 45) return 'Fair progress made. Needs to avoid distractions and focus more on class participation.';
  return 'Weak classroom performance. Must work harder and pay closer attention to class instruction.';
}

function getHeadTeacherComment(average) {
  if (average >= 80) return 'Exemplary academic standard. Keep up the excellent work to secure a bright future.';
  if (average >= 70) return 'A highly commendable result. With sustained effort, the sky is the limit.';
  if (average >= 60) return 'A solid performance. There is still room for improvement to attain higher grades.';
  if (average >= 45) return 'A pass grade, but more focus is required to strengthen weak areas.';
  return 'Disappointing results. Must double his/her efforts next term to avoid stagnation.';
}

function drawSafeWatermark(doc, logoBase64, x, y, w, h, opacity = 0.05) {
  if (!logoBase64) return;
  try {
    const isSvg = logoBase64.includes('svg+xml');
    const format = isSvg ? 'SVG' : 'PNG';
    
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

    doc.addImage(logoBase64, format, x, y, w, h, undefined, 'NONE');

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

function drawPhotoPlaceholder(doc, x, y, w, h) {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(11, 30, 91);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');
  
  // Draw a camera icon outline
  doc.setDrawColor(148, 163, 184); // Slate 400
  doc.setLineWidth(0.3);
  doc.rect(x + (w/2) - 4, y + (h/2) - 3, 8, 5, 'D');
  doc.circle(x + (w/2), y + (h/2) - 0.5, 1.5, 'D');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(148, 163, 184);
  doc.text('PASSPORT PHOTO', x + (w / 2), y + (h / 2) + 5, { align: 'center' });
}

const GRADE_COLORS = {
  'A': [16, 185, 129],    // Green
  'B+': [59, 130, 246],   // Blue
  'B': [13, 148, 136],    // Teal
  'C': [249, 115, 22],    // Orange
  'D': [245, 158, 11],    // Amber
  'E': [239, 68, 68],     // Red
  'O': [124, 58, 237],    // Purple
  'F': [239, 68, 68],     // Red
  'D1': [16, 185, 129],
  'D2': [16, 185, 129],
  'C3': [59, 130, 246],
  'C4': [59, 130, 246],
  'C5': [13, 148, 136],
  'C6': [13, 148, 136],
  'P7': [245, 158, 11],
  'P8': [245, 158, 11],
  'F9': [239, 68, 68],
};

function getRankOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getInitials(name) {
  if (!name) return '';
  try {
    return name
      .split(' ')
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  } catch (err) {
    console.error('Error generating initials:', err);
    return 'N/A';
  }
}

async function compileReportsPdf({
  students,
  olevelMarks,
  uaceMarks,
  term,
  year,
  settings = {},
  classTeachers = {},
  teachersMap = {},
  verificationTokens = {},
  dosTeacher = null,
  htTeacher = null,
  onProgress = null
}) {
  const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const logoBase64 = settings.school_logo || null;
  const stampBase64 = settings.school_stamp || null;

  // 1. Calculate class statistics & positions
  // We need to group students by class (gradeClass) to compute averages and ranks.
  const studentStats = [];

  students.forEach(student => {
    const isUACE = student.gradeClass.startsWith('S.5') || student.gradeClass.startsWith('S.6');
    let totalMarks = 0;
    let subjectCount = 0;
    let uacePoints = 0;

    if (isUACE) {
      const marks = uaceMarks.filter(m => m.student_id === student.id);
      marks.forEach(m => {
        const score = parseFloat(m.score || 0);
        let pts = 0;
        if (m.subject_type === 'Principal') {
          pts = getUACEPrincipalGrade(score).points;
        } else {
          pts = getUACESubGPGrade(score).points;
        }
        uacePoints += pts;
        totalMarks += score;
        subjectCount++;
      });
    } else {
      const marks = olevelMarks.filter(m => m.student_id === student.id);
      marks.forEach(m => {
        const aiScores = [];
        if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) {
          aiScores.push(parseFloat(m.integration1));
        }
        if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) {
          aiScores.push(parseFloat(m.integration2));
        }
        if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) {
          aiScores.push(parseFloat(m.integration3));
        }

        let caAverage = 0;
        if (aiScores.length > 0) {
          const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
          caAverage = sumPct / aiScores.length;
        }

        const ca = (caAverage * 20) / 100;
        const exam = parseFloat(m.exam_score || 0);
        const examW = (exam * 80) / 100;
        const finalMark = ca + examW;
        totalMarks += finalMark;
        subjectCount++;
      });
    }

    const average = subjectCount > 0 ? (totalMarks / subjectCount) : 0;

    studentStats.push({
      studentId: student.id,
      gradeClass: student.gradeClass,
      isUACE,
      totalMarks,
      average,
      uacePoints,
      subjectCount
    });
  });

  // Sort within each class to get positions
  const classesMap = {};
  studentStats.forEach(stat => {
    if (!classesMap[stat.gradeClass]) {
      classesMap[stat.gradeClass] = [];
    }
    classesMap[stat.gradeClass].push(stat);
  });

  Object.keys(classesMap).forEach(clsName => {
    const clsList = classesMap[clsName];
    const isUACE = clsName.startsWith('S.5') || clsName.startsWith('S.6');
    if (isUACE) {
      clsList.sort((a, b) => b.uacePoints - a.uacePoints || b.average - a.average);
    } else {
      clsList.sort((a, b) => b.average - a.average);
    }
    clsList.forEach((stat, idx) => {
      stat.position = idx + 1;
      stat.classTotal = clsList.length;
    });
  });

  // 2. Render report cards
  for (let sIdx = 0; sIdx < students.length; sIdx++) {
    if (sIdx > 0) {
      doc.addPage();
    }

    const student = students[sIdx];
    const stat = studentStats.find(st => st.studentId === student.id);
    const isUACE = stat.isUACE;



    // Premium thin outer border
    doc.setDrawColor(11, 30, 91); // Primary Navy Blue
    doc.setLineWidth(0.35);
    doc.roundedRect(10, 10, 190, 277, 3, 3, 'D');

    // Inner thin border (double line effect for premium look)
    doc.setDrawColor(212, 160, 23); // Accent Gold
    doc.setLineWidth(0.15);
    doc.roundedRect(11, 11, 188, 275, 2.5, 2.5, 'D');

    // Watermark (3% opacity)
    if (logoBase64) {
      drawSafeWatermark(doc, logoBase64, 55, 95, 100, 100, 0.03);
    }

    // Header Layout
    let headerY = 15;
    
    if (logoBase64) {
      try {
        const isSvg = logoBase64.includes('svg+xml');
        doc.addImage(logoBase64, isSvg ? 'SVG' : 'PNG', 15.0, 15.0, 28, 28);
      } catch (e) {
        console.warn("Could not draw logo in report header:", e);
      }
    }

    // Student passport photo inside rounded Navy container (Top Right)
    const photoX = 170;
    const photoY = 15;
    const photoW = 25;
    const photoH = 30;

    if (student.photo) {
      try {
        const fmtMatch = student.photo.match(/^data:image\/([a-zA-Z]+);base64,/);
        const format = fmtMatch ? fmtMatch[1].toUpperCase() : 'JPEG';
        doc.addImage(student.photo, format, 170.5, 15.5, 24, 29);
        
        // Navy rounded frame on top
        doc.setDrawColor(11, 30, 91);
        doc.setLineWidth(0.5);
        doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'D');
      } catch (e) {
        console.warn("Could not draw student photo in header:", e);
        drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
      }
    } else {
      drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
    }

    // School Name & Branding (Center of header)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(11, 30, 91); // Navy Blue
    doc.text('ST. PAUL SENIOR SECONDARY SCHOOL', 105, 22, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(220, 38, 38); // Motto Red
    doc.text('"God is Our Guide"', 105, 27, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105); // Slate 500
    doc.text('P.O. Box 678, Nasuti–Iganga, Uganda', 105, 32, { align: 'center' });
    doc.text('Tel: 0776 246 610 | Email: info@stpaulnasuti.ac.ug', 105, 36.5, { align: 'center' });

    // Banner Title
    doc.setFillColor(11, 30, 91); // Primary Navy Blue
    doc.roundedRect(15, 48, 180, 7, 1.5, 1.5, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const reportTitle = isUACE ? 'UACE ACADEMIC ASSESSMENT REPORT CARD' : 'O-LEVEL COMPETENCY-BASED ASSESSMENT REPORT CARD';
    doc.text(reportTitle, 105, 53, { align: 'center' });

    // Student Info Block
    let infoY = 58;
    doc.setFillColor(248, 250, 252); // Light Slate
    doc.setDrawColor(226, 232, 240); // Soft border
    doc.setLineWidth(0.3);
    doc.roundedRect(15, infoY, 180, 28, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    // Left Column labels
    doc.text('Student Name:', 18, infoY + 6);
    doc.text('Reg No:', 18, infoY + 12.5);
    doc.text('Class/Stream:', 18, infoY + 19);
    doc.text(isUACE ? 'UACE Combo:' : 'Class Teacher:', 18, infoY + 25.5);

    // Right Column labels
    doc.text('Gender:', 110, infoY + 6);
    doc.text('Term / Year:', 110, infoY + 12.5);
    doc.text('Boarding Status:', 110, infoY + 19);
    doc.text(isUACE ? 'Class Teacher:' : 'Date Generated:', 110, infoY + 25.5);

    const classTeacherObj = classTeachers[student.gradeClass] || null;
    let classTeacherName = 'N/A';
    if (classTeacherObj) {
      if (typeof classTeacherObj === 'object') {
        classTeacherName = classTeacherObj.name || 'N/A';
      } else if (typeof classTeacherObj === 'string') {
        classTeacherName = classTeacherObj;
      }
    }

    // Left Column values
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text(student.name.toUpperCase(), 45, infoY + 6);
    doc.text(student.adminNo, 45, infoY + 12.5);
    doc.text(student.gradeClass, 45, infoY + 19);
    doc.text(isUACE ? (student.uace_combination || 'N/A') : classTeacherName, 45, infoY + 25.5);

    // Right Column values
    doc.text(student.gender || 'Male', 138, infoY + 6);
    const termText = (term === '1' || term === '2' || term === '3') ? 'Term ' + term : term;
    doc.text(`${termText} / ${year}`, 138, infoY + 12.5);
    doc.text(student.boardingStatus || 'Day Scholar', 138, infoY + 19);
    doc.text(isUACE ? classTeacherName : new Date().toLocaleDateString('en-GB'), 138, infoY + 25.5);

    // Table Section
    let currentY = 90;
    let uceResultStatus = '';
    let rowHeight = isUACE ? 7.0 : 6.8;

    if (isUACE) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(11, 30, 91);
      doc.text('SUBJECT ASSESSMENT RESULTS', 15, currentY);

      let tableY = currentY + 2;
      
      // Table Header (Navy Blue background, white text)
      doc.setFillColor(11, 30, 91);
      doc.roundedRect(15, tableY, 180, 7, 1, 1, 'F');
      doc.rect(15, tableY + 3.5, 180, 3.5, 'F'); // flat bottom
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      doc.text('Subject Name', 18, tableY + 4.8);
      doc.text('Subject Type', 90, tableY + 4.8, { align: 'center' });
      doc.text('Score (/100)', 117.5, tableY + 4.8, { align: 'center' });
      doc.text('Grade', 140, tableY + 4.8, { align: 'center' });
      doc.text('Points', 160, tableY + 4.8, { align: 'center' });
      doc.text('Initials', 182.5, tableY + 4.8, { align: 'center' });

      // Draw header white dividers
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.15);
      doc.line(75, tableY, 75, tableY + 7);
      doc.line(105, tableY, 105, tableY + 7);
      doc.line(130, tableY, 130, tableY + 7);
      doc.line(150, tableY, 150, tableY + 7);
      doc.line(170, tableY, 170, tableY + 7);

      const sMarks = uaceMarks.filter(m => m.student_id === student.id);
      let curY = tableY + 7;

      sMarks.forEach((m, mIdx) => {
        const score = parseFloat(m.score || 0);
        const isGP = m.subject_type === 'General Paper';
        const isSub = m.subject_type === 'Subsidiary';
        const grInfo = (isGP || isSub) ? getUACESubGPGrade(score) : getUACEPrincipalGrade(score);

        // Zebra stripes
        if (mIdx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, curY, 180, rowHeight, 'F');
        }
        
        // Soft border
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.rect(15, curY, 180, rowHeight, 'D');

        // Draw vertical dividers
        doc.line(75, curY, 75, curY + rowHeight);
        doc.line(105, curY, 105, curY + rowHeight);
        doc.line(130, curY, 130, curY + rowHeight);
        doc.line(150, curY, 150, curY + rowHeight);
        doc.line(170, curY, 170, curY + rowHeight);

        // Draw values
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42); // Dark Slate
        doc.text(m.subject, 18, curY + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.text(m.subject_type, 90, curY + 4.5, { align: 'center' });
        doc.text(score.toFixed(1), 117.5, curY + 4.5, { align: 'center' });
        
        // Points
        doc.text(String(grInfo.points), 160, curY + 4.5, { align: 'center' });
        
        // Initials
        let initials = 'N/A';
        try {
          const teacherName = teachersMap[m.teacher_id];
          initials = teacherName ? getInitials(teacherName) : 'N/A';
        } catch (e) {
          console.error("Failed to compute initials:", e);
        }
        doc.text(initials, 182.5, curY + 4.5, { align: 'center' });

        // Grade badge
        const badgeColor = GRADE_COLORS[grInfo.grade] || [100, 116, 139];
        doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
        doc.roundedRect(140 - 4.5, curY + 1, 9, 4.5, 1, 1, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(grInfo.grade, 140, curY + 4.3, { align: 'center' });

        curY += rowHeight;
      });

      // Pad to at least 5 rows
      const minRows = 5;
      for (let r = sMarks.length; r < minRows; r++) {
        if (r % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, curY, 180, rowHeight, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.rect(15, curY, 180, rowHeight, 'D');

        doc.line(75, curY, 75, curY + rowHeight);
        doc.line(105, curY, 105, curY + rowHeight);
        doc.line(130, curY, 130, curY + rowHeight);
        doc.line(150, curY, 150, curY + rowHeight);
        doc.line(170, curY, 170, curY + rowHeight);

        curY += rowHeight;
      }
      
      currentY = curY;
    } else {
      // Compute UCE Result Status
      const sMarks = olevelMarks.filter(m => m.student_id === student.id);
      const olevelGrades = sMarks.map(m => {
        const aiScores = [];
        if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) {
          aiScores.push(parseFloat(m.integration1));
        }
        if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) {
          m.integration2 = parseFloat(m.integration2);
          aiScores.push(m.integration2);
        }
        if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) {
          m.integration3 = parseFloat(m.integration3);
          aiScores.push(m.integration3);
        }

        let caAverage = 0;
        if (aiScores.length > 0) {
          const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
          caAverage = sumPct / aiScores.length;
        }

        const caContribution = (caAverage * 20) / 100;
        const examScore = parseFloat(m.exam_score || 0);
        const examContribution = (examScore * 80) / 100;
        const finalMark = caContribution + examContribution;
        return getOLevelGrade(finalMark).grade;
      });

      const COMPULSORY_SUBJECTS = [
        "English Language",
        "Mathematics",
        "Biology",
        "Chemistry",
        "Physics",
        "History and Political Education",
        "Geography"
      ];

      const satSubjects = sMarks.map(m => (m.subject || '').trim().toLowerCase());
      const missingCompulsory = COMPULSORY_SUBJECTS.filter(subj => !satSubjects.includes(subj.toLowerCase()));
      const satCompulsory = missingCompulsory.length === 0;
      const satCount = sMarks.length;
      const meetsSubjectRange = satCount >= 8 && satCount <= 9;
      const hasDOrHigher = olevelGrades.some(g => ['A', 'B', 'C', 'D'].includes(g));

      if (satCount > 0) {
        if (!satCompulsory) {
          uceResultStatus = 'Result 2 (Missed compulsory subjects)';
        } else if (!meetsSubjectRange) {
          uceResultStatus = `Result 2 (Sat for ${satCount} subjects, expected 8 or 9)`;
        } else if (!hasDOrHigher) {
          uceResultStatus = 'Result 2 (Scores exclusively at E level)';
        } else {
          uceResultStatus = 'Result 1 (Passed / Achieved Certification)';
        }
      } else {
        uceResultStatus = 'Result 2 (No marks/No subjects sat)';
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(11, 30, 91);
      doc.text('SUBJECT ASSESSMENT RESULTS', 15, currentY);

      let tableY = currentY + 2;
      
      // Table Header (Navy Blue background, white text)
      doc.setFillColor(11, 30, 91);
      doc.roundedRect(15, tableY, 180, 11, 1, 1, 'F');
      doc.rect(15, tableY + 5.5, 180, 5.5, 'F'); // flat bottom
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);

      // Column headers
      doc.text('Subject Name', 18, tableY + 6.8);
      doc.text('Cont. Assessment', 67, tableY + 4, { align: 'center' });
      doc.text('AI1', 59, tableY + 9.2, { align: 'center' });
      doc.text('AI2', 67, tableY + 9.2, { align: 'center' });
      doc.text('AI3', 75, tableY + 9.2, { align: 'center' });

      doc.text('CA Avg', 86, tableY + 4.8, { align: 'center' });
      doc.text('(%)', 86, tableY + 8.8, { align: 'center' });

      doc.text('CA', 99, tableY + 4.8, { align: 'center' });
      doc.text('20%', 99, tableY + 8.8, { align: 'center' });

      doc.text('Exam', 112, tableY + 4.8, { align: 'center' });
      doc.text('(100)', 112, tableY + 8.8, { align: 'center' });

      doc.text('Exam', 125, tableY + 4.8, { align: 'center' });
      doc.text('80%', 125, tableY + 8.8, { align: 'center' });

      doc.text('Final', 138, tableY + 4.8, { align: 'center' });
      doc.text('Mark', 138, tableY + 8.8, { align: 'center' });

      doc.text('Grade', 151, tableY + 6.8, { align: 'center' });
      doc.text('Descriptor', 170, tableY + 6.8, { align: 'center' });
      doc.text('Initials', 189, tableY + 6.8, { align: 'center' });

      // Draw white divider lines inside header
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.15);
      doc.line(55, tableY + 5.5, 79, tableY + 5.5);
      doc.line(55, tableY, 55, tableY + 11);
      doc.line(63, tableY + 5.5, 63, tableY + 11);
      doc.line(71, tableY + 5.5, 71, tableY + 11);
      doc.line(79, tableY, 79, tableY + 11);
      doc.line(93, tableY, 93, tableY + 11);
      doc.line(105, tableY, 105, tableY + 11);
      doc.line(119, tableY, 119, tableY + 11);
      doc.line(131, tableY, 131, tableY + 11);
      doc.line(145, tableY, 145, tableY + 11);
      doc.line(157, tableY, 157, tableY + 11);
      doc.line(183, tableY, 183, tableY + 11);

      let curY = tableY + 11;

      sMarks.forEach((m, mIdx) => {
        const aiScores = [];
        if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) {
          aiScores.push(parseFloat(m.integration1));
        }
        if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) {
          aiScores.push(parseFloat(m.integration2));
        }
        if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) {
          aiScores.push(parseFloat(m.integration3));
        }

        let caAverage = 0;
        if (aiScores.length > 0) {
          const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
          caAverage = sumPct / aiScores.length;
        }

        const caContribution = (caAverage * 20) / 100;
        const examScore = parseFloat(m.exam_score || 0);
        const examContribution = (examScore * 80) / 100;
        const finalMark = caContribution + examContribution;
        const gr = getOLevelGrade(finalMark);

        // Zebra stripes
        if (mIdx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, curY, 180, rowHeight, 'F');
        }

        // Soft border
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.rect(15, curY, 180, rowHeight, 'D');

        // Draw vertical dividers
        doc.line(55, curY, 55, curY + rowHeight);
        doc.line(63, curY, 63, curY + rowHeight);
        doc.line(71, curY, 71, curY + rowHeight);
        doc.line(79, curY, 79, curY + rowHeight);
        doc.line(93, curY, 93, curY + rowHeight);
        doc.line(105, curY, 105, curY + rowHeight);
        doc.line(119, curY, 119, curY + rowHeight);
        doc.line(131, curY, 131, curY + rowHeight);
        doc.line(145, curY, 145, curY + rowHeight);
        doc.line(157, curY, 157, curY + rowHeight);
        doc.line(183, curY, 183, curY + rowHeight);

        // Values
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42); // Dark slate
        doc.text(m.subject, 18, curY + 4.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        
        const ai1Str = (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) ? parseFloat(m.integration1).toFixed(1) : '-';
        const ai2Str = (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) ? parseFloat(m.integration2).toFixed(1) : '-';
        const ai3Str = (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) ? parseFloat(m.integration3).toFixed(1) : '-';

        doc.text(ai1Str, 59, curY + 4.2, { align: 'center' });
        doc.text(ai2Str, 67, curY + 4.2, { align: 'center' });
        doc.text(ai3Str, 75, curY + 4.2, { align: 'center' });

        doc.text(caAverage.toFixed(1), 86, curY + 4.2, { align: 'center' });
        doc.text(caContribution.toFixed(1), 99, curY + 4.2, { align: 'center' });
        doc.text(examScore.toFixed(1), 112, curY + 4.2, { align: 'center' });
        doc.text(examContribution.toFixed(1), 125, curY + 4.2, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.text(finalMark.toFixed(1), 138, curY + 4.2, { align: 'center' });

        // Descriptor (colored text)
        const badgeColor = GRADE_COLORS[gr.grade] || [100, 116, 139];
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(badgeColor[0], badgeColor[1], badgeColor[2]);
        doc.text(gr.label, 170, curY + 4.2, { align: 'center' });

        // Teacher Initials
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        let initials = 'N/A';
        try {
          const teacherName = teachersMap[m.teacher_id];
          initials = teacherName ? getInitials(teacherName) : 'N/A';
        } catch (e) {
          console.error("Failed to compute initials:", e);
        }
        doc.text(initials, 189, curY + 4.2, { align: 'center' });

        // Grade Badge
        doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
        doc.roundedRect(151 - 3.5, curY + 0.85, 7, 4.5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(gr.grade, 151, curY + 4.05, { align: 'center' });

        curY += rowHeight;
      });

      // Pad to at least 8 rows
      const minRows = 8;
      for (let r = sMarks.length; r < minRows; r++) {
        if (r % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, curY, 180, rowHeight, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.rect(15, curY, 180, rowHeight, 'D');

        doc.line(55, curY, 55, curY + rowHeight);
        doc.line(63, curY, 63, curY + rowHeight);
        doc.line(71, curY, 71, curY + rowHeight);
        doc.line(79, curY, 79, curY + rowHeight);
        doc.line(93, curY, 93, curY + rowHeight);
        doc.line(105, curY, 105, curY + rowHeight);
        doc.line(119, curY, 119, curY + rowHeight);
        doc.line(131, curY, 131, curY + rowHeight);
        doc.line(145, curY, 145, curY + rowHeight);
        doc.line(157, curY, 157, curY + rowHeight);
        doc.line(183, curY, 183, curY + rowHeight);

        curY += rowHeight;
      }

      currentY = curY;
    }

    // Calculate layout spacing dynamically to fit perfectly on A4 paper
    const totalContentHeightAvailable = 281 - 90; // y=90 is start of table header, y=281 is start of footer zone
    const tableHeaderHeight = isUACE ? 7 : 11;
    
    // Determine the actual number of rows drawn (including padding)
    const marksCount = isUACE ? uaceMarks.filter(m => m.student_id === student.id).length : olevelMarks.filter(m => m.student_id === student.id).length;
    const tableRowsHeight = Math.max(isUACE ? 5 : 8, marksCount) * rowHeight;
    const cardW = 58;
    const cardH = 22;
    const gap = 3;
    
    const cardsHeight = cardH; // 22
    const commentsHeight = 28; // height of comments block including spacer (12 + 12 + 4)
    const signaturesHeight = 26; // height from sigY to bottom of titles

    const noteHeight = isUACE ? 0 : 16;
    const fixedHeights = tableHeaderHeight + tableRowsHeight + cardsHeight + commentsHeight + signaturesHeight + noteHeight;
    const remainingSpace = totalContentHeightAvailable - fixedHeights;

    // Distribute remaining space into equal spacing gaps between sections
    let spacingGap = 4;
    if (remainingSpace > 0) {
      spacingGap = Math.min(10, Math.max(4, remainingSpace / (isUACE ? 3 : 4)));
    } else {
      spacingGap = 3; // compact fallback if space is tight
    }

    // Draw Score Computation Note Section below results table for O-Level
    if (!isUACE) {
      const noteY = currentY + spacingGap;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(11, 30, 91); // Primary Navy Blue
      doc.text("How Final Percentage is Computed", 15, noteY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42); // Dark Slate
      const formulaText = "Final Percentage = (CA Score \u00F7 Maximum CA Marks \u00D7 CA Weight) + (Exam Score \u00F7 Maximum Exam Marks \u00D7 Exam Weight)";
      doc.text(formulaText, 15, noteY + 4.5);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // Slate 500
      const exampleText = "Example: If CA Weight = 20% and Exam Weight = 80%: Final Percentage = (CA Score \u00F7 Maximum CA Marks \u00D7 20) + (Exam Score \u00F7 Maximum Exam Marks \u00D7 80).";
      doc.text(exampleText, 15, noteY + 9, { maxWidth: 180 });

      currentY = noteY + 12;
    }

    // Summary Cards Row
    let summaryY = currentY + spacingGap;

    // CARD 1: Academic Summary
    doc.setFillColor(248, 250, 252); // Light Slate
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(15, summaryY, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(11, 30, 91); // Navy Blue
    doc.text('ACADEMIC SUMMARY', 18, summaryY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(`Average Score:  ${stat.average.toFixed(1)}%`, 18, summaryY + 9.5);
    doc.text(`Position in Class:  ${stat.position} of ${stat.classTotal}`, 18, summaryY + 13);
    doc.text(`Total Subjects Offered:  ${stat.subjectCount}`, 18, summaryY + 16.5);
    doc.text(`Overall Grade:  ${getOLevelGrade(stat.average).grade}`, 18, summaryY + 20);

    // CARD 2: Performance Rank / RESULTS STATUS
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15 + cardW + gap, summaryY, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(11, 30, 91);
    
    if (isUACE) {
      doc.text('UACE COMB POINTS', 15 + cardW + gap + 3, summaryY + 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(212, 160, 23); // Gold
      doc.text(`${stat.uacePoints} / 20 Points`, 15 + cardW + gap + 3, summaryY + 11);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Based on official principal and', 15 + cardW + gap + 3, summaryY + 16);
      doc.text('subsidiary grade weightings.', 15 + cardW + gap + 3, summaryY + 19.5);
    } else {
      doc.text('RESULTS STATUS', 15 + cardW + gap + 3, summaryY + 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      
      doc.text(uceResultStatus, 15 + cardW + gap + 3, summaryY + 10, { maxWidth: cardW - 6 });
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text('Note: School-assessed projects', 15 + cardW + gap + 3, summaryY + 17.5);
      doc.text('are reflected separately.', 15 + cardW + gap + 3, summaryY + 20.5);
    }

    // CARD 3: Grade Key / Descriptor Guide
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15 + 2 * (cardW + gap), summaryY, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(11, 30, 91);
    doc.text('GRADE SCALE KEY', 15 + 2 * (cardW + gap) + 3, summaryY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    if (isUACE) {
      doc.text('Principal: A=6, B=5, C=4, D=3, E=2, O=1, F=0', 15 + 2 * (cardW + gap) + 3, summaryY + 10);
      doc.text('Subsidiary: D1-P8 = 1 Point, F9 = 0 Points', 15 + 2 * (cardW + gap) + 3, summaryY + 14);
      doc.text('Combinations: Maximum 20 Points', 15 + 2 * (cardW + gap) + 3, summaryY + 18);
    } else {
      doc.text('A: Exceptional (>= 80%)', 15 + 2 * (cardW + gap) + 3, summaryY + 9.5);
      doc.text('B: Outstanding (70 - 79%)  | C: Satisfactory (60 - 69%)', 15 + 2 * (cardW + gap) + 3, summaryY + 13.5);
      doc.text('D: Basic (50 - 59%)             | E: Elementary (< 50%)', 15 + 2 * (cardW + gap) + 3, summaryY + 17.5);
    }

    // Comments Row
    let commentsY = summaryY + cardH + spacingGap;
    
    // Class Teacher's Comment Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(15, commentsY, 180, 12, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(11, 30, 91);
    doc.text("Class Teacher's Remarks:", 18, commentsY + 4.5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(getClassTeacherComment(stat.average), 18, commentsY + 9);

    // Head Teacher's Comment Box
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, commentsY + 16, 180, 12, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(11, 30, 91);
    doc.text("Head Teacher's Remarks:", 18, commentsY + 20.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(getHeadTeacherComment(stat.average), 18, commentsY + 25);

    // Signatures & Verification Row
    let sigY = commentsY + 28 + spacingGap;
    
    // Helper helper for drawing a signature block
    const drawSignatureBlock = (title, name, signatureData, centerX) => {
      // 1. Digital Signature Image (if exists)
      if (signatureData) {
        try {
          const isSvg = signatureData.includes('svg+xml');
          const format = isSvg ? 'SVG' : 'PNG';
          doc.addImage(signatureData, format, centerX - 15, sigY + 1, 30, 11);
        } catch (e) {
          console.warn(`Could not draw signature for ${title}:`, e);
        }
      }

      // 2. Signature Line
      doc.setDrawColor(203, 213, 225); // Slate 300
      doc.setLineWidth(0.45);
      doc.line(centerX - 20, sigY + 13, centerX + 20, sigY + 13);

      // 3. Staff Full Name
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42); // Slate 900
      const displayName = (name && name !== 'N/A') ? name : '___________________';
      doc.text(displayName, centerX, sigY + 17.5, { align: 'center' });

      // 4. Position Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(11, 30, 91); // Premium Navy
      doc.text(title, centerX, sigY + 22.5, { align: 'center' });
    };

    // Class Teacher
    const classTeacherObj2 = classTeachers[student.gradeClass] || null;
    let ctName = '';
    let ctSignature = null;
    if (classTeacherObj2) {
      if (typeof classTeacherObj2 === 'object') {
        ctName = classTeacherObj2.name || '';
        ctSignature = classTeacherObj2.signature || null;
      } else if (typeof classTeacherObj2 === 'string') {
        ctName = classTeacherObj2;
      }
    }
    if (ctName === 'N/A' || !ctName) ctName = '';
    drawSignatureBlock('Class Teacher', ctName, ctSignature, 45);

    // Director of Studies (DOS)
    const dosName = (dosTeacher && dosTeacher.name) ? dosTeacher.name : 'Mr. Peter Kato';
    const dosSignature = (dosTeacher && dosTeacher.signature) ? dosTeacher.signature : null;
    drawSignatureBlock('Director of Studies (DOS)', dosName, dosSignature, 105);

    // Head Teacher
    const htName = (htTeacher && htTeacher.name) ? htTeacher.name : 'Dr. Bernard Ochola';
    const htSignature = (htTeacher && htTeacher.signature) ? htTeacher.signature : null;
    drawSignatureBlock('Head Teacher', htName, htSignature, 165);

    // Stamp overlay (placed over Head Teacher area)
    if (stampBase64) {
      try {
        const isSvg = stampBase64.includes('svg+xml');
        doc.addImage(stampBase64, isSvg ? 'SVG' : 'PNG', 153, sigY + 2, 20, 20);
      } catch (e) {
        console.warn("Could not draw school stamp:", e);
      }
    }
    // Stamp Warning Footer
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(220, 38, 38); // Motto Red
    doc.text('INVALID WITHOUT OFFICIAL STAMP', 105, 283, { align: 'center' });

    if (onProgress) {
      onProgress(sIdx + 1, students.length);
    }
    await yieldEventLoop();
  }

  return doc;
}

module.exports = {
  compileReportsPdf,
  getOLevelGrade,
  getOLevelComment,
  getUACEPrincipalGrade,
  getUACESubGPGrade,
  getGeneralComment,
  getClassTeacherComment,
  getHeadTeacherComment
};
