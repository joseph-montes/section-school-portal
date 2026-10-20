# CEC Portal v22

This version fixes Faculty Grade Entry by connecting it directly to the canonical Firestore `classes` relationship.

- Admin creates/updates classes in `classes`.
- Each class stores `teacherId`, `subjectCode`, and `studentIds`.
- Faculty classes are realtime from `classes`.
- Faculty grade Subject options come from assigned classes.
- Faculty grade Student options come from the selected class's `studentIds`.
- `facultyStudentAccess` is an internal security index generated automatically by Admin saves.
- Firestore rules enforce teacher/class/student authorization.

Deploy `firestore.rules` before testing.
