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

function isScienceSubject(subjectName) {
  const norm = (subjectName || '').toLowerCase().trim();
  return norm.includes('physic') || norm.includes('phy') ||
         norm.includes('chemist') || norm.includes('chem') ||
         norm.includes('biolog') || norm.includes('bio') ||
         norm.includes('agricult') || norm.includes('agr') ||
         norm.includes('mathe') || norm.includes('math') || norm.includes('mtc');
}

function getUACEPrincipalGrade(score) {
  const s = Math.round(score || 0);
  if (s >= 85) return { grade: 'D1', points: 6 };
  if (s >= 80) return { grade: 'D2', points: 5 };
  if (s >= 75) return { grade: 'C3', points: 4 };
  if (s >= 70) return { grade: 'C4', points: 3 };
  if (s >= 65) return { grade: 'C5', points: 2 };
  if (s >= 60) return { grade: 'C6', points: 1 };
  if (s >= 50) return { grade: 'P7', points: 0 };
  if (s >= 40) return { grade: 'P8', points: 0 };
  return { grade: 'F9', points: 0 };
}

function isSubsidiarySubject(subjectName, subjectType) {
  const normType = (subjectType || '').toLowerCase().trim();
  if (normType === 'general paper' || normType === 'subsidiary') {
    return true;
  }
  const normName = (subjectName || '').toLowerCase().trim();
  if (normName === 'general paper' || normName === 'gp' || normName === 'sub math' || normName === 'subsidiary math' || normName === 'subsidiary mathematics' || normName === 'subsidiary ict' || normName === 'sict' || normName === 'sm') {
    return true;
  }
  if (normName.includes('subsidiary') || normName.includes('general paper')) {
    return true;
  }
  return false;
}

function getUACESubGPGrade(score) {
  const s = Math.round(score || 0);
  if (s >= 60) {
    return { grade: 'SP', points: 1 };
  } else {
    return { grade: 'SF', points: 0 };
  }
}

