/** GET /api/public/order-status?code=…&id=… : where a table order stands (task 330). No sign-in; see qr-public.ts. */
import { handleStatus, publicDb } from '../../src/lib/server/qr-public';
import type { ApiRequest, ApiResponse } from '../../src/lib/server/api-auth';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  await handleStatus(req, res, publicDb());
}
