# School Database Design

This database stores students, the courses they can take, and which students are enrolled on which courses.

## Tables

### students

- Stores one row per student.
- `id`: primary key, generated automatically.
- `name`: the student's full name (`NOT NULL`).
- `email`: the student's email address (`NOT NULL` and `UNIQUE`, so two students cannot share one email).

### courses

- Stores one row per course offered.
- `id`: primary key, generated automatically.
- `title`: the course name (`NOT NULL`).
- `credits`: the course's credit value (`NOT NULL`, must be greater than 0).

### enrolments

- Stores one row for each time a student is enrolled on a course. This is the **join table**.
- `id`: primary key.
- `student_id`: foreign key to `students.id` (`NOT NULL`).
- `course_id`: foreign key to `courses.id` (`NOT NULL`).
- `grade`: the student's grade on that course. It can be `NULL` because a grade is not known when the student first enrolls.
- `UNIQUE (student_id, course_id)`: prevents the same student enrolling on the same course twice.

## Relationships

- **students to enrolments: one-to-many.** One student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses to enrolments: one-to-many.** One course can have many enrolments, but each enrolment belongs to exactly one course.
- **students to courses: many-to-many.** One student can take many courses, and one course can have many students.

### Why a join table is needed

A relational table cannot store a list of values in a single column. Putting several course ids in a student row would break the rules of good design and make queries hard to write. Repeating the student in every course row would duplicate data and cause update mistakes. The `enrolments` table solves this by splitting the many-to-many relationship into two one-to-many relationships. It is also the natural home for data that belongs to the *pairing* rather than to either side, such as the `grade`.

## Index

- **Index to add:** `CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);`
- **Reason:** Queries such as "all students on one course" and "number of students per course" search the enrolments table by `course_id`. The `UNIQUE (student_id, course_id)` constraint already creates an index that helps lookups by student, but it does not help searches that start with `course_id`. Without an index on `course_id`, the database has to scan every row in `enrolments`, which gets slow as the number of enrolments grows.

## SQL or NoSQL?

I would choose SQL for this system. The data is highly structured and made of clearly related entities: students, courses and enrolments. It needs strict rules, such as unique emails, no duplicate enrolments, and foreign keys that stop an enrolment from pointing to a student or course that does not exist. A SQL database enforces all of these rules itself. It is also good at queries that join tables, count and group, such as finding students per course or students with no enrolments. A NoSQL database would be a better fit if the data had no fixed shape, needed to scale across many servers, or was mostly read as whole documents. None of that applies here, so the consistency and relational power of SQL is the better choice.