function getUACEOverallSubjectGrade(papers, subjectName, subjectType) {
  if (isSubsidiarySubject(subjectName, subjectType)) {
    let sumScore = 0;
    let count = 0;
    papers.forEach(p => {
      if (p.score !== null && p.score !== undefined && p.score !== '') {
        sumScore += parseFloat(p.score);
        count++;
      }
    });
    const avg = count > 0 ? Math.round(sumScore / count) : 0;
    if (avg >= 60) {
      return { grade: 'SP', points: 1, comment: 'Subsidiary Pass' };
    } else {
      return { grade: 'F', points: 0, comment: 'Fail' };
    }
  }

  const grades = [];
  papers.forEach(p => {
    if (p.score !== null && p.score !== undefined && p.score !== '') {
      const s = Math.round(p.score);
      let pg = 9;
      if (s >= 85) pg = 1;
      else if (s >= 80) pg = 2;
      else if (s >= 75) pg = 3;
      else if (s >= 70) pg = 4;
      else if (s >= 65) pg = 5;
      else if (s >= 60) pg = 6;
      else if (s >= 50) pg = 7;
      else if (s >= 40) pg = 8;
      grades.push(pg);
    }
  });

  if (grades.length === 0) {
    return { grade: '-', points: 0, comment: '-' };
  }

  const sorted = grades.sort((a, b) => a - b);
  const numPapers = sorted.length;

  if (numPapers === 1) {
    const g = sorted[0];
    if (g <= 2) return { grade: 'A', points: 6, comment: 'Excellent' };
    if (g === 3) return { grade: 'B', points: 5, comment: 'Very Good results' };
    if (g === 4) return { grade: 'C', points: 4, comment: 'Good performance' };
    if (g === 5) return { grade: 'D', points: 3, comment: 'Fair' };
    if (g === 6) return { grade: 'E', points: 2, comment: 'Pass' };
    if (g <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    return { grade: 'F', points: 0, comment: 'Fail' };
  }

  if (numPapers === 2) {
    const g1 = sorted[0];
    const g2 = sorted[1];
    if (g2 <= 2) return { grade: 'A', points: 6, comment: 'Excellent' };
    if (g2 === 3) return { grade: 'B', points: 5, comment: 'Very Good results' };
    if (g2 === 4) return { grade: 'C', points: 4, comment: 'Good performance' };
    if (g2 === 5) return { grade: 'D', points: 3, comment: 'Fair' };
    if (g2 === 6 || (g2 <= 8 && g1 + g2 <= 12)) return { grade: 'E', points: 2, comment: 'Pass' };
    if (g2 <= 8 && g1 + g2 <= 16) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    if (g1 <= 7 && g2 === 9) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    return { grade: 'F', points: 0, comment: 'Fail' };
  }

  if (numPapers === 3) {
    const g1 = sorted[0];
    const g2 = sorted[1];
    const g3 = sorted[2];
    if (g3 <= 3) return { grade: 'A', points: 6, comment: 'Excellent' };
    if (g3 === 4) return { grade: 'B', points: 5, comment: 'Very Good results' };
    if (g3 === 5) return { grade: 'C', points: 4, comment: 'Good performance' };
    if (g3 === 6) return { grade: 'D', points: 3, comment: 'Fair' };
    if ((g3 === 7 && g2 <= 6) || (g3 === 8 && g2 <= 6 && g1 <= 5)) return { grade: 'E', points: 2, comment: 'Pass' };
    if (g3 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    if (g3 === 9 && g2 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    if (g3 === 9 && g2 === 9 && g1 <= 7) {
      if (g1 === 7 && isScienceSubject(subjectName)) {
        return { grade: 'F', points: 0, comment: 'Fail' };
      }
      return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    }
    return { grade: 'F', points: 0, comment: 'Fail' };
  }

  const g1 = sorted[0];
  const g2 = sorted[1];
  const g3 = sorted[2];
  const g4 = sorted[3];
  if (g4 <= 3) return { grade: 'A', points: 6, comment: 'Excellent' };
  if (g4 === 4) return { grade: 'B', points: 5, comment: 'Very Good results' };
  if (g4 === 5) return { grade: 'C', points: 4, comment: 'Good performance' };
  if (g4 === 6) return { grade: 'D', points: 3, comment: 'Fair' };
  if ((g4 === 7 && g3 <= 6) || (g4 === 8 && g3 <= 6 && g2 <= 6 && g1 <= 5)) return { grade: 'E', points: 2, comment: 'Pass' };
  if (g4 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
  if (g4 === 9 && g3 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
  if (g4 === 9 && g3 === 9 && g2 <= 7) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
  return { grade: 'F', points: 0, comment: 'Fail' };
}

function calculateUACEPoints(marks) {
  const subjects = {};
  marks.forEach(m => {
    if (!subjects[m.subject]) {
      subjects[m.subject] = {
        name: m.subject,
        type: m.subject_type,
        papers: []
      };
    }
    subjects[m.subject].papers.push({ score: m.score });
  });

  let principalPoints = 0;
  let subsidiaryPoints = 0;
  Object.values(subjects).forEach(sub => {
    const grInfo = getUACEOverallSubjectGrade(sub.papers, sub.name, sub.type);
    if (isSubsidiarySubject(sub.name, sub.type)) {
      subsidiaryPoints += grInfo.points;
    } else {
      principalPoints += grInfo.points;
    }
  });

  return { principalPoints, subsidiaryPoints, totalPoints: principalPoints + subsidiaryPoints };
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

function getUACEClassTeacherComment(points) {
  if (points >= 15) return 'An excellent student. Displays high academic potential and exemplary discipline.';
  if (points >= 10) return 'A very promising student. Shows steady dedication and regular class participation.';
  if (points >= 5) return 'Good progress made. Quite attentive in class, but needs more focus.';
  if (points >= 2) return 'Fair performance. Needs to avoid distractions and concentrate on weak areas.';
  return 'Weak performance. Must work much harder next term to pass.';
}

function getUACEHeadTeacherComment(points) {
  if (points >= 15) return 'Exemplary academic standard! Keep up this wonderful spirit to secure your future.';
  if (points >= 10) return 'A highly commendable result. Keep striving for the highest grades.';
  if (points >= 5) return 'A solid pass. With more effort, you can perform much better next term.';
  if (points >= 2) return 'A pass, but you must work harder to improve your points next term.';
  return 'Disappointing results. You must double your efforts next term to avoid stagnation.';
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

function getSubjectSortIndex(subjectName, gradeClass) {
  const normalized = (subjectName || '').trim().toLowerCase();
  const cls = (gradeClass || '').trim().toUpperCase();
  const isS1orS2 = cls.startsWith('S.1') || cls.startsWith('S.2');
  const isS3orS4 = cls.startsWith('S.3') || cls.startsWith('S.4');

  if (isS1orS2) {
    if (normalized.includes('english') && !normalized.includes('literature')) return 1;
    if (normalized === 'mathematics' || normalized === 'maths' || normalized === 'mtc') return 2;
    if (normalized === 'physics' || normalized === 'phy') return 3;
    if (normalized === 'chemistry' || normalized === 'chem') return 4;
    if (normalized === 'biology' || normalized === 'bio') return 5;
    if (normalized.includes('physical education') || normalized === 'pe') return 6;
    if (normalized.includes('entrepreneurship') || normalized === 'ent') return 7;
    if (normalized === 'geography' || normalized === 'geog' || normalized === 'georg') return 8;
    if (normalized === 'kiswahili') return 9;
    if (normalized.includes('christian religious') || normalized === 'cre') return 10;
    if (normalized.includes('history') || normalized === 'hist') return 11;
  } else if (isS3orS4) {
    if (normalized.includes('english') && !normalized.includes('literature')) return 1;
    if (normalized === 'mathematics' || normalized === 'maths' || normalized === 'mtc') return 2;
    if (normalized === 'physics' || normalized === 'phy') return 3;
    if (normalized === 'chemistry' || normalized === 'chem') return 4;
    if (normalized === 'biology' || normalized === 'bio') return 5;
    if (normalized.includes('history') || normalized === 'hist') return 6;
    if (normalized === 'geography' || normalized === 'geog' || normalized === 'georg') return 7;
  }
  return 100;
}

function sortOLevelSubjects(marksList, gradeClass) {
  return [...marksList].sort((a, b) => {
    const idxA = getSubjectSortIndex(a.subject, gradeClass);
    const idxB = getSubjectSortIndex(b.subject, gradeClass);
    if (idxA !== idxB) {
      return idxA - idxB;
    }
    return (a.subject || '').localeCompare(b.subject || '');
  });
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
    compress: true, // Enable built-in PDF compression
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
      const uacePtsObj = calculateUACEPoints(marks);
      uacePoints = uacePtsObj.totalPoints;
      marks.forEach(m => {
        const score = parseFloat(m.score || 0);
        totalMarks += score;
        subjectCount++;
      });
    } else {
      const rawMarks = olevelMarks.filter(m => m.student_id === student.id);
      const marks = sortOLevelSubjects(rawMarks, student.gradeClass);
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

    // Watermark (6% opacity to ensure clear visibility as requested)
    if (logoBase64) {
      drawSafeWatermark(doc, logoBase64, 55, 95, 100, 100, 0.06);
    }

    // Header Layout
    let headerY = 15;
    
    if (logoBase64) {
      try {
        const isSvg = logoBase64.includes('svg+xml');
        const isJpeg = logoBase64.includes('jpeg') || logoBase64.includes('jpg');
        const format = isSvg ? 'SVG' : (isJpeg ? 'JPEG' : 'PNG');
        doc.addImage(logoBase64, format, 15.0, 15.0, 28, 28, undefined, 'FAST');
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
        doc.addImage(student.photo, format, 170.5, 15.5, 24, 29, undefined, 'FAST');
        
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
    doc.setFontSize(18);
    doc.setTextColor(11, 30, 91); // Navy Blue
    doc.text('ST. PAUL SS NASUTI', 105, 22, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105); // Slate 500
    doc.text('P.O. BOX 078, IGANGA (U) | TEL: 0479 977 570 / 0786 522 303', 105, 27.5, { align: 'center' });
    doc.text('EMAIL: stpaulssnasuti@gmail.com', 105, 31.5, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(212, 160, 23); // Motto Gold
    doc.text('God is my Guide', 105, 37.5, { align: 'center' });

    const classTeacherObj = classTeachers[student.gradeClass] || null;
    let classTeacherName = 'N/A';
    if (classTeacherObj) {
      if (typeof classTeacherObj === 'object') {
        classTeacherName = classTeacherObj.name || 'N/A';
      } else if (typeof classTeacherObj === 'string') {
        classTeacherName = classTeacherObj;
      }
    }

    if (isUACE) {
      // Modern clean title for UACE
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(11, 30, 91);
      doc.text("A'LEVEL END OF TERM REPORT CARD", 105, 48, { align: 'center' });

      // Clean gold horizontal lines / diamond separator
      doc.setDrawColor(212, 160, 23);
      doc.setLineWidth(0.3);
      doc.line(15, 52, 195, 52);

      // Student info row matching sample exactly
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text('Name:', 15, 59);
      doc.text('Class:', 15, 65);
      doc.text('Year:', 115, 65);
      doc.text('Term:', 160, 65);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // Dark slate
      doc.text(student.name.toUpperCase(), 30, 59);
      doc.text(`${student.gradeClass} (Senior Five)`, 30, 65);
      doc.text(String(year), 127, 65);
      
      const termRoman = (term === '1' || term === 'I') ? 'I' : (term === '2' || term === 'II') ? 'II' : 'III';
      doc.text(termRoman, 172, 65);
    } else {
      // O-Level original title bar and rounded rectangle block
      doc.setFillColor(11, 30, 91); // Primary Navy Blue
      doc.roundedRect(15, 48, 180, 7, 1.5, 1.5, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('O-LEVEL COMPETENCY-BASED ASSESSMENT REPORT CARD', 105, 53, { align: 'center' });

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
      doc.text('Class Teacher:', 18, infoY + 25.5);

      // Right Column labels
      doc.text('Gender:', 110, infoY + 6);
      doc.text('Term / Year:', 110, infoY + 12.5);
      doc.text('Boarding Status:', 110, infoY + 19);
      doc.text('Date Generated:', 110, infoY + 25.5);

      // Left Column values
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(student.name.toUpperCase(), 45, infoY + 6);
      doc.text(student.adminNo, 45, infoY + 12.5);
      doc.text(student.gradeClass, 45, infoY + 19);
      doc.text(classTeacherName, 45, infoY + 25.5);

      // Right Column values
      doc.text(student.gender || 'Male', 138, infoY + 6);
      const termText = (term === '1' || term === '2' || term === '3') ? 'Term ' + term : term;
      doc.text(`${termText} / ${year}`, 138, infoY + 12.5);
      doc.text(student.boardingStatus || 'Day Scholar', 138, infoY + 19);
      doc.text(new Date().toLocaleDateString('en-GB'), 138, infoY + 25.5);
    }

    // Table Section
    let currentY = 90;
    let uceResultStatus = '';
    const marksCount = isUACE 
      ? uaceMarks.filter(m => m.student_id === student.id).length 
      : olevelMarks.filter(m => m.student_id === student.id).length;
    
    let rowHeight = isUACE ? 7.0 : 6.8;
    if (marksCount > 9) {
      rowHeight = isUACE ? 5.8 : 5.6;
    } else if (marksCount > 7) {
      rowHeight = isUACE ? 6.4 : 6.0;
    }

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
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);

      // Columns: SUBJECT (44), P (6), BOT (14), MOT (14), EOT (14), TOTAL (16), GRADE (12), FINAL GRADE (16), COMMENT (34), INIT (10)
      doc.text('SUBJECT', 18, tableY + 4.8);
      doc.text('P', 62, tableY + 4.8, { align: 'center' });
      doc.text('BOT (100%)', 72, tableY + 4.8, { align: 'center' });
      doc.text('MOT (100%)', 86, tableY + 4.8, { align: 'center' });
      doc.text('EOT (100%)', 100, tableY + 4.8, { align: 'center' });
      doc.text('TOTAL', 115, tableY + 4.8, { align: 'center' });
      doc.text('GRADE', 129, tableY + 4.8, { align: 'center' });
      doc.text('FINAL GRADE', 143, tableY + 4.8, { align: 'center' });
      doc.text('COMMENT', 168, tableY + 4.8, { align: 'center' });
      doc.text('INIT', 190, tableY + 4.8, { align: 'center' });

      // Draw vertical lines in header
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.15);
      doc.line(59, tableY, 59, tableY + 7);
      doc.line(65, tableY, 65, tableY + 7);
      doc.line(79, tableY, 79, tableY + 7);
      doc.line(93, tableY, 93, tableY + 7);
      doc.line(107, tableY, 107, tableY + 7);
      doc.line(123, tableY, 123, tableY + 7);
      doc.line(135, tableY, 135, tableY + 7);
      doc.line(151, tableY, 151, tableY + 7);
      doc.line(185, tableY, 185, tableY + 7);

      const sMarks = uaceMarks.filter(m => m.student_id === student.id);
      
      // Group marks by subject
      const subjectGroups = [];
      sMarks.forEach(m => {
        let group = subjectGroups.find(g => g.subject === m.subject);
        if (!group) {
          group = {
            subject: m.subject,
            type: m.subject_type,
            papers: []
          };
          subjectGroups.push(group);
        }
        group.papers.push(m);
      });

      // Sort subject groups
      subjectGroups.sort((a, b) => {
        if (a.type === 'General Paper' && b.type !== 'General Paper') return -1;
        if (b.type === 'General Paper' && a.type !== 'General Paper') return 1;
        if (a.type === 'Subsidiary' && b.type !== 'Subsidiary') return 1;
        if (b.type === 'Subsidiary' && a.type !== 'Subsidiary') return -1;
        return a.subject.localeCompare(b.subject);
      });

      // Sort papers in each group
      subjectGroups.forEach(g => {
        g.papers.sort((a, b) => (a.paper || 1) - (b.paper || 1));
      });

      let curY = tableY + 7;
      let totalPaperRowsDrawn = 0;

      subjectGroups.forEach((g) => {
        const numPapers = g.papers.length;
        const groupHeight = rowHeight * numPapers;

        // Calculate subject final grade, points, comment, and initials
        let sumScore = 0;
        let validPapersCount = 0;
        g.papers.forEach(p => {
          if (p.score !== null && p.score !== undefined) {
            sumScore += parseFloat(p.score);
            validPapersCount++;
          }
        });

        const avgScore = validPapersCount > 0 ? Math.round(sumScore / validPapersCount) : 0;
        let finalGrade = '-';
        let finalComment = '-';

        if (validPapersCount > 0) {
          const overall = getUACEOverallSubjectGrade(g.papers, g.subject, g.type);
          finalGrade = overall.grade;
          finalComment = overall.comment;
        }

        // Collect unique teacher initials
        const teacherInitialsSet = new Set();
        g.papers.forEach(p => {
          if (p.teacher_id) {
            const name = teachersMap[p.teacher_id];
            if (name) {
              const initials = getInitials(name);
              if (initials && initials !== 'N/A') {
                teacherInitialsSet.add(initials);
              }
            }
          }
        });
        const combinedInitials = teacherInitialsSet.size > 0 ? Array.from(teacherInitialsSet).join('/') : '-';

        // Draw zebra background for the entire group
        if (totalPaperRowsDrawn % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, curY, 180, groupHeight, 'F');
        }

        // Draw border for the entire group
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.rect(15, curY, 180, groupHeight, 'D');

        // Draw papers rows
        g.papers.forEach((p, pIdx) => {
          const paperY = curY + (pIdx * rowHeight);

          // Draw horizontal line between papers inside the group (excluding last paper)
          if (pIdx > 0) {
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.15);
            doc.line(59, paperY, 135, paperY);
          }

          // Draw paper level details
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(15, 23, 42);

          // Paper number
          doc.text(String(p.paper || 1), 62, paperY + rowHeight - 2, { align: 'center' });

          // BOT, MOT, EOT
          const botStr = p.bot !== null && p.bot !== undefined ? String(Math.round(p.bot)) : '-';
          const motStr = p.mot !== null && p.mot !== undefined ? String(Math.round(p.mot)) : '-';
          const eotStr = p.eot !== null && p.eot !== undefined ? String(Math.round(p.eot)) : '-';

          doc.text(botStr, 72, paperY + rowHeight - 2, { align: 'center' });
          doc.text(motStr, 86, paperY + rowHeight - 2, { align: 'center' });
          doc.text(eotStr, 100, paperY + rowHeight - 2, { align: 'center' });

          // Total Score
          const totalScoreStr = p.score !== null && p.score !== undefined ? `${Math.round(p.score)}/100` : '-/100';
          doc.text(totalScoreStr, 115, paperY + rowHeight - 2, { align: 'center' });

          // Paper Grade (D1-F9 scale or SP/SF for subsidiary)
          const isSubSubject = isSubsidiarySubject(g.subject, g.type);
          const paperGrade = p.score !== null && p.score !== undefined
            ? (isSubSubject ? getUACESubGPGrade(p.score).grade : getUACEPrincipalGrade(p.score).grade)
            : '-';
          doc.setFont('helvetica', 'bold');
          doc.text(paperGrade, 129, paperY + rowHeight - 2, { align: 'center' });
        });

        // Draw spanned values in the middle of the group height
        const verticalCenterY = curY + (groupHeight / 2) + 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(11, 30, 91); // Navy Blue

        // Subject Name
        doc.text(g.subject.toUpperCase(), 18, verticalCenterY);

        // Final Grade (spanned)
        doc.text(finalGrade, 143, verticalCenterY, { align: 'center' });

        // Comment (spanned)
        doc.setFont('helvetica', 'normal');
        doc.text(finalComment, 168, verticalCenterY, { align: 'center' });

        // Initials (spanned)
        doc.text(combinedInitials, 190, verticalCenterY, { align: 'center' });

        curY += groupHeight;
        totalPaperRowsDrawn += numPapers;
      });

      // Draw all vertical column lines from tableY to curY
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(59, tableY + 7, 59, curY);
      doc.line(65, tableY + 7, 65, curY);
      doc.line(79, tableY + 7, 79, curY);
      doc.line(93, tableY + 7, 93, curY);
      doc.line(107, tableY + 7, 107, curY);
      doc.line(123, tableY + 7, 123, curY);
      doc.line(135, tableY + 7, 135, curY);
      doc.line(151, tableY + 7, 151, curY);
      doc.line(185, tableY + 7, 185, curY);

      currentY = curY;
    } else {
      // Compute UCE Result Status
      const rawSMarks = olevelMarks.filter(m => m.student_id === student.id);
      const sMarks = sortOLevelSubjects(rawSMarks, student.gradeClass);
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

      const satCount = sMarks.length;
      const hasDOrHigher = olevelGrades.some(g => ['A', 'B', 'C', 'D'].includes(g));

      if (satCount > 0) {
        if (!hasDOrHigher) {
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

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42); // Dark Slate
      const formulaText = "Final Percentage = (CA Score \u00F7 Maximum CA Marks \u00D7 CA Weight) + (Exam Score \u00F7 Maximum Exam Marks \u00D7 Exam Weight)";
      doc.text(formulaText, 15, noteY);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // Slate 500
      const exampleText = "Example: If CA Weight = 20% and Exam Weight = 80%: Final Percentage = (CA Score \u00F7 Maximum CA Marks \u00D7 20) + (Exam Score \u00F7 Maximum Exam Marks \u00D7 80).";
      doc.text(exampleText, 15, noteY + 4.5, { maxWidth: 180 });

      currentY = noteY + 8;
    }

    // Summary Cards Row
    let summaryY = currentY + spacingGap;

    if (isUACE) {
      // 1. Calculate UACE points
      const uacePtsObj = calculateUACEPoints(uaceMarks.filter(m => m.student_id === student.id));

      // 2. Draw Points Summary Row (spans 180mm)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(15, summaryY, 180, 12, 1.5, 1.5, 'FD');

      // Left blue title column
      doc.setFillColor(11, 30, 91);
      doc.roundedRect(15, summaryY, 40, 12, 1, 1, 'F');
      doc.rect(15 + 39, summaryY, 1, 12, 'F'); // cover corner round
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('POINTS SUMMARY', 35, summaryY + 7.5, { align: 'center' });

      // Dividers between points boxes
      doc.setDrawColor(226, 232, 240);
      doc.line(55 + 46, summaryY, 55 + 46, summaryY + 12);
      doc.line(55 + 92, summaryY, 55 + 92, summaryY + 12);

      // Render points details
      doc.setTextColor(11, 30, 91);
      doc.setFontSize(7.5);

      // Principal Points Box
      doc.text('PRINCIPAL POINTS', 78, summaryY + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(uacePtsObj.principalPoints), 78, summaryY + 10.2, { align: 'center' });

      // Subsidiary Points Box
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('SUBSIDIARY POINTS', 124, summaryY + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(uacePtsObj.subsidiaryPoints), 124, summaryY + 10.2, { align: 'center' });

      // Total Points Box
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('TOTAL POINTS', 171, summaryY + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(uacePtsObj.totalPoints), 171, summaryY + 10.2, { align: 'center' });

      let commentsY = summaryY + 12 + spacingGap;

      // 3. Draw Split Comments & Signatures Box (height 30mm)
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(15, commentsY, 180, 30, 1.5, 1.5, 'FD');

      // Center divider vertical line
      doc.line(105, commentsY, 105, commentsY + 30);

      // Class Teacher column
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(11, 30, 91);
      doc.text("CLASS TEACHER'S COMMENT:", 18, commentsY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const ctComment = getUACEClassTeacherComment(uacePtsObj.totalPoints);
      doc.text(ctComment, 18, commentsY + 9, { maxWidth: 82 });

      // Class Teacher Signature
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(11, 30, 91);
      doc.text("CLASS TEACHER'S SIGNATURE:", 18, commentsY + 23);

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

      if (ctSignature) {
        try {
          const isSvg = ctSignature.includes('svg+xml');
          const format = isSvg ? 'SVG' : 'PNG';
          doc.addImage(ctSignature, format, 65, commentsY + 16, 24, 7, undefined, 'FAST');
        } catch (e) {
          console.warn(`Could not draw Class Teacher signature:`, e);
        }
      }
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.45);
      doc.line(60, commentsY + 23.5, 95, commentsY + 23.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(ctName || '___________________', 77.5, commentsY + 27.5, { align: 'center' });

      // Head Teacher column
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(11, 30, 91);
      doc.text("HEAD TEACHER'S COMMENT:", 108, commentsY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const htComment = getUACEHeadTeacherComment(uacePtsObj.totalPoints);
      doc.text(htComment, 108, commentsY + 9, { maxWidth: 58 });

      // Head Teacher Signature
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(11, 30, 91);
      doc.text("HEAD TEACHER'S SIGNATURE:", 108, commentsY + 23);

      const htName = (htTeacher && htTeacher.name) ? htTeacher.name : 'Dr. Bernard Ochola';
      const htSignature = (htTeacher && htTeacher.signature) ? htTeacher.signature : null;

      if (htSignature) {
        try {
          const isSvg = htSignature.includes('svg+xml');
          const format = isSvg ? 'SVG' : 'PNG';
          doc.addImage(htSignature, format, 150, commentsY + 16, 24, 7, undefined, 'FAST');
        } catch (e) {
          console.warn(`Could not draw Head Teacher signature:`, e);
        }
      }
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.45);
      doc.line(145, commentsY + 23.5, 180, commentsY + 23.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(htName || 'Dr. Bernard Ochola', 162.5, commentsY + 27.5, { align: 'center' });

      // School Stamp inside Head Teacher's comments block
      const stampX = 168;
      const stampY = commentsY + 3;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.rect(stampX, stampY, 24, 24, 'D');
      doc.circle(stampX + 12, stampY + 12, 11, 'D');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5);
      doc.setTextColor(148, 163, 184);
      doc.text('SCHOOL STAMP', stampX + 12, stampY + 13.5, { align: 'center' });

      if (stampBase64) {
        try {
          const isSvg = stampBase64.includes('svg+xml');
          doc.addImage(stampBase64, isSvg ? 'SVG' : 'PNG', stampX + 2, stampY + 2, 20, 20, undefined, 'FAST');
        } catch (e) {
          console.warn("Could not draw school stamp in UACE block:", e);
        }
      }

      // 4. Draw U.A.C.E Grading System reference table
      const gradingY = commentsY + 30 + spacingGap;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(11, 30, 91);
      doc.text('U.A.C.E GRADING SYSTEM', 105, gradingY, { align: 'center' });

      const gridY = gradingY + 2;
      const colWidths = [22, 14, 14, 14, 14, 14, 14, 14, 14, 14]; // 22 + 9 * 14 = 148mm
      
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.rect(15, gridY, 148, 12, 'FD');

      doc.line(15, gridY + 4, 163, gridY + 4);
      doc.line(15, gridY + 8, 163, gridY + 8);

      let nextX = 15;
      colWidths.forEach((w) => {
        nextX += w;
        doc.line(nextX, gridY, nextX, gridY + 12);
      });

      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      
      doc.setFont('helvetica', 'bold');
      doc.text('MARKS', 15 + 11, gridY + 3, { align: 'center' });
      doc.text('GRADE', 15 + 11, gridY + 7, { align: 'center' });
      doc.text('POINTS', 15 + 11, gridY + 11, { align: 'center' });

      const marksVals = ['80+', '75-79', '66-74', '60-65', '55-59', '50-54', '45-49', '35-44', '0-34'];
      const gradeVals = ['D1', 'D2', 'C3', 'C4', 'C5', 'C6', 'P7', 'P8', 'F9'];
      const pointsVals = ['6', '5', '4', '3', '2', '1', '0', '0', '0'];

      doc.setFont('helvetica', 'normal');
      let curColX = 15 + 22;
      for (let i = 0; i < 9; i++) {
        const cx = curColX + 7;
        doc.text(marksVals[i], cx, gridY + 3, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.text(gradeVals[i], cx, gridY + 7, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text(pointsVals[i], cx, gridY + 11, { align: 'center' });
        curColX += 14;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(11, 30, 91);
      doc.text('SP = Subsidiary Pass', 167, gridY + 4.5);
      doc.text('SF = Subsidiary Fail', 167, gridY + 8.5);

      currentY = gridY + 12;

      // 5. Next Term Begins and Stamp Warning Banner at bottom
      const nextTermY = currentY + spacingGap;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(11, 30, 91);
      
      const nextTermDateStr = settings.next_term_begins || '26th May, 2025';
      doc.text(`NEXT TERM BEGINS ON: ${nextTermDateStr.toUpperCase()}`, 15, nextTermY + 3);

      const warningBarY = nextTermY + 6;
      doc.setFillColor(11, 30, 91);
      doc.roundedRect(15, warningBarY, 180, 6, 1, 1, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('THIS REPORT CARD SHOULD NOT BE HONOURED WITHOUT AN OFFICIAL SCHOOL STAMP.', 105, warningBarY + 4.2, { align: 'center' });

    } else {
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
      doc.text('A: Exceptional (>= 80%)', 15 + 2 * (cardW + gap) + 3, summaryY + 9.5);
      doc.text('B: Outstanding (70 - 79%)  | C: Satisfactory (60 - 69%)', 15 + 2 * (cardW + gap) + 3, summaryY + 13.5);
      doc.text('D: Basic (50 - 59%)             | E: Elementary (< 50%)', 15 + 2 * (cardW + gap) + 3, summaryY + 17.5);

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

      // Signatures & Verification Row (clamp maximum sigY to 264 to guarantee it stays inside bottom border)
      let sigY = Math.min(264, commentsY + 28 + spacingGap);
      
      // Helper helper for drawing a signature block
      const drawSignatureBlock = (title, name, signatureData, centerX) => {
        // 1. Digital Signature Image (if exists)
        if (signatureData) {
          try {
            const isSvg = signatureData.includes('svg+xml');
            const format = isSvg ? 'SVG' : 'PNG';
            doc.addImage(signatureData, format, centerX - 12, sigY + 0.5, 24, 8, undefined, 'FAST');
          } catch (e) {
            console.warn(`Could not draw signature for ${title}:`, e);
          }
        }

        // 2. Signature Line
        doc.setDrawColor(203, 213, 225); // Slate 300
        doc.setLineWidth(0.45);
        doc.line(centerX - 20, sigY + 9, centerX + 20, sigY + 9);

        // 3. Staff Full Name
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42); // Slate 900
        const displayName = (name && name !== 'N/A') ? name : '___________________';
        doc.text(displayName, centerX, sigY + 13.5, { align: 'center' });

        // 4. Position Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(11, 30, 91); // Premium Navy
        doc.text(title, centerX, sigY + 17.5, { align: 'center' });
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
          doc.addImage(stampBase64, isSvg ? 'SVG' : 'PNG', 155, sigY - 2, 16, 16, undefined, 'FAST');
        } catch (e) {
          console.warn("Could not draw school stamp:", e);
        }
      }

      // Stamp Warning Footer
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(220, 38, 38); // Motto Red
      doc.text('INVALID WITHOUT OFFICIAL STAMP', 105, 283, { align: 'center' });
    }

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
  getHeadTeacherComment,
  isSubsidiarySubject,
  calculateUACEPoints,
  getUACEOverallSubjectGrade,
  isScienceSubject
};
