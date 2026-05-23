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
    <View className="m-1 flex-1 rounded-2xl border border-border bg-background p-3">
      <Text className="text-base font-semibold text-text-primary" numberOfLines={2}>
        {product.name}
      </Text>
      <Text className="mt-1 text-sm font-medium text-primary">
        {formatCurrency(product.price)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add ${product.name}`}
        disabled={disabled}
        onPress={() => onAdd(product)}
        className="mt-3 min-h-[44px] flex-row items-center justify-center rounded-xl bg-primary"
      >
        <Plus color={colors.background} size={20} />
      </Pressable>
    </View>
  );
}
