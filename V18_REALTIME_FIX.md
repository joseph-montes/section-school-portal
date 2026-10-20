# CEC Portal v18 — Direct Faculty Class Realtime Fix

This version strengthens the Admin → Class → Teacher → Faculty relationship.

## Direct relationship
New class records store:
- `teacherId`
- `teacherAuthUid`
- `teacherEmail`

`teacherAuthUid` is copied automatically from the Admin-created teacher record. The Admin never enters a Firebase UID manually.

## Faculty realtime
Faculty subscribes directly to `classes` with:
- `teacherAuthUid == authenticated Firebase Auth UID`
- `teacherId == authenticated teacherId` as a compatibility fallback

The two realtime snapshots are merged and rebuilt on every update, so reassignment/removal does not leave stale classes in the Faculty browser.

## Existing classes
When an Admin opens the portal, existing classes are repaired from the existing teacher record by filling `teacherAuthUid` and `teacherEmail`, then saved to Firestore.

## Required Firebase step
Deploy the included `firestore.rules` before testing.

## Test
1. Admin creates/opens a Teacher and confirms Faculty Login exists.
2. Admin creates a class and assigns that teacher.
3. Keep the Faculty account logged in in another browser.
4. Open My Classes.
5. The class should appear automatically after Firestore commits.
6. Change the class teacher in Admin and observe the old Faculty lose the class and the new Faculty receive it without a refresh.
