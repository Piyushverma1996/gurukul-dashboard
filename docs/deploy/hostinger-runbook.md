# Deploying and running the Gurukul Dashboard on Hostinger

The app runs at `https://dashboard.gurukulfc.com` as a separate Hostinger Node.js web app. The marketing site `gurukulfc.com` isn't touched. This runbook records the steps that actually worked on 2026-09-15. For the background behind these steps, see `docs/CONTEXT.md` §7 and §10.

## 1. GitHub
1. Create a **private** repo (`Piyushverma1996/gurukul-dashboard`).
2. Push `main`.

## 2. Hostinger database
1. Go to hPanel → Websites → **gurukulfc.com** → Databases → **Management**.
2. Create the database:
   - database name `gurukul`
   - username `gurukul`
   - a password of **letters and digits only** (symbols break the connection URL)

   Both the database and the user become `u792094516_gurukul`.
3. Go to Databases → **Remote MySQL**. This is only needed to seed or migrate from a PC.
   - Add the PC's public IPv4, e.g. from `curl https://api.ipify.org`. Don't use the IPv6 address Google shows.
   - Pick the database.
   - Remote host: **`srv1952.hstgr.io`**.
   - Remove the entry when you're done.
   - After any password change, **delete and re-create** the entry, because it keeps the old password.

## 3. Hostinger Node.js app
1. Go to hPanel → Websites → **Add website** → **Push your code, we host it** → **Continue with GitHub**.
   - Authorise Hostinger's GitHub app for the `gurukul-dashboard` repo only.
   - The "Public repository URL" box doesn't work for private repos.
2. Choose the domain: subdomain **`dashboard.gurukulfc.com`**.
3. Review the build settings:

   | Setting | Value |
   |---|---|
   | Framework | Next.js |
   | Branch | `main` |
   | Node | 22.x |
   | Root | `./` |
   | Build | `npm run build` |
   | Package manager | npm |
   | Output | `.next` |

   There's no start-command field, so migrations are run separately (step 5).
4. **Environment variables.** Add these before the first deploy:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://u792094516_gurukul:PASSWORD@127.0.0.1:3306/u792094516_gurukul`. Use **127.0.0.1, not localhost**. |
   | `BETTER_AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `BETTER_AUTH_URL` | `https://dashboard.gurukulfc.com` |
   | `CRON_SECRET` | another random string (same command) |
   | `APP_TIMEZONE` | `Asia/Kolkata` |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 6 |
   | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID` | from step 7 |

5. **Deploy.** Then open `https://dashboard.gurukulfc.com/api/health`. Expected: `{"ok":true,"db":"up"}`.
   - `ER_ACCESS_DENIED_ERROR`: the password or username in `DATABASE_URL` is wrong.
   - `ECONNREFUSED`: the host is wrong. Use `127.0.0.1`.
   - The full reason is in hPanel → Runtime logs, on the line `[health] database check failed`.

## 4. Seed the database (from a PC, once)
Open PowerShell in the project folder. The PC's IP must be allowed in Remote MySQL (step 2.3).
```powershell
$env:DATABASE_URL="mysql://u792094516_gurukul:PASSWORD@srv1952.hstgr.io:3306/u792094516_gurukul"
npm run db:smoke      # prints the server version + "Smoke test passed"
npm run db:migrate    # "Migrations applied"
$env:SEED_ADMIN_NAME="Sharan"; $env:SEED_ADMIN_EMAIL="shrigurshalagurukul@gmail.com"; $env:SEED_ADMIN_PHONE="+919625573511"; $env:SEED_ADMIN_PASSWORD="<temporary password>"
npm run db:seed       # "Admin created…" (creates the admin + the 5 centres; safe to re-run)
npm run db:seed:opg   # OPG World School placeholder: 3 batches, 50 students, 62 marks, 27 ticks
Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD
```
Afterwards:
- Sign in as Sharan with the temporary password. The app forces a new one.
- Remove the PC's IP from Remote MySQL.

## 5. Google Cloud (signed in as shrigurshalagurukul@gmail.com)
Everything here is free. **Don't activate billing / "full account".**

## 6. Google sign-in
1. Go to **Google Auth Platform → Get started**.
   - App name: `Gurukul FC Dashboard`
   - Support and contact email: the Gurukul Gmail
   - Audience: **External**
