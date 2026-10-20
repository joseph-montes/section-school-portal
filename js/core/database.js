/* CEC PORTAL - FIREBASE DATA LAYER
   Firebase Authentication + Cloud Firestore + realtime listeners.
   Keep UI/page structure unchanged; this file replaces the old localStorage DB.
*/
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0,10);
const uid = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

const SESSION_KEY = "cecCurrentUser";
const ADMIN_SESSION_KEY = "cecCurrentAdmin";

const defaultDB = {
    students: [], teachers: [], subjects: [], classes: [], grades: [], attendance: [],
    enlistments: [], materials: [], events: [], payments: [], announcements: [],
    adminNotifications: [], excuseRequests: [],
    settings: {notifications:true,emailUpdates:true,darkMode:false},
    adminSettings: {announcementNotifications:true}
};

let db = JSON.parse(JSON.stringify(defaultDB));
let cecFirebaseReadyResolve;
let cecFirebaseReadyReject;
const cecFirebaseReady = new Promise((resolve,reject)=>{cecFirebaseReadyResolve=resolve;cecFirebaseReadyReject=reject;});
window.cecFirebaseReady = cecFirebaseReady;
window.cecFirebase = { role:null, uid:null, adminDoc:null };
// Admin demo MFA gate: password authentication succeeds first, but protected
// admin data/session hydration waits until the one-time verification code is entered.
window.cecAdmin2FAPending = false;

const collections = ["students","teachers","subjects","classes","grades","attendance","enlistments","materials","events","payments","announcements","adminNotifications","excuseRequests"];
const FACULTY_ASSIGNMENTS = "facultyAssignments";
let listeners = [];
let previousSnapshot = {};
let initializing = true;

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function auditValue(value){
    if(value === undefined) return null;
    if(value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if(value && typeof value.toDate === "function") return value.toDate().toISOString();
    if(Array.isArray(value)) return value.slice(0,20).map(auditValue);
    if(typeof value === "object") {
        const out={};
        Object.keys(value).slice(0,30).forEach(k=>out[k]=auditValue(value[k]));
        return out;
    }
    return String(value);
}
function auditChangedFields(before, after){
    const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);
    const changed=[];
    keys.forEach(key=>{
        if(JSON.stringify(auditValue(before?.[key]))!==JSON.stringify(auditValue(after?.[key]))) changed.push(key);
    });
    return changed.slice(0,40);
}
async function writeAuditLog(action, collection, documentId, details={}){
    try{
        if(!window.cecFirebase?.uid || !window.cecFirebase?.role) return;
        const ref=firebase.firestore().collection("auditLogs").doc(uid("AUD-"));
        await ref.set({
            actorUid:String(window.cecFirebase.uid),
            actorEmail:String(window.cecFirebase.email||"").trim().toLowerCase(),
            actorRole:String(window.cecFirebase.role),
            action:String(action||"update"),
            collection:String(collection||""),
            documentId:String(documentId||""),
            details:auditValue(details),
            createdAt:firebase.firestore.FieldValue.serverTimestamp()
        });
    }catch(error){
        console.warn("Audit log write skipped:",error);
    }
}
window.cecAuditLog=writeAuditLog;


// Firebase Storage is loaded as a compat SDK on pages that use materials.
// Some deployments/cached pages can execute before the Storage compat plugin
// has attached itself to the Firebase namespace, so load it lazily when needed.
let cecFirebaseStorageLoadPromise = null;
async function ensureFirebaseStorage(){
    if(typeof window.firebase !== "undefined" && typeof firebase.storage === "function") return firebase.storage();
    if(!cecFirebaseStorageLoadPromise){
        cecFirebaseStorageLoadPromise = new Promise((resolve,reject)=>{
            const existing=document.querySelector('script[data-cec-firebase-storage="true"]');
            if(existing){
                existing.addEventListener("load",()=>{
                    if(typeof window.firebase !== "undefined" && typeof firebase.storage === "function") resolve(firebase.storage());
                    else reject(new Error("Firebase Storage SDK loaded, but the Storage service is unavailable."));
                },{once:true});
                existing.addEventListener("error",()=>reject(new Error("Unable to load the Firebase Storage SDK.")),{once:true});
                return;
            }
            const script=document.createElement("script");
            script.src="https://www.gstatic.com/firebasejs/11.0.2/firebase-storage-compat.js";
            script.async=false;
            script.dataset.cecFirebaseStorage="true";
            script.onload=()=>{
                if(typeof window.firebase !== "undefined" && typeof firebase.storage === "function") resolve(firebase.storage());
                else reject(new Error("Firebase Storage SDK loaded, but the Storage service is unavailable."));
            };
            script.onerror=()=>reject(new Error("Unable to load the Firebase Storage SDK."));
            document.head.appendChild(script);
        });
    }
    return await cecFirebaseStorageLoadPromise;
}
window.cecFirebaseStorage = ensureFirebaseStorage;
function notifyRealtime(){
    try { window.__cecRealtimeRefresh?.(); } catch(e) { console.warn("Realtime refresh failed", e); }
}

function studentDocId(student){ return String(student.authUid || student.id); }
function docIdFor(collection,item){
    if(collection === "students") return String(item.firestoreId || item.id);
    if(collection === "grades" || collection === "attendance" || collection === "enlistments" || collection === "materials" || collection === "events" || collection === "payments" || collection === "announcements" || collection === "adminNotifications") return String(item.id);
    if(collection === "teachers" || collection === "classes") return String(item.id);
    if(collection === "subjects") return String(item.code);
    return String(item.id || uid("DOC-"));
}

