import { rankOptions, type SearchSelectOption } from '../search-select-utils';

const OPTIONS: SearchSelectOption[] = [
  { id: 'util', label: 'Utilities', hint: 'Expense' },
  { id: 'elec', label: 'Electricity', hint: 'Utilities', nested: true },
  { id: 'water', label: 'Water', hint: 'Utilities', nested: true },
  { id: 'raw', label: 'Raw Materials', hint: 'Expense' },
  { id: 'dairy', label: 'Dairy', hint: 'Raw Materials', nested: true },
];

describe('rankOptions', () => {
  test('an empty query keeps every option in order', () => {
    expect(rankOptions(OPTIONS, '  ').map((o) => o.id)).toEqual(['util', 'elec', 'water', 'raw', 'dairy']);
  });

  test('labels that start with the letters come before labels that merely contain them', () => {
    expect(rankOptions(OPTIONS, 'wa').map((o) => o.id)).toEqual(['water']);
    expect(rankOptions(OPTIONS, 'at').map((o) => o.id)).toEqual(['water', 'raw', 'dairy']);
  });

  test('matches the hint too, so typing the category finds its sub-categories', () => {
    expect(rankOptions(OPTIONS, 'util').map((o) => o.id)).toEqual(['util', 'elec', 'water']);
  });

  test('is case-insensitive and returns nothing for no match', () => {
    expect(rankOptions(OPTIONS, 'DAI').map((o) => o.id)).toEqual(['dairy']);
    expect(rankOptions(OPTIONS, 'zzz')).toEqual([]);
  });
});
