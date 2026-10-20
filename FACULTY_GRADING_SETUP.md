# CEC Portal — Faculty / Teacher Grading Setup

## 1. Firebase Authentication

In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password**.

Faculty passwords are stored and verified by Firebase Authentication. The portal does **not** store faculty passwords in Firestore.

## 2. Create a Faculty / Teacher

1. Sign in to the CEC Admin Portal.
2. Open **Teachers**.
3. Choose **Add Teacher**.
4. Enter:
   - Teacher ID
   - Full Name
   - Department
   - Email
   - Contact Number
   - Status
5. Keep **Create Login Account** enabled if this teacher needs a Faculty login.
6. Enter an initial strong password.
7. Save the teacher.

The portal uses the teacher email as the human-facing identity. It automatically creates the Firebase Authentication account and internally stores the Firebase UID in the teacher record and `facultyRoles/{uid}`. The administrator never needs to copy/paste a Firebase UID.

If the email already belongs to an existing Firebase Authentication account, the client portal cannot safely take ownership of that existing account. Use a trusted account-management/backend process to link that existing account rather than putting a Firebase Admin SDK service-account key in browser JavaScript.

## 3. How Faculty Login Works

1. Teacher enters email and password on **Login as Faculty**.
2. Firebase Authentication verifies the credentials.
3. The authenticated email is matched to the teacher's `teachers.email`.
4. The internally managed `facultyRoles/{uid}` mapping supplies the teacher ID.
5. The teacher must have `status: "Active"`.
6. The role becomes `faculty`.
7. The portal opens `html/faculty/faculty-dashboard.html`.

An authenticated account with no valid active faculty record receives:

> Your account is authenticated, but no active faculty record was found. Please contact the administrator.

An inactive faculty record receives:

> Your faculty account is currently inactive. Please contact the administrator.

## 4. Assign Subjects

In **Admin → Subjects**, create or edit a subject and select an active teacher.

Example:

```text
code: IT101
name: Introduction to Computing
units: 3
teacherId: T001
teacherName: Juan Dela Cruz
```

Faculty subject queries are restricted to subjects whose `teacherId` matches the authenticated faculty teacher ID.

## 5. Assign Classes

In **Admin → Classes & Sections**, create or edit a class and select an active teacher.

Example:

```text
classId: C001
section: BSIT-3A
subjectCode: IT101
subject: Introduction to Computing
teacherId: T001
teacherName: Juan Dela Cruz
schoolYear: 2026-2027
semester: First Semester
```

The Faculty **My Classes** page reads the canonical `classes` collection directly with a realtime Firestore listener filtered by the authenticated teacher ID. There is no dependency on a separate assignment collection for displaying classes. When Admin creates, edits, reassigns, or deletes a class, the Faculty browser receives the change automatically through Firestore `onSnapshot()`.

## 6. Enter Grades

Faculty → **Student Grades** → **Enter Grade**.

The faculty member selects an assigned subject and a student from an assigned class, then enters:

- Prelim
- Midterm
- Semi-Final
- Final

The subject semester average is:

```text
(Prelim + Midterm + Semi-Final + Final) / 4
```

All four grading periods are required for a numeric subject semester average. If one or more periods are missing, the portal displays **Incomplete**.

## 7. Edit Grades

Faculty can edit only grade documents whose `teacherId` matches their own faculty identity.

Faculty cannot:

- edit another teacher's grades
- delete grades
- modify students
- modify teachers
- modify subjects
- modify payments
- modify announcements
- modify system settings

These restrictions are enforced by both the interface and Firestore Security Rules. The rules also verify that the grade subject is assigned to the authenticated faculty member.

## 8. Student Grade Viewing

Students can read only grade documents whose `studentId` matches their authenticated student role.

Students cannot create, update, or delete grades.

Student subject averages are combined using a unit-weighted semester average:

```text
SUM(subjectAverage × units) / SUM(units)
```

## 9. Admin Grade Monitoring

Admin → **Grades** is a monitoring/summary page.

Admin can view grade summaries and averages, but the Admin interface does not provide direct individual-grade editing.

The Firestore rules also prevent Admin grade writes through the `grades` collection.

## 10. Faculty Profile

Faculty → **My Profile** displays:

- Teacher ID
- Full Name
- Email
- Department
- Contact Number
- Status

Faculty cannot change their role.

## 11. Firestore Security Rules

Deploy the included `firestore.rules` to the existing Firebase project.

The rules require Firebase Authentication for protected data and separate:

- `admin`
- `student`
- `faculty`

Faculty access is based on the internally managed `facultyRoles/{uid}` mapping plus the authenticated email and active teacher status.

Do **not** deploy rules such as:

```text
allow read, write: if true;
```

## 12. Collections

The implementation preserves the existing collections:

- `students`
- `teachers`
- `subjects`
- `classes`
- `grades`
- `attendance`
- `enlistments`
- `materials`
- `events`
- `payments`
- `announcements`
- `adminNotifications`

