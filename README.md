# Smart Dispensary

**Campus healthcare management platform** — appointments, consultations, prescriptions, medicine requests,
inventory, emergency assistance, notifications, analytics, and real-time **chat + video consultations** between
students and doctors.

Four role-based workspaces share one live system:

| Role | Highlights |
|---|---|
| **Student** | Doctor directory with live OPD slots · booking / rescheduling / cancellation with conflict prevention · QR check-in pass · prescriptions (printable) · medical records with uploads · medicine catalog and requests (pickup or campus delivery) with live tracking · emergency assistance · chat and video calls with doctors |
| **Doctor** | Today's queue with tokens · check-in (button or code) · consultation workspace (vitals, symptoms, notes, diagnosis, advice, follow-up) · prescription builder with allergy warnings · patient history · availability and leave management |
| **Dispensary staff** | Medicine-request pipeline (approve → prepare → ready / out for delivery → fulfil) · inventory with batches, expiry tracking, low-stock alerts and a stock ledger · emergency response |
| **Admin** | Analytics dashboard (Recharts) · user management (add / edit / activate / deactivate) · appointments, inventory, requests and emergencies oversight · full activity log |

> Branding is intentionally generic ("Smart Dispensary"). The doctor roster, staff designations and health-centre
> timings in the demo data are taken from a public university health-centre page; students, appointments and all
> medical data are fictional sample data.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui (Radix UI), lucide-react, React Router 7, TanStack Query 5, Recharts 3, react-hook-form + zod, sonner, qrcode.react, Socket.IO client, WebRTC |
| Backend | Node.js 22, Express 5 (TypeScript via tsx), SQLite (better-sqlite3), Socket.IO 4, zod, bcryptjs, multer |
| Testing | Vitest + supertest (API & socket tests), Playwright (end-to-end in Google Chrome) |

Documentation:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (architecture, data model, workflow state machines) ·
[`docs/API.md`](docs/API.md) (REST endpoints, business rules, realtime events) ·
[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) (presentation walkthrough).

---

## Getting started

**Requirements:** Node.js **20.19+ or 22+** and npm. (Google Chrome only for the end-to-end tests.)

```bash
npm install          # installs client + server workspaces
npm run demo         # builds the client and starts everything on http://localhost:4000
```

Open <http://localhost:4000>. The SQLite database (`server/data/smart-dispensary.db`) is created and filled with demo
data automatically on first start.

### Development mode (hot reload)

```bash
npm run dev          # API on :4000 + Vite dev server on http://localhost:5173
```

### Useful scripts

| Command | What it does |
|---|---|
| `npm run demo` | Production build + single server on port 4000 (recommended for presenting) |
| `npm run dev` | API (watch mode) + Vite dev server with proxy |
| `npm run seed` | Wipes the database and reloads fresh demo data (dates re-anchored to today) |
| `npm test` | 119 API, workflow, socket and seed-data tests (Vitest, in-memory SQLite) |
| `npm run test:e2e` | Builds the app and runs the full presentation flow + a two-window video call in Chrome (Playwright) |
| `npm run typecheck` | TypeScript checks for client and server |

Environment variables (optional): `PORT` (default 4000), `DB_PATH` (SQLite file), `DATA_DIR` (database + uploads
folder), `DEMO_MODE=false` (hide demo accounts / reset).

---

## Demo accounts

All demo accounts use the password **`demo1234`**. The login page has one-click buttons for each role, and the
**Demo** pill in the top bar switches identity instantly without logging out — data is shared, so a booking made as
the student appears immediately in the doctor's queue.

| Role | Name | Email |
|---|---|---|
| Student | Aarav Mehta | `aarav.mehta@smartdispensary.in` |
| Doctor | Dr. Ritu Bassi (Sr. Medical Officer) | `ritu.bassi@smartdispensary.in` |
| Dispensary staff | Abhishek Bhardwaj (Pharmacist) | `abhishek.bhardwaj@smartdispensary.in` |
| Admin | Dr. Vishal Srivastava (Faculty-in-Charge) | `vishal.srivastava@smartdispensary.in` |

Every other doctor is also available in the switcher, so you can act as whichever doctor a booking was made with.

**Reset demo data** (Demo menu → *Reset demo data…*) restores the sample data and re-anchors all dates to today —
do this right before presenting.

### Video calls

Calls are peer-to-peer WebRTC with Socket.IO signaling (no external service). To demo on one laptop, open two
windows of the same browser (each tab keeps its own sign-in), sign in as the student in one and the doctor in the
other, then press **Video call** in Messages or on a video appointment. Browsers only allow camera access on
`localhost` or HTTPS, so for two different devices serve the app over HTTPS.

---

## Testing

* **Vitest + supertest** (`server/tests`, 119 tests): authentication and role guards, slot generation and every
  booking conflict rule, reschedule/cancel/check-in rules, consultation → prescription → visit-summary flow, record
  uploads, medicine-request lifecycle with exact stock arithmetic and duplicate-fulfilment protection, emergencies,
  notifications, activity log, chat REST + real Socket.IO call signaling, and seed-data invariants.
* **Playwright** (`e2e/`, 7 tests): the complete presentation flow across all four roles (book → check in →
  consult → prescribe → request → fulfil → analytics → emergency), and a student ↔ doctor chat + WebRTC video call
  in two browser windows using Chrome's fake camera. `npx playwright test --config playwright.dev.config.ts` runs the
  same tests against an already running `npm run dev`. (Check-in only works on the appointment day, so the flow test
  skips itself in the last few minutes before midnight when no slot is left today.)

## Project structure

```
shared/        Types + constants shared by client and server (statuses, workflow rules, timetable)
server/        Express API, SQLite schema + seed, Socket.IO realtime, Vitest tests
client/        React app (pages per feature, design-system components, app shell)
e2e/           Playwright end-to-end tests
docs/          Architecture and demo script
```

## Known limitations

* Demo-grade security: bearer-token sessions and bcrypt hashing, but no e-mail verification, password reset flow
  or rate limiting.
* Emergency requests notify the health-centre team inside the app; there is no SMS / phone integration and no
  automatic ambulance dispatch.
* Campus delivery is a status workflow (no live tracking).
* Video calls need both participants online at the same time; across different networks a TURN server would be
  needed for some firewalls.
* Medicine information is general reference text, not medical advice.
