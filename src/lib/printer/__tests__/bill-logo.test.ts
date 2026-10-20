import { printerService } from '@/lib/printer/printer-service';
import { BILL_LOGO } from '@/lib/printer/bill-logo';
import { apiFetch } from '@/lib/pos/api-client';

jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: () => ({ tenant_id: 'tenant', branch_id: 'branch' }) }));
jest.mock('@/lib/pos/pos-settings-service', () => ({ getBranchTaxPercentage: async () => 0 }));
jest.mock('@/lib/pos/api-client', () => ({ apiFetch: jest.fn(async () => ({ data: { success: true }, error: null })) }));
jest.mock('@/lib/pos/printer-db-service', () => ({
  fetchPrintersCached: async () => ({ data: [{ id: 'p1', name: 'Bill', is_active: true, is_default: true, printer_role: 'bill', connection: 'printnode', ip_address: '42', port: 9100, paper_width: '80mm' }], error: null, cached: false }),
}));
jest.mock('@/lib/pos/supabase', () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { phone: '90309 13610', gstin: null, address: 'Kolathur' }, error: null }) };
  return { supabase: { from: () => chain } };
});

// Task 287: the badge prints with every bill, its bytes untouched by the text encoding.
test('a bill carries the logo as an ESC/POS raster picture, byte for byte', async () => {
  await printerService.printBill('T1', 'KLT-0001', [{ product_name: 'Mousse café', qty: 2, price: 150 }], 300);
  const call = (apiFetch as jest.Mock).mock.calls.find(([path]) => path === '/api/printjobs');
  expect(call).toBeDefined();
  const bytes = Buffer.from(call?.[1].body.base64Content as string, 'base64');
  const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, BILL_LOGO.widthDots / 8, 0, BILL_LOGO.heightDots, 0]);
  const at = bytes.indexOf(header);
  expect(at).toBeGreaterThan(0);
  const picture = Buffer.from(BILL_LOGO.base64, 'base64');
  expect(bytes.subarray(at + header.length, at + header.length + picture.length).equals(picture)).toBe(true);
  // The old request for a logo kept in the printer's memory is gone, and the text still reads.
  expect(bytes.includes(Buffer.from([0x1c, 0x70, 0x01, 0x00]))).toBe(false);
  expect(bytes.includes(Buffer.from('Mousse café', 'utf8'))).toBe(true);
});
