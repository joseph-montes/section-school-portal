# CEC Portal Development Roadmap

## Phase 1 — Security & Reliability (Completed)
- Admin MFA demo and faculty MFA demo
- Role-based Firebase authorization
- Session timeout / inactivity management
- Security audit logging
- Real-time Security Audit Log using Firestore listeners
- Responsive portal navigation
- Security-focused Firestore rules

## Phase 2 — Adaptive Student Success (Completed in this build)
- Student Success Radar: combines existing academic average and attendance signals into On Track / Watch / High Attention guidance.
- Student recommendations: simple, explainable next-step guidance based on the same records.
- Grade What-If simulator: projects an estimated average from a hypothetical next grade.
- Faculty Class Performance Snapshot: class academic average, attendance, students to watch, and high-attention count.
- Admin Early Warning view: school-level advisory list of students requiring attention.
- All Phase 2 analytics are read-only and use existing Firestore data; they do not automatically change grades, attendance, or student status.

## Phase 3 — Communication & Intelligence
- Context-aware notifications
- AI Academic Assistant with strict read-only access to permitted student data
- Personalized learning recommendations
- Teacher/student messaging and escalation workflows

## Phase 4 — Digital Student Passport
- Academic roadmap
- Verified achievements and digital credentials
- QR-verifiable certificates
- Internship / scholarship profile

## Phase 5 — Future-ready Platform
- PWA/mobile experience
- Offline-first faculty workflows with safe synchronization
- Backend/Cloud Functions for trusted security workflows
- Analytics and reporting APIs
- Integrations with future school systems

## Phase 3 — Communication & Intelligence (Started in this build)
- CEC Academic Guide: a read-only academic assistant that answers common questions about the student's own grades, attendance, study priorities, and school updates.
- Context-aware student recommendations: combines the existing academic/attendance signals with current announcements to surface a small set of relevant next actions.
- Communication Center: presents the latest school updates directly alongside the student's personalized guidance.
- Faculty intervention workflow: highlights students who may need human follow-up and provides a direct contact action when an email address is available.
- Admin communication intelligence: adds a human-review support queue that combines early-warning indicators with school-update context.
- Phase 3 intelligence is advisory and explainable. It does not modify grades, attendance, enrollment, or student status automatically.
- The first Phase 3 build intentionally uses the portal's existing authorized data and does not require an external AI API key. A future backend AI service can be added behind the same read-only boundary.

### Phase 3 next expansion
- Secure in-portal teacher/student messaging with Firestore authorization.
- Message threads, unread states, and escalation history.
- Optional server-side AI assistant using a trusted backend/Cloud Function rather than exposing an AI API key in the browser.


## Phase 3.1 — Real AI Assistant (Complete in this build)

- Real generative AI using WebLLM and an open-source Qwen model running locally in the browser.
- No paid AI API and no AI API key in the portal.
- Student, Faculty, and Admin role-aware context.
- AI chat, streaming responses, model loading progress, Light/Standard model selection, and conversation reset.
- Portal data is prepared client-side from the role-scoped data already loaded for the authenticated user.
- AI responses are advisory and grounded by a strict system prompt; official academic decisions remain human-controlled.
- Requires a WebGPU-capable browser and an initial model download.
