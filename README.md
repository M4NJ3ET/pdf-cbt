# CBT Exam Practice Platform

A full-featured, zero-build Computer-Based Test (CBT) practice portal. Parses standard PDF question papers, allows host review and settings customization, generates unique test keys, and delivers an authentic CBT exam simulation.

## Operational Workflow

### 1. Adding Authorized Users
- Log in with the Host account (`manjeet.bamal07@gmail.com`).
- Click **Manage Users** in the top navigation bar.
- Under **Authorize New Student Email**, enter the student's email and role (`USER`).
- The student can now go to **Register** and create their account. Unlisted emails are rejected automatically by database security triggers.

### 2. Uploading and Publishing a Test
- Navigate to **Upload Test**.
- Drag and drop any question paper PDF (e.g., standard Indian competitive mock formats).
- Wait for client-side PDF.js parsing (progress indicator displays).
- On the **Review & Edit** page:
  - Verify each question text, options, and explanation.
  - Radio buttons indicate the correct answer (adjust if needed).
  - Add or delete options/questions.
- Configure exam duration, marks per question, negative marking, and passing score.
- Click **Publish Exam & Generate Test Key**.
- Copy the generated key (e.g., `ABC-4821`).

### 3. Taking a Test
- Candidates log in and click **Take Test**.
- Enter the Test Key to review instructions, duration, and marking schemes.
- The exam engine includes question status palettes, countdown timer, jump-to-question, review flags, and local state persistence.
- Upon submitting, candidates see their scorecard and complete solutions with answer explanations.