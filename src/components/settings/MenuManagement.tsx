import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Switch, Alert, Platform } from 'react-native';
import { Plus, Edit2, Archive, Check, AlertCircle, Tag, Filter, Search, X, ArrowUpDown, ShieldAlert, Sparkles, SlidersHorizontal, Layers, ChevronRight } from 'lucide-react-native';
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

type SortOption = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'status-on' | 'status-off';

export function MenuManagement() {
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Inline Quick Price Editing state
  const [inlinePriceId, setInlinePriceId] = useState<string | null>(null);
  const [inlinePriceValue, setInlinePriceValue] = useState('');

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

  // One-click availability toggle with optimistic update & rollback
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

  // Mass Toggle Category Availability Action (ON/OFF)
  const handleMassToggleCategory = async (targetStatus: boolean) => {
    const targetCategoryName = selectedCategoryId === 'all' 
      ? 'All Products' 
      : categories.find(c => c.id === selectedCategoryId)?.name ?? 'Selected';
    
    const triggerMassToggle = async () => {
      setLoading(true);
      
      const categoryProducts = products.filter(p => {
        if (selectedCategoryId === 'all') return true;
        return p.category_id === selectedCategoryId;
      });

      try {
        const updatePromises = categoryProducts.map(p => 
          toggleProductAvailability(p.id, targetStatus)
        );
        
        await Promise.all(updatePromises);
        await loadData();
        
        setSuccess(`Successfully turned ${targetStatus ? 'ON' : 'OFF'} all products in ${targetCategoryName}.`);
        setTimeout(() => setSuccess(null), 4000);
      } catch {
        Alert.alert('Mass Action Failed', 'Some products failed to update.');
        await loadData();
      } finally {
        setLoading(false);
      }
    };

    Alert.alert(
      `Turn ${targetStatus ? 'ON' : 'OFF'} Category?`,
      `Are you sure you want to set all active items in "${targetCategoryName}" as ${targetStatus ? 'Available' : 'Sold Out'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Proceed', style: 'default', onPress: triggerMassToggle }
      ]
    );
  };

  // Inline Quick Price Save
  const handleQuickPriceSave = async (product: MenuProduct) => {
    const parsedPrice = parseFloat(inlinePriceValue);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      Alert.alert('Invalid Pricing', 'Please enter a valid positive price.');
      return;
    }

    const previousPrice = product.price;
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, price: parsedPrice } : p));
    setInlinePriceId(null);

    const payload = {
      name: product.name,
      price: parsedPrice,
      category_id: product.category_id ?? '',
      is_available: product.is_available ?? true,
    };

    const res = await updateProduct(product.id, payload);
    if (res.error) {
      // Rollback
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, price: previousPrice } : p));
      Alert.alert('Pricing Update Failed', res.error);
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

  // Soft Delete / Archive with touch-safe warning
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

  // Dynamic Category color-coding maps
  const getCategoryColorSchema = (catId: string) => {
    const defaultSchema = { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' };
    if (!catId) return defaultSchema;
    
    // Hash category name / id to get a consistent colorful pastel schema
    const index = catId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
    const schemas = [
      { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' }, // Mint / Green
      { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' }, // Rose / Pink
      { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' }, // Gold / Orange
      { bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700' }, // Lavender / Purple
      { bg: 'bg-cyan-50 border-cyan-200', text: 'text-cyan-700' }, // Sky / Cyan
    ];
    return schemas[index] ?? defaultSchema;
  };

  // Filter & Sort Logic
  const filteredAndSortedProducts = products
    .filter(p => {
      const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'status-on':
          return (b.is_available ? 1 : 0) - (a.is_available ? 1 : 0);
        case 'status-off':
          return (a.is_available ? 1 : 0) - (b.is_available ? 1 : 0);
        case 'name-asc':
        default:
          return a.name.localeCompare(b.name);
      }
    });

  // Analytics helper metrics
  const totalCount = products.length;
  const activeCount = products.filter(p => p.is_available).length;
  const soldOutCount = totalCount - activeCount;

  return (
    <View className="flex-1 bg-surface-tint p-2 md:p-4 rounded-3xl">
      
      {/* 📊 Control Room Summary Cards */}
      <View className="flex-row gap-4 mb-5 flex-wrap">
        {/* Total Products */}
        <View className="flex-1 min-w-[150px] bg-white p-4 rounded-2xl border border-border shadow-sm flex-row items-center justify-between">
          <View>
            <Text className="text-text-secondary font-bold text-xs uppercase tracking-wider">Total Menu Items</Text>
            <Text className="text-2xl font-black text-text-primary mt-1">{totalCount}</Text>
          </View>
          <View className="p-3 bg-blue-50 rounded-xl">
            <Tag size={20} color={colors.primary} />
          </View>
        </View>

        {/* Active Products */}
        <View className="flex-1 min-w-[150px] bg-white p-4 rounded-2xl border border-border shadow-sm flex-row items-center justify-between">
          <View>
            <Text className="text-text-secondary font-bold text-xs uppercase tracking-wider">Active on POS</Text>
            <Text className="text-2xl font-black text-emerald-600 mt-1">{activeCount}</Text>
          </View>
          <View className="p-3 bg-emerald-50 rounded-xl">
            <Check size={20} color="#059669" />
          </View>
        </View>

        {/* Sold-out Products */}
        <View className="flex-1 min-w-[150px] bg-white p-4 rounded-2xl border border-border shadow-sm flex-row items-center justify-between">
          <View>
            <Text className="text-text-secondary font-bold text-xs uppercase tracking-wider">Sold Out (OFF)</Text>
            <Text className="text-2xl font-black text-amber-500 mt-1">{soldOutCount}</Text>
          </View>
          <View className="p-3 bg-amber-50 rounded-xl">
            <AlertCircle size={20} color="#d97706" />
          </View>
        </View>
      </View>

      {/* Main Board Card wrapper */}
      <View className="flex-1 bg-white rounded-2xl p-5 border border-border shadow-sm">
        
        {/* Top Header Action Row */}
        <View className="flex-row items-center justify-between border-b border-border pb-4 mb-4 flex-wrap gap-3">
          <View className="flex-row items-center gap-2">
            <Layers size={22} color={colors.primary} />
            <View>
              <Text className="text-lg font-black text-text-primary">Interactive Menu Board</Text>
              <Text className="text-xs text-text-secondary mt-0.5">Customize, sort, search and adjust pricing instantly</Text>
            </View>
          </View>

          <Pressable
            className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-primary active:opacity-90 shadow-sm"
            style={({ pressed }) => pressed && { opacity: 0.9 }}
            onPress={handleOpenAdd}
          >
            <Plus size={18} color="white" />
            <Text className="text-white font-semibold text-sm">Add New Product</Text>
          </Pressable>
        </View>

        {/* 🔍 Search, Filter and Sort Row */}
        <View className="flex-col md:flex-row gap-3 mb-4 items-stretch md:items-center">
          {/* Search Input Box */}
          <View className="flex-1 flex-row items-center bg-slate-50 border border-border rounded-xl px-3" style={{ height: 44 }}>
            <Search size={16} color={colors.textSecondary} className="mr-2" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search items by name..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-text-primary text-sm font-semibold h-full"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} className="p-1">
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Sort Controls & Sorting Dropdown Trigger */}
          <View className="flex-row gap-2 relative">
            <Pressable
              onPress={() => setShowSortDropdown(!showSortDropdown)}
              className="flex-row items-center gap-2 px-4 rounded-xl border border-border bg-slate-50 active:bg-slate-100"
              style={{ height: 44 }}
            >
              <ArrowUpDown size={14} color={colors.textSecondary} />
              <Text className="text-text-primary text-xs font-bold">
                Sort: {
                  sortBy === 'name-asc' ? 'A-Z' :
                  sortBy === 'name-desc' ? 'Z-A' :
                  sortBy === 'price-asc' ? 'Price: Low-High' :
                  sortBy === 'price-desc' ? 'Price: High-Low' :
                  sortBy === 'status-on' ? 'Available First' : 'Sold Out First'
                }
              </Text>
            </Pressable>

            {/* Dropdown Menu Portal fallback */}
            {showSortDropdown && (
              <View className="absolute right-0 top-12 z-50 bg-white border border-border shadow-lg rounded-xl p-2 w-[180px]">
                {[
                  { value: 'name-asc', label: 'Name: A to Z' },
                  { value: 'name-desc', label: 'Name: Z to A' },
                  { value: 'price-asc', label: 'Price: Low to High' },
                  { value: 'price-desc', label: 'Price: High to Low' },
                  { value: 'status-on', label: 'Available First' },
                  { value: 'status-off', label: 'Sold Out First' },
                ].map((opt) => {
                  const isSelected = sortBy === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        setSortBy(opt.value as SortOption);
                        setShowSortDropdown(false);
                      }}
                      className={`p-2 rounded-lg ${isSelected ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                    >
                      <Text className={`text-xs font-semibold ${isSelected ? 'text-primary font-bold' : 'text-text-primary'}`}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* 🏷️ Horizontal Category Selector Navigation with Mass Actions */}
        <View className="flex-row items-center justify-between mb-4 border-b border-slate-100 pb-3 flex-wrap gap-2">
          <View className="flex-1 mr-2">
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[{ id: 'all', name: 'All Products' }, ...categories]}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => {
                const isSelected = selectedCategoryId === item.id;
                return (
                  <Pressable
                    onPress={() => setSelectedCategoryId(item.id)}
                    className={`px-4 py-2 rounded-full border transition-all ${
                      isSelected ? 'bg-primary border-primary' : 'bg-slate-50 border-border active:bg-slate-100'
                    }`}
                    style={{ minHeight: 36, justifyContent: 'center' }}
                  >
                    <Text className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>

          {/* Quick Mass Actions Bar */}
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => handleMassToggleCategory(true)}
              className="bg-emerald-50 border border-emerald-100 px-3 rounded-lg active:bg-emerald-100 flex-row items-center gap-1.5"
              style={{ height: 36 }}
            >
              <Sparkles size={12} color="#059669" />
              <Text className="text-emerald-700 font-bold text-xs">Category ON</Text>
            </Pressable>

            <Pressable
              onPress={() => handleMassToggleCategory(false)}
              className="bg-amber-50 border border-amber-100 px-3 rounded-lg active:bg-amber-100 flex-row items-center gap-1.5"
              style={{ height: 36 }}
            >
              <ShieldAlert size={12} color="#d97706" />
              <Text className="text-amber-700 font-bold text-xs">Category OFF</Text>
            </Pressable>
          </View>
        </View>

        {success && (
          <View className="flex-row items-center gap-2 bg-green-50 p-3 border border-green-200 rounded-xl mb-4">
            <Check size={16} color="#15803d" />
            <Text className="text-green-700 font-bold text-xs flex-1">{success}</Text>
          </View>
        )}

        {/* 🍽️ Product Cards Table Board */}
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
        ) : filteredAndSortedProducts.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20 border-2 border-dashed border-border rounded-2xl">
            <Plus size={48} color={colors.textSecondary} className="opacity-40" />
            <Text className="text-text-primary font-bold text-lg mt-4 text-center">No Products Discovered</Text>
            <Text className="text-text-secondary text-sm text-center mt-2 px-6">
              No active products match your category selection or search keywords. Click "Add New Product" to customize.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredAndSortedProducts}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const category = categories.find(c => c.id === item.category_id);
              const colorSchema = getCategoryColorSchema(item.category_id ?? '');
              const isInlineEditingPrice = inlinePriceId === item.id;

              return (
                <View className="flex-row items-center justify-between p-4 mb-3 bg-slate-50/70 border border-borderSoft rounded-2xl hover:bg-slate-100/50 transition-all">
                  
                  {/* Left Side Info */}
                  <View className="flex-1 mr-4">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="font-bold text-text-primary text-base select-all">{item.name}</Text>
                      {category && (
                        <View className={`px-2 py-0.5 rounded-lg border ${colorSchema.bg}`}>
                          <Text className={`text-xs font-extrabold ${colorSchema.text}`}>{category.name}</Text>
                        </View>
                      )}
                    </View>

                    {/* Inline Price adjustment or display */}
                    <View className="flex-row items-center gap-3 mt-2 flex-wrap">
                      {isInlineEditingPrice ? (
                        <View className="flex-row items-center gap-2 bg-white border border-border rounded-xl px-2 py-0.5" style={{ height: 36 }}>
                          <Text className="text-text-secondary text-xs font-extrabold">₹</Text>
                          <TextInput
                            value={inlinePriceValue}
                            onChangeText={setInlinePriceValue}
                            className="w-16 h-full text-text-primary text-xs font-black font-mono"
                            keyboardType="numeric"
                            autoFocus
                            placeholder="Price"
                          />
                          <Pressable
                            onPress={() => handleQuickPriceSave(item)}
                            className="bg-emerald-100 p-1 rounded-md"
                          >
                            <Check size={12} color="#059669" />
                          </Pressable>
                          <Pressable
                            onPress={() => setInlinePriceId(null)}
                            className="bg-slate-100 p-1 rounded-md"
                          >
                            <X size={12} color="#475569" />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => {
                            setInlinePriceId(item.id);
                            setInlinePriceValue(String(item.price));
                          }}
                          className="flex-row items-center gap-1 bg-white border border-borderSoft px-2.5 py-1 rounded-xl shadow-xs hover:bg-slate-100"
                        >
                          <Text className="text-xs text-text-secondary font-semibold">Price:</Text>
                          <Text className="text-primary font-black text-xs font-mono">₹{item.price}</Text>
                          <Text className="text-[10px] text-primaryLight ml-1 font-bold underline">Quick Edit</Text>
                        </Pressable>
                      )}

                      <Text className={`text-[10px] font-black tracking-wider uppercase ${item.is_available ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {item.is_available ? 'Active (ON)' : 'Sold Out (OFF)'}
                      </Text>
                    </View>
                  </View>

                  {/* Dynamic Action Buttons Grid */}
                  <View className="flex-row items-center gap-3">
                    
                    {/* Instant Availability Switch Board */}
                    <View className="flex-row items-center gap-2 bg-white border border-border px-3 rounded-xl" style={{ height: 44 }}>
                      <Text className="text-xs text-text-secondary font-bold">Active</Text>
                      <Switch
                        value={item.is_available ?? false}
                        onValueChange={() => handleToggleAvailability(item)}
                        trackColor={{ false: '#cbd5e1', true: colors.accent }}
                        thumbColor={item.is_available ? colors.primary : '#f4f3f4'}
                        style={{ transform: [{ scale: 0.8 }] }}
                      />
                    </View>

                    {/* Standard Modals Edit pencil */}
                    <Pressable
                      className="p-2.5 bg-white border border-border rounded-xl active:bg-slate-100 items-center justify-center shadow-xs"
                      style={{ width: 44, height: 44 }}
                      onPress={() => handleOpenEdit(item)}
                    >
                      <Edit2 size={15} color={colors.textPrimary} />
                    </Pressable>

                    {/* Destructive Soft-Delete Archive */}
                    <Pressable
                      className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl active:bg-rose-100 items-center justify-center shadow-xs"
                      style={{ width: 44, height: 44 }}
                      onPress={() => handleArchive(item)}
                    >
                      <Archive size={15} color="#e11d48" />
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
                {/* Form header */}
                <View className="flex-row items-center gap-2 border-b border-border pb-3 mb-5">
                  <Sparkles size={20} color={colors.primary} />
                  <Text className="text-lg font-black text-text-primary">
                    {isEditMode ? 'Modify Product Specifications' : 'Create New Menu Product'}
                  </Text>
                </View>

                {formError && (
                  <View className="flex-row items-center gap-3 bg-red-50 p-4 border border-red-200 rounded-xl mb-4">
                    <AlertCircle size={20} color="#dc2626" />
                    <Text className="text-red-700 font-semibold flex-1 text-sm">{formError}</Text>
                  </View>
                )}

                {/* Form Input Grid */}
                <View className="flex-row flex-wrap -mx-2">
                  {/* Product Name */}
                  <View className="w-full px-2 mb-4">
                    <Text className="text-xs font-bold text-text-primary mb-2">Product Name</Text>
                    <TextInput
                      value={formInput.name}
                      onChangeText={(text) => setFormInput(prev => ({ ...prev, name: text }))}
                      placeholder="e.g. UFO Chocolate Burger"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-4 py-3 text-text-primary bg-slate-50 focus:bg-white text-base font-semibold"
                      style={{ minHeight: 44 }}
                    />
                  </View>

                  {/* Price */}
                  <View className="w-full md:w-1/2 px-2 mb-4">
                    <Text className="text-xs font-bold text-text-primary mb-2">Pricing (₹)</Text>
                    <TextInput
                      value={formInput.price}
                      onChangeText={(text) => setFormInput(prev => ({ ...prev, price: text }))}
                      placeholder="e.g. 290"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-4 py-3 text-text-primary bg-slate-50 focus:bg-white text-base font-black font-mono"
                      style={{ minHeight: 44 }}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Availability Switches inside form */}
                  <View className="w-full md:w-1/2 px-2 mb-4 justify-center">
                    <View className="flex-row items-center gap-3 bg-slate-50 border border-border p-3 rounded-xl h-11">
                      <Switch
                        value={formInput.is_available}
                        onValueChange={(val) => setFormInput(prev => ({ ...prev, is_available: val }))}
                        trackColor={{ false: '#cbd5e1', true: colors.accent }}
                        thumbColor={formInput.is_available ? colors.primary : '#f4f3f4'}
                        style={{ transform: [{ scale: 0.8 }] }}
                      />
                      <Text className="text-xs font-bold text-text-primary">Instant Availability ON</Text>
                    </View>
                  </View>

                  {/* Category Selection Grid (Premium and touch-compliant) */}
                  <View className="w-full px-2 mb-4">
                    <Text className="text-xs font-bold text-text-primary mb-2">Category Assignment</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {categories.map((cat) => {
                        const isSelected = formInput.category_id === cat.id;
                        return (
                          <Pressable
                            key={cat.id}
                            className={`px-4 py-2.5 border rounded-xl items-center justify-center ${
                              isSelected ? 'bg-primary border-primary shadow-xs' : 'bg-slate-50 border-border active:bg-slate-100'
                            }`}
                            style={{ minHeight: 44 }}
                            onPress={() => setFormInput(prev => ({ ...prev, category_id: cat.id }))}
                          >
                            <Text className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                              {cat.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>

              {/* Modal action buttons */}
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
                  className="px-8 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-2 shadow-sm"
                  style={{ height: 44 }}
                  onPress={handleSave}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="font-bold text-white text-sm">Save Specifications</Text>
                  )}
                </Pressable>
              </View>

            </View>
          </View>
        )}

      </View>
    </View>
  );
}
