import React from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { PrimaryButton } from './ui';

/** A row while picking: its tick beside it; an entry this login cannot change shows no tick. */
export function PickRow({ on, allowed, onToggle, children }: { on: boolean; allowed: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <View className="flex-row items-center gap-1">
    <Pressable disabled={!allowed} onPress={onToggle} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on, disabled: !allowed }} accessibilityLabel={on ? 'Selected' : 'Select'} className={'h-11 w-9 items-center justify-center rounded-lg ' + (on || !allowed ? '' : 'hover:bg-surface-tint')}>
      {allowed ? <View className="h-[22px] w-[22px] items-center justify-center rounded-full border" style={{ borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surfaceElevated }}>{on ? <Check size={14} color={colors.textOnPrimary} /> : null}</View> : null}
    </Pressable>
    <View className="min-w-0 flex-1" style={{ opacity: allowed ? 1 : 0.5 }}>{children}</View>
  </View>;
}

/** The foot of a list while picking: how many are picked, and Delete. */
export function PickBar({ count, onDelete }: { count: number; onDelete: () => void }) {
  return <View className="flex-row items-center gap-3">
    <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 text-sm font-bold text-text-primary">{count ? `${count} selected` : 'Select entries'}</Text>
    <View className="flex-1"><PrimaryButton label={count ? `Delete ${count}` : 'Delete'} tone="out" disabled={count === 0} reason={count === 0 ? 'Select an entry' : undefined} onPress={onDelete} /></View>
  </View>;
}
