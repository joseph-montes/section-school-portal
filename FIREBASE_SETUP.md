# CEC Portal — Firebase Setup

This version keeps the existing HTML/CSS/JS page structure and replaces the localStorage authentication/database layer with Firebase Authentication + Cloud Firestore real-time listeners.

## 1. Create Firebase project
1. Open Firebase Console.
2. Create/select a project for CEC Portal.
3. Add a Web App (`</>`).
4. Copy the Web App configuration into `js/core/firebase-config.js`.
5. Do not paste a service-account JSON/private key into the frontend.

## 2. Enable Authentication
Firebase Console → Authentication → Sign-in method → enable **Email/Password**.

The student registration uses the student's real `@gmail.com` address. The admin creates the Student ID and Gmail address first; the student then uses the generated registration code to create the Firebase Authentication account. Passwords are never stored in Firestore or in the portal's localStorage database.

## 3. Create the first administrator
1. In Authentication → Users, create the administrator with an email and password.
2. Copy the administrator's Firebase UID.
3. In Firestore, create collection `admins`.
4. Create a document whose document ID is that UID.
5. Add:
   - `role`: `admin`
   - `email`: administrator email
   - `name`: Administrator

The admin login screen now uses administrator email + password. The old prototype OTP is not used because a client-side OTP is not a secure second factor.

## 4. Publish Firestore rules
Copy `firestore.rules` into Firestore → Rules and publish.

The rules separate admin and student access. The `studentLookup` collection is intentionally limited to the minimum mapping needed for Student ID login/registration (Student ID → registered email/registration hashes); do not place passwords or private profile data there. Students can read their own grades, attendance, payments and enlistments; administrators can manage school records.

## 5. Import old prototype data (optional)
The project previously stored data under `cecPortalDB_v3` in localStorage.

After signing in as an authorized Firebase administrator, open:

`firebase-migrate.html`

and click **IMPORT OLD PORTAL DATA**.

Student passwords are deliberately not imported. Imported students are marked **Not Registered** and must complete Firebase registration again. This avoids carrying plaintext prototype passwords into the new system.

If no old localStorage data exists, simply add records from the Admin Portal.

## 6. Real-time behavior
The portal uses Firestore `onSnapshot()` listeners. When an administrator adds/edits/deletes a record, connected clients receive the changed Firestore data and the current page is refreshed automatically without a browser reload.

Examples:
- Admin publishes an announcement → student announcement page updates.
- Admin changes a grade → the student's grade page updates.
- Admin records attendance → student's attendance updates.
- Admin adds a calendar event → student's calendar updates.
- Admin changes student status → admin student list updates.

## 7. Production security checklist
- Enable Firebase App Check.
- Require verified Gmail addresses if the school can provide that capability.
- Enable MFA for administrator accounts where available.
- Keep Firestore rules restrictive; never use `allow read, write: if true`.
- Never expose Firebase service-account credentials in frontend files.
- Consider a Cloud Function for sensitive server-side workflows such as privileged account provisioning.

## Faculty Syllabi & Materials Storage

The Faculty **My Classes** page can upload syllabi and learning materials for an assigned class. Students assigned to that class see those files under **Syllabi & Materials** and can download them.

After enabling Firebase Storage for the project, deploy both rule files:

- `firestore.rules` — protects `/materials/{id}` metadata by faculty/class/student relationship.
- `storage.rules` — protects `courseMaterials/{classId}/{materialId}/{fileName}` files, limits uploads to 25 MB, and restricts access to the assigned faculty or students in that class.

The existing `storageBucket` in `js/core/firebase-config.js` is already used by the upload flow.
