import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from 'react-native';
import { AppFontProvider, Text, TextInput } from '@/components/ui/Typography';

function render(element: React.ReactElement): ReactTestRenderer {
  const trees: ReactTestRenderer[] = [];
  act(() => { trees.push(renderer.create(element)); });
  const [tree] = trees;
  if (!tree) throw new Error('Typography did not render.');
  return tree;
}

describe('Shared app typography', () => {
  const original = Platform.OS;
  beforeEach(() => Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true }));
  afterEach(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }));

  it('keeps nested text bold and preserves exact monetary styling', () => {
    const tree = render(<AppFontProvider value={true}>
      <Text style={{ fontWeight: '700' }}><Text testID="amount" style={{ fontVariant: ['tabular-nums'] }}>₹1,25,000.50</Text></Text>
    </AppFontProvider>);
    const child = tree.root.findAllByType(NativeText).find(node => node.props.testID === 'amount');
    if (!child) throw new Error('Amount text missing.');
    expect(StyleSheet.flatten(child.props.style)).toMatchObject({ fontFamily: 'SourceSans3-Bold', fontWeight: 'normal', fontVariant: ['tabular-nums'] });
    expect(child.props.children).toBe('₹1,25,000.50');
  });

  it('uses platform typography when loading fails and keeps supplied styles', () => {
    const tree = render(<AppFontProvider value={false}><Text style={{ fontWeight: '700', fontSize: 14 }}>Fallback</Text></AppFontProvider>);
    const text = tree.root.findByType(NativeText);
    const props = text.props as TextProps;
    expect(StyleSheet.flatten(props.style)).toMatchObject({ fontWeight: '700', fontSize: 14 });
    expect(StyleSheet.flatten(props.style)?.fontFamily).toBeUndefined();
  });

  it('preserves custom font styles and controlled input behavior', () => {
    const changed = jest.fn();
    const tree = render(<AppFontProvider value={true}>
      <TextInput value="12.50" onChangeText={changed} accessibilityLabel="Amount" keyboardType="decimal-pad" style={{ fontFamily: 'monospace', fontWeight: '700' }} />
    </AppFontProvider>);
    const input = tree.root.findByType(NativeTextInput);
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ fontFamily: 'monospace', fontWeight: '700' });
    expect(input.props).toMatchObject({ value: '12.50', accessibilityLabel: 'Amount', keyboardType: 'decimal-pad' });
    const props = input.props as TextInputProps;
    if (!props.onChangeText) throw new Error('Input change handler missing.');
    props.onChangeText('25.00');
    expect(changed).toHaveBeenCalledWith('25.00');
  });
});
