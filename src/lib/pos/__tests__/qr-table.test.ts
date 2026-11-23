import { MAX_TABLES, nextTableLabels, qrSheetHtml, qrSvg, qrSvgPath, tableLink, tableTitle } from '@/lib/pos/qr-table-utils';

describe('tableLink and tableTitle', () => {
  it('builds the address a code opens', () => {
    expect(tableLink('https://www.leleban.grovitai.com/', '0123456789abcdef0123')).toBe('https://www.leleban.grovitai.com/t/0123456789abcdef0123');
  });
  it('writes a number as Table n and leaves words alone', () => {
    expect(tableTitle('4')).toBe('Table 4');
    expect(tableTitle(' Terrace 2 ')).toBe('Terrace 2');
  });
});

describe('nextTableLabels', () => {
  it('starts at 1 and continues after the highest number', () => {
    expect(nextTableLabels([], 3)).toEqual(['1', '2', '3']);
    expect(nextTableLabels(['1', '2', 'Terrace', '7'], 2)).toEqual(['8', '9']);
  });
  it('never goes past the most tables a branch can have', () => {
    const existing = Array.from({ length: MAX_TABLES - 2 }, (_, i) => String(i + 1));
    expect(nextTableLabels(existing, 10)).toHaveLength(2);
    expect(nextTableLabels(existing.concat(['x', 'y']), 5)).toEqual([]);
    expect(nextTableLabels([], -3)).toEqual([]);
  });
});

describe('the QR picture', () => {
  const link = 'https://www.leleban.grovitai.com/t/0123456789abcdef0123';
  it('is a square of modules with finder squares in three corners', () => {
    const { size, d } = qrSvgPath(link);
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0);
    expect(d.startsWith('M')).toBe(true);
    // The top-left finder square's first module is dark.
    expect(d.startsWith('M0 0h1v1h-1z')).toBe(true);
  });
  it('is the same for the same address and different for another', () => {
    expect(qrSvgPath(link).d).toBe(qrSvgPath(link).d);
    expect(qrSvgPath(link).d).not.toBe(qrSvgPath(link.replace('0123', '4567')).d);
  });
  it('draws as an SVG with a quiet border', () => {
    const svg = qrSvg(link, 200);
    expect(svg).toContain('viewBox="-4 -4 ');
    expect(svg).toContain('width="200"');
  });
});

describe('qrSheetHtml', () => {
  it('has a card for each table, with the name and a code, and escapes what it is given', () => {
    const html = qrSheetHtml('Kolathur <Main>', [{ label: '4', link: 'https://x.test/t/0123456789abcdef0123' }, { label: 'Terrace "A"', link: 'https://x.test/t/aaaaaaaaaaaaaaaaaaaa' }], 'data:image/png;base64,AAAA');
    expect(html.match(/class="card"/g)).toHaveLength(2);
    expect(html).toContain('<h1>Table 4</h1>');
    expect(html).toContain('Terrace &quot;A&quot;');
    expect(html).toContain('Kolathur &lt;Main&gt;');
    expect(html.match(/<svg /g)).toHaveLength(2);
  });
});
