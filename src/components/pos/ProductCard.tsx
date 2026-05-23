import { View, Text, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
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
      className="m-1.5 flex-1 overflow-hidden rounded-2xl border border-border-soft bg-surface-elevated shadow-card active:opacity-90"
    >
      <View className="p-4">
        <Text
          className="text-lg font-bold leading-tight text-text-primary"
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <Text className="mt-2 text-base font-semibold text-primary-mid">
          {formatCurrency(product.price)}
        </Text>

        <View className="mt-4 overflow-hidden rounded-2xl">
          <BrandedGradient variant="primarySoft" className="min-h-[48px] items-center justify-center">
            <View className="min-h-[48px] flex-row items-center justify-center gap-2 px-4">
              <Plus color={colors.textOnPrimary} size={22} strokeWidth={2.5} />
              <Text className="text-sm font-bold text-text-on-primary">Add</Text>
            </View>
          </BrandedGradient>
        </View>
      </View>
    </Pressable>
  );
}
