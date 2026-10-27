import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { colors, semantic } from '@/lib/pos/brand';
import { answerDialog, registerDialogHost, useCurrentDialog } from '@/lib/pos/dialogs';

/**
 * Task 281: the app's own confirmation and message dialog on the web, in place of the browser's
 * window.confirm and window.alert, which browsers inside other apps block without a word. Phones
 * keep their native alert, so this draws nothing there.
 */
export function DialogHost() {
  const dialog = useCurrentDialog();
  useEffect(() => (Platform.OS === 'web' ? registerDialogHost() : undefined), []);
  if (Platform.OS !== 'web' || !dialog) return null;
  const cancel = dialog.buttons.find((b) => b.kind === 'cancel');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => answerDialog(dialog.id, cancel)}>
      <Pressable onPress={() => answerDialog(dialog.id, cancel)} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable onPress={() => undefined} accessibilityRole="alert" style={{ width: '100%', maxWidth: 420, borderRadius: 22, backgroundColor: colors.surfaceElevated, padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>{dialog.title}</Text>
          {dialog.message ? <Text style={{ fontSize: 14, fontWeight: '600', lineHeight: 20, color: colors.textSecondary, marginTop: 6 }}>{dialog.message}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            {dialog.buttons.map((b) => {
              const filled = b.kind !== 'cancel';
              const tone = b.kind === 'destructive' ? semantic.danger : colors.primary;
              return (
                <Pressable key={b.label} onPress={() => answerDialog(dialog.id, b)} accessibilityRole="button" accessibilityLabel={b.label}
                  className={`min-h-[46px] flex-1 items-center justify-center rounded-xl px-4 ${filled ? 'active:opacity-80' : 'border border-border bg-surface-elevated hover:bg-surface-tint active:bg-surface-tint'}`}
                  style={filled ? { backgroundColor: tone } : undefined}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: filled ? colors.textOnPrimary : colors.textPrimary }}>{b.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
