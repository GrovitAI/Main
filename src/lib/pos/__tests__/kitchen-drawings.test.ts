import { parseDrawings } from '@/lib/pos/kitchen-drawings-service';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: jest.fn() }));

describe('parseDrawings', () => {
  it('keeps a brought-forward row and which owner the signed-in one is', () => {
    const parsed = parseDrawings({
      me: 'o-2',
      owners: [{ id: 'o-1', name: 'Asha', left_paise: '500000', in_paise: 500000, spent_paise: 0 }],
      rows: [
        { id: 'r1', owner_id: 'o-1', kind: 'opening', account: null, amount_paise: 500000, category: null, note: null, draw_date: '2026-11-01', created_by: 'Asha', created_at: '2026-11-23T10:00:00Z' },
        { id: 'r2', owner_id: 'o-1', kind: 'unknown', account: 'bank', amount_paise: 100, category: 'Fuel', note: 'x', draw_date: '2026-11-02', created_by: 'Asha', created_at: '2026-11-23T10:01:00Z' },
      ],
      categories: ['Fuel', 7],
    });
    expect(parsed.me).toBe('o-2');
    expect(parsed.owners[0]?.left_paise).toBe(500000);
    expect(parsed.rows[0]?.kind).toBe('opening');
    expect(parsed.rows[0]?.account).toBeNull();
    expect(parsed.rows[1]?.kind).toBe('spend');
    expect(parsed.categories).toEqual(['Fuel']);
  });

  it('has no signed-in owner before the database answers', () => {
    expect(parseDrawings({}).me).toBeNull();
    expect(parseDrawings(null).owners).toEqual([]);
  });
});
