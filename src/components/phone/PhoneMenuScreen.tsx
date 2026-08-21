import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  TextInput,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Search,
  Plus,
  Pencil,
  X,
  Check,
  Tag,
  Layers,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';
import type { MenuProduct } from '@/lib/pos/menu-service';
import type { Category } from '@/lib/pos/products-service';
import type { InventoryRecipe } from '@/lib/pos/inventory-service';

export type PhoneMenuScreenProps = {
  products: MenuProduct[];
  categories: Category[];
  recipes: InventoryRecipe[];
  loading: boolean;
  onToggleAvailability: (productId: string, currentStatus: boolean) => Promise<void>;
  onAddProduct: (input: {
    name: string;
    price: number;
    category_id: string;
    is_available: boolean;
    inventory_tracking_enabled: boolean;
    recipe_id?: string;
  }) => Promise<boolean>;
  onUpdateProduct: (
    productId: string,
    input: {
      name: string;
      price: number;
      category_id: string;
      is_available: boolean;
      inventory_tracking_enabled: boolean;
      recipe_id?: string;
    }
  ) => Promise<boolean>;
  onRefresh: () => void;
};

type FilterAvailability = 'all' | 'available' | 'unavailable';

export function PhoneMenuScreen({
  products,
  categories,
  recipes,
  loading,
  onToggleAvailability,
  onAddProduct,
  onUpdateProduct,
  onRefresh,
}: PhoneMenuScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<FilterAvailability>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MenuProduct | null>(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formIsAvailable, setFormIsAvailable] = useState(true);
  const [formTrackInventory, setFormTrackInventory] = useState(false);
  const [formRecipeId, setFormRecipeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    products.forEach((p) => {
      const catId = p.category_id || 'uncategorized';
      counts[catId] = (counts[catId] || 0) + 1;
    });
    return counts;
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesCat = categories
          .find((c) => c.id === p.category_id)
          ?.name.toLowerCase()
          .includes(q);
        if (!matchesName && !matchesCat) return false;
      }

      // Category
      if (selectedCategory !== 'all' && p.category_id !== selectedCategory) {
        return false;
      }

      // Availability
      if (availabilityFilter === 'available' && !p.is_available) return false;
      if (availabilityFilter === 'unavailable' && p.is_available) return false;

      return true;
    });
  }, [products, searchQuery, selectedCategory, availabilityFilter, categories]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormPrice('');
    setFormCategoryId(categories[0]?.id || '');
    setFormIsAvailable(true);
    setFormTrackInventory(false);
    setFormRecipeId('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (prod: MenuProduct) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormPrice(String(prod.price));
    setFormCategoryId(prod.category_id || categories[0]?.id || '');
    setFormIsAvailable(prod.is_available ?? true);
    setFormTrackInventory(!!prod.inventory_tracking_enabled);
    setFormRecipeId(prod.recipe_id || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('Product name is required');
      return;
    }
    const numPrice = parseFloat(formPrice);
    if (isNaN(numPrice) || numPrice < 0) {
      setFormError('Valid price is required');
      return;
    }
    if (!formCategoryId) {
      setFormError('Please select a category');
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: formName.trim(),
      price: numPrice,
      category_id: formCategoryId,
      is_available: formIsAvailable,
      inventory_tracking_enabled: formTrackInventory,
      recipe_id: formRecipeId || undefined,
    };

    let success = false;
    if (editingProduct) {
      success = await onUpdateProduct(editingProduct.id, payload);
    } else {
      success = await onAddProduct(payload);
    }

    setSaving(false);
    if (success) {
      setIsModalOpen(false);
    } else {
      setFormError('Failed to save product. Check for duplicate name.');
    }
  };

  const formatCurrency = (val: number) => {
    return `₹${val.toFixed(2)}`;
  };

  const renderProductItem = ({ item }: { item: MenuProduct }) => {
    const catName = categories.find((c) => c.id === item.category_id)?.name || 'General';
    const recipe = recipes.find((r) => r.id === item.recipe_id);

    return (
      <View className="bg-white rounded-2xl p-4 mb-3 border border-[#E2E8F0] shadow-sm">
        {/* Top Info */}
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-[#0F2744]" numberOfLines={2}>
              {item.name}
            </Text>
            <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
              <View className="bg-slate-100 px-2 py-0.5 rounded-md">
                <Text className="text-[11px] font-semibold text-slate-700">{catName}</Text>
              </View>
              {item.inventory_tracking_enabled && (
                <View className="bg-emerald-50 px-2 py-0.5 rounded-md flex-row items-center gap-1 border border-emerald-100">
                  <Layers size={10} color="#059669" />
                  <Text className="text-[10px] font-bold text-emerald-700">
                    {recipe?.name || 'Recipe Linked'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text className="text-base font-extrabold text-[#0066B2]">
            {formatCurrency(item.price)}
          </Text>
        </View>

        {/* Action Row */}
        <View className="flex-row items-center justify-between pt-3 border-t border-slate-100 mt-2">
          {/* Availability Toggle */}
          <View className="flex-row items-center gap-2">
            <Switch
              value={!!item.is_available}
              onValueChange={() => onToggleAvailability(item.id, !!item.is_available)}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={item.is_available ? '#0066B2' : '#F1F5F9'}
            />
            <Text
              className={`text-xs font-bold ${
                item.is_available ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {item.is_available ? 'Available' : 'Hidden'}
            </Text>
          </View>

          {/* Edit Button */}
          <Pressable
            onPress={() => openEditModal(item)}
            className="flex-row items-center gap-1.5 px-3 py-1.5 bg-slate-50 active:bg-slate-100 rounded-xl border border-slate-200"
          >
            <Pencil size={13} color="#475569" />
            <Text className="text-xs font-bold text-[#475569]">Edit</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Header */}
      <PhoneScreenHeader
        title="Menu Catalog"
        subtitle={`${products.length} Dishes · ${categories.length} Categories`}
        rightContent={
          <Pressable
            onPress={openAddModal}
            className="flex-row items-center gap-1.5 bg-[#0066B2] px-3.5 py-2 rounded-xl shadow-sm active:bg-[#004B87]"
          >
            <Plus size={16} color="#FFFFFF" />
            <Text className="text-xs font-bold text-white">Add Item</Text>
          </Pressable>
        }
      />

      {/* Search & Category Filter Section */}
      <View className="bg-white border-b border-[#E2E8F0] pt-2 pb-3 px-4">
        {/* Search Input */}
        <View className="flex-row items-center bg-[#F1F5F9] rounded-xl px-3 h-10 border border-[#E2E8F0] mb-2.5">
          <Search size={16} color="#64748B" />
          <TextInput
            className="flex-1 ml-2 text-sm text-[#0F2744]"
            placeholder="Search dish or category..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <X size={16} color="#64748B" />
            </Pressable>
          ) : null}
        </View>

        {/* Category Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <Pressable
            onPress={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-full mr-2 min-h-[34px] items-center justify-center ${
              selectedCategory === 'all'
                ? 'bg-[#002D5A] shadow-sm'
                : 'bg-[#F1F5F9] border border-[#E2E8F0]'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                selectedCategory === 'all' ? 'text-white' : 'text-[#475569]'
              }`}
            >
              All ({categoryCounts['all'] || 0})
            </Text>
          </Pressable>

          {categories.map((cat) => {
            const isSel = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full mr-2 min-h-[34px] items-center justify-center ${
                  isSel ? 'bg-[#002D5A] shadow-sm' : 'bg-[#F1F5F9] border border-[#E2E8F0]'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSel ? 'text-white' : 'text-[#475569]'
                  }`}
                >
                  {cat.name} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Product List */}
      {loading ? (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator size="large" color="#0066B2" />
          <Text className="text-sm font-semibold text-slate-500 mt-3">Loading menu items...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-12 items-center justify-center">
              <Text className="text-base font-bold text-[#0F2744]">No menu items found</Text>
              <Text className="text-xs text-slate-400 mt-1 text-center">
                Try searching for another dish or clear category filters
              </Text>
            </View>
          }
        />
      )}

      {/* ADD / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <Modal
          visible={isModalOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIsModalOpen(false)}
        >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl p-5 border-t border-[#E2E8F0] max-h-[88%]">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <Text className="text-lg font-bold text-[#0F2744]">
                {editingProduct ? 'Edit Menu Item' : 'Add New Menu Item'}
              </Text>
              <Pressable
                onPress={() => setIsModalOpen(false)}
                className="w-9 h-9 items-center justify-center rounded-full bg-slate-100"
              >
                <X size={20} color="#0F2744" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="space-y-4 gap-4">
              {formError && (
                <View className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
                  <Text className="text-xs font-bold text-rose-700">{formError}</Text>
                </View>
              )}

              {/* Dish Name */}
              <View>
                <Text className="text-xs font-bold text-[#475569] mb-1.5">Dish Name *</Text>
                <TextInput
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 h-12 text-sm text-[#0F2744] font-medium"
                  placeholder="e.g. 3 In 1 Qashtuta"
                  placeholderTextColor="#94A3B8"
                  value={formName}
                  onChangeText={setFormName}
                />
              </View>

              {/* Selling Price */}
              <View>
                <Text className="text-xs font-bold text-[#475569] mb-1.5">Selling Price (₹) *</Text>
                <TextInput
                  className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3.5 h-12 text-sm text-[#0F2744] font-medium"
                  placeholder="349.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={formPrice}
                  onChangeText={setFormPrice}
                />
              </View>

              {/* Category Picker */}
              <View>
                <Text className="text-xs font-bold text-[#475569] mb-1.5">Category *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  {categories.map((c) => {
                    const isSel = formCategoryId === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setFormCategoryId(c.id)}
                        className={`px-4 py-2 rounded-xl mr-2 border ${
                          isSel
                            ? 'bg-[#0066B2] border-[#0066B2]'
                            : 'bg-[#F8FAFC] border-[#E2E8F0]'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSel ? 'text-white' : 'text-[#475569]'
                          }`}
                        >
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Inventory Recipe Tracking */}
              <View className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2">
                    <Layers size={16} color="#0066B2" />
                    <Text className="text-xs font-bold text-[#0F2744]">
                      Track Inventory Recipe
                    </Text>
                  </View>
                  <Switch
                    value={formTrackInventory}
                    onValueChange={setFormTrackInventory}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={formTrackInventory ? '#0066B2' : '#F1F5F9'}
                  />
                </View>

                {formTrackInventory && (
                  <View className="mt-2 pt-2 border-t border-slate-200">
                    <Text className="text-[11px] font-bold text-slate-500 mb-1.5">
                      Link Production Recipe
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                      {recipes.map((r) => {
                        const isSel = formRecipeId === r.id;
                        return (
                          <Pressable
                            key={r.id}
                            onPress={() => setFormRecipeId(r.id)}
                            className={`px-3 py-1.5 rounded-lg mr-2 border ${
                              isSel
                                ? 'bg-emerald-600 border-emerald-600'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <Text
                              className={`text-[11px] font-bold ${
                                isSel ? 'text-white' : 'text-slate-600'
                              }`}
                            >
                              {r.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Available for Billing Switch */}
              <View className="flex-row items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <Text className="text-xs font-bold text-[#0F2744]">
                  Active for POS Billing
                </Text>
                <Switch
                  value={formIsAvailable}
                  onValueChange={setFormIsAvailable}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={formIsAvailable ? '#0066B2' : '#F1F5F9'}
                />
              </View>

              {/* Save / Cancel Buttons */}
              <View className="flex-row gap-3 pt-3">
                <Pressable
                  onPress={() => setIsModalOpen(false)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-100 items-center justify-center active:bg-slate-200"
                >
                  <Text className="text-sm font-bold text-[#475569]">Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-xl bg-[#0066B2] items-center justify-center shadow-sm active:bg-[#004B87]"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-sm font-bold text-white">Save Item</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}
    </View>
  );
}
