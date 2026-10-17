# මරු Bun POS

Point-of-sale web app for **මරු Bun** – *The Taste of Something Special.*
Plain HTML + JS (no build step) · Data & login on **Supabase** · Hosted on **Netlify** · Code on **GitHub**.

## What's inside
| Tab | What it does |
|---|---|
| **POS** | Tap items, pick extras (cheese/egg…), Dine-in / Takeaway, customer name + WhatsApp no., discount (% or LKR), service charge, payment (Cash / Card / Bank / QR), cash received → balance to give |
| **Orders & Billing** | Bill history – today / month / any date, search, daily totals, reprint, resend on WhatsApp, CSV export |
| **Dashboard** | Today + month sales, dine-in vs takeaway, best-selling items, item stock, low ingredient alerts, 7-day chart |
| **Kitchen Display** | New orders appear live with a sound alert. **Mark Served** or **Print** slip. Cashier gets a "served" alert |
| **Menu Management** | Categories, items (price, stock), extras / add-ons with prices |
| **Inventory** | Ingredients (buns, cheese…) with low-stock alert level |
| **Google Review** | Save your Google review link (goes on WhatsApp bills only, not on printed bills) |
| **Settings & Security** | Cashier on duty, service charge, default discount, payment methods, shop details, **2-step verification (authenticator app)**, change password |

Try it right now without any setup: open `index.html` through any web server (e.g. `python3 -m http.server`) – with empty keys it runs in **DEMO MODE** (login `admin@demo.lk` / `admin123`, 2-step code `123456`, data kept only in that browser).

---

## 1) Supabase (database + login)
1. https://supabase.com → **New project** (choose a region close to Sri Lanka, e.g. Singapore / Mumbai). Save the database password.
2. **SQL Editor → New query** → paste everything from `sql/schema.sql` → **Run**.
3. **Authentication → Users → Add user → Create new user**: your email + a strong password, tick **Auto Confirm User**. Add one for each staff member if needed.
4. **Authentication → Sign In / Providers** (or Settings): turn **OFF** "Allow new users to sign up" so nobody else can register.
5. **Authentication → Multi-Factor** : make sure **TOTP** is enabled (it is by default).
6. **Project Settings → API**: copy **Project URL** and the **anon public** key into `js/config.js`:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
   (The anon key is meant to be public. Your data is protected by login + Row Level Security from the SQL file. **Never** put the `service_role` key anywhere in this project.)

## 2) GitHub
```bash
cd maru-bun-pos
git init
git add .
git commit -m "Maru Bun POS"
git branch -M main
git remote add origin https://github.com/<your-username>/maru-bun-pos.git   # create the empty repo on github.com first (Private is fine)
git push -u origin main
```

## 3) Netlify (hosting)
1. https://app.netlify.com → **Add new site → Import an existing project → GitHub** → pick the repo.
2. Build command: *(leave empty)* · Publish directory: `.` (already set in `netlify.toml`) → **Deploy**.
3. Every `git push` re-deploys automatically. Open the Netlify URL on the shop tablet / phone / PC and **Add to Home screen**.

## 4) First-time setup inside the app
1. Sign in → **Settings & Security → Turn on** 2-step verification (scan QR with Google/Microsoft Authenticator, enter code).
2. Fill **Shop details** (phone, WhatsApp), **Billing** (service charge %, default discount %, payment methods) and the **cashier on duty**.
3. **Google Review** tab → paste your review link.
4. **Menu Management** → delete the sample items and add your real categories, items, prices, stock and extras.
5. **Inventory** → add your ingredients.

## Notes
* **WhatsApp:** the button opens WhatsApp (app or web) with the bill already typed for that number – the cashier taps *Send*. Sending fully automatically needs the paid WhatsApp Business API.
* **Printing:** uses the browser print dialog, sized for 80 mm thermal paper. In the print dialog choose your receipt printer and set margins to *None*.
* **Kitchen screen:** open the app on a second device and keep the *Kitchen Display* tab open. Tap anywhere once so the browser allows the alert sound (use **Test sound**).
* **Stock:** items with *Track stock* go down automatically on every sale. Use **+ Stock** in Menu Management when you make more.
* **Strict 2-step (optional):** see the commented policy at the bottom of the security section in `sql/schema.sql` to make the database itself refuse non-2-step sessions.

## Troubleshooting
* *"relation … does not exist"* → run `sql/schema.sql` (step 1.2).
* *Invalid login credentials* → create the user in Supabase (step 1.3).
* *Kitchen doesn't update instantly* → the app also re-checks every 10 s, so it still works; make sure the SQL ran fully (it enables realtime on `orders`).
* *Can't turn on 2-step* → enable TOTP in Supabase Authentication → Multi-Factor.
