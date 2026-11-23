/** GET /api/public/menu?code=… : the menu for a table's QR code (task 330). No sign-in; see qr-public.ts. */
import { handleMenu, publicDb } from '../../src/lib/server/qr-public';
import type { ApiRequest, ApiResponse } from '../../src/lib/server/api-auth';

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  await handleMenu(req, res, publicDb());
}
