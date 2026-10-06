/**
 * The kitchen screens' shared pieces: one header, one card, one chip, one
 * button, one row, so every screen reads the same. Colours come from
 * brand.ts; money is green in, red out, amber for a buy, on figures and
 * icons only. Every action, filled or outlined, is Le Laban blue.
 *
 * Legacy Pressables with function styles must not also take className:
 * NativeWind drops that function. Class-styled controls use active variants.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Search, X, Check, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { formatMoney, matchesSearch } from '@/lib/pos/kitchen-utils';

export type Tone = 'neutral' | 'in' | 'out' | 'buy' | 'primary';

export const toneColor: Record<Tone, string> = {
  neutral: colors.textPrimary,
  in: semantic.success,
  out: semantic.danger,
  buy: semantic.warning,
  primary: colors.primary,
};
export const toneSoft: Record<Tone, string> = {
  neutral: semantic.neutralSoft,
  in: semantic.successSoft,
  out: semantic.dangerSoft,
  buy: semantic.warningSoft,
  primary: colors.accentSoft,
};

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};
const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
/** The smallest thing a finger may be asked to hit: 44 pt on iOS and the web, 48 dp on Android. */
const TARGET = Platform.select({ android: 48, default: 44 }) ?? 44;

/** A resting style plus the pressed dim, for every Pressable in these screens. */
function pressed(base: StyleProp<ViewStyle>, dim = 0.65): (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return (state) => [base, { opacity: state.pressed ? dim : 1 }];
}

const cardStyle: ViewStyle = { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 18, backgroundColor: colors.surfaceElevated };

/** Compact browser controls on desktop; retain the phone/tablet touch layout. */
function useDesktopDensity(): boolean {
  const { isDesktop } = useResponsive();
  return Platform.OS === 'web' && isDesktop;
}

// ─── Screen and header ───────────────────────────────────────────────────────

type ScreenProps = {
  children: React.ReactNode;
  /** Scrolls by default; a FlatList screen passes false and scrolls itself. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned under the content, above the tab bar: a save button, a total. */
  footer?: React.ReactNode;
  /** Room for a floating tab bar or a sheet. */
  bottomPad?: number;
  /** Overview/list surfaces may use more width; entry forms stay readable. */
  wide?: boolean;
};

