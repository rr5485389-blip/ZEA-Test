# Interview Test Platform

A complete technical interview assessment platform with instant multi-device & cross-tab synchronization and zero AI dependencies.

## Features
- **Real-Time Exam Settings Sync**: When an admin updates test settings (time limit, question count, max tab switches, passing score), changes immediately propagate to the candidate portal across tabs and devices in real-time.
- **Dedicated Password Storage**:
  - Whenever the admin changes or updates the password, it is automatically written to a dedicated folder in your workspace: `secrets/admin_password.json`.
  - A historical log of all password updates is kept in `secrets/password_history.log`.
  - Even after server restart or project reload, your new password stays persistently preserved.
- **Candidate Flow**:
  - Enter name, click "Start test" — name and live progress stay visible on screen throughout.
  - Dynamically receives the questions and countdown timer configured by admin.
  - Switching away from the tab or losing focus is detected and logged with strikes. Configurable max strikes auto-submits and flags the test.
  - Running out of time auto-submits current responses.
- **Admin Portal**:
  - Sign in from landing page ("Admin sign in"). Default initial password: `admin123` (stored in `secrets/admin_password.json`).
  - **Knowledge Base**: Add, edit, and delete questions manually, or batch import from a PDF.
  - **Candidates & Scores**: Real-time attempt logs showing candidate name, date, score, percentage, tab switches, and status (passed / failed / flagged / timed-out).
  - **Settings**: Configure time limit (minutes), number of questions per test, allowed tab switches, passing score percentage, and update password.
- **No AI Required**:
  - Runs 100% on standard web technologies without external AI services, models, or keys.

## Running Locally in VS Code

1. Download and extract the provided zip file (`interview-test-platform.zip`).
2. Open the folder in **VS Code**.
3. Open a terminal in VS Code (`Ctrl + \`` or `Cmd + \``):
   ```bash
   npm install
   npm run dev
   ```
4. Look at the terminal output. It will display:
   ```
   ➜ Local (this PC):       http://localhost:3000
   ➜ Network (2nd Device): http://192.168.x.x:3000
   ```
5. **On your primary PC (Admin)**: Open `http://localhost:3000`.
6. **On your second device (Candidate phone, tablet, or another laptop)**:
   - Make sure both devices are connected to the same Wi-Fi network.
   - Open the **Network URL** shown in the terminal (e.g. `http://192.168.1.15:3000`).
   - If the second device cannot load the page, allow Node/Port 3000 through your Windows/Mac firewall.
7. Any setting you change on the Admin PC immediately updates on the second device in real-time.
8. All password changes are saved directly to the `/secrets` folder in your project.


