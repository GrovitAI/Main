import { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Text } from '@/components/ui/Typography';
import { colors, semantic } from '@/lib/pos/brand';
import { Card, LinkButton, Notice, PrimaryButton, Sheet } from '@/components/kitchen/ui';
import { downloadCountTemplate, readCountFile } from '@/lib/pos/stock-count-import';
import { matchCountLines, type CountImport, type CountItem, type CountMatch } from '@/lib/pos/stock-count-import-utils';

/** Rows listed in the preview; the rest are counted. */
const SHOWN = 30;

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('empty')));
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsArrayBuffer(file);
  });
}

function Figure({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  const hot = danger && value > 0;
  return (
    <View className="min-w-0 flex-1 rounded-2xl border p-3.5" style={{ borderColor: hot ? semantic.dangerSoft : colors.borderSoft }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: hot ? semantic.danger : colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 26, fontWeight: '700', color: hot ? semantic.danger : colors.textPrimary, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const figure = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Task 339: Import from Excel on Count stock. Choose the filled template, see what it will do (the figures
 * that will fill in, the rows to fix and why, the rows left blank), then one button puts the good figures on
 * the screen. Nothing is saved here: the figures can be changed on the screen first, and Save is there.
 */
export function StockCountImportSheet({ visible, onClose, items, dayLabel, onApply }: {
  visible: boolean;
  onClose: () => void;
  items: readonly CountItem[];
  /** The day being counted, as the screen shows it, so the person sees which day the figures are for. */
  dayLabel: string;
  onApply: (matched: readonly CountMatch[]) => void;
}) {
  const [result, setResult] = useState<CountImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setResult(null); setError(null); onClose(); };

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
      const read = await readCountFile(await readFile(asset.file));
      if (read.error) { setError(read.error); return; }
      setFileName(asset.name);
      setResult(matchCountLines(read.lines, items));
    } catch {
      setError('That file could not be read. Use the template’s columns.');
    } finally {
      setBusy(false);
    }
  };

  const template = () => { void downloadCountTemplate(items).catch(() => setError('The template could not be made.')); };
  const apply = () => {
    if (!result || result.matched.length === 0) return;
    onApply(result.matched);
    close();
  };

  return (
    <Sheet visible={visible} onClose={close} title="Import stock count">
      {result ? (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: -6 }}>{`${fileName} · counting for ${dayLabel}`}</Text>
          <View className="mt-3.5 flex-row gap-2.5">
            <Figure label="To fill in" value={result.matched.length} />
            <Figure label="Rows to fix" value={result.problems.length} danger />
            <Figure label="Left blank" value={result.blank} />
          </View>
          {result.problems.length > 0 ? (
            <Card padded={false} style={{ overflow: 'hidden', marginTop: 14 }}>
              {result.problems.slice(0, SHOWN).map((p, i) => (
                <View key={`${p.row}-${i}`} className={`min-h-[54px] flex-row items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                  <View className="min-w-0 flex-1">
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{p.name || '(no name)'}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 1 }}>{`Row ${p.row}`}</Text>
                  </View>
                  <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: semantic.dangerSoft, maxWidth: '55%' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: semantic.danger }} numberOfLines={2}>{p.reason}</Text>
                  </View>
                </View>
              ))}
              {result.problems.length > SHOWN ? <Text className="border-t border-border-soft px-3.5 py-3" style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>{`${result.problems.length - SHOWN} more`}</Text> : null}
            </Card>
          ) : null}
          {result.matched.length > 0 ? (
            <Card padded={false} style={{ overflow: 'hidden', marginTop: 14 }}>
              {result.matched.slice(0, SHOWN).map((m, i) => (
                <View key={m.itemId} className={`min-h-[54px] flex-row items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                  <View className="min-w-0 flex-1">
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{m.name}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 1 }}>{`${figure(m.was)} ${m.unit} in stock`}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] }}>{`${m.text} ${m.unit}`}</Text>
                </View>
              ))}
              {result.matched.length > SHOWN ? <Text className="border-t border-border-soft px-3.5 py-3" style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>{`${result.matched.length - SHOWN} more`}</Text> : null}
            </Card>
          ) : null}
          {error ? <Notice text={error} /> : null}
          <View className="mt-4 flex-row flex-wrap items-center justify-between gap-3">
            <LinkButton label="Choose another file" onPress={() => void choose()} />
            <PrimaryButton label={result.problems.length > 0 ? `Fill in ${result.matched.length}, skip ${result.problems.length}` : `Fill in ${result.matched.length}`}
              onPress={apply} disabled={result.matched.length === 0} reason="Nothing to fill in" />
          </View>
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: -6 }}>{`Counting for ${dayLabel}`}</Text>
          {error ? <View className="mt-3"><Notice text={error} /></View> : null}
          <View className="mt-3"><PrimaryButton label="Choose a file" onPress={() => void choose()} loading={busy} /></View>
          <View className="mt-1 items-center"><LinkButton label="Download the template" onPress={template} /></View>
        </View>
      )}
    </Sheet>
  );
}
