import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Switch, Alert, Platform } from 'react-native';
import { Plus, Edit2, Archive, Check, AlertCircle, Eye, Tag, DollarSign, Filter } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { getCategories, type Category } from '@/lib/pos/products-service';
import { fetchActiveProducts, toggleProductAvailability, addProduct, updateProduct, archiveProduct, type MenuProduct } from '@/lib/pos/menu-service';

type ProductFormInput = {
  id?: string;
  name: string;
  price: string;
  category_id: string;
  is_available: boolean;
};

const initialFormInput: ProductFormInput = {
  name: '',
  price: '',
  category_id: '',
  is_available: true,
};

export function MenuManagement() {
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formInput, setFormInput] = useState<ProductFormInput>(initialFormInput);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load Categories & Products
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catsRes, prodsRes] = await Promise.all([
        getCategories(),
        fetchActiveProducts()
      ]);

      if (catsRes.error) {
        setError(catsRes.error);
      } else if (catsRes.data) {
        setCategories(catsRes.data);
      }

      if (prodsRes.error) {
        setError(prodsRes.error);
      } else if (prodsRes.data) {
        setProducts(prodsRes.data);
      }
    } catch {
      setError('Connection failure. Unable to synchronize POS menu data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // One-click availability toggle
  const handleToggleAvailability = async (product: MenuProduct) => {
    const nextStatus = !product.is_available;
    
    // Optimistic UI Update
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_available: nextStatus } : p));
    
    const res = await toggleProductAvailability(product.id, nextStatus);
    if (res.error) {
      // Rollback on database failure
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_available: product.is_available } : p));
      Alert.alert('Operation Failed', 'Unable to toggle product availability in database.');
    }
  };

  // Open Form for Adding
  const handleOpenAdd = () => {
    setFormInput({
      ...initialFormInput,
      category_id: categories.length > 0 ? categories[0].id : '',
    });
    setIsEditMode(false);
    setFormError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = (product: MenuProduct) => {
    setFormInput({
      id: product.id,
      name: product.name,
      price: String(product.price),
      category_id: product.category_id ?? (categories.length > 0 ? categories[0].id : ''),
      is_available: product.is_available ?? true,
    });
    setIsEditMode(true);
    setFormError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    // Validate inputs
    if (!formInput.name.trim()) {
      setFormError('Product name is required.');
      return;
    }
    const parsedPrice = parseFloat(formInput.price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setFormError('Please enter a valid positive price.');
      return;
    }
    if (!formInput.category_id) {
      setFormError('Please select a category.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setSuccess(null);

    const payload = {
      name: formInput.name.trim(),
      price: parsedPrice,
      category_id: formInput.category_id,
      is_available: formInput.is_available,
    };

    if (isEditMode && formInput.id) {
      const res = await updateProduct(formInput.id, payload);
      setSubmitting(false);

      if (res.error) {
        setFormError(res.error);
      } else if (res.data) {
        setSuccess('Product details saved successfully!');
        setIsModalOpen(false);
        loadData();
      }
    } else {
      const res = await addProduct(payload);
      setSubmitting(false);

      if (res.error) {
        setFormError(res.error);
      } else if (res.data) {
        setSuccess('New product added successfully!');
        setIsModalOpen(false);
        loadData();
      }
    }
  };

  // Soft Delete / Archive with confirm dialog
  const handleArchive = (product: MenuProduct) => {
    const executeArchive = async () => {
      setLoading(true);
      const res = await archiveProduct(product.id);
      if (res.error) {
        Alert.alert('Archive Failed', res.error);
      } else {
        loadData();
      }
      setLoading(false);
    };

    if (Platform.OS === 'web') {
      const confirmWeb = window.confirm(`Archive “${product.name}”?\n\nThis product will disappear from POS\nbut remain in sales history.`);
      if (confirmWeb) {
        executeArchive();
      }
    } else {
      Alert.alert(
        `Archive “${product.name}”?`,
        `This product will disappear from POS\nbut remain in sales history.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Archive', style: 'destructive', onPress: executeArchive },
        ]
      );
    }
  };

  // Filtered products list
  const filteredProducts = products.filter(p => {
    if (selectedCategoryId === 'all') return true;
    return p.category_id === selectedCategoryId;
  });

  return (
    <View className="flex-1 bg-white rounded-2xl p-5 border border-border shadow-sm">
      
      {/* Top action row */}
      <View className="flex-row items-center justify-between border-b border-border pb-4 mb-4">
        <View className="flex-row items-center gap-2">
          <Filter size={20} color={colors.primary} />
          <Text className="text-lg font-bold text-text-primary">Menu Management</Text>
        </View>

        <Pressable
          className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-primary active:opacity-90"
          style={({ pressed }) => pressed && { opacity: 0.9 }}
          onPress={handleOpenAdd}
        >
          <Plus size={18} color="white" />
          <Text className="text-white font-semibold text-sm">Add Product</Text>
        </Pressable>
      </View>

      {/* Category selector row */}
      <View className="mb-4">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: 'all', name: 'All Products' }, ...categories]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          renderItem={({ item }) => {
            const isSelected = selectedCategoryId === item.id;
            return (
              <Pressable
                onPress={() => setSelectedCategoryId(item.id)}
                className={`px-4 py-2.5 rounded-full border transition-all ${
                  isSelected ? 'bg-primary border-primary' : 'bg-slate-50 border-border active:bg-slate-100'
                }`}
                style={{ minHeight: 40 }}
              >
                <Text className={`font-semibold text-xs ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* Product List Board */}
      {loading ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View className="items-center justify-center py-10 bg-red-50 rounded-xl p-4 border border-red-200">
          <AlertCircle size={28} color="#dc2626" />
          <Text className="text-red-700 text-center font-bold mt-2 text-base">Menu Error</Text>
          <Text className="text-red-600 text-center text-sm mt-1">{error}</Text>
        </View>
      ) : filteredProducts.length === 0 ? (
        <View className="flex-1 items-center justify-center py-20 border-2 border-dashed border-border rounded-2xl">
          <Plus size={48} color={colors.textSecondary} className="opacity-40" />
          <Text className="text-text-primary font-bold text-lg mt-4 text-center">No Active Products Found</Text>
          <Text className="text-text-secondary text-sm text-center mt-2 px-6">
            There are no products listed in this category. Click "Add Product" to populate your menu.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const category = categories.find(c => c.id === item.category_id);
            return (
              <View className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 border border-borderSoft rounded-xl hover:bg-slate-100/50 transition-all">
                <View className="flex-1 mr-4">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="font-bold text-text-primary text-base select-all">{item.name}</Text>
                    {category && (
                      <View className="bg-accentSoft px-2 py-0.5 rounded-md">
                        <Text className="text-primary text-xs font-semibold">{category.name}</Text>
                      </View>
                    )}
                  </View>

                  <View className="flex-row items-center gap-3 mt-2">
                    <Text className="text-text-secondary font-bold text-sm font-mono">\u20B9{item.price}</Text>
                    <Text className={`text-xs font-semibold uppercase ${item.is_available ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {item.is_available ? 'Active Menu (ON)' : 'Sold Out (OFF)'}
                    </Text>
                  </View>
                </View>

                {/* Inline Actions */}
                <View className="flex-row items-center gap-3">
                  {/* Availability Toggle Switch */}
                  <View className="flex-row items-center gap-1.5 bg-white border border-border px-3 py-1 rounded-xl" style={{ height: 44 }}>
                    <Text className="text-xs text-text-secondary font-semibold">Available</Text>
                    <Switch
                      value={item.is_available ?? false}
                      onValueChange={() => handleToggleAvailability(item)}
                      trackColor={{ false: '#cbd5e1', true: colors.accent }}
                      thumbColor={item.is_available ? colors.primary : '#f4f3f4'}
                      style={{ transform: [{ scale: 0.8 }] }}
                    />
                  </View>

                  {/* Edit action */}
                  <Pressable
                    className="p-2.5 bg-white border border-border rounded-xl active:bg-slate-100 items-center justify-center"
                    style={{ width: 44, height: 44 }}
                    onPress={() => handleOpenEdit(item)}
                  >
                    <Edit2 size={16} color={colors.textPrimary} />
                  </Pressable>

                  {/* Archive Soft-Delete action */}
                  <Pressable
                    className="p-2.5 bg-red-50 border border-red-100 rounded-xl active:bg-red-100 items-center justify-center"
                    style={{ width: 44, height: 44 }}
                    onPress={() => handleArchive(item)}
                  >
                    <Archive size={16} color="#dc2626" />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Slide-out/Form Panel Overlay */}
      {isModalOpen && (
        <View className="absolute inset-0 bg-overlay flex-1 items-center justify-center p-6 rounded-2xl">
          <View className="bg-white w-full max-w-lg rounded-2xl border border-border shadow-panel p-6 justify-between" style={{ minHeight: 400 }}>
            
            <View>
              {/* Form title */}
              <View className="flex-row items-center gap-2 border-b border-border pb-3 mb-5">
                <Tag size={20} color={colors.primary} />
                <Text className="text-lg font-bold text-text-primary">
                  {isEditMode ? 'Modify Product Specifications' : 'Create New Menu Product'}
                </Text>
              </View>

              {formError && (
                <View className="flex-row items-center gap-3 bg-red-50 p-4 border border-red-200 rounded-xl mb-4">
                  <AlertCircle size={20} color="#dc2626" />
                  <Text className="text-red-700 font-medium flex-1 text-sm">{formError}</Text>
                </View>
              )}

              {/* Form Input Grid */}
              <View className="flex-row flex-wrap -mx-2">
                {/* Product Name */}
                <View className="w-full px-2 mb-4">
                  <Text className="text-sm font-semibold text-text-primary mb-2">Product Name</Text>
                  <TextInput
                    value={formInput.name}
                    onChangeText={(text) => setFormInput(prev => ({ ...prev, name: text }))}
                    placeholder="e.g. UFO Chocolate Burger"
                    placeholderTextColor="#94a3b8"
                    className="border border-border rounded-xl px-4 py-3 text-text-primary bg-slate-50 focus:bg-white text-base"
                    style={{ minHeight: 44 }}
                  />
                </View>

                {/* Price */}
                <View className="w-full md:w-1/2 px-2 mb-4">
                  <Text className="text-sm font-semibold text-text-primary mb-2">Pricing (\u20B9)</Text>
                  <TextInput
                    value={formInput.price}
                    onChangeText={(text) => setFormInput(prev => ({ ...prev, price: text }))}
                    placeholder="e.g. 290"
                    placeholderTextColor="#94a3b8"
                    className="border border-border rounded-xl px-4 py-3 text-text-primary bg-slate-50 focus:bg-white text-base font-mono"
                    style={{ minHeight: 44 }}
                    keyboardType="numeric"
                  />
                </View>

                {/* Available switches inside form */}
                <View className="w-full md:w-1/2 px-2 mb-4 justify-center">
                  <View className="flex-row items-center gap-3 bg-slate-50 border border-border p-3 rounded-xl h-11">
                    <Switch
                      value={formInput.is_available}
                      onValueChange={(val) => setFormInput(prev => ({ ...prev, is_available: val }))}
                      trackColor={{ false: '#cbd5e1', true: colors.accent }}
                      thumbColor={formInput.is_available ? colors.primary : '#f4f3f4'}
                      style={{ transform: [{ scale: 0.8 }] }}
                    />
                    <Text className="text-sm font-semibold text-text-primary">Instant Availability ON</Text>
                  </View>
                </View>

                {/* Category Selection Grid (Premium and touch-compliant) */}
                <View className="w-full px-2 mb-4">
                  <Text className="text-sm font-semibold text-text-primary mb-2">Category Assignment</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {categories.map((cat) => {
                      const isSelected = formInput.category_id === cat.id;
                      return (
                        <Pressable
                          key={cat.id}
                          className={`px-4 py-2.5 border rounded-xl items-center justify-center ${
                            isSelected ? 'bg-primary border-primary' : 'bg-slate-50 border-border active:bg-slate-100'
                          }`}
                          style={{ minHeight: 44 }}
                          onPress={() => setFormInput(prev => ({ ...prev, category_id: cat.id }))}
                        >
                          <Text className={`font-semibold text-xs ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                            {cat.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>

            {/* Footer Buttons */}
            <View className="flex-row gap-4 border-t border-border pt-4 mt-4 justify-end">
              <Pressable
                className="px-6 rounded-xl border border-border bg-white active:bg-slate-50 items-center justify-center"
                style={{ height: 44 }}
                onPress={() => setIsModalOpen(false)}
                disabled={submitting}
              >
                <Text className="font-bold text-text-secondary text-sm">Cancel</Text>
              </Pressable>

              <Pressable
                className="px-8 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-2"
                style={{ height: 44 }}
                onPress={handleSave}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="font-bold text-white text-sm">Save Product</Text>
                )}
              </Pressable>
            </View>

          </View>
        </View>
      )}

    </View>
  );
}
