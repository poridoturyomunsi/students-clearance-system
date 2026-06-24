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

    // 1. Fetch first available student
    let [students] = await connection.query("SELECT * FROM students LIMIT 1");
    if (students.length === 0) {
      console.log('No students found in DB. Exiting.');
      return;
    }
    const student = students[0];
    console.log('Found Student:', student.name, student.id);

    // 2. Fetch or create a teacher
    const [teachers] = await connection.query("SELECT * FROM teachers LIMIT 1");
    let teacherId = teachers.length > 0 ? teachers[0].id : 'T-DEFAULT';
    console.log('Using teacher ID:', teacherId);

    // 3. Define the six assessment periods
    const periods = ['1', 'Midterm 1', '2', 'Midterm 2', '3', 'Midterm 3'];

    // 4. Clear existing test marks for this student across all six periods
    await connection.query(
      "DELETE FROM olevel_marks WHERE student_id = ? AND term IN (?)",
      [student.id, periods]
    );
    console.log('Cleared existing test marks.');

    // 5. Insert marks for each period with slightly different scores to test averages
    const baseSubjects = ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'English Language'];
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      // Vary marks per period: period 1 has average 60, period 2 has 65, etc.
      const examOffset = i * 4;

      console.log(`Inserting marks for period: ${period}`);
      for (let sIdx = 0; sIdx < baseSubjects.length; sIdx++) {
        const subject = baseSubjects[sIdx];
        const integration1 = 1.5 + (sIdx % 3) * 0.5;
        const examScore = 55 + examOffset + (sIdx * 3);

        await connection.query(
          `INSERT INTO olevel_marks (student_id, subject, integration1, integration2, integration3, exam_score, term, year, teacher_id, status)
           VALUES (?, ?, ?, null, null, ?, ?, 2026, ?, 'Approved')`,
          [student.id, subject, integration1, examScore, period, teacherId]
        );
      }
    }
    console.log('Inserted marks for all six assessment periods successfully.');

    // 6. Fetch settings, teachers, and class teachers map
    const [settingsRows] = await connection.query("SELECT key_name, val_value FROM settings");
    const settings = {};
    settingsRows.forEach(r => {
      settings[r.key_name] = r.val_value;
    });

    const [teachersList] = await connection.query("SELECT id, name FROM teachers");
    const teachersMap = {};
    teachersList.forEach(t => {
      teachersMap[t.id] = t.name;
    });

    const [classTeachersRows] = await connection.query("SELECT grade_class, teacher_id FROM class_teachers");
    const classTeachers = {};
    for (const r of classTeachersRows) {
      const teacher = teachersList.find(t => t.id === r.teacher_id);
      classTeachers[r.grade_class] = teacher ? { name: teacher.name } : 'N/A';
    }

    // 7. Compile report cards for each of the six periods
    for (const period of periods) {
      console.log(`Compiling PDF for period: ${period}...`);

      const [olevelMarks] = await connection.query(
        "SELECT * FROM olevel_marks WHERE student_id = ? AND term = ? AND status = 'Approved'",
        [student.id, period]
      );

      const doc = await compileReportsPdf({
        students: [student],
        olevelMarks: olevelMarks,
        uaceMarks: [],
        term: period,
        year: 2026,
        settings,
        classTeachers,
        teachersMap
      });

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      const outputFilename = `test-report-${period.replace(/\s+/g, '_')}.pdf`;
      const outputPath = path.join(__dirname, outputFilename);
      fs.writeFileSync(outputPath, pdfBuffer);
      console.log(`Saved PDF report successfully at: ${outputPath}`);
    }

    console.log('All six periods tested successfully!');

  } catch (err) {
    console.error('Error during testing six periods:', err);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