2. Go to **Audience**. Leave the app in **Testing** mode: "Publish app" needs a home page and privacy policy.
   - Under **Test users**, add every Gmail that will use Google sign-in: Sharan, Piyush, and coaches if they want it.
3. Go to **Clients → Create client → Web application**.
   - Authorised JavaScript origin: `https://dashboard.gurukulfc.com`
   - Authorised redirect URI: `https://dashboard.gurukulfc.com/api/auth/callback/google`
   - Copy the ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. The Gmail address must also be on the person's staff record in the app (Coaches → edit → Email). Sign-up through Google is disabled.

## 7. Google Sheet sync
1. **APIs & Services → Library → Google Sheets API → Enable.**
2. **IAM & Admin → Service accounts → Create** `sheets-sync`. No roles are needed.
3. **Keys → Add key → JSON.** If Google says "Service account key creation is disabled":
   - Go to IAM & Admin → **Organization Policies**.
   - Override **both** `iam.managed.disableServiceAccountKeyCreation` and the legacy `iam.disableServiceAccountKeyCreation`: Manage policy → Override parent's policy → rule **Not enforced** → Set policy.
   - Wait 5–10 minutes, then try again.
   - Optionally, set both back to "Inherit" once the key exists.
4. Create the Google Sheet **"Gurukul Dashboard — Data"**.
   - File → Settings → Locale **India**.
   - **Share** it with the service account's email as **Editor**. Keep general access **Restricted**.
5. Set the environment variables:
   - `GOOGLE_SHEET_ID`: the part of the sheet URL between `/d/` and `/edit`.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the key file base64-encoded on one line. The value starts with `ewogIC`.
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json")) | Set-Clipboard
     ```
   - Then **redeploy**.
6. In the app: **Settings → Google Sheet → Sync now**. The tabs appear:
   - one "Students – ‹Centre›" per centre
   - Summary, Dues, Payments, Attendance, Attendance Monthly, Batches, Coaches, Sync Log, Read me
7. Store the key file in the password manager, then delete it from Downloads.

## 8. Scheduled jobs (cron-job.org)
Hostinger's Node.js site type has no Cron Jobs page, so the jobs run on **cron-job.org** (free, Gurukul account). Configure each job like this:
- **Common tab:** the URL and schedule.
- **Advanced tab:**
  - Request method **POST**
  - Header `Authorization` = `Bearer <CRON_SECRET>`
  - Time zone **Asia/Kolkata**
- **Test run** must show **200 OK**. A 401 means the secret doesn't match.

| Title | URL | Schedule |
|---|---|---|
| Gurukul sheet sync | `https://dashboard.gurukulfc.com/api/cron/sheets-sync` | every 10 minutes |
| Gurukul dues | `https://dashboard.gurukulfc.com/api/cron/generate-dues` | every day at 00:15 |

Turn on "Notify me when execution fails", with "Notify after" set to 3 failures.

Both jobs are backups. The app also raises dues on the first visit each month and syncs when an admin opens it.

## 9. Go-live checklist
- [x] Health check: `{"ok":true,"db":"up"}`
- [x] Sharan signs in with phone + temporary password, is made to change it, and lands on Home
- [x] Sign in with Google works for Sharan's and Piyush's Gmail
- [x] `curl -I https://dashboard.gurukulfc.com/login` shows `x-robots-tag: noindex, nofollow, noarchive`, and `/robots.txt` shows `Disallow: /`
- [x] Both cron jobs return 200
- [ ] Sharan returns the setup sheet (`registers/setup/Gurukul-Setup-Sheet.xlsx`); enter the centres' details, batches, coaches and fee plans
- [ ] Settings → Monthly fee plans: add each centre's fee. This month's dues appear straight away, and the OPG ticks show as "From register".
- [ ] Parent names and WhatsApp numbers filled in the Google Sheet reach the app within about 10 minutes
- [ ] Each coach signs in on their phone and uses "Add to Home Screen"

## 10. Routine operations
- **Deploy:** push to `main`. Auto-deploy builds in 1–2 minutes. Then check `/api/health`.
- **Schema change:** run `npm run db:migrate` from a PC (step 4, first three lines) **before** pushing the code that needs it. Migrations only ever add tables and columns.
- **Rollback:** hPanel → Deployments → redeploy an earlier successful deployment.
- **Changing a secret:** update it in Environment variables, then redeploy. If it's `CRON_SECRET`, also update both cron-job.org headers.
