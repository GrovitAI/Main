import { View, Text, Pressable, Image } from 'react-native';
import { Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 260,
          borderRadius: 28,
          padding: 18,
          backgroundColor: '#FFFFFF',
          shadowColor: '#101828',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.06,
          shadowRadius: 24,
          elevation: 3,
        },
        pressed && {
          transform: [{ translateY: -3 }],
          shadowOpacity: 0.10,
          shadowOffset: { width: 0, height: 16 },
          shadowRadius: 32,
        }
      ]}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FBFDFF']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 28 }}
      />
      
      {/* Image / Image Placeholder */}
      {product.image_url ? (
        <Image 
          source={{ uri: product.image_url }} 
          style={{ height: 135, width: '100%', resizeMode: 'contain', marginBottom: 16, borderRadius: 12 }} 
        />
      ) : (
        <View style={{ height: 135, width: '100%', backgroundColor: '#F5F8FC', marginBottom: 16, borderRadius: 16 }} />
      )}
      
      {/* Content */}
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <Text
          style={{ fontSize: 17, fontWeight: '700', lineHeight: 22, marginBottom: 8, color: '#111827' }}
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#0B5FB3' }}>
            {formatCurrency(product.price)}
          </Text>
          <View style={{ width: 48, height: 48, borderRadius: 16, shadowColor: '#0B5FB3', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 24, elevation: 4 }}>
            <LinearGradient
              colors={['#0D6CE0', '#0B59B4']}
              style={{ width: '100%', height: '100%', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus color="#FFFFFF" size={24} strokeWidth={2.5} />
            </LinearGradient>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
