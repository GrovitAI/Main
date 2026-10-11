import { printerService } from '@/lib/pos/printer-service';
import { printerService as devicePrinter } from '@/lib/printer/printer-service';
import { clearPrinterCache, fetchPrintersCached } from '@/lib/pos/printer-db-service';
import { supabase } from '@/lib/pos/supabase';

jest.mock('@/lib/printer/printer-service', () => ({ printerService: { printKot: jest.fn(), printBill: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: () => ({ tenant_id: 'tenant', branch_id: 'branch' }) }));
jest.mock('@/lib/pos/supabase', () => ({ supabase: { from: jest.fn() } }));

const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('print calls return before the job finishes, and jobs keep their order', async () => {
  const done: string[] = [];
  let releaseKot: () => void = () => undefined;
  (devicePrinter.printKot as jest.Mock).mockImplementation(() => new Promise<void>(resolve => { releaseKot = () => { done.push('kot'); resolve(); }; }));
  (devicePrinter.printBill as jest.Mock).mockImplementation(async () => { done.push('bill'); });
  const items = [{ name: 'Mousse', quantity: 2 }];
  await printerService.printKot(7, items);
  await printerService.printBill('T1', 'KLT-0001', [{ product_name: 'Mousse', qty: 2, price: 150 }] as never, 300);
  items[0].quantity = 99; // later store changes must not alter the queued ticket
  await flush();
  expect(done).toEqual([]); // the save was not held up, and the bill waits for its KOT
  releaseKot(); await flush();
  expect(done).toEqual(['kot', 'bill']);
  expect(devicePrinter.printKot).toHaveBeenCalledWith(7, [{ name: 'Mousse', quantity: 2 }], false);
});

test('a failed job does not stop the queue', async () => {
  (devicePrinter.printKot as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  (devicePrinter.printBill as jest.Mock).mockResolvedValue(undefined);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await printerService.printKot(8, [{ name: 'Cake', quantity: 1 }]);
  await printerService.printBill('T2', null, [] as never, 0);
  await flush();
  expect(devicePrinter.printBill).toHaveBeenCalled();
  warn.mockRestore();
});

test('printer rows are read once, scoped to tenant and branch, until Settings clears them', async () => {
  const order = jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null });
  const eqBranch = jest.fn(() => ({ order }));
  const eqTenant = jest.fn(() => ({ eq: eqBranch }));
  (supabase.from as jest.Mock).mockReturnValue({ select: () => ({ eq: eqTenant }) });
  clearPrinterCache();
  expect((await fetchPrintersCached()).cached).toBe(false);
  expect((await fetchPrintersCached()).cached).toBe(true);
  expect(order).toHaveBeenCalledTimes(1);
  expect(eqTenant).toHaveBeenCalledWith('tenant_id', 'tenant'); expect(eqBranch).toHaveBeenCalledWith('branch_id', 'branch');
  clearPrinterCache();
  await fetchPrintersCached();
  expect(order).toHaveBeenCalledTimes(2);
  // A failed read keeps the earlier rows so a bill still prints.
  order.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
  const stale = await fetchPrintersCached(true);
  expect(stale.data).toEqual([{ id: 'p1' }]);
});
