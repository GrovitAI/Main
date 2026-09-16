/** One choice in a searchable list. */
export type SearchSelectOption = {
  id: string;
  label: string;
  /** Small grey text after the label, such as the parent category. */
  hint?: string;
  /** Indented under the option before it; for a tree shown flat. */
  nested?: boolean;
};

/**
 * Options whose label (or hint) contains the typed text, those that start
 * with it first. An empty query returns everything in the given order.
 */
export function rankOptions(options: readonly SearchSelectOption[], query: string): SearchSelectOption[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...options];
  const starts: SearchSelectOption[] = [];
  const contains: SearchSelectOption[] = [];
  for (const option of options) {
    const label = option.label.toLowerCase();
    if (label.startsWith(needle)) starts.push(option);
    else if (label.includes(needle) || (option.hint ?? '').toLowerCase().includes(needle)) contains.push(option);
  }
  return [...starts, ...contains];
}
