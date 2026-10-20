# CEC Portal v22 - Faculty Grade Realtime Fix

## What changed

The Faculty grade page now uses the canonical Admin-created `classes` records as the source of truth for both subjects and assigned students.

### Realtime flow

Admin -> `classes/{classId}` -> `teacherId` + `subjectCode` + `studentIds` -> Faculty `onSnapshot()` -> Grade Subject dropdown -> Student dropdown.

The Faculty grade page no longer depends on the Faculty `students` query using only `students.facultyTeacherIds`.

## Direct student access index

The Admin save process creates `facultyStudentAccess/{teacherId}__{studentId}` from every class's `studentIds`. This is a security index, not the academic source of truth.

It allows Faculty to read the actual student document only when that student is assigned to one of the teacher's classes.

## Existing classes

When an Admin session starts, the application materializes `facultyStudentAccess` for existing class records. No manual UID copying is required.

## Testing

1. Publish the included `firestore.rules`.
2. Log in as Admin.
3. Ensure a class has a teacher and `studentIds`.
4. Save the class once if it was created before v22.
5. Log in as the assigned Faculty.
6. Open Grades -> Enter Grade.
7. The subject comes from the teacher's assigned classes.
8. After selecting the subject, students come from that class's `studentIds`.
9. Grade writes are checked by Firestore against teacher + class + subject + student.
