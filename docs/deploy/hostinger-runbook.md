# Deploying the Gurukul Dashboard to Hostinger

Target: `https://dashboard.gurukulfc.com`, a separate Node.js web app. The marketing site `gurukulfc.com` is untouched.

## 1. One-time accounts & keys
1. **GitHub:** create a **private** repo `gurukul-dashboard` and push `main`.
2. **Google Cloud** (signed in as shrigurshalagurukul@gmail.com):
   - Create the project "Gurukul Dashboard".
   - APIs & Services → OAuth consent screen: External, app name "Gurukul FC Dashboard", scopes `openid email profile`. Publish it.
   - Credentials → Create OAuth client ID → Web application:
     - Authorised JavaScript origin: `https://dashboard.gurukulfc.com`
     - Authorised redirect URI: `https://dashboard.gurukulfc.com/api/auth/callback/google`
   - Copy the Client ID and Client secret.

## 2. Hostinger
1. **Database:** hPanel → Websites → gurukulfc.com → Databases → MySQL Databases → create DB + user with a strong password. Note host, port (3306), name, user and password. (Hostinger runs MariaDB; the app supports it.)
2. **Remote access for the first seed:** Databases → Remote MySQL → add your current public IP. Remove it after step 4.
3. **App:** hPanel → Websites → Add website → **Node.js web app** → domain **dashboard.gurukulfc.com** → connect GitHub repo `gurukul-dashboard`, branch `main`. Then:
   - Framework: **Next.js**
   - Node **22.x**
   - Build command `npm run build`
   - Start command `npm start` (this runs migrations, then `next start`)
   - Enable auto-deploy.
4. **Environment variables** (app → Environment variables):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DBNAME` (URL-encode special characters in the password) |
   | `BETTER_AUTH_SECRET` | output of `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `BETTER_AUTH_URL` | `https://dashboard.gurukulfc.com` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 1.2 |
   | `CRON_SECRET` | another random string (used from Plan 3) |
   | `APP_TIMEZONE` | `Asia/Kolkata` |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | the service-account key file, base64-encoded (section 4b) |
   | `GOOGLE_SHEET_ID` | the ID from the Google Sheet's URL (section 4b) |

5. SSL: make sure the subdomain has SSL enabled (hPanel → Security → SSL).

## 3. First deploy
1. Trigger a deploy. Wait for "Completed".
2. Open `https://dashboard.gurukulfc.com/api/health`. Expected: `{"ok":true,"db":"up"}`.

## 4. Seed the admin (from your PC, once)
In PowerShell in the project folder:
```powershell
$env:DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DBNAME"
npm run db:smoke
$env:SEED_ADMIN_NAME="Sharan"; $env:SEED_ADMIN_EMAIL="shrigurshalagurukul@gmail.com"; $env:SEED_ADMIN_PHONE="+919625573511"; $env:SEED_ADMIN_PASSWORD="<temporary password>"
npm run db:seed
npm run db:seed:opg   # OPG World School placeholder roster from the September registers
Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD
```
Expected:
- `db:smoke` prints the MariaDB version and "Smoke test passed".
- `db:seed` prints "Admin created…".
- Then remove your IP from Remote MySQL.

## 4b. Google Sheet (student details + backup)
All steps use the Gurukul Google account (shrigurshalagurukul@gmail.com).
1. **Turn on the Sheets API:** Google Cloud Console → project "Gurukul Dashboard" → APIs & Services → Library → **Google Sheets API** → Enable.
2. **Create the service account:**
   - IAM & Admin → Service Accounts → **Create**. Name it `sheets-sync`; no roles are needed.
   - Open it → Keys → Add key → **JSON**, and download the file.
3. **Create the sheet:**
   - In Google Drive, create a Google Sheet called "Gurukul Dashboard — Data".
   - Set File → Settings → Locale to **India**, so dates stay DD/MM/YYYY.
   - Share it with the service account's email (`sheets-sync@….iam.gserviceaccount.com`) as **Editor**.
4. **Sheet ID:** the part of the sheet's URL between `/d/` and `/edit`.
5. **Environment variables in hPanel:**
   - `GOOGLE_SHEET_ID`: the ID from step 4.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the key file base64-encoded. In PowerShell:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json")) | Set-Clipboard
     ```
   - Then redeploy.
6. **First sync:** in the app, open Settings → Google Sheet → **Sync now**. It creates:
   - one "Students – <Centre>" tab per centre
   - Summary, Dues, Payments, Attendance, Attendance Monthly, Batches, Coaches, Sync Log and Read me tabs
7. **Keep the key safe:** store the key file somewhere secure (not in email or chat), then delete it from Downloads.

**How the sheet works:**
- Sharan fills in parent names, WhatsApp numbers and other details in the student tabs. The app picks them up within about 10 minutes.
- A row with an empty ID column becomes a new student.
- Deleting a row doesn't delete the student.
- If the same detail changed in both places, the app's value wins and the row's "Sync note" says so.

## 4c. Cron jobs (hPanel → Advanced → Cron Jobs)
Use the same `CRON_SECRET` as the environment variable.

| Schedule | Command |
|---|---|
| Every 10 minutes | `curl -s -X POST -H "Authorization: Bearer CRON_SECRET_HERE" https://dashboard.gurukulfc.com/api/cron/sheets-sync` |
| Daily at 00:15 | `curl -s -X POST -H "Authorization: Bearer CRON_SECRET_HERE" https://dashboard.gurukulfc.com/api/cron/generate-dues` |

Both jobs are backups: the app also raises dues on the first visit each month, and syncs the sheet when Sharan opens it.

## 5. Go-live checklist
- [ ] Sharan signs in with phone + temporary password, is forced to set a new password, and sees Home.
- [ ] Sharan signs out, then signs in with Google as shrigurshalagurukul@gmail.com and lands on the same account.
- [ ] A Google account that isn't registered is refused with the "isn't registered" message.
- [ ] `curl -I https://dashboard.gurukulfc.com/login` shows `x-robots-tag: noindex, nofollow, noarchive`.
- [ ] `https://dashboard.gurukulfc.com/robots.txt` shows `Disallow: /`.
- [ ] Add each coach (Coaches → Add coach) and send their details via the WhatsApp button.
- [ ] Create batches per center and assign head/assistant coaches.
- [ ] Import the student list (Students → Import CSV), or type students straight into the centre's tab in the Google Sheet.
- [ ] Settings → Monthly fee plans: add each centre's fee. This month's dues appear at once, and the OPG register ticks show as paid ("From register").
- [ ] Settings → Google Sheet → Sync now shows a green "Last sync" line, and the sheet has one tab per centre.
- [ ] Fill in OPG parent names and WhatsApp numbers in "Students – OPG World School". Within about 10 minutes the students' pages show them.
- [ ] Rename the OPG placeholder batches if needed ("Senior 5-6pm", "Senior 6-7pm" and their age groups were guesses).
- [ ] On a coach's phone: sign in, then "Add to Home Screen". The icon opens the app full-screen.

## Rollback
hPanel → app → Deployments → redeploy the previous successful deployment. Migrations in this project only add tables and columns, so older code keeps working with the newer schema.
