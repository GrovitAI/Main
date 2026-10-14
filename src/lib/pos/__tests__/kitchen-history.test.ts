import { filterKitchenHistory, historyAuditText, historyRecordedDay, historyStatus, historyTimeLabel, type HistoryFilters } from '../kitchen-history-utils';
import type { KitchenEntry } from '../kitchen-types';

const entry = (id: string, over: Partial<KitchenEntry> = {}): KitchenEntry => ({
  id, type: 'spent', entry_date: '2026-10-05', created_at: '2026-10-05T10:00:00Z',
  created_by: 'Asha', party_id: null, item_id: null, qty: null, from_qty: null,
  amount: 100, paid: true, mode: 'cash', category: 'Transport', note: null,
  voided_at: null, voided_by: null, void_reason: null, replaces_id: null, lines: [], ...over,
});
const defaults: HistoryFilters = { kind: null, status: null, enteredBy: null, dateBasis: 'transaction', range: null, query: '', sort: 'transaction-newest' };
const old = entry('old', { voided_at: '2026-10-08T09:00:00Z', voided_by: 'Priya', void_reason: 'Edited' });
const edited = entry('edited', { replaces_id: 'old', created_by: 'Priya', created_at: '2026-10-08T09:00:00Z', amount: 150 });
const voided = entry('voided', { voided_at: '2026-10-09T09:00:00Z', voided_by: 'Ravi', void_reason: 'Duplicate bill' });
const original = entry('original');
const data = [old, edited, voided, original];
const rows = (filters: Partial<HistoryFilters> = {}, entries = data) => filterKitchenHistory(entries, { ...defaults, ...filters }, item => [item.category, item.note]);

describe('Kitchen audit history', () => {
  it('keeps original, edited, replaced and removed records visible in All', () => {
    expect(rows()).toHaveLength(4);
    expect(data.map(historyStatus)).toEqual(['replaced', 'edited', 'voided', 'active']);
  });
  it('narrows to what counts now, to corrections with their earlier versions, or to voids', () => {
    expect(rows({ status: 'current' }).map(item => item.id).sort()).toEqual(['edited', 'original']);
    expect(rows({ status: 'edited' }).map(item => item.id).sort()).toEqual(['edited', 'old']);
    expect(rows({ status: 'voided' }).map(item => item.id)).toEqual(['voided']);
  });
  it('combines staff, type, status and search instead of overriding one condition', () => {
    expect(rows({ enteredBy: 'Priya', status: 'edited', kind: 'spent', query: 'Transport' }).map(item => item.id)).toEqual(['edited']);
    expect(rows({ enteredBy: 'Asha', status: 'edited' }).map(item => item.id)).toEqual(['old']);
    expect(rows({ enteredBy: 'Priya', status: 'voided' })).toEqual([]);
    expect(rows({ kind: 'stock' })).toEqual([]);
    expect(rows({ kind: 'spent' }, [entry('paid', { type: 'paid' })])).toHaveLength(1);
  });
  it('searches removal actors and reasons as well as recorded staff names', () => {
    expect(rows({ query: 'Ravi' }).map(item => item.id)).toEqual(['voided']);
    expect(rows({ query: 'duplicate bill' }).map(item => item.id)).toEqual(['voided']);
    expect(rows({ query: 'replaced' }).map(item => item.id)).toEqual(['old']);
  });
  it('sorts late backdated records by either transaction date or actual entry timestamp', () => {
    const backdated = entry('late', { entry_date: '2026-10-01', created_at: '2026-10-10T09:00:00Z' });
    const newer = entry('newer', { entry_date: '2026-10-09', created_at: '2026-10-09T09:00:00Z' });
    expect(rows({}, [backdated, newer]).map(item => item.id)).toEqual(['newer', 'late']);
    expect(rows({ sort: 'recorded-newest' }, [backdated, newer]).map(item => item.id)).toEqual(['late', 'newer']);
    expect(rows({ sort: 'transaction-oldest' }, [backdated, newer]).map(item => item.id)).toEqual(['late', 'newer']);
    expect(rows({ sort: 'recorded-oldest' }, [backdated, newer]).map(item => item.id)).toEqual(['newer', 'late']);
  });
  it('compares offset timestamps as instants, resolves ties and leaves the store untouched', () => {
    const source = [entry('b', { created_at: '2026-10-05T15:30:00+05:30' }), entry('a', { created_at: '2026-10-05T10:00:00Z' })];
    expect(rows({ sort: 'recorded-oldest' }, source).map(item => item.id)).toEqual(['a', 'b']);
    expect(source.map(item => item.id)).toEqual(['b', 'a']);
  });
  it('uses inclusive India days for entry-date filtering even at UTC midnight boundaries', () => {
    expect(historyRecordedDay('2026-10-04T18:29:59Z')).toBe('2026-10-04');
    expect(historyRecordedDay('2026-10-04T18:30:00Z')).toBe('2026-10-05');
    const range = { startDate: '2026-10-05', endDate: '2026-10-05' };
    const entries = [entry('before', { created_at: '2026-10-04T18:29:59Z' }), entry('start', { created_at: '2026-10-04T18:30:00Z' }), entry('end', { created_at: '2026-10-05T18:29:59Z' }), entry('after', { created_at: '2026-10-05T18:30:00Z' })];
    expect(rows({ dateBasis: 'recorded', range }, entries).map(item => item.id).sort()).toEqual(['end', 'start']);
    expect(rows({ dateBasis: 'transaction', range }, entries)).toHaveLength(4);
  });
  it('reports the stored actor, time and reason without inventing an unknown actor', () => {
    expect(historyAuditText(old)).toContain('Replaced after edit by Priya');
    expect(historyAuditText(edited)).toContain('Edited by Priya');
    expect(historyAuditText(voided)).toContain('Voided by Ravi');
    expect(historyAuditText(voided)).toContain('Duplicate bill');
    expect(historyAuditText({ ...voided, voided_by: null })).toContain('staff not recorded');
    expect(historyAuditText(original)).toBeNull();
    expect(historyTimeLabel('2026-10-04T18:30:00Z')).toContain('5 Oct 2026');
  });
  it('keeps a corrected entry that is later removed in Voided rather than Edited', () => {
    const removedEdit = { ...edited, voided_at: '2026-10-09T09:00:00Z', void_reason: 'Duplicate bill' };
    expect(historyStatus(removedEdit)).toBe('voided');
    expect(rows({ status: 'edited' }, [removedEdit])).toEqual([]);
  });
});
