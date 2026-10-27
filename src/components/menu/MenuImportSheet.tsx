import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Text } from '@/components/ui/Typography';
import { colors, semantic } from '@/lib/pos/brand';
import { Card, LinkButton, Notice, PrimaryButton, Sheet } from '@/components/kitchen/ui';
import { importMenuProducts, validateProductImportRows, type ProductImportRow, type ProductValidationSummary } from '@/lib/pos/menu-import-service';
import type { MenuProduct } from '@/lib/pos/menu-service';
import { importPreview, type ImportLine } from '@/lib/pos/menu-utils';

/** Rows listed in the preview; the rest are counted. */
const SHOWN_LINES = 30;

/** Whether this device can import a spreadsheet: the file is read in the browser. */
export const CAN_IMPORT = Platform.OS === 'web';

const LINE_TAG: Record<ImportLine['kind'], { label: string; fg: string; bg: string }> = {
  fix: { label: 'Fix', fg: semantic.danger, bg: semantic.dangerSoft },
  category: { label: 'New', fg: colors.textSecondary, bg: colors.surfaceTint },
  price: { label: 'Update', fg: semantic.success, bg: semantic.successSoft },
};

/** Two sample rows in the import's columns, so the owner sees the shape to fill in. */
async function downloadTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet([
    { 'Product Name*': 'Pistachio Cheesecake', 'Price*': 350, 'Category Name*': 'Signature Desserts', 'Inventory Tracking Enabled': 'Yes', 'Linked Recipe Code': 'REC01' },
    { 'Product Name*': 'Nutella Milkshake', 'Price*': 220, 'Category Name*': 'Milkshakes & Drinks', 'Inventory Tracking Enabled': 'No', 'Linked Recipe Code': '' },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Product Menu');
  XLSX.writeFile(wb, 'grovit_product_menu_template.xlsx');
}

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('empty')));
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsArrayBuffer(file);
  });
}

function Figure({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl border p-3.5" style={{ borderColor: danger && value > 0 ? semantic.dangerSoft : colors.borderSoft }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: danger && value > 0 ? semantic.danger : colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 26, fontWeight: '700', color: danger && value > 0 ? semantic.danger : colors.textPrimary, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

/**
 * Import from Excel (task 276): choose a file, see what it will do (new items, price changes and
 * the rows to fix, with why), then one button imports the good rows and skips the rest.
 */
export function MenuImportSheet({ visible, onClose, products, onImported }: {
  visible: boolean;
  onClose: () => void;
  products: readonly MenuProduct[];
  onImported: (count: number) => void;
}) {
  const [summary, setSummary] = useState<ProductValidationSummary | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setSummary(null); setError(null); onClose(); };

  const choose = async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
        copyToCacheDirectory: true,
      });
      const asset = picked.canceled ? undefined : picked.assets[0];
      if (!asset) return;
      if (!asset.file) { setError('That file could not be opened.'); return; }
      setBusy(true);
      const XLSX = await import('xlsx');
      const book = XLSX.read(new Uint8Array(await readFile(asset.file)), { type: 'array' });
      const first = book.SheetNames[0];
      const sheet = first ? book.Sheets[first] : undefined;
      const rows = sheet ? XLSX.utils.sheet_to_json<ProductImportRow>(sheet) : [];
      if (rows.length === 0) { setError('The file has no rows.'); return; }
      setFileName(asset.name);
      setSummary(await validateProductImportRows(rows));
    } catch {
      setError('That file could not be read. Use the template’s columns.');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!summary || busy) return;
    setBusy(true);
    setError(null);
    const result = await importMenuProducts(summary.rows);
    setBusy(false);
    if (result.error || !result.data) { setError(result.error ?? 'The import did not finish. Try again.'); return; }
    setSummary(null);
    onImported(result.data.count);
  };

  const template = () => { void downloadTemplate().catch(() => setError('The template could not be made.')); };
  const preview = summary ? importPreview(summary, products) : null;

  return (
    <Sheet visible={visible} onClose={close} title="Import from Excel">
      {summary && preview ? (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: -6 }}>{`${fileName} · ${summary.totalRows} ${summary.totalRows === 1 ? 'row' : 'rows'}`}</Text>
          <View className="mt-3.5 flex-row gap-2.5">
            <Figure label="New items" value={summary.createCount} />
            <Figure label="Price changes" value={preview.priceChanges} />
            <Figure label="Rows to fix" value={summary.errorRows} danger />
          </View>
          {preview.lines.length > 0 ? (
            <Card padded={false} style={{ overflow: 'hidden', marginTop: 14 }}>
              {preview.lines.slice(0, SHOWN_LINES).map((line, i) => (
                <View key={line.key} className={`min-h-[54px] flex-row items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                  <View className="min-w-0 flex-1">
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{line.title}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 1 }}>{line.detail}</Text>
                  </View>
                  <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: LINE_TAG[line.kind].bg }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: LINE_TAG[line.kind].fg }}>{LINE_TAG[line.kind].label}</Text>
                  </View>
                </View>
              ))}
              {preview.lines.length > SHOWN_LINES ? (
                <Text className="border-t border-border-soft px-3.5 py-3" style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>{`${preview.lines.length - SHOWN_LINES} more`}</Text>
              ) : null}
            </Card>
          ) : null}
          {error ? <Notice text={error} /> : null}
          <View className="mt-4 flex-row flex-wrap items-center justify-between gap-3">
            <LinkButton label="Choose another file" onPress={() => void choose()} />
            <PrimaryButton label={summary.errorRows > 0 ? `Import ${summary.validRows} rows, skip ${summary.errorRows}` : `Import ${summary.validRows} rows`}
              onPress={() => void run()} loading={busy} disabled={summary.validRows === 0} reason="No rows to import" />
          </View>
        </View>
      ) : (
        <View>
          {error ? <Notice text={error} /> : null}
          <View className="mt-3"><PrimaryButton label="Choose a file" onPress={() => void choose()} loading={busy} /></View>
          <View className="mt-1 items-center"><LinkButton label="Download the template" onPress={template} /></View>
        </View>
      )}
    </Sheet>
  );
}
