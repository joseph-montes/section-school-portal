# CEC Portal v23 — Faculty Grade Permission Fix

## What was fixed

### 1. Faculty no longer performs unauthorized collection reads
Faculty initialization previously fell through to collection-wide Firestore reads for collections such as `attendance`, `payments`, and `enlistments`. Those reads were rejected by the existing Security Rules and produced noisy `Missing or insufficient permissions` errors.

v23 explicitly limits Faculty reads to the collections required by the Faculty portal:
- `teachers`
- `grades`
- `classes`
- `subjects`
- `announcements`

### 2. Faculty grade saving is now a direct single-document write
Faculty grade entry no longer calls the generic whole-database `saveDB()` path. It uses `saveFacultyGrade()` and writes only:

`grades/{gradeId}`

The existing Firestore Security Rules still decide whether the write is authorized.

### 3. Grade authorization no longer depends on the auxiliary access index
The v22 rules required both a valid student document and either `students.facultyTeacherIds` or `facultyStudentAccess` for `assignedStudent()`.

v23 keeps the student-document integrity check but uses the canonical `classes` relationship for Faculty authorization. The grade create/update rule still requires:
- authenticated Faculty role
- matching `teacherId`
- an existing student document whose `id` matches the grade student ID
- an existing class assigned to that Faculty
- matching subject code
- the student's ID to be present in `class.studentIds`

This does not make grade writes public or role-only.

## Security behavior preserved

- Faculty cannot write classes, students, teachers, subjects, payments, attendance, etc.
- Faculty can only create/update grades for their own assigned classes/students.
- Admin retains administrative write access.
- Student grade access remains limited to the student's own records.
- No `allow read, write: if true` rule was added.

## Firebase deployment note

After extracting v23, publish the included `firestore.rules` to the same Firebase project used by the portal. Existing Firestore data is not deleted by v23.
