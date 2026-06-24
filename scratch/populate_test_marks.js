const mysql = require('C:/Users/Student/Downloads/Students Clearance Cards/node_modules/mysql2/promise');
const fs = require('fs');
const path = require('path');
const { compileReportsPdf } = require('C:/Users/Student/Downloads/Students Clearance Cards/electron/reportGenerator');

async function main() {
  const connection = await mysql.createConnection({
    host: "192.168.0.155",
    port: 3306,
    user: 'root',
    password: 'root123',
    database: 'student_clearance'
  });

  try {
    console.log('Connected to database.');

    // 1. Fetch Liam Mwansa (or first student if not found)
    let [students] = await connection.query("SELECT * FROM students WHERE name = 'Liam Mwansa' LIMIT 1");
    if (students.length === 0) {
      console.log('Liam Mwansa not found in DB. Using first available student.');
      [students] = await connection.query("SELECT * FROM students LIMIT 1");
    }
    if (students.length === 0) {
      console.log('No students found in DB. Exiting.');
      return;
    }
    const student = students[0];
    console.log('Found Student:', student.name, student.id);

    // 2. Fetch or create a teacher so we have teacher initials
    const [teachers] = await connection.query("SELECT * FROM teachers LIMIT 1");
    let teacherId = null;
    if (teachers.length > 0) {
      teacherId = teachers[0].id;
    } else {
      teacherId = 'T-DEFAULT';
      await connection.query(
        "INSERT INTO teachers (id, username, password_hash, name, subjects, classes) VALUES (?, ?, ?, ?, ?, ?)",
        [teacherId, 'test_teacher', 'dummyhash', 'John Paul', JSON.stringify([]), JSON.stringify([])]
      );
    }
    console.log('Using teacher ID:', teacherId);

    // 3. Clear existing marks for Liam Mwansa
    await connection.query("DELETE FROM olevel_marks WHERE student_id = ?", [student.id]);
    console.log('Deleted old marks.');

    // 4. Insert test subjects
    const testMarks = [
      { subject: 'Mathematics', integration1: 3.0, integration2: 2.0, integration3: 1.0, exam_score: 75 }, // AI1, AI2, AI3 present
      { subject: 'Biology', integration1: 2.0, integration2: null, integration3: null, exam_score: 60 },      // AI1 only
      { subject: 'Chemistry', integration1: 2.5, integration2: 1.5, integration3: null, exam_score: 80 },    // AI1, AI2 present
      { subject: 'Physics', integration1: null, integration2: null, integration3: null, exam_score: 50 },     // No AIs
      { subject: 'English Language', integration1: 1.0, integration2: 1.0, integration3: 1.0, exam_score: 45 } // All AIs equal
    ];

    for (const m of testMarks) {
      await connection.query(
        `INSERT INTO olevel_marks (student_id, subject, integration1, integration2, integration3, exam_score, term, year, teacher_id, status)
         VALUES (?, ?, ?, ?, ?, ?, '2', 2026, ?, 'Approved')`,
        [student.id, m.subject, m.integration1, m.integration2, m.integration3, m.exam_score, teacherId]
      );
    }
    console.log('Inserted fresh test marks.');

    // 5. Fetch all marks again
    const [olevelMarks] = await connection.query("SELECT * FROM olevel_marks WHERE student_id = ?", [student.id]);

    // 6. Fetch settings
    const [settingsRows] = await connection.query("SELECT key_name, val_value FROM settings");
    const settings = {};
    settingsRows.forEach(r => {
      settings[r.key_name] = r.val_value;
    });

    // 7. Fetch teachers map
    const [teachersList] = await connection.query("SELECT id, name FROM teachers");
    const teachersMap = {};
    teachersList.forEach(t => {
      teachersMap[t.id] = t.name;
    });

    // 8. Fetch class teachers
    const [classTeachersRows] = await connection.query("SELECT grade_class, teacher_id FROM class_teachers");
    const classTeachers = {};
    for (const r of classTeachersRows) {
      const teacher = teachersList.find(t => t.id === r.teacher_id);
      classTeachers[r.grade_class] = teacher ? teacher.name : 'N/A';
    }

    console.log('Generating PDF...');
    const doc = await compileReportsPdf({
      students: [student],
      olevelMarks: olevelMarks,
      uaceMarks: [],
      term: '2',
      year: 2026,
      settings,
      classTeachers,
      teachersMap
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const outputPath = path.join(__dirname, 'test-report-populated.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log('PDF populated report saved successfully at:', outputPath);

  } catch (err) {
    console.error('Error during populate & generate:', err);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