Additional internal role mapping:

- `facultyRoles`
- existing `userRoles` for students
- existing `admins`

Existing grade records containing an older `grade` field are not deleted. The UI continues to read legacy records where possible; records without all four grading-period values are treated as incomplete rather than silently inventing a semester average.

## 13. Realtime Updates

The portal uses Firestore realtime listeners. Faculty grade changes refresh the Faculty pages and the student's grade view when the authenticated user has permission to read the changed record.

## 14. Testing Checklist

### Student
- Login works.
- Student reaches Student Dashboard.
- Student sees only their own grades.
- Student cannot edit grades.
- Student semester averages use subject units.

### Faculty
- Faculty signs in with email/password.
- Authenticated email matches the teacher record.
- Inactive teachers are denied access.
- Assigned subjects are visible.
- Assigned classes are visible.
- Assigned students are available for grading.
- Prelim/Midterm/Semi-Final/Final can be entered.
- Semester average is calculated.
- Own grades can be edited.
- Grade deletion is unavailable.

### Security
- Faculty A cannot read/write Faculty B's grades.
- Faculty cannot write grades for an unassigned subject.
- Faculty cannot access Admin pages.
- Student cannot access Faculty pages.
- Student cannot write grades.
- Unauthenticated users cannot access protected faculty data.
- Admin can manage teachers and assignments.
- Admin can view grade summaries but cannot write the `grades` collection.

## 15. Important Deployment Note

Never put a Firebase Admin SDK service-account private key in `app-core.js`, `database.js`, or any other browser-delivered file.

The included client-side **Create Login Account** workflow uses a secondary Firebase Web Auth instance so an administrator's primary session is not replaced while creating a new faculty Authentication account. This creates a new account; it does not take control of an already-existing Firebase user.

## 9. Reliable Academic Data Connections

The Admin portal now uses controlled dropdowns and generated identifiers to reduce manual-entry errors:

### Teacher
- Teacher ID is generated automatically as a unique `T###` value.
- Department is selected from:
  - BSIT Department
  - HTM Department
  - CRIMINOLOGY Department
  - CTE Department

### Course and subjects
Supported course values are:
- BSIT
- HM
- TM
- BSED
- BSCrim

Subject names are selected from the course-specific subject catalog. Subject codes are generated automatically and uniquely. The teacher list is filtered to the department associated with the selected course.

### Schedule and rooms
Subject schedules are generated automatically from Monday-Saturday time slots between 7:30 AM and 9:30 PM. Existing subject schedules are checked before a new slot is selected. Rooms are also selected automatically and are checked against the selected schedule so the same room is not assigned to two subjects at the same time.

### Class / section
- Class IDs are generated automatically as unique `C###` values.
- Course and Year Level are dropdowns.
- Year Level is limited to 1-4.
- Section is generated from the selected course and year, for example `BSIT 1A` or `HM 1A`. The same section number can exist under another course.
- Subject, schedule, and room are selected from the subject offering. The class cannot save with a subject from another course.
- The class teacher must match the teacher assigned to its selected subject.

### Student assignment
The Class form shows only active students whose course and year match the selected class. A student from another course cannot be assigned to that class. When students are assigned to a class, their section is synchronized to the class section and the system updates `facultyTeacherIds` on the student record.

This creates the relationship:

```text
Student
  -> Class / Section
      -> Subject
          -> Teacher
              -> Faculty Firebase Account
```

Faculty pages read only the classes and subjects assigned to the authenticated teacher. Faculty grade entry then uses the students explicitly assigned to the selected subject class.

## 10. Existing Data

Existing teachers, subjects, classes, and students are preserved. New records use the generated IDs and controlled fields. Existing class records without `studentIds` continue to support the older Program + Year + Section matching logic so older data is not silently discarded.

For existing records that do not yet have the new relationships, open the Admin **Subjects** and **Classes & Sections** pages and save the records again using the new controlled forms. This rebuilds the teacher/student access bridge.

## 12. Direct Realtime Admin → Faculty Class Connection

The canonical relationship is:

```text
Admin creates/edits classes/{classId}
        ↓
classes.teacherId == T001
        ↓
Faculty T001 onSnapshot() listener
        ↓
Faculty My Classes updates automatically
```

The `facultyAssignments` collection may still exist as a backward-compatible mirror for older project data, but Faculty class pages do not depend on it. The Admin class save operation also mirrors class assignment data in the same Firestore batch for compatibility.

If a class is reassigned from T001 to T002, the realtime queries automatically remove it from T001 and add it to T002.

## 13. Deploy Rules

Publish the included `firestore.rules`. The important Faculty rule is that an authenticated Faculty user may read a class only when `classes/{id}.teacherId` equals that Faculty user's internally mapped `teacherId`. This makes the direct realtime query both functional and server-side protected.
