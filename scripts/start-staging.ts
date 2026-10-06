/** Local staging web app + the existing staff API, with no production keys. */
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children: ChildProcess[] = [];
let stopping = false;

async function readEnv(file: string): Promise<NodeJS.Dict<string>> {
  try {
    return parseEnv(await readFile(join(root, file), 'utf8'));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw new Error(`Cannot read ${file}.`);
  }
}

function stop(): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      // The Windows command shim owns the actual server as a child process.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
}

async function main(): Promise<void> {
  const staging = await readEnv('.env.development.local');
  const production = await readEnv('.env');
  const server = await readEnv('.env.staging-server.local');
  const url = new URL(staging.EXPO_PUBLIC_SUPABASE_URL || '');
  if (
    staging.EXPO_PUBLIC_APP_ENV !== 'staging' ||
    url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    url.origin === production.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ||
    !staging.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error('Configure a separate staging project in .env.development.local first.');
  }

  const serviceKey = server.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (serviceKey) {
    // Check the key against staging before passing it to the API process.
    const check = await fetch(`${url.origin}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!check.ok) throw new Error('The server key is not a valid admin key for the staging project.');
    await check.body?.cancel();
  } else {
    console.warn('Staff creation needs SUPABASE_SERVICE_ROLE_KEY in .env.staging-server.local.');
  }

  // Vercel dev reads .env itself. Use a separate, ignored working directory
  // so the production .env and any linked Vercel project cannot override staging.
  await mkdir(join(root, '.expo'), { recursive: true });
  const apiRoot = await mkdtemp(join(root, '.expo', 'staging-api-'));
  await mkdir(join(apiRoot, 'api', 'staff'), { recursive: true });
  await mkdir(join(apiRoot, 'src', 'lib', 'server'), { recursive: true });
  await cp(join(root, 'api', 'staff', 'create.ts'), join(apiRoot, 'api', 'staff', 'create.ts'));
  await cp(join(root, 'src', 'lib', 'server', 'api-auth.ts'), join(apiRoot, 'src', 'lib', 'server', 'api-auth.ts'));
  await symlink(join(root, 'node_modules'), join(apiRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(apiRoot, 'package.json'), JSON.stringify({
    private: true,
    engines: { node: '24.x' },
    dependencies: { '@supabase/supabase-js': '^2.106.1' },
    devDependencies: { typescript: '~5.9.2', '@types/node': '^26.1.1' },
  }));
  await writeFile(join(apiRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'CommonJS', esModuleInterop: true, skipLibCheck: true },
  }));
  await writeFile(join(apiRoot, 'vercel.json'), JSON.stringify({ framework: null, devCommand: null }));

  const apiEnv: Record<string, string> = {
    EXPO_PUBLIC_SUPABASE_URL: url.origin,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: staging.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    ALLOWED_ORIGINS: 'http://localhost:8081,http://127.0.0.1:8081',
  };
  await writeFile(join(apiRoot, '.env'), Object.entries(apiEnv)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'), { mode: 0o600 });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...apiEnv,
    EXPO_PUBLIC_APP_ENV: 'staging',
    EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8083',
    EXPO_PUBLIC_PRINTNODE_API_KEY: '', PRINTNODE_API_KEY: '',
    SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
    NODE_ENV: 'development', VERCEL_ENV: 'development',
  };
  const api = spawn('vercel', ['dev', '--local', '--listen', '127.0.0.1:8083'], {
    cwd: apiRoot, env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  children.push(api);
  // Never pass the server key into the Expo process, even though Expo only
  // bundles EXPO_PUBLIC_ variables.
  const webEnv = { ...env };
  delete webEnv.SUPABASE_SERVICE_ROLE_KEY;
  const web = spawn('npx', ['expo', 'start', '--web', '--port', '8081'], {
    cwd: root, env: webEnv, stdio: 'inherit', shell: process.platform === 'win32',
  });
  children.push(web);
  for (const child of children) {
    child.on('error', () => {
      console.error('Unable to start staging. Install the official Vercel CLI and project dependencies.');
      stop();
      process.exitCode = 1;
    });
    child.on('exit', (code) => {
      stop();
      if (code) process.exitCode = code;
    });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log('Staging app: http://localhost:8081 · Staff API: http://localhost:8083');
}

main().catch(() => {
  console.error('Staging startup failed. Check the staging URL, anon key and server key; production credentials are not used.');
  stop();
  process.exitCode = 1;
});
