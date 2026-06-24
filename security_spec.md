# Security Specification: St. Paul Clearance Terminal

This specification outlines the data invariants, threat model, and validation rules for our Firestore database.

## 1. Data Invariants

*   **Students Collection (`/students/{studentId}`)**:
    *   `id` must be matching the document ID path variable `studentId`.
    *   `adminNo` must be between 3 and 32 characters, conforming to standard registration codes.
    *   `name` must be between 2 and 128 characters.
    *   `gender` must be strictly either "Male" or "Female".
    *   `gradeClass` must be a non-empty string under 32 characters.
    *   `boardingStatus` must be strictly "Boarder" or "Day Scholar".
    *   `isCleared` must be a boolean.
    *   `photo` (optional) must be a base64 string or URL.

*   **Settings / Branding (`/branding/school`)**:
    *   `logo` must be a base64 encoded image string.
    *   `logoCleaned` must be a boolean.
    *   `updatedAt` must be a valid timestamp.

*   **Class Themes (`/classThemes/custom`)**:
    *   `themes` must be a map mapping class prefixes (e.g. S.1) to ClassTheme configurations.

---

## 2. The "Dirty Dozen" Payloads

Here are 12 specific payloads attempting to break identity, integrity, or system boundaries:

1.  **Student ID Spoofing**: Attempt to write a student document where the inner `id` field does not match the document path ID.
2.  **Junk Character ID Injection**: Creating a student with ID `<script>alert(1)</script>` or a 1.5KB string to cause poisoning.
3.  **Invalid Gender Enum**: Creating a student with gender `"Unknown"` or `"Non-binary"`.
4.  **Oversized Name Field**: Creating a student object containing a 2MB string as the `name` field.
5.  **Illegal Boarding Status**: Setting boarding status to `"Off-Campus"` instead of allowed enums.
6.  **Admin Admission Number Injection**: Writing an admin number mimicking SQL injection pattern.
7.  **Shadow Write Field**: Adding an unauthorized field `isAdmin: true` inside a student record.
8.  **Empty Theme Mapping**: Saving a non-map type as the themes map under custom class themes.
9.  **Stale Updated Timestamp**: Forcing `updatedAt` to a historical fake hardcoded client-side date instead of `request.time`.
10. **Malicious Logo Payload**: Uploading a 10MB text file in place of the `logo` base64 string.
11. **Negative Student Fees Bypass**: Circumventing clearance status keys by adding unvalidated properties to students.
12. **Unsigned-In Write Attempt**: Non-authenticated guest attempting to wipe out the database.

---

## 3. Threat Model and Validation Rules

We enforce:
- Authenticated writes only: `request.auth != null`.
- Tight verification of schemas for collections: `students`, `branding`, and `classThemes`.
