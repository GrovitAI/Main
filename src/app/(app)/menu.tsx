import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuManagement } from '@/components/settings/MenuManagement';
import { PhoneMenuScreen } from '@/components/phone/PhoneMenuScreen';
import { useResponsive } from '@/lib/pos/useResponsive';
import {
  fetchActiveProducts,
  toggleProductAvailability,
  addProduct,
  updateProduct,
  type MenuProduct,
} from '@/lib/pos/menu-service';
import { getCategories, type Category } from '@/lib/pos/products-service';
import { fetchRecipes, type InventoryRecipe } from '@/lib/pos/inventory-service';

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();

  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [prodRes, catRes, recRes] = await Promise.all([
      fetchActiveProducts(),
      getCategories(),
      fetchRecipes(),
    ]);

    if (prodRes.data) setProducts(prodRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (recRes.data) setRecipes(recRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleAvailability = async (productId: string, currentStatus: boolean) => {
    // Optimistic UI update
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, is_available: !currentStatus } : p))
    );

    const res = await toggleProductAvailability(productId, !currentStatus);
    if (res.error) {
      // Rollback on error
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, is_available: currentStatus } : p))
      );
    }
  };

  const handleAddProduct = async (input: {
    name: string;
    price: number;
    category_id: string;
    is_available: boolean;
    inventory_tracking_enabled: boolean;
    recipe_id?: string;
  }): Promise<boolean> => {
    const res = await addProduct(input as any);
    if (res.data) {
      setProducts((prev) => [res.data as MenuProduct, ...prev]);
      return true;
    }
    return false;
  };

  const handleUpdateProduct = async (
    productId: string,
    input: {
      name: string;
      price: number;
      category_id: string;
      is_available: boolean;
      inventory_tracking_enabled: boolean;
      recipe_id?: string;
    }
  ): Promise<boolean> => {
    const res = await updateProduct(productId, input as any);
    if (res.data) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? (res.data as MenuProduct) : p))
      );
      return true;
    }
    return false;
  };

  if (isPhone) {
    return (
      <PhoneMenuScreen
        products={products}
        categories={categories}
        recipes={recipes}
        loading={loading}
        onToggleAvailability={handleToggleAvailability}
        onAddProduct={handleAddProduct}
        onUpdateProduct={handleUpdateProduct}
        onRefresh={loadData}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top }]}>
        <MenuManagement />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
  },
});
