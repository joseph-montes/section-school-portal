# CEC Portal v19 — Faculty Realtime Class Fix

The Faculty My Classes page now merges realtime data from the canonical `classes` collection and the existing `facultyAssignments` compatibility index. It matches classes by `teacherId`, `teacherAuthUid`, or `teacherEmail`, and the UI uses the same identity rules.

This fixes the common situation where Firebase contains a class but the Faculty UI filters it out because the teacher ID/auth UID fields differ.

Deploy the included `firestore.rules` before testing. Create a new class as Admin, assign an Active Faculty teacher, save, and keep the Faculty browser open. The class should appear without refreshing.
