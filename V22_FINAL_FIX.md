# CEC Portal Faculty Grades v22 — Final Realtime Fix

## Canonical relationship
Admin class assignments are the source of truth for Faculty academic access:

`classes/{classId}` → `teacherId / teacherAuthUid / subjectCode / studentIds`

Faculty My Classes listens directly to `classes` in realtime. Faculty Grade Entry derives its Subject list from those assigned classes and its Student list from the selected class `studentIds`.

## Important v22 fix
The Faculty role no longer subscribes to the global `students` collection with `facultyTeacherIds`. That listener could return an empty array and overwrite the students hydrated from `classes.studentIds`.

The Faculty student cache is now populated only by the class-derived hydration function.

## Testing checklist
1. Admin creates/updates a class and assigns a teacher.
2. Teacher sees the class without refreshing.
3. Teacher opens Enter Grade.
4. Subject dropdown contains subjects from the teacher's assigned classes.
5. Selecting a subject shows students from the selected class's `studentIds`.
6. Grade writes carry `teacherId`, `classId`, `code`, `studentId`, and `studentFirestoreId`.
7. Firestore Rules verify Teacher → Class → Subject → Student before accepting a grade.
8. Student/Admin existing features and collections are preserved.

Deploy the included `firestore.rules` before testing.
