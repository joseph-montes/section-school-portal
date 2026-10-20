function escapeHTML(v){
    return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function money(v){ return "₱" + Number(v || 0).toLocaleString("en-PH",{minimumFractionDigits:2}); }
function formatDate(v){
    if(!v) return "—";
    return new Date(v + (String(v).length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});
}
function formatDateTime(v){
    if(!v) return "—";
    return new Date(v).toLocaleString("en-PH",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
}
function generateRegistrationCode(){
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;
    do {
        code = "CEC-" + Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
    } while (db.students.some(s => s.registrationCode === code));
    return code;
}
function syncStudentRegistrationStatus(){
    let changed = false;
    db.students.forEach(student => {
        if (!student.password) {
            if (!student.registrationCode) {
                student.registrationCode = generateRegistrationCode();
                changed = true;
            }
            if (student.status !== "Not Registered") {
                student.status = "Not Registered";
                changed = true;
            }
        } else if (student.status !== "Inactive" && student.status !== "Active") {
            student.status = "Active";
            changed = true;
        }
    });
    if (changed) saveDB();
}
syncStudentRegistrationStatus();

function currentStudent(){
    const id = localStorage.getItem(SESSION_KEY);
    return db.students.find(s => s.id === id) || null;
}
function setStudentSession(id){ localStorage.setItem(SESSION_KEY,id); }
function showPage(id){
    $$(".page").forEach(p=>p.classList.add("hidden"));
    $("#" + id).classList.remove("hidden");
    window.scrollTo({top:0,behavior:"instant"});
}
function toast(message,type="success"){
    const el=$("#toast");
    el.textContent=message;
    el.className="toast show " + type;
    clearTimeout(window.toastTimer);
    window.toastTimer=setTimeout(()=>el.className="toast",3200);
}
function openModal(html, onOpen){
    const root=$("#modalRoot");
    root.innerHTML=`<div class="modal dynamic-modal"><div class="modal-card">${html}</div></div>`;
    const modal=root.querySelector(".modal");
    modal.addEventListener("click",e=>{if(e.target===modal) root.innerHTML=""});
    root.querySelectorAll("[data-close-modal]").forEach(b=>b.onclick=()=>root.innerHTML="");
    if(onOpen) onOpen(root);
}
function closeDynamic(){ $("#modalRoot").innerHTML=""; }

function avatarHTML(student, cls="avatar"){
    return student?.avatar ? `<img class="${cls}" src="${escapeHTML(student.avatar)}" alt="Profile picture">` : `<div class="${cls} avatar-fallback">${escapeHTML((student?.name||"Student").split(" ").map(x=>x[0]).slice(0,2).join(""))}</div>`;
}

/* ---------------- AUTH ---------------- */

$("#openLogin")?.addEventListener("click", () => {
    showPage("authPage");
    showLoginCard();
});

$("#studentPortalBtn")?.addEventListener("click", () => {
    showPage("authPage");
    showLoginCard();
});


$("#exploreBtn")?.addEventListener("click", () => {
    document.querySelector("#program")?.scrollIntoView({ behavior: "smooth" });
});

$$('[data-scroll]').forEach(button => {
    button.onclick = () => {
        document.getElementById(button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
    };
});

// Public landing navigation: transparent at the top, glass/dark while scrolling.
if (document.body.classList.contains("public-index-page")) {
    const publicHeader = document.querySelector(".public-header");
    const updatePublicHeader = () => {
        publicHeader?.classList.toggle("scrolled", window.scrollY > 20);
    };
    updatePublicHeader();
    window.addEventListener("scroll", updatePublicHeader, { passive: true });
}


function validateStrongPassword(password){
    const errors = [];
    if (password.length < 8) errors.push("at least 8 characters");
    if (!/[A-Z]/.test(password)) errors.push("one uppercase letter");
    if (!/[a-z]/.test(password)) errors.push("one lowercase letter");
    if (!/[0-9]/.test(password)) errors.push("one number");
    if (!/[^A-Za-z0-9]/.test(password)) errors.push("one symbol");
    return errors;
}

function showLoginCard() {
    $("#loginCard")?.classList.remove("hidden");
    $("#registerCard")?.classList.add("hidden");
}

async function waitForStudentAuthorization(timeoutMs=10000){
    const started=Date.now();
    while(Date.now()-started < timeoutMs){
        if(window.cecFirebase?.role === "student" && currentStudent()) return true;
        if(window.cecFirebase?.role === "admin") return false;
        if(firebase?.auth && !firebase.auth().currentUser) return false;
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    return window.cecFirebase?.role === "student" && Boolean(currentStudent());
}

async function waitForFacultyAuthorization(timeoutMs=10000){
    const started=Date.now();
    while(Date.now()-started < timeoutMs){
        if(window.cecFirebase?.role === "faculty" && currentFaculty()) return true;
        if(window.cecFirebase?.role === "admin" || window.cecFirebase?.role === "student") return false;
        if(firebase?.auth && !firebase.auth().currentUser) return false;
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    return window.cecFirebase?.role === "faculty" && Boolean(currentFaculty());
}

$("#showRegister")?.addEventListener("click", () => {
    $("#loginCard")?.classList.add("hidden");
    $("#registerCard")?.classList.remove("hidden");
});

$("#showLogin")?.addEventListener("click", showLoginCard);

// Password visibility controls on login, registration, and admin forms.
document.querySelectorAll(".eye[data-target]").forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.target);
        if (!input) return;
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "◉" : "◌";
        button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        button.setAttribute("title", showing ? "Show password" : "Hide password");
    });
});

// Live password-strength guidance on the student registration form.
const regPassword = $("#regPassword");
const regPasswordRequirements = $("#regPasswordRequirements");
function updateRegistrationPasswordRequirements(){
    if(!regPasswordRequirements || !regPassword) return;
    const value = regPassword.value;
    const checks = [
        [value.length >= 8, "At least 8 characters"],
        [/[A-Z]/.test(value), "Uppercase letter (A-Z)"],
        [/[a-z]/.test(value), "Lowercase letter (a-z)"],
        [/[0-9]/.test(value), "Number (0-9)"],
        [/[^A-Za-z0-9]/.test(value), "Symbol (e.g. !@#$%)"]
    ];
    regPasswordRequirements.innerHTML = checks.map(([ok,label]) =>
        `<li class="${ok ? "valid" : "invalid"}"><span>${ok ? "✓" : "○"}</span>${label}</li>`
    ).join("");
}
regPassword?.addEventListener("input", updateRegistrationPasswordRequirements);
updateRegistrationPasswordRequirements();

$("#loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    try { await cecFirebaseReady; } catch(e){ toast("Firebase is not configured. Check js/core/firebase-config.js.","error"); return; }

    const id = $("#loginId").value.trim();
    const password = $("#loginPassword").value;
    if(!id || !password){ toast("Enter your Student ID and password.","error"); return; }

    try {
        const lookup = await firebase.firestore().collection("studentLookup").doc(id).get();
        if(!lookup.exists){
            toast("Student ID was not found. Ask the administrator to create your account.","error");
            return;
        }
        const data=lookup.data();
        if(!data.registered || !data.email){
            toast("This Student ID is not registered yet. Please register first before logging in.","error");
            return;
        }
        await cecFirestore.signIn(data.email,password);
        localStorage.removeItem(ADMIN_SESSION_KEY);
        const authorized = await waitForStudentAuthorization();
        if(!authorized){
            try{ await cecFirestore.signOut(); }catch(_){}
            toast("Your student account could not be loaded. Please contact the administrator and check the Firebase Security Rules.","error");
            return;
        }
        await window.cecAuditLog?.("login","authentication",window.cecFirebase.uid,{method:"password",label:"Student login"});
        toast("Login successful.");
        location.href="student-dashboard.html";
    } catch(error){
        console.error("Registration failed", error.cecRegistrationStep ? "at step: " + error.cecRegistrationStep : "", error);
        const message = error?.code === "auth/too-many-requests" ? "Too many attempts. Please wait and try again." : "Incorrect Student ID or password.";
        toast(message,"error");
    }
});


let pendingFaculty2FA = null;
window.cecFaculty2FAPending = false;
function showFacultyOTP(){
    // The password setup invitation is only part of the faculty login/setup view.
    // Hide it while MFA verification is displayed so the verification screen
    // remains a single, focused card.
    $("#facultyPasswordInviteCard")?.classList.add("hidden");
    $("#facultyPasswordInviteCard")?.setAttribute("aria-hidden","true");
    $("#facultyAuthPage")?.classList.add("hidden");
    $("#facultyAuthPage")?.setAttribute("aria-hidden","true");
    $("#facultyOtpPage")?.classList.remove("hidden");
    $("#facultyOtpPage")?.setAttribute("aria-hidden","false");
    $("#facultyOtpInput")?.focus();
}
function showFacultyLogin(){
    $("#facultyOtpPage")?.classList.add("hidden");
    $("#facultyOtpPage")?.setAttribute("aria-hidden","true");
    $("#facultyAuthPage")?.classList.remove("hidden");
    $("#facultyAuthPage")?.setAttribute("aria-hidden","false");
}
function generateFacultyOTP(){ return String(Math.floor(100000 + Math.random()*900000)); }

$("#facultyLoginForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    try { await cecFirebaseReady; } catch(e){ toast("Firebase is not configured. Check js/core/firebase-config.js.","error"); return; }
    const email=$("#facultyEmail").value.trim().toLowerCase();
    const password=$("#facultyPassword").value;
    if(!email || !password){ toast("Enter your faculty email and password.","error"); return; }
    const button=event.submitter || $("#facultyLoginForm button.primary-btn");
    if(button){button.disabled=true;button.textContent="VERIFYING...";}
    try{
        window.cecFaculty2FAPending = true;
        const credential=await cecFirestore.signIn(email,password);
        const authUid=credential.user.uid;
        const mapping=await firebase.firestore().collection("facultyRoles").doc(authUid).get();
        if(!mapping.exists || mapping.data().role!=="faculty"){
            await cecFirestore.signOut();
            toast("This Firebase account is not authorized as a CEC faculty member.","error");
            return;
        }
        const teacherId=String(mapping.data().teacherId||"");
        const teacherSnap=teacherId?await firebase.firestore().collection("teachers").doc(teacherId).get():null;
        const teacher=teacherSnap?.exists?teacherSnap.data():null;
        if(!teacher || String(teacher.email||"").trim().toLowerCase()!==email || teacher.status!=="Active"){
            await cecFirestore.signOut();
            toast("Your faculty account is inactive or not properly linked. Please contact the administrator.","error");
            return;
        }
        // Demo 2FA: generate a one-time code locally. In production this code
        // should be delivered to the faculty member's verified school email/SMS.
        const code=generateFacultyOTP();
        pendingFaculty2FA={email,password,code,expiresAt:Date.now()+5*60*1000};
        // Show the verification screen immediately so the demo code is visible
        // before the temporary Firebase sign-out/auth-state refresh completes.
        $("#facultyOtpDemoCode").textContent=code;
        $("#facultyOtpEmail").textContent=email;
        const digits=$("#facultyOtpDigits");
        if(digits){
            digits.innerHTML=Array.from(code).map(d=>`<span>${escapeHTML(d)}</span>`).join("");
        }
        showFacultyOTP();
        toast("Verification code generated. Enter the code shown on screen to continue.");
        try{ await cecFirestore.signOut(); }catch(signOutError){
            console.warn("Temporary faculty sign-out after OTP generation failed",signOutError);
        }
    }catch(error){
        window.cecFaculty2FAPending = false;
        console.error(error);
        toast(error?.code==="auth/too-many-requests"?"Too many attempts. Please wait and try again later.":"Invalid faculty email or password.","error");
    }finally{
        if(button){button.disabled=false;button.textContent="LOGIN AS FACULTY";}
    }
});

$("#facultyOtpForm")?.addEventListener("submit", async event=>{
    event.preventDefault();
    const entered=$("#facultyOtpInput")?.value.trim();
    if(!pendingFaculty2FA){toast("Your verification session expired. Please log in again.","error");showFacultyLogin();return;}
    if(Date.now()>pendingFaculty2FA.expiresAt){pendingFaculty2FA=null;toast("Verification code expired. Please log in again.","error");showFacultyLogin();return;}
    if(entered!==pendingFaculty2FA.code){toast("Incorrect verification code.","error");return;}
    const {email,password}=pendingFaculty2FA;
    window.cecFaculty2FAPending = false;
    const button=event.submitter || $("#facultyOtpForm button.primary-btn");
    if(button){button.disabled=true;button.textContent="SIGNING IN...";}
    try{
        await cecFirestore.signIn(email,password);
        sessionStorage.setItem("cecFaculty2FAVerified","true");
        pendingFaculty2FA=null;
        await window.cecAuditLog?.("login","authentication",window.cecFirebase.uid,{method:"password+mfa-demo",label:"Faculty login"});
        toast("Faculty login and email verification successful.");
        setTimeout(()=>location.href="faculty/faculty-dashboard.html",250);
    }catch(error){
        console.error(error);toast("Verification succeeded, but faculty sign-in could not be completed. Please try again.","error");
    }finally{if(button){button.disabled=false;button.textContent="VERIFY & CONTINUE";}}
});

$("#facultyOtpBack")?.addEventListener("click",()=>{pendingFaculty2FA=null;showFacultyLogin();});

function showFacultyPasswordSetup(show=true){
    const card=$("#facultyPasswordInviteCard");
    if(!card) return;
    card.classList.toggle("hidden",!show);
    card.setAttribute("aria-hidden",show?"false":"true");
    if(show){
        $("#facultyPasswordSetupStatus")?.replaceChildren();
        const req=$("#facultyPasswordSetupRequestForm");
        const set=$("#facultyPasswordSetupForm");
        const hasCode=new URLSearchParams(location.search).has("oobCode");
        req?.classList.toggle("hidden",hasCode);
        set?.classList.toggle("hidden",!hasCode);
        $(hasCode?"#facultySetupPassword":"#facultySetupEmail")?.focus();
    }
}

$("#facultyPasswordSetupRequestForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const email=$("#facultySetupEmail")?.value.trim().toLowerCase();
    const status=$("#facultyPasswordSetupStatus");
    if(!email){if(status)status.textContent="Enter your faculty email.";return;}
    const button=event.submitter; if(button)button.disabled=true;
    try{
        await cecFirestore.passwordReset(email,"faculty");
        if(status)status.textContent="A secure password creation link has been sent. Check your faculty email and open the link to create your password.";
    }catch(error){
        console.error("Faculty password setup email failed:",error);
        if(status)status.textContent=error?.code==="auth/user-not-found"?"No faculty account was found for that email.":"Unable to send the password setup link. Please check the email and try again.";
    }finally{if(button)button.disabled=false;}
});

async function handleFacultyPasswordActionCode(){
    const params=new URLSearchParams(location.search);
    const mode=params.get("mode"), code=params.get("oobCode");
    if(mode!=="resetPassword" || !code) return false;
    const card=$("#facultyPasswordInviteCard");
    if(!card) return false;
    showFacultyPasswordSetup(true);
    try{
        const email=await firebase.auth().verifyPasswordResetCode(code);
        $("#facultySetupEmail")?.setAttribute("value",email);
        $("#facultyPasswordSetupStatus")?.replaceChildren();
    }catch(error){
        console.error("Invalid faculty password reset link:",error);
        const status=$("#facultyPasswordSetupStatus");
        if(status)status.textContent="This password creation link is invalid or has expired. Please request a new password creation link.";
        $("#facultyPasswordSetupForm")?.classList.add("hidden");
        $("#facultyPasswordSetupRequestForm")?.classList.remove("hidden");
        return true;
    }
    return true;
}

$("#facultyPasswordSetupForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const password=$("#facultySetupPassword")?.value||"";
    const confirm=$("#facultyPasswordSetupConfirm")?.value||"";
    const status=$("#facultyPasswordSetupStatus");
    const code=new URLSearchParams(location.search).get("oobCode");
    const errors=validateStrongPassword(password);
    if(errors.length){if(status)status.textContent="Password must contain: "+errors.join(", ")+".";return;}
    if(password!==confirm){if(status)status.textContent="Passwords do not match.";return;}
    if(!code){if(status)status.textContent="Password creation link is missing or invalid.";return;}
    const button=event.submitter;if(button)button.disabled=true;
    try{
        await firebase.auth().confirmPasswordReset(code,password);
        if(status)status.textContent="Password created successfully. You can now return to Faculty Login and sign in.";
        $("#facultySetupPassword").value="";$("#facultyPasswordSetupConfirm").value="";
        const clean=new URL(location.href);clean.searchParams.delete("mode");clean.searchParams.delete("oobCode");clean.searchParams.delete("apiKey");clean.searchParams.delete("continueUrl");
        history.replaceState({},"",clean.pathname+clean.search+clean.hash);
    }catch(error){
        console.error("Faculty password creation failed:",error);
        if(status)status.textContent=error?.code==="auth/expired-action-code"?"This password creation link has expired. Request a new password creation link.":"Unable to create the password. Please request a new password creation link.";
    }finally{if(button)button.disabled=false;}
});

handleFacultyPasswordActionCode();

$("#facultyPasswordSetupBack")?.addEventListener("click",()=>showFacultyPasswordSetup(false));

// Faculty "Forgot Password / Set Password" button
$("#facultyForgotBtn")?.addEventListener("click", () => {
    $("#facultyAuthPage")?.classList.add("hidden");
    $("#facultyPasswordInviteCard")?.classList.remove("hidden");
    $("#facultyPasswordInviteCard")?.setAttribute("aria-hidden","false");
    $("#facultySetupEmail")?.focus();
});

$("#registerForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    try { await cecFirebaseReady; } catch(e){ toast("Firebase is not configured. Check js/core/firebase-config.js.","error"); return; }

    const id = $("#regId").value.trim();
    const registrationCode = $("#regCode").value.trim().toUpperCase();
    const email = $("#regEmail").value.trim().toLowerCase();
    const password = $("#regPassword").value;
    const confirm = $("#regConfirm").value;

    try {
        const lookupRef=firebase.firestore().collection("studentLookup").doc(id);
        const lookupSnap=await lookupRef.get();
        if(!lookupSnap.exists){ toast("This Student ID has not been created by the administrator.","error"); return; }
        const lookup=lookupSnap.data();
        const alreadyLinked = Boolean(lookup.registered && lookup.authUid && lookup.email && String(lookup.email).toLowerCase() === email);
        if(lookup.registered && !alreadyLinked){ toast("This Student ID is already registered. Please log in.","error"); return; }
        if(!email.endsWith("@gmail.com")){ toast("Please enter your real Gmail address ending in @gmail.com.","error"); return; }
        const passwordErrors = validateStrongPassword(password);
        if(passwordErrors.length){
            toast("Password must contain: " + passwordErrors.join(", ") + ".","error");
            return;
        }
        if(password!==confirm){ toast("Passwords do not match.","error"); return; }
        if(!$("#termsCheckbox").checked){ toast("Please agree to the Terms and Conditions.","error"); return; }
        if(!lookup.registrationCodeHash || await cecFirestore.sha256Hex(registrationCode) !== lookup.registrationCodeHash){
            toast("Invalid registration code. Please use the code provided by the administrator.","error"); return;
        }
        if(lookup.emailHash && await cecFirestore.sha256Hex(email) !== lookup.emailHash){
            toast("That is not the registered Gmail address for this Student ID.","error"); return;
        }

        window.cecRegistrationInProgress = true;
        let credential = null;
        try {
            // If an earlier registration attempt created the Auth account and
            // claimed studentLookup before failing, reuse that account and
            // finish the missing Firestore links instead of creating a second
            // account or permanently leaving the student stuck as registered.
            if(alreadyLinked){
                credential = await cecFirestore.signIn(email,password);
            }else{
                credential = await cecFirestore.createStudentAuth(email,password);
            }
            const authUid = credential.user.uid;

            // 1) Claim/repair the pre-created studentLookup record.
            // Keep this operation separate so a console error identifies the exact step.
            try {
                if(!alreadyLinked){
                    await lookupRef.set({
                        registered:true,
                        email,
                        authUid
                    },{merge:true});
                }
            } catch(e) {
                e.cecRegistrationStep = "studentLookup";
                throw e;
            }

            // 2) Create/repair the student's role.
            try {
                await firebase.firestore().collection("userRoles").doc(authUid).set({
                    role:"student",
                    studentId:id
                });
            } catch(e) {
                e.cecRegistrationStep = "userRoles";
                throw e;
            }

            // 3) Link/repair the admin-created student record.
            try {
                const studentRef=firebase.firestore().collection("students").doc(id);
                await studentRef.set({
                    email,
                    authUid,
                    status:"Active"
                },{merge:true});
            } catch(e) {
                e.cecRegistrationStep = "students";
                throw e;
            }

            // 4) Registration is complete. Sign out so the student must perform
            // a normal login and the normal dashboard authorization flow runs.
            await cecFirestore.signOut();
        } catch(registrationError) {
            // Do not start dashboard listeners if registration is incomplete.
            try { await cecFirestore.signOut(); } catch(_) {}
            throw registrationError;
        } finally {
            window.cecRegistrationInProgress = false;
        }

        toast("Account created successfully. You may now log in.");
        showLoginCard();
        $("#loginId").value=id;
    } catch(error){
        console.error(error);
        const messages={
            "auth/email-already-in-use":"That Gmail address already has a Firebase account.",
            "auth/invalid-email":"Please enter a valid Gmail address.",
            "auth/weak-password":"Password must be at least 6 characters.",
            "auth/wrong-password":"The password does not match the partially registered account. Use the original password or reset the account."
        };
        toast(messages[error?.code] || "Registration could not be completed.","error");
    }
});

/* ---------------- FIREBASE PASSWORD RESET ---------------- */
function maskResetEmail(email){
    const value=String(email||"").trim();
    const at=value.indexOf("@");
    if(at<=0) return "your registered Gmail";
    const local=value.slice(0,at);
    const domain=value.slice(at+1);
    if(local.length<=2) return local[0]+"***@"+domain;
    return local[0]+"***"+local.slice(-1)+"@"+domain;
}

$("#forgotBtn")?.addEventListener("click", async () => {
    openModal(`
        <div class="modal-head"><h2>Reset Student Password</h2><button data-close-modal>×</button></div>
        <div class="modal-body">
            <p>Enter your Student ID. We will use the Gmail address registered by the administrator for this account.</p>
            <label class="reset-field">Student ID
                <input id="resetStudentId" autocomplete="username" placeholder="Enter your Student ID" required>
            </label>
            <div id="resetEmailPreview" class="reset-security-note hidden"></div>
            <div class="reset-security-note">For security, the portal does not display the full registered Gmail address.</div>
        </div>
        <div class="modal-foot"><button class="primary-btn" id="sendResetEmail">SEND RESET EMAIL</button></div>
    `, root => {
        const button=root.querySelector("#sendResetEmail");
        const input=root.querySelector("#resetStudentId");
        const preview=root.querySelector("#resetEmailPreview");

        button.onclick = async () => {
            const studentId=input.value.trim();
            if(!studentId){ toast("Please enter your Student ID.","error"); input.focus(); return; }

            button.disabled=true;
            button.textContent="CHECKING...";
            try{
                const lookupDoc=await firebase.firestore().collection("studentLookup").doc(studentId).get();
                if(!lookupDoc.exists){
                    toast("Student ID was not found. Please check your Student ID.","error");
                    return;
                }

                const lookup=lookupDoc.data()||{};
                const email=String(lookup.email||"").trim().toLowerCase();
                if(!lookup.registered || !email || !email.endsWith("@gmail.com")){
                    toast("This student account has not completed registration yet.","error");
                    return;
                }

                preview.textContent=`Reset link will be sent to ${maskResetEmail(email)}.`;
                preview.classList.remove("hidden");
                button.textContent="SENDING...";

                await cecFirestore.passwordReset(email);
                closeDynamic();
                toast("Password reset email sent. Check your Gmail inbox and follow the reset link.");
            }catch(error){
                console.error("Password reset failed:",error);
                const messages={
                    "auth/invalid-email":"The registered Gmail address is invalid.",
                    "auth/user-not-found":"No Firebase account was found for this student.",
                    "auth/too-many-requests":"Too many reset attempts. Please wait and try again later."
                };
                toast(messages[error?.code]||"Unable to send the password reset email. Please try again.","error");
            }finally{
                button.disabled=false;
                if(button.isConnected) button.textContent="SEND RESET EMAIL";
            }
        };
    });
});

/* ---------------- ADMIN FIREBASE AUTH + DEMO MFA ---------------- */
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCKOUT_MS = 60 * 60 * 1000;
const ADMIN_LOGIN_STORAGE_KEY = "cecAdminLoginSecurity";
let pendingAdmin2FA = null;
let adminLockoutTimer = null;

function readAdminLoginSecurity(){
    try{
        const value=JSON.parse(localStorage.getItem(ADMIN_LOGIN_STORAGE_KEY) || "{}");
        return value && typeof value==="object" ? value : {};
    }catch(_){ return {}; }
}

function writeAdminLoginSecurity(value){
    localStorage.setItem(ADMIN_LOGIN_STORAGE_KEY, JSON.stringify(value || {}));
}

function getAdminLockout(email){
    const security=readAdminLoginSecurity();
    const record=security[String(email||"").trim().toLowerCase()] || {};
    const until=Number(record.lockoutUntil||0);
    if(until && until > Date.now()) return {attempts:Number(record.attempts||ADMIN_LOGIN_MAX_ATTEMPTS), lockoutUntil:until};
    if(until && until <= Date.now()){
        delete security[String(email||"").trim().toLowerCase()];
        writeAdminLoginSecurity(security);
    }
    return {attempts:Number(record.attempts||0), lockoutUntil:0};
}

function clearAdminLoginAttempts(email){
    const security=readAdminLoginSecurity();
    delete security[String(email||"").trim().toLowerCase()];
    writeAdminLoginSecurity(security);
}

function recordAdminLoginFailure(email){
    const key=String(email||"").trim().toLowerCase();
    const security=readAdminLoginSecurity();
    const current=security[key] || {};
    const attempts=Number(current.attempts||0)+1;
    const record={attempts, lockoutUntil:0};
    if(attempts >= ADMIN_LOGIN_MAX_ATTEMPTS) record.lockoutUntil=Date.now()+ADMIN_LOGIN_LOCKOUT_MS;
    security[key]=record;
    writeAdminLoginSecurity(security);
    return record;
}

function formatAdminLockoutRemaining(ms){
    const totalSeconds=Math.max(0,Math.ceil(ms/1000));
    const hours=Math.floor(totalSeconds/3600);
    const minutes=Math.floor((totalSeconds%3600)/60);
    const seconds=totalSeconds%60;
    if(hours>0) return `${hours}h ${String(minutes).padStart(2,"0")}m ${String(seconds).padStart(2,"0")}s`;
    return `${minutes}m ${String(seconds).padStart(2,"0")}s`;
}

function renderAdminLockout(email){
    const notice=$("#adminLockoutNotice");
    const button=$("#adminLockoutButton");
    if(!notice || !button) return;
    const state=getAdminLockout(email);
    if(state.lockoutUntil > Date.now()){
        notice.classList.remove("hidden");
        button.disabled=true;
        button.textContent=`LOGIN AVAILABLE IN ${formatAdminLockoutRemaining(state.lockoutUntil-Date.now())}`;
        clearInterval(adminLockoutTimer);
        adminLockoutTimer=setInterval(()=>{
            const fresh=getAdminLockout(email);
            if(fresh.lockoutUntil > Date.now()){
                button.textContent=`LOGIN AVAILABLE IN ${formatAdminLockoutRemaining(fresh.lockoutUntil-Date.now())}`;
            }else{
                clearInterval(adminLockoutTimer);
                notice.classList.add("hidden");
                button.disabled=false;
                button.textContent="LOGIN AS ADMIN";
            }
        },1000);
    }else{
        clearInterval(adminLockoutTimer);
        notice.classList.add("hidden");
        button.disabled=false;
    }
}

