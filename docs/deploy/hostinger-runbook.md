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
Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD
```
Expected:
- `db:smoke` prints the MariaDB version and "Smoke test passed".
- `db:seed` prints "Admin created…".
- Then remove your IP from Remote MySQL.

## 5. Go-live checklist
- [ ] Sharan signs in with phone + temporary password, is forced to set a new password, and sees Home.
- [ ] Sharan signs out, then signs in with Google as shrigurshalagurukul@gmail.com and lands on the same account.
- [ ] A Google account that isn't registered is refused with the "isn't registered" message.
- [ ] `curl -I https://dashboard.gurukulfc.com/login` shows `x-robots-tag: noindex, nofollow, noarchive`.
- [ ] `https://dashboard.gurukulfc.com/robots.txt` shows `Disallow: /`.
- [ ] Add each coach (Coaches → Add coach) and send their details via the WhatsApp button.
- [ ] Create batches per center and assign head/assistant coaches.
- [ ] Import the student list (Students → Import CSV).
- [ ] On a coach's phone: sign in, then "Add to Home Screen". The icon opens the app full-screen.

## Rollback
hPanel → app → Deployments → redeploy the previous successful deployment. Migrations in this project only add tables and columns, so older code keeps working with the newer schema.
