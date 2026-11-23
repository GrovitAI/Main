/**
 * The public side of table ordering (tasks 330-331), in one function because the Vercel Hobby plan allows
 * 12 functions and each file under /api is one:
 *   GET  /api/public/qr?kind=menu&code=…           the menu for a table's QR code
 *   GET  /api/public/qr?kind=status&code=…&id=…    where an order stands
 *   POST /api/public/qr                             a customer's table order, waiting for staff
 * No sign-in; see src/lib/server/qr-public.ts.
 */
import { handleQr, publicDb } from '../../src/lib/server/qr-public';
import type { ApiRequest, ApiResponse } from '../../src/lib/server/api-auth';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  await handleQr(req, res, publicDb());
}