function showAdminLoginCard(){
    $("#adminOtpPage")?.classList.add("hidden");
    $("#adminOtpPage")?.setAttribute("aria-hidden","true");
    $("#adminAuthPage")?.classList.remove("hidden");
    $("#adminAuthPage")?.setAttribute("aria-hidden","false");
    renderAdminLockout($("#adminUsername")?.value || "");
}

function showAdminOTP(){
    $("#adminAuthPage")?.classList.add("hidden");
    $("#adminAuthPage")?.setAttribute("aria-hidden","true");
    $("#adminOtpPage")?.classList.remove("hidden");
    $("#adminOtpPage")?.setAttribute("aria-hidden","false");

    // Demo MFA: show the exact six-digit code that was generated for this login.
    const code=String(pendingAdmin2FA?.code || "").padEnd(6,"-").slice(0,6);
    const digits=$("#adminOtpDigits");
    if(digits){
        digits.innerHTML=Array.from(code).map(d=>`<span>${escapeHTML(d)}</span>`).join("");
    }
    const codeText=$("#adminOtpDemoCode");
    if(codeText) codeText.textContent=code;

    $("#adminOtpInput").value="";
    $("#adminOtpInput").focus();
}

function generateAdminOTP(){
    return String(Math.floor(100000 + Math.random()*900000));
}

$("#adminUsername")?.addEventListener("input", event => renderAdminLockout(event.target.value));

$("#adminLoginForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    try { await cecFirebaseReady; } catch(e){ toast("Firebase is not configured. Check js/core/firebase-config.js.","error"); return; }

    const email=$("#adminUsername").value.trim().toLowerCase();
    const password=$("#adminPassword").value;
    if(!email || !password){ toast("Enter the administrator email and password.","error"); return; }

    const lockout=getAdminLockout(email);
    if(lockout.lockoutUntil > Date.now()){
        renderAdminLockout(email);
        toast("Admin login is temporarily locked after 5 failed attempts.","error");
        return;
    }

    const button=event.submitter || $("#adminLoginForm button.primary-btn");
    if(button){ button.disabled=true; button.textContent="VERIFYING..."; }

    try{
        // Hold role/session hydration until the prototype MFA code is verified.
        window.cecAdmin2FAPending=true;
        const credential=await cecFirestore.signIn(email,password);
        const adminSnap=await firebase.firestore().collection("admins").doc(credential.user.uid).get();

        if(!adminSnap.exists || adminSnap.data().role!=="admin"){
            const failure=recordAdminLoginFailure(email);
            window.cecAdmin2FAPending=false;
            await cecFirestore.signOut();
            if(failure.lockoutUntil > Date.now()){
                renderAdminLockout(email);
                toast("5 failed attempts reached. Admin login is locked for 1 hour.","error");
            }else{
                toast(`Invalid administrator email or password. ${ADMIN_LOGIN_MAX_ATTEMPTS-failure.attempts} attempt${ADMIN_LOGIN_MAX_ATTEMPTS-failure.attempts===1?"":"s"} remaining.`,"error");
            }
            return;
        }

        // Password is correct. The demo second factor is intentionally shown
        // on-screen; production should deliver it through verified email/SMS.
        clearAdminLoginAttempts(email);
        pendingAdmin2FA={
            email,
            password,
            uid:credential.user.uid,
            code:generateAdminOTP(),
            expiresAt:Date.now()+5*60*1000
        };
        showAdminOTP();
    }catch(error){
        console.error("Admin login failed",error);
        window.cecAdmin2FAPending=false;
        try{ await cecFirestore.signOut(); }catch(_){}
        const failure=recordAdminLoginFailure(email);
        if(failure.lockoutUntil > Date.now()){
            renderAdminLockout(email);
            toast("5 failed attempts reached. Admin login is locked for 1 hour.","error");
        }else{
            const remaining=ADMIN_LOGIN_MAX_ATTEMPTS-failure.attempts;
            toast(error?.code==="auth/too-many-requests"
                ? `Too many attempts. ${remaining>0 ? remaining+" local attempt"+(remaining===1?"":"s")+" remaining." : "Login is temporarily locked."}`
                : `Invalid administrator email or password. ${remaining} attempt${remaining===1?"":"s"} remaining.`, "error");
        }
    }finally{
        if(button?.isConnected && !pendingAdmin2FA){
            button.disabled=false;
            button.textContent="LOGIN AS ADMIN";
        }
    }
});

$("#adminOtpForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    if(!pendingAdmin2FA){
        showAdminLoginCard();
        toast("Your verification session has expired. Please sign in again.","error");
        return;
    }
    if(Date.now() > pendingAdmin2FA.expiresAt){
        pendingAdmin2FA=null;
        window.cecAdmin2FAPending=false;
        try{ await cecFirestore.signOut(); }catch(_){}
        showAdminLoginCard();
        toast("Verification code expired. Please sign in again.","error");
        return;
    }

    const entered=$("#adminOtpInput").value.trim();
    if(entered !== pendingAdmin2FA.code){
        toast("Incorrect verification code. Please try again.","error");
        $("#adminOtpInput").select();
        return;
    }

    const credentials={...pendingAdmin2FA};
    pendingAdmin2FA=null;
    window.cecAdmin2FAPending=false;

    try{
        // Re-authenticate after MFA so the normal Firebase role initialization
        // runs exactly as it did before this MFA step was added.
        await cecFirestore.signOut();
        await cecFirestore.signIn(credentials.email,credentials.password);

        const started=Date.now();
        while(Date.now()-started < 10000){
            if(window.cecFirebase?.role==="admin" && window.cecFirebase?.uid===credentials.uid) break;
            await new Promise(resolve=>setTimeout(resolve,100));
        }

        if(window.cecFirebase?.role!=="admin"){
            try{ await cecFirestore.signOut(); }catch(_){}
            toast("Administrator authorization could not be completed. Please try again.","error");
            showAdminLoginCard();
            return;
        }

        localStorage.setItem(ADMIN_SESSION_KEY,credentials.uid);
        localStorage.removeItem(SESSION_KEY);
        await window.cecAuditLog?.("login","authentication",credentials.uid,{method:"password+mfa-demo",label:"Administrator login"});
        toast("Administrator login successful.");
        location.href="admin/dashboard.html";
    }catch(error){
        console.error("Admin MFA completion failed",error);
        try{ await cecFirestore.signOut(); }catch(_){}
        toast("Administrator verification could not be completed. Please try again.","error");
        showAdminLoginCard();
    }
});

$("#backToAdminLogin")?.addEventListener("click", async ()=>{
    pendingAdmin2FA=null;
    window.cecAdmin2FAPending=false;
    try{ await cecFirestore.signOut(); }catch(_){}
    showAdminLoginCard();
});

$("#adminLockoutButton")?.addEventListener("click", event=>{
    const email=$("#adminUsername")?.value.trim().toLowerCase();
    const state=getAdminLockout(email);
    if(state.lockoutUntil > Date.now()){
        event.preventDefault();
        renderAdminLockout(email);
        toast(`Please wait ${formatAdminLockoutRemaining(state.lockoutUntil-Date.now())}.`,"error");
    }
});

/* ---------------- STUDENT ---------------- */

function studentGPA(studentId, semesterFilter=""){
    const rows=db.grades.filter(g=>g.studentId===studentId && (!semesterFilter || (g.semester||"1st Semester")===semesterFilter));
    return weightedSemesterAverage(rows);
}
function attendanceStats(studentId){
    const rows=db.attendance.filter(a=>a.studentId===studentId);
    const present=rows.filter(a=>a.status==="Present").length;
    const late=rows.filter(a=>a.status==="Late").length;
    const absent=rows.filter(a=>a.status==="Absent").length;
    const total=rows.length;
    return {present,late,absent,total,pct:total?Math.round((present+late)/total*100):100};
}
function studentUnread(){
    const s=currentStudent(); if(!s) return 0;
    return db.announcements.filter(a=>!(a.readBy||[]).includes(s.id)).length;
}
function studentSchedule(){
    const s=currentStudent();
    return db.classes.filter(c=>c.section===s?.section);
}

/* =========================================================
   PHASE 2 - STUDENT SUCCESS INTELLIGENCE
   Read-only analytics built from existing grades + attendance data.
   No new writes or changes to the existing academic records are made here.
========================================================= */
function phase2GradeRows(studentId){
    return (db.grades||[]).filter(g=>String(g.studentId)===String(studentId));
}
function phase2Average(rows){
    if(!rows.length) return 0;
    const values=rows.map(g=>Number(gradeAverage(g))).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)/100 : 0;
}
function phase2StudentRadar(studentId){
    const grades=phase2GradeRows(studentId);
    const academic=phase2Average(grades);
    const attendance=attendanceStats(studentId).pct;
    const gradeRisk=grades.length ? academic<75 ? 2 : academic<80 ? 1 : 0 : 1;
    const attendanceRisk=attendance<80 ? 2 : attendance<90 ? 1 : 0;
    const riskScore=gradeRisk+attendanceRisk;
    const level=riskScore>=3?'High':riskScore>=1?'Watch':'On Track';
    const levelClass=level==='High'?'danger':level==='Watch'?'warning':'success';
    const recommendations=[];
    if(academic && academic<80) recommendations.push('Review your lowest-performing subjects and consult your instructor before the next assessment.');
    if(attendance<90) recommendations.push('Improve attendance consistency and review any missed lessons.');
    if(!grades.length) recommendations.push('Keep checking the portal as grades are posted.');
    if(!recommendations.length) recommendations.push('Keep your current study and attendance habits consistent.');
    return {academic,attendance,level,levelClass,recommendations};
}
function phase2WhatIf(studentId){
    const grades=phase2GradeRows(studentId);
    const values=grades.map(g=>Number(gradeAverage(g))).filter(Number.isFinite);
    const current=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
    return {current, count:values.length};
}
function phase2StudentInsightsHTML(s){
    const r=phase2StudentRadar(s.id);
    return `<section class="phase2-grid phase2-student-grid">
        <article class="phase2-card phase2-radar-card">
            <div class="phase2-card-heading"><div><span class="eyebrow">SMART ACADEMIC COMPASS</span><h3>Student Success Radar</h3></div><span class="phase2-status ${r.levelClass}">${r.level}</span></div>
            <div class="phase2-radar-metrics"><div class="phase2-metric-box"><span class="phase2-metric-icon">01</span><div><b>${r.academic||'—'}</b><span>Academic Average</span></div></div><div class="phase2-metric-box"><span class="phase2-metric-icon">02</span><div><b>${r.attendance}%</b><span>Attendance</span></div></div></div>
            <div class="phase2-recommendation"><strong>Recommended next step</strong><p>${escapeHTML(r.recommendations[0])}</p></div>
            <details class="phase2-details"><summary>View all recommendations</summary><ul>${r.recommendations.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></details>
        </article>
        <article class="phase2-card phase2-whatif-card">
            <div class="phase2-card-heading"><div><span class="eyebrow">PLANNING TOOL</span><h3>Grade What-If</h3></div></div>
            <div class="phase2-info-box"><span class="phase2-info-icon">↗</span><div><strong>Plan your next result</strong><p>Test a possible grade and instantly see how it may influence your overall average.</p></div></div>
            <div class="phase2-whatif-form"><label>Next grade<input id="phase2WhatIfInput" type="number" min="0" max="100" step="0.01" placeholder="e.g. 90"></label><button class="primary-btn" id="phase2WhatIfBtn" type="button">Calculate</button></div>
            <div id="phase2WhatIfResult" class="phase2-result" aria-live="polite"><span class="phase2-result-label">PROJECTION PREVIEW</span><strong>Enter a grade to see your projected average.</strong></div>
        </article>
        <article class="phase2-card phase2-smart-alerts">
            <div class="phase2-card-heading"><div><span class="eyebrow">ADAPTIVE NOTIFICATIONS</span><h3>Smart Alerts</h3></div><span class="phase2-live-badge">PERSONALIZED</span></div>
            <div class="phase2-alert-grid">${r.recommendations.map((x,i)=>`<div class="phase2-alert"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${i===0?'Priority action':'Helpful guidance'}</strong><p>${escapeHTML(x)}</p></div></div>`).join('')}</div>
        </article>
    </section>`;
}
function phase2FacultyInsights(){
    const classes=facultyClasses();
    const studentIds=new Set();
    classes.forEach(c=>{
        if(Array.isArray(c.studentIds)) c.studentIds.forEach(id=>studentIds.add(String(id)));
        else facultyAttendanceStudents(c).forEach(st=>studentIds.add(String(st.id)));
    });
    const students=[...studentIds].map(id=>db.students.find(st=>String(st.id)===id||String(st.firestoreId||'')===id)).filter(Boolean);
    const rows=students.map(st=>({student:st,radar:phase2StudentRadar(st.id)}));
    const high=rows.filter(x=>x.radar.level==='High');
    const watch=rows.filter(x=>x.radar.level==='Watch');
    const avg=students.length?Math.round(rows.reduce((a,x)=>a+x.radar.academic,0)/students.length*100)/100:0;
    const att=students.length?Math.round(rows.reduce((a,x)=>a+x.radar.attendance,0)/students.length*100)/100:0;
    return `<section class="phase2-card phase2-faculty-insights"><div class="phase2-card-heading"><div><span class="eyebrow">TEACHING INSIGHTS</span><h3>Class Performance Snapshot</h3></div><span class="phase2-live-badge">DATA-BASED</span></div>
        <div class="metric-grid"><div class="metric"><b>${avg||'—'}</b><span>Class Academic Average</span></div><div class="metric"><b>${att}%</b><span>Average Attendance</span></div><div class="metric"><b>${watch.length}</b><span>Students to Watch</span></div><div class="metric"><b>${high.length}</b><span>High Attention</span></div></div>
        <div class="phase2-risk-list">${rows.slice().sort((a,b)=>({High:0,Watch:1,'On Track':2}[a.radar.level]-({High:0,Watch:1,'On Track':2}[b.radar.level]))).slice(0,6).map(x=>`<div class="phase2-risk-row"><span>${escapeHTML(x.student.name||x.student.id)}</span><span>${x.radar.academic||'—'} avg</span><span>${x.radar.attendance}% attendance</span><b class="phase2-status ${x.radar.levelClass}">${x.radar.level}</b></div>`).join('')||'<div class="empty">No student performance data is available yet.</div>'}</div>
        <p class="phase2-muted">These indicators are guidance only. Faculty should review the underlying records before taking academic action.</p>
    </section>`;
}
function phase2AdminEarlyWarning(){
    const rows=(db.students||[]).map(st=>({student:st,radar:phase2StudentRadar(st.id)}));
    const high=rows.filter(x=>x.radar.level==='High'), watch=rows.filter(x=>x.radar.level==='Watch');
    return `<div class="phase2-card phase2-admin-warning"><div class="phase2-card-heading"><div><span class="eyebrow">STUDENT SUPPORT</span><h3>Students Requiring Attention</h3></div><span class="phase2-live-badge">ADVISORY</span></div>
      <div class="metric-grid"><div class="metric"><b>${high.length}</b><span>High Attention</span></div><div class="metric"><b>${watch.length}</b><span>Watch</span></div><div class="metric"><b>${rows.length-high.length-watch.length}</b><span>On Track</span></div></div>
      <div class="phase2-risk-list">${[...high,...watch].slice(0,10).map(x=>`<div class="phase2-risk-row"><span><strong>${escapeHTML(x.student.name||x.student.id)}</strong><small>${escapeHTML(x.student.program||'')}</small></span><span>${x.radar.academic||'—'} avg</span><span>${x.radar.attendance}% attendance</span><b class="phase2-status ${x.radar.levelClass}">${x.radar.level}</b></div>`).join('')||'<div class="empty">No students currently require attention based on available data.</div>'}</div>
      <p class="phase2-muted">This is an early-warning aid, not an automatic academic decision. Verify grades and attendance before contacting a student.</p>
    </div>`;
}

/* =========================================================
   PHASE 3 - COMMUNICATION & INTELLIGENCE
   Read-only intelligence layer using existing permitted records.
   No grades, attendance, or academic status are changed automatically.
========================================================= */
function phase3StudentRecommendations(student){
    if(!student) return [];
    const radar=phase2StudentRadar(student.id);
    const rows=phase2GradeRows(student.id);
    const suggestions=[];
    if(radar.academic && radar.academic<80) suggestions.push({icon:'↗',title:'Focus on your lowest results',body:'Review your lowest-performing subjects and consider asking your instructor for a study strategy before the next assessment.'});
    if(radar.attendance<90) suggestions.push({icon:'◷',title:'Stay consistent with attendance',body:'Your attendance is affecting your academic momentum. Review missed lessons and plan ahead for upcoming classes.'});
    const latest=(db.announcements||[]).slice().sort((a,b)=>String(b.postedAt||'').localeCompare(String(a.postedAt||'')))[0];
    if(latest) suggestions.push({icon:'!',title:'New school update',body:latest.title});
    if(!suggestions.length) suggestions.push({icon:'✓',title:'You are on a steady track',body:'Keep your current study and attendance habits consistent and check the portal regularly for new updates.'});
    return suggestions.slice(0,3);
}
function phase3StudentAssistant(student, question=''){
    const q=String(question||'').trim().toLowerCase();
    const radar=phase2StudentRadar(student.id);
    const rows=phase2GradeRows(student.id);
    if(!q) return `Hi ${escapeHTML((student.name||'Student').split(' ')[0])}! I can help you understand your grades, attendance, study priorities, and portal updates.`;
    if(q.includes('grade')||q.includes('average')||q.includes('gpa')) return `Your current academic average is ${radar.academic||'not available yet'}. You have ${rows.length} recorded grade result${rows.length===1?'':'s'}.`;
    if(q.includes('attendance')||q.includes('absent')||q.includes('late')) return `Your current attendance indicator is ${radar.attendance}%. ${radar.attendance<90?'Consider reviewing missed lessons and planning for your next classes.':'Your attendance is currently in a healthy range.'}`;
    if(q.includes('study')||q.includes('improve')||q.includes('help')) return radar.recommendations[0];
    if(q.includes('announcement')||q.includes('news')||q.includes('update')){
        const a=(db.announcements||[]).slice().sort((a,b)=>String(b.postedAt||'').localeCompare(String(a.postedAt||'')))[0];
        return a?`The latest school announcement is “${escapeHTML(a.title)}”.`:'There are no recent announcements available.';
    }
    return `Based on your current records, your status is ${radar.level}. I can answer questions about your grades, attendance, study priorities, and school announcements.`;
}
function phase3StudentHubHTML(student){
    const items=phase3StudentRecommendations(student);
    const latest=(db.announcements||[]).slice().sort((a,b)=>String(b.postedAt||'').localeCompare(String(a.postedAt||''))).slice(0,3);
    return `<section class="phase3-grid phase3-student-hub">
      <article class="phase3-card phase3-assistant-card">
        <div class="phase3-heading"><div><span class="phase3-eyebrow">CEC ACADEMIC GUIDE</span><h3>Academic Assistant</h3><p>Ask about your academic progress using the records available to your account.</p></div><span class="phase3-live">READ-ONLY</span></div>
        <div id="phase3AssistantMessages" class="phase3-assistant-messages"><div class="phase3-bubble assistant">${phase3StudentAssistant(student)}</div></div>
        <div class="phase3-assistant-form"><input id="phase3AssistantInput" placeholder="Ask: How are my grades?" autocomplete="off"><button class="primary-btn" id="phase3AssistantBtn" type="button">Ask Guide</button></div>
      </article>
      <article class="phase3-card phase3-recommendations-card">
        <div class="phase3-heading"><div><span class="phase3-eyebrow">PERSONALIZED PLAN</span><h3>Your Next Best Actions</h3></div><span class="phase3-count">${items.length} suggestions</span></div>
        <div class="phase3-recommendation-grid">${items.map((x,i)=>`<div class="phase3-recommendation-item"><span>${x.icon}</span><div><b>${escapeHTML(x.title)}</b><p>${escapeHTML(x.body)}</p></div></div>`).join('')}</div>
      </article>
      <article class="phase3-card phase3-communication-card">
        <div class="phase3-heading"><div><span class="phase3-eyebrow">COMMUNICATION CENTER</span><h3>School Updates</h3></div></div>
        <div class="phase3-update-list">${latest.map(a=>`<div class="phase3-update"><span class="phase3-update-dot"></span><div><b>${escapeHTML(a.title)}</b><p>${escapeHTML(a.body)}</p><small>${formatDateTime(a.postedAt)}</small></div></div>`).join('')||'<div class="empty">No school updates yet.</div>'}</div>
      </article>
    </section>`;
}
function bindPhase3StudentTools(){
    const btn=$('#phase3AssistantBtn'), input=$('#phase3AssistantInput'), box=$('#phase3AssistantMessages');
    if(!btn||!input||!box) return;
    const ask=()=>{const q=input.value.trim();if(!q)return;box.insertAdjacentHTML('beforeend',`<div class="phase3-bubble user">${escapeHTML(q)}</div><div class="phase3-bubble assistant">${phase3StudentAssistant(currentStudent(),q)}</div>`);input.value='';box.scrollTop=box.scrollHeight;};
    btn.onclick=ask; input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();ask();}};
}
function phase3FacultyCommunication(){
    const classes=facultyClasses();
    const ids=new Set(classes.flatMap(c=>Array.isArray(c.studentIds)?c.studentIds.map(String):[]));
    const students=[...ids].map(id=>db.students.find(s=>String(s.id)===id||String(s.firestoreId||'')===id)).filter(Boolean);
    const rows=students.map(s=>({student:s,radar:phase2StudentRadar(s.id)})).filter(x=>x.radar.level!=='On Track');
    return `<section class="phase3-card phase3-faculty-hub"><div class="phase3-heading"><div><span class="phase3-eyebrow">INTERVENTION WORKFLOW</span><h3>Students to Follow Up</h3><p>Prioritize communication using the same explainable signals from your class snapshot.</p></div><span class="phase3-live">ACTION QUEUE</span></div><div class="phase3-followup-grid">${rows.slice(0,8).map(x=>{const email=String(x.student.email||'').trim();return `<div class="phase3-followup"><div class="phase3-avatar">${escapeHTML((x.student.name||'S').split(' ').map(v=>v[0]).slice(0,2).join(''))}</div><div class="phase3-followup-main"><b>${escapeHTML(x.student.name||x.student.id)}</b><span>${x.radar.academic||'—'} avg · ${x.radar.attendance}% attendance</span></div><span class="phase2-status ${x.radar.levelClass}">${x.radar.level}</span>${email?`<a class="secondary-btn phase3-contact" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('CEC Portal Academic Follow-up')}">Contact</a>`:''}</div>`}).join('')||'<div class="empty">No follow-up students at this time.</div>'}</div></section>`;
}
function phase3AdminCommunication(){
    const rows=(db.students||[]).map(s=>({student:s,radar:phase2StudentRadar(s.id)}));
    const high=rows.filter(x=>x.radar.level==='High'), watch=rows.filter(x=>x.radar.level==='Watch');
    return `<section class="phase3-card phase3-admin-hub"><div class="phase3-heading"><div><span class="phase3-eyebrow">COMMUNICATION INTELLIGENCE</span><h3>Support Queue</h3><p>Use academic signals to decide who may need a timely human follow-up.</p></div><span class="phase3-live">HUMAN REVIEW</span></div><div class="phase3-admin-stats"><div><b>${high.length}</b><span>High Attention</span></div><div><b>${watch.length}</b><span>Watch</span></div><div><b>${(db.announcements||[]).length}</b><span>School Updates</span></div></div><div class="phase3-followup-grid">${[...high,...watch].slice(0,8).map(x=>`<div class="phase3-followup"><div class="phase3-avatar">${escapeHTML((x.student.name||'S').split(' ').map(v=>v[0]).slice(0,2).join(''))}</div><div class="phase3-followup-main"><b>${escapeHTML(x.student.name||x.student.id)}</b><span>${x.radar.academic||'—'} avg · ${x.radar.attendance}% attendance</span></div><span class="phase2-status ${x.radar.levelClass}">${x.radar.level}</span></div>`).join('')||'<div class="empty">No support follow-ups are currently suggested.</div>'}</div></section>`;
}

function bindPhase2StudentTools(){
    const btn=$('#phase2WhatIfBtn'); if(!btn) return;
    btn.onclick=()=>{
        const input=Number($('#phase2WhatIfInput')?.value);
        const result=$('#phase2WhatIfResult');
        if(!Number.isFinite(input)||input<0||input>100){result.textContent='Enter a grade from 0 to 100.';return;}
        const s=currentStudent(); if(!s) return;
        const base=phase2WhatIf(s.id);
        const projected=base.count?((base.current*base.count+input)/(base.count+1)):input;
        result.innerHTML=`<strong>Projected average: ${Math.round(projected*100)/100}</strong><span>Current average: ${base.current?Math.round(base.current*100)/100:'—'} · This is an estimate using equal subject weighting.</span>`;
    };
}

function renderStudent(){
    const s=currentStudent(); if(!s) return;
    $("#sidebarStudentName").textContent=s.name;
    $("#sidebarStudentId").textContent=s.id;
    $("#sidebarAvatar").innerHTML=avatarHTML(s,"sidebar-avatar");
    $("#notificationBadge").textContent=studentUnread()||"";
    $("#notificationBadge").style.display=studentUnread()?"block":"none";

    const stats=attendanceStats(s.id), gpa=studentGPA(s.id), pending=db.payments.filter(p=>p.studentId===s.id&&p.status!=="Paid").reduce((a,p)=>a+Number(p.amount),0);
    const schedule=studentSchedule();
    const enrolledCount=db.enlistments.filter(e=>e.studentId===s.id).length;
    const myClasses=(db.classes||[]).filter(c=>Array.isArray(c.studentIds)&&c.studentIds.map(String).includes(String(s.id||"")));
    const stuHour=new Date().getHours();
    const stuGreeting=stuHour<12?"Good morning":stuHour<17?"Good afternoon":"Good evening";
    const stuAnnouncements=(db.announcements||[]).filter(a=>{const ta=a.targetAudience||"general";if(ta==="faculty")return false;if(a.expiresAt&&String(a.expiresAt).slice(0,10)<today())return false;return true;}).slice().sort((a,b)=>{const pa=a.isPinned?1:0,pb=b.isPinned?1:0;if(pb!==pa)return pb-pa;return String(b.postedAt||"").localeCompare(String(a.postedAt||""));}).slice(0,4);
    const lowAttBanner=stats.pct<75?`<div class="stu-warn-banner">⚠️ <b>Low Attendance Alert:</b> Your attendance is at <b>${stats.pct}%</b> — below the 75% minimum. Please address absences immediately.</div>`:"";
    $("#dashboardHome").innerHTML=`
    ${lowAttBanner}
    <div class="stu-welcome-bar">
        <div class="stu-welcome-left">
            <span class="stu-greeting">${stuGreeting}, <strong>${escapeHTML(s.name)}</strong></span>
            <span class="stu-sub">${escapeHTML(s.program||"—")} • Year ${escapeHTML(s.year||"—")} • ${escapeHTML(s.section||"—")}</span>
        </div>
        <span class="stu-date">${formatDate(today())}</span>
    </div>
    <div class="stu-kpi-grid">
        <div class="stu-kpi-card"><div class="stu-kpi-icon kpi-green">◉</div><div><b>${stats.pct}%</b><span>Attendance</span></div></div>
        <div class="stu-kpi-card"><div class="stu-kpi-icon kpi-blue">▥</div><div><b>${gpa}</b><span>GPA / Avg</span></div></div>
        <div class="stu-kpi-card"><div class="stu-kpi-icon kpi-purple">☑</div><div><b>${enrolledCount}</b><span>Enrolled Subjects</span></div></div>
        <div class="stu-kpi-card"><div class="stu-kpi-icon kpi-orange">₱</div><div><b>${money(pending)}</b><span>Balance</span></div></div>
    </div>
    <div class="stu-quick-actions">
        <button class="stu-quick-btn sqb-blue" data-view-jump="grades"><span>▥</span> View Grades</button>
        <button class="stu-quick-btn sqb-green" data-view-jump="attendance"><span>◉</span> Attendance</button>
        <button class="stu-quick-btn sqb-purple" data-view-jump="subjects"><span>☑</span> My Subjects</button>
        <button class="stu-quick-btn sqb-orange" data-view-jump="announcements"><span>🔔</span> Announcements</button>
    </div>
    <div class="stu-dash-grid">
        <div class="stu-dash-col">
            <div class="stu-section-head"><h4>📅 Today's Classes</h4><button class="text-link" data-view-jump="calendar">See all →</button></div>
            <div class="stu-classes-list">
                ${myClasses.length?myClasses.map(c=>`<div class="stu-class-row"><div class="stu-class-info"><strong>${escapeHTML(c.subject||c.subjectCode||"—")}</strong><span class="stu-class-meta">${escapeHTML(c.schedule||"—")} · ${escapeHTML(c.room||"—")}</span><span class="stu-class-meta">${escapeHTML(c.teacher||"—")} · ${escapeHTML(c.section||"—")}</span></div><span class="status-chip">${escapeHTML(c.semester||"—")}</span></div>`).join(""):`<div class="empty">No classes assigned yet.</div>`}
            </div>
        </div>
        <div class="stu-dash-col">
            <div class="stu-section-head"><h4>🔔 Latest Announcements</h4><button class="text-link" data-view-jump="announcements">View all →</button></div>
            <div class="stu-ann-list">
                ${stuAnnouncements.length?stuAnnouncements.map(a=>`<div class="stu-ann-item">${a.isPinned?'<span class="ann-pinned-badge" style="font-size:9px">📌 Pinned</span>':""}<div class="stu-ann-title">${escapeHTML(a.title)}</div><div class="stu-ann-meta">${formatDateTime(a.postedAt)}</div></div>`).join(""):`<div class="empty">No announcements yet.</div>`}
            </div>
        </div>
    </div>
    ${phase2StudentInsightsHTML(s)}${phase3StudentHubHTML(s)}`;
    bindViewButtons();
    bindPhase2StudentTools(); bindPhase3StudentTools();
}
function featureCard(icon,title,value,small,pill,view){return `<article class="feature-card clickable" data-view-jump="${view}"><span class="icon">${icon}</span><h3>${title}</h3><p>${value}</p><small>${small}</small><b class="pill ${pill}">${pill==="orange"?"Open":"View"}</b></article>`}

