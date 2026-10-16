import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { cancelKitchenInvoice, createKitchenInvoice, fetchKitchenInvoice, fetchKitchenInvoices, parseKitchenInvoice, receiveKitchenInvoicePayment } from '@/lib/pos/kitchen-invoice-service';
import { invoiceNumber, kitchenInvoiceHtml } from '@/lib/pos/kitchen-invoice-utils';
import type { InvoiceFilter, KitchenInvoice } from '@/lib/pos/kitchen-invoice-types';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: jest.fn() }));
const scope = { p_tenant_id: 'tenant', p_branch_id: 'kitchen' };
const filter: InvoiceFilter = { startDate: '2026-10-01', endDate: '2026-10-02', partyId: 'party', page: 0, candidates: true };
const delivery = { id: 'delivery', entry_date: '2026-10-01', amount_paise: 15000, lines: [{ id: 'line', item_name: 'Cake', unit: 'pcs', qty: 3, price_paise: 5000, line_paise: 15000 }] };
const invoice: KitchenInvoice = { id: 'invoice', invoice_no: 1000, party_id: 'party', party_name: 'Branch', kitchen_name: 'Kitchen',
  start_date: filter.startDate, end_date: filter.endDate, total_paise: 15000, covered_paise: 5000, open_paise: 10000, status: 'to_be_paid',
  created_at: '2026-10-02T05:00:00Z', created_by_name: 'Staff', cancelled_at: null, cancel_reason: null, deliveries: [delivery] };
