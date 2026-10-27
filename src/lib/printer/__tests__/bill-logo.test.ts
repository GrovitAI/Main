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

// Task 288: the optional customer prints under the bill details, and nothing when left out.
test('a bill prints the customer name and number only when given', async () => {
  const bill = async (customer?: { name: string | null; phone: string | null }): Promise<string> => {
    (apiFetch as jest.Mock).mockClear();
    await printerService.printBill('T2', 'KLT-0002', [{ product_name: 'Laban', qty: 1, price: 90 }], 90, false, null, undefined, 0, null, 0, customer);
    const call = (apiFetch as jest.Mock).mock.calls.find(([path]) => path === '/api/printjobs');
    return Buffer.from(call?.[1].body.base64Content as string, 'base64').toString('latin1');
  };
  const withCustomer = await bill({ name: 'Ravi Kumar', phone: '9876543210' });
  expect(withCustomer).toContain('Customer: Ravi Kumar\n');
  expect(withCustomer).toContain('Phone: 9876543210\n');
  const nameOnly = await bill({ name: 'Ravi', phone: null });
  expect(nameOnly).toContain('Customer: Ravi\n');
  expect(nameOnly).not.toContain('Phone:');
  const none = await bill();
  expect(none).not.toContain('Customer:');
});
