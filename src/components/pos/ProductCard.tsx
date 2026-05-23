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
      className="m-1 flex-1 overflow-hidden rounded-xl border border-border-soft bg-surface-elevated shadow-card active:opacity-80"
    >
      <View className="h-[3px] bg-primary-light" />
      <View className="px-2.5 pb-2.5 pt-2">
        <Text
          className="text-sm font-bold leading-tight text-text-primary"
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <View className="mt-1.5 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-primary-mid">
            {formatCurrency(product.price)}
          </Text>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary-mid">
            <Plus color={colors.textOnPrimary} size={14} strokeWidth={2.5} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
