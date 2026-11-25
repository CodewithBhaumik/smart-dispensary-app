# Live demo script (≈ 12 minutes)

This exact sequence is automated in `e2e/demo-flow.spec.ts` and `e2e/video-call.spec.ts`, so it is known to work
end to end.

**Before you present**

1. `npm run demo` → open <http://localhost:4000>.
2. Sign in with any demo card → top bar **Demo** pill → **Reset demo data…** → confirm. This re-anchors every date
   to today, so dashboards and queues look live.
3. For the video-call segment, open a second window (Ctrl+N) of the same browser. Each tab keeps its own sign-in.
4. Dr. Ritu Bassi's OPD runs 8:30 AM–2 PM and 3–10:30 PM on weekdays, 9 AM–7 PM on weekends (Saturday also
   8–10:30 PM). Presenting outside those hours? As the doctor open **Availability**, add a session and save — the
   booking page picks it up instantly.

The **Demo** pill switches identity instantly (Student / Doctor / Staff / Admin, plus every other doctor) without
logging out. All identities share the same live data; changes appear in other open windows in real time.

---

## Demo 1 · Student books an appointment — Aarav Mehta

1. Login page → **Demo access → Student**. Walk through the dashboard: next appointment with QR pass, stats,
   medicine-request tracker, recent prescriptions, health profile (penicillin allergy), emergency card.
2. **Find a Doctor** → specialty chips / **Available today** → **Book** on *Dr. Ritu Bassi*.
3. Date strip (free-slot counts) → pick a time (booked and past slots are disabled) → **Continue** →
   reason *Fever / cold / flu*, notes → **Confirm appointment**.
4. Confirmation screen: QR check-in pass with the `APT-…` code and **Add to calendar** → **View my appointments**.
5. Bell icon → *Appointment confirmed*.

## Demo 2 · Doctor consultation — Dr. Ritu Bassi

6. **Demo → Doctor · Dr. Ritu Bassi**. The booking is already in *Today's queue* (pushed in real time).
7. **Check in by code** → type the student's `APT-…` code (or press **Check in** on the queue row) → token issued.
8. **Appointments** → open Aarav → **Start consultation**.
9. Symptoms (chips), vitals, clinical notes, diagnosis, advice. **Add medicine** → *Paracetamol 650 mg*, *Cetirizine
   10 mg* (dosage, frequency, duration and quantity are pre-filled and editable). Optional: add *Amoxicillin* to show
   the penicillin-allergy warning.
10. **Complete consultation** → confirm → prescription `RX-…` issued.

## Demo 3 · Student prescription → medicine request

11. **Demo → Student**. **Appointments → Past**: the visit is *Completed*. The bell shows *New prescription issued*.
12. **Prescriptions** → open the new prescription (printable) → **Request these medicines** → **Pickup at
    dispensary** → **Submit request** → `MR-…` code → **Track request**.

## Demo 4 · Dispensary staff — Abhishek Bhardwaj

13. **Demo → Staff**. Dashboard → *Needs action*, low-stock and expiring lists.
14. **Medicine Requests** → open `MR-…` → **Approve request** → **Start preparing** → **Mark ready for pickup** →
    **Mark fulfilled** → the confirmation lists the exact stock that will be deducted.
15. **Inventory** → both medicines dropped exactly once; open **Stock history** to show the ledger entry.
    Point out the low-stock / expiry badges.

## Demo 5 · Admin — Dr. Vishal Srivastava

16. **Demo → Admin**. KPIs and charts: appointments (30 days), status mix, requests per week, inventory by
    category, specialty demand, peak hours (each chart can flip to a table).
17. **Users** → filter by role, search, add a user, deactivate one (demo accounts are protected).
18. **Activity Log** → every step of the demo is listed (booked, checked in, consultation completed, prescription
    created, request approved → fulfilled, inventory updated).

## Demo 6 · Emergency assistance

19. **Demo → Student** → **Emergency** → category *High fever*, severity, description (location, phone and allergy
    details are pre-filled) → **Send emergency alert** → **Send alert** → live status card.
20. **Demo → Staff** → red *Active emergency* banner → **Respond** → **Acknowledge** → **Assign responder**
    (e.g. *Avtar Singh, Medical Assistant*) → **Resolve** → pick an outcome → **Mark resolved**.
21. **Demo → Student** → the status card shows the responder and *Resolved*.

## Bonus · Chat and video consultation (two windows)

22. Window A: **Student → Messages** → conversation with Dr. Ritu Bassi → send a message.
23. Window B: sign in as the doctor → **Messages** → the message arrives live (typing indicator, read receipts).
24. Window B: **Video call** → Window A shows the incoming call → **Accept** → both camera feeds connect
    peer-to-peer (WebRTC). Mute / camera / expand controls work; **End call** → the chat shows
    *Video call · 0m 42s*.
