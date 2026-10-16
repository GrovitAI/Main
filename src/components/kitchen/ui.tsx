/**
 * The kitchen screens' shared pieces: one header, one card, one chip, one
 * button, one row, so every screen reads the same. Colours come from
 * brand.ts; money is green in, red out, amber for a buy, on figures and
 * icons only. Every action, filled or outlined, is Le Laban blue.
 *
 * Legacy Pressables with function styles must not also take className:
 * NativeWind drops that function. Class-styled controls use active variants.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, RefreshControl, ScrollView, View, useWindowDimensions, type LayoutChangeEvent, type PressableStateCallbackType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft, MoreHorizontal, Search, X, Check, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { formatMoney, matchesSearch } from '@/lib/pos/kitchen-utils';
import { buzz } from '@/lib/pos/kitchen-haptics';

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
/**
 * Option C (owner, 2026-10-14): small controls are drawn 36 high, and an invisible
 * hit slop above and below brings the finger target back to TARGET.
 */
const VISUAL = 36;
/** The transparent band above and below a drawn control that keeps the whole target tappable. */
const BAND = Math.ceil((TARGET - VISUAL) / 2);

/** A resting style plus the pressed dim, for every Pressable in these screens. */
function pressed(base: StyleProp<ViewStyle>, dim = 0.65): (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return (state) => [base, { opacity: state.pressed ? dim : 1 }];
}

const cardStyle: ViewStyle = { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 18, backgroundColor: colors.surfaceElevated };

/** Compact browser controls on desktop; retain the phone/tablet touch layout. */
export function useDesktopDensity(): boolean {
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
  const widthClass = compact && wide ? 'max-w-[1120px] self-center' : isTablet ? 'max-w-[720px] self-center' : 'self-center';
  const inner = (
    <View className={`w-full px-4 ${widthClass}`} style={{ paddingBottom: bottomPad }}>
      {children}
    </View>
  );
  return (
    <View className="flex-1 bg-kitchen-canvas">
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
        <View className="border-t border-border-soft bg-surface-elevated" style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
          <View className={`w-full ${widthClass}`}>{footer}</View>
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
            numberOfLines={2}
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
    <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
      {children}
    </Text>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Label>{label}</Label>
      {children}
      {hint ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 17 }}>{hint}</Text> : null}
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
  /** Lines the title may use before it is cut; long item names use two. */
  titleLines?: number;
};

export function Row({ title, subtitle, right, rightSub, tone = 'neutral', icon: Icon, iconTone = 'neutral', onPress, onLongPress, selected, muted, accessibilityLabel, titleLines = 1 }: RowProps) {
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
        <Text className={`font-bold ${compact ? 'text-sm' : 'text-[15px]'}`} style={[{ color: colors.textPrimary }, selected ? { color: colors.primary } : null, muted ? { textDecorationLine: 'line-through', color: colors.textSecondary } : null]} numberOfLines={titleLines}>{title}</Text>
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
  // A slow pulse says "loading" in the shape of what is coming (task 216); still with Reduce Motion.
  const reduce = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    if (reduce) { pulse.setValue(0.7); return; }
    const step = (toValue: number) => Animated.timing(pulse, { toValue, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    const loop = Animated.loop(Animated.sequence([step(0.4), step(0.85)]));
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);
  return <Animated.View style={[{ height, borderRadius: 16, backgroundColor: colors.borderSoft, opacity: pulse }, style]} accessibilityElementsHidden />;
}

/** Placeholder rows in the shape of a list, for a first load (task 216). */
export function SkeletonRows({ count = 4, height = 52, label }: { count?: number; height?: number; label: string }) {
  const widths = ['100%', '86%', '94%', '78%', '90%', '82%'] as const;
  return (
    <View style={{ gap: 8, paddingVertical: 8 }} accessible accessibilityLabel={label} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={height} style={{ width: widths[i % widths.length], borderRadius: 12 }} />)}
    </View>
  );
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export function SearchBox({ value, onChange, placeholder = 'Search', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: 44, paddingHorizontal: 12, gap: 8 }}>
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
  const slide = useSlidingRect(shown.findIndex((o) => o.value === value));
  return (
    <View style={{ gap: 10 }}>
      {showSearch ? <SearchBox value={query} onChange={setQuery} placeholder={searchPlaceholder} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, alignItems: 'center' }}>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', height: TARGET, paddingVertical: BAND, ...slide.style, top: slide.top }}>
          <View style={{ flex: 1, borderRadius: 999, backgroundColor: colors.primary }} />
        </Animated.View>
        {shown.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              onLayout={slide.measure(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.hint ? `${o.label}, ${o.hint}` : o.label}
              style={pressed({ minHeight: TARGET, justifyContent: 'center' })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, minHeight: VISUAL, paddingHorizontal: 14, gap: 6, backgroundColor: 'transparent', borderColor: on ? colors.primary : colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.textOnPrimary : colors.textPrimary }}>{o.label}</Text>
                {o.hint ? <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.textOnPrimary : colors.textSecondary, opacity: 0.85 }}>{o.hint}</Text> : null}
              </View>
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={pressed({ minHeight: TARGET, justifyContent: 'center' })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surfaceTint, minHeight: VISUAL, paddingHorizontal: 14, gap: 4 }}>
        <Plus size={14} color={colors.primary} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{label}</Text>
      </View>
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
    : { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: 44, paddingHorizontal: 12, ...(big ? { maxWidth: 360, width: '100%' } : {}) };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', ...shell }}>
      {prefix ? <Text style={{ color: colors.textSecondary, fontSize: big ? 17 : 16, fontWeight: '800', marginRight: 6 }}>{prefix}</Text> : null}
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
        className={big ? 'text-xl' : undefined}
        style={{ flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: big ? 20 : 16, fontWeight: big ? '800' : '600', paddingVertical: multiline ? 12 : 8, letterSpacing: big ? -0.3 : 0, ...tabular, ...webNoOutline }}
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

