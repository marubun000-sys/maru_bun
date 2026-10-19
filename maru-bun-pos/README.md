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

## Added later
* **POS options before *Place Order*:** *Send to kitchen* (untick = bill is saved but never shown in the Kitchen Display), *Print kitchen slip*, *Print customer bill*. Your choice is remembered on that device.
* **Kitchen Display:** *Mark Served* can be undone with **Undo**. Counter devices get a sound + popup when an order is served; kitchen devices get a repeating sound + popup for every new order. Set each device's role in the top bar (**Device: Counter / Kitchen / Both**). Tap anywhere once so the browser allows sound.
* **Bills:** printed bill and the WhatsApp *picture* carry the logo. WhatsApp text cannot carry a picture, so use **WhatsApp (with logo picture)** – on a phone it opens the share sheet, on a computer the picture is saved and the chat opens so you can attach it.
* **Your software company line:** open `js/brand.js`, fill `SOFTWARE_NAME` and `SOFTWARE_SITE`. It then appears at the bottom of every printed bill, WhatsApp text and bill picture. Leave empty to hide.
* **Dark / Light** and **English / සිංහල** buttons are in the top bar (and on the login page). Bills stay in English for customers.
* **Sri Lanka time:** all dates, "today" and "this month" use Asia/Colombo time whatever the device's own time zone is. At 12:00 midnight the screens roll over to the new day by themselves.
* **Many devices:** orders, stock, menu, settings and the dashboard refresh on every device automatically (live, with a 10–20 s safety refresh). If you made the database with the very first `schema.sql`, run `sql/realtime-all.sql` once.

## Update 3 – token numbers, qty × price bills, extras with quantity, saved customers
1. **Run `sql/update-3.sql`** once in Supabase → SQL Editor (existing database). New installs: `schema.sql` already has it.
2. Every order gets a **Token No** (1, 2, 3… restarts at 12 midnight Sri Lanka time). Shown on bills, kitchen slip, kitchen cards, Orders page.
3. Bill lines show `qty × unit price = total`. Extras have their own quantity (Extra Cheese × 2) and print the same way.
4. Customer WhatsApp numbers typed in POS are saved in the **Customers** tab (visits, total spent, WhatsApp link, CSV export).

## Update 4
- An unfinished order in POS (items, extras, table, customer, note, discount…) is kept when you open another tab or refresh; it clears only after **Place Order**.
- **Cashier on duty is now per device** (saved in that phone/computer's browser). Each counter sets its own name; bills print the cashier of the device that made the order. All devices still see every order live.

## Update 5 – devices, admin approval, cashier on bills
1. **Run `sql/update-4.sql`** once in Supabase → SQL Editor. Then open the POS **first on the owner's phone/computer** – that device becomes the **Admin**.
2. Every other device must be named and then **approved by the admin** (Settings & Security → Devices & cashiers). Admin can **Remove** a device (it is signed out and needs approval again).
3. Opening **Settings & Security** on a non-admin device asks for the **admin email + password**.
4. Settings shows every device with the cashier on duty. The cashier name is printed on printed bills, WhatsApp text and WhatsApp picture bills. POS asks for the cashier name if it is empty.
5. Lost the admin phone? In the SQL Editor run `delete from public.devices;` – the next device to log in becomes admin.
Note: this is an app-level gate for staff devices (the Supabase login itself is shared). Tip: create separate staff logins in Supabase → Authentication → Users, and keep the owner's account private as the admin account.

## Update 6 – admin-only approval, Settings access request, no more forced logout
1. **Run `sql/update-5.sql`** once in Supabase → SQL Editor.
2. Only the **admin device** can Approve / Remove devices (buttons are not even shown on other devices).
3. Opening **Settings & Security** on any other device: step 1 admin email + password (asked EVERY time, leaving the page locks it again), step 2 a pop-up appears on the admin device → **Allow / Deny**.
4. Fixed: signing in / out on one device (or checking the admin password) used to sign **every** device out. Sign-out is now local to that device only.

## Update 7 – promotions to saved customers
1. **Run `sql/update-6.sql`** once (adds the `opt_out` column and a public photo bucket `promos`).
2. Customers tab → **Send promotion**: write a message ({name} = customer's first name), add a photo (its link is added to the message, WhatsApp shows a preview), choose who gets it (all / visited in the last N days / at least N visits), then tap **Open WhatsApp** once per customer and press Send. Progress is saved if you stop.
3. Customers marked **Stopped** (tap the Promos pill) are skipped. WhatsApp does not allow fully automatic bulk sending without its paid Business API, and sending to people who did not agree can get a number banned.

## Update 8 – send a promotion to ALL customers automatically (WhatsApp Business API)
WhatsApp does not let any app send to many people from your normal WhatsApp. The only official way is the **WhatsApp Business Cloud API** (Meta). The app is ready for it; you must set up Meta once. (Not tested against a real Meta account – test with 1–2 of your own numbers first.)

**One-time setup**
1. Meta Business account → developers.facebook.com → create an app (type Business) → add the **WhatsApp** product.
2. Add a phone number for the shop (a number that is not already used in the WhatsApp app, or use Meta's coexistence option). Note the **Phone number ID**.
3. Create a **permanent access token** (Business settings → System users → add → generate token with `whatsapp_business_messaging` + `whatsapp_business_management`).
4. WhatsApp Manager → **Message templates → Create template**: category **Marketing**, header **Image**, body e.g. `Hi {{1}}! 🍞 Fresh hot buns at මරු Bun today. Come visit us!`. Wait until it says **Approved**.
5. Supabase → **Edge Functions → Deploy a new function → Via Editor**, name it exactly `send-promo`, paste the code of `supabase/functions/send-promo/index.ts`, Deploy.
6. Supabase → Edge Functions → **Secrets**: add `WA_TOKEN` (the token) and `WA_PHONE_ID` (the Phone number ID).
7. Run `sql/update-6.sql` (photo storage) if you have not.

**Using it**: Customers → Send promotion → *Send to everyone automatically* (it turns on by itself once the function and secrets exist) → template name + language, add the photo, choose who → Start. Failed numbers are listed with the reason and can be retried. Meta charges per marketing message and only people who have WhatsApp will receive it; send only to customers who agreed.

## Update 9 – bill stays open after refresh, refunds, change type/payment, kitchen screen page
1. **Run `sql/update-7.sql`** once in Supabase → SQL Editor (adds refund + change-history columns to bills).
2. **Bill window after Place Order stays open** – even if the page is refreshed or you open another tab – until you press ✕. You can still Print / WhatsApp it. (Bills opened from Orders & Billing can also be sent any time.)
3. **Orders & Billing → open a bill**: **Change type / payment** (Dine-in ⇄ Takeaway, table no., payment method) and **↩ Refund** (pick which items / extras and how many; optional reason; optional "put back in stock"). Refunds on a non-admin device ask for the admin email + password. The bill shows *Refunded* and *NET TOTAL*; Orders, Dashboard and sales totals use the net amount. Every change is recorded (who and when).
4. **Kitchen screen page**: open `https://YOUR-SITE/kitchen.html` (or Kitchen Display → *Open as kitchen screen*) on the kitchen monitor. It has no menu, big cards, new-order alert sound, full-screen button and keeps the screen awake. Sign in once on that device (it is named "Kitchen screen" and needs the admin's approval like any device).
