/** POST /api/public/order : a customer's table order, waiting for staff (task 330). No sign-in; see qr-public.ts. */
import { handleOrder, publicDb } from '../../src/lib/server/qr-public';
import type { ApiRequest, ApiResponse } from '../../src/lib/server/api-auth';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  await handleOrder(req, res, publicDb());
}