export function Tick({ on, size = 26 }: { on: boolean; size?: number }) {
  // The blue fades in and the tick pops (a slight overshoot); unticking just fades.
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;
  const before = useRef(on);
  useEffect(() => {
    if (before.current !== on) buzz('select');
    before.current = on;
    if (reduce) { progress.setValue(on ? 1 : 0); return; }
    const run = Animated.timing(progress, { toValue: on ? 1 : 0, duration: on ? 200 : 120, easing: on ? Easing.out(Easing.back(1.6)) : Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [on, reduce, progress]);
  const fill = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderColor: on ? colors.primary : colors.border }}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.primary, opacity: fill }} />
      <Animated.View style={{ opacity: fill, transform: [{ scale }] }}>
        <Check size={Math.round(size * 0.62)} color={colors.textOnPrimary} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function PrimaryButton({ label, onPress, disabled, loading, tone = 'primary', icon: Icon, done = false, reason }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: Tone; icon?: LucideIcon;
  /** The save went through: green with a tick and "Saved" for a moment (task 216). */
  done?: boolean;
  /** What is missing, shown on the button while it is disabled (task 216). */
  reason?: string;
}) {
  const compact = useDesktopDensity();
  const off = disabled || loading || done;
  const why = disabled && !loading && !done && reason ? reason : null;
  const text = done ? 'Saved' : why ?? label;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={why ? `${label}: ${why}` : text}
      accessibilityState={{ disabled: off, busy: loading }}
      className={`flex-row items-center justify-center gap-2 px-[18px] min-h-11 rounded-xl ${(disabled || loading) && !done ? 'opacity-50' : 'active:opacity-80'}`}
      style={{ backgroundColor: done ? semantic.success : toneColor[tone] }}
    >
      {done ? <Check size={18} color={colors.textOnPrimary} strokeWidth={3} /> : loading ? <ActivityIndicator color={colors.textOnPrimary} /> : Icon && !why ? <Icon size={18} color={colors.textOnPrimary} /> : null}
      <Text className={`font-extrabold text-text-on-primary ${compact ? 'text-sm' : 'text-[15px]'}`} numberOfLines={1}>{text}</Text>
    </Pressable>
  );
}

/**
 * After a confirmed save (task 216): `mark()` turns the button to "Saved" with a
 * tick at once (and the phone buzzes), so it cannot be pressed twice while the
 * lists reload; `finish(next)` then runs `next`, usually leaving the form, once
 * the tick has shown for 650 ms.
 */
export function useSavedThen(): { saved: boolean; mark: () => void; finish: (next: () => void) => void } {
  const [saved, setSaved] = useState(false);
  const since = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const mark = useCallback(() => {
    if (since.current) return;
    since.current = Date.now();
    buzz('success');
    setSaved(true);
  }, []);
  const finish = useCallback((next: () => void) => {
    mark();
    timer.current = setTimeout(() => { timer.current = null; next(); }, Math.max(0, 650 - (Date.now() - since.current)));
  }, [mark]);
  return { saved, mark, finish };
}

