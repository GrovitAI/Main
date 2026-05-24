import { View, Text, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import type { Product } from '@/lib/pos/products-service';
import { formatCurrency } from '@/lib/pos/settlement-utils';

type ProductCardProps = {
  product: Product;
  onAdd: (product: Product) => void;
  disabled?: boolean;
};

export function ProductCard({ product, onAdd, disabled = false }: ProductCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onAdd(product)}
      className="m-1.5 flex-1 overflow-hidden rounded-2xl border border-border-soft bg-surface-elevated shadow-card active:opacity-80 min-h-[120px]"
    >
      {/* Image Placeholder (30-35% height) */}
      <View className="h-[36px] w-full bg-surface-tint" />
      
      {/* Content */}
      <View className="flex-1 justify-between px-2.5 pb-2 pt-1.5">
        <Text
          className="text-[13px] font-bold leading-tight text-text-primary"
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <View className="mt-1 flex-row items-end justify-between">
          <Text className="text-[11px] font-semibold text-primary-mid">
            {formatCurrency(product.price)}
          </Text>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary-mid shadow-sm">
            <Plus color={colors.textOnPrimary} size={14} strokeWidth={2.5} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
