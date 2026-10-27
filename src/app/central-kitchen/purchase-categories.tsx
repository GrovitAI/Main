import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { fetchKitchenPurchaseCategories, saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import { addKitchenParticular, updateKitchenParticular } from '@/lib/pos/kitchen-service';
import { categoryTree, placeOf } from '@/lib/pos/kitchen-spend-utils';
import type { KitchenCategory, KitchenParticular } from '@/lib/pos/kitchen-types';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { Avatar, Card, Empty, KHeader, KScreen, LinkButton, Notice, PrimaryButton, Section, SelectRow, SettingsGroup, Sheet, SkeletonRows, TextField, Toggle, ValueRow } from '@/components/kitchen/ui';
import { CategorySheet, toneOfParticular } from '@/components/kitchen/SpendFields';

const ASKS_TEXT = { route: 'Asks for the route', person: 'Asks who' } as const;

/**
 * The kitchen's one category list, used by Bought and Spent (task 255), now a tree (task 279):
 * a category holds sub-categories (Food › Dairy), and each holds the particulars filed under it
 * (Milk). A row opens its own page; names, places and archiving change there.
 */
export default function PurchaseCategoriesScreen() {
  const data = useKitchenData();
  const mayEdit = useKitchenAccess().can('setup.categories');
  const [categories, setCategories] = useState<KitchenCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [newName, setNewName] = useState<string | null>(null);
  const [newSub, setNewSub] = useState<string | null>(null);
  const [newParticular, setNewParticular] = useState<string | null>(null);
  const [particular, setParticular] = useState<KitchenParticular | null>(null);
  const [particularName, setParticularName] = useState('');
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const result = await fetchKitchenPurchaseCategories(true);
    setLoading(false);
    if (result.error || !result.data) { setError(result.error ?? 'Unable to load categories.'); return; }
    setCategories(result.data);
    useKitchenStore.setState({ purchaseCategories: result.data });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const tree = useMemo(() => categoryTree(categories), [categories]);
  const archived = useMemo(() => categories.filter((c) => !c.is_active).sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const open = openId ? categories.find((c) => c.id === openId) ?? null : null;
  const openPlace = placeOf(categories, openId);
  const subs = open ? categories.filter((c) => c.parent_id === open.id && c.is_active).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const filed = useMemo(() => (open ? data.particulars.filter((p) => p.category_id === open.id).sort((a, b) => a.name.localeCompare(b.name)) : []), [data.particulars, open]);
  const countIn = (id: string) => data.particulars.filter((p) => p.category_id === id).length;

  const run = async (work: () => Promise<string | null>, notice?: string): Promise<boolean> => {
    if (saving) return false;
    setSaving(true); setError(null);
    const problem = await work();
    setSaving(false);
    if (problem) { setError(problem); return false; }
    if (notice) useKitchenStore.getState().setNotice(notice);
    await Promise.all([load(), data.load(true)]);
    return true;
  };
  const saveCategory = (c: KitchenCategory, changes: { name?: string; active?: boolean; parentId?: string | null }, notice: string) =>
    run(async () => (await saveKitchenPurchaseCategory(changes.name ?? c.name, c.id, changes.active ?? c.is_active, changes.parentId)).error, notice);
  const addCategory = (name: string, parentId: string | null) =>
    run(async () => (await saveKitchenPurchaseCategory(name, undefined, true, parentId)).error, `${name.trim()} added`);
  const openCategory = (c: KitchenCategory) => { setOpenId(c.id); setRename(c.name); setNewSub(null); setNewParticular(null); setError(null); };

  const summary = (c: KitchenCategory, kids: KitchenCategory[]) => {
    const parts = [kids.length ? kids.map((k) => k.name).join(' · ') : '', countIn(c.id) ? `${countIn(c.id)} ${countIn(c.id) === 1 ? 'particular' : 'particulars'}` : '', c.asks ? ASKS_TEXT[c.asks] : ''];
    return parts.filter(Boolean).join(' · ') || undefined;
  };

  // ── One category's page ─────────────────────────────────────────────────────
  if (open) {
    const isTop = !open.parent_id;
    const renamed = rename.trim().length > 0 && rename.trim() !== open.name;
    const homes = tree.filter((t) => t.top.id !== open.id && t.top.is_active).map((t) => ({ value: t.top.id, label: t.top.name }));
    return (
      <KScreen>
        <KHeader title={open.name} subtitle={isTop ? undefined : openPlace?.top.name} onBack={() => setOpenId(open.parent_id && open.is_active ? open.parent_id : null)} />
        {mayEdit ? (
          <View className="mt-1 gap-2">
            <TextField value={rename} onChange={setRename} label="Name" placeholder={open.name} />
            {renamed ? <PrimaryButton label="Save name" onPress={() => void saveCategory(open, { name: rename }, 'Name saved')} loading={saving} /> : null}
          </View>
        ) : null}
        {open.asks ? <Text className="mt-2 text-[13px] font-semibold text-text-secondary">{ASKS_TEXT[open.asks]}</Text> : null}

        {isTop ? (
          <Section title="Sub-categories">
            {subs.length ? (
              <SettingsGroup>
                {subs.map((s) => <ValueRow key={s.id} label={s.name} value={countIn(s.id) ? String(countIn(s.id)) : null} placeholder="" action="open" onPress={() => openCategory(s)} />)}
              </SettingsGroup>
            ) : null}
            {mayEdit ? (newSub === null ? <View className="items-start"><LinkButton label="New sub-category" onPress={() => setNewSub('')} /></View> : (
              <View className="mt-2 flex-row items-center gap-3">
                <View className="min-w-0 flex-1"><TextField label="New sub-category" value={newSub} onChange={setNewSub} placeholder="Name" autoFocus /></View>
                {newSub.trim() ? <LinkButton label="Add" onPress={() => void addCategory(newSub, open.id).then((ok) => ok && setNewSub(null))} /> : <LinkButton label="Cancel" onPress={() => setNewSub(null)} />}
              </View>
            )) : null}
          </Section>
        ) : null}

        <Section title="Particulars">
          {filed.length ? (
            <SettingsGroup>
              {filed.map((p) => (
                <ValueRow key={p.id} label={p.name} value={null} placeholder="" action={mayEdit ? 'open' : 'none'} disabled={!mayEdit}
                  lead={<Avatar name={p.name} toneIndex={toneOfParticular(categories, p.category_id)} size={32} ring={false} />}
                  onPress={() => { setParticular(p); setParticularName(p.name); }} />
              ))}
            </SettingsGroup>
          ) : <Text className="text-[13px] font-semibold text-text-secondary">None yet. A particular typed in Spent is kept here.</Text>}
          {mayEdit ? (newParticular === null ? <View className="items-start"><LinkButton label="Add a particular" onPress={() => setNewParticular('')} /></View> : (
            <View className="mt-2 flex-row items-center gap-3">
              <View className="min-w-0 flex-1"><TextField label="New particular" value={newParticular} onChange={setNewParticular} placeholder="Name" autoFocus /></View>
              {newParticular.trim() ? (
                <LinkButton label="Add" onPress={() => void run(async () => (await addKitchenParticular(newParticular, open.id)).error, `${newParticular.trim()} added`).then((ok) => ok && setNewParticular(null))} />
              ) : <LinkButton label="Cancel" onPress={() => setNewParticular(null)} />}
            </View>
          )) : null}
        </Section>

        {mayEdit ? (
          <View className="mt-4">
            <SettingsGroup>
              {subs.length === 0 && homes.length ? (
                <SelectRow label="Inside" value={open.parent_id ?? ''} options={[{ value: '', label: 'Nothing' }, ...homes]}
                  onChange={(id) => void saveCategory(open, { parentId: id || null }, id ? `Moved into ${homes.find((h) => h.value === id)?.label ?? 'the category'}` : 'Moved to the top')} />
              ) : null}
              <Toggle label="Archived" on={!open.is_active} disabled={saving} onChange={(on) => void saveCategory(open, { active: !on }, on ? `${open.name} archived` : `${open.name} restored`)} />
            </SettingsGroup>
          </View>
        ) : null}
        {error ? <Notice text={error} /> : null}

        <Sheet visible={!!particular} onClose={() => setParticular(null)} title={particular?.name ?? 'Particular'} dirty={!!particular && particularName.trim() !== particular.name}>
          {particular ? (
            <View style={{ gap: 12 }}>
              <TextField value={particularName} onChange={setParticularName} label="Name" placeholder={particular.name} />
              {particularName.trim() && particularName.trim() !== particular.name ? (
                <PrimaryButton label="Save name" loading={saving} onPress={() => void run(async () => (await updateKitchenParticular(particular.id, { name: particularName })).error, 'Name saved').then((ok) => ok && setParticular(null))} />
              ) : null}
              <SettingsGroup>
                <ValueRow label="Category" value={placeOf(categories, particular.category_id)?.label} onPress={() => setMoving(true)} />
                <Toggle label="Archived" on={!particular.is_active} disabled={saving}
                  onChange={(on) => void run(async () => (await updateKitchenParticular(particular.id, { is_active: !on })).error, on ? `${particular.name} archived` : `${particular.name} restored`).then((ok) => ok && setParticular(null))} />
              </SettingsGroup>
            </View>
          ) : null}
        </Sheet>
        <CategorySheet visible={moving} onClose={() => setMoving(false)} categories={categories} value={particular?.category_id ?? null}
          onPick={(id) => { setMoving(false); if (particular) void run(async () => (await updateKitchenParticular(particular.id, { category_id: id })).error, 'Moved').then((ok) => ok && setParticular(null)); }} />
      </KScreen>
    );
  }

  // ── The list ───────────────────────────────────────────────────────────────
  return (
    <KScreen refreshing={loading && categories.length > 0} onRefresh={() => void load()}>
      <KHeader title="Categories" subtitle="Bought and Spent" onBack={() => router.back()} />
      {!mayEdit ? <Notice tone="neutral" text="Your login cannot change categories. Ask the owner." /> : null}
      {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
      <Section title="Categories">
        {loading && categories.length === 0 ? <SkeletonRows count={4} label="Loading categories" />
          : tree.length === 0 ? <Card><Empty title="No categories yet" body="Add categories such as Food, Transport or Cleaning." /></Card>
          : (
            <SettingsGroup>
              {tree.map(({ top, subs: kids }) => (
                <ValueRow key={top.id} label={top.name} sub={summary(top, kids)} value={null} placeholder="" action="open" onPress={() => openCategory(top)}
                  lead={<Avatar name={top.name} toneIndex={toneOfParticular(categories, top.id)} size={36} ring={false} />} />
              ))}
            </SettingsGroup>
          )}
        {mayEdit ? (newName === null ? <View className="items-start"><LinkButton label="New category" onPress={() => setNewName('')} /></View> : (
          <View className="mt-2 flex-row items-center gap-3">
            <View className="min-w-0 flex-1"><TextField label="New category" value={newName} onChange={setNewName} placeholder="Name" autoFocus /></View>
            {newName.trim() ? <LinkButton label="Add" onPress={() => void addCategory(newName, null).then((ok) => ok && setNewName(null))} /> : <LinkButton label="Cancel" onPress={() => setNewName(null)} />}
          </View>
        )) : null}
      </Section>
      {archived.length > 0 ? (
        <Section title="Archived">
          <SettingsGroup>
            {archived.map((c) => <ValueRow key={c.id} label={c.name} sub={placeOf(categories, c.id)?.sub ? placeOf(categories, c.id)?.top.name : undefined} value={null} placeholder="" action="open" onPress={() => openCategory(c)} />)}
          </SettingsGroup>
        </Section>
      ) : null}
    </KScreen>
  );
}
