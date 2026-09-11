/**
 * PhoneWebFrame decides whether the phone layout is centred in a fixed-width
 * column. It must be inert everywhere except a browser showing the phone
 * layout, because wrapping the tablet layout would shrink the POS grid.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Platform, Text, View } from 'react-native';
import { PhoneWebFrame, PHONE_WEB_MAX_WIDTH } from '../PhoneWebFrame';

/** Renders the frame with Platform.OS forced to `os`, then restores it. */
function renderOn(os: typeof Platform.OS, active: boolean): ReactTestRenderer {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  const created: ReactTestRenderer[] = [];
  try {
    act(() => {
      created.push(
        renderer.create(
          <PhoneWebFrame active={active}>
            <Text>Phone screen</Text>
          </PhoneWebFrame>,
        ),
      );
    });
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
  const [tree] = created;
  if (!tree) throw new Error('PhoneWebFrame rendered nothing');
  return tree;
}

/** True when some rendered View caps its width at the phone column width. */
function hasCappedColumn(tree: ReactTestRenderer): boolean {
  return tree.root.findAllByType(View).some((node) => {
    const style: unknown = node.props.style;
    return (
      typeof style === 'object' &&
      style !== null &&
      (style as { maxWidth?: number }).maxWidth === PHONE_WEB_MAX_WIDTH
    );
  });
}

describe('PhoneWebFrame', () => {
  it('caps and centres the column on the web when the phone layout is active', () => {
    expect(hasCappedColumn(renderOn('web', true))).toBe(true);
  });

  it('leaves the tablet and desktop layouts untouched on the web', () => {
    expect(hasCappedColumn(renderOn('web', false))).toBe(false);
  });

  it('does nothing on native, where the window is the device', () => {
    expect(hasCappedColumn(renderOn('ios', true))).toBe(false);
  });

  it('always renders its children', () => {
    expect(renderOn('web', true).root.findByType(Text).props.children).toBe('Phone screen');
  });
});
