import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Share, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { MessageCircle } from 'lucide-react-native';
import { editKitchenEntry, postKitchenEntry, kitchenBranch } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { balanceFromEntries, formatDayLabel, formatMoney, formatQty, linesTotal, localDateKey, slipText, whatsappUrl } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenEntryType, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, GhostButton, KHeader, KScreen, Notice, PrimaryButton, Sheet, TextField } from '@/components/kitchen/ui';
import { DateField, LinesEditor, PartyPicker, draftToLines, isValidDateKey, type DraftLines } from '@/components/kitchen/forms';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

const EDITABLE: readonly KitchenEntryType[] = ['sent'];

/** Items to a branch. Stock goes down; the branch's figure goes up by the total. */
export default function SendScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [date, setDate] = useState(localDateKey());
  const [lines, setLines] = useState<DraftLines>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<KitchenEntry | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  // Editing: the form starts from the send as it was saved.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setPartyId(editing.party_id);
    setDate(editing.entry_date);
    setLines(Object.fromEntries(editing.lines.map((l) => [l.item_id, { qty: l.qty, price: l.price }])));
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const chosen = useMemo(() => draftToLines(lines), [lines]);
  const total = useMemo(() => linesTotal(Object.values(lines).filter((l) => l.qty > 0).map((l) => ({ qty: l.qty, price: l.price ?? 0 }))), [lines]);
  const hasQty = Object.values(lines).some((l) => l.qty > 0);
  const canSave = !missing && !!partyId && hasQty && chosen !== null && chosen.length > 0 && isValidDateKey(date);
  const balanceNow = partyId ? balanceFromEntries(data.entries, partyId, 'branch', party?.opening ?? 0) : 0;

  const save = async () => {
    if (!partyId || !chosen || chosen.length === 0 || missing) return;
    setSaving(true);
    setError(null);
    const input: PostEntryInput = { type: 'sent', party_id: partyId, entry_date: date, lines: chosen, note: note.trim() || null };
    const res = editing ? await editKitchenEntry(editing.id, input) : await postKitchenEntry(input);
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? 'Unable to save the send.');
      return;
    }
    await data.load(true);
    setSaved({ ...res.data, lines: chosen.map((l, i) => ({ id: String(i), item_id: l.item_id, qty: l.qty, price: l.price, line_total: Math.round(l.qty * l.price * 100) / 100 })) });
  };

  const balanceAfter = party ? balanceFromEntries(useKitchenStore.getState().entries, party.id, 'branch', party.opening) : 0;
  // The branch is usually named "Le Laban Central Kitchen" already; only add the brand when it is not.
  const kitchenName = /le\s*laban/i.test(kitchenBranch().name) ? kitchenBranch().name : `Le Laban ${kitchenBranch().name}`;
  const slip = saved && party ? slipText({ kitchenName, partyName: party.name, entry: saved, itemsById: data.itemsById, balanceAfter }) : '';

  const share = async () => {
    if (!slip) return;
    const url = whatsappUrl(slip, party?.phone);
    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(url);
      } else {
        const can = await Linking.canOpenURL(url);
        if (can) await Linking.openURL(url);
        else await Share.share({ message: slip });
      }
    } catch {
      await Share.share({ message: slip }).catch(() => undefined);
    }
  };

  const done = () => {
    useKitchenStore.getState().setNotice(editing ? 'Changes saved' : `Sent to ${party?.name ?? 'the branch'} · ${formatMoney(saved?.amount ?? total)}`);
    setSaved(null);
    backToKitchen();
  };

  return (
    <KeyboardAvoider>
      <KScreen
        footer={
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="flex-1">
              <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }}>Total</Text>
              <Text className="text-text-primary" style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] }}>{formatMoney(total)}</Text>
            </View>
            <View style={{ flex: 1.2 }}>
              <PrimaryButton label={editing ? 'Save changes' : 'Save send'} onPress={() => void save()} disabled={!canSave} loading={saving} />
            </View>
          </View>
        }
      >
        <KHeader
          title={editing ? 'Edit send' : 'Send to a branch'}
          subtitle={editing ? 'The earlier entry is voided; this one takes its place' : 'Stock goes down; the branch owes the total'}
          onBack={() => backToKitchen()}
        />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a send." /> : null}
        <Field label="Branch">
          <PartyPicker kind="branch" parties={data.parties} balances={data.balances} value={partyId} onChange={setPartyId} />
        </Field>
        {party ? (
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
            {party.name} {balanceNow > 0 ? `is yet to pay ${formatMoney(balanceNow)}` : balanceNow < 0 ? `has ${formatMoney(-balanceNow)} in credit` : 'is settled up'}.
          </Text>
        ) : null}
        <DateField value={date} onChange={setDate} />
        <Field label="Items" hint={hasQty && chosen === null ? 'Every line with a quantity needs a price.' : undefined}>
          <LinesEditor items={data.items} lines={lines} onChange={setLines} mode="sell" />
        </Field>
        <Field label="Note">
          <TextField value={note} onChange={setNote} label="Note" placeholder="Optional" />
        </Field>
        {error ? <Notice text={error} /> : null}
      </KScreen>

      <Sheet visible={saved !== null} onClose={done} title={editing ? 'Send corrected' : 'Sent'}>
        {saved && party ? (
          <View style={{ gap: 14 }}>
            {/* The slip is the sheet's own content: hairlines, no box inside the box. */}
            <View>
              <Text className="text-text-primary" style={{ fontSize: 16, fontWeight: '800' }}>{kitchenName}</Text>
              <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 2 }}>To {party.name} · {formatDayLabel(saved.entry_date, '')}</Text>
              <View className="border-t border-border-soft" style={{ marginTop: 12, paddingTop: 10, gap: 8 }}>
                {saved.lines.map((l) => {
                  const it = data.itemsById.get(l.item_id);
                  return (
                    <View key={l.id} className="flex-row justify-between" style={{ gap: 10 }}>
                      <Text className="flex-1 text-text-primary" style={{ fontSize: 14, fontWeight: '600' }}>{it?.name ?? 'Item'} · {formatQty(l.qty, it?.unit ?? '')} × {formatMoney(l.price)}</Text>
                      <Text className="text-text-primary" style={{ fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(l.line_total)}</Text>
                    </View>
                  );
                })}
              </View>
              <View className="flex-row justify-between border-t border-border-soft" style={{ marginTop: 12, paddingTop: 10 }}>
                <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800' }}>Total</Text>
                <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(saved.amount)}</Text>
              </View>
              <View className="flex-row justify-between" style={{ marginTop: 4 }}>
                <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600' }}>{party.name} yet to pay</Text>
                <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatMoney(balanceAfter)}</Text>
              </View>
            </View>
            <View className="flex-row" style={{ gap: 10 }}>
              <View className="flex-1"><GhostButton label="WhatsApp" icon={MessageCircle} tone="primary" onPress={() => void share()} /></View>
              <View className="flex-1"><PrimaryButton label="Done" onPress={done} /></View>
            </View>
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoider>
  );
}
