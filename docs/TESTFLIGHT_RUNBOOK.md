# TestFlight and Android Runbook

Everything needed to put Grovit in front of iOS testers through TestFlight and
Android testers through a direct APK. The repository side is done; what
remains needs an Apple account, an Expo account, or a decision.

## What the app contains

The installed app is a management tool, not a till. It carries Analytics,
Finance, Inventory, Menu, Staff, Branches and Settings, and it deliberately
has no POS and no Orders screen. Billing stays on the counter hardware running the web
app. `usesManagementTabs` in `src/lib/pos/tab-config.ts` enforces this: any
native build gets the management tabs whatever its screen size, so an iPad is
covered as well as an iPhone.

## What is already configured

| Item | State |
| :--- | :--- |
| `ios.bundleIdentifier` / `android.package` | `com.grovit.pos` |
| Android icon | Adaptive icon set in `assets/images/android-icon-*.png` on the brand navy |
| `ios.supportsTablet` | `true` — the tablet layout is the one cashiers use |
| `ios.config.usesNonExemptEncryption` | `false`, so App Store Connect stops asking the export-compliance question on every upload |
| App icon | `assets/images/icon.png`, 1024x1024 RGB with no alpha channel, which is what the App Store requires |
| Splash screen | `expo-splash-screen` plugin, brand navy background |
| Build profiles | `development`, `preview`, `production` in `eas.json`; `appVersionSource: remote` with `autoIncrement` on production, so EAS owns the build number |
| API base URL | `apiFetch` falls back to `https://www.leleban.grovitai.com` off the web, so the native build reaches the same serverless API |

## Prerequisites

1. **Apple Developer Program** membership, 99 USD a year, on an Apple ID with
   two-factor authentication. A free Apple ID cannot ship to TestFlight.
2. **An Expo account.** `eas` commands sign in against it, and the build runs on
   Expo's macOS workers, so no Mac is needed here.
3. `eas-cli` version 16 or newer. There is no need to add it to the project:
   `npx eas-cli@latest <command>` works, as does a global install.
4. **Nothing for Android** beyond the Expo account. A direct APK needs no
   Google account; only a Play Store listing does (Google Play Console, 25 USD
   once), and that is not part of this runbook.

## 0. Give the build its environment variables

The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
at build time. Locally they come from `.env`, which is gitignored, and **EAS
does not upload gitignored files**, so a build made without this step starts,
fails to create a Supabase client, and shows nothing but the sign-in error.
Create both once on the EAS project, for the `preview` and `production`
environments; they are then baked into every build:

```bash
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --environment preview --environment production --visibility plaintext
```
```bash
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --environment preview --environment production --visibility plaintext
```

Each command prompts for the value; paste it from `.env`. Both values are
already public in the web bundle, so plaintext visibility is fine. The API
base URL needs nothing: off the web the app falls back to
`https://www.leleban.grovitai.com`. Do not set the SMTP or PrintNode
variables here; those belong to the server, never to the app.

## 1. Link the repository to an EAS project

```bash
npx eas-cli@latest init
```

This signs you in and writes `extra.eas.projectId` into `app.json`. That id is
the link between this checkout and the EAS project, so **commit the change**.
Until it exists, `eas build` has nothing to build against.

## 2. Build for the store

```bash
npx eas-cli@latest build --profile production --platform ios
```

The first run asks about credentials. Let EAS manage them: it creates the
distribution certificate and the provisioning profile against your Apple
Developer account and stores them, so later builds need no input. The build
itself takes roughly 15 to 30 minutes.

## 2b. Build an Android APK for direct install

```bash
npx eas-cli@latest build --profile preview --platform android
```

The `preview` profile produces an APK rather than a Play Store bundle. EAS
generates and keeps the signing keystore on the first run; accept the default.
When the build finishes, the EAS dashboard shows a link and a QR code.
Testers open the link on the phone, download the APK, and allow installs from
that source when Android asks. No Play Store step is involved. The
`production` profile builds an `.aab`, which only the Play Store can
install, so keep to `preview` for hand-distributed testing.

## 3. Upload to App Store Connect

```bash
npx eas-cli@latest submit --platform ios --latest
```

It prompts for the Apple ID, the team, and the App Store Connect app. If no app
record exists for `com.grovit.pos` it offers to create one. There is nothing to
prefill in `eas.json` for this; the prompts are enough. If you would rather not
answer them each time, fill in `submit.production.ios` with `appleId`,
`ascAppId` and `appleTeamId` afterwards.

## 4. App Store Connect, before testers can install

TestFlight will not release a build until these are answered, and they are
per-app rather than per-build:

- **App privacy** — the data-collection questionnaire. Grovit collects staff
  names and emails for sign-in and stores order data; answer honestly, because
  a wrong answer is a rejection later.
- **Privacy policy URL** — required for the questionnaire.
- **Test information** — what testers should exercise, plus a contact email.
- **Testers** — internal testers (up to 100, no review) can install as soon as
  the build finishes processing. External testers need a Beta App Review first,
  which usually takes a day.

Export compliance is already declared in `app.json`, so that prompt will not
appear.

## 5. What testers will and will not be able to do

Two things behave differently on a phone, and both are worth putting in the
test notes rather than letting a tester discover them:

- **Local agent printing does not work.** `print-agent-service.ts` talks to
  `http://localhost:4545`, which is the print agent running on a till PC. On an
  iPhone there is no such agent. PrintNode cloud printing goes through the
  serverless API and works normally.
- **Finance is where phones earn their keep.** The floating "Expense" button
  records an expense from any finance tab; day close needs a branch picked.
  Settlement is not a concern here, because the app cannot take a payment by
  design.

## Optional: over-the-air updates

`eas.json` sets `channel` on the `preview` and `production` profiles, but
`expo-updates` is not installed, so those channels do nothing today. Builds ship
exactly the JavaScript they were built with. To push JavaScript-only fixes to
testers without a new build, install the package and configure it:

```bash
npx expo install expo-updates
```
```bash
npx eas-cli@latest update:configure
```

This is not needed for a first TestFlight release, and it changes launch
behaviour (the app checks for an update on start), so it is better done
deliberately than as part of the first build.
