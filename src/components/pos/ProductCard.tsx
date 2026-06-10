import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { Product } from '@/lib/pos/products-service';
import { formatCurrency } from '@/lib/pos/settlement-utils';

type ProductCardProps = {
  product: Product;
  onAdd: (product: Product) => void;
  disabled?: boolean;
  highlighted?: boolean;
};

export const ProductCard = memo(function ProductCard({
  product,
  onAdd,
  disabled = false,
  highlighted = false,
}: ProductCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onAdd(product)}
      style={({ pressed, hovered }: any) => {
        const isSelected = highlighted || hovered;
        return [
          {
            flex: 1,
            minHeight: 96,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: '#FFFFFF',
            shadowColor: isSelected ? '#0066b2' : '#101828',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isSelected ? 0.2 : 0.04,
            shadowRadius: isSelected ? 16 : 12,
            elevation: isSelected ? 3 : 1,
            borderWidth: 3,
            borderColor: isSelected ? '#0066b2' : 'transparent',
          },
          pressed && {
            transform: [{ translateY: -1.5 }],
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 18,
          }
        ];
      }}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FBFDFF']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18 }}
      />
      
      {/* Content */}
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <Text
          style={{ fontSize: 14, fontWeight: '600', lineHeight: 18, letterSpacing: -0.1, marginBottom: 4, color: '#013b8c' }}
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0066CC' }}>
            {formatCurrency(product.price)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