function openStudentView(view){
    if(view==="home"){ $("#contentView").classList.add("hidden");$("#dashboardHome").classList.remove("hidden");}
    else{$("#dashboardHome").classList.add("hidden");$("#contentView").classList.remove("hidden");$("#contentView").innerHTML=studentViews[view]?studentViews[view]():studentViews.grades();}
    $$(".side-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    if(view==="profile") bindProfileUpload();
    if(view==="settings") bindSettings();
    if(view==="subjects") bindEnlistment();
    if(view==="tuition") bindPayments();
    if(view==="syllabi") bindStudentMaterials();
    bindViewButtons();
}
const studentViews={
    grades:()=>{const s=currentStudent(), rows=db.grades.filter(g=>g.studentId===s.id), semesters=[...new Set(rows.map(g=>g.semester||"1st Semester"))];const schoolYear=[...new Set(rows.map(g=>g.schoolYear||"2026-2027"))][0]||"2026-2027";return panel("Grades & Semester Average",`<div class="metric-grid"><div class="metric"><b>${studentGPA(s.id)}</b><span>Overall Average</span></div><div class="metric"><b>${rows.length}</b><span>Subjects Graded</span></div><div class="metric"><b>${schoolYear}</b><span>School Year</span></div></div>${semesters.map(sem=>{const list=rows.filter(g=>(g.semester||"1st Semester")===sem);const avg=studentGPA(s.id,sem);return `<div class="grade-semester-card"><div class="panel-actions"><h3>${escapeHTML(sem)}</h3><span class="status-chip">Semester Average: ${avg}</span></div><table class="data-table"><thead><tr><th>Code</th><th>Subject</th><th>Prelim</th><th>Midterm</th><th>Semi-Final</th><th>Final</th><th>Semester Average</th></tr></thead><tbody>${list.map(g=>`<tr><td>${escapeHTML(g.code||"—")}</td><td>${escapeHTML(gradeSubjectName(g)||"—")}</td><td>${g.prelim??"—"}</td><td>${g.midterm??"—"}</td><td>${g.semiFinal??"—"}</td><td>${g.final??"—"}</td><td><b>${gradeAverage(g)}</b></td></tr>`).join("")||emptyRow(7)}</tbody></table></div>`}).join("")||`<div class="empty">No grades have been posted yet.</div>`}`)},
    attendance:()=>{const s=currentStudent(), rows=db.attendance.filter(a=>a.studentId===s.id), st=attendanceStats(s.id);
        const myClasses=(db.classes||[]).filter(c=>Array.isArray(c.studentIds)&&c.studentIds.map(String).includes(String(s.id||"")));
        const classOpts=myClasses.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.subject||c.subjectName||c.subjectCode||c.code||"Class")} · ${escapeHTML(c.section||"—")}</option>`).join("");
        return panel("Attendance Records",`<div class="metric-grid"><div class="metric"><b>${st.pct}%</b><span>Attendance</span></div><div class="metric"><b>${st.present}</b><span>Present</span></div><div class="metric"><b>${st.absent}</b><span>Absent</span></div><div class="metric"><b>${st.late}</b><span>Late</span></div></div><div class="panel-actions"><button class="secondary-btn" id="submitExcuseBtn">📩 Submit Excuse Request</button></div><table class="data-table"><thead><tr><th>Date</th><th>Subject</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(a=>`<tr><td>${formatDate(a.date)}</td><td>${escapeHTML(a.subject)}</td><td><span class="status-chip ${a.status.toLowerCase()}">${a.status}</span></td><td>${escapeHTML(a.remarks)}</td></tr>`).join("")||emptyRow(4)}</tbody></table>`);
    },
    subjects:()=>panel("Subject Enlistment",`<div class="info-box">Select subjects for your upcoming term. Your selected subjects are saved to this account and can be reviewed by the administrator.</div><div class="subject-grid">${db.subjects.map(x=>{const s=currentStudent(), chosen=db.enlistments.some(e=>e.studentId===s.id&&e.code===x.code);return `<article class="subject-card"><div><b>${escapeHTML(x.code)}</b><span>${x.units} units</span></div><h3>${escapeHTML(x.name)}</h3><p>${escapeHTML(x.schedule)}</p><small>${escapeHTML(x.teacher)} · ${escapeHTML(x.room)}</small><button class="${chosen?"secondary-btn":"primary-btn"} enlist-btn" data-code="${escapeHTML(x.code)}">${chosen?"Remove Selection":"Enlist Subject"}</button></article>`}).join("")}</div>`),
    syllabi:()=>panel("Syllabi & Materials",`<div class="info-box">Download syllabi, modules, and other learning materials posted for your assigned classes.</div><div class="toolbar"><input id="materialSearch" placeholder="Search materials..."></div><div id="materialsList">${renderMaterials()}</div>`),
    calendar:()=>panel("Calendar & Events",`<div class="event-grid">${db.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<article class="event-card"><div class="event-date"><b>${new Date(e.date+"T00:00:00").getDate()}</b><span>${new Date(e.date+"T00:00:00").toLocaleDateString("en-US",{month:"short"}).toUpperCase()}</span></div><div><h3>${escapeHTML(e.title)}</h3><p>${escapeHTML(e.description)}</p><small>🕒 ${escapeHTML(e.time)} · 📍 ${escapeHTML(e.location)}</small></div></article>`).join("")||`<div class="empty">No upcoming events.</div>`}</div>`),
    announcements:()=>{const s=currentStudent();const now=today();const visible=(db.announcements||[]).filter(a=>{const ta=a.targetAudience||"general";if(ta==="faculty") return false;if(a.expiresAt && String(a.expiresAt).slice(0,10)<now) return false;return true;}).slice().sort((a,b)=>{const pa=a.isPinned?1:0,pb=b.isPinned?1:0;if(pb!==pa)return pb-pa;return String(b.postedAt||"").localeCompare(String(a.postedAt||""));});return panel("Announcements",`<div class="panel-actions notification-actions"><button class="secondary-btn mark-all-read">Mark All as Read</button></div><div class="announcement-list">${visible.map(a=>{const unread=!(a.readBy||[]).includes(s.id);return `<article class="announcement-card ${unread?"unread":""}"><div class="announcement-top">${a.isPinned?'<span class="ann-pinned-badge">📌 Pinned</span>':''}${a.priority==="high"?'<span class="ann-priority-badge">🔴 Priority</span>':''}<span class="status-chip">${unread?"NEW":"READ"}</span><time>Posted ${formatDateTime(a.postedAt)}</time></div><h3>${escapeHTML(a.title)}</h3><p>${escapeHTML(a.body)}</p><small>Posted by ${escapeHTML(a.author)}${a.expiresAt?` · Expires ${formatDate(a.expiresAt)}`:""}</small>${unread?`<button class="secondary-btn mark-read" data-id="${a.id}">Mark as Read</button>`:""}</article>`}).join("")||`<div class="empty">No announcements yet.</div>`}</div>`)},
    tuition:()=>{const s=currentStudent(), rows=db.payments.filter(p=>p.studentId===s.id), outstanding=rows.filter(p=>p.status!=="Paid").reduce((a,p)=>a+Number(p.amount),0);return panel("Tuition & Payments",`<div class="metric-grid"><div class="metric"><b>${money(outstanding)}</b><span>Outstanding</span></div><div class="metric"><b>${rows.filter(p=>p.status==="Paid").length}</b><span>Paid Items</span></div><div class="metric"><b>${rows.length}</b><span>Total Charges</span></div></div><table class="data-table"><thead><tr><th>Description</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${escapeHTML(p.description)}</td><td>${money(p.amount)}</td><td>${formatDate(p.dueDate)}</td><td><span class="status-chip ${p.status.toLowerCase()}">${p.status}</span></td><td>${p.status==="Paid"?`<span class="muted">${formatDate(p.paidDate)}</span>`:`<button class="small-action pay-now" data-id="${p.id}">Pay / Record</button>`}</td></tr>`).join("")||emptyRow(5)}</tbody></table>`)},
    profile:()=>{const s=currentStudent();return panel("Profile & Contact",`<div class="profile-layout"><div class="profile-hero">${avatarHTML(s,"profile-avatar")}<div><h2>${escapeHTML(s.name)}</h2><p>${escapeHTML(s.program)} · Year ${escapeHTML(s.year)} · ${escapeHTML(s.section)}</p><label class="upload-btn">Change Profile Picture<input type="file" id="profilePicture" accept="image/*" hidden></label></div></div><form id="profileForm" class="form-grid"><label>Student ID<input value="${escapeHTML(s.id)}" disabled></label><label>Full Name<input name="name" value="${escapeHTML(s.name)}" required></label><label>Email<input type="email" name="email" value="${escapeHTML(s.email||"")}"></label><label>Contact Number<input name="phone" value="${escapeHTML(s.phone||"")}"></label><label>Program<input value="${escapeHTML(s.program)}" disabled></label><label>Year Level<input value="${escapeHTML(s.year)}" disabled></label><label>Section<input value="${escapeHTML(s.section)}" disabled></label><label>Address<input name="address" value="${escapeHTML(s.address||"")}"></label><div class="form-actions"><a href="index.html" class="profile-logout" id="profile-logout">Logout now</a><button class="primary-btn">Save Profile</button></div></form>`)},
    settings:()=>{const st=db.settings;return panel("Settings",`<form id="settingsForm" class="settings-list"><label class="setting-row"><span><b>Portal Notifications</b><small>Show announcement notifications inside the dashboard.</small></span><input type="checkbox" name="notifications" ${st.notifications?"checked":""}></label><label class="setting-row"><span><b>Email Updates</b><small>Allow school updates to be prepared for email delivery.</small></span><input type="checkbox" name="emailUpdates" ${st.emailUpdates?"checked":""}></label><label class="setting-row"><span><b>Dark Mode</b><small>Use a darker dashboard appearance.</small></span><input type="checkbox" name="darkMode" ${st.darkMode?"checked":""}></label><div class="form-actions"><button class="primary-btn">Save Settings</button></div></form>`)},
    notifications:()=>{const s=currentStudent();const now=today();const visible=(db.announcements||[]).filter(a=>{const ta=a.targetAudience||"general";if(ta==="faculty") return false;if(a.expiresAt && String(a.expiresAt).slice(0,10)<now) return false;return true;}).slice().sort((a,b)=>{const pa=a.isPinned?1:0,pb=b.isPinned?1:0;if(pb!==pa)return pb-pa;return String(b.postedAt||"").localeCompare(String(a.postedAt||""));});return panel("Notifications",`<div class="info-box">Your notifications are connected to school announcements. Reading an announcement also updates the notification bell.</div><div class="panel-actions notification-actions"><button class="secondary-btn mark-all-read">Mark All as Read</button></div><div class="announcement-list">${visible.map(a=>{const unread=!(a.readBy||[]).includes(s.id);return `<article class="announcement-card ${unread?"unread":""}"><div class="announcement-top">${a.isPinned?'<span class="ann-pinned-badge">📌 Pinned</span>':''}${a.priority==="high"?'<span class="ann-priority-badge">🔴 Priority</span>':''}<span class="status-chip">${unread?"NEW":"READ"}</span><time>Posted ${formatDateTime(a.postedAt)}</time></div><h3>${escapeHTML(a.title)}</h3><p>${escapeHTML(a.body)}</p><small>Posted by ${escapeHTML(a.author)}${a.expiresAt?` · Expires ${formatDate(a.expiresAt)}`:""}</small>${unread?`<button class="secondary-btn mark-read" data-id="${a.id}">Mark as Read</button>`:""}</article>`}).join("")||`<div class="empty">No notifications yet.</div>`}</div>`) }
};

function panel(title,body){return `<section class="content-panel"><div class="panel-header"><div><p class="eyebrow">CEC PORTAL</p><h2>${title}</h2></div><span class="panel-date">${formatDate(today())}</span></div>${body}</section>`}
function emptyRow(n){return `<tr><td colspan="${n}" class="empty-cell">No records found.</td></tr>`}
function formatFileSize(bytes){
    const n=Number(bytes||0);
    if(!Number.isFinite(n)||n<=0)return "";
    if(n<1024)return `${n} B`;
    if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
    return `${(n/(1024*1024)).toFixed(1)} MB`;
}
function renderMaterials(filter=""){
    const q=String(filter||"").toLowerCase().trim();
    const rows=db.materials.filter(m=>(`${m.title||""} ${m.subject||""} ${m.type||""} ${m.code||m.subjectCode||""}`).toLowerCase().includes(q));
    return `<div class="material-list">${rows.slice().sort((a,b)=>String(b.postedAt||"").localeCompare(String(a.postedAt||""))).map(m=>`<article class="material-row">
        <div class="material-icon">▤</div>
        <div class="material-info"><b>${escapeHTML(m.title||m.fileName||"Material")}</b><span>${escapeHTML(m.subject||m.subjectCode||"—")} · ${escapeHTML(m.type||"Material")}</span><small>${escapeHTML(m.fileName||"")}${m.size?` · ${formatFileSize(m.size)}`:""} · Posted ${formatDateTime(m.postedAt)}</small>${m.description?`<p>${escapeHTML(m.description)}</p>`:""}</div>
        ${m.downloadURL?`<button class="small-action" data-material-download="${escapeHTML(m.id)}">Download</button>`:`<span class="muted">File unavailable</span>`}
    </article>`).join("")||`<div class="empty">No materials match your search.</div>`}</div>`;
}
async function downloadCourseMaterial(materialId){
    const material=(db.materials||[]).find(m=>String(m.id)===String(materialId));
    if(!material){toast("Material not found.","error");return;}
    try{
        let url=String(material.downloadURL||"");
        if(!url && material.storagePath){
            const storage=await window.cecFirebaseStorage();
            url=await storage.ref(String(material.storagePath)).getDownloadURL();
        }
        if(!url)throw new Error("This material does not have a downloadable file.");
        window.open(url,"_blank","noopener,noreferrer");
    }catch(error){
        console.error("Material download failed:",error);
        toast("Unable to download this material. Please try again.","error");
    }
}
function bindStudentMaterials(){
    $$("[data-material-download]").forEach(btn=>btn.onclick=()=>downloadCourseMaterial(btn.dataset.materialDownload));
}

function bindEnlistment(){
    $$(".enlist-btn").forEach(btn=>btn.onclick=()=>{
        const s=currentStudent(), code=btn.dataset.code;
        const index=db.enlistments.findIndex(e=>e.studentId===s.id&&e.code===code);
        if(index>=0){db.enlistments.splice(index,1);toast("Subject removed from your enlistment.");}
        else{db.enlistments.push({id:uid("EN-"),studentId:s.id,code,createdAt:nowISO(),status:"Pending"});toast("Subject added to your enlistment.");}
        saveDB();openStudentView("subjects");renderStudent();
    });
    $$(".small-action[data-download]").forEach(b=>b.onclick=()=>toast("Demo file action: "+b.dataset.download));
}
function bindPayments(){
    $$(".pay-now").forEach(b=>b.onclick=()=>{
        const p=db.payments.find(x=>x.id===b.dataset.id);
        openModal(`<div class="modal-head"><h2>Record Payment</h2><button data-close-modal>×</button></div><div class="modal-body"><p><b>${escapeHTML(p.description)}</b></p><p>Amount: <strong>${money(p.amount)}</strong></p><label>Payment Reference<input id="paymentRef" placeholder="e.g. GCash reference"></label></div><div class="modal-foot"><button class="secondary-btn" data-close-modal>Cancel</button><button class="primary-btn" id="confirmPayment">Record Payment</button></div>`,root=>{
            root.querySelector("#confirmPayment").onclick=()=>{p.status="Paid";p.paidDate=today();p.reference=root.querySelector("#paymentRef").value.trim();saveDB();closeDynamic();openStudentView("tuition");renderStudent();toast("Payment recorded in demo mode.");};
        });
    });
}
function bindProfileUpload(){
    const s=currentStudent();
    $("#profileForm").onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);Object.assign(s,{name:fd.get("name"),email:fd.get("email"),phone:fd.get("phone"),address:fd.get("address")});saveDB();renderStudent();openStudentView("profile");toast("Profile updated successfully.");};
    $("#profilePicture").onchange=e=>{
        const file=e.target.files[0]; if(!file)return;
        if(file.size>2*1024*1024){toast("Please choose an image smaller than 2 MB.","error");return;}
        const reader=new FileReader();reader.onload=()=>{s.avatar=reader.result;saveDB();renderStudent();openStudentView("profile");toast("Profile picture updated.");};reader.readAsDataURL(file);
    };
}
function bindSettings(){
    $("#settingsForm").onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);db.settings.notifications=fd.has("notifications");db.settings.emailUpdates=fd.has("emailUpdates");db.settings.darkMode=fd.has("darkMode");saveDB();applyTheme();toast("Settings saved.");};
}
function applyTheme(){document.body.classList.toggle("dark",!!db.settings.darkMode);}

$$('.side-link:not(.admin-side-link)').forEach(button=>button.onclick=()=>{
    const routes={home:'student-dashboard.html',grades:'grades.html',attendance:'attendance.html',subjects:'subjects.html',syllabi:'materials.html',calendar:'calendar.html',announcements:'announcements.html',tuition:'tuition.html',profile:'profile.html',settings:'settings.html'};
    const route=routes[button.dataset.view];
    if(route)location.href=route;
});
$("#notificationBtn")?.addEventListener("click",()=>openStudentView("notifications"));
$("#sideNotificationBtn")?.addEventListener("click",()=>openStudentView("notifications"));
$("#sideSettingsBtn")?.addEventListener("click",()=>openStudentView("settings"));
$("#profileBtn")?.addEventListener("click",()=>openStudentView("profile"));
$("#profileLogoutBtn")?.addEventListener("click",studentLogout);
$("#logoutBtn")?.addEventListener("click",studentLogout);
async function studentLogout(){cecStopSessionManager();cecClearSessionMeta();try{await cecFirestore.signOut();}catch(e){} localStorage.removeItem(SESSION_KEY);location.href="index.html";}
function bindViewButtons(){
    const routes={home:"student-dashboard.html",grades:"grades.html",attendance:"attendance.html",subjects:"subjects.html",syllabi:"materials.html",calendar:"calendar.html",announcements:"announcements.html",notifications:"notifications.html",tuition:"tuition.html",profile:"profile.html",settings:"settings.html"};
    $$('[data-view-jump]').forEach(button=>button.onclick=()=>{
        const view=button.dataset.viewJump;
        if(routes[view] && location.pathname.split('/').pop()!==routes[view]){
            location.href=routes[view];
            return;
        }
        openStudentView(view);
    });
    $$('.mark-read').forEach(button=>button.onclick=()=>{
        const announcement=db.announcements.find(item=>item.id===button.dataset.id);
        const student=currentStudent();
        if(!announcement || !student)return;
        announcement.readBy=announcement.readBy||[];
        if(!announcement.readBy.includes(student.id)) announcement.readBy.push(student.id);
        saveDB();
        renderStudent();
        openStudentView(location.pathname.split('/').pop()==='notifications.html' ? 'notifications' : 'announcements');
        toast('Notification marked as read.');
    });
    $('.mark-all-read')?.addEventListener('click',()=>{
        const student=currentStudent();
        if(!student)return;
        db.announcements.forEach(announcement=>{
            announcement.readBy=announcement.readBy||[];
            if(!announcement.readBy.includes(student.id)) announcement.readBy.push(student.id);
        });
        saveDB();
        renderStudent();
        openStudentView(location.pathname.split('/').pop()==='notifications.html' ? 'notifications' : 'announcements');
        toast('All notifications marked as read.');
    });
    $('#materialSearch')?.addEventListener('input',event=>{
        $('#materialsList').innerHTML=renderMaterials(event.target.value);
        bindStudentMaterials();
    });
    bindStudentMaterials();
    // Student excuse request submit handler
    $('#submitExcuseBtn')?.addEventListener('click',()=>{
        const s=currentStudent();
        if(!s){toast('You must be logged in to submit an excuse request.','error');return;}
        const myClasses=(db.classes||[]).filter(c=>Array.isArray(c.studentIds)&&c.studentIds.map(String).includes(String(s.id||'')));
        const classOpts=myClasses.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.subject||c.subjectName||c.subjectCode||c.code||'Class')} · ${escapeHTML(c.section||'—')}</option>`).join('');
        openModal(`<div class="modal-head"><h2>📩 Submit Excuse Request</h2><button data-close-modal>×</button></div>
        <div class="modal-body form-grid">
            <div class="info-box">Submit an excuse letter for an absence. Your faculty will review and approve or reject it.</div>
            <label>Date of Absence<input type="date" id="excuseDate" max="${today()}" required></label>
            <label>Class / Subject<select id="excuseClass">${classOpts||'<option value="">No classes found</option>'}</select></label>
            <label>Reason / Message<textarea id="excuseReason" rows="4" placeholder="Describe the reason for your absence..." required></textarea></label>
            <div class="form-actions"><button class="secondary-btn" data-close-modal>Cancel</button><button class="primary-btn" id="excuseSubmitBtn">Submit Request</button></div>
        </div>`,root=>{
            root.querySelector('#excuseSubmitBtn').onclick=async()=>{
                const btn=root.querySelector('#excuseSubmitBtn');
                const date=root.querySelector('#excuseDate').value.trim();
                const classId=root.querySelector('#excuseClass').value.trim();
                const reason=root.querySelector('#excuseReason').value.trim();
                if(!date||!classId||!reason){toast('Please fill in all fields.','error');return;}
                btn.disabled=true;btn.textContent='Submitting...';
                try{
                    const cls=myClasses.find(c=>String(c.id)===String(classId));
                    const subject=String(cls?.subject||cls?.subjectName||cls?.subjectCode||cls?.code||'');
                    const excuseId=uid('EX-');
                    const payload={id:excuseId,studentId:String(s.id),studentName:String(s.name||''),date,classId,subject,reason,status:'Pending',createdAt:nowISO()};
                    await firebase.firestore().collection('excuseRequests').doc(excuseId).set(payload);
                    toast('Excuse request submitted. Your faculty will review it.');
                    closeDynamic();
                }catch(error){console.error('Excuse request failed:',error);toast(error?.message||'Unable to submit excuse request.','error');btn.disabled=false;btn.textContent='Submit Request';}
            };
        });
    });
}

/* ---------------- LEGACY FACULTY ASSIGNMENT MIRROR ---------------- */
// Kept only for compatibility/migration. Faculty pages no longer depend on this
// collection. The canonical realtime relationship is classes.teacherId.
async function syncFacultyClassAssignmentsToFirestore(){
    if(window.cecFirebase?.role !== "admin" || !window.cecFirebase?.uid || !window.firebase?.firestore) return;
    const fs=firebase.firestore(), batch=fs.batch();
    const wanted=new Set();
    (db.classes||[]).forEach(c=>{
        const teacherId=String(c.teacherId||"").trim();
        const classId=String(c.id||"").trim();
        if(!teacherId||!classId) return;
        const key=teacherId+"__"+classId; wanted.add(key);
        const ref=fs.collection("facultyAssignments").doc(key);
        batch.set(ref,{
            teacherId, classId, subjectCode:String(c.subjectCode||c.code||""), subject:String(c.subject||""),
            program:String(c.program||""), year:String(c.year||""), section:String(c.section||""),
            schoolYear:String(c.schoolYear||""), semester:String(c.semester||""), schedule:String(c.schedule||""), room:String(c.room||""),
            studentIds:Array.isArray(c.studentIds)?c.studentIds.map(String):[], updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true});
    });
    const existing=await fs.collection("facultyAssignments").get();
    existing.forEach(doc=>{ if(!wanted.has(doc.id)) batch.delete(doc.ref); });
    await batch.commit();
}
window.syncFacultyClassAssignmentsToFirestore=syncFacultyClassAssignmentsToFirestore;

/* ---------------- STUDENT / FACULTY CLASS ASSIGNMENT SYNC ---------------- */
function syncStudentFacultyAssignments(){
    if(!Array.isArray(db.students) || !Array.isArray(db.classes)) return false;

    const teacherIdsByStudent = new Map();
    let changed=false;

    const addTeacher = (studentId, teacherId) => {
        if(!studentId || !teacherId) return;
        const key=String(studentId);
        const set=teacherIdsByStudent.get(key) || new Set();
        set.add(String(teacherId));
        teacherIdsByStudent.set(key,set);
    };

    db.classes.forEach(c=>{
        const teacherId=String(c.teacherId||"").trim();
        if(!teacherId) return;

        // Preferred method: Admin explicitly assigns students to this class.
        let explicit=Array.isArray(c.studentIds) ? c.studentIds.filter(Boolean).map(String) : [];
        if(!explicit.length){
            // Migrate legacy classes safely by converting the old Program + Year + Section
            // relationship into explicit studentIds. This makes the Faculty grade rule reliable.
            explicit=db.students.filter(st=>{
                const sameSection=String(c.section||"").trim().toLowerCase()===String(st.section||"").trim().toLowerCase();
                const sameProgram=!c.program || normalizeCourse(c.program)===normalizeCourse(st.program);
                const sameYear=!c.year || String(c.year).trim().toLowerCase()===String(st.year||"").trim().toLowerCase();
                return sameSection && sameProgram && sameYear && st.status!=="Inactive";
            }).map(st=>String(st.id));
            if(explicit.length){ c.studentIds=[...new Set(explicit)]; changed=true; }
        }
        explicit.forEach(studentId=>addTeacher(studentId,teacherId));
    });

    db.students.forEach(st=>{
        const next=[...(teacherIdsByStudent.get(String(st.id)) || new Set())].sort();
        const previous=[...(Array.isArray(st.facultyTeacherIds)?st.facultyTeacherIds:[])].map(String).sort();
        if(JSON.stringify(previous)!==JSON.stringify(next)){
            st.facultyTeacherIds=next;
            changed=true;
        }
    });
    return changed;
}
window.syncStudentFacultyAssignments = syncStudentFacultyAssignments;