export function GhostButton({ label, onPress, icon: Icon, tone = 'neutral', small, disabled = false }: { label: string; onPress: () => void; icon?: LucideIcon; tone?: Tone; small?: boolean; disabled?: boolean }) {
  const compact = useDesktopDensity();
  const content = (
    <>
      {Icon ? <Icon size={small ? 16 : 18} color={toneColor[tone]} /> : null}
      <Text style={{ color: toneColor[tone], fontSize: small ? 13 : compact ? 14 : 15, fontWeight: '800' }}>{label}</Text>
    </>
  );
  const face: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: small ? VISUAL : 44, paddingHorizontal: small ? 12 : 16, gap: 8 };
  if (compact) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }}
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-3.5 active:opacity-60">
        {content}
      </Pressable>
    );
  }
  // A small button is drawn 36 high inside a full-height target.
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }}
      style={pressed(small ? { minHeight: TARGET, justifyContent: 'center' } : face)}>
      {small ? <View style={face}>{content}</View> : content}
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

// ─── Settings rows and menus (task 219) ──────────────────────────────────────
// Lighter than buttons. An on/off setting is a switch, a one-of-many choice is
// a row that shows its value and opens a short list, and occasional actions
// (edit, remove) share one menu. Rows sit in a SettingsGroup, which draws one
// card with a hairline between rows.

/** One white card of rows separated by hairlines; rows draw their own top line. */
export function SettingsGroup({ children }: { children: React.ReactNode }) {
  return <Card padded={false} style={{ overflow: 'hidden' }}><View style={{ marginTop: -1 }}>{children}</View></Card>;
}

const rowClass = 'min-h-[56px] flex-row items-center gap-3 border-t border-border-soft px-3.5 py-2.5 hover:bg-surface-tint active:bg-surface-tint';

function RowText({ label, hint }: { label: string; hint?: string }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="text-[15px] font-bold leading-5 text-text-primary">{label}</Text>
      {hint ? <Text className="text-xs leading-[17px] text-text-secondary">{hint}</Text> : null}
    </View>
  );
}

/** A whole-row on/off switch. The thumb glides across and the track fills blue. */
export function Toggle({ label, hint, on, onChange, disabled = false }: { label: string; hint?: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;
  const before = useRef(on);
  useEffect(() => {
    if (before.current !== on) buzz('select');
    before.current = on;
    if (reduce) { progress.setValue(on ? 1 : 0); return; }
    // The track colour can't run on the native driver, so the thumb shares the JS one.
    const run = Animated.timing(progress, { toValue: on ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [on, reduce, progress]);
  const track = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] });
  const x = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  return (
    <Pressable onPress={() => onChange(!on)} disabled={disabled} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on, disabled }} aria-checked={on}
      className={rowClass + (disabled ? ' opacity-50' : '')}>
      <RowText label={label} hint={hint} />
      <Animated.View style={{ width: 44, height: 26, borderRadius: 13, padding: 2, backgroundColor: track }}>
        <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceElevated, transform: [{ translateX: x }] }} />
      </Animated.View>
    </Pressable>
  );
}

export type SelectOption<T extends string> = { value: T; label: string; detail?: string };

/**
 * A row naming a setting and its current value; a tap opens the choices in a
 * sheet (rising from the bottom on a phone, centred on a wider screen). Use it
 * instead of a row of pills once there are more than a few choices.
 */
