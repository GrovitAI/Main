# TestFlight Runbook

Everything needed to put Grovit in front of iOS testers. The repository side is
done; what remains needs an Apple account, an Expo account, or a decision.

## What the app contains

The installed app is a management tool, not a till. It carries Analytics,
Inventory, Menu, Staff, Branches and Settings, and it deliberately has no POS
and no Orders screen. Billing stays on the counter hardware running the web
app. `usesManagementTabs` in `src/lib/pos/tab-config.ts` enforces this: any
native build gets the management tabs whatever its screen size, so an iPad is
covered as well as an iPhone.

## What is already configured

| Item | State |
| :--- | :--- |
| `ios.bundleIdentifier` | `com.grovit.pos` |
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
- **Analytics is empty until the database migrations are applied.** The ledger
  KPIs and the analytics aggregates are PostgreSQL functions that do not exist
  on the live project yet, so the flagship screen of this build has nothing to
  show. See `docs/DEPLOYMENT_RUNBOOK_2026-09-07.md`. Settlement is not a
  concern here, because the app cannot take a payment by design.

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
