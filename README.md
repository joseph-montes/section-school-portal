# CEC Portal — Firebase + Firestore

CEC Portal is a multi-page web portal using **Firebase Authentication** for accounts and **Cloud Firestore** for application data. The browser keeps a short-lived in-memory `db` cache for rendering, while Firestore is the persistent source of truth.

## Architecture

```text
Student/Admin UI
      │
      ▼
Page JavaScript Controllers
      │
      ▼
js/core/database.js
      │
      ├── Firebase Authentication
      │       └── login / registration / password reset
      │
      └── Cloud Firestore
              ├── Create
              ├── Read
              ├── Update
              ├── Delete
              └── onSnapshot realtime synchronization
```

## Firestore collections

- `admins` — administrator authorization and profile
- `userRoles` — Firebase UID → portal role/student ID mapping
- `students` — student master records
- `studentLookup` — registration/login lookup information
- `teachers` — teacher records
- `subjects` — subject records
- `classes` — class/section records
- `enlistments` — student subject enlistment records
- `grades` — student grade records
- `attendance` — attendance records
- `materials` — learning materials
- `events` — calendar events
- `payments` — tuition/payment records
- `announcements` — administrator announcements
- `adminNotifications` — administrator notifications
- `settings` — per-student settings
- `adminSettings` — per-administrator settings

## Complete system flow

### Administrator

```text
Admin Login
  ↓
Firebase Authentication
  ↓
Check admins/{uid}.role == admin
  ↓
Admin Dashboard
  ↓
Create / Read / Update / Delete
  ↓
Cloud Firestore
  ↓
onSnapshot()
  ↓
Admin UI refresh
```

### Student

```text
Student ID + registration code + Gmail
  ↓
studentLookup validation
  ↓
Firebase Authentication account creation
  ↓
userRoles/{uid}
  ↓
students/{student document}
  ↓
Student Dashboard
  ↓
Read own grades / attendance / payments / enlistments
  ↓
onSnapshot()
  ↓
Realtime student UI
```

## CRUD mapping

| Operation | Portal example | Firestore operation |
|---|---|---|
| Create | Add student/teacher/grade | `batch.set()` |
| Read | Load dashboard records | `get()` / `onSnapshot()` |
| Update | Edit student/grade/payment | `batch.set(..., {merge:true})` |
| Delete | Delete an admin record | `batch.delete()` |

The central `saveDB()` function compares the previous synchronized snapshot with the current in-memory data and commits the differences as a Firestore batch.

## Security

`firestore.rules` separates administrator and student access. Student-owned records are authorized using the `userRoles/{uid}.studentId` mapping rather than assuming that the Firestore student document ID equals the Firebase Authentication UID.

## Setup

1. Open Firebase Console.
2. Enable Email/Password Authentication.
3. Put the Firebase Web App configuration in `js/core/firebase-config.js`.
4. Create an administrator Firebase Authentication account.
5. Create `admins/{ADMIN_UID}` with `role: "admin"`.
6. Publish `firestore.rules`.
7. Run the portal using VS Code Live Server.

See `FIREBASE_SETUP.md` for detailed setup and migration instructions.

## Student Registration Flow

The intended production/test flow is:

**Admin → Add Student → Student ID + Gmail + Registration Code → Student Register → Firebase Authentication → studentLookup claim → userRoles/{uid} → students/{studentId} link → Student Login → Student Dashboard.**

The Gmail entered by the admin is the registration email. Students must use the same Gmail during registration. Once registered, the admin cannot change that Gmail through the normal student edit form because it is linked to Firebase Authentication.

After registration succeeds, the portal signs the new account out intentionally. The student must then log in normally so the role and Firestore realtime listeners are initialized through the standard login flow.

## Faculty Grading Module
See `FACULTY_GRADING_SETUP.md` for Firebase Authentication, faculty role linking, grading periods, and Firestore setup.

## v14 Academic Assignment Improvements

The Admin academic forms now use generated Teacher IDs, Subject Codes, and Class IDs; controlled department/course/year fields; course-specific subject catalogs; automatic conflict-aware schedules and rooms; generated sections; and explicit course-matched student assignment. Faculty access is synchronized from Class -> Subject -> Teacher -> Student relationships, with Firestore Rules enforcing faculty grade permissions.


## v16 Academic Class Form Fix
- Class creation no longer depends on a pre-existing subject record.
- Subject dropdown is populated from the official course subject catalog.
- If an offering does not exist, the system automatically creates a unique subject code, conflict-free schedule, and room when the class is saved.
- Subject name, code, schedule, and room are read-only/generated fields.
- Existing subject offerings are reused when appropriate.
- Faculty class assignments continue to synchronize through `facultyAssignments` with Firestore `onSnapshot()` realtime listeners.


### v17 Faculty Realtime Class Architecture
Faculty class data is now read directly from Firestore `classes` using `where("teacherId", "==", currentTeacherId)` and `onSnapshot()`. The Admin class save writes the canonical class and, when a class changes, the compatibility `facultyAssignments` mirror in the same Firestore batch. Faculty pages do not depend on the mirror for class display.

## v23 Permission Fix

v23 fixes Faculty permission noise and grade writes by restricting Faculty collection reads, using a direct single-grade Firestore write, and making the canonical `classes.studentIds` relationship authoritative for grade authorization while retaining the student-document integrity check.
See `V23_PERMISSION_FIX.md`.
\nV25 note: Faculty grade save now resolves the actual Firestore student document ID before writing and logs the exact grade relationship for permission debugging.


## Phase 2
This build includes the adaptive Student Success Radar, explainable recommendations, Grade What-If planning tool, Faculty Class Performance Snapshot, and Admin Early Warning view. These features are advisory/read-only and are calculated from existing grades and attendance records. See ROADMAP.md for the updated roadmap.

## Faculty Custom Password Setup
See `FACULTY_CUSTOM_PASSWORD_SETUP_SETUP.md` for the one-time Firebase Authentication email-template configuration. The custom handler is `html/faculty-password-setup.html`.
