# CEC Portal — Database and Complete System Flow

## 1. Database layer

The portal uses **Cloud Firestore** as its persistent database. Firebase Authentication stores account credentials; passwords are not stored in Firestore.

### Main collections

```text
admins
userRoles
students
studentLookup
teachers
subjects
classes
enlistments
grades
attendance
materials
events
payments
announcements
adminNotifications
settings
adminSettings
```

## 2. Administrator flow

```text
Admin
 ↓
Login Form
 ↓
Firebase Authentication
 ↓
admins/{uid}
 ↓
Admin Dashboard
 ↓
CRUD operation
 ↓
js/core/database.js
 ↓
Cloud Firestore
 ↓
onSnapshot realtime listener
 ↓
Updated Admin UI
```

## 3. Student registration flow

```text
Administrator creates student
 ↓
students + studentLookup
 ↓
Student receives Student ID + registration code
 ↓
Registration page validates lookup/code/Gmail
 ↓
Firebase Authentication creates account
 ↓
students.authUid is linked
 ↓
userRoles/{uid} stores role=student and studentId
 ↓
Student can log in
```

## 4. Student academic-data flow

```text
Student Login
 ↓
Firebase Authentication
 ↓
userRoles/{uid}
 ↓
Student ID
 ↓
Firestore query using studentId
 ↓
grades / attendance / payments / enlistments
 ↓
Student page
```

## 5. Realtime flow

When an administrator changes a record:

```text
Admin action
 ↓
saveDB()
 ↓
Firestore batch commit
 ↓
Cloud Firestore document changes
 ↓
onSnapshot()
 ↓
Browser cache updated
 ↓
Current portal page refreshed
```

## 6. CRUD demonstration

**Create:** `db.students.push(...)` → `saveDB()` → Firestore `batch.set()`

**Read:** `fetchCollection()` / Firestore `get()` or `onSnapshot()`

**Update:** `Object.assign(record, data)` → `saveDB()` → Firestore `batch.set(..., {merge:true})`

**Delete:** filter the record from the local collection → `saveDB()` → Firestore `batch.delete()`

## 7. Presentation explanation

> "Our CEC Portal uses Firebase Authentication for secure user authentication and Cloud Firestore as the persistent database. The database.js file acts as the central data layer. It handles CRUD operations and realtime synchronization using Firestore onSnapshot listeners. Administrators can manage school records, while students can access records associated with their own Student ID. Firestore Security Rules enforce these access permissions."

## Verified Student Account Flow

The student account lifecycle is:

1. **Admin creates the student** in the Students module.
2. The admin must provide the student's Gmail address. The portal creates a `students/{studentId}` record and a protected registration lookup containing hashed registration credentials.
3. **Student Registration** checks Student ID, registration code, Gmail, password, and terms.
4. Firebase Authentication creates the student's Auth UID.
5. The student claims `studentLookup/{studentId}` with that UID.
6. Firestore Security Rules allow `userRoles/{uid}` to be created only when that lookup already belongs to the same UID.
7. The existing `students/{studentId}` record is linked to the Auth UID. The rules require the email to remain the same as the admin-created email.
8. Registration signs the user out deliberately. This prevents the registration page from accidentally entering the dashboard with a partially initialized session.
9. **Student Login** uses the registered email/password and resolves the Student ID through `studentLookup`.
10. The Auth UID is matched to the student record, the student role is loaded, and realtime Firestore listeners start.
11. The student can then access only their permitted dashboard data: grades, attendance, payments, and enlistments for their own Student ID.

### Registration failure behavior

If Firestore setup fails after Firebase Authentication creates an account, the portal signs the user out and does not start dashboard listeners. Because the browser cannot safely delete an Auth account without appropriate reauthentication/admin privileges, an orphaned test Auth account must be removed from Firebase Authentication by the administrator before retrying with the same email.


## Registration Recovery and Login Initialization

The registration flow is resilient to a partially completed first attempt. If Firebase Authentication and `studentLookup` were created before a later Firestore step failed, a retry with the same Student ID, registered Gmail, and original password signs into the existing Auth account and repairs `userRoles/{uid}` and `students/{studentId}`.

Student login also waits for Firebase to finish resolving the student's role and Firestore profile before navigating to `student-dashboard.html`. This prevents the dashboard from redirecting back to the login page because the asynchronous Auth state has not finished loading yet.
