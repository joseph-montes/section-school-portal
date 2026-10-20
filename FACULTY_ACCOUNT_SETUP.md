# CEC Portal — 100% Free Faculty Account Setup

This version keeps the Faculty account flow on the Firebase Spark/free plan.

## How it works

1. Admin opens **Teachers → Add Teacher**.
2. Enter the faculty member's real email address.
3. Keep **Create Firebase Account & Send Setup Link Now** enabled.
4. Click **Create Teacher**.
5. The portal creates a real Firebase Authentication email/password account using a temporary credential that is never displayed or stored in Firestore.
6. Firebase immediately sends a secure password-reset/setup email to the faculty email address.
7. Faculty opens the secure Firebase link, creates their own password, and can then log in through the existing Faculty MFA flow.

## Free-plan requirement

No Cloud Functions, Cloud Run, Blaze upgrade, paid email provider, or paid API is required for this flow.

Firebase Authentication's password-reset email is the secure link delivery mechanism.

## Important limitation

The browser cannot safely retrieve the actual Firebase password-reset URL after `sendPasswordResetEmail()` and display it as a raw link. Firebase sends that secure link directly to the faculty email address.

If the email needs to be sent again, edit the Faculty record and click **Send New Secure Setup Link Now**.

## Password handling

The faculty password is created directly in Firebase Authentication. It is not saved in the `teachers` Firestore document.
