-- Recommended MySQL indexes to improve students query performance
-- Run these once (adjust table/column names to match your schema)

ALTER TABLE students
  ADD INDEX idx_students_adminNo (adminNo),
  ADD INDEX idx_students_name (name),
  ADD INDEX idx_students_gradeClass (gradeClass),
  ADD INDEX idx_students_updatedAt (updatedAt),
  ADD INDEX idx_students_printStatus (printStatus),
  ADD INDEX idx_students_isCleared (isCleared),
  ADD INDEX idx_students_boardingStatus (boardingStatus);

-- For teacher assignments/marks tables you may want indexes as well, example:
-- ALTER TABLE marks ADD INDEX idx_marks_student_id (student_id), ADD INDEX idx_marks_subject_term_year (subject, term, year);