function syncClassFacultyAuthLinks(){
    let changed=false;
    (db.classes||[]).forEach(c=>{
        const teacher=db.teachers.find(t=>String(t.id)===String(c.teacherId||""));
        if(!teacher) return;
        const authUid=String(teacher.authUid||"");
        const email=String(teacher.email||"").trim().toLowerCase();
        if(authUid && String(c.teacherAuthUid||"")!==authUid){ c.teacherAuthUid=authUid; changed=true; }
        if(email && String(c.teacherEmail||"")!==email){ c.teacherEmail=email; changed=true; }
    });
    return changed;
}
window.syncClassFacultyAuthLinks = syncClassFacultyAuthLinks;

/* ---------------- FACULTY ---------------- */
/* v22: Grade entry derives Subjects + Students from the realtime classes relationship. */
function currentFaculty(){
    const email=String(window.cecFirebase?.email || firebase?.auth?.().currentUser?.email || "").trim().toLowerCase();
    const teacherId=String(window.cecFirebase?.teacherId || localStorage.getItem("cecCurrentFaculty") || "");
    return db.teachers.find(t =>
        (teacherId && String(t.id)===teacherId) &&
        String(t.email||"").trim().toLowerCase()===email &&
        t.status==="Active"
    ) || db.teachers.find(t =>
        String(t.email||"").trim().toLowerCase()===email && t.status==="Active"
    ) || null;
}
function facultySubjects(){
    const t=currentFaculty(); if(!t) return [];
    const teacherId=String(t.id||"");
    const map=new Map();

    // Primary source for Faculty academic access: the classes already assigned
    // to this teacher in Firestore. This keeps Grades connected even when an
    // older/missing subject document is not present in the local cache.
    (db.classes||[]).filter(c=>{
        return String(c.teacherId||"")===teacherId ||
               String(c.teacherAuthUid||"")===String(window.cecFirebase?.uid||"") ||
               String(c.teacherEmail||"").trim().toLowerCase()===String(window.cecFirebase?.email||"").trim().toLowerCase();
    }).forEach(c=>{
        const code=String(c.subjectCode||c.code||"").trim();
        if(!code) return;
        const existing=db.subjects.find(s=>String(s.code||s.id||"")===code);
        map.set(code,{
            ...(existing||{}),
            id:existing?.id||code,
            code,
            name:String(c.subject||c.subjectName||existing?.name||existing?.subject||code),
            subject:String(c.subject||c.subjectName||existing?.subject||existing?.name||code),
            units:Number(c.subjectUnits||c.units||existing?.units||3),
            teacherId:teacherId,
            schedule:c.schedule||existing?.schedule||"",
            room:c.room||existing?.room||""
        });
    });

    // Include subject records too, for teachers whose subject was created by
    // Admin before a class was created. Classes remain the authoritative link.
    db.subjects.filter(x=>String(x.teacherId||"")===teacherId).forEach(x=>{
        const code=String(x.code||x.id||"").trim();
        if(code && !map.has(code)) map.set(code,x);
    });
    return [...map.values()];
}
function facultyClasses(){
    const t=currentFaculty();
    const teacherId=String(t?.id || window.cecFirebase?.teacherId || localStorage.getItem("cecCurrentFaculty") || "").trim();
    const authUid=String(window.cecFirebase?.uid || firebase?.auth?.().currentUser?.uid || "").trim();
    const email=String(window.cecFirebase?.email || firebase?.auth?.().currentUser?.email || "").trim().toLowerCase();
    if(!teacherId && !authUid && !email) return [];
    const seen=new Set();
    return (db.classes||[]).filter(x=>{
        const match=(teacherId && String(x.teacherId||"").trim()===teacherId) ||
                    (authUid && String(x.teacherAuthUid||"").trim()===authUid) ||
                    (email && String(x.teacherEmail||"").trim().toLowerCase()===email);
        if(!match) return false;
        const id=String(x.id||x.classId||"");
        if(seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}
function gradeAverage(g){
    const vals=[g.prelim,g.midterm,g.semiFinal,g.final].map(v=>String(v??"").trim());
    if(vals.some(v=>v==="")) return "Incomplete";
    const nums=vals.map(Number);
    if(nums.some(v=>!Number.isFinite(v))) return "Incomplete";
    return (nums.reduce((a,v)=>a+v,0)/4).toFixed(2);
}
function weightedSemesterAverage(rows){
    const complete=rows.map(g=>({average:Number(gradeAverage(g)),units:Number(g.units||0)}))
        .filter(x=>Number.isFinite(x.average) && x.units>0);
    const totalUnits=complete.reduce((sum,x)=>sum+x.units,0);
    return totalUnits ? (complete.reduce((sum,x)=>sum+x.average*x.units,0)/totalUnits).toFixed(2) : "—";
}
function gradeSubjectName(g){
    const existing=String(g?.subject||g?.subjectName||"").trim();
    if(existing) return existing;
    const code=String(g?.code||g?.subjectCode||"").trim();
    const classId=String(g?.classId||"").trim();
    if(classId){
        const cls=(db.classes||[]).find(c=>String(c.id||c.classId||"")===classId);
        const className=String(cls?.subject||cls?.subjectName||"").trim();
        if(className) return className;
    }
    if(code){
        const cls=(db.classes||[]).find(c=>String(c.subjectCode||c.code||"").trim()===code);
        const className=String(cls?.subject||cls?.subjectName||"").trim();
        if(className) return className;
        const subject=(db.subjects||[]).find(s=>String(s.code||s.id||"").trim()===code);
        const subjectName=String(subject?.name||subject?.subject||subject?.subjectName||"").trim();
        if(subjectName) return subjectName;
    }
    return "";
}
async function facultyGradeForm(obj){
    const teacher=currentFaculty();
    if(!teacher){ toast("You are not authorized to enter grades.","error"); return; }

    // Ensure the student cache is hydrated from the currently assigned classes
    // before the modal is rendered. This prevents a race where the class listener
    // has arrived but the student documents are still being fetched.
    if(window.hydrateFacultyStudentsFromClasses){
        try { await window.hydrateFacultyStudentsFromClasses(); } catch(e) { console.warn("Faculty grade student hydration failed",e); }
    }
    const assignedSubjects=facultySubjects();
    const assignedClasses=facultyClasses();
    const allowedSubjectCodes=new Set(assignedSubjects.map(s=>String(s.code||"")));
    const subjectOptions=assignedSubjects.map(sub=>`<option value="${escapeHTML(sub.code||sub.id||'')}" data-name="${escapeHTML(sub.name||sub.subject||'')}" data-units="${Number(sub.units||3)}" ${obj?.code===sub.code?"selected":""}>${escapeHTML(sub.code||'')} — ${escapeHTML(sub.name||sub.subject||'')}</option>`).join("");

    const studentsForSubject = (code) => {
        const subject=assignedSubjects.find(s=>String(s.code||"")===String(code||""));
        if(!subject) return [];
        const relevantClasses=assignedClasses.filter(c=>
            String(c.subjectCode||c.code||"").trim()===String(subject.code||"").trim()
        );
        const ids=new Set();
        relevantClasses.forEach(c=>{
            if(Array.isArray(c.studentIds) && c.studentIds.length){
                c.studentIds.forEach(id=>ids.add(String(id)));
            }else{
                db.students.forEach(st=>{
                    const sameSection=String(c.section||"").trim().toLowerCase()===String(st.section||"").trim().toLowerCase();
                    const sameProgram=!c.program || normalizeCourse(c.program)===normalizeCourse(st.program);
                    const sameYear=!c.year || String(c.year).trim().toLowerCase()===String(st.year||"").trim().toLowerCase();
                    if(sameSection && sameProgram && sameYear) ids.add(String(st.id));
                });
            }
        });
        return db.students.filter(st=>ids.has(String(st.id)) || ids.has(String(st.firestoreId)));
    };
    const classForStudentSubject=(studentId,code)=>{
        const student=db.students.find(st=>String(st.id)===String(studentId)||String(st.firestoreId||"")===String(studentId));
        const studentIds=new Set([String(studentId),String(student?.id||""),String(student?.firestoreId||"")].filter(Boolean));
        return assignedClasses.find(c=>{
            if(String(c.subjectCode||c.code||"")!==String(code||"")) return false;
            if(Array.isArray(c.studentIds)&&c.studentIds.length){
                return c.studentIds.map(String).some(id=>studentIds.has(id));
            }
            return !!student &&
                String(c.section||"").trim().toLowerCase()===String(student.section||"").trim().toLowerCase() &&
                (!c.program||normalizeCourse(c.program)===normalizeCourse(student.program)) &&
                (!c.year||String(c.year)===String(student.year));
        });
    };
    const initialCode=obj?.code || assignedSubjects[0]?.code || "";
    const initialStudents=studentsForSubject(initialCode);

    formModal(obj?"Edit Student Grade":"Enter Student Grade",`
        <label>Subject<select name="code" id="facultyGradeSubject" required>${subjectOptions}</select></label>
        <label>Student<select name="studentId" id="facultyGradeStudent" required>
            ${initialStudents.map(st=>`<option value="${escapeHTML(st.id)}" ${obj?.studentId===st.id?"selected":""}>${escapeHTML(st.name)} (${escapeHTML(st.id)})</option>`).join("") || '<option value="">No students assigned to this subject</option>'}
        </select></label>
        <input type="hidden" name="subject" id="facultyGradeSubjectName">
        <input type="hidden" name="units" id="facultyGradeUnits">
        <input type="hidden" name="classId" id="facultyGradeClassId" value="${escapeHTML(obj?.classId||"")}">
        <label>Prelim<input name="prelim" type="number" min="0" max="100" step="0.01" value="${obj?.prelim??""}" required></label>
        <label>Midterm<input name="midterm" type="number" min="0" max="100" step="0.01" value="${obj?.midterm??""}" required></label>
        <label>Semi-Final<input name="semiFinal" type="number" min="0" max="100" step="0.01" value="${obj?.semiFinal??""}" required></label>
        <label>Final<input name="final" type="number" min="0" max="100" step="0.01" value="${obj?.final??""}" required></label>
        <label>Semester<select name="semester">
            <option ${(!obj?.semester||obj?.semester==="1st Semester"||obj?.semester==="First Semester")?"selected":""}>1st Semester</option>
            <option ${obj?.semester==="2nd Semester"||obj?.semester==="Second Semester"?"selected":""}>2nd Semester</option>
        </select></label>
        <label>School Year<input name="schoolYear" value="${escapeHTML(obj?.schoolYear||"2026-2027")}" required></label>
    `,obj?"Save Grade":"Save Grade",async fd=>{
        const d=Object.fromEntries(fd.entries());
        d.teacherId=teacher.id;
        d.units=Number(d.units||3);
        d.prelim=Number(d.prelim); d.midterm=Number(d.midterm); d.semiFinal=Number(d.semiFinal); d.final=Number(d.final);
        if([d.prelim,d.midterm,d.semiFinal,d.final].some(v=>!Number.isFinite(v) || v<0 || v>100)){
            toast("Grades must be between 0 and 100.","error"); return;
        }
        if(!allowedSubjectCodes.has(String(d.code))){
            toast("You are not assigned to this subject.","error"); return;
        }
        let selectedStudent=db.students.find(s=>String(s.id)===String(d.studentId) || String(s.firestoreId||"")===String(d.studentId));
        const selectedClass=classForStudentSubject(d.studentId,d.code);
        if(!selectedStudent || !selectedClass){
            toast("You are not assigned to this student's class for this subject.","error"); return;
        }

        // Firestore grades.classId must always be the canonical classes/{id}
        // document ID. Never derive it from teacherId or a compatibility key.
        if(!selectedClass || !selectedClass.id){
            throw new Error("The selected class does not have a valid Firestore class ID.");
        }
        const studentId=String(selectedStudent.id);
        if(!Array.isArray(selectedClass.studentIds) ||
           !selectedClass.studentIds.map(String).includes(studentId)){
            throw new Error("The selected student is not assigned to this class.");
        }
        if(String(selectedClass.subjectCode || selectedClass.code || "") !== String(d.code)){
            throw new Error("The selected subject does not match the assigned class.");
        }
        const selectedClassSubject=String(selectedClass.subject||selectedClass.subjectName||"").trim();
        const selectedSubject=assignedSubjects.find(s=>String(s.code||s.id||"")===String(d.code));
        const resolvedSubjectName=selectedClassSubject || String(selectedSubject?.name||selectedSubject?.subject||"").trim();
        if(!resolvedSubjectName){
            throw new Error("The selected class does not have a valid subject name.");
        }
        d.subject=resolvedSubjectName;

        // IMPORTANT: d.studentId is the public Student ID, not necessarily the
        // Firestore document ID. Never silently use the public ID as the
        // studentFirestoreId because Firestore Security Rules validate the
        // actual students/{documentId} record.
        let studentFirestoreId=String(selectedStudent.firestoreId||"").trim();
        if(!studentFirestoreId){
            try{
                const directSnap=await firebase.firestore().collection("students").doc(String(d.studentId)).get();
                if(directSnap.exists){
                    selectedStudent={...directSnap.data(),firestoreId:directSnap.id};
                    studentFirestoreId=directSnap.id;
                }else{
                    const q=await firebase.firestore().collection("students").where("id","==",String(d.studentId)).limit(1).get();
                    if(!q.empty){
                        selectedStudent={...q.docs[0].data(),firestoreId:q.docs[0].id};
                        studentFirestoreId=q.docs[0].id;
                    }
                }
            }catch(resolveError){
                console.error("Unable to resolve the student's Firestore document:",resolveError);
            }
        }
        if(!studentFirestoreId){
            console.error("Faculty grade blocked: no Firestore student document ID resolved.",{
                studentId:d.studentId,
                classId:selectedClass.id,
                subjectCode:d.code
            });
            toast("Unable to identify this student's Firebase record. Please refresh and try again.","error");
            return;
        }
        d.classId=String(selectedClass.id);
        d.studentFirestoreId=studentFirestoreId;
        d.semesterAverage=Number(((d.prelim+d.midterm+d.semiFinal+d.final)/4).toFixed(2));
        d.grade=d.semesterAverage;
        d.semester=d.semester||"1st Semester";
        d.schoolYear=d.schoolYear||"2026-2027";
        d.updatedAt=nowISO();
        try{
            if(obj && String(obj.teacherId)!==String(teacher.id)){
                toast("You cannot edit this grade.","error");
                return;
            }
            const gradeRecord={...(obj||{}),...d,id:String(obj?.id||uid("G-")),teacherId:String(teacher.id)};
            console.log("Faculty grade write payload:", {
                gradeId:gradeRecord.id,
                teacherId:gradeRecord.teacherId,
                studentId:gradeRecord.studentId,
                studentFirestoreId:gradeRecord.studentFirestoreId,
                classId:gradeRecord.classId,
                code:gradeRecord.code
            });
            const saved=await window.saveFacultyGrade(gradeRecord);
            if(!saved){ throw new Error("Firestore rejected the grade write."); }
            closeDynamic(); openFacultyView("grades");
            toast("Grade saved to Firebase.");
        }catch(error){
            console.error("Faculty grade save failed:",error);
            toast("Failed to save grade. Please try again.","error");
        }
    },root=>{
        const sync=()=>{
            const subject=root.querySelector('#facultyGradeSubject');
            const o=subject?.selectedOptions[0];
            if(!o)return;
            root.querySelector('#facultyGradeSubjectName').value=o.dataset.name||"";
            root.querySelector('#facultyGradeUnits').value=o.dataset.units||3;
            const studentSelect=root.querySelector('#facultyGradeStudent');
            const classInput=root.querySelector('#facultyGradeClassId');
            if(!studentSelect)return;
            const previous=studentSelect.value;
            const rows=studentsForSubject(subject.value);
            studentSelect.innerHTML=rows.map(st=>`<option value="${escapeHTML(st.id)}">${escapeHTML(st.name)} (${escapeHTML(st.id)})</option>`).join("") || '<option value="">No students assigned to this subject</option>';
            if(rows.some(st=>String(st.id)===String(previous))) studentSelect.value=previous;
            const cls=classForStudentSubject(studentSelect.value,subject.value); if(classInput)classInput.value=cls?.id||"";
        };
        root.querySelector('#facultyGradeSubject')?.addEventListener('change',sync); root.querySelector('#facultyGradeStudent')?.addEventListener('change',()=>{const cls=classForStudentSubject(root.querySelector('#facultyGradeStudent')?.value,root.querySelector('#facultyGradeSubject')?.value);const ci=root.querySelector('#facultyGradeClassId');if(ci)ci.value=cls?.id||"";}); sync();
    });
}
async function facultyMaterialManager(classId){
    const teacher=currentFaculty();
    const selectedClass=facultyClasses().find(c=>String(c.id)===String(classId));
    if(!teacher||!selectedClass){toast("The selected class is no longer assigned to you.","error");return;}
    const materials=(db.materials||[]).filter(m=>String(m.classId)===String(selectedClass.id));
    openModal(`<div class="modal-head"><div><h2>Syllabi & Materials</h2><small>${escapeHTML(selectedClass.subject||selectedClass.subjectName||selectedClass.subjectCode||selectedClass.code||"")} · ${escapeHTML(selectedClass.section||"")}</small></div><button data-close-modal>×</button></div>
        <div class="modal-body material-manager">
            <form id="facultyMaterialForm" class="form-grid">
                <label>Title<input name="title" required placeholder="e.g. Course Syllabus"></label>
                <label>Type<select name="type"><option>Syllabus</option><option>Module</option><option>Lecture Material</option><option>Assignment</option><option>Reference</option></select></label>
                <label class="full-width">Description<textarea name="description" rows="3" placeholder="Optional description"></textarea></label>
                <label class="full-width">File<input name="file" type="file" required accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp,.zip"></label>
                <div class="form-actions"><button class="primary-btn" type="submit">Upload Material</button></div>
            </form>
            <div class="material-manager-list"><h3>Posted Materials</h3>${materials.slice().sort((a,b)=>String(b.postedAt||"").localeCompare(String(a.postedAt||""))).map(m=>`<div class="material-manager-row"><div><b>${escapeHTML(m.title||m.fileName||"Material")}</b><small>${escapeHTML(m.type||"Material")} · ${escapeHTML(m.fileName||"")} ${m.size?`· ${formatFileSize(m.size)}`:""}</small></div><button type="button" class="small-action danger delete-class-material" data-material-id="${escapeHTML(m.id)}">Delete</button></div>`).join("")||`<div class="empty">No materials posted for this class yet.</div>`}</div>
        </div>`,root=>{
            root.querySelector('#facultyMaterialForm').onsubmit=async e=>{
                e.preventDefault();
                const fd=new FormData(e.target);
                const file=fd.get('file');
                const btn=e.target.querySelector('button[type="submit"]');
                if(!(file instanceof File)||!file.size){toast("Choose a file to upload.","error");return;}
                btn.disabled=true;btn.textContent="Uploading…";
                try{
                    await window.saveFacultyMaterial({classId:selectedClass.id,title:fd.get('title'),type:fd.get('type'),description:fd.get('description'),file});
                    toast("Material uploaded. Students can now download it.");
                    closeDynamic();
                    openFacultyView("classes");
                }catch(error){
                    console.error("Faculty material upload failed:",error);
                    toast(error?.message||"Unable to upload material.","error");
                    btn.disabled=false;btn.textContent="Upload Material";
                }
            };
            root.querySelectorAll('.delete-class-material').forEach(btn=>btn.onclick=async()=>{
                const material=(db.materials||[]).find(m=>String(m.id)===String(btn.dataset.materialId));
                if(!material)return;
                if(!window.confirm(`Delete ${material.title||material.fileName||"this material"}?`))return;
                btn.disabled=true;
                try{await window.deleteFacultyMaterial(material);toast("Material deleted.");closeDynamic();facultyMaterialManager(selectedClass.id);}
                catch(error){console.error("Faculty material delete failed:",error);toast(error?.message||"Unable to delete material.","error");btn.disabled=false;}
            });
        });
}

let facultyAttendanceState = { classId:"", date:today() };
let facultyAttendanceTab = 'take'; // 'take' | 'history'
let facultyAttendanceHistoryFilters = { dateFrom:"", dateTo:"", classId:"", search:"", status:"" };

function facultyAttendanceStudents(selectedClass){
    if(!selectedClass) return [];
    const ids=Array.isArray(selectedClass.studentIds) ? selectedClass.studentIds.map(String) : [];
    const rows=ids.map(id=>db.students.find(st=>String(st.id)===id || String(st.firestoreId||"")===id)).filter(Boolean);
    if(rows.length) return rows;
    return db.students.filter(st=>String(st.section||"").trim()===String(selectedClass.section||"").trim()
        && (!selectedClass.program || normalizeCourse(st.program)===normalizeCourse(selectedClass.program))
        && (!selectedClass.year || String(st.year)===String(selectedClass.year||"")));
}

function facultyAttendanceView(){
    const classes=facultyClasses();
    if(!classes.length) return panel("Attendance",`<div class="info-box">No assigned classes are available for attendance.</div>`);
    const tabsHTML=`<div class="att-tab-bar"><button class="att-tab-btn${facultyAttendanceTab==='take'?' active':''}" data-att-tab="take">📋 Take Attendance</button><button class="att-tab-btn${facultyAttendanceTab==='history'?' active':''}" data-att-tab="history">📊 View History</button></div>`;
    if(facultyAttendanceTab==='history') return panel("Attendance", tabsHTML + facultyAttendanceHistoryView());
    if(!classes.some(c=>String(c.id)===String(facultyAttendanceState.classId))) facultyAttendanceState.classId=String(classes[0].id);
    const selectedClass=classes.find(c=>String(c.id)===String(facultyAttendanceState.classId))||classes[0];
    facultyAttendanceState.classId=String(selectedClass.id);
    const date=facultyAttendanceState.date||today();
    const students=facultyAttendanceStudents(selectedClass);
    const existing=(db.attendance||[]).filter(a=>String(a.classId||"")===String(selectedClass.id)&&String(a.date||"")===date);
    const byStudent=new Map(existing.map(a=>[String(a.studentId),a]));
    const subject=String(selectedClass.subject||selectedClass.subjectName||selectedClass.subjectCode||selectedClass.code||"");
    const rows=students.map(st=>{
        const a=byStudent.get(String(st.id))||byStudent.get(String(st.firestoreId||""));
        return `<tr><td>${escapeHTML(st.name||st.fullName||st.id)}<small>${escapeHTML(st.id||"")}</small></td><td><select class="faculty-att-status" data-student-id="${escapeHTML(st.id)}"><option ${a?.status==="Present"?"selected":""}>Present</option><option ${a?.status==="Late"?"selected":""}>Late</option><option ${a?.status==="Absent"?"selected":""}>Absent</option><option ${a?.status==="Excused"?"selected":""}>Excused</option></select></td><td><input class="faculty-att-remarks" data-student-id="${escapeHTML(st.id)}" value="${escapeHTML(a?.remarks||"")}" placeholder="Optional"></td></tr>`;
    }).join("")||emptyRow(3);
    return panel("Attendance",
        tabsHTML+
        `<div class="info-box">Take attendance for your assigned class. Faculty can record and update attendance; Admin monitors the saved records.</div>`+
        `<div class="form-grid"><label>Class<select id="facultyAttendanceClass">${classes.map(c=>`<option value="${escapeHTML(c.id)}" ${String(c.id)===String(selectedClass.id)?"selected":""}>${escapeHTML(c.subject||c.subjectName||c.subjectCode||c.code||"Class")} · ${escapeHTML(c.section||"—")}</option>`).join("")}</select></label><label>Date<input id="facultyAttendanceDate" type="date" value="${escapeHTML(date)}"></label></div>`+
        `<div class="panel-actions"><button class="primary-btn" id="saveFacultyAttendance">Save Attendance</button></div>`+
        `<div class="table-scroll"><table class="data-table"><thead><tr><th>Student</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

async function saveFacultyAttendance(){
    const teacher=currentFaculty();
    const classId=String(facultyAttendanceState.classId||"");
    const selectedClass=facultyClasses().find(c=>String(c.id)===classId);
    if(!teacher||!selectedClass){toast("The selected class is no longer assigned to you.","error");return;}
    const students=facultyAttendanceStudents(selectedClass);
    if(!students.length){toast("There are no students assigned to this class.","error");return;}
    const date=facultyAttendanceState.date||today();
    const subject=String(selectedClass.subject||selectedClass.subjectName||selectedClass.subjectCode||selectedClass.code||"");
    const firestore=firebase.firestore();
    const batch=firestore.batch();
    let writes=0;
    for(const st of students){
        const status=document.querySelector(`.faculty-att-status[data-student-id="${CSS.escape(String(st.id))}"]`)?.value||"Present";
        const remarks=document.querySelector(`.faculty-att-remarks[data-student-id="${CSS.escape(String(st.id))}"]`)?.value?.trim()||"";
        const existing=(db.attendance||[]).find(a=>String(a.classId||"")===classId&&String(a.date||"")===date&&(String(a.studentId)===String(st.id)||String(a.studentId)===String(st.firestoreId||"")));
        const id=String(existing?.id||uid("A-"));
        const ref=firestore.collection("attendance").doc(id);
        const data={id,teacherId:String(teacher.id),classId,studentId:String(st.id),studentFirestoreId:String(st.firestoreId||st.id),subject,subjectCode:String(selectedClass.subjectCode||selectedClass.code||""),date,status,remarks,updatedAt:nowISO()};
        if(!existing) data.createdAt=nowISO();
        batch.set(ref,data,{merge:true});
        writes++;
    }
    try{
        await batch.commit();
        await window.cecAuditLog?.("update","attendance",`${classId}__${date}`,{classId,date,subject,recordCount:writes,label:"Faculty attendance"});
        facultyAttendanceState.date=date;
        toast(`${writes} attendance record${writes===1?"":"s"} saved.`);
        await cecDatabase.refresh();
        openFacultyView("attendance");
    }catch(error){
        console.error("Faculty attendance save failed:",error);
        toast(error?.message||"Unable to save attendance. Check your connection and Security Rules.","error");
    }
}

function facultyAttendanceHistoryView(){
    const classes=facultyClasses();
    const f=facultyAttendanceHistoryFilters;
    // Filter and gather attendance records
    let records=(db.attendance||[]).filter(a=>{
        const teacher=currentFaculty();
        if(teacher && String(a.teacherId||"")!==String(teacher.id)) return false;
        if(f.classId && String(a.classId||"")!==String(f.classId)) return false;
        if(f.dateFrom && String(a.date||"")<String(f.dateFrom)) return false;
        if(f.dateTo && String(a.date||"")>String(f.dateTo)) return false;
        if(f.status && f.status!=="All" && String(a.status||"")!==f.status) return false;
        if(f.search){
            const q=f.search.toLowerCase();
            const st=db.students.find(s=>String(s.id)===String(a.studentId)||String(s.firestoreId||"")===String(a.studentId));
            const hay=`${st?.name||""} ${a.studentId} ${a.subject||""}`.toLowerCase();
            if(!hay.includes(q)) return false;
        }
        return true;
    });
    records=records.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));

    // Summary metrics
    const total=records.length;
    const countPresent=records.filter(r=>r.status==="Present").length;
    const countAbsent=records.filter(r=>r.status==="Absent").length;
    const countLate=records.filter(r=>r.status==="Late").length;
    const countExcused=records.filter(r=>r.status==="Excused").length;

    // Per-student summary
    const studentMap=new Map();
    records.forEach(r=>{
        const sid=String(r.studentId||"");
        if(!studentMap.has(sid)) studentMap.set(sid,{present:0,absent:0,late:0,excused:0,total:0,classId:r.classId,subject:r.subject||r.subjectCode||""});
        const s=studentMap.get(sid);
        s.total++;
        if(r.status==="Present") s.present++;
        else if(r.status==="Absent") s.absent++;
        else if(r.status==="Late") s.late++;
        else if(r.status==="Excused") s.excused++;
    });
    const lowAttendanceStudents=[];
    const summaryRows=[...studentMap.entries()].map(([sid,s])=>{
        const st=db.students.find(x=>String(x.id)===sid||String(x.firestoreId||"")===sid);
        const pct=s.total>0?Math.round(((s.present+s.late+s.excused)/s.total)*100):0;
        if(pct<75 && st) lowAttendanceStudents.push({name:st.name||st.fullName||sid,pct,sid});
        const badge=pct>=90?'<span class="att-pct-badge green">'+pct+'%</span>':pct>=75?'<span class="att-pct-badge yellow">'+pct+'%</span>':'<span class="att-pct-badge red">'+pct+'%</span>';
        return `<tr><td>${escapeHTML(st?.name||st?.fullName||sid)}<small>${escapeHTML(sid)}</small></td><td>${escapeHTML(s.subject||"—")}</td><td>${s.total}</td><td>${s.present}</td><td>${s.absent}</td><td>${s.late}</td><td>${s.excused}</td><td>${badge}</td></tr>`;
    }).join("")||emptyRow(8);

    // Low-attendance alert
    const alertBanner=lowAttendanceStudents.length?
        `<div class="att-low-alert">⚠️ <b>Low Attendance Alert:</b> ${lowAttendanceStudents.map(x=>`<span>${escapeHTML(x.name)} (${x.pct}%)</span>`).join(", ")} — students below 75% attendance threshold.</div>`:"";

    // Detail rows
    const detailRows=records.map(r=>{
        const st=db.students.find(x=>String(x.id)===String(r.studentId)||String(x.firestoreId||"")===String(r.studentId));
        const cls=classes.find(c=>String(c.id)===String(r.classId||""));
        return `<tr><td>${formatDate(r.date)}</td><td>${escapeHTML(st?.name||st?.fullName||r.studentId)}<small>${escapeHTML(r.studentId||"")}</small></td><td>${escapeHTML(r.subject||r.subjectCode||"—")}</td><td>${escapeHTML(cls?.section||"—")}</td><td><span class="status-chip ${String(r.status||"").toLowerCase()}">${escapeHTML(r.status||"—")}</span></td><td>${escapeHTML(r.remarks||"")}</td><td><button class="small-action att-hist-edit" data-att-id="${escapeHTML(r.id||"")}">Edit</button></td></tr>`;
    }).join("")||emptyRow(7);

    // Pending excuse requests for faculty classes
    const myClassIds=new Set(classes.map(c=>String(c.id)));
    const pendingExcuses=(db.excuseRequests||[]).filter(e=>String(e.status||"")==="Pending" && myClassIds.has(String(e.classId||"")));
    const excuseSection=pendingExcuses.length?`<div class="att-section-title">📩 Pending Excuse Requests (${pendingExcuses.length})</div><div class="table-scroll"><table class="data-table"><thead><tr><th>Student</th><th>Date</th><th>Subject</th><th>Reason</th><th>Action</th></tr></thead><tbody>${pendingExcuses.map(e=>{const st=db.students.find(s=>String(s.id)===String(e.studentId||""));return `<tr><td>${escapeHTML(st?.name||e.studentName||e.studentId)}</td><td>${formatDate(e.date)}</td><td>${escapeHTML(e.subject||"—")}</td><td>${escapeHTML(e.reason||"—")}</td><td><button class="small-action primary" data-excuse-approve="${escapeHTML(e.id)}">Approve</button> <button class="small-action danger" data-excuse-reject="${escapeHTML(e.id)}">Reject</button></td></tr>`}).join("")}</tbody></table></div>`:"";

    const classOptions=`<option value="">All Classes</option>`+classes.map(c=>`<option value="${escapeHTML(c.id)}" ${f.classId===String(c.id)?"selected":""}>${escapeHTML(c.subject||c.subjectName||c.subjectCode||c.code||"Class")} · ${escapeHTML(c.section||"—")}</option>`).join("");
    return `
    ${alertBanner}
    ${excuseSection}
    <div class="att-history-filters">
        <label>From<input type="date" id="attHistFrom" value="${escapeHTML(f.dateFrom)}"></label>
        <label>To<input type="date" id="attHistTo" value="${escapeHTML(f.dateTo)}"></label>
        <label>Class<select id="attHistClass">${classOptions}</select></label>
        <label>Search<input type="text" id="attHistSearch" value="${escapeHTML(f.search)}" placeholder="Name or ID..."></label>
        <label>Status<select id="attHistStatus"><option ${!f.status||f.status==="All"?"selected":""}>All</option><option ${f.status==="Present"?"selected":""}>Present</option><option ${f.status==="Absent"?"selected":""}>Absent</option><option ${f.status==="Late"?"selected":""}>Late</option><option ${f.status==="Excused"?"selected":""}>Excused</option></select></label>
        <button class="secondary-btn" id="attHistClear">Clear</button>
    </div>
    <div class="att-summary-row">
        <div class="att-metric present"><b>${countPresent}</b><span>Present</span></div>
        <div class="att-metric absent"><b>${countAbsent}</b><span>Absent</span></div>
        <div class="att-metric late"><b>${countLate}</b><span>Late</span></div>
        <div class="att-metric excused"><b>${countExcused}</b><span>Excused</span></div>
        <div class="att-metric total"><b>${total}</b><span>Total Records</span></div>
    </div>
    <div class="att-section-title">📋 Per-Student Summary</div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Student</th><th>Subject</th><th>Total</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th><th>Attendance %</th></tr></thead><tbody>${summaryRows}</tbody></table></div>
    <div class="panel-actions" style="justify-content:space-between;align-items:center;margin-top:20px">
        <div class="att-section-title" style="margin:0">📅 Attendance Detail Records (${records.length})</div>
        <button class="secondary-btn" id="attExportCSV">⬇ Export CSV</button>
    </div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Student</th><th>Subject</th><th>Section</th><th>Status</th><th>Remarks</th><th>Action</th></tr></thead><tbody>${detailRows}</tbody></table></div>`;
}

function exportAttendanceCSV(records, students, classes){
    const headers=["Date","Student Name","Student ID","Subject","Section","Status","Remarks"];
    const esc=v=>'"'+String(v||"").replace(/"/g,'""')+'"';
    const rows=records.map(r=>{
        const st=students.find(x=>String(x.id)===String(r.studentId)||String(x.firestoreId||"")===String(r.studentId));
        const cls=classes.find(c=>String(c.id)===String(r.classId||""));
        return [formatDate(r.date),st?.name||st?.fullName||r.studentId,r.studentId,r.subject||r.subjectCode||"",cls?.section||"",r.status||"",r.remarks||""].map(esc).join(",");
    });
    const csv=[headers.map(esc).join(","),...rows].join("\r\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`attendance_export_${today()}.csv`;
    document.body.appendChild(a);a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
    toast("Attendance exported as CSV.");
}

function facultyAttendanceEditModal(record){
    if(!record){toast("Attendance record not found.","error");return;}
    const st=db.students.find(x=>String(x.id)===String(record.studentId)||String(x.firestoreId||"")===String(record.studentId));
    openModal(`<div class="modal-head"><h2>Edit Attendance Record</h2><button data-close-modal>×</button></div>
    <div class="modal-body form-grid">
        <div class="info-box"><b>Student:</b> ${escapeHTML(st?.name||st?.fullName||record.studentId)}<br><b>Date:</b> ${formatDate(record.date)}<br><b>Subject:</b> ${escapeHTML(record.subject||record.subjectCode||"—")}</div>
        <label>Status<select id="attEditStatus"><option ${record.status==="Present"?"selected":""}>Present</option><option ${record.status==="Late"?"selected":""}>Late</option><option ${record.status==="Absent"?"selected":""}>Absent</option><option ${record.status==="Excused"?"selected":""}>Excused</option></select></label>
        <label>Remarks<input id="attEditRemarks" value="${escapeHTML(record.remarks||"")}" placeholder="Optional remarks"></label>
        <div class="form-actions"><button class="secondary-btn" data-close-modal>Cancel</button><button class="primary-btn" id="attEditSave">Save Changes</button></div>
    </div>`,root=>{
        root.querySelector("#attEditSave").onclick=async()=>{
            const btn=root.querySelector("#attEditSave");
            btn.disabled=true;btn.textContent="Saving...";
            const status=root.querySelector("#attEditStatus").value;
            const remarks=root.querySelector("#attEditRemarks").value.trim();
            try{
                const firestore=firebase.firestore();
                await firestore.collection("attendance").doc(String(record.id)).set({status,remarks,updatedAt:nowISO()},{merge:true});
                await window.cecAuditLog?.("update","attendance",String(record.id),{studentId:record.studentId,date:record.date,status,label:"Faculty attendance edit"});
                const idx=(db.attendance||[]).findIndex(a=>String(a.id)===String(record.id));
                if(idx>=0){db.attendance[idx]={...db.attendance[idx],status,remarks,updatedAt:nowISO()};}
                toast("Attendance record updated.");
                closeDynamic();
                openFacultyView("attendance");
            }catch(error){
                console.error("Attendance edit failed:",error);
                toast(error?.message||"Unable to update attendance record.","error");
                btn.disabled=false;btn.textContent="Save Changes";
            }
        };
    });
}

const facultyViews = {
    home: function(){
        const t = currentFaculty();
        const classes = facultyClasses();
        const allStudentIds = new Set();
        classes.forEach(c => {
            if(Array.isArray(c.studentIds)) c.studentIds.forEach(id => allStudentIds.add(String(id)));
            else db.students.filter(st => String(c.section||'').trim()===String(st.section||'').trim() && (!c.program||normalizeCourse(c.program)===normalizeCourse(st.program))).forEach(st => allStudentIds.add(st.id));
        });
        const totalStudents = allStudentIds.size;
        const myGrades = db.grades.filter(g => String(g.teacherId) === String(t?.id));
        const gradesEntered = myGrades.length;
        // Avg attendance across all my students
        const attStats = [...allStudentIds].map(sid => attendanceStats(sid));
        const avgAtt = attStats.length ? Math.round(attStats.reduce((a,s)=>a+s.pct,0)/attStats.length) : 100;
        // Recent attendance sessions by this faculty
        const myAttendance = (db.attendance||[]).filter(a => String(a.teacherId)===String(t?.id));
        const sessionMap = {};
        myAttendance.forEach(a => {
            const key = `${a.date}|${a.classId}`;
            if(!sessionMap[key]) sessionMap[key] = {date:a.date, classId:a.classId, subject:a.subject||a.subjectCode||'—', section:'', present:0, absent:0, late:0, total:0};
            sessionMap[key].total++;
            if(a.status==='Present') sessionMap[key].present++;
            else if(a.status==='Absent') sessionMap[key].absent++;
            else if(a.status==='Late') sessionMap[key].late++;
        });
        const recentSessions = Object.values(sessionMap).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
        // Students needing attention
        const students = [...allStudentIds].map(id => db.students.find(st=>String(st.id)===id||String(st.firestoreId||'')===id)).filter(Boolean);
        const attentionRows = students.map(st=>({student:st, radar:phase2StudentRadar(st.id)}))
            .filter(x => x.radar.level !== 'On Track')
            .sort((a,b) => ({High:0,Watch:1}[a.radar.level]||0) - (({High:0,Watch:1}[b.radar.level]||0)))
            .slice(0,6);
        const onTrackCount = students.length - attentionRows.length;
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const name = escapeHTML(t?.name || t?.fullName || 'Faculty Member');
        const dept = escapeHTML(t?.department || 'Faculty');
        return `<section class="content-panel">
        <div class="faculty-welcome-bar">
            <div class="faculty-welcome-left">
                <span class="faculty-welcome-greeting">${greeting}, <strong>${name}</strong></span>
                <span class="faculty-welcome-dept">${dept}</span>
            </div>
            <span class="faculty-welcome-date panel-date">${formatDate(today())}</span>
        </div>
        <div class="faculty-kpi-grid">
            <div class="faculty-kpi-card">
                <div class="faculty-kpi-icon kpi-blue">▤</div>
                <div><b>${classes.length}</b><span>My Classes</span></div>
            </div>
            <div class="faculty-kpi-card">
                <div class="faculty-kpi-icon kpi-green">👥</div>
                <div><b>${totalStudents}</b><span>Total Students</span></div>
            </div>
            <div class="faculty-kpi-card">
                <div class="faculty-kpi-icon kpi-purple">▥</div>
                <div><b>${gradesEntered}</b><span>Grades Entered</span></div>
            </div>
            <div class="faculty-kpi-card">
                <div class="faculty-kpi-icon kpi-orange">◉</div>
                <div><b>${avgAtt}%</b><span>Avg Attendance</span></div>
            </div>
        </div>
        <div class="faculty-quick-actions">
            <button class="faculty-quick-btn fqb-blue faculty-side-link" data-faculty-view="attendance"><span>◉</span>Take Attendance</button>
            <button class="faculty-quick-btn fqb-purple faculty-side-link" data-faculty-view="grades"><span>▥</span>Enter Grades</button>
            <button class="faculty-quick-btn fqb-teal faculty-side-link" data-faculty-view="classes"><span>▤</span>My Classes</button>
            <button class="faculty-quick-btn fqb-orange faculty-side-link" data-faculty-view="classes"><span>▧</span>Upload Material</button>
        </div>
        <div class="faculty-dash-grid">
            <div class="faculty-dash-col">
                <div class="faculty-section-head"><h4>📚 My Classes</h4><button class="text-link faculty-side-link" data-faculty-view="classes">View all →</button></div>
                <div class="faculty-classes-list">
                    ${classes.length ? classes.map(c => {
                        const sc = Array.isArray(c.studentIds) ? c.studentIds.length : db.students.filter(st=>String(c.section||'').trim()===String(st.section||'').trim()).length;
                        return `<div class="faculty-class-row">
                            <div class="faculty-class-info">
                                <strong>${escapeHTML(c.subject||c.subjectCode||'—')}</strong>
                                <span class="faculty-class-meta">${escapeHTML(c.section||'—')} · ${escapeHTML(c.schoolYear||'—')} · ${escapeHTML(c.semester||'—')}</span>
                            </div>
                            <div class="faculty-class-actions">
                                <span class="faculty-class-count">${sc} students</span>
                                <button class="small-action faculty-side-link" data-faculty-view="attendance">Attendance</button>
                                <button class="small-action faculty-side-link" data-faculty-view="grades">Grades</button>
                            </div>
                        </div>`;
                    }).join('') : '<div class="empty">No classes assigned yet.</div>'}
                </div>
            </div>
            <div class="faculty-dash-col">
                <div class="faculty-section-head"><h4>📋 Recent Attendance Sessions</h4></div>
                <div class="faculty-classes-list">
                    ${recentSessions.length ? recentSessions.map(s => `<div class="faculty-class-row">
                        <div class="faculty-class-info">
                            <strong>${escapeHTML(s.subject)}</strong>
                            <span class="faculty-class-meta">${formatDate(s.date)}</span>
                        </div>
                        <div class="faculty-class-actions">
                            <span class="att-pct-badge green">${s.present}P</span>
                            <span class="att-pct-badge red">${s.absent}A</span>
                            <span class="att-pct-badge yellow">${s.late}L</span>
                        </div>
                    </div>`).join('') : '<div class="empty">No attendance recorded yet.</div>'}
                </div>
            </div>
        </div>
        <div class="faculty-section-head" style="margin-top:24px">
            <h4>⚠️ Students Needing Attention</h4>
            <span class="muted">${onTrackCount} on track · ${attentionRows.length} flagged</span>
        </div>
        ${attentionRows.length ? `<div class="table-scroll"><table class="data-table faculty-attention-table">
            <thead><tr><th>Student</th><th>Program</th><th>Avg Grade</th><th>Attendance</th><th>Status</th></tr></thead>
            <tbody>${attentionRows.map(x=>`<tr>
                <td><strong>${escapeHTML(x.student.name||x.student.id)}</strong><small>${escapeHTML(x.student.id)}</small></td>
                <td>${escapeHTML(x.student.program||'—')}</td>
                <td>${x.radar.academic||'—'}</td>
                <td><span class="att-pct-badge ${x.radar.attendance<75?'red':x.radar.attendance<90?'yellow':'green'}">${x.radar.attendance}%</span></td>
                <td><span class="phase2-status ${x.radar.levelClass}">${x.radar.level}</span></td>
            </tr>`).join('')}</tbody>
        </table></div>` : `<div class="info-box" style="color:#166534">✅ All students are currently on track based on available data.</div>`}
    </section>`;
    },    classes: function(){
        const rows = facultyClasses();
        return `<section class="content-panel">
        <div class="panel-header"><div><p class="eyebrow">CEC PORTAL</p><h2>My Classes</h2></div><span class="panel-date">${formatDate(today())}</span></div>
        <div class="info-box">Your assigned classes are listed below. You can upload learning materials, take attendance, or enter grades for each class.</div>
        <div class="faculty-card-grid">
            ${rows.length ? rows.map(c => {
                const sc = Array.isArray(c.studentIds) ? c.studentIds.length : db.students.filter(st=>String(c.section||'').trim()===String(st.section||'').trim()).length;
                const mats = (db.materials||[]).filter(m=>String(m.classId||'')===String(c.id||'')).length;
                const sessCount = new Set((db.attendance||[]).filter(a=>String(a.classId||'')===String(c.id||'')).map(a=>a.date)).size;
                return `<div class="faculty-class-card">
                    <div class="fcc-header">
                        <span class="fcc-code">${escapeHTML(c.subjectCode||c.code||'—')}</span>
                        <span class="fcc-semester">${escapeHTML(c.semester||'—')}</span>
                    </div>
                    <h3 class="fcc-subject">${escapeHTML(c.subject||'Unnamed Subject')}</h3>
                    <p class="fcc-section">Section: <strong>${escapeHTML(c.section||'—')}</strong> · SY ${escapeHTML(c.schoolYear||'—')}</p>
                    <div class="fcc-stats">
                        <span>👥 ${sc} students</span>
                        <span>📁 ${mats} materials</span>
                        <span>📋 ${sessCount} sessions</span>
                    </div>
                    <div class="fcc-actions">
                        <button class="primary-btn faculty-side-link" data-faculty-view="attendance">Take Attendance</button>
                        <button class="secondary-btn faculty-side-link" data-faculty-view="grades">View Grades</button>
                        <button class="secondary-btn manage-class-materials" data-class-id="${escapeHTML(c.id)}">Materials</button>
                    </div>
                </div>`;
            }).join('') : '<div class="empty">No classes have been assigned to you yet.</div>'}
        </div>
    </section>`;
    },    attendance: function(){
        return facultyAttendanceView();
    },
    grades: function(){
        const t=currentFaculty();
        const classes=facultyClasses();
        // Filter state stored on the function itself between renders
        const fState=facultyViews.grades._filter||(facultyViews.grades._filter={classId:'',search:''});
        let rows=db.grades.filter(g=>String(g.teacherId)===String(t?.id));
        if(fState.classId) rows=rows.filter(g=>String(g.classId||'')=== fState.classId || String(g.code||'')===String(classes.find(c=>String(c.id)===fState.classId)?.subjectCode||'__'));
        if(fState.search){const q=fState.search.toLowerCase();rows=rows.filter(g=>{const st=db.students.find(x=>x.id===g.studentId);return (st?.name||'').toLowerCase().includes(q)||String(g.studentId||'').includes(q)||String(g.subject||'').toLowerCase().includes(q);});}
        // Group rows by student for summary view
        const classOpts='<option value="">All Classes</option>'+classes.map(c=>`<option value="${escapeHTML(c.id)}" ${fState.classId===String(c.id)?'selected':''}>${escapeHTML(c.subject||c.subjectCode||'—')} · ${escapeHTML(c.section||'—')}</option>`).join('');
        const body=rows.map(g=>{
            const st=db.students.find(x=>x.id===g.studentId||x.id===String(g.studentId));
            const avg=gradeAverage(g);
            const avgClass=avg==='Incomplete'?'':'';
            return `<tr><td><strong>${escapeHTML(st?.name||g.studentId)}</strong><small>${escapeHTML(g.studentId||'')}</small></td>
                <td>${escapeHTML(g.code||'—')}<small>${escapeHTML(g.subject||'')}</small></td>
                <td>${g.prelim??'—'}</td><td>${g.midterm??'—'}</td><td>${g.semiFinal??'—'}</td><td>${g.final??'—'}</td>
                <td><b class="${avg==='Incomplete'?'muted':''}">${avg}</b></td>
                <td><button class="small-action edit-faculty-grade" data-id="${escapeHTML(g.id)}">Edit</button></td></tr>`;
        }).join('')||emptyRow(8);
        return panel('Student Grades',
            `<div class="panel-actions" style="flex-wrap:wrap;gap:8px">
                <button class="primary-btn" data-faculty-action="add-grade">+ Enter Grade</button>
                <select id="gradeFilterClass" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.82rem">${classOpts}</select>
                <input id="gradeFilterSearch" type="text" value="${escapeHTML(fState.search)}" placeholder="Search student or subject…" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.82rem;min-width:180px">
            </div>
            <div class="info-box">Grades shown for your assigned classes. Each average is calculated from Prelim, Midterm, Semi-Final, and Final. <b>Incomplete</b> means not all periods are entered.</div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Student</th><th>Subject</th><th>Prelim</th><th>Midterm</th><th>Semi-Final</th><th>Final</th><th>Semester Avg</th><th>Action</th></tr></thead><tbody>${body}</tbody></table></div>`);
    },
    profile: function(){
        const t=currentFaculty();
        return panel("Faculty Profile",
            `<div class="profile-layout"><div class="profile-hero"><div class="profile-avatar avatar-fallback">${escapeHTML((t?.name||t?.fullName||"Faculty").split(" ").map(x=>x[0]).slice(0,2).join(""))}</div>
            <div><h2>${escapeHTML(t?.name||t?.fullName||"Faculty Member")}</h2><p>${escapeHTML(t?.department||"Faculty")} · ${escapeHTML(t?.email||"")}</p></div></div>
            <div class="info-box"><b>Teacher ID:</b> ${escapeHTML(t?.id||t?.teacherId||"—")}<br><b>Full Name:</b> ${escapeHTML(t?.name||t?.fullName||"—")}<br><b>Email:</b> ${escapeHTML(t?.email||"—")}<br><b>Department:</b> ${escapeHTML(t?.department||"—")}<br><b>Contact Number:</b> ${escapeHTML(t?.phone||t?.contactNumber||"—")}<br><b>Status:</b> ${escapeHTML(t?.status||"—")}</div></div>`);
    },
    announcements: function(){
        const now=today();
        const visible=(db.announcements||[]).filter(a=>{
            const ta=a.targetAudience||"general";
            if(ta==="students") return false; // faculty cannot see student-only
            if(a.expiresAt && String(a.expiresAt).slice(0,10)<now) return false;
            return true;
        }).slice().sort((a,b)=>{
            const pa=a.isPinned?1:0, pb=b.isPinned?1:0;
            if(pb!==pa) return pb-pa;
            return String(b.postedAt||"").localeCompare(String(a.postedAt||""));
        });
        const items=visible.map(a=>`<article class="announcement-card">
            <div class="announcement-top">
                ${a.isPinned?'<span class="ann-pinned-badge">📌 Pinned</span>':''}
                ${a.priority==="high"?'<span class="ann-priority-badge">🔴 High Priority</span>':''}
                <span class="status-chip">${escapeHTML(a.targetAudience==="faculty"?"FACULTY":"GENERAL")}</span>
                <time>Posted ${formatDateTime(a.postedAt)}</time>
            </div>
            <h3>${escapeHTML(a.title)}</h3><p>${escapeHTML(a.body)}</p>
            <small>Posted by ${escapeHTML(a.author||"Administrator")}${a.expiresAt?` · Expires ${formatDate(a.expiresAt)}`:""}</small>
        </article>`).join("")||`<div class="empty">No announcements yet.</div>`;
        return panel("Announcements",`<div class="announcement-list">${items}</div>`);
    }
};
function renderFaculty(){
    const t=currentFaculty();
    if(!t) return;
    const name=document.querySelector('#facultyName'); if(name) name.textContent=t.name||'Faculty Member';
    const avatar=document.querySelector('#facultyAvatar'); if(avatar) avatar.textContent=(t.name||'F').split(' ').map(x=>x[0]).slice(0,2).join('');
}
function openFacultyView(view){
    const home=$("#facultyDashboardHome"), content=$("#facultyContentView");
    if(!home||!content)return;
    if(view==='home'){
        home.innerHTML=facultyViews.home();
        home.classList.remove('hidden');
        content.classList.add('hidden');
        content.innerHTML='';
    } else {
        home.classList.add('hidden');
        home.innerHTML='';
        content.classList.remove('hidden');
        content.innerHTML=facultyViews[view]?.()||facultyViews.home();
    }
    $$('.faculty-side-link').forEach(a=>a.classList.toggle('active',a.dataset.facultyView===view));
    bindFacultyActions();
}
function bindFacultyActions(){
    $$('.edit-faculty-grade').forEach(b=>b.onclick=()=>facultyGradeForm(db.grades.find(g=>g.id===b.dataset.id)));
    $$('.manage-class-materials').forEach(b=>b.onclick=()=>facultyMaterialManager(b.dataset.classId));
    $$('.faculty-side-link').forEach(a=>a.onclick=e=>{e.preventDefault();const v=a.dataset.facultyView;if(v)openFacultyView(v);});
    $('[data-faculty-action="add-grade"]')?.addEventListener('click',()=>facultyGradeForm());
    // Grade filter bindings
    $('#gradeFilterClass')?.addEventListener('change',e=>{if(facultyViews.grades._filter)facultyViews.grades._filter.classId=e.target.value;openFacultyView("grades");});
    $('#gradeFilterSearch')?.addEventListener('input',e=>{if(facultyViews.grades._filter)facultyViews.grades._filter.search=e.target.value;openFacultyView("grades");});
    // Attendance tab switcher
    $$('[data-att-tab]').forEach(btn=>btn.onclick=()=>{facultyAttendanceTab=btn.dataset.attTab;openFacultyView("attendance");});
    // Take-attendance bindings
    $('#facultyAttendanceClass')?.addEventListener('change',e=>{facultyAttendanceState.classId=e.target.value;openFacultyView("attendance");});
    $('#facultyAttendanceDate')?.addEventListener('change',e=>{facultyAttendanceState.date=e.target.value||today();openFacultyView("attendance");});
    $('#saveFacultyAttendance')?.addEventListener('click',saveFacultyAttendance);
    // History filter bindings
    const rebindHistory=()=>{openFacultyView("attendance");};
    $('#attHistFrom')?.addEventListener('change',e=>{facultyAttendanceHistoryFilters.dateFrom=e.target.value;rebindHistory();});
    $('#attHistTo')?.addEventListener('change',e=>{facultyAttendanceHistoryFilters.dateTo=e.target.value;rebindHistory();});
    $('#attHistClass')?.addEventListener('change',e=>{facultyAttendanceHistoryFilters.classId=e.target.value;rebindHistory();});
    $('#attHistSearch')?.addEventListener('input',e=>{facultyAttendanceHistoryFilters.search=e.target.value;rebindHistory();});
    $('#attHistStatus')?.addEventListener('change',e=>{facultyAttendanceHistoryFilters.status=e.target.value;rebindHistory();});
    $('#attHistClear')?.addEventListener('click',()=>{facultyAttendanceHistoryFilters={dateFrom:"",dateTo:"",classId:"",search:"",status:""};rebindHistory();});
    // Export CSV
    $('#attExportCSV')?.addEventListener('click',()=>{
        const teacher=currentFaculty();
        const classes=facultyClasses();
        const f=facultyAttendanceHistoryFilters;
        const records=(db.attendance||[]).filter(a=>{
            if(teacher && String(a.teacherId||"")!==String(teacher.id)) return false;
            if(f.classId && String(a.classId||"")!==String(f.classId)) return false;
            if(f.dateFrom && String(a.date||"")<String(f.dateFrom)) return false;
            if(f.dateTo && String(a.date||"")>String(f.dateTo)) return false;
            if(f.status && f.status!=="All" && String(a.status||"")!==f.status) return false;
            if(f.search){
                const q=f.search.toLowerCase();
                const st=db.students.find(s=>String(s.id)===String(a.studentId)||String(s.firestoreId||"")===String(a.studentId));
                const hay=`${st?.name||""} ${a.studentId} ${a.subject||""}`.toLowerCase();
                if(!hay.includes(q)) return false;
            }
            return true;
        });
        exportAttendanceCSV(records,db.students,classes);
    });
    // Attendance history edit buttons
    $$('.att-hist-edit').forEach(btn=>btn.onclick=()=>{
        const rec=(db.attendance||[]).find(a=>String(a.id)===String(btn.dataset.attId));
        facultyAttendanceEditModal(rec);
    });
    // Excuse request approve/reject
    $$('[data-excuse-approve]').forEach(btn=>btn.onclick=async()=>{
        const req=(db.excuseRequests||[]).find(e=>String(e.id)===String(btn.dataset.excuseApprove));
        if(!req){toast("Excuse request not found.","error");return;}
        btn.disabled=true;btn.textContent="Approving...";
        try{
            const firestore=firebase.firestore();
            await firestore.collection("excuseRequests").doc(String(req.id)).set({status:"Approved",updatedAt:nowISO()},{merge:true});
            const attRec=(db.attendance||[]).find(a=>String(a.studentId)===String(req.studentId)&&String(a.date||"")===String(req.date||"")&&String(a.classId||"")===String(req.classId||""));
            if(attRec){
                await firestore.collection("attendance").doc(String(attRec.id)).set({status:"Excused",remarks:String(req.reason||""),updatedAt:nowISO()},{merge:true});
            }
            toast("Excuse request approved. Attendance updated to Excused.");
            await cecDatabase.refresh();
            openFacultyView("attendance");
        }catch(error){console.error("Excuse approve failed:",error);toast(error?.message||"Unable to approve excuse request.","error");btn.disabled=false;btn.textContent="Approve";}
    });
    $$('[data-excuse-reject]').forEach(btn=>btn.onclick=async()=>{
        const req=(db.excuseRequests||[]).find(e=>String(e.id)===String(btn.dataset.excuseReject));
        if(!req){toast("Excuse request not found.","error");return;}
        btn.disabled=true;btn.textContent="Rejecting...";
        try{
            const firestore=firebase.firestore();
            await firestore.collection("excuseRequests").doc(String(req.id)).set({status:"Rejected",updatedAt:nowISO()},{merge:true});
            toast("Excuse request rejected.");
            await cecDatabase.refresh();
            openFacultyView("attendance");
        }catch(error){console.error("Excuse reject failed:",error);toast(error?.message||"Unable to reject excuse request.","error");btn.disabled=false;btn.textContent="Reject";}
    });
    $('#facultyLogoutBtn')?.addEventListener('click',async e=>{e.preventDefault();cecStopSessionManager();cecClearSessionMeta();try{await cecFirestore.signOut();}catch(_){}localStorage.removeItem('cecCurrentFaculty');sessionStorage.removeItem('cecFaculty2FAVerified');location.href='../login.html';});
}

/* ---------------- ADMIN ---------------- */
function adminViewsCount(){return {students:db.students.length,teachers:db.teachers.length,subjects:db.subjects.length,classes:db.classes.length,announcements:db.announcements.length};}
const CEC_PROGRAMS = [
    {code:"BSIT", name:"Bachelor of Science in Information Technology", department:"BSIT Department"},
    {code:"HM", name:"Bachelor of Science in Hospitality Management", department:"HTM Department"},
    {code:"TM", name:"Bachelor of Science in Tourism Management", department:"HTM Department"},
    {code:"BSED", name:"Bachelor of Secondary Education", department:"CTE Department"},
    {code:"BSCrim", name:"Bachelor of Science in Criminology", department:"CRIMINOLOGY Department"}
];
const CEC_DEPARTMENTS = ["BSIT Department","HTM Department","CRIMINOLOGY Department","CTE Department"];
const CEC_SUBJECT_CATALOG = {
    BSIT:[["Introduction to Computing",3],["Computer Programming 1",3],["Computer Programming 2",3],["Data Structures and Algorithms",3],["Database Management Systems",3],["Web Development",3],["Networking Fundamentals",3],["Systems Analysis and Design",3],["Information Assurance",3],["Capstone Project",3]],
    HM:[["Introduction to Hospitality Management",3],["Food and Beverage Service",3],["Housekeeping Operations",3],["Culinary Arts",3],["Front Office Operations",3],["Hospitality Accounting",3],["Events Management",3],["Hospitality Marketing",3]],
    TM:[["Introduction to Tourism Management",3],["Tourism Planning and Development",3],["Travel Agency Operations",3],["Tour Guiding",3],["Tourism Marketing",3],["Sustainable Tourism",3],["Events and MICE Management",3],["Tourism Entrepreneurship",3]],
    BSED:[["The Teacher and the Community",3],["Foundations of Education",3],["Educational Psychology",3],["Curriculum Development",3],["Assessment of Learning",3],["Technology for Teaching and Learning",3],["Teaching Internship",3],["Practice Teaching",3]],
    BSCrim:[["Introduction to Criminology",3],["Criminal Law",3],["Criminal Sociology",3],["Forensic Science",3],["Law Enforcement Administration",3],["Crime Detection and Investigation",3],["Criminal Justice System",3],["Criminological Research",3]]
};
const CEC_TIME_SLOTS=["7:30 AM - 9:00 AM","9:00 AM - 10:30 AM","10:30 AM - 12:00 PM","1:00 PM - 2:30 PM","2:30 PM - 4:00 PM","4:00 PM - 5:30 PM","5:30 PM - 7:00 PM","7:00 PM - 8:30 PM","8:30 PM - 9:30 PM"];
const CEC_DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const CEC_ROOMS=["Room 101","Room 102","Room 103","Room 104","Room 105","Room 106","Room 107","Room 108","Room 201","Room 202","Room 203","Room 204","Room 205","Room 206","Room 207","Room 208","Laboratory 1","Laboratory 2","Computer Laboratory 1","Computer Laboratory 2"];
let adminStudentSearch="";
let adminStudentProgram="ALL";
function programOptions(selected="BSIT"){selected=normalizeCourse(selected);return CEC_PROGRAMS.map(p=>`<option value="${escapeHTML(p.code)}" ${selected===p.code?"selected":""}>${escapeHTML(p.code)} — ${escapeHTML(p.name)}</option>`).join("");}
function normalizeCourse(course){const v=String(course||"").trim();return ({BSHM:"HM",BSTM:"TM",BSCRIM:"BSCrim",BEED:"BSED"}[v]||v);}
function departmentForCourse(course){return CEC_PROGRAMS.find(p=>p.code===normalizeCourse(course))?.department||"";}
function departmentOptions(selected="BSIT Department"){return CEC_DEPARTMENTS.map(d=>`<option value="${escapeHTML(d)}" ${selected===d?"selected":""}>${escapeHTML(d)}</option>`).join("");}
function subjectCatalogOptions(course,selected=""){return (CEC_SUBJECT_CATALOG[course]||[]).map(([name,units])=>`<option value="${escapeHTML(name)}" data-units="${units}" ${selected===name?"selected":""}>${escapeHTML(name)}</option>`).join("");}
function coursePrefix(course){return course==="BSCrim"?"CR":course;}
function uniqueNumber(prefix,existing,field,digits=3){const used=new Set(existing.map(x=>String(x?.[field]||"").toUpperCase()));let n=1,v="";do{v=`${prefix}-${String(n).padStart(digits,"0")}`;n++;}while(used.has(v.toUpperCase()));return v;}
function generateTeacherId(){return uniqueNumber("T",db.teachers,"id",3);}
function generateClassId(){return uniqueNumber("C",db.classes,"id",3);}
function generateSubjectCode(course){const prefix=coursePrefix(course),used=new Set(db.subjects.map(x=>String(x.code||"").toUpperCase()));let n=101,v="";do{v=`${prefix}${n}`;n++;}while(used.has(v.toUpperCase()));return v;}
function generateSection(course,year){course=normalizeCourse(course);const used=new Set(db.classes.filter(c=>normalizeCourse(c.program)===normalizeCourse(course)&&String(c.year||"")===String(year||"")).map(c=>String(c.section||"").toUpperCase()));for(let i=0;i<26;i++){const v=`${course} ${year}${String.fromCharCode(65+i)}`;if(!used.has(v.toUpperCase()))return v;}return `${course} ${year}${Date.now().toString(36).slice(-2).toUpperCase()}`;}
function findAvailableSchedule(excludeCode=""){const used=new Set(db.subjects.filter(s=>String(s.code)!==String(excludeCode)).map(s=>String(s.schedule||"")));for(const day of CEC_DAYS)for(const slot of CEC_TIME_SLOTS){const v=`${day} — ${slot}`;if(!used.has(v))return v;}return `${CEC_DAYS[0]} — ${CEC_TIME_SLOTS[0]}`;}
function findAvailableRoom(schedule,excludeCode=""){const used=new Set(db.subjects.filter(s=>String(s.code)!==String(excludeCode)&&String(s.schedule||"")===String(schedule||"")).map(s=>String(s.room||"")));return CEC_ROOMS.find(r=>!used.has(r))||`Room ${101+db.subjects.length}`;}
function filteredAdminStudents(){
    const q=adminStudentSearch.trim().toLowerCase();
    return db.students.filter(s=>{
        const matchesProgram=adminStudentProgram==="ALL" || normalizeCourse(s.program)===normalizeCourse(adminStudentProgram);
        const hay=[s.id,s.name,s.program,s.year,s.section,s.email,s.status].join(" ").toLowerCase();
        return matchesProgram && (!q || hay.includes(q));
    });
}
function renderAdminStudentsView(){
    const rows=filteredAdminStudents();
    return panel("Students",`<div class="student-admin-tools">
        <div class="student-search-wrap"><span>⌕</span><input id="adminStudentSearch" type="search" value="${escapeHTML(adminStudentSearch)}" placeholder="Search student ID, name, program, section..."></div>
        <label class="student-program-filter">Program<select id="adminStudentProgram"><option value="ALL">All Programs</option>${programOptions(adminStudentProgram)}</select></label>
        <button class="primary-btn" data-admin-action="add-student">+ Add Student</button>
    </div>
    <div class="program-category-bar">${CEC_PROGRAMS.map(p=>`<button class="program-category ${adminStudentProgram===p.code?"active":""}" data-student-program="${p.code}"><b>${p.code}</b><span>${db.students.filter(s=>normalizeCourse(s.program)===p.code).length} students</span></button>`).join("")}</div>
    <div class="student-result-summary">Showing <b>${rows.length}</b> of <b>${db.students.length}</b> students</div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Student ID</th><th>Name</th><th>Program</th><th>Year</th><th>Section</th><th>Status</th><th>Registration Code</th><th>Actions</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHTML(r.id)}</td><td>${escapeHTML(r.name)}</td><td><strong>${escapeHTML(r.program)}</strong></td><td>${escapeHTML(r.year)}</td><td>${escapeHTML(r.section)}</td><td><span class="status-chip ${String(r.status).toLowerCase().replace(/\s+/g,'-')}">${escapeHTML(r.status)}</span></td><td>${escapeHTML(r.registrationCode||"—")}</td><td><button class="small-action edit-student" data-id="${escapeHTML(r.id)}">Edit</button> <button class="small-action danger delete-student" data-id="${escapeHTML(r.id)}">Delete</button></td></tr>`).join("")||emptyRow(8)}</tbody></table></div>`);
}

function renderAdmin(){
    if(!$("#adminDashboardHome")) return;
    const c=adminViewsCount();
    $("#adminNotificationBadge").textContent=db.adminNotifications.length||"";
    $("#adminNotificationBadge").style.display=db.adminNotifications.length?"block":"none";
    // Compute low attendance alerts for admin home
    const adminStuIds=[...new Set((db.attendance||[]).map(a=>String(a.studentId)))];
    const adminLowStudents=adminStuIds.map(sid=>{const rows=(db.attendance||[]).filter(a=>String(a.studentId)===sid);const present=rows.filter(a=>a.status==="Present").length;const late=rows.filter(a=>a.status==="Late").length;const total=rows.length;const pct=total?Math.round((present+late)/total*100):100;const st=(db.students||[]).find(x=>String(x.id)===sid||String(x.firestoreId||"")===sid);return {name:st?.name||sid,sid,pct,total};}).filter(x=>x.total>0&&x.pct<75).sort((a,b)=>a.pct-b.pct).slice(0,6);
    const adminRecentAnns=(db.announcements||[]).slice().sort((a,b)=>{const pa=a.isPinned?1:0,pb=b.isPinned?1:0;if(pb!==pa)return pb-pa;return String(b.postedAt||"").localeCompare(String(a.postedAt||""));}).slice(0,5);
    const pendingEnlistments=(db.enlistments||[]).filter(e=>e.status==="Pending").length;
    $("#adminDashboardHome").innerHTML=`
    <div class="adm-welcome-bar">
        <div class="adm-welcome-left">
            <span class="adm-greeting">Welcome back, <strong>Administrator</strong></span>
            <span class="adm-sub">CEC Portal Administration · Full Management Access</span>
        </div>
        <span class="adm-date">${formatDate(today())}</span>
    </div>
    <div class="adm-kpi-grid">
        <div class="adm-kpi-card" data-admin-view-jump="students"><div class="adm-kpi-icon kpi-blue">♙</div><div><b>${c.students}</b><span>Students</span></div></div>
        <div class="adm-kpi-card" data-admin-view-jump="teachers"><div class="adm-kpi-icon kpi-purple">🎓</div><div><b>${c.teachers}</b><span>Teachers</span></div></div>
        <div class="adm-kpi-card" data-admin-view-jump="classes"><div class="adm-kpi-icon kpi-teal">▤</div><div><b>${c.classes}</b><span>Classes</span></div></div>
        <div class="adm-kpi-card" data-admin-view-jump="announcements"><div class="adm-kpi-icon kpi-orange">🔔</div><div><b>${c.announcements}</b><span>Announcements</span></div></div>
        <div class="adm-kpi-card" data-admin-view-jump="grades"><div class="adm-kpi-icon kpi-green">▥</div><div><b>${db.grades.length}</b><span>Grade Records</span></div></div>
        <div class="adm-kpi-card" data-admin-view-jump="attendance"><div class="adm-kpi-icon kpi-red">◉</div><div><b>${db.attendance.length}</b><span>Attendance Records</span></div></div>
    </div>
    <div class="adm-quick-actions">
        <button class="adm-quick-btn aqb-blue" data-admin-view-jump="students"><span>♙</span> Add Student</button>
        <button class="adm-quick-btn aqb-purple" data-admin-view-jump="teachers"><span>🎓</span> Add Teacher</button>
        <button class="adm-quick-btn aqb-orange" data-admin-view-jump="announcements"><span>🔔</span> Post Announcement</button>
        <button class="adm-quick-btn aqb-teal" data-admin-view-jump="attendance"><span>◉</span> Monitor Attendance</button>
        <button class="adm-quick-btn aqb-green" data-admin-view-jump="reports"><span>▤</span> View Reports</button>
    </div>
    <div class="adm-dash-grid">
        <div class="adm-dash-col">
            <div class="adm-section-head"><h4>🔔 Recent Announcements</h4><button class="text-link" data-admin-view-jump="announcements">View all →</button></div>
            <div class="adm-ann-list">
                ${adminRecentAnns.length?adminRecentAnns.map(a=>{const ta=a.targetAudience||"general";const taLabel=ta==="students"?"Students":ta==="faculty"?"Faculty":"General";return `<div class="adm-ann-item">${a.isPinned?'<span class="ann-pinned-badge" style="font-size:9px">📌</span>':""}<div class="adm-ann-body"><div class="adm-ann-title">${escapeHTML(a.title)}</div><div class="adm-ann-meta">${formatDate((a.postedAt||"").slice(0,10))} · <span class="adm-audience-chip adm-aud-${ta}">${taLabel}</span></div></div></div>`;}).join(""):`<div class="empty">No announcements posted yet.</div>`}
            </div>
        </div>
        <div class="adm-dash-col">
            <div class="adm-section-head"><h4>⚠️ Low Attendance Alerts</h4><button class="text-link" data-admin-view-jump="attendance">Monitor →</button></div>
            ${adminLowStudents.length?`<div class="adm-low-list">${adminLowStudents.map(x=>`<div class="adm-low-row"><span class="adm-low-name">${escapeHTML(x.name)}</span><span class="att-pct-badge red">${x.pct}%</span></div>`).join("")}</div>`:`<div class="info-box" style="color:#166534;margin-top:8px">✅ All monitored students are above 75% attendance.</div>`}
            ${pendingEnlistments>0?`<div class="adm-pending-box">📋 <b>${pendingEnlistments}</b> pending enrollment request${pendingEnlistments>1?"s":""} — <button class="text-link" data-admin-view-jump="enrollment">Review →</button></div>`:""}
        </div>
    </div>`;
    bindAdminButtons();
}
function adminFeature(icon,title,value,small,view){return `<article class="feature-card clickable" data-admin-view-jump="${view}"><span class="icon">${icon}</span><h3>${title}</h3><p>${value}</p><small>${small}</small><b class="pill blue">Manage</b></article>`}
let adminAuditUnsubscribe=null;
function stopAdminAuditLog(){
    if(typeof adminAuditUnsubscribe === "function"){ adminAuditUnsubscribe(); adminAuditUnsubscribe=null; }
}
function openAdminView(view){
    stopAdminAuditLog();
    if(view==="home"){ $("#adminContentView").classList.add("hidden");$("#adminDashboardHome").classList.remove("hidden");}
    else{$("#adminDashboardHome").classList.add("hidden");$("#adminContentView").classList.remove("hidden");$("#adminContentView").innerHTML=adminViews[view]?adminViews[view]():adminViews.students();}
    $$(".admin-side-link").forEach(b=>b.classList.toggle("active",b.dataset.adminView===view));
    $$(".admin-dashboard-page .dash-nav button").forEach(b=>b.classList.toggle("active",b.dataset.adminView===view));
    bindAdminButtons();
}
const adminViews={
    students:()=>renderAdminStudentsView(),
    teachers:()=>adminTablePanel("Teachers","teacher",db.teachers,[["ID","id"],["Name","name"],["Department","department"],["Email","email"],["Status","status"]],"Add Teacher"),
    subjects:()=>adminTablePanel("Subjects","subject",db.subjects,[["Code","code"],["Subject","name"],["Units","units"],["Teacher","teacher"],["Schedule","schedule"],["Status","status"]],"Add Subject"),
    classes:()=>adminTablePanel("Classes & Sections","class",db.classes,[["ID","id"],["Section","section"],["Program","program"],["Year","year"],["Subject Code","subjectCode"],["Subject","subject"],["Teacher","teacher"],["School Year","schoolYear"],["Semester","semester"],["Room","room"],["Schedule","schedule"]],"Add Class / Section"),
    enrollment:()=>{const rows=db.enlistments;return panel("Enrollment",`<div class="info-box">Review subject enlistment requests submitted by students.</div><table class="data-table"><thead><tr><th>Student</th><th>Code</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(e=>{const s=db.students.find(x=>x.id===e.studentId);return `<tr><td>${escapeHTML(s?.name||e.studentId)}<small>${e.studentId}</small></td><td>${escapeHTML(e.code)}</td><td>${formatDateTime(e.createdAt)}</td><td>${escapeHTML(e.status)}</td><td><button class="small-action enrollment-action" data-id="${e.id}">Approve</button></td></tr>`}).join("")||emptyRow(5)}</tbody></table>`)},
    grades:()=>{const groups={};db.grades.forEach(g=>{const key=`${g.studentId}|${g.semester||"1st Semester"}|${g.schoolYear||"2026-2027"}`;(groups[key]??=[]).push(g);});return panel("Grades & Semester Averages",`<div class="info-box">Faculty members enter the four grading periods. The portal calculates each subject semester average automatically, while this Admin view summarizes the results.</div><table class="data-table"><thead><tr><th>Student</th><th>Semester</th><th>Subjects</th><th>Semester Average</th></tr></thead><tbody>${Object.entries(groups).map(([key,arr])=>{const [sid,semester,schoolYear]=key.split("|");const st=db.students.find(x=>x.id===sid);const avg=weightedSemesterAverage(arr);return `<tr><td>${escapeHTML(st?.name||sid)}<small>${escapeHTML(sid)}</small></td><td>${escapeHTML(semester)}<small>${escapeHTML(schoolYear)}</small></td><td>${arr.length}</td><td><b>${avg}</b></td></tr>`}).join("")||emptyRow(4)}</tbody></table>`);},
    attendance:()=>{
        // Compute per-student attendance stats for low-attendance alert
        const studentIds=[...new Set(db.attendance.map(a=>String(a.studentId)))];
        const lowStudents=studentIds.map(sid=>{
            const rows=db.attendance.filter(a=>String(a.studentId)===sid);
            const present=rows.filter(a=>a.status==="Present").length;
            const late=rows.filter(a=>a.status==="Late").length;
            const total=rows.length;
            const pct=total?Math.round((present+late)/total*100):100;
            const st=db.students.find(x=>String(x.id)===sid||String(x.firestoreId||"")===sid);
            return {name:st?.name||sid,sid,pct,total};
        }).filter(x=>x.total>0&&x.pct<75).sort((a,b)=>a.pct-b.pct);
        const alertBanner=lowStudents.length?`<div class="att-low-alert">⚠️ <b>${lowStudents.length} student${lowStudents.length>1?"s":""} below 75% attendance:</b> ${lowStudents.map(x=>`<span class="att-pct-badge red">${escapeHTML(x.name)} — ${x.pct}%</span>`).join(" ")}</div>`:"";
        return panel("Attendance Monitoring",`${alertBanner}<div class="info-box">Attendance is recorded by Faculty for their assigned classes. Admin can monitor all saved records across the school. Students below 75% are flagged above.</div><table class="data-table"><thead><tr><th>Date</th><th>Faculty</th><th>Student</th><th>Subject</th><th>Class</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${db.attendance.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(a=>{const st=db.students.find(x=>String(x.id)===String(a.studentId)||String(x.firestoreId||"")===String(a.studentId));const teacher=db.teachers.find(x=>String(x.id)===String(a.teacherId));const cls=db.classes.find(x=>String(x.id)===String(a.classId));return `<tr><td>${formatDate(a.date)}</td><td>${escapeHTML(teacher?.name||teacher?.fullName||a.teacherId||"—")}</td><td>${escapeHTML(st?.name||a.studentId)}</td><td>${escapeHTML(a.subject||a.subjectCode||"—")}</td><td>${escapeHTML(cls?.section||a.classId||"—")}</td><td><span class="status-chip ${String(a.status||"").toLowerCase()}">${escapeHTML(a.status||"—")}</span></td><td>${escapeHTML(a.remarks||"")}</td></tr>`}).join("")||emptyRow(7)}</tbody></table>`);
    },
    syllabi:()=>panel("Syllabi & Materials",`<div class="panel-actions"><button class="primary-btn" data-admin-action="add-material">+ Add Material</button></div>${renderMaterials()}`),
    events:()=>panel("Calendar & Events",`<div class="panel-actions"><button class="primary-btn" data-admin-action="add-event">+ Add Event</button></div><div class="event-grid">${db.events.map(e=>`<article class="event-card"><div class="event-date"><b>${new Date(e.date+"T00:00:00").getDate()}</b><span>${new Date(e.date+"T00:00:00").toLocaleDateString("en-US",{month:"short"}).toUpperCase()}</span></div><div><h3>${escapeHTML(e.title)}</h3><p>${escapeHTML(e.description)}</p><small>${formatDate(e.date)} · ${escapeHTML(e.time)} · ${escapeHTML(e.location)}</small><button class="small-action danger delete-event" data-id="${e.id}">Delete</button></div></article>`).join("")}</div>`),
    payments:()=>panel("Payment Management",`<div class="panel-actions"><button class="primary-btn" data-admin-action="add-payment">+ Add Payment Record</button></div><table class="data-table"><thead><tr><th>Student</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>${db.payments.map(p=>{const s=db.students.find(x=>x.id===p.studentId);return `<tr><td>${escapeHTML(s?.name||p.studentId)}</td><td>${escapeHTML(p.description)}</td><td>${money(p.amount)}</td><td>${formatDate(p.dueDate)}</td><td>${p.status}</td><td><button class="small-action edit-payment" data-id="${p.id}">Edit</button></td></tr>`}).join("")}</tbody></table>`),
    announcements:()=>{const now=today();const sorted=(db.announcements||[]).slice().sort((a,b)=>{const pa=a.isPinned?1:0,pb=b.isPinned?1:0;if(pb!==pa)return pb-pa;return String(b.postedAt||"").localeCompare(String(a.postedAt||""));});const rows=sorted.map(a=>{const expired=a.expiresAt&&String(a.expiresAt).slice(0,10)<now;const ta=a.targetAudience||"general";const taLabel=ta==="students"?"Students Only":ta==="faculty"?"Faculty Only":"General";const pinnedBadge=a.isPinned?"<span class=\"ann-pinned-badge\">&#x1F4CC; Pinned</span>":"";const priBadge=a.priority==="high"?"<span class=\"ann-priority-badge\">&#x1F534; High Priority</span>":"";const expBadge=expired?"<span class=\"ann-expired-chip\">EXPIRED</span>":"";return "<article class=\"announcement-card admin-ann-card"+(expired?" ann-expired":"")+"\"><div class=\"announcement-top\">"+pinnedBadge+priBadge+"<span class=\"ann-audience-chip ann-"+escapeHTML(ta)+"\">"+escapeHTML(taLabel)+"</span>"+expBadge+"<span class=\"status-chip\">PUBLISHED</span><time>Posted "+formatDateTime(a.postedAt)+"</time></div><h3>"+escapeHTML(a.title)+"</h3><p>"+escapeHTML(a.body)+"</p><small>By "+escapeHTML(a.author||"Administrator")+(a.expiresAt?" \u00b7 Expires "+formatDate(a.expiresAt):"")+  "</small><div class=\"ann-admin-actions\"><button class=\"small-action edit-announcement\" data-id=\""+escapeHTML(a.id)+"\">Edit</button> <button class=\"small-action danger delete-announcement\" data-id=\""+escapeHTML(a.id)+"\">Delete</button></div></article>";});return panel("Announcements","<div class=\"info-box\">Announcements are distributed by <b>Target Audience</b>. Pinned posts stay at the top of all feeds. Expired posts are hidden from students and faculty.</div><div class=\"panel-actions\"><button class=\"primary-btn\" data-admin-action=\"add-announcement\">+ New Announcement</button></div><div class=\"announcement-list\">"+(rows.join("")||"<div class=\"empty\">No announcements yet.</div>")+"</div>");},
    reports:()=>panel("Reports",`${phase2AdminEarlyWarning()}${phase3AdminCommunication()}<div class="metric-grid"><div class="metric"><b>${db.students.length}</b><span>Students</span></div><div class="metric"><b>${db.teachers.length}</b><span>Teachers</span></div><div class="metric"><b>${db.grades.length}</b><span>Grade Records</span></div><div class="metric"><b>${db.attendance.length}</b><span>Attendance Records</span></div></div><div class="info-box">Records are stored in Cloud Firestore and synchronized in real time. Firebase Authentication and Firestore Security Rules enforce role-based access.</div><div class="panel-actions"><button class="secondary-btn" id="loadAdminAuditLogs">View Security Audit Log</button></div><div id="adminAuditLog" class="table-wrap"></div>`),
    settings:()=>panel("Admin Settings",`<form id="adminSettingsForm" class="settings-list"><label class="setting-row"><span><b>Announcement Notifications</b><small>Create an admin activity notification when announcements are posted.</small></span><input type="checkbox" name="announcementNotifications" ${db.adminSettings.announcementNotifications?"checked":""}></label><div class="form-actions"><button class="primary-btn">Save Settings</button></div></form>`),
    profile:()=>panel("Admin Profile",`<div class="profile-layout"><div class="profile-hero"><div class="profile-avatar avatar-fallback">AD</div><div><h2>Administrator</h2><p>System Administrator · Full Portal Management</p></div></div><div class="info-box">For production, connect this account to server-side authentication and role-based permissions.</div></div>`)
};
function adminTablePanel(title,type,rows,cols,buttonText){return panel(title,`<div class="panel-actions"><button class="primary-btn" data-admin-action="add-${type}">+ ${buttonText}</button></div><div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join("")}<th>Actions</th></tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${escapeHTML(r[c[1]])}</td>`).join("")}<td><button class="small-action edit-${type}" data-id="${escapeHTML(r.id||r.code)}">Edit</button> <button class="small-action danger delete-${type}" data-id="${escapeHTML(r.id||r.code)}">Delete</button></td></tr>`).join("")||emptyRow(cols.length+1)}</tbody></table></div>`)}
function renderAdminAuditRows(root, rows){
    const status=root.querySelector("#adminAuditLiveStatus");
    if(status) status.innerHTML='<span class="status-chip" style="display:inline-flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:#16a34a;display:inline-block"></span> LIVE</span>';
    const body=rows.map(row=>{
        const created=row.createdAt?.toDate?row.createdAt.toDate().toLocaleString("en-PH"):"—";
        return `<tr><td>${escapeHTML(created)}</td><td><span class="status-chip">${escapeHTML(row.actorRole||"—")}</span></td><td>${escapeHTML(row.actorEmail||row.actorUid||"—")}</td><td>${escapeHTML(String(row.action||"—").toUpperCase())}</td><td>${escapeHTML(row.collection||"—")}</td><td>${escapeHTML(row.documentId||"—")}</td></tr>`;
    }).join("")||emptyRow(6);
    const table=root.querySelector("#adminAuditTable");
    if(table) table.querySelector("tbody").innerHTML=body;
}
function loadAdminAuditLogs(){
    const root=$("#adminAuditLog");
    if(!root) return;
    stopAdminAuditLog();
    root.innerHTML='<div class="panel-actions" style="justify-content:space-between;align-items:center"><div class="info-box" style="margin:0;flex:1">Security audit events update automatically as new activity is recorded.</div><span id="adminAuditLiveStatus"></span></div><table id="adminAuditTable" class="data-table"><thead><tr><th>Time</th><th>Role</th><th>Actor</th><th>Action</th><th>Area</th><th>Record</th></tr></thead><tbody><tr><td colspan="6">Loading security audit events...</td></tr></tbody></table>';
    try{
        adminAuditUnsubscribe=firebase.firestore().collection("auditLogs").orderBy("createdAt","desc").limit(50).onSnapshot(snap=>{
            const rows=snap.docs.map(doc=>({id:doc.id,...doc.data()}));
            renderAdminAuditRows(root,rows);
        },error=>{
            console.error("Audit log listener failed",error);
            const status=root.querySelector("#adminAuditLiveStatus");
            if(status) status.innerHTML='<span class="status-chip">OFFLINE</span>';
            const table=root.querySelector("#adminAuditTable tbody");
            if(table) table.innerHTML=emptyRow(6);
        });
    }catch(error){
        console.error("Audit log listener setup failed",error);
        root.innerHTML='<div class="info-box">Security audit logs could not be loaded. Check the Firestore Security Rules deployment.</div>';
    }
}

