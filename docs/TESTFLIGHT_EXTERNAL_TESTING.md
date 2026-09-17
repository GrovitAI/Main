# TestFlight external testing

What to enter on App Store Connect, and how the reviewer's demo login works.

## The demo restaurant

Apple's reviewers must be able to sign in, and they must never see a real
restaurant's books. The database holds a second tenant for them:

| | |
|---|---|
| Tenant | Grovit Demo Cafe (`dddddddd-0000-0000-0000-000000000001`) |
| Branch | Demo Branch |
| Menu | 4 categories, 12 items |
| Sales | 157 paid bills across the three weeks before 17 Sep 2026 |
| Finance | 1 branch account, default rules, 11 catalogue rows |

Every row carries the demo tenant id. The tenant-scoped row-level security that
separates real tenants separates this one too, in both directions.

Migrations, in order:

1. `20260917000100_demo_tenant_seed.sql` — tenant, branch, settings, menu, bills
2. `20260917000150_demo_tenant_finance.sql` — finance account, rules, catalogue
3. `20260917000200_demo_tenant_owner.sql` — links the reviewer's login (below)

### Creating the reviewer's login

The password is never written into a migration or this repository.

1. Supabase dashboard > Authentication > Users > **Add user** > Create new user.
2. Email `appreview@grovitai.com`, a password of your choosing, and tick
   **Auto Confirm User**.
3. Apply `20260917000200_demo_tenant_owner.sql`. It links that user to the demo
   tenant as owner, and fails with a clear message if the user is missing.

The sample bills do not move forward in time. If a review happens months later
and the dashboard's "today" looks empty, add fresh bills for the demo tenant
before submitting.

## Test Information (App Store Connect > TestFlight > Test Information)

**Beta App Description**

> Grovit is the owner's and manager's companion to the Grovit restaurant
> point-of-sale. It shows the day's sales, payment split and best-selling items,
> keeps the finance ledger (expenses, payables, transfers between accounts), and
> lets you manage the menu, staff and branches from your phone. Billing itself
> happens on the restaurant's till, not in this app. Sign in with the account
> your restaurant gave you.

**What to Test**

> Sign in with the demo account. Check the Dashboard and Analytics figures for
> the last 7 and 30 days, add an expense in Finance, edit a menu item's price in
> Menu, and sign out and back in. Please report anything that looks wrong or
> feels slow.

**Feedback Email:** team@grovitai.com

**Beta App Review Information**

- Contact: first name, last name, phone, email of the person Apple should reach.
- **Sign-in required:** yes.
  - User name: `appreview@grovitai.com`
  - Password: the one chosen in the Supabase dashboard.
- Notes:

> This is a business app for restaurants that already use the Grovit
> point-of-sale; there is no public sign-up. The demo account opens a sample
> restaurant ("Grovit Demo Cafe") with three weeks of sample sales. No purchase,
> subscription or payment happens inside the app.

**Privacy Policy URL:** required before external testers can be invited only if
App Store Connect asks for it on the Test Information page; it is required for
the App Store listing in any case, so it is worth publishing one now.

## Before pressing "Submit for Review"

- The build selected is one made after 17 Sep 2026 (build 3 or later). Build 2
  carries broken settings and closes on first launch.
- Sign in on a phone with the demo account and open every tab once.
- Export compliance is already declared in `app.json`
  (`usesNonExemptEncryption: false`).
