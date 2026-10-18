/**
 * Task 256: reads that never reached Supabase are tried again.
 *
 * Task 266: supabase-js (postgrest-js 2.112) already retries table reads (GET and HEAD) on a network
 * error, three times with 1, 2 and 4 s waits, but never a function call, which goes as POST. So
 * this covers only the read-only functions; retrying GETs as well multiplied the tries, and an app
 * opened without a connection waited about 14 s before it said so.
 *
 * Production's API logs showed no failed kitchen or invoice request, yet the app now and then said
 * "Unable to load your kitchen permissions" or could not load invoices. Those requests died on the
 * device: a phone coming back from the background, or a laptop waking, sends before its network
 * is up, and fetch throws. A read is safe to send again, so it is, twice, after a short wait.
 * Writes are never repeated here: a save whose answer was lost may still have been made.
 */

/** Database functions that only read (all STABLE), so calling them twice changes nothing. */
const READ_ONLY_RPCS: ReadonlySet<string> = new Set([
  'kitchen_my_access',
  'kitchen_team',
  'kitchen_audit_page',
  'kitchen_range_report',
  'kitchen_invoice_workspace',
  'kitchen_money_summary',
]);

/** Gateway answers that mean the request did not run: try a read again. */
const RETRY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** Waits before the second and third try. */
export const RETRY_DELAYS_MS: readonly number[] = [400, 1200];

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function methodOf(input: Parameters<Fetch>[0], init?: RequestInit): string {
  const fromInit = init?.method;
  if (fromInit) return fromInit.toUpperCase();
  if (typeof input === 'object' && !(input instanceof URL) && typeof input.method === 'string') return input.method.toUpperCase();
  return 'GET';
}

/** True for a call to a read-only function, which supabase-js itself never retries. */
export function isRetryableRead(url: string, method: string): boolean {
  const path = url.split('?')[0] ?? '';
  const rest = path.indexOf('/rest/v1/');
  if (rest < 0 || method !== 'POST') return false;
  const rpc = path.slice(rest + '/rest/v1/'.length).match(/^rpc\/([A-Za-z0-9_]+)$/);
  return !!rpc && READ_ONLY_RPCS.has(rpc[1] ?? '');
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A fetch for the Supabase client that tries a failed read again. Everything else passes through. */
export function retryingFetch(base: Fetch, delays: readonly number[] = RETRY_DELAYS_MS): Fetch {
  return async (input, init) => {
    if (!isRetryableRead(urlOf(input), methodOf(input, init))) return base(input, init);
    for (let attempt = 0; ; attempt += 1) {
      const last = attempt >= delays.length;
      try {
        const response = await base(input, init);
        if (last || !RETRY_STATUSES.has(response.status)) return response;
      } catch (error) {
        // A request the app called off stays called off.
        if (last || init?.signal?.aborted) throw error;
      }
      await wait(delays[attempt] ?? 0);
    }
  };
}
