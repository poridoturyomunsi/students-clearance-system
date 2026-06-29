-- Create database if not exists
CREATE DATABASE IF NOT EXISTS school_system;
USE school_system;

-- Create classes table
CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create streams table
CREATE TABLE IF NOT EXISTS streams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(50) PRIMARY KEY,
  adminNo VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  gender VARCHAR(10) NOT NULL,
  gradeClass VARCHAR(50) NOT NULL,
  boardingStatus VARCHAR(50) NOT NULL,
  isCleared BOOLEAN NOT NULL DEFAULT FALSE,
  gateClearanceDate VARCHAR(20) NULL,
  mealsClearanceDate VARCHAR(20) NULL,
  remarks TEXT NULL,
  photo LONGTEXT NULL,
  photoOriginal LONGTEXT NULL,
  photoEnhanced LONGTEXT NULL,
  printStatus VARCHAR(20) NOT NULL DEFAULT 'Not Printed',
  uace_combination VARCHAR(50) NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Performance indexes for search and filtering
  INDEX idx_name (name(50)),
  INDEX idx_adminNo (adminNo),
  INDEX idx_gradeClass (gradeClass),
  INDEX idx_isCleared (isCleared),
  INDEX idx_boardingStatus (boardingStatus),
  INDEX idx_printStatus (printStatus),
  INDEX idx_gender (gender),
  INDEX idx_name_adminNo (name(50), adminNo),
  INDEX idx_search_composite (name(50), adminNo, gradeClass)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create marks table
CREATE TABLE IF NOT EXISTS marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  marks_obtained DECIMAL(5,2) NOT NULL,
  max_marks DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  term VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY `unique_student_subject_term` (student_id, subject, term, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  status ENUM('Present', 'Absent', 'Late', 'Excused') NOT NULL,
  remarks VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY `unique_student_date` (student_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create fees table
CREATE TABLE IF NOT EXISTS fees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  term VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  amount_due DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance DECIMAL(12,2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,
  payment_status ENUM('Paid', 'Pending', 'Overdue') NOT NULL DEFAULT 'Pending',
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY `unique_student_term` (student_id, term, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  key_name VARCHAR(50) PRIMARY KEY,
  val_value LONGTEXT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create teachers table
CREATE TABLE IF NOT EXISTS teachers (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  subjects JSON NOT NULL,
  classes JSON NOT NULL,
  position VARCHAR(100) NULL,
  signature LONGTEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create student_accounts table for login access
CREATE TABLE IF NOT EXISTS student_accounts (
  student_id VARCHAR(50) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create olevel_marks table for Competency-Based Assessment (S1-S4)
CREATE TABLE IF NOT EXISTS olevel_marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  integration1 DECIMAL(3,1) NULL,
  integration2 DECIMAL(3,1) NULL,
  integration3 DECIMAL(3,1) NULL,
  exam_score DECIMAL(5,2) NULL,
  term VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  teacher_id VARCHAR(50) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY `unique_olevel_subject_term` (student_id, subject, term, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create uace_marks table for S5-S6 report sheets
CREATE TABLE IF NOT EXISTS uace_marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  subject_type VARCHAR(20) NOT NULL, -- 'Principal' | 'Subsidiary' | 'General Paper'
  paper INT NOT NULL DEFAULT 1,
  score DECIMAL(5,2) NULL,
  bot DECIMAL(5,2) NULL DEFAULT NULL,
  mot DECIMAL(5,2) NULL DEFAULT NULL,
  eot DECIMAL(5,2) NULL DEFAULT NULL,
  grade VARCHAR(2) NULL,
  points INT NULL DEFAULT NULL,
  term VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  teacher_id VARCHAR(50) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY `unique_uace_subject_paper_term` (student_id, subject, paper, term, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create teacher_assignments table for linking subjects to specific classes/streams
CREATE TABLE IF NOT EXISTS teacher_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id VARCHAR(50) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  grade_class VARCHAR(50) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  UNIQUE KEY `unique_teacher_subject_class` (teacher_id, subject, grade_class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create class_teachers table for assigning a class teacher to a stream
CREATE TABLE IF NOT EXISTS class_teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grade_class VARCHAR(50) UNIQUE NOT NULL,
  teacher_id VARCHAR(50) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