export function KScreen({ children, scroll = true, refreshing = false, onRefresh, footer, bottomPad = 24, wide = false }: ScreenProps) {
  const { isTablet } = useResponsive();
  const compact = useDesktopDensity();
  const widthClass = compact && wide ? 'max-w-[980px]' : isTablet ? 'max-w-[720px]' : '';
  const inner = (
    <View className={`w-full self-center px-4 ${widthClass}`} style={{ paddingBottom: bottomPad }}>
      {children}
    </View>
  );
  return (
    <View className="flex-1 bg-surface-tint">
      {scroll ? (
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {inner}
        </ScrollView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
      {footer ? (
        <View className="border-t border-border-soft bg-surface-elevated" style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <View className={`w-full self-center ${widthClass}`}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Large title on a top-level screen; inline when the screen has a back button. */
  large?: boolean;
};

export function KHeader({ title, subtitle, onBack, right, large = !onBack }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const compact = useDesktopDensity();
  return (
    <View style={{ paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 0) + (compact ? 0 : 8), paddingBottom: 8 }}>
      <View className="flex-row items-center" style={{ minHeight: 44, gap: 8 }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={pressed({ width: 44, height: 44, marginLeft: -8, borderRadius: 22, alignItems: 'center', justifyContent: 'center' })}
          >
            <ChevronLeft size={26} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text
            className={`font-extrabold text-text-primary ${large ? compact ? 'text-2xl leading-7' : 'text-[28px] leading-8' : compact ? 'text-lg leading-6' : 'text-xl leading-6'}`}
            style={{ letterSpacing: -0.4 }}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 2 }} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function IconButton({ icon: Icon, label, onPress, tone = 'primary' }: { icon: LucideIcon; label: string; onPress: () => void; tone?: Tone }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={pressed({ ...cardStyle, borderRadius: 16, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' })}
    >
      <Icon size={20} color={toneColor[tone]} />
    </Pressable>
  );
}

// ─── Surfaces ────────────────────────────────────────────────────────────────

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const compact = useDesktopDensity();
  return <View className={`border border-border-soft bg-surface-elevated ${compact ? 'rounded-xl' : 'rounded-[18px]'} ${padded ? compact ? 'p-3' : 'p-3.5' : ''}`} style={style}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  const compact = useDesktopDensity();
  return (
    <View className={compact ? 'mt-3' : 'mt-[18px]'}>
      <View className="flex-row items-end justify-between" style={{ marginBottom: 8, minHeight: 24 }}>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return (
    <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </Text>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Label>{label}</Label>
      {children}
      {hint ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 6, lineHeight: 18 }}>{hint}</Text> : null}
    </View>
  );
}

export function StatTile({ label, value, tone = 'neutral', onPress }: { label: string; value: number; tone?: Tone; onPress?: () => void }) {
  const compact = useDesktopDensity();
  const body = (
    <>
      <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
      <Text className={`mt-0.5 font-extrabold ${compact ? 'text-xl leading-6' : 'text-[22px] leading-[26px]'}`} style={{ letterSpacing: -0.3, color: toneColor[tone], ...tabular }} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(value)}
      </Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${formatMoney(value)}`} className={`flex-1 border border-border-soft bg-surface-elevated px-3 active:opacity-60 ${compact ? 'min-h-[60px] rounded-xl py-2.5' : 'min-h-[66px] rounded-2xl py-3'}`}>
        {body}
      </Pressable>
    );
  }
  // Inside a card it is a plain cell; the card draws the dividers, so there is no card within a card.
  return <View style={{ flex: 1, minWidth: 0 }}>{body}</View>;
}

/** A hairline between two cells of one card: vertical between columns, horizontal between rows. */
export function Divider({ vertical }: { vertical?: boolean }) {
  return <View style={vertical ? { width: 1, alignSelf: 'stretch', backgroundColor: colors.borderSoft, marginHorizontal: 12 } : { height: 1, backgroundColor: colors.borderSoft, marginVertical: 10 }} />;
}

export function ActionTile({ icon: Icon, label, caption, tone, onPress }: { icon: LucideIcon; label: string; caption: string; tone: Tone; onPress: () => void }) {
  const compact = useDesktopDensity();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${caption}`}
      className={`flex-1 border border-border-soft bg-surface-elevated active:opacity-60 ${compact ? 'min-h-[76px] flex-row items-center gap-2.5 rounded-xl p-3' : 'min-h-[100px] justify-between rounded-[18px] p-3.5'}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: toneSoft[tone] }}>
        <Icon size={compact ? 18 : 20} color={toneColor[tone]} />
      </View>
      <View className={compact ? 'min-w-0 flex-1' : ''}>
        <Text className={`font-extrabold leading-5 text-text-primary ${compact ? 'text-sm' : 'text-[17px]'}`}>{label}</Text>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{caption}</Text>
      </View>
    </Pressable>
  );
}

// ─── Rows and lists ──────────────────────────────────────────────────────────

type RowProps = {
  title: string;
  subtitle?: string;
  right?: string;
  rightSub?: string;
  tone?: Tone;
  icon?: LucideIcon;
  iconTone?: Tone;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  muted?: boolean;
  accessibilityLabel?: string;
};

export function Row({ title, subtitle, right, rightSub, tone = 'neutral', icon: Icon, iconTone = 'neutral', onPress, onLongPress, selected, muted, accessibilityLabel }: RowProps) {
  const compact = useDesktopDensity();
  const rowClass = `flex-row items-center gap-3 border-b border-border-soft ${compact ? 'min-h-[52px] py-2' : 'min-h-[58px] py-3'}`;
  const content = (
    <>
      {Icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: toneSoft[iconTone] }}>
          <Icon size={18} color={toneColor[iconTone]} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className={`font-bold ${compact ? 'text-sm' : 'text-[15px]'}`} style={[{ color: colors.textPrimary }, selected ? { color: colors.primary } : null, muted ? { textDecorationLine: 'line-through', color: colors.textSecondary } : null]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 2, color: colors.textSecondary }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right || rightSub ? (
        <View style={{ alignItems: 'flex-end' }}>
          {right ? <Text style={{ fontSize: 15, fontWeight: '800', color: muted ? colors.textSecondary : toneColor[tone], ...tabular }}>{right}</Text> : null}
          {rightSub ? <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 1, color: colors.textSecondary, ...tabular }}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </>
  );
  if (!onPress && !onLongPress) return <View className={rowClass}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={selected ? { selected: true } : undefined}
      className={`${rowClass} active:opacity-60`}
    >
      {content}
    </Pressable>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  const compact = useDesktopDensity();
  return (
    <View className={`items-center gap-1.5 px-3 ${compact ? 'py-5' : 'py-7'}`}>
      <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      {body ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19, maxWidth: 300 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ text, tone = 'out', action }: { text: string; tone?: Tone; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: toneSoft[tone], padding: 12, gap: 10, marginTop: 12 }} accessibilityRole="alert">
      <Text style={{ flex: 1, color: toneColor[tone], fontSize: 13, fontWeight: '700', lineHeight: 18 }}>{text}</Text>
      {action}
    </View>
  );
}

export function Skeleton({ height = 60, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height, borderRadius: 16, backgroundColor: colors.borderSoft, opacity: 0.7 }, style]} accessibilityElementsHidden />;
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export function SearchBox({ value, onChange, placeholder = 'Search', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: 46, paddingHorizontal: 12, gap: 8 }}>
      <Search size={18} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={{ flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600', paddingVertical: 10, ...webNoOutline }}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} style={pressed({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' })}>
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type ChipOption<T extends string> = { value: T; label: string; hint?: string; searchText?: string };

type ChipsProps<T extends string> = {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** Shows a search box once the list is long. */
  searchable?: boolean;
  searchPlaceholder?: string;
  trailing?: React.ReactNode;
  emptyText?: string;
};

export function Chips<T extends string>({ options, value, onChange, searchable, searchPlaceholder = 'Search', trailing, emptyText }: ChipsProps<T>) {
  const [query, setQuery] = useState('');
  const showSearch = searchable && options.length > 6;
  const shown = useMemo(
    () => (showSearch && query ? options.filter((o) => matchesSearch(query, o.label, o.hint, o.searchText) || o.value === value) : options),
    [options, query, showSearch, value],
  );
  return (
    <View style={{ gap: 10 }}>
      {showSearch ? <SearchBox value={query} onChange={setQuery} placeholder={searchPlaceholder} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {shown.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.hint ? `${o.label}, ${o.hint}` : o.label}
              style={pressed({
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 999,
                borderWidth: 1,
                minHeight: TARGET,
                paddingHorizontal: 16,
                gap: 6,
                backgroundColor: on ? colors.primary : colors.surfaceElevated,
                borderColor: on ? colors.primary : colors.border,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.textOnPrimary : colors.textPrimary }}>{o.label}</Text>
              {o.hint ? <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.textOnPrimary : colors.textSecondary, opacity: 0.85 }}>{o.hint}</Text> : null}
            </Pressable>
          );
        })}
        {trailing}
        {shown.length === 0 && emptyText ? <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', paddingVertical: 10 }}>{emptyText}</Text> : null}
      </View>
    </View>
  );
}

export function AddChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={pressed({ flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surfaceTint, minHeight: TARGET, paddingHorizontal: 16, gap: 4 })}
    >
      <Plus size={14} color={colors.primary} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{label}</Text>
    </Pressable>
  );
}

export function TextField({ value, onChange, placeholder, label, keyboardType, autoFocus, multiline, big, prefix, flat }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric' | 'phone-pad';
  autoFocus?: boolean;
  multiline?: boolean;
  big?: boolean;
  prefix?: string;
  /** Inside a card: a tinted well instead of a bordered box, so there is no box within a box. */
  flat?: boolean;
}) {
  const shell: ViewStyle = flat
    ? { borderRadius: 12, backgroundColor: colors.surfaceTint, minHeight: TARGET, paddingHorizontal: 12 }
    : { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: big ? 64 : 48, paddingHorizontal: 14 };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', ...shell }}>
      {prefix ? <Text style={{ color: colors.textSecondary, fontSize: big ? 26 : 16, fontWeight: '800', marginRight: 6 }}>{prefix}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType}
        inputMode={keyboardType === 'decimal-pad' || keyboardType === 'numeric' ? 'decimal' : undefined}
        autoFocus={autoFocus}
        multiline={multiline}
        accessibilityLabel={label}
        style={{ flex: 1, color: colors.textPrimary, fontSize: big ? 30 : 16, fontWeight: big ? '800' : '600', paddingVertical: multiline ? 12 : 10, letterSpacing: big ? -0.5 : 0, ...tabular, ...webNoOutline }}
      />
    </View>
  );
}

export function QtyStepper({ value, onChange, step, unit, label }: { value: number; onChange: (v: number) => void; step: number; unit: string; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value > 0 ? String(value) : '');
  const commit = (raw: string) => {
    setText(raw);
    const n = parseFloat(raw);
    onChange(Number.isFinite(n) && n >= 0 ? n : 0);
  };
  const bump = (d: number) => {
    const next = Math.max(0, Math.round((value + d) * 1000) / 1000);
    setText(null);
    onChange(next);
  };
  const side: ViewStyle = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceTint };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: colors.border, height: 44 }}>
      <Pressable onPress={() => bump(-step)} accessibilityRole="button" accessibilityLabel={`Less ${label}`} style={pressed(side)}>
        <Minus size={18} color={colors.textPrimary} />
      </Pressable>
      <TextInput
        value={shown}
        onChangeText={commit}
        onBlur={() => setText(null)}
        placeholder="0"
        placeholderTextColor={colors.textSecondary}
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel={`${label} quantity in ${unit}`}
        style={{ width: 64, height: 44, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colors.textPrimary, backgroundColor: colors.surfaceElevated, ...tabular, ...webNoOutline }}
      />
      <Pressable onPress={() => bump(step)} accessibilityRole="button" accessibilityLabel={`More ${label}`} style={pressed(side)}>
        <Plus size={18} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

export function Tick({ on }: { on: boolean }) {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }}>
      {on ? <Check size={16} color={colors.textOnPrimary} strokeWidth={3} /> : null}
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function PrimaryButton({ label, onPress, disabled, loading, tone = 'primary', icon: Icon }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: Tone; icon?: LucideIcon }) {
  const compact = useDesktopDensity();
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      className={`flex-row items-center justify-center gap-2 px-[18px] ${compact ? 'min-h-11 rounded-xl' : 'min-h-[52px] rounded-2xl'} ${off ? 'opacity-50' : 'active:opacity-80'}`}
      style={{ backgroundColor: toneColor[tone] }}
    >
      {loading ? <ActivityIndicator color={colors.textOnPrimary} /> : Icon ? <Icon size={18} color={colors.textOnPrimary} /> : null}
      <Text className={`font-extrabold text-text-on-primary ${compact ? 'text-sm' : 'text-base'}`}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon: Icon, tone = 'neutral', small }: { label: string; onPress: () => void; icon?: LucideIcon; tone?: Tone; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={pressed({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: small ? TARGET : 52, paddingHorizontal: small ? 14 : 18, gap: 8 })}
    >
      {Icon ? <Icon size={small ? 16 : 18} color={toneColor[tone]} /> : null}
      <Text style={{ color: toneColor[tone], fontSize: small ? 13 : 15, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={pressed({ minHeight: TARGET, justifyContent: 'center' })}>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTint, padding: 3 }} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={pressed({ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, minHeight: TARGET, backgroundColor: on ? colors.surfaceElevated : 'transparent', borderWidth: on ? 1 : 0, borderColor: colors.border })}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.primary : colors.textSecondary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  return (
    // On a phone the sheet rises from the bottom edge; centred on a tablet, it fades in.
    <Modal visible={visible} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: isTablet ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable
          onPress={() => undefined}
          style={{
            width: '100%',
            maxWidth: isTablet ? 520 : undefined,
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderBottomLeftRadius: isTablet ? 24 : 0,
            borderBottomRightRadius: isTablet ? 24 : 0,
            padding: 18,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            maxHeight: '88%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800' }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={pressed({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' })}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A short confirmation at the foot of a screen that fades after a moment. */
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}>
      <View style={{ borderRadius: 16, backgroundColor: colors.textPrimary, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 420 }} accessibilityLiveRegion="polite">
        <Text style={{ color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' }}>{text}</Text>
      </View>
    </View>
  );
}
