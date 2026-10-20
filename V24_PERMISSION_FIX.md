# v24 Faculty Grade Permission Fix

This version keeps the v23 direct single-document Faculty grade writer and makes the Firestore authorization tolerant of legacy class/student identifiers.

## What changed
- `assignedClass()` now accepts `class.studentIds` containing either the public Student ID or the student's Firestore document ID.
- `assignedClass()` accepts `subjectCode`, or legacy `code` when `subjectCode` is absent.
- Grade create/update rules pass the grade's `studentFirestoreId` into the class-membership check.
- The Faculty grade writer still writes only `grades/{gradeId}`.
- Faculty cannot write grades for another Faculty member because `teacherId` must match the authenticated Faculty role and assigned class.

## Important
The updated `firestore.rules` MUST be deployed to the same Firebase project used by the portal. Updating the ZIP on the computer does not update Firebase rules.
