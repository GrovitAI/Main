import { buildBillLines, printerService, type BillLayoutInput } from '@/lib/printer/printer-service';
import { apiFetch } from '@/lib/pos/api-client';
import { fetchPrintersCached } from '@/lib/pos/printer-db-service';

jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: () => ({ tenant_id: 'tenant', branch_id: 'branch' }) }));
jest.mock('@/lib/pos/pos-settings-service', () => ({ getBranchTaxPercentage: async () => 0 }));
jest.mock('@/lib/pos/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/pos/printer-db-service', () => ({ fetchPrintersCached: jest.fn() }));
jest.mock('@/lib/pos/supabase', () => ({ supabase: {} }));

const velachery = { phone: '8157887722', gstin: null, address: 'Sankaran Avenue\n109\nVelachery Bypass Rd\nVelachery\nChennai 600042' };
const printedAt = new Date(2026, 9, 29, 2, 6);

/** The bill as it reads on paper: printer commands and the badge's mark taken out. */
function paper(input: Partial<BillLayoutInput>): string[] {
  const text = buildBillLines({ width: 48, branch: velachery, orderName: 'Order #3363', invoiceNumber: 'VL-3309', items: [], totalAmount: 0, printedAt, ...input }).join('');
  return text.replace(/\x1B[Ea]./g, '').replace('', '[badge]').split('\n').filter((l, i, all) => i < all.length - 1 || l !== '');
}

// Task 311: the client asked for bills that use less roll paper.
describe('the compact bill', () => {
  const plain = paper({ items: [{ product_name: '3 In 1 Salankatia', qty: 2, price: 349 }], totalAmount: 698, kots: [{ kot_number: 5564 }] });

  it('puts the address on two lines and the bill details on shared lines', () => {
    expect(plain.slice(0, 6)).toEqual([
      '[badge]',
      'LE LABAN',
      '   Sankaran Avenue, 109, Velachery Bypass Rd,',
      '           Velachery, Chennai 600042',
      '                 PH: 8157887722',
      '-'.repeat(48),
    ]);
    expect(plain).toContain('Bill No: VL-3309                  29/10/26 02:06');
    expect(plain).toContain('Token: Order #3363                     KOT: 5564');
    expect(plain.join('\n')).not.toMatch(/Cashier|^\s*$/m);
  });

  it('prints an item on one line, and the total with its quantity when nothing adjusts it', () => {
    expect(plain).toContain('3 In 1 Salankatia           2   349.00    698.00');
    expect(plain).toContain('Grand Total (Qty 2)                   Rs. 698.00');
    expect(plain.join('\n')).not.toContain('Sub Total');
    expect(plain.length).toBeLessThanOrEqual(17);
  });

  it('shows Sub Total, discount, GST and round-off when they apply', () => {
    const taxed = paper({ items: [{ product_name: 'Fazea', qty: 3, price: 99.5 }], totalAmount: 298.5, discountAmount: 10, discountType: 'fixed', taxPercentage: 5 });
    expect(taxed).toContain('Total Qty: 3                Sub Total Rs. 298.50');
    expect(taxed).toContain('Discount                              -Rs. 10.00');
    expect(taxed).toContain('CGST (2.5%)                             Rs. 7.21');
    expect(taxed).toContain('Grand Total                           Rs. 303.00');
  });

  it('wraps a long item name above its figures, and keeps the two-line items on 58 mm paper', () => {
    const long = paper({ items: [{ product_name: 'Milo Cheese Bomb with Extra Nutella Drizzle', qty: 1, price: 192 }], totalAmount: 192 });
    expect(long).toContain('Milo Cheese Bomb with');
    expect(long).toContain('Extra Nutella Drizzle       1   192.00    192.00');
    const narrow = buildBillLines({ width: 32, branch: velachery, orderName: 'T1', invoiceNumber: 'VL-1', items: [{ product_name: 'Fazea', qty: 2, price: 140 }], totalAmount: 280, printedAt }).join('');
    expect(narrow).toContain('Fazea\n  2 x 140.00              280.00\n');
  });
});

// Task 320: a reprint is the same compact bill as the first print, with how it was paid.
describe('reprinting a bill', () => {
  it('adds the payment under the total', () => {
    const paid = paper({ items: [{ product_name: 'Fazea', qty: 1, price: 140 }], totalAmount: 140, paymentMethod: 'upi' });
    expect(paid).toContain('Payment                                      UPI');
    expect(paid.indexOf('Payment                                      UPI')).toBe(paid.findIndex((l) => l.startsWith('Grand Total')) + 1);
  });

  it('sends the first print and the reprint to the printer in the same layout, and says whether it went', async () => {
    jest.useFakeTimers({ now: printedAt, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const printer = { id: 'p1', name: 'Bill', connection: 'printnode', ip_address: '7', paper_width: '80mm', is_active: true, printer_role: 'bill', is_default: true };
    jest.mocked(fetchPrintersCached).mockResolvedValue({ data: [printer], error: null, cached: false } as never);
    const sent = jest.mocked(apiFetch).mockResolvedValue({ data: { success: true }, error: null } as never);
    const items = [{ product_name: 'Fazea', qty: 2, price: 140 }];
    await printerService.printBill('T7', 'VL-9', items, 280, false, null, [], 0, null, 0, { name: 'Asha', phone: null });
    const result = await printerService.reprintBill({ orderName: 'T7', invoiceNumber: 'VL-9', items, totalAmount: 280, kots: [], customer: { name: 'Asha', phone: null } });
    expect(result).toEqual({ success: true });
    const bodies = sent.mock.calls.map((call) => (call[1] as { body: { base64Content: string } }).body.base64Content);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    sent.mockResolvedValue({ data: null, error: 'offline' } as never);
    expect((await printerService.reprintBill({ orderName: 'T7', invoiceNumber: 'VL-9', items, totalAmount: 280 })).success).toBe(false);
    jest.useRealTimers();
  });
});
