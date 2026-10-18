import { Pressable } from 'react-native';
import { Text } from '@/components/ui/Typography';

/** Solid states keep compact actions readable without fading the whole control. */
export function AttendanceAction({ label, accessibilityLabel = label, onPress, disabled = false, primary = false }: {
  label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  const filled = primary && !disabled;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    className={'min-h-12 min-w-12 flex-row items-center justify-center rounded-lg border px-3 py-2 ' +
      (filled ? 'border-primary bg-primary hover:bg-primary-deep active:bg-primary-deep focus-visible:border-primary-deep' :
        'border-border bg-surface-tint ' + (disabled ? '' : 'hover:bg-accent-soft active:bg-accent-soft focus-visible:border-primary'))}>
    <Text className={'text-sm font-semibold leading-5 ' + (filled ? 'text-text-on-primary' : 'text-text-secondary')}>{label}</Text>
  </Pressable>;
}