beforeEach(() => {
  jest.clearAllMocks(); (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant', branch_id: 'pos' });
  (kitchenBranch as jest.Mock).mockReturnValue({ id: 'kitchen' });
});
test('candidate reads send scope, inclusive dates, branch and pagination to one RPC', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: { rows: [delivery], branches: [{ id: 'party', label: 'Branch' }], total_rows: 51 }, error: null });
  expect((await fetchKitchenInvoices({ ...filter, page: 1 })).data?.total_rows).toBe(51);
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_invoice_workspace', { ...scope, p_start_date: filter.startDate, p_end_date: filter.endDate, p_party_id: 'party', p_candidates: true, p_page: 1 });
});
test('create sends selected delivery IDs and exact paise, never a new sale or stock change', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'invoice', error: null });
  expect((await createKitchenInvoice(filter, [delivery])).data).toBe('invoice');
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_create_invoice', { ...scope, p_party_id: 'party', p_start_date: filter.startDate,
    p_end_date: filter.endDate, p_entry_ids: ['delivery'], p_expected_total_paise: 15000 });
});
test.each([
  { ...filter, startDate: '2026-02-30' }, { ...filter, endDate: '9999-01-01' }, { ...filter, page: -1 }, { ...filter, partyId: null },
])('invalid filters fail before database calls (%j)', async f => { expect((await fetchKitchenInvoices(f)).error).toBeTruthy(); expect(supabase.rpc).not.toHaveBeenCalled(); });
test('empty, duplicate, out-of-range and oversized selections cannot save', async () => {
  for (const entries of [[], [delivery, delivery], [{ ...delivery, entry_date: '2026-09-30' }], Array.from({ length: 101 }, (_, i) => ({ ...delivery, id: String(i) }))])
    expect((await createKitchenInvoice(filter, entries)).error).toBeTruthy();
  expect(supabase.rpc).not.toHaveBeenCalled();
});
test('payment has exact amount, kitchen scope and a stable retry key', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'payment', error: null });
  await receiveKitchenInvoicePayment('invoice', 10000, '2026-10-02', 'upi', 'stable-request-01');
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_invoice_action', { ...scope, p_invoice_id: 'invoice', p_action: 'receive',
    p_amount_paise: 10000, p_date: '2026-10-02', p_mode: 'upi', p_request_key: 'stable-request-01', p_lock_reason: null });
});
test('invalid payments and empty cancellation reason never write', async () => {
  for (const amount of [0, -1, 0.5, Infinity]) expect((await receiveKitchenInvoicePayment('invoice', amount, '2026-10-02', 'upi', 'stable-request-01')).error).toBeTruthy();
  expect((await cancelKitchenInvoice('invoice', '')).error).toBeTruthy(); expect(supabase.rpc).not.toHaveBeenCalled();
});
test('cancellation is scoped, confirmed and trims its reason', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'invoice', error: null });
  expect((await cancelKitchenInvoice('invoice', ' Incorrect period ')).data).toBe('invoice');
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_invoice_action', { ...scope, p_invoice_id: 'invoice', p_action: 'cancel', p_note: 'Incorrect period' });
});
test('partial payment remains to be paid; paid must have zero outstanding', () => {
  expect(parseKitchenInvoice(invoice).status).toBe('to_be_paid');
  expect(parseKitchenInvoice({ ...invoice, status: 'paid', covered_paise: 15000, open_paise: 0 }).status).toBe('paid');
  expect(() => parseKitchenInvoice({ ...invoice, status: 'paid' })).toThrow();
  expect(() => parseKitchenInvoice({ ...invoice, open_paise: 9999 })).toThrow();
  expect(() => parseKitchenInvoice({ ...invoice, total_paise: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
});
test('detail rejects missing records and mismatched line totals', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: { invoice: null }, error: null })
    .mockResolvedValueOnce({ data: { invoice: { ...invoice, deliveries: [] } }, error: null });
  expect((await fetchKitchenInvoice('missing')).data).toBeNull(); expect((await fetchKitchenInvoice('invoice')).data).toBeNull();
});
test('private errors do not leak; ambiguous saves require refresh', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'PRIVATE_SQL_CREDENTIAL' } });
  const result = await createKitchenInvoice(filter, [delivery]);
  expect(result.error).not.toContain('PRIVATE'); expect(result.error).toContain('Refresh');
});
test('export escapes every user string and preserves historical quantities, prices and matched balance', () => {
  const html = kitchenInvoiceHtml({ ...invoice, party_name: '<script>alert(1)</script>', created_by_name: 'A & B', deliveries: [{ ...delivery, lines: [{ ...delivery.lines[0], item_name: 'Cake <img src=x>' }] }] });
  expect(html).not.toContain('<script>'); expect(html).not.toContain('<img src=x>'); expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('A &amp; B'); expect(html).toContain('01000'); expect(html).not.toContain('CK-'); expect(html).toContain('3 pcs'); expect(html).toContain('To be paid');
  expect(html).toContain('Unmatched branch receipts'); expect(html).toContain('100');
});
test('print dates use the India calendar day, not the UTC prefix of created_at', () => {
  const lateEvening = '2026-10-01T20:00:00Z'; // 2 Oct, 1:30 am in India
  const html = kitchenInvoiceHtml({ ...invoice, created_at: lateEvening }, new Date(lateEvening));
  expect(html).toContain('Issued 2 Oct 2026'); expect(html).toContain('Delivery period: 1 Oct 2026 to 2 Oct 2026');
  expect(html).toContain('<td>1 Oct 2026</td>'); expect(html).toContain('IST'); expect(html).not.toContain('2026-10-0');
});
test('invoice numbers are five digits from the kitchen sequence', () => {
  expect(invoiceNumber(1000)).toBe('01000'); expect(invoiceNumber(1001)).toBe('01001'); expect(invoiceNumber(12345)).toBe('12345');
  expect(() => parseKitchenInvoice({ ...invoice, invoice_no: undefined })).toThrow();
});
test('the register narrows by the ticked statuses only, and never for delivery selection', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: { rows: [invoice], branches: [], total_rows: 1 }, error: null });
  const register: InvoiceFilter = { ...filter, candidates: false };
  await fetchKitchenInvoices({ ...register, statuses: ['paid'] });
  expect(supabase.rpc).toHaveBeenLastCalledWith('kitchen_invoice_workspace', expect.objectContaining({ p_status: 'paid', p_candidates: false }));
  // Several statuses go as one list, in the filter's order whatever order they were ticked in.
  await fetchKitchenInvoices({ ...register, statuses: ['paid', 'to_be_paid'] });
  expect(supabase.rpc).toHaveBeenLastCalledWith('kitchen_invoice_workspace', expect.objectContaining({ p_status: 'to_be_paid,paid' }));
  await fetchKitchenInvoices({ ...register, statuses: null });
  expect((supabase.rpc as jest.Mock).mock.calls.at(-1)?.[1]).not.toHaveProperty('p_status');
  await fetchKitchenInvoices({ ...register, statuses: ['cancelled', 'paid', 'to_be_paid'] });
  expect((supabase.rpc as jest.Mock).mock.calls.at(-1)?.[1]).not.toHaveProperty('p_status');
  await fetchKitchenInvoices({ ...filter, statuses: ['paid'] });
  expect((supabase.rpc as jest.Mock).mock.calls.at(-1)?.[1]).not.toHaveProperty('p_status');
  const calls = (supabase.rpc as jest.Mock).mock.calls.length;
  expect((await fetchKitchenInvoices({ ...register, statuses: [] })).error).toBe('Choose at least one status.');
  expect((supabase.rpc as jest.Mock).mock.calls.length).toBe(calls);
});