export function SelectRow<T extends string>({ label, hint, value, valueLabel, options, onChange, disabled = false }: {
  label: string; hint?: string; value: T; options: readonly SelectOption<T>[]; onChange: (value: T) => void;
  /** Shown instead of the option's label, for a value no option names (a picked date). */
  valueLabel?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = valueLabel ?? options.find((o) => o.value === value)?.label ?? '';
  return (
    <>
      <Pressable onPress={() => setOpen(true)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${current}`} accessibilityState={{ expanded: open, disabled }}
        className={rowClass + (disabled ? ' opacity-50' : '')}>
        <RowText label={label} hint={hint} />
        <View className="max-w-[50%] shrink-0 flex-row items-center gap-1">
          <Text className="text-sm font-bold text-primary" numberOfLines={1}>{current}</Text>
          <ChevronDown size={16} color={colors.primary} />
        </View>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ gap: 4 }}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable key={o.value} onPress={() => { setOpen(false); onChange(o.value); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
                className={'min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 hover:bg-accent-soft active:bg-accent-soft ' + (on ? 'bg-surface-tint' : '')}>
                <View className="min-w-0 flex-1">
                  <Text className={'text-[15px] text-text-primary ' + (on ? 'font-bold' : 'font-semibold')}>{o.label}</Text>
                  {o.detail ? <Text className="text-xs text-text-secondary">{o.detail}</Text> : null}
                </View>
                {on ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

export type MenuItem = { label: string; icon: LucideIcon; onPress: () => void; tone?: Tone };

/**
 * One "more" button that opens a small menu under it, for actions used now and
 * then (edit, remove). It replaces a row of icon buttons.
 */
export function MoreMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const anchor = useRef<View>(null);
  const { width } = useWindowDimensions();
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const shown = useRef(place);
  if (place) shown.current = place;
  const menu = usePresence(place !== null, 160);
  const close = (): void => setPlace(null);
  const open = (): void => anchor.current?.measureInWindow((x, y, w, h) => setPlace({ top: y + h + 6, right: Math.max(8, width - (x + w)) }));
  if (!items.length) return null;
  return (
    <>
      <View ref={anchor} collapsable={false}><IconButton icon={MoreHorizontal} label={label} onPress={open} /></View>
      <Modal visible={menu.mounted} transparent animationType="none" onRequestClose={close}>
        <Pressable accessible={false} onPress={close} style={{ flex: 1 }}>
          <Animated.View accessibilityRole="menu" style={{ position: 'absolute', top: shown.current?.top ?? 0, right: shown.current?.right ?? 0, minWidth: 196, opacity: menu.progress, transform: [{ translateY: menu.progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
            <View className="rounded-2xl border border-border bg-surface-elevated p-1">
              {items.map((item) => (
                <Pressable key={item.label} accessibilityRole="menuitem" accessibilityLabel={item.label} onPress={() => { close(); item.onPress(); }}
                  className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 hover:bg-surface-tint active:bg-surface-tint">
                  <item.icon size={18} color={toneColor[item.tone ?? 'primary']} />
                  <Text className="text-[15px] font-semibold" style={{ color: item.tone === 'out' ? toneColor.out : colors.textPrimary }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * A few mutually exclusive choices as equal buttons across the row, each with an
 * icon: the whole button is the target and the chosen one is filled blue.
 */
export function ChoiceButtons<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string; icon: LucideIcon }[]; value: T; onChange: (v: T) => void; label: string }) {
  // One connected bar drawn 40 high; the blue highlight slides to the chosen part.
  const slide = useSlidingRect(options.findIndex((o) => o.value === value));
  return (
    <View style={{ paddingHorizontal: 2 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', minHeight: TARGET, gap: 2 }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: -2, right: -2, top: BAND - 2, bottom: BAND - 2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTint }} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: BAND, height: VISUAL, borderRadius: 10, backgroundColor: colors.primary, ...slide.style }} />
        {options.map((o, i) => {
          const on = o.value === value;
          const Icon = o.icon;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} onLayout={slide.measure(i)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label}
              style={pressed({ flex: 1, minHeight: TARGET, paddingVertical: BAND })}>
              <View style={{ flex: 1, minHeight: VISUAL, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 }}>
                <Icon size={16} color={on ? colors.textOnPrimary : colors.primary} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.textOnPrimary : colors.textPrimary }} numberOfLines={1}>{o.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  // The same connected bar as the payment mode; a raised white highlight slides to the chosen part.
  const slide = useSlidingRect(options.findIndex((o) => o.value === value));
  return (
    <View style={{ paddingHorizontal: 2 }} accessibilityRole="tablist">
      <View style={{ flexDirection: 'row', minHeight: TARGET }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: -2, right: -2, top: BAND - 2, bottom: BAND - 2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTint }} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: BAND, height: VISUAL, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, ...slide.style }} />
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} onLayout={slide.measure(i)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={pressed({ flex: 1, minHeight: TARGET, paddingVertical: BAND })}>
              <View style={{ flex: 1, minHeight: VISUAL, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.primary : colors.textSecondary }}>{o.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}


// ─── Sliding selection ───────────────────────────────────────────────────────

/** True when the person has asked the device for less motion. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (live) setReduce(on); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduce;
}

/**
 * One highlight that slides to the chosen option of a row (task 214). Each option
 * reports its place with `measure(i)`; the highlight is an absolute
 * Animated.View in the same row, given `style`. It moves in 220 ms with an
 * ease-out, appears in place the first time, jumps on resize, and jumps
 * when Reduce Motion is on. `index` -1 hides it.
 */
export function useSlidingRect(index: number): { measure: (i: number) => (e: LayoutChangeEvent) => void; style: { left: Animated.Value; width: Animated.Value; opacity: number }; top: Animated.Value } {
  const reduce = useReducedMotion();
  const places = useRef<({ x: number; y: number; width: number } | undefined)[]>([]);
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const top = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
  const [ready, setReady] = useState(false);
  const jump = useCallback((to: { x: number; y: number; width: number }) => {
    left.setValue(to.x); width.setValue(to.width); top.setValue(to.y); shown.current = true; setReady(true);
  }, [left, width, top]);
  useEffect(() => {
    const to = places.current[index];
    if (!to) return;
    if (!shown.current || reduce) { jump(to); return; }
    const timing = { duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false };
    const run = Animated.parallel([Animated.timing(left, { toValue: to.x, ...timing }), Animated.timing(width, { toValue: to.width, ...timing }), Animated.timing(top, { toValue: to.y, ...timing })]);
    run.start();
    return () => run.stop();
  }, [index, reduce, jump, left, width, top]);
  const measure = useCallback((i: number) => (e: LayoutChangeEvent) => {
    const { x, y, width: w } = e.nativeEvent.layout;
    places.current[i] = { x, y, width: w };
    if (i === index) jump({ x, y, width: w });
  }, [index, jump]);
  return { measure, style: { left, width, opacity: ready && index >= 0 ? 1 : 0 }, top };
}

// ─── Smooth show, hide and change (task 215) ─────────────────────────────────

/** Opacity and transforms run on the native thread on phones; the web animates them in JS. */
const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Keeps something on screen while it fades away. `progress` runs 0 → 1 as it
 * shows and back to 0 as it hides; `mounted` stays true until the hide ends.
 * With Reduce Motion it shows and hides at once.
 */
export function usePresence(visible: boolean, duration = 200): { mounted: boolean; progress: Animated.Value } {
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    if (reduce) { progress.setValue(visible ? 1 : 0); if (!visible) setMounted(false); return; }
    const run = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: visible ? duration : Math.round(duration * 0.75), easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    run.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => run.stop();
  }, [visible, reduce, duration, progress]);
  return { mounted, progress };
}

export type EnterStyle = { opacity: Animated.Value; transform: ({ translateX: Animated.AnimatedMultiplication<number> } | { translateY: Animated.AnimatedMultiplication<number> })[] };

/**
 * A short entrance whenever `key` changes, for content that was swapped: new
 * rows rise 6 px into place as they fade in. With `axis` 'x' they slide 16 px
 * from the side moved to instead; keys compare as text, so a later month
 * ('2026-11' after '2026-10') comes in from the right. Nothing moves on the
 * first render unless `onMount`, and nothing moves with Reduce Motion.
 */
export function useEnterOnChange(key: string, axis: 'x' | 'y' = 'y', onMount = false): EnterStyle {
  const reduce = useReducedMotion();
  const distance = axis === 'x' ? 16 : 6;
  const progress = useRef(new Animated.Value(onMount ? 0 : 1)).current;
  const offset = useRef(new Animated.Value(distance)).current;
  const shift = useMemo(() => Animated.multiply(Animated.subtract(1, progress), offset), [progress, offset]);
  const last = useRef<string | null>(onMount ? null : key);
  // Before paint, so the new content never flashes in place first.
  useLayoutEffect(() => {
    if (last.current === key) return;
    const before = last.current;
    last.current = key;
    offset.setValue(axis === 'x' && before !== null && key < before ? -distance : distance);
    if (reduce) { progress.setValue(1); return; }
    progress.setValue(0);
    const run = Animated.timing(progress, { toValue: 1, duration: axis === 'x' ? 220 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [key, axis, distance, reduce, progress, offset]);
  return { opacity: progress, transform: [axis === 'x' ? { translateX: shift } : { translateY: shift }] };
}

/**
 * Opens and closes its children by growing and shrinking their height, with a
 * fade, instead of snapping. Children are mounted only while open or closing.
 * With Reduce Motion it opens and closes at once.
 */
export function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);
  const height = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(open ? 1 : 0)).current;
  const natural = useRef(0);
  const waiting = useRef(false);
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const first = useRef(true);
  const setMove = useCallback((on: boolean) => { movingRef.current = on; setMoving(on); }, []);
  const grow = useCallback(() => {
    const anim = Animated.parallel([
      Animated.timing(height, { toValue: natural.current, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(fade, { toValue: 1, duration: 180, delay: 40, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]);
    run.current = anim;
    anim.start(({ finished }) => { if (finished) setMove(false); });
  }, [height, fade, setMove]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    run.current?.stop();
    waiting.current = false;
    if (reduce) { fade.setValue(open ? 1 : 0); setMove(false); setMounted(open); return; }
    if (open) {
      // Reopened while closing: grow back from where it is.
      if (movingRef.current) { grow(); return; }
      height.setValue(0); fade.setValue(0); waiting.current = true; setMove(true); setMounted(true);
      return;
    }
    if (!movingRef.current) height.setValue(natural.current);
    setMove(true);
    const anim = Animated.parallel([
      Animated.timing(height, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: false }),
    ]);
    run.current = anim;
    anim.start(({ finished }) => { if (finished) { setMounted(false); setMove(false); } });
  }, [open, reduce, fade, height, grow, setMove]);
  useEffect(() => () => run.current?.stop(), []);
  // The content is measured at full height (laid out absolutely), then the frame grows to it.
  const onLayout = (e: LayoutChangeEvent): void => {
    natural.current = e.nativeEvent.layout.height;
    if (!waiting.current) return;
    waiting.current = false;
    grow();
  };
  if (!mounted) return null;
  return (
    <Animated.View style={moving ? { height, overflow: 'hidden' } : undefined}>
      <Animated.View onLayout={onLayout} style={[{ opacity: fade }, moving ? { position: 'absolute', top: 0, left: 0, right: 0 } : null]}>{children}</Animated.View>
    </Animated.View>
  );
}

/** A thin moving line that says "updating" without hiding what is on screen (task 216). */
export function LoadingBar({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const run = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduce || !width) return;
    run.setValue(0);
    const loop = Animated.loop(Animated.timing(run, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [active, reduce, width, run]);
  return (
    <View pointerEvents="none" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden style={{ height: 2, overflow: 'hidden', borderRadius: 1, opacity: active ? 1 : 0 }}>
      {reduce ? <View style={{ flex: 1, backgroundColor: colors.primary, opacity: 0.5 }} />
        : <Animated.View style={{ width: width * 0.3, height: 2, borderRadius: 1, backgroundColor: colors.primary, transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.3, width] }) }] }} />}
    </View>
  );
}

/**
 * A screen opened from a list slides 16 px in from the right as it fades in
 * (task 216). For the web: the phone app's own navigation already slides.
 */
export function ScreenEnter({ children }: { children: React.ReactNode }) {
  const enter = useEnterOnChange('open', 'x', true);
  return <Animated.View style={[{ flex: 1 }, enter]}>{children}</Animated.View>;
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

/**
 * `dirty`: something has been typed. A tap outside then keeps the sheet open (and says so)
 * instead of losing it; ✕ and Back still close. Untouched sheets close on a tap outside.
 */
export function Sheet({ visible, onClose, title, children, dirty = false }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; dirty?: boolean }) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const [held, setHeld] = useState(false);
  useEffect(() => { if (!visible || !dirty) setHeld(false); }, [visible, dirty]);
  return (
    // On a phone the sheet rises from the bottom edge; centred on a tablet, it fades in.
    <Modal visible={visible} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable onPress={() => (dirty ? setHeld(true) : onClose())} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: isTablet ? 'center' : 'flex-end', alignItems: 'center' }}>
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
          {held ? <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: -6, marginBottom: 8 }}>What you typed is kept. Finish, or close with ✕.</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A short confirmation at the foot of a screen that fades after a moment. */
export function Toast({ text }: { text: string | null }) {
  // Rises 10 px and fades in; fades out with the last words still showing.
  const last = useRef(text);
  if (text) last.current = text;
  const { mounted, progress } = usePresence(Boolean(text), 220);
  if (!mounted || !last.current) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}>
      <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], borderRadius: 16, backgroundColor: colors.textPrimary, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 420 }} accessibilityLiveRegion="polite">
        <Text style={{ color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' }}>{last.current}</Text>
      </Animated.View>
    </View>
  );
}
