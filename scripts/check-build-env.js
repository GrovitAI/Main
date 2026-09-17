/**
 * Runs on EAS before a build installs anything (the `eas-build-pre-install`
 * npm hook). The Supabase settings are baked into the app at build time, so a
 * bad value produces an app that cannot start and cannot be fixed on the
 * device. Failing here costs seconds; finding out on a phone costs a build, a
 * TestFlight upload and a crash hunt.
 *
 * The rules match src/lib/pos/supabase-env.ts; keep the two in step.
 */
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

const problems = [];
if (!/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:\d+)?\/?$/.test(url)) {
  problems.push(`EXPO_PUBLIC_SUPABASE_URL is not a valid https URL (it is ${url.length} characters long).`);
}
if (!/^[\x21-\x7e]{20,}$/.test(key)) {
  problems.push(`EXPO_PUBLIC_SUPABASE_ANON_KEY does not look like a key (it is ${key.length} characters long).`);
}

if (problems.length > 0) {
  console.error('\nBuild stopped: the Supabase settings for this build are wrong.\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nFix them on expo.dev under Project settings > Environment variables, or with "eas env:update".');
  console.error('Pasting with Ctrl+V into a terminal prompt stores a control character instead of the text.\n');
  process.exit(1);
}

console.log('Supabase build settings look valid.');
