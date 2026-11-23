import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrInk } from '@/lib/pos/brand';
import { qrSvgPath } from '@/lib/pos/qr-table-utils';

/** A QR code for `value`, black on white with the quiet border a scanner needs. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const { size: modules, d } = useMemo(() => qrSvgPath(value), [value]);
  const edge = modules + 8;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="QR code">
      <Svg width={size} height={size} viewBox={`-4 -4 ${edge} ${edge}`}>
        <Rect x={-4} y={-4} width={edge} height={edge} fill={qrInk.light} />
        <Path d={d} fill={qrInk.dark} />
      </Svg>
    </View>
  );
}