function normalizeStudentForFirestore(student){
    const copy = clone(student);
    delete copy.password;
    return copy;
}
async function sha256Hex(value){
    const data=new TextEncoder().encode(String(value));
    const hash=await crypto.subtle.digest("SHA-256",data);
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function currentStudent(){
    const id = localStorage.getItem(SESSION_KEY);
    return db.students.find(s => s.id === id || s.authUid === id) || null;
}
function setStudentSession(id){ localStorage.setItem(SESSION_KEY,id); }
function currentFaculty(){
    const teacherId=String(window.cecFirebase?.teacherId || localStorage.getItem("cecCurrentFaculty") || "");
    const email=String(window.cecFirebase?.email || "").trim().toLowerCase();
    return db.teachers.find(t=>teacherId && String(t.id)===teacherId && String(t.email||"").trim().toLowerCase()===email && t.status==="Active")
        || db.teachers.find(t=>String(t.email||"").trim().toLowerCase()===email && t.status==="Active")
        || null;
}

async function fetchCollection(name, queryBuilder){
    let q = firebase.firestore().collection(name);
    if(queryBuilder) q = queryBuilder(q);
    const snap = await q.get();
    return snap.docs.map(d => ({...d.data(), ...(name === "students" ? {firestoreId:d.id} : {id:d.id})}));
}

async function fetchStudentMaterials(student){
    if(!student) return [];
    const firestore=firebase.firestore();
    const classSnap=await firestore.collection("classes").get();
    const studentIds=new Set([String(student.id||""),String(student.firestoreId||"")].filter(Boolean));
    const classIds=classSnap.docs
        .filter(d=>Array.isArray(d.data()?.studentIds) && d.data().studentIds.map(String).some(id=>studentIds.has(id)))
        .map(d=>String(d.id));
    if(!classIds.length) return [];
    const results=[];
    for(const classId of classIds){
        const rows=await fetchCollection("materials",q=>q.where("classId","==",classId));
        results.push(...rows);
    }
    const seen=new Set();
    return results.filter(row=>{const id=String(row.id||"");if(!id||seen.has(id))return false;seen.add(id);return true;});
}

async function loadCollection(name){
    try {
        if(name === "students") {
            if(window.cecFirebase.role === "admin") return await fetchCollection("students");
            if(window.cecFirebase.role === "faculty") {
                return [];
            }
            if(window.cecFirebase.uid) {
                const snap = await firebase.firestore().collection("students").where("authUid","==",window.cecFirebase.uid).limit(1).get();
                return snap.empty ? [] : [{...snap.docs[0].data(),firestoreId:snap.docs[0].id}];
            }
            return [];
        }
        if(name === "materials" && window.cecFirebase.role === "student") {
            return await fetchStudentMaterials(currentStudent());
        }
        if(["grades","attendance","payments","enlistments","excuseRequests"].includes(name) && window.cecFirebase.role === "student") {
            const s = currentStudent();
            if(!s) return [];
            return await fetchCollection(name,q=>q.where("studentId","==",s.id));
        }
        if(window.cecFirebase.role === "faculty") {
            const teacher = currentFaculty();
            // Faculty is intentionally restricted to the collections required by
            // the Faculty portal. Do not fall through to a collection-wide read
            // for payments, attendance, enlistments, etc.; those collections are
            // not writable/readable by Faculty under the security model.
            const facultyReadable = new Set(["teachers","grades","classes","subjects","announcements","materials","attendance","excuseRequests"]);
            if(!facultyReadable.has(name)) return [];
            if(name === "teachers") {
                if(!teacher) return [];
                const snap=await firebase.firestore().collection("teachers").doc(String(teacher.id)).get();
                return snap.exists ? [{...snap.data(),id:snap.id}] : [];
            }
                if(name === "grades") {
                if(!teacher) return [];
                return await fetchCollection(name,q=>q.where("teacherId","==",teacher.id));
            }
            if(name === "attendance") {
                if(!teacher) return [];
                return await fetchCollection(name,q=>q.where("teacherId","==",String(teacher.id)));
            }
            if(name === "materials") {
                if(!teacher) return [];
                return await fetchCollection(name,q=>q.where("teacherId","==",String(teacher.id)));
            }
            if(name === "excuseRequests") {
                // Load excuse requests for all classes taught by this faculty
                if(!teacher) return [];
                const classDocs=await fetchCollection("classes",q=>q.where("teacherId","==",String(teacher.id)));
                const classIds=classDocs.map(c=>String(c.id||"")).filter(Boolean);
                if(!classIds.length) return [];
                // Firestore 'in' query supports up to 30 items; batch if needed
                const results=[];
                const batchSize=30;
                for(let i=0;i<classIds.length;i+=batchSize){
                    const batch=classIds.slice(i,i+batchSize);
                    try{
                        const rows=await fetchCollection("excuseRequests",q=>q.where("classId","in",batch));
                        results.push(...rows);
                    }catch(e){console.warn("excuseRequests faculty load failed",e);}
                }
                return results;
            }
            if(name === "classes") {
                if(!teacher) return [];
                // Direct Faculty relationship: new class records are linked to the
                // Firebase Authentication UID as teacherAuthUid. Keep teacherId as
                // a compatibility key for older records and merge both queries.
                const authUid=String(window.cecFirebase.uid||"");
                const results=[];
                if(authUid){
                    const byAuth=await fetchCollection("classes",q=>q.where("teacherAuthUid","==",authUid));
                    results.push(...byAuth);
                }
                const byTeacher=await fetchCollection("classes",q=>q.where("teacherId","==",String(teacher.id)));
                const map=new Map();
                [...results,...byTeacher].forEach(row=>map.set(String(row.id),row));
                return [...map.values()];
            }
            if(name === "subjects") {
                if(!teacher) return [];
                return await fetchCollection(name,q=>q.where("teacherId","==",teacher.id));
            }
        }
        if(name === "adminNotifications" && window.cecFirebase.role !== "admin") return [];
        return await fetchCollection(name);
    } catch(error) {
        console.error("Firestore load failed:", name, error);
        return [];
    }
}

async function loadSettings(){
    try {
        if(window.cecFirebase.role === "student" && window.cecFirebase.uid){
            const s = await firebase.firestore().collection("settings").doc(window.cecFirebase.uid).get();
            db.settings = s.exists ? {...defaultDB.settings,...s.data()} : clone(defaultDB.settings);
        } else if(window.cecFirebase.role === "admin" && window.cecFirebase.uid){
            const s = await firebase.firestore().collection("adminSettings").doc(window.cecFirebase.uid).get();
            db.adminSettings = s.exists ? {...defaultDB.adminSettings,...s.data()} : clone(defaultDB.adminSettings);
        }
    } catch(e){ console.warn("Settings load failed",e); }
}

async function hydrateFacultyStudentsFromClasses(){
    if(window.cecFirebase.role !== "faculty" || !window.cecFirebase.uid) return;
    const classes=Array.isArray(db.classes)?db.classes:[];
    const ids=[...new Set(classes.flatMap(c=>Array.isArray(c.studentIds)?c.studentIds.map(String):[]))];
    if(!ids.length){
        // A class without explicit studentIds is a legacy record. Do not erase
        // an already-hydrated Faculty student list just because one snapshot
        // contains no explicit IDs.
        return;
    }
    try{
        const firestore=firebase.firestore();
        const rows=[];
        for(const id of ids){
            try{
                const snap=await firestore.collection("students").doc(String(id)).get();
                if(snap.exists) rows.push({...snap.data(),firestoreId:snap.id});
                else {
                    const q=await firestore.collection("students").where("id","==",String(id)).limit(1).get();
                    if(!q.empty) rows.push({...q.docs[0].data(),firestoreId:q.docs[0].id});
                }
            }catch(e){ console.warn("Faculty student read failed",id,e); }
        }
        db.students=rows;
        notifyRealtime();
    }catch(e){ console.error("Faculty assigned students hydration failed",e); }
}
window.hydrateFacultyStudentsFromClasses=hydrateFacultyStudentsFromClasses;

async function hydrateDB(){
    if(!window.cecFirebase.role){
        return;
    }
    const loaded = await Promise.all(collections.map(async name=>[name,await loadCollection(name)]));
    loaded.forEach(([name,rows])=>db[name]=rows);
    await loadSettings();
    previousSnapshot = clone(db);
    notifyRealtime();
}

function clearListeners(){ listeners.forEach(unsub=>{try{unsub();}catch(e){}}); listeners=[]; }
function subscribeCollection(name){
    // Faculty class realtime data comes directly from the canonical `classes`
    // collection. The query is secured by firestore.rules using teacherId.
    let ref = firebase.firestore().collection(name);
    if(name === "teachers" && window.cecFirebase.role === "faculty" && window.cecFirebase.teacherId){
        ref=ref.doc(String(window.cecFirebase.teacherId));
        const unsub=ref.onSnapshot(snap=>{
            db[name]=snap.exists ? [{...snap.data(),id:snap.id}] : [];
            previousSnapshot[name]=clone(db[name]);
            notifyRealtime();
        },err=>console.warn("Realtime listener failed",name,err));
        listeners.push(unsub);
        return;
    }
    if(name === "students" && window.cecFirebase.role === "student" && window.cecFirebase.uid) ref=ref.where("authUid","==",window.cecFirebase.uid);
    // Faculty students are derived exclusively from the realtime classes.studentIds
    // relationship. Never start a competing students listener that can overwrite
    // the class-derived list with an empty facultyTeacherIds query.
    if(name === "students" && window.cecFirebase.role === "faculty") return;
    if(name === "materials" && window.cecFirebase.role === "student"){
        subscribeStudentMaterialsRealtime();
        return;
    }
    if(["grades","attendance","payments","enlistments","excuseRequests"].includes(name) && window.cecFirebase.role === "student"){
        const s=currentStudent(); if(!s) return;
        ref=ref.where("studentId","==",s.id);
    }
    if(window.cecFirebase.role === "faculty") {
        const teacher=currentFaculty();
        if(name === "teachers" && window.cecFirebase.teacherId) ref=ref.where("id","==",String(window.cecFirebase.teacherId));
        else if(name === "grades" && teacher) ref=ref.where("teacherId","==",teacher.id);
        else if(name === "attendance" && teacher) ref=ref.where("teacherId","==",String(teacher.id));
        else if(name === "subjects" && teacher) ref=ref.where("teacherId","==",teacher.id);
        else if(name === "materials" && teacher) ref=ref.where("teacherId","==",teacher.id);
        else if(name === "excuseRequests") {
            // Skip realtime for excuseRequests on faculty side — loaded on demand via loadCollection
            return;
        }
        else if(name === "classes") {
            // Classes use a dedicated realtime subscription below so both the
            // new Auth-UID link and legacy teacherId link can be merged safely.
            return;
        }
        else if(name !== "students" && name !== "announcements") return;
    }
    if(name === "adminNotifications" && window.cecFirebase.role !== "admin") return;
    if(name === "excuseRequests" && window.cecFirebase.role !== "admin") return;
    const unsub=ref.onSnapshot(snap=>{
        db[name]=snap.docs.map(d=>{
            const data=d.data();
            return name === "students"
                ? {...data, firestoreId:d.id}
                : {...data, id:d.id};
        });
        previousSnapshot[name]=clone(db[name]);
        notifyRealtime();
    },err=>console.warn("Realtime listener failed",name,err));
    listeners.push(unsub);
}
function subscribeStudentMaterialsRealtime(){
    if(window.cecFirebase.role !== "student" || !window.cecFirebase.uid) return;
    const firestore=firebase.firestore();
    const student=currentStudent();
    if(!student) return;
    const studentIds=new Set([String(student.id||""),String(student.firestoreId||"")].filter(Boolean));
    const sources=new Map();
    let classListener=null;
    const materialListeners=new Map();
    const publish=()=>{
        const rows=[...sources.values()];
        const seen=new Set();
        db.materials=rows.filter(row=>{const id=String(row.id||"");if(!id||seen.has(id))return false;seen.add(id);return true;});
        previousSnapshot.materials=clone(db.materials);
        notifyRealtime();
    };
    const rebuild=async snap=>{
        const wanted=new Set(snap.docs.filter(d=>Array.isArray(d.data()?.studentIds)&&d.data().studentIds.map(String).some(id=>studentIds.has(id))).map(d=>String(d.id)));
        for(const [classId,unsub] of materialListeners){
            if(!wanted.has(classId)){try{unsub();}catch(_){} materialListeners.delete(classId);}
        }
        for(const classId of wanted){
            if(materialListeners.has(classId)) continue;
            const unsub=firestore.collection("materials").where("classId","==",classId).onSnapshot(msnap=>{
                for(const [id,row] of sources){if(String(row.classId||"")===classId)sources.delete(id);}
                msnap.docs.forEach(d=>sources.set(d.id,{...d.data(),id:d.id}));
                publish();
            },err=>console.warn("Student material listener failed",classId,err));
            materialListeners.set(classId,unsub);
            listeners.push(unsub);
        }
        publish();
    };
    classListener=firestore.collection("classes").onSnapshot(rebuild,err=>console.warn("Student class material listener failed",err));
    listeners.push(()=>{try{classListener?.();}catch(_){};for(const unsub of materialListeners.values()){try{unsub();}catch(_){}}materialListeners.clear();sources.clear();});
}

function subscribeFacultyClassesRealtime(){
    if(window.cecFirebase.role !== "faculty" || !window.cecFirebase.uid) return;
    const firestore=firebase.firestore();
    const teacher=currentFaculty();
    const teacherId=String(window.cecFirebase.teacherId || teacher?.id || localStorage.getItem("cecCurrentFaculty") || "").trim();
    const email=String(window.cecFirebase.email || firebase.auth().currentUser?.email || "").trim().toLowerCase();
    if(!teacherId && !email) return;

    // IMPORTANT: keep three realtime sources. The canonical class document is
    // still the source of truth, while facultyAssignments is a compatibility
    // index for projects that already contain older class records.
    const sources={byAuth:new Map(),byTeacher:new Map(),byAssignment:new Map()};
    let lastError="";
    const publish=()=>{
        const merged=new Map();
        // Canonical classes take priority over the compatibility assignment mirror.
        sources.byAssignment.forEach((row,id)=>merged.set(id,row));
        sources.byTeacher.forEach((row,id)=>merged.set(id,row));
        sources.byAuth.forEach((row,id)=>merged.set(id,row));
        db.classes=[...merged.values()].filter(row=>{
            const rId=String(row.teacherId||"").trim();
            const rAuth=String(row.teacherAuthUid||"").trim();
            const rEmail=String(row.teacherEmail||"").trim().toLowerCase();
            return (teacherId && rId===teacherId) ||
                   (window.cecFirebase.uid && rAuth===String(window.cecFirebase.uid)) ||
                   (email && rEmail===email);
        });
        previousSnapshot.classes=clone(db.classes);
        if(window.hydrateFacultyStudentsFromClasses) window.hydrateFacultyStudentsFromClasses();
        notifyRealtime();
    };
    const attach=(query,label)=>{
        const unsub=query.onSnapshot(snap=>{
            const target=sources[label];
            target.clear();
            snap.docs.forEach(d=>{
                const data=d.data();
                // facultyAssignments is only a compatibility index. Its document
                // ID is teacherId__classId, but the canonical class ID must remain
                // the referenced classes/{classId} document ID.
                const canonicalId=label==="byAssignment" ? String(data.classId||"").trim() : String(d.id);
                if(label==="byAssignment" && !canonicalId) return;
                target.set(canonicalId,{...data,id:canonicalId});
            });
            lastError="";
            publish();
        },err=>{
            lastError=err?.message||String(err);
            console.error("Faculty realtime class listener failed ("+label+")",err);
            // Do not wipe a working source when one query is denied by an old
            // Firestore Rules deployment. Other realtime sources can still show
            // the class immediately.
        });
        listeners.push(unsub);
    };

    if(window.cecFirebase.uid){
        attach(firestore.collection("classes").where("teacherAuthUid","==",String(window.cecFirebase.uid)),"byAuth");
    }
    if(teacherId){
        attach(firestore.collection("classes").where("teacherId","==",teacherId),"byTeacher");
        attach(firestore.collection("facultyAssignments").where("teacherId","==",teacherId),"byAssignment");
    }
}
function startRealtime(){
    clearListeners();
    collections.forEach(subscribeCollection);
    subscribeFacultyClassesRealtime();
}

async function persistChangedData(){
    if(!window.cecFirebase.role || !window.cecFirebase.uid) return;
    const firestore=firebase.firestore();
    const batch=firestore.batch();
    let writes=0;

    const allowedStudent = new Set(["students","enlistments","settings"]);
    const allowedAdmin = new Set(collections.filter(name => name !== "grades").concat("adminSettings"));
    const allowedFaculty = new Set(["grades","attendance"]);
    const allowed = window.cecFirebase.role === "admin" ? allowedAdmin : window.cecFirebase.role === "faculty" ? allowedFaculty : allowedStudent;

    for(const name of collections){
        if(!allowed.has(name)) continue;
        const before=previousSnapshot[name] || [];
        const after=db[name] || [];
        const beforeMap=new Map(before.map(x=>[docIdFor(name,x),x]));
        const afterMap=new Map(after.map(x=>[docIdFor(name,x),x]));

        for(const [id,item] of afterMap){
            const old=beforeMap.get(id);
            if(JSON.stringify(old)!==JSON.stringify(item)){
                const payload=name === "students" ? normalizeStudentForFirestore(item) : clone(item);
                if(name === "classes" && window.cecFirebase.role === "admin") {
                    const teacherId=String(payload.teacherId||"");
                    const teacher=db.teachers.find(t=>String(t.id)===teacherId);
                    if(teacher){
                        payload.teacherAuthUid=String(teacher.authUid||"");
                        payload.teacherEmail=String(teacher.email||"").trim().toLowerCase();
                    }
                }
                batch.set(firestore.collection(name).doc(id),payload,{merge:true});
                const auditAction = old ? "update" : "create";
                batch.set(firestore.collection("auditLogs").doc(uid("AUD-")),{
                    actorUid:String(window.cecFirebase.uid), actorEmail:String(window.cecFirebase.email||"").trim().toLowerCase(),
                    actorRole:String(window.cecFirebase.role), action:auditAction, collection:name, documentId:String(id),
                    details:{changedFields:auditChangedFields(old||{},item), label:String(item?.name||item?.title||item?.id||id)},
                    createdAt:firebase.firestore.FieldValue.serverTimestamp()
                });
                writes+=2;
                if(name === "teachers" && window.cecFirebase.role === "admin" && item.authUid){
                    batch.set(firestore.collection("facultyRoles").doc(String(item.authUid)),{role:"faculty",teacherId:String(item.id),teacherName:item.name||item.fullName||"",email:item.email?String(item.email).trim().toLowerCase():null,status:item.status||"Active"},{merge:true});
                    writes++;
                }
                if(name === "students" && window.cecFirebase.role === "admin"){
                    batch.set(firestore.collection("studentLookup").doc(String(item.id)),{
                        registered:Boolean(item.authUid && item.email),
                        email:item.email ? String(item.email).trim().toLowerCase() : null,
                        registrationCodeHash:item.registrationCode ? await sha256Hex(item.registrationCode) : null,
                        emailHash:item.email ? await sha256Hex(String(item.email).trim().toLowerCase()) : null,
                        authUid:item.authUid || null
                    },{merge:true});
                    writes++;
                }
            }
        }
        for(const [id] of beforeMap){
            if(!afterMap.has(id)){
                // Students may only delete their own profile; this is intentionally ignored.
                if(name === "students" && window.cecFirebase.role !== "admin") continue;
                batch.delete(firestore.collection(name).doc(id));
                if(name === "students" && window.cecFirebase.role === "admin") batch.delete(firestore.collection("studentLookup").doc(String(beforeMap.get(id)?.id || id)));
                batch.set(firestore.collection("auditLogs").doc(uid("AUD-")),{
                    actorUid:String(window.cecFirebase.uid), actorEmail:String(window.cecFirebase.email||"").trim().toLowerCase(),
                    actorRole:String(window.cecFirebase.role), action:"delete", collection:name, documentId:String(id),
                    details:{label:String(beforeMap.get(id)?.name||beforeMap.get(id)?.title||beforeMap.get(id)?.id||id)},
                    createdAt:firebase.firestore.FieldValue.serverTimestamp()
                });
                if(name === "teachers" && window.cecFirebase.role === "admin" && beforeMap.get(id)?.authUid) {
                    batch.delete(firestore.collection("facultyRoles").doc(String(beforeMap.get(id).authUid)));
                }
                writes++;
            }
        }
    }

    if(window.cecFirebase.role === "student"){
        const s=currentStudent();
        if(s){
            const ref=firestore.collection("students").doc(String(s.firestoreId || s.id));
            batch.set(ref,normalizeStudentForFirestore(s),{merge:true}); writes++;
        }
        const settings=clone(db.settings||defaultDB.settings);
        batch.set(firestore.collection("settings").doc(window.cecFirebase.uid),settings,{merge:true}); writes++;
    }
    // Keep the optional facultyAssignments mirror synchronized atomically with
    // class writes for backward compatibility. Faculty class pages do NOT read
    // this mirror; they listen directly to `classes` in realtime.
    if(window.cecFirebase.role === "admin"){
        const beforeClasses = previousSnapshot.classes || [];
        const afterClasses = db.classes || [];
        const beforeClassMap = new Map(beforeClasses.map(c=>[String(c.id),c]));
        const afterClassMap = new Map(afterClasses.map(c=>[String(c.id),c]));
        for(const [classId, oldClass] of beforeClassMap){
            const nextClass = afterClassMap.get(classId);
            if(!nextClass){
                const oldTeacherId=String(oldClass?.teacherId||"").trim();
                if(oldTeacherId) batch.delete(firestore.collection("facultyAssignments").doc(oldTeacherId+"__"+classId));
            } else {
                const oldTeacherId=String(oldClass?.teacherId||"").trim();
                const newTeacherId=String(nextClass?.teacherId||"").trim();
                if(oldTeacherId && oldTeacherId!==newTeacherId){
                    batch.delete(firestore.collection("facultyAssignments").doc(oldTeacherId+"__"+classId));
                }
            }
        }
        for(const [classId, c] of afterClassMap){
            const oldClass=beforeClassMap.get(classId);
            if(oldClass && JSON.stringify(oldClass)===JSON.stringify(c)) continue;
            const teacherId=String(c?.teacherId||"").trim();
            if(!teacherId) continue;
            const assignmentRef=firestore.collection("facultyAssignments").doc(teacherId+"__"+classId);
            batch.set(assignmentRef,{
                teacherId, classId, subjectCode:String(c.subjectCode||c.code||""), subject:String(c.subject||""),
                program:String(c.program||""), year:String(c.year||""), section:String(c.section||""),
                schoolYear:String(c.schoolYear||""), semester:String(c.semester||""), schedule:String(c.schedule||""), room:String(c.room||""),
                studentIds:Array.isArray(c.studentIds)?c.studentIds.map(String):[], updatedAt:firebase.firestore.FieldValue.serverTimestamp()
            },{merge:true});
            writes++;
        }
    }

    if(window.cecFirebase.role === "admin"){
        // Direct Teacher -> Student access index used by Faculty grade entry.
        // It is rebuilt from the canonical class.studentIds relationship.
        const accessWanted=new Map();
        for(const c of (db.classes||[])){
            const teacherId=String(c.teacherId||"").trim();
            const classId=String(c.id||"").trim();
            if(!teacherId||!classId||!Array.isArray(c.studentIds)) continue;
            for(const studentId of c.studentIds.map(String)){
                const key=teacherId+"__"+studentId;
                const item=accessWanted.get(key)||{teacherId,studentId,classIds:[],subjectCodes:[]};
                if(!item.classIds.includes(classId)) item.classIds.push(classId);
                const code=String(c.subjectCode||c.code||"").trim();
                if(code&&!item.subjectCodes.includes(code)) item.subjectCodes.push(code);
                accessWanted.set(key,item);
            }
        }
        for(const [key,item] of accessWanted){
            batch.set(firestore.collection("facultyStudentAccess").doc(key),{...item,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
            writes++;
        }
        try{
            const existing=await firestore.collection("facultyStudentAccess").get();
            existing.forEach(doc=>{ if(!accessWanted.has(doc.id)) batch.delete(doc.ref); });
        }catch(e){ console.warn("Faculty student access cleanup skipped",e); }
        batch.set(firestore.collection("adminSettings").doc(window.cecFirebase.uid),clone(db.adminSettings||defaultDB.adminSettings),{merge:true}); writes++;
    }

    if(writes) await batch.commit();
    previousSnapshot=clone(db);
}

/**
 * Persist exactly one Faculty grade. This deliberately bypasses the generic
 * database snapshot writer so a Faculty save can never attempt to write other
 * collections. Firestore Security Rules remain the final authorization layer.
 */
async function saveFacultyGrade(grade){
    if(window.cecFirebase?.role !== "faculty" || !window.cecFirebase?.uid) return false;
    const teacher=currentFaculty();
    if(!teacher) return false;
    const id=String(grade?.id||"").trim();
    if(!id) return false;
    const payload=clone(grade);
    delete payload.password;
    payload.id=id;
    payload.teacherId=String(teacher.id);
    payload.updatedAt=payload.updatedAt || nowISO();
    await firebase.firestore().collection("grades").doc(id).set(payload,{merge:true});
    await writeAuditLog("update","grades",id,{studentId:String(payload.studentId||""),subjectCode:String(payload.code||payload.subjectCode||""),label:"Faculty grade"});
    const index=(db.grades||[]).findIndex(g=>String(g.id)===id);
    if(index>=0) db.grades[index]=clone(payload);
    else db.grades.push(clone(payload));
    previousSnapshot.grades=clone(db.grades);
    notifyRealtime();
    return true;
}
window.saveFacultyGrade=saveFacultyGrade;

async function saveFacultyMaterial({classId,title,type,description,file}){
    if(window.cecFirebase?.role !== "faculty" || !window.cecFirebase?.uid) throw new Error("Faculty authentication is required.");
    const teacher=currentFaculty();
    if(!teacher) throw new Error("Active faculty record could not be resolved.");
    if(!classId || !file) throw new Error("A class and file are required.");
    if(file.size > 25 * 1024 * 1024) throw new Error("The file is too large. Maximum size is 25 MB.");
    const allowed=/^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-powerpoint|application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|image\/(png|jpeg|webp)|application\/zip)$/i;
    if(!file.type || !allowed.test(file.type)) throw new Error("Unsupported file type. Use PDF, Office files, TXT, images, or ZIP.");
    const clsSnap=await firebase.firestore().collection("classes").doc(String(classId)).get();
    if(!clsSnap.exists) throw new Error("The selected class could not be found.");
    const cls=clsSnap.data();
    if(String(cls.teacherId||"")!==String(teacher.id) && String(cls.teacherAuthUid||"")!==String(window.cecFirebase.uid)) throw new Error("You are not assigned to this class.");
    const materialId=uid("M-");
    const safeName=String(file.name||"material").replace(/[^A-Za-z0-9._-]+/g,"_").slice(-120);
    const storagePath=`courseMaterials/${String(classId)}/${materialId}/${safeName}`;
    let uploaded=false;
    try{
        const storage=await ensureFirebaseStorage();
        const ref=storage.ref(storagePath);
        await ref.put(file,{contentType:file.type||"application/octet-stream",customMetadata:{teacherId:String(teacher.id),classId:String(classId),materialId}});
        uploaded=true;
        const downloadURL=await ref.getDownloadURL();
        const payload={
            id:materialId, teacherId:String(teacher.id), classId:String(classId),
            subjectCode:String(cls.subjectCode||cls.code||""),
            subject:String(cls.subject||cls.subjectName||cls.subjectCode||cls.code||""),
            title:String(title||file.name||"Material").trim(), type:String(type||"Material"),
            description:String(description||"").trim(), fileName:String(file.name||safeName),
            storagePath, downloadURL, size:Number(file.size||0), contentType:String(file.type||"application/octet-stream"),
            postedAt:nowISO(), updatedAt:nowISO()
        };
        await firebase.firestore().collection("materials").doc(materialId).set(payload);
        await writeAuditLog("create","materials",materialId,{classId:String(classId),title:payload.title,label:"Faculty material"});
        db.materials=[...(db.materials||[]),payload];
        previousSnapshot.materials=clone(db.materials);
        notifyRealtime();
        return payload;
    }catch(error){
        if(uploaded){try{const storage=await ensureFirebaseStorage();await storage.ref(storagePath).delete();}catch(_){} }
        throw error;
    }
}
window.saveFacultyMaterial=saveFacultyMaterial;

async function deleteFacultyMaterial(material){
    if(window.cecFirebase?.role !== "faculty" || !window.cecFirebase?.uid) throw new Error("Faculty authentication is required.");
    const teacher=currentFaculty();
    if(!teacher || String(material?.teacherId)!==String(teacher.id)) throw new Error("You cannot delete this material.");
    const ref=firebase.firestore().collection("materials").doc(String(material.id));
    if(material.storagePath){
        try{const storage=await ensureFirebaseStorage();await storage.ref(String(material.storagePath)).delete();}
        catch(error){if(error?.code!=="storage/object-not-found") throw error;}
    }
    await ref.delete();
    await writeAuditLog("delete","materials",String(material.id),{classId:String(material.classId||""),title:String(material.title||material.fileName||""),label:"Faculty material"});
    db.materials=(db.materials||[]).filter(m=>String(m.id)!==String(material.id));
    previousSnapshot.materials=clone(db.materials);
    notifyRealtime();
}
window.deleteFacultyMaterial=deleteFacultyMaterial;

async function saveDB(){
    try { await persistChangedData(); return true; }
    catch(error){ console.error("Firestore save failed",error); toast?.("Unable to save changes to Firebase. Check your connection and Security Rules.","error"); return false; }
}

async function handleFirebaseUser(user){
    window.cecFirebase.uid=user?.uid || null;
    window.cecFirebase.email=user?.email ? String(user.email).trim().toLowerCase() : null;
    window.cecFirebase.role=null;
    window.cecFirebase.teacherId=null;
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem("cecCurrentFaculty");
    if(!user) localStorage.removeItem("cecSessionMeta");
    clearListeners();

    if(!user){
        db=clone(defaultDB);
        window.cecFirebase.role=null;
        window.cecFirebase.uid=null;
        initializing=false;
        cecFirebaseReadyResolve(true);
        return;
    }

    // Admin demo-MFA: do not hydrate protected portal data during the
    // password-validation step. The user remains Firebase-authenticated only
    // long enough to complete the prototype verification screen.
    if(window.cecAdmin2FAPending){
        window.cecFirebase.role=null;
        initializing=false;
        cecFirebaseReadyResolve(true);
        return;
    }

    // Faculty demo-2FA: do not hydrate protected portal data during the
    // password-validation step. The user is signed out again until the
    // one-time verification code is entered.
    if(window.cecFaculty2FAPending){
        window.cecFirebase.role=null;
        initializing=false;
        cecFirebaseReadyResolve(true);
        return;
    }

    // During student registration Firebase fires onAuthStateChanged immediately
    // after createUserWithEmailAndPassword(). The student Firestore documents
    // have not been created yet, so do not hydrate protected collections here.
    if(window.cecRegistrationInProgress){
        window.cecFirebase.uid=user.uid;
        window.cecFirebase.role=null;
        return;
    }

    try {
        const adminSnap=await firebase.firestore().collection("admins").doc(user.uid).get();
        if(adminSnap.exists && adminSnap.data().role === "admin"){
            window.cecFirebase.role="admin";
            window.cecFirebase.adminDoc={id:adminSnap.id,...adminSnap.data()};
            localStorage.setItem(ADMIN_SESSION_KEY,user.uid);
        } else {
            // Check Faculty before the student collection. Faculty users are not
            // permitted to query the students collection until their faculty role
            // has been established by the security rules.
            const facultyRoleSnap=await firebase.firestore().collection("facultyRoles").doc(user.uid).get();
            if(facultyRoleSnap.exists && facultyRoleSnap.data().role === "faculty"){
                const mapping=facultyRoleSnap.data() || {};
                const teacherId=String(mapping.teacherId || "");
                const teacherSnap=teacherId
                    ? await firebase.firestore().collection("teachers").doc(teacherId).get()
                    : null;
                if(teacherSnap && teacherSnap.exists){
                    const teacher={...teacherSnap.data(),id:teacherSnap.id};
                    const teacherEmail=String(teacher.email || "").trim().toLowerCase();
                    if(teacherEmail === window.cecFirebase.email && teacher.status === "Active"){
                        window.cecFirebase.role="faculty";
                        window.cecFirebase.teacherId=teacher.id;
                        localStorage.setItem("cecCurrentFaculty",teacher.id);
                    }
                }
            }
            if(!window.cecFirebase.role){
                const studentSnap=await firebase.firestore().collection("students").where("authUid","==",user.uid).limit(1).get();
                if(!studentSnap.empty){
                    window.cecFirebase.role="student";
                    const student={...studentSnap.docs[0].data(),firestoreId:studentSnap.docs[0].id};
                    db.students=[student];
                    localStorage.setItem(SESSION_KEY,student.id);
                }
            }
        }
        await hydrateDB();
        if(window.cecFirebase.role === "faculty" && window.hydrateFacultyStudentsFromClasses){
            await window.hydrateFacultyStudentsFromClasses();
        }
        // Rebuild the student -> faculty access bridge whenever Admin loads the portal.
        // This repairs existing records as well as newly assigned classes.
        if(window.cecFirebase.role === "admin" && typeof window.syncStudentFacultyAssignments === "function"){
            window.syncStudentFacultyAssignments();
            // Also materialize the direct facultyStudentAccess index for existing
            // classes, even when no legacy student field needed repair.
            await saveDB();
        }
        startRealtime();
    } catch(error){
        console.error("Firebase user initialization failed",error);
        try{await firebase.auth().signOut();}catch(e){}
    }
    initializing=false;
    cecFirebaseReadyResolve(true);
    notifyRealtime();
}

function initFirebase(){
    if(!window.CEC_FIREBASE_CONFIG || !window.CEC_FIREBASE_CONFIG.apiKey || window.CEC_FIREBASE_CONFIG.apiKey.includes("PASTE_")){
        const msg="Firebase is not configured yet. Open js/core/firebase-config.js and paste your Firebase Web App configuration.";
        console.error(msg);
        document.documentElement.dataset.firebaseError="true";
        cecFirebaseReadyReject(new Error(msg));
        return;
    }
    try{
        if(!firebase.apps.length) firebase.initializeApp(window.CEC_FIREBASE_CONFIG);
        firebase.auth().onAuthStateChanged(handleFirebaseUser);
    }catch(error){
        console.error("Firebase initialization failed",error);
        cecFirebaseReadyReject(error);
    }
}

window.cecDatabase = {
    /** Read a complete collection from Firestore (admin/authorized use only). */
    fetchCollection,
    /** Force a full synchronized refresh of the current user's allowed data. */
    refresh: hydrateDB,
    /** Start/restart realtime listeners after authentication or role changes. */
    startRealtime,
    /** Persist the current in-memory changes to Firestore. */
    save: saveDB,
    /** Return a safe snapshot for debugging/demo purposes. */
    snapshot: () => clone(db)
};



// ---------------- ADMIN USER CRUD (DIRECT FIRESTORE PATH) ----------------
// Admin student/teacher CRUD uses focused writes instead of the generic whole-DB
// synchronizer. This prevents an unrelated collection/rule failure from making
// a simple user create/update appear to have failed.
async function adminSaveStudent(student, previousStudent=null){
    if(window.cecFirebase?.role !== "admin" || !window.cecFirebase?.uid) throw new Error("Administrator authorization is required.");
    const item=normalizeStudentForFirestore(student);
    const id=String(item.id||"").trim();
    if(!id) throw new Error("Student ID is required.");
    const firestore=firebase.firestore();
    const batch=firestore.batch();
    batch.set(firestore.collection("students").doc(id),item,{merge:true});
    batch.set(firestore.collection("studentLookup").doc(id),{
        registered:Boolean(item.authUid && item.email),
        email:item.email ? String(item.email).trim().toLowerCase() : null,
        registrationCodeHash:item.registrationCode ? await sha256Hex(item.registrationCode) : null,
        emailHash:item.email ? await sha256Hex(String(item.email).trim().toLowerCase()) : null,
        authUid:item.authUid || null
    },{merge:true});
    batch.set(firestore.collection("auditLogs").doc(uid("AUD-")),{
        actorUid:String(window.cecFirebase.uid),actorEmail:String(window.cecFirebase.email||"").trim().toLowerCase(),
        actorRole:"admin",action:previousStudent?"update":"create",collection:"students",documentId:id,
        details:{changedFields:auditChangedFields(previousStudent||{},student),label:String(item.name||id)},
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });

    // Keep Faculty class rosters live when Admin creates or edits a student.
    // Classes are the authoritative Faculty -> Student relationship, so a new
    // active student is automatically added to every matching class
    // (program + year + section), and a student moved to another section is
    // removed from the old class rosters. This is what makes the new student
    // appear immediately in Faculty grade/attendance selectors.
    const classSnap=await firestore.collection("classes").get();
    const accessSnap=await firestore.collection("facultyStudentAccess").where("studentId","==",id).get();
    accessSnap.forEach(d=>batch.delete(d.ref));

    const studentProgram=normalizeCourse(item.program||"");
    const studentYear=String(item.year||"").trim().toLowerCase();
    const studentSection=String(item.section||"").trim().toLowerCase();
    const activeStudent=String(item.status||"")!=="Inactive";
    const accessWanted=[];

    classSnap.forEach(doc=>{
        const c=doc.data()||{};
        const classProgram=normalizeCourse(c.program||"");
        const classYear=String(c.year||"").trim().toLowerCase();
        const classSection=String(c.section||"").trim().toLowerCase();
        const matches=activeStudent &&
            Boolean(classProgram && classYear && classSection) &&
            classProgram===studentProgram &&
            classYear===studentYear &&
            classSection===studentSection;
        const currentIds=Array.isArray(c.studentIds)?c.studentIds.map(String):[];
        const hasStudent=currentIds.includes(id);
        const nextIds=matches
            ? [...new Set([...currentIds,id])]
            : currentIds.filter(x=>x!==id);

        if(JSON.stringify(currentIds)!==JSON.stringify(nextIds)){
            batch.set(doc.ref,{studentIds:nextIds,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        }

        if(matches && c.teacherId){
            const teacherId=String(c.teacherId).trim();
            const classId=String(doc.id).trim();
            if(teacherId && classId){
                accessWanted.push({
                    key:teacherId+"__"+id,
                    teacherId,
                    studentId:id,
                    classId,
                    subjectCode:String(c.subjectCode||c.code||"").trim()
                });
            }
        }
    });

    // Rebuild the student's Faculty access index in the same write batch.
    const groupedAccess=new Map();
    accessWanted.forEach(a=>{
        const current=groupedAccess.get(a.key)||{teacherId:a.teacherId,studentId:id,classIds:[],subjectCodes:[]};
        if(!current.classIds.includes(a.classId)) current.classIds.push(a.classId);
        if(a.subjectCode && !current.subjectCodes.includes(a.subjectCode)) current.subjectCodes.push(a.subjectCode);
        groupedAccess.set(a.key,current);
    });
    groupedAccess.forEach((value,key)=>{
        batch.set(firestore.collection("facultyStudentAccess").doc(key),{...value,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    });

    await batch.commit();
    return true;
}

async function adminSaveTeacher(teacher, previousTeacher=null){
    if(window.cecFirebase?.role !== "admin" || !window.cecFirebase?.uid) throw new Error("Administrator authorization is required.");
    const item=clone(teacher); delete item.password; delete item.createLogin; delete item.loginPassword;
    const id=String(item.id||"").trim();
    if(!id) throw new Error("Teacher ID is required.");
    const firestore=firebase.firestore();
    const batch=firestore.batch();
    batch.set(firestore.collection("teachers").doc(id),item,{merge:true});
    if(item.authUid){
        batch.set(firestore.collection("facultyRoles").doc(String(item.authUid)),{
            role:"faculty",teacherId:id,teacherName:item.name||item.fullName||"",
            email:item.email?String(item.email).trim().toLowerCase():null,status:item.status||"Active"
        },{merge:true});
    }
    batch.set(firestore.collection("auditLogs").doc(uid("AUD-")),{
        actorUid:String(window.cecFirebase.uid),actorEmail:String(window.cecFirebase.email||"").trim().toLowerCase(),
        actorRole:"admin",action:previousTeacher?"update":"create",collection:"teachers",documentId:id,
        details:{changedFields:auditChangedFields(previousTeacher||{},teacher),label:String(item.name||id)},
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    return true;
}

async function adminDeleteFirestoreUserRecords(type, record){
    if(window.cecFirebase?.role !== "admin" || !window.cecFirebase?.uid) throw new Error("Administrator authorization is required.");
    const firestore=firebase.firestore();
    const id=String(record?.id||"").trim();
    if(!id) throw new Error("Record ID is required.");
    const refs=[];
    if(type==="student"){
        refs.push(firestore.collection("students").doc(id),firestore.collection("studentLookup").doc(id));
        if(record.authUid) refs.push(firestore.collection("userRoles").doc(String(record.authUid)),firestore.collection("settings").doc(String(record.authUid)));
        const queries=[
            ["grades","studentId",id],["attendance","studentId",id],["enlistments","studentId",id],
            ["payments","studentId",id]
        ];
        for(const [collection,field,value] of queries){
            const snap=await firestore.collection(collection).where(field,"==",value).get(); snap.forEach(d=>refs.push(d.ref));
        }
        // Remove the student from class rosters instead of leaving stale IDs.
        const classes=await firestore.collection("classes").get();
        classes.forEach(d=>{const data=d.data()||{}; if(Array.isArray(data.studentIds) && data.studentIds.map(String).includes(id)){
            refs.push({path:d.ref.path,_cleanupClass:true,ref:d.ref,data:{...data,studentIds:data.studentIds.filter(x=>String(x)!==id)}});
        }});
        // Also remove faculty access-index records that point at this student.
        const access=await firestore.collection("facultyStudentAccess").where("studentId","==",id).get(); access.forEach(d=>refs.push(d.ref));
    }else if(type==="teacher"){
        refs.push(firestore.collection("teachers").doc(id));
        if(record.authUid) refs.push(firestore.collection("facultyRoles").doc(String(record.authUid)));
        const [assignments,access,subjects,classes,grades,attendance,materials]=await Promise.all([
            firestore.collection("facultyAssignments").where("teacherId","==",id).get(),
            firestore.collection("facultyStudentAccess").where("teacherId","==",id).get(),
            firestore.collection("subjects").where("teacherId","==",id).get(),
            firestore.collection("classes").where("teacherId","==",id).get(),
            firestore.collection("grades").where("teacherId","==",id).get(),
            firestore.collection("attendance").where("teacherId","==",id).get(),
            firestore.collection("materials").where("teacherId","==",id).get()
        ]);
        [assignments,access,grades,attendance,materials].forEach(snap=>snap.forEach(d=>refs.push(d.ref)));
        // Keep class/subject/academic records, but remove the deleted teacher's
        // identity from them so no dangling teacher account remains.
        classes.forEach(d=>{const data=d.data()||{}; refs.push({path:d.ref.path,_cleanupTeacher:true,ref:d.ref,data:{...data,teacherId:null,teacherAuthUid:null,teacherEmail:null}});});
        subjects.forEach(d=>{const data=d.data()||{}; refs.push({path:d.ref.path,_cleanupTeacher:true,ref:d.ref,data:{...data,teacherId:null,teacher:null,teacherName:null}});});
    }else throw new Error("Unsupported account type.");
    // Firestore batches are limited to 500 operations. Delete in chunks and add
    // one audit entry to each chunk so large accounts can be removed safely.
    const unique=new Map(refs.map(r=>[r.path,r]));
    const all=[...unique.values()];
    for(let i=0;i<all.length;i+=450){
        const batch=firestore.batch();
        all.slice(i,i+450).forEach(ref=>{
            if(ref && (ref._cleanupClass || ref._cleanupTeacher)) batch.set(ref.ref,ref.data,{merge:false});
            else batch.delete(ref);
        });
        batch.set(firestore.collection("auditLogs").doc(uid("AUD-")),{
            actorUid:String(window.cecFirebase.uid),actorEmail:String(window.cecFirebase.email||"").trim().toLowerCase(),actorRole:"admin",
            action:"delete",collection:type==="student"?"students":"teachers",documentId:id,
            details:{label:String(record.name||record.fullName||id),cascadeCount:all.length},createdAt:firebase.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
    }
    return true;
}

async function adminDeleteAuthAccount(authUid, type){
    // Firebase Auth cannot securely delete another user's account from a browser
    // on the Spark plan. Keep this API for compatibility, but intentionally skip
    // the Auth deletion. Removing userRoles/facultyRoles below revokes portal access.
    return {deleted:false,skipped:true,reason:"spark-plan"};
}

window.cecAdminUserCrud={adminSaveStudent,adminSaveTeacher,adminDeleteFirestoreUserRecords,adminDeleteAuthAccount};

window.cecFirestore = { sha256Hex,
    async createStudentAuth(email,password){ return firebase.auth().createUserWithEmailAndPassword(email,password); },
    async signIn(email,password){ return firebase.auth().signInWithEmailAndPassword(email,password); },
    async signOut(){ return firebase.auth().signOut(); },
    async passwordReset(email, flow){
        const cleanEmail=String(email).trim().toLowerCase();
        if(flow === "faculty") {
            const actionSettings={
                url:"https://portal-in-cec.firebaseapp.com/html/faculty-password-setup.html?flow=faculty",
                handleCodeInApp:false
            };
            return firebase.auth().sendPasswordResetEmail(cleanEmail, actionSettings);
        }
        return firebase.auth().sendPasswordResetEmail(cleanEmail);
    },
    async updatePassword(password){ const u=firebase.auth().currentUser; if(!u) throw new Error("Not authenticated"); return u.updatePassword(password); },
    async createAdminDoc(uid,data){ return firebase.firestore().collection("admins").doc(uid).set(data,{merge:true}); },
    async createFacultyAuth(email,password){
        const appName="cecFacultyAccountCreator";
        let secondary;
        try { secondary=firebase.app(appName); }
        catch(_) { secondary=firebase.initializeApp(window.CEC_FIREBASE_CONFIG,appName); }
        try {
            const credential=await secondary.auth().createUserWithEmailAndPassword(
                String(email).trim().toLowerCase(), password
            );
            return credential;
        } finally {
            try { await secondary.auth().signOut(); } catch(_) {}
        }
    },
    async deleteFacultyAuthAccount(uid){
        const appName="cecFacultyAccountCreator";
        let secondary;
        try { secondary=firebase.app(appName); }
        catch(_) { secondary=firebase.initializeApp(window.CEC_FIREBASE_CONFIG,appName); }
        const current=secondary.auth().currentUser;
        if(current && current.uid===uid) return current.delete();
        throw new Error("Faculty account cleanup is unavailable because the secondary Auth session is not active.");
    }
};

initFirebase();