function bindAdminButtons(){
    $$('[data-admin-view]').forEach(button=>button.onclick=()=>{
        const routes={home:'dashboard.html',students:'students.html',teachers:'teachers.html',subjects:'subjects.html',classes:'classes.html',enrollment:'enrollment.html',grades:'grades.html',attendance:'attendance.html',syllabi:'materials.html',events:'calendar.html',payments:'payments.html',announcements:'announcements.html',reports:'reports.html',settings:'settings.html',profile:'profile.html'};
        const route=routes[button.dataset.adminView];
        if(route && location.pathname.split('/').pop()!==route)location.href=route;
        else openAdminView(button.dataset.adminView);
    });
    $$("[data-admin-view-jump]").forEach(b=>b.onclick=()=>openAdminView(b.dataset.adminViewJump));
    $$("[data-admin-action]").forEach(b=>b.onclick=()=>adminAction(b.dataset.adminAction));
    $("#loadAdminAuditLogs")?.addEventListener("click",loadAdminAuditLogs);
    $$(".edit-student").forEach(b=>b.onclick=()=>studentForm(db.students.find(x=>x.id===b.dataset.id)));
    $$(".delete-student").forEach(b=>b.onclick=()=>deleteRecord("students","id",b.dataset.id,"Student"));
    $$(".edit-teacher").forEach(b=>b.onclick=()=>teacherForm(db.teachers.find(x=>x.id===b.dataset.id)));
    $$(".delete-teacher").forEach(b=>b.onclick=()=>deleteRecord("teachers","id",b.dataset.id,"Teacher"));
    $$(".edit-subject").forEach(b=>b.onclick=()=>subjectForm(db.subjects.find(x=>x.code===b.dataset.id)));
    $$(".delete-subject").forEach(b=>b.onclick=()=>deleteRecord("subjects","code",b.dataset.id,"Subject"));
    $$(".edit-class").forEach(b=>b.onclick=()=>classForm(db.classes.find(x=>x.id===b.dataset.id)));
    $$(".delete-class").forEach(b=>b.onclick=()=>deleteRecord("classes","id",b.dataset.id,"Class"));
    $$(".edit-announcement").forEach(b=>b.onclick=()=>announcementForm(db.announcements.find(x=>x.id===b.dataset.id)));
    $$(".delete-announcement").forEach(b=>b.onclick=()=>deleteRecord("announcements","id",b.dataset.id,"Announcement"));
    $$(".delete-event").forEach(b=>b.onclick=()=>deleteRecord("events","id",b.dataset.id,"Event"));
    $$(".edit-payment").forEach(b=>b.onclick=()=>paymentForm(db.payments.find(x=>x.id===b.dataset.id)));
    $$(".enrollment-action").forEach(b=>b.onclick=()=>{const e=db.enlistments.find(x=>x.id===b.dataset.id);if(e){e.status="Approved";saveDB();openAdminView("enrollment");toast("Enrollment approved.");}});
    $$(".mark-read").forEach(b=>b.onclick=()=>{const a=db.announcements.find(x=>x.id===b.dataset.id),s=currentStudent();a.readBy=a.readBy||[];a.readBy.push(s.id);saveDB();openStudentView("announcements");});
    $("#adminSettingsForm")?.addEventListener("submit",e=>{e.preventDefault();db.adminSettings.announcementNotifications=new FormData(e.target).has("announcementNotifications");saveDB();toast("Admin settings saved.");});
    $("#adminStudentSearch")?.addEventListener("input",e=>{
        adminStudentSearch=e.target.value;
        const cursor=e.target.selectionStart ?? adminStudentSearch.length;
        openAdminView("students");
        const next=$("#adminStudentSearch");
        if(next){
            next.focus();
            try{ next.setSelectionRange(cursor,cursor); }catch(_){}
        }
    });
    $("#adminStudentProgram")?.addEventListener("change",e=>{adminStudentProgram=e.target.value;openAdminView("students");});
    $$("[data-student-program]").forEach(b=>b.onclick=()=>{adminStudentProgram=b.dataset.studentProgram;openAdminView("students");});
    const gradeFilterIds={student:"adminGradeStudent",teacher:"adminGradeTeacher",subject:"adminGradeSubject",semester:"adminGradeSemester",schoolYear:"adminGradeYear"};
    Object.entries(gradeFilterIds).forEach(([key,id])=>{
        document.getElementById(id)?.addEventListener("change",e=>{adminGradeFilters[key]=e.target.value;openAdminView("grades");});
    });
}
function adminAction(a){
    if(a==="add-student")studentForm();
    if(a==="add-teacher")teacherForm();
    if(a==="add-subject")subjectForm();
    if(a==="add-class")classForm();
    if(a==="add-material")materialForm();
    if(a==="add-event")eventForm();
    if(a==="add-payment")paymentForm();
    if(a==="add-announcement")announcementForm();
}
function formModal(title,formHTML,submitText,handler){
    openModal(`<div class="modal-head"><h2>${title}</h2><button data-close-modal>×</button></div><form id="adminForm" class="modal-body form-grid">${formHTML}<div class="form-actions"><button type="button" class="secondary-btn" data-close-modal>Cancel</button><button class="primary-btn">${submitText}</button></div></form>`,root=>{
        root.querySelector("#adminForm").onsubmit=e=>{e.preventDefault();handler(new FormData(e.target),root);};
    });
}
function studentForm(obj){
    formModal(obj?"Edit Student":"Add Student",`
    <label>Student ID<input name="id" value="${escapeHTML(obj?.id||"")}" ${obj?"readonly":""} required></label>
    <label>Full Name<input name="name" value="${escapeHTML(obj?.name||"")}" required></label>
    <label>Program<select name="program" required>${programOptions(obj?.program||"BSIT")}</select></label>
    <label>Year Level<input name="year" value="${escapeHTML(obj?.year||"1")}" required></label>
    <label>Section<input name="section" value="${escapeHTML(obj?.section||"BSIT 1A")}" required></label>
    <label>Email<input name="email" type="email" value="${escapeHTML(obj?.email||"")}" ${!obj?"required":""} placeholder="student@gmail.com"></label>
    <label>Contact Number<input name="phone" value="${escapeHTML(obj?.phone||"")}"></label>
    <label>Address<input name="address" value="${escapeHTML(obj?.address||"")}"></label>
    <label>Status<select name="status"><option ${obj?.status==="Active"?"selected":""}>Active</option><option ${obj?.status==="Not Registered" || !obj ? "selected":""}>Not Registered</option><option ${obj?.status==="Inactive"?"selected":""}>Inactive</option></select></label>
    <label>Registration Code<input name="registrationCode" value="${escapeHTML(obj?.registrationCode||generateRegistrationCode())}" readonly></label>
    ${!obj?`<label>Initial Password<input name="password" value="" placeholder="Leave blank until student registers"></label>`:""}`,
    obj?"Save Changes":"Create Student",async(fd)=>{
        const data=Object.fromEntries(fd.entries());
        data.email = String(data.email || "").trim().toLowerCase();
        if(!data.email.endsWith("@gmail.com")){toast("Enter the student's real Gmail address ending in @gmail.com.","error");return;}
        const beforeStudent = obj ? clone(obj) : null;
        if(obj){
            const originalEmail = String(obj.email || "").trim().toLowerCase();
            if(obj.authUid && data.email !== originalEmail){
                toast("This student's Gmail cannot be changed after registration because it is linked to Firebase Authentication.","error");return;
            }
            Object.assign(obj,data);
            obj.registrationCode = obj.registrationCode || generateRegistrationCode();
            // Registered students stay Active; unregistered students stay in the
            // registration queue even if an admin selects Active in the form.
            obj.status = obj.authUid ? (obj.status === "Inactive" ? "Inactive" : "Active") : "Not Registered";
        }else{
            if(db.students.some(s=>s.id===data.id)){toast("Student ID already exists.","error");return;}
            data.status = "Not Registered";
            data.password = "";
            data.registrationCode = data.registrationCode || generateRegistrationCode();
            db.students.push({...data,avatar:""});
        }
        try{
            syncStudentFacultyAssignments();
            const savedStudent=obj ? clone(obj) : clone(db.students.find(s=>String(s.id)===String(data.id)));
            const saved=await window.cecAdminUserCrud.adminSaveStudent(savedStudent,beforeStudent);
            if(!saved) return;
            await cecDatabase.refresh();
            closeDynamic();renderAdmin();openAdminView("students");
            toast(obj?"Student updated successfully in Firebase.":"Student created successfully in Firebase. The student can now register using the assigned ID, code, and Gmail.");
        }catch(error){
            console.error("Admin student save failed:",error);
            toast(error?.message||"Unable to save student changes to Firebase. Check your connection and Security Rules.","error");
        }
    });
}
function teacherForm(obj){
    const linked=Boolean(obj?.authUid), currentEmail=String(obj?.email||"").trim().toLowerCase(), suggestedId=obj?.id||generateTeacherId();
    formModal(obj?"Edit Teacher":"Add Teacher",`
        <label>Teacher ID<input name="id" value="${escapeHTML(suggestedId)}" readonly required></label>
        <label>Full Name<input name="name" value="${escapeHTML(obj?.name||obj?.fullName||"")}" required></label>
        <label>Department<select name="department" required>${departmentOptions(obj?.department||"BSIT Department")}</select></label>
        <label>Email<input name="email" type="email" value="${escapeHTML(obj?.email||"")}" ${linked?"readonly":""} required placeholder="teacher@gmail.com"></label>
        <label>Contact Number<input name="phone" value="${escapeHTML(obj?.phone||obj?.contactNumber||"")}" required></label>
        <label>Status<select name="status"><option ${obj?.status!=="Inactive"?"selected":""}>Active</option><option ${obj?.status==="Inactive"?"selected":""}>Inactive</option></select></label>
        ${!linked?`<div class="info-box teacher-login-box"><b>REAL FACULTY ACCOUNT + AUTOMATIC PASSWORD SETUP</b><p>When you click <b>Create Teacher</b>, CEC creates the Firebase Authentication account immediately and automatically sends a secure password-setup email to the faculty email entered above. The faculty member creates the password privately; the administrator never sees or stores it.</p><small class="form-help">The email can be opened immediately on the faculty member's device. The setup link uses Firebase Authentication and does not require a paid backend.</small></div>`:`<div class="info-box"><b>Firebase Faculty Account Active</b><p>${escapeHTML(obj.email||"")} is linked to this Faculty record. The faculty member can create a password for the first time, or reset it later, through a secure Firebase email link.</p><button type="button" class="secondary-btn" id="resendFacultySetup">SEND PASSWORD CREATION / RESET LINK</button></div>`}
    `,obj?"Save Changes":"Create Teacher",async(fd,root)=>{
        const d=Object.fromEntries(fd.entries());d.id=String(d.id||"").trim();d.name=String(d.name||"").trim();d.fullName=d.name;d.email=String(d.email||"").trim().toLowerCase();d.phone=String(d.phone||"").trim();d.contactNumber=d.phone;
        if(db.teachers.some(t=>String(t.email||"").trim().toLowerCase()===d.email&&String(t.id)!==String(obj?.id||""))){toast("Email must be unique among teachers.","error");return;}
        if(linked&&d.email!==currentEmail){toast("The email of a linked faculty account cannot be changed here.","error");return;}
        if(!linked){
            const temporaryPassword=generateTemporaryFacultyPassword();
            const btn=root.querySelector("#adminForm button.primary-btn");
            if(btn){btn.disabled=true;btn.textContent="CREATING ACCOUNT...";}
            try{
                const credential=await cecFirestore.createFacultyAuth(d.email,temporaryPassword);
                d.authUid=credential.user.uid;
            }catch(error){
                console.error(error);toast(error?.code==="auth/email-already-in-use"?"This email already has a Firebase Authentication account.":"Unable to create the Faculty login account.","error");
                if(btn){btn.disabled=false;btn.textContent="Create Teacher";}return;
            }
        }
        delete d.createLogin;delete d.loginPassword;
        if(obj)Object.assign(obj,d);else db.teachers.push(d);
        try{
            const saved=await window.cecAdminUserCrud.adminSaveTeacher(d,obj?{...obj}:null);
            if(!saved) return;
            await cecDatabase.refresh();
        }catch(error){
            console.error("Admin teacher save failed:",error);
            toast(error?.message||"Unable to save teacher changes to Firebase. Check your connection and Security Rules.","error");
            return;
        }
        if(!obj && d.authUid){
            try{await cecFirestore.passwordReset(d.email,"faculty");toast("Teacher created. Firebase automatically sent the password-setup email to " + d.email + ".");}
            catch(error){console.error(error);toast("Teacher record and Firebase account were created, but Firebase could not send the setup email. Check Authentication email settings and try sending the password creation link again.","error");}
        }else{toast(obj?"Teacher updated.":"Teacher created.");}
        closeDynamic();openAdminView("teachers");
    },root=>{
        root.querySelector("#resendFacultySetup")?.addEventListener("click",async()=>{
            try{await cecFirestore.passwordReset(currentEmail,"faculty");toast("Firebase sent a new secure password-setup link to " + currentEmail + ".");}
            catch(error){console.error(error);toast("Unable to send the password creation/reset link.","error");}
        });
    });
}
function generateTemporaryFacultyPassword(){
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let out="";for(let i=0;i<14;i++)out+=chars[Math.floor(Math.random()*chars.length)];
    return out+"Aa1!";
}
function subjectForm(obj){
    const course=obj?.course||"BSIT", selectedName=obj?.name||"", units=obj?.units||3, code=obj?.code||generateSubjectCode(course), schedule=obj?.schedule||findAvailableSchedule(obj?.code||""), room=obj?.room||findAvailableRoom(schedule,obj?.code||"");
    formModal(obj?"Edit Subject":"Add Subject",`
        <label>Course<select name="course" id="subjectCourse" ${obj?"disabled":""} required>${programOptions(course)}</select></label>
        <input type="hidden" name="course" value="${escapeHTML(course)}">
        <label>Subject Code<input name="code" id="subjectCode" value="${escapeHTML(code)}" readonly required></label>
        <label>Subject Name<select name="name" id="subjectName" required>${subjectCatalogOptions(course,selectedName)}</select></label>
        <label>Units<input name="units" id="subjectUnits" type="number" min="1" value="${units}" readonly required></label>
        <label>Teacher<select name="teacherId" id="subjectTeacher" required><option value="">Select Teacher</option>${db.teachers.filter(t=>t.status!=="Inactive"&&String(t.department||"")===departmentForCourse(course)).map(t=>`<option value="${escapeHTML(t.id)}" ${String(obj?.teacherId)===String(t.id)?"selected":""}>${escapeHTML(t.name||t.fullName)} — ${escapeHTML(t.department||"")}</option>`).join("")}</select></label>
        <label>Schedule<input name="schedule" id="subjectSchedule" value="${escapeHTML(schedule)}" readonly required></label>
        <label>Room<input name="room" id="subjectRoom" value="${escapeHTML(room)}" readonly required></label>
        <div class="info-box">Schedule and room are generated automatically from available Monday-Saturday slots between 7:30 AM and 9:30 PM. Existing subject offerings are checked for conflicts.</div>
    `,obj?"Save Changes":"Create Subject",async(fd)=>{
        const d=Object.fromEntries(fd.entries());d.course=String(d.course);d.units=Number(d.units);const tt=db.teachers.find(t=>String(t.id)===String(d.teacherId));
        if(!tt||String(tt.department||"")!==departmentForCourse(d.course)){toast("Select a teacher from the department assigned to this course.","error");return;}
        d.teacher=tt.name||tt.fullName||"";d.teacherName=d.teacher;d.status="Available";
        if(db.subjects.some(s=>String(s.code).toUpperCase()===String(d.code).toUpperCase()&&String(s.code)!==String(obj?.code||""))){toast("Subject code already exists.","error");return;}
        if(obj)Object.assign(obj,d);else db.subjects.push(d);const saved=await saveDB();if(!saved)return;closeDynamic();openAdminView("subjects");toast(obj?"Subject updated.":"Subject created.");
    },root=>{
        const courseEl=root.querySelector("#subjectCourse"),nameEl=root.querySelector("#subjectName"),unitsEl=root.querySelector("#subjectUnits"),codeEl=root.querySelector("#subjectCode"),scheduleEl=root.querySelector("#subjectSchedule"),roomEl=root.querySelector("#subjectRoom"),teacherEl=root.querySelector("#subjectTeacher");
        courseEl?.addEventListener("change",()=>{const c=courseEl.value;nameEl.innerHTML=subjectCatalogOptions(c,"");unitsEl.value=nameEl.selectedOptions[0]?.dataset.units||3;codeEl.value=generateSubjectCode(c);scheduleEl.value=findAvailableSchedule(obj?.code||"");roomEl.value=findAvailableRoom(scheduleEl.value,obj?.code||"");const dept=departmentForCourse(c);const ts=db.teachers.filter(t=>t.status!=="Inactive"&&String(t.department||"")===dept);teacherEl.innerHTML='<option value="">Select Teacher</option>'+ts.map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.name||t.fullName)} — ${escapeHTML(t.department||"")}</option>`).join("");});
        nameEl?.addEventListener("change",()=>{unitsEl.value=nameEl.selectedOptions[0]?.dataset.units||3;});
    });
}
function classForm(obj){
    const course=normalizeCourse(obj?.program||"BSIT"), year=String(obj?.year||1);
    const selectedIds=new Set((obj?.studentIds||[]).map(String));
    const existingSubject=obj?.subjectCode ? db.subjects.find(s=>String(s.code)===String(obj.subjectCode)) : null;
    const classId=obj?.id||generateClassId();
    const section=obj?.section||generateSection(course,year);
    const selectedSubjectName=existingSubject?.name||obj?.subject||"";
    const selectedTeacherId=String(obj?.teacherId||existingSubject?.teacherId||"");
    const catalog=CEC_SUBJECT_CATALOG[course]||[];
    const subjectOptions=catalog.map(([name,units])=>{
        const existing=db.subjects.find(s=>normalizeCourse(s.course||s.program)===course && String(s.name||"")===String(name) && (!selectedTeacherId || String(s.teacherId)===selectedTeacherId));
        const selected=String(name)===String(selectedSubjectName);
        return `<option value="${escapeHTML(name)}" data-units="${units}" data-code="${escapeHTML(existing?.code||"")}" ${selected?"selected":""}>${escapeHTML(name)}${existing?.code?` — ${escapeHTML(existing.code)}`:""}</option>`;
    }).join("");
    const teacherOptions=db.teachers.filter(t=>t.status!=="Inactive" && String(t.department||"")===departmentForCourse(course)).map(t=>`<option value="${escapeHTML(t.id)}" ${String(t.id)===selectedTeacherId?"selected":""}>${escapeHTML(t.name||t.fullName)} — ${escapeHTML(t.department||"")}</option>`).join("");
    const matchingStudents=db.students.filter(s=>s.status!=="Inactive"&&normalizeCourse(s.program)===course&&String(s.year)===year);
    const initialSchedule=obj?.schedule||existingSubject?.schedule||"";
    const initialRoom=obj?.room||existingSubject?.room||"";
    const initialCode=existingSubject?.code||obj?.subjectCode||"";

    formModal(obj?"Edit Class / Section":"Add Class / Section",`
        <label>Class ID<input name="id" value="${escapeHTML(classId)}" readonly required></label>
        <label>Course<select name="program" id="classCourse" required>${programOptions(course)}</select></label>
        <label>Year Level<select name="year" id="classYear" required>${[1,2,3,4].map(y=>`<option value="${y}" ${String(y)===year?"selected":""}>${y}</option>`).join("")}</select></label>
        <label>Section<input name="section" id="classSection" value="${escapeHTML(section)}" readonly required></label>
        <label>Subject<select name="subjectName" id="classSubject" required><option value="">Select Subject</option>${subjectOptions}</select></label>
        <label>Subject Code<input id="classSubjectCode" value="${escapeHTML(initialCode)}" readonly placeholder="Generated automatically"></label>
        <label>Subject Name<input id="classSubjectName" value="${escapeHTML(selectedSubjectName)}" readonly></label>
        <label>Teacher<select name="teacherId" id="classTeacher" required><option value="">Select Teacher</option>${teacherOptions}</select></label>
        <label>School Year<input name="schoolYear" value="${escapeHTML(obj?.schoolYear||"2026-2027")}" required></label>
        <label>Semester<select name="semester"><option ${obj?.semester!=="Second Semester"&&obj?.semester!=="2nd Semester"?"selected":""}>First Semester</option><option ${obj?.semester==="Second Semester"||obj?.semester==="2nd Semester"?"selected":""}>Second Semester</option></select></label>
        <label>Schedule<input name="schedule" id="classSchedule" value="${escapeHTML(initialSchedule)}" readonly required></label>
        <label>Room<input name="room" id="classRoom" value="${escapeHTML(initialRoom)}" readonly required></label>
        <label>Students Assigned to This Class<select name="studentIds" id="classStudents" multiple size="9" class="multi-select">${matchingStudents.map(s=>`<option value="${escapeHTML(s.id)}" ${selectedIds.has(String(s.id))?"selected":""}>${escapeHTML(s.name)} (${escapeHTML(s.id)}) — ${escapeHTML(s.program)} Year ${escapeHTML(s.year)}</option>`).join("")||'<option disabled>No students in this course/year</option>'}</select></label>
        <div class="info-box">Select a subject from the official course catalog. If no subject offering exists yet, the system automatically creates one with a unique subject code, conflict-free schedule, and room. Only students from the same course and year level can be assigned.</div>
    `,obj?"Save Changes":"Create Class / Section",async(fd)=>{
        const d=Object.fromEntries(fd.entries());
        d.studentIds=fd.getAll("studentIds").map(String);
        d.program=normalizeCourse(String(d.program));
        d.year=String(d.year);
        d.subjectName=String(d.subjectName||"").trim();
        if(!d.subjectName){toast("Select a subject.","error");return;}

        const tt=db.teachers.find(t=>String(t.id)===String(d.teacherId));
        if(!tt){toast("Select a teacher.","error");return;}
        if(String(tt.department||"")!==departmentForCourse(d.program)){toast("The selected teacher must belong to the department assigned to this course.","error");return;}

        // Reuse the existing subject offering only when it belongs to the same
        // course, subject name and teacher and is already used by this class.
        let sub=db.subjects.find(s=>normalizeCourse(s.course||s.program)===d.program
            && String(s.name||"")===d.subjectName
            && String(s.teacherId||"")===String(d.teacherId)
            && String(s.code||"")===String(obj?.subjectCode||""));

        // For a new class, reuse an unused matching offering. If that offering
        // is already attached to another class, create a fresh offering so the
        // new section receives its own schedule/room and unique subject code.
        if(!sub && !obj){
            const candidates=db.subjects.filter(s=>normalizeCourse(s.course||s.program)===d.program
                && String(s.name||"")===d.subjectName
                && String(s.teacherId||"")===String(d.teacherId));
            const usedCodes=new Set(db.classes.filter(c=>String(c.id)!==String(obj?.id||"")).map(c=>String(c.subjectCode||"")));
            sub=candidates.find(s=>!usedCodes.has(String(s.code||"")))||null;
        }

        if(!sub){
            const catalogEntry=(CEC_SUBJECT_CATALOG[d.program]||[]).find(x=>String(x[0])===d.subjectName);
            if(!catalogEntry){toast("The selected subject is not valid for this course.","error");return;}
            const generatedCode=generateSubjectCode(d.program);
            const generatedSchedule=findAvailableSchedule();
            const generatedRoom=findAvailableRoom(generatedSchedule);
            sub={
                code:generatedCode,
                course:d.program,
                name:d.subjectName,
                units:Number(catalogEntry[1]||3),
                teacherId:String(d.teacherId),
                teacher:tt.name||tt.fullName||"",
                teacherName:tt.name||tt.fullName||"",
                schedule:generatedSchedule,
                room:generatedRoom,
                status:"Available"
            };
            db.subjects.push(sub);
        }

        const invalid=d.studentIds.some(id=>{
            const st=db.students.find(s=>String(s.id)===String(id));
            return !st||normalizeCourse(st.program)!==d.program||String(st.year)!==d.year;
        });
        if(invalid){toast("Only students from the same course and year level can be assigned.","error");return;}

        const duplicate=db.classes.find(c=>String(c.id)!==String(obj?.id||"")
            && normalizeCourse(c.program)===d.program
            && String(c.year)===d.year
            && String(c.section).toUpperCase()===String(d.section).toUpperCase()
            && String(c.subjectCode)===String(sub.code));
        if(duplicate){toast("This class/section already has this subject.","error");return;}

        d.subjectCode=String(sub.code);
        d.subject=sub.name;
        d.teacherId=String(tt.id);
        d.teacherAuthUid=String(tt.authUid||"");
        d.teacherEmail=String(tt.email||"").trim().toLowerCase();
        if(!d.teacherAuthUid){
            toast("This teacher does not have a Firebase Faculty login yet. Open Teachers and create/enable the Faculty Login first.","error");
            return;
        }
        d.teacher=tt.name||tt.fullName||"";
        d.teacherName=d.teacher;
        d.schedule=sub.schedule;
        d.room=sub.room;
        d.subjectUnits=Number(sub.units||3);

        // Keep the student's section synchronized with the class assignment.
        d.studentIds.forEach(id=>{
            const st=db.students.find(s=>String(s.id)===String(id));
            if(st) st.section=d.section;
        });

        if(obj) Object.assign(obj,d); else db.classes.push(d);
        syncStudentFacultyAssignments();
        const saved=await saveDB();
        if(!saved)return;
        closeDynamic();
        openAdminView("classes");
        toast("Class saved. The assigned Faculty will receive it automatically in real time.");
    },root=>{
        const courseEl=root.querySelector("#classCourse"),yearEl=root.querySelector("#classYear"),sectionEl=root.querySelector("#classSection"),subjectEl=root.querySelector("#classSubject"),teacherEl=root.querySelector("#classTeacher"),studentEl=root.querySelector("#classStudents"),scheduleEl=root.querySelector("#classSchedule"),roomEl=root.querySelector("#classRoom"),nameEl=root.querySelector("#classSubjectName"),codeEl=root.querySelector("#classSubjectCode");

        const refreshTeachers=()=>{
            const dept=departmentForCourse(courseEl.value);
            const current=teacherEl.value;
            const teachers=db.teachers.filter(t=>t.status!=="Inactive"&&String(t.department||"")===dept);
            teacherEl.innerHTML='<option value="">Select Teacher</option>'+teachers.map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.name||t.fullName)} — ${escapeHTML(t.department||"")}</option>`).join("");
            if(teachers.some(t=>String(t.id)===String(current))) teacherEl.value=current;
            else if(teachers.length===1) teacherEl.value=teachers[0].id;
        };

        const refreshSubjects=()=>{
            const c=normalizeCourse(courseEl.value);
            const old=nameEl.value;
            const catalog=CEC_SUBJECT_CATALOG[c]||[];
            subjectEl.innerHTML='<option value="">Select Subject</option>'+catalog.map(([name,units])=>{
                const teacherId=teacherEl.value;
                const existing=db.subjects.find(s=>normalizeCourse(s.course||s.program)===c&&String(s.name||"")===String(name)&&(!teacherId||String(s.teacherId)===String(teacherId)));
                return `<option value="${escapeHTML(name)}" data-code="${escapeHTML(existing?.code||"")}" data-units="${units}" ${String(name)===String(old)?"selected":""}>${escapeHTML(name)}${existing?.code?` — ${escapeHTML(existing.code)}`:""}</option>`;
            }).join("");
            if(old && catalog.some(x=>String(x[0])===String(old))) subjectEl.value=old;
            updateSubjectFields();
        };

        const updateSubjectFields=()=>{
            const c=normalizeCourse(courseEl.value),name=String(subjectEl.value||"");
            const teacherId=String(teacherEl.value||"");
            let sub=db.subjects.find(s=>normalizeCourse(s.course||s.program)===c&&String(s.name||"")===name&&String(s.teacherId||"")===teacherId);
            if(!sub && obj?.subjectCode) sub=db.subjects.find(s=>String(s.code)===String(obj.subjectCode));
            nameEl.value=name;
            if(sub){
                codeEl.value=sub.code||"";
                scheduleEl.value=sub.schedule||"";
                roomEl.value=sub.room||"";
            }else if(name){
                const previewSchedule=findAvailableSchedule();
                codeEl.value=generateSubjectCode(c);
                scheduleEl.value=previewSchedule;
                roomEl.value=findAvailableRoom(previewSchedule);
            }else{
                codeEl.value="";
                scheduleEl.value="";
                roomEl.value="";
            }
        };

        const refreshStudents=()=>{
            const c=normalizeCourse(courseEl.value),y=String(yearEl.value);
            const current=new Set([...studentEl.selectedOptions].map(o=>o.value));
            const students=db.students.filter(s=>s.status!=="Inactive"&&normalizeCourse(s.program)===c&&String(s.year)===y);
            studentEl.innerHTML=students.map(s=>`<option value="${escapeHTML(s.id)}" ${current.has(String(s.id))?"selected":""}>${escapeHTML(s.name)} (${escapeHTML(s.id)}) — ${escapeHTML(s.program)} Year ${escapeHTML(s.year)}</option>`).join("")||'<option disabled>No students in this course/year</option>';
        };

        courseEl?.addEventListener("change",()=>{
            const c=normalizeCourse(courseEl.value),y=String(yearEl.value);
            sectionEl.value=(obj&&normalizeCourse(obj.program)===c&&String(obj.year)===y)?obj.section:generateSection(c,y);
            refreshTeachers();
            refreshSubjects();
            refreshStudents();
        });
        yearEl?.addEventListener("change",()=>{
            const c=normalizeCourse(courseEl.value),y=String(yearEl.value);
            sectionEl.value=(obj&&normalizeCourse(obj.program)===c&&String(obj.year)===y)?obj.section:generateSection(c,y);
            refreshStudents();
        });
        teacherEl?.addEventListener("change",()=>{refreshSubjects();updateSubjectFields();});
        subjectEl?.addEventListener("change",updateSubjectFields);
        updateSubjectFields();
    });
}
function gradeForm(obj){
    formModal(obj?"Edit Grade":"Add Grade",`<label>Student<select name="studentId">${db.students.map(s=>`<option value="${s.id}" ${obj?.studentId===s.id?"selected":""}>${escapeHTML(s.name)} (${s.id})</option>`).join("")}</select></label><label>Subject<input name="subject" value="${escapeHTML(obj?.subject||"")} " required></label><label>Subject Code<input name="code" value="${escapeHTML(obj?.code||"")} " required></label><label>Units<input name="units" type="number" value="${obj?.units||3}" required></label><label>Grade<input name="grade" type="number" min="1" max="5" step="0.25" value="${obj?.grade||1.75}" required></label>`,obj?"Save Grade":"Add Grade",fd=>{const d=Object.fromEntries(fd.entries());d.units=Number(d.units);d.grade=Number(d.grade);if(obj)Object.assign(obj,d);else db.grades.push({...d,id:uid("G-")});saveDB();closeDynamic();openAdminView("grades");toast("Grade saved.");});
}
function materialForm(obj){
    formModal("Add Learning Material",`<label>Title<input name="title" required></label><label>Subject<input name="subject" required></label><label>Type<select name="type"><option>Syllabus</option><option>Module</option><option>Assignment</option><option>Reference</option></select></label><label>File Name<input name="file" placeholder="example.pdf"></label>`, "Publish Material",fd=>{const d=Object.fromEntries(fd.entries());db.materials.push({...d,id:uid("M-"),postedAt:nowISO()});saveDB();closeDynamic();openAdminView("syllabi");toast("Material published.");});
}
function eventForm(obj){
    formModal("Add Calendar Event",`<label>Event Title<input name="title" required></label><label>Date<input name="date" type="date" required></label><label>Time<input name="time" required placeholder="8:00 AM"></label><label>Location<input name="location" required></label><label>Description<textarea name="description" required></textarea></label>`, "Create Event",fd=>{const d=Object.fromEntries(fd.entries());db.events.push({...d,id:uid("E-")});saveDB();closeDynamic();openAdminView("events");toast("Event added to the calendar.");});
}
function paymentForm(obj){
    formModal("Add / Edit Payment",`<label>Student<select name="studentId">${db.students.map(s=>`<option value="${s.id}" ${obj?.studentId===s.id?"selected":""}>${escapeHTML(s.name)}</option>`).join("")}</select></label><label>Description<input name="description" value="${escapeHTML(obj?.description||"")}" required></label><label>Amount<input name="amount" type="number" step="0.01" value="${obj?.amount||0}" required></label><label>Due Date<input name="dueDate" type="date" value="${obj?.dueDate||today()}" required></label><label>Status<select name="status"><option>Pending</option><option>Paid</option><option>Cancelled</option></select></label>`,obj?"Save Payment":"Add Payment",fd=>{const d=Object.fromEntries(fd.entries());d.amount=Number(d.amount);if(obj)Object.assign(obj,d);else db.payments.push({...d,id:uid("P-"),paidDate:d.status==="Paid"?today():""});saveDB();closeDynamic();openAdminView("payments");toast("Payment record saved.");});
}
function announcementForm(obj){
    formModal(obj?"Edit Announcement":"New Announcement",`<label>Title<input name="title" value="${escapeHTML(obj?.title||"")}" required></label><label>Announcement<textarea name="body" rows="5" required>${escapeHTML(obj?.body||"")}</textarea></label><label>Target Audience<select name="targetAudience"><option value="general" ${(!obj?.targetAudience||obj?.targetAudience==="general")?"selected":""}>General (All users)</option><option value="students" ${obj?.targetAudience==="students"?"selected":""}>Students Only</option><option value="faculty" ${obj?.targetAudience==="faculty"?"selected":""}>Faculty Only</option></select></label><label>Audience Label<select name="audience"><option ${(!obj?.audience||obj?.audience==="All Students")?"selected":""}>All Students</option><option ${obj?.audience==="BSIT Students"?"selected":""}>BSIT Students</option><option ${obj?.audience==="Selected Section"?"selected":""}>Selected Section</option></select></label><label class="checkbox-row"><input type="checkbox" name="isPinned" ${obj?.isPinned?"checked":""}> 📌 Pin this announcement (stays at top of feed)</label><label>Priority<select name="priority"><option value="normal" ${(!obj?.priority||obj?.priority==="normal")?"selected":""}>Normal</option><option value="high" ${obj?.priority==="high"?"selected":""}>🔴 High Priority</option></select></label><label>Expires On (optional)<input name="expiresAt" type="date" value="${escapeHTML(obj?.expiresAt||"")}"></label>`,obj?"Save Changes":"Publish Announcement",fd=>{const d=Object.fromEntries(fd.entries());d.isPinned=fd.has("isPinned");d.expiresAt=d.expiresAt||null;if(obj){Object.assign(obj,d);}else{const a={...d,id:uid("N-"),postedAt:nowISO(),author:"Administrator",readBy:[]};db.announcements.push(a);if(db.adminSettings.announcementNotifications)db.adminNotifications.unshift({id:uid("AN-"),title:"Announcement Published",body:a.title,createdAt:nowISO()});}saveDB();closeDynamic();openAdminView("announcements");renderStudent();toast(obj?"Announcement updated.":"Announcement published. Students have been notified.");});
}
async function deleteRecord(collection,key,id,label){
    const deleted=db[collection].find(x=>String(x[key])===String(id));
    if(!deleted) return;
    const isUser=collection==="students" || collection==="teachers";
    openModal(`<div class="modal-head"><h2>Delete ${label}</h2><button data-close-modal>×</button></div><div class="modal-body"><p>Are you sure you want to delete this ${label.toLowerCase()} record?</p>${isUser?`<div class="warning-box"><b>This is permanent.</b><br>The Firebase profile and linked portal identity records will be removed. ${deleted.authUid?"The Firebase Authentication login will remain on the free Spark plan, but portal access will be removed.":""}</div>`:""}</div><div class="modal-foot"><button class="secondary-btn" data-close-modal>Cancel</button><button class="danger-btn" id="confirmDelete">Delete Permanently</button></div>`,root=>{
        root.querySelector("#confirmDelete").onclick=async()=>{
            const btn=root.querySelector("#confirmDelete"); if(btn){btn.disabled=true;btn.textContent="DELETING...";}
            try{
                if(isUser){
                    // Free Spark plan: Firebase Authentication accounts belonging to other users
                    // cannot be deleted securely from the browser. Remove all portal identity
                    // and data records instead; without userRoles/facultyRoles the account
                    // cannot access the portal.
                    await window.cecAdminUserCrud.adminDeleteFirestoreUserRecords(collection==="students"?"student":"teacher",deleted);
                    db[collection]=db[collection].filter(x=>String(x[key])!==String(id));
                    syncStudentFacultyAssignments();
                    await cecDatabase.refresh();
                }else{
                    db[collection]=db[collection].filter(x=>String(x[key])!==String(id));
                    if(collection==="classes") syncStudentFacultyAssignments();
                    const saved=await saveDB(); if(!saved) throw new Error("Unable to save the deletion to Firebase.");
                }
                closeDynamic();
                openAdminView(collection==="students"?"students":collection==="teachers"?"teachers":collection==="subjects"?"subjects":collection==="classes"?"classes":collection==="grades"?"grades":collection==="announcements"?"announcements":"events");
                toast(label+" deleted from the portal and Firebase data.");
            }catch(error){
                console.error("Admin delete failed:",error);
                if(btn){btn.disabled=false;btn.textContent="Delete Permanently";}
                toast(error?.message||"Unable to delete this record from Firebase. Check your connection and Security Rules.","error");
            }
        };
    });
}

$("#adminNotificationBtn")?.addEventListener("click",()=>openAdminView("announcements"));
$("#adminSideNotification")?.addEventListener("click",()=>openAdminView("announcements"));
$("#adminSideSettings")?.addEventListener("click",()=>openAdminView("settings"));
$("#adminProfileBtn")?.addEventListener("click",()=>openAdminView("profile"));
$("#adminLogoutBtn")?.addEventListener("click",()=>{
    cecStopSessionManager();
    cecClearSessionMeta();
    cecFirestore.signOut().catch(()=>{});
    localStorage.removeItem(ADMIN_SESSION_KEY);
    location.href="../index.html";
});

const CEC_SESSION_IDLE_MS = 30 * 60 * 1000;
const CEC_SESSION_MAX_MS = 8 * 60 * 60 * 1000;
const CEC_SESSION_WARNING_MS = 5 * 60 * 1000;
let cecSessionTimer = null;
let cecSessionActivityTimer = null;
let cecSessionWarningShown = false;

function cecSessionMeta(){
    try { return JSON.parse(localStorage.getItem("cecSessionMeta") || "null"); } catch(_) { return null; }
}
function cecSaveSessionMeta(force=false){
    const role=String(window.cecFirebase?.role||"");
    const uid=String(window.cecFirebase?.uid||"");
    if(!role || !uid) return;
    const existing=cecSessionMeta();
    const now=Date.now();
    const meta = force || !existing || existing.uid!==uid || existing.role!==role
        ? {uid,role,startedAt:now,lastActiveAt:now}
        : {...existing,lastActiveAt:now};
    localStorage.setItem("cecSessionMeta",JSON.stringify(meta));
}
function cecClearSessionMeta(){
    localStorage.removeItem("cecSessionMeta");
    cecSessionWarningShown=false;
}
function cecStopSessionManager(){
    if(cecSessionTimer) clearInterval(cecSessionTimer);
    if(cecSessionActivityTimer) clearTimeout(cecSessionActivityTimer);
    cecSessionTimer=null;
    cecSessionActivityTimer=null;
    ["pointerdown","keydown","touchstart","scroll"].forEach(eventName=>window.removeEventListener(eventName,cecSessionActivity,{passive:true}));
}
function cecSessionActivity(){
    if(cecSessionActivityTimer) return;
    cecSessionActivityTimer=setTimeout(()=>{
        cecSessionActivityTimer=null;
        cecSaveSessionMeta(false);
    },1000);
}
async function cecExpireSession(reason="Your session has expired for security."){
    cecStopSessionManager();
    cecClearSessionMeta();
    try{ await cecFirestore.signOut(); }catch(_){}
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem("cecCurrentFaculty");
    sessionStorage.removeItem("cecFaculty2FAVerified");
    toast(reason,"error");
    setTimeout(()=>location.href=location.pathname.includes("/admin/")||location.pathname.includes("/faculty/")?"../login.html":"login.html",250);
}
function cecStartSessionManager(){
    const role=String(window.cecFirebase?.role||"");
    if(!role || !window.cecFirebase?.uid) return true;
    cecStopSessionManager();
    const existing=cecSessionMeta();
    const now=Date.now();
    if(!existing || existing.uid!==window.cecFirebase.uid || existing.role!==role){
        cecSaveSessionMeta(true);
    }
    const check=()=>{
        const meta=cecSessionMeta();
        if(!meta) { cecSaveSessionMeta(true); return; }
        const age=now - Number(meta.startedAt||now);
        const idle=Date.now() - Number(meta.lastActiveAt||now);
        if(age >= CEC_SESSION_MAX_MS){ cecExpireSession("Your maximum 8-hour session has ended. Please sign in again."); return; }
        if(idle >= CEC_SESSION_IDLE_MS){ cecExpireSession("You were signed out after 30 minutes of inactivity."); return; }
        if(!cecSessionWarningShown && idle >= CEC_SESSION_IDLE_MS-CEC_SESSION_WARNING_MS){
            cecSessionWarningShown=true;
            toast("Your session will expire in about 5 minutes due to inactivity. Move or click to stay signed in.","error");
        }
    };
    ["pointerdown","keydown","touchstart","scroll"].forEach(eventName=>window.addEventListener(eventName,cecSessionActivity,{passive:true}));
    cecSessionTimer=setInterval(check,15000);
    check();
    return true;
}
window.cecSessionManager={start:cecStartSessionManager,stop:cecStopSessionManager,clear:cecClearSessionMeta};

function initStudentMobileMenu(){
    const isStudentPage = document.body.classList.contains("student-dashboard-page") || document.body.className.split(/\s+/).some(c => c.startsWith("student-"));
    const isFacultyPage = document.body.className.split(/\s+/).some(c => c.startsWith("faculty-"));
    const isAdminPage = document.body.className.split(/\s+/).some(c => c.startsWith("admin-"));
    const header = document.querySelector(".dash-header");
    const sidebar = document.querySelector(".sidebar");
    if ((!isStudentPage && !isFacultyPage && !isAdminPage) || !header || !sidebar || document.getElementById("studentMobileMenuBtn") || document.getElementById("facultyMobileMenuBtn") || document.getElementById("adminMobileMenuBtn")) return;

    const menuButton = document.createElement("button");
    menuButton.id = isAdminPage ? "adminMobileMenuBtn" : isFacultyPage ? "facultyMobileMenuBtn" : "studentMobileMenuBtn";
    menuButton.className = isAdminPage ? "admin-mobile-menu-btn" : "student-mobile-menu-btn";
    menuButton.type = "button";
    menuButton.setAttribute("aria-label", isAdminPage ? "Open administrator menu" : isFacultyPage ? "Open faculty menu" : "Open student menu");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.innerHTML = "☰";

    const overlay = document.createElement("div");
    overlay.id = isAdminPage ? "adminMobileMenuOverlay" : isFacultyPage ? "facultyMobileMenuOverlay" : "studentMobileMenuOverlay";
    overlay.className = isAdminPage ? "student-mobile-menu-overlay admin-mobile-menu-overlay" : isFacultyPage ? "student-mobile-menu-overlay faculty-mobile-menu-overlay" : "student-mobile-menu-overlay";
    overlay.setAttribute("aria-hidden", "true");

    // Close button stays inside the drawer so the student can close the menu
    // without needing to tap outside of it.
    const closeButton = document.createElement("button");
    closeButton.id = isAdminPage ? "adminMobileMenuClose" : isFacultyPage ? "facultyMobileMenuClose" : "studentMobileMenuClose";
    closeButton.className = isAdminPage ? "student-mobile-menu-close admin-mobile-menu-close" : isFacultyPage ? "student-mobile-menu-close faculty-mobile-menu-close" : "student-mobile-menu-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close student menu");
    closeButton.innerHTML = "×";
    sidebar.insertBefore(closeButton, sidebar.firstElementChild);

    const closeMenu = () => {
        sidebar.classList.remove("mobile-open");
        overlay.classList.remove("show");
        menuButton.setAttribute("aria-expanded", "false");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("mobile-menu-open");
    };
    const openMenu = () => {
        sidebar.classList.add("mobile-open");
        overlay.classList.add("show");
        menuButton.setAttribute("aria-expanded", "true");
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("mobile-menu-open");
    };

    header.insertBefore(menuButton, header.firstElementChild);
    document.body.appendChild(overlay);
    menuButton.addEventListener("click", () => sidebar.classList.contains("mobile-open") ? closeMenu() : openMenu());
    closeButton.addEventListener("click", closeMenu);
    overlay.addEventListener("click", closeMenu);
    sidebar.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
}

async function init() {
    try { await cecFirebaseReady; } catch(e) {
        if(location.pathname.endsWith("login.html")) toast("Firebase is not configured. Add your Firebase Web App config first.","error");
        return;
    }
    applyTheme();
    if(window.cecFirebase?.role) cecStartSessionManager();
    initStudentMobileMenu();

    const file = location.pathname.split('/').pop() || 'index.html';
    const isAdminPage = location.pathname.includes('/admin/');
    const isFacultyPage = location.pathname.includes('/faculty/');

    const studentPages = {
        'student-dashboard.html': 'home','grades.html': 'grades','subjects.html': 'subjects','materials.html': 'syllabi',
        'calendar.html': 'calendar','attendance.html': 'attendance','tuition.html': 'tuition','announcements.html': 'announcements',
        'notifications.html': 'notifications','profile.html': 'profile','settings.html': 'settings','ai-assistant.html': 'ai'
    };
    const facultyPages = {'faculty-dashboard.html':'home','grades.html':'grades','classes.html':'classes','attendance.html':'attendance','profile.html':'profile','announcements.html':'announcements'};
    const adminPages = {
        'dashboard.html': 'home','students.html': 'students','teachers.html': 'teachers','subjects.html': 'subjects',
        'classes.html': 'classes','enrollment.html': 'enrollment','grades.html': 'grades','attendance.html': 'attendance',
        'materials.html': 'syllabi','calendar.html': 'events','payments.html': 'payments','announcements.html': 'announcements',
        'reports.html': 'reports','profile.html': 'profile','settings.html': 'settings'
    };

    if (file === 'index.html' || file === '') { showPage('landingPage'); return; }
    if (file === 'login.html') return;

    // CEC AI Assistant is a shared protected page for Admin, Faculty, and Student.
    // Firebase can still be restoring the role immediately after Admin/Faculty MFA.
    // Wait for the role instead of treating a temporary null role as logout.
    if (file === 'ai-assistant.html') {
        const currentUser = window.firebase?.auth?.().currentUser || null;
        if (!window.cecFirebase?.role && currentUser && typeof handleFirebaseUser === 'function') {
            try { await handleFirebaseUser(currentUser); } catch (_) {}
        }
        const started = Date.now();
        while (!['admin','faculty','student'].includes(String(window.cecFirebase?.role || '')) && Date.now() - started < 8000) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const role = String(window.cecFirebase?.role || '');
        const authenticated = Boolean(window.firebase?.auth?.().currentUser && ['admin','faculty','student'].includes(role));
        if (!authenticated) {
            location.href = 'login.html';
            return;
        }
        cecStartSessionManager();
        // Give the shared AI page a role-aware route back into the user's dashboard.
        // This keeps Admin, Faculty, and Student navigation consistent without
        // changing the existing portal structure.
        const aiDashboardHref = role === 'admin' ? 'admin/dashboard.html' : (role === 'faculty' ? 'faculty/faculty-dashboard.html' : 'student-dashboard.html');
        const aiDashboardLabel = document.getElementById('aiHomeLink');
        const aiPortalLink = document.getElementById('aiPortalLink');
        if (aiDashboardLabel) {
            aiDashboardLabel.textContent = 'DASHBOARD';
            aiDashboardLabel.setAttribute('href', aiDashboardHref);
        }
        if (aiPortalLink) aiPortalLink.setAttribute('href', aiDashboardHref);
        const aiNotificationLink = document.getElementById('aiNotificationLink');
        const aiProfileLink = document.getElementById('aiProfileLink');
        if (role === 'admin') {
            if (aiNotificationLink) aiNotificationLink.setAttribute('href', 'admin/announcements.html');
            if (aiProfileLink) aiProfileLink.setAttribute('href', 'admin/profile.html');
        } else if (role === 'faculty') {
            if (aiNotificationLink) aiNotificationLink.setAttribute('href', 'faculty/attendance.html');
            if (aiProfileLink) aiProfileLink.setAttribute('href', 'faculty/profile.html');
        } else {
            if (aiNotificationLink) aiNotificationLink.setAttribute('href', 'notifications.html');
            if (aiProfileLink) aiProfileLink.setAttribute('href', 'profile.html');
        }
        return;
    }

    if (isFacultyPage) {
        if (window.cecFirebase.role !== 'faculty' || sessionStorage.getItem('cecFaculty2FAVerified') !== 'true') {
            try { await cecFirestore.signOut(); } catch(_) {}
            sessionStorage.removeItem('cecFaculty2FAVerified');
            location.href='../login.html?role=faculty'; return;
        }
        renderFaculty();
        openFacultyView(facultyPages[file] || 'home');
        return;
    }
    if (isAdminPage) {
        if (window.cecFirebase.role !== "admin") { location.href='../login.html?role=admin'; return; }
        const classLinksChanged=typeof syncClassFacultyAuthLinks === "function" ? syncClassFacultyAuthLinks() : false;
        const studentLinksChanged=syncStudentFacultyAssignments();
        if(classLinksChanged || studentLinksChanged) await cecDatabase.save();
        renderAdmin();
        openAdminView(adminPages[file] || 'home');
        return;
    }
    if (studentPages[file]) {
        const authorized = await waitForStudentAuthorization();
        if (!authorized) { location.href='login.html'; return; }
        renderStudent();
        openStudentView(studentPages[file]);
    }
}

window.__cecRealtimeRefresh = () => {
    if (window.cecFirebase.role === "student") {
        if(currentStudent()) { renderStudent(); const file=location.pathname.split('/').pop(); const map={"grades.html":"grades","subjects.html":"subjects","materials.html":"syllabi","calendar.html":"calendar","attendance.html":"attendance","tuition.html":"tuition","announcements.html":"announcements","notifications.html":"notifications","profile.html":"profile","settings.html":"settings"}; if(map[file]) openStudentView(map[file]); }
    } else if(window.cecFirebase.role === "admin") {
        if(!$("#adminDashboardHome")) return;
        renderAdmin();
        const file=location.pathname.split('/').pop();
        const map={"students.html":"students","teachers.html":"teachers","subjects.html":"subjects","classes.html":"classes","enrollment.html":"enrollment","grades.html":"grades","attendance.html":"attendance","materials.html":"syllabi","calendar.html":"events","payments.html":"payments","announcements.html":"announcements","reports.html":"reports","profile.html":"profile","settings.html":"settings"};
        if(map[file]) openAdminView(map[file]);
    } else if(window.cecFirebase.role === "faculty") {
        renderFaculty();
        const file=location.pathname.split('/').pop();
        const map={"faculty-dashboard.html":"home","grades.html":"grades","classes.html":"classes","attendance.html":"attendance","profile.html":"profile","announcements.html":"announcements"};
        if(map[file]) openFacultyView(map[file]);
    }
};

init();
