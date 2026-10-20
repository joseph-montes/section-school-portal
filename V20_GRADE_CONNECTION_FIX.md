# CEC Portal v20 - Faculty Grade Connection Fix

## What was fixed

Faculty Grades no longer depends exclusively on the `subjects` collection being loaded correctly.

The authoritative academic relationship is now:

`classes/{classId}` -> `teacherId` / `teacherAuthUid` -> `subjectCode` -> `studentIds`

The Faculty grade Subject dropdown is built from the logged-in teacher's realtime assigned classes, with existing subject documents used only for additional metadata.

The Student dropdown is derived from the selected class's `studentIds`.

## Firestore grade security

Faculty grade creation/update is validated using the assigned class. The rule verifies:

- authenticated user is Faculty
- grade teacherId matches the Faculty teacherId
- the selected student belongs to the teacher through `facultyTeacherIds`
- the selected class belongs to the Faculty
- the class subjectCode matches the grade code
- the class explicitly contains the student

A separate `subjects/{code}` document is not required for the security decision.

## Testing

1. Deploy the included `firestore.rules`.
2. Log in as Admin and create/assign a class to a Faculty teacher.
3. Assign students to that class.
4. Keep the Faculty logged in.
5. Open Faculty -> Student Grades.
6. Click Enter Grade.
7. The Subject dropdown should show the subject from the assigned class.
8. Select the subject.
9. The Student dropdown should show the students in that class.
10. Save a grade and verify the Student portal receives it through Firestore realtime updates.
