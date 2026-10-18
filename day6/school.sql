-- Day 6: School database (students, courses, enrolments)
-- Runs in SQLite (e.g. sqliteonline.com)

PRAGMA foreign_keys = ON;

-- Drop in reverse order so the script can be re-run safely
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ===== TABLES =====

CREATE TABLE students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  credits    INTEGER NOT NULL CHECK (credits > 0)
);

-- Join table: one row = one student enrolled on one course
CREATE TABLE enrolments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL,
  course_id   INTEGER NOT NULL,
  grade       TEXT,  -- NULL until the student has been graded
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE,
  -- Same student cannot enrol on the same course twice
  UNIQUE (student_id, course_id)
);

-- ===== SAMPLE DATA =====

INSERT INTO students (name, email) VALUES
  ('Amina Wanjiku', 'amina@example.com'),
  ('Brian Otieno',  'brian@example.com'),
  ('Grace Njeri',   'grace@example.com'),
  ('David Kimani',  'david@example.com');   -- not enrolled on anything

INSERT INTO courses (title, credits) VALUES
  ('Web Development',      4),
  ('Databases',            3),
  ('Introduction to Python', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 'A'),
  (1, 2, 'B'),
  (2, 1, 'B'),
  (3, 2, 'A'),
  (3, 3, NULL),
  (2, 3, 'C');

-- ===== QUERIES =====
-- Tip: some playgrounds only show the result of the LAST statement,
-- so run each query separately if you want to see every result.

-- 1. All courses for one student (by name)
SELECT s.name, c.title, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.id
JOIN courses c    ON c.id = e.course_id
WHERE s.name = 'Amina Wanjiku';

-- 2. All students on one course
SELECT c.title, s.name, s.email
FROM courses c
JOIN enrolments e ON e.course_id = c.id
JOIN students s   ON s.id = e.student_id
WHERE c.title = 'Web Development';

-- 3. Number of students per course
SELECT c.title, COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title;

-- 4. Students who have no enrolments
SELECT s.id, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.id IS NULL;

-- 5. Update one enrolment's grade (Grace's Python grade was still empty)
UPDATE enrolments
SET grade = 'B'
WHERE student_id = (SELECT id FROM students WHERE name = 'Grace Njeri')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Introduction to Python');

-- Check the update worked
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c  ON c.id = e.course_id
WHERE s.name = 'Grace Njeri';
