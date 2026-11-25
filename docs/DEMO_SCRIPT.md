# Live demo script (≈ 12 minutes)

**Before you present**

1. `npm run demo` → open <http://localhost:4000>.
2. Sign in as any demo account → open the **Demo** menu (top bar) → **Reset demo data…** so all dates are anchored to today.
3. For the video-call segment, open a second window (Ctrl+N) of the same browser. Each tab keeps its own sign-in.

The **Demo** pill in the top bar switches identity instantly (Student / Doctor / Staff / Admin) without logging out.
Every switch keeps the same shared data.

---

## 1 · Student — book an appointment (Aarav Mehta)

1. Login page → **Demo access → Student**. Show the dashboard: next appointment, stats, prescriptions,
   request tracker, health profile, emergency card.
2. **Find a Doctor** → filter by specialty / "Available today" → open **Dr. Ritu Bassi** (Sr. Medical Officer) — show
   OPD timetable and 14-day availability.
3. **Book appointment** → pick today → choose a free slot (booked/past slots are disabled) → reason
   "Fever / cold / flu" → **Confirm**.
4. Show the confirmation pass (QR + `APT-…` code) → **View my appointments** → Upcoming tab.
5. Open the **bell** → "Appointment confirmed".

## 2 · Doctor — consultation and prescription (Dr. Ritu Bassi)

6. **Demo → Doctor · Dr. Ritu Bassi**. The new booking is already in **Today's queue** (it arrived in real time).
7. Open the patient → note the **Penicillin allergy** alert → **Check in** (token issued).
8. **Start consultation** → vitals, symptoms, clinical notes, diagnosis, advice.
9. Prescription builder → add *Paracetamol 650 mg* (TDS × 3 days) and *Cetirizine 10 mg* (HS × 5 days).
   (Optional: try *Amoxicillin* to show the allergy warning.)
10. **Complete consultation** → prescription `RX-…` issued.

## 3 · Student — prescription → medicine request

11. **Demo → Student**. Appointment shows **Completed**; bell shows "New prescription issued".
12. **Prescriptions** → open the new Rx (printable) → **Request these medicines** → choose **Pickup** → submit.
13. **My Requests** → tracker shows *Submitted*.

## 4 · Dispensary staff — fulfil and update inventory (Abhishek Bhardwaj)

14. **Demo → Staff**. Dashboard "Needs action" → open the request → **Approve** → **Start preparing** →
    **Ready for pickup**.
15. **Mark fulfilled** → confirm the deduction dialog → open **Inventory** → stock for both medicines decreased exactly
    once (see **Stock history** ledger). Point out low-stock / expiring alerts.

## 5 · Admin — analytics and audit (Dr. Vishal Srivastava)

16. **Demo → Admin**. KPIs and charts (appointments over time, status mix, requests per week, inventory by
    category, specialty demand, peak hours).
17. **Users** → filter/search; show protected demo accounts; add or deactivate a user.
18. **Activity Log** → every step of this demo appears (booked, checked in, consultation completed, prescription
    created, request approved/fulfilled, inventory updated).

## 6 · Emergency assistance

19. **Demo → Student** → **Emergency** → category, severity, location (prefilled hostel/room) → **Send alert** →
    live status card.
20. **Demo → Staff** (or Admin) → red banner "Active emergency" → **Respond** → **Acknowledge** →
    **Assign responder** (e.g. Avtar Singh, Medical Assistant) → **Resolve** with notes.
21. **Demo → Student** → status shows the responder and *Resolved*.

## 7 · Chat & video consultation (two windows)

22. Window A: Student → **Messages** → conversation with Dr. Ritu Bassi → send a message.
23. Window B: sign in as Doctor → **Messages** → message arrives live → reply (typing indicator, read receipts).
24. Window B: **Video call** → Window A shows the incoming call → **Accept** → both video feeds connect
    (WebRTC peer-to-peer). Hang up → the chat shows "Video call · 0m 42s".
