# CRITICAL MANDATORY DIRECTIVE: ATTENDANCE SYSTEM BASELINE & REGRESSION PREVENTION

> [!CAUTION]
> **DO NOT ALTER OR REWRITE THE WORKING ATTENDANCE CALCULATION LOGIC.**
> The attendance query, multi-key database join, timezone handling, and lifecycle metrics established in `server.js`, `LiveAttendanceDashboard.tsx`, and `attendanceStore.ts` are the REQUIRED SYSTEM BASELINE.

---

## 1. Single Source of Truth: Database

The attendance scanner and attendance dashboard MUST read directly from the SAME persistent MySQL `attendance_logs` table.

```
MASTER STUDENT (students table)
  ├──> CLOCK IN / CLOCK OUT (scanner POST /api/attendance/scan)
  └──> ATTENDANCE LOG (attendance_logs table)
         ├──> DASHBOARD HERO CARDS (/api/attendance/dashboard)
         └──> CLASS & STREAM MATRIX (/api/attendance/grid)
```

Do NOT introduce temporary in-memory frontend counters or secondary attendance tables.

---

## 2. Non-Negotiable Attendance Definitions

- **PRESENT TODAY**: Every unique student who successfully clocked in today, **regardless** of whether they have subsequently clocked out.
- **CURRENTLY ON CAMPUS**: Unique students who clocked in today **and have NOT yet clocked out** (`time_out IS NULL`).
- **CLOCKED OUT**: Unique students who successfully clocked in today **and subsequently clocked out** (`time_out IS NOT NULL`).
- **NOT CLOCKED IN**: `Total Master Registered Students - Present Today`.
- **ATTENDANCE RATE**: `(Present Today ÷ Total Master Registered Students) × 100`.

> [!IMPORTANT]
> **CHECKED OUT DOES NOT MEAN ABSENT.**
> A student who checked in at 8:43 AM and checked out at 4:30 PM MUST remain counted under **PRESENT TODAY** and **CLASS/STREAM ATTENDED TODAY**. Only their "CURRENTLY ON CAMPUS" status decrements (`-1`).

---

## 3. Class and Stream Breakdown Rules

1. Every attendance log MUST join to the master `students` table via multi-key matching:
   `al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token`
2. If a student belongs to **S.2 Stream A** and clocks in, they count under **S.2 Stream A Present Today**.
3. If that student later clocks out, they **STILL remain counted** under **S.2 Stream A Present Today**.

---

## 4. Date & Timezone Standard

- All attendance timestamps and date filters MUST use the school's local timezone: `Africa/Kampala`.
- Kampala today string generation: `new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' })` (`YYYY-MM-DD`).
- MySQL pool config MUST specify `dateStrings: true` to prevent automatic UTC offset subtraction.

---

## 5. Mandatory Automated Regression Verification

Before finalizing any changes to the codebase, ALWAYS run:
```bash
node scripts/test_attendance_regression.js
```
All 5 test scenarios (Clock-In, Clock-Out, Duplicate Scan Protection, Refresh Persistence, Multi-Key Lookup) MUST pass 100%.
