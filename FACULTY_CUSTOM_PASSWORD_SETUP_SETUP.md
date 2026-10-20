# CEC Faculty Custom Password Setup

The portal now includes `html/faculty-password-setup.html`, a Firebase Authentication custom email action handler. It verifies the `mode=resetPassword` and `oobCode` parameters, uses `verifyPasswordResetCode()`, and saves the new password with `confirmPasswordReset()`.

## One-time Firebase Console configuration

The code cannot change the Firebase Console email-template setting from the browser. In Firebase Console:

1. Open project `portal-in-cec`.
2. Go to **Authentication**.
3. Open **Templates**.
4. Open the **Password reset** email template and choose **Customize action URL**.
5. Set the action URL to:

   `https://portal-in-cec.firebaseapp.com/html/faculty-password-setup.html`

6. Save the template.

`portal-in-cec.firebaseapp.com` is already an authorized domain in this project, so no Firestore Rules change is required and no new Firestore permission is needed.

## Important

The custom handler must be deployed to the same Firebase Hosting site before the email link is tested. If the portal is already deployed to Firebase Hosting, deploy the updated site so the new `html/faculty-password-setup.html` file is available at the URL above.

The same Firebase password-action mechanism is used for both first-time Faculty password creation and later password resets. The custom handler changes the user-facing experience to **Faculty Password Setup** for the email link.
