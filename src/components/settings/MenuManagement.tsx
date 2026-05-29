import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Switch, Alert, Platform, useWindowDimensions } from 'react-native';
import { Plus, Edit2, Archive, Check, AlertCircle, Tag, Search, X, ArrowUpDown, ChevronDown, Coffee, Sparkles, Layers, EyeOff, MoreVertical, ArrowLeft } from 'lucide-react-native';
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
type AvailabilityFilter = 'all' | 'available' | 'unavailable';

type MenuManagementProps = {
  onBack?: () => void;
};

export function MenuManagement({ onBack }: MenuManagementProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1024; // Align columns based on wide desktop viewport

  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search, Availability, & Sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  
  // Dropdown visibility states
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showAvailabilityDropdown, setShowAvailabilityDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  
  // Inline Price Quick Edit states
  const [inlinePriceId, setInlinePriceId] = useState<string | null>(null);
  const [inlinePriceValue, setInlinePriceValue] = useState('');

  // Three-dot Ellipsis active menus state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

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
    setActiveMenuId(null);
    
    // Optimistic UI Update
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_available: nextStatus } : p));
    
    const res = await toggleProductAvailability(product.id, nextStatus);
    if (res.error) {
      // Rollback on database failure
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_available: product.is_available } : p));
      Alert.alert('Operation Failed', 'Unable to toggle product availability in database.');
    }
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
    setActiveMenuId(null);
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
    setActiveMenuId(null);
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

  // Helper for rendering high-quality category icons on visual thumbnails
  const renderProductImage = (catId: string) => {
    const defaultColor = 'bg-slate-100 border-slate-200';
    if (!catId) return <View className={`w-12 h-12 rounded-xl justify-center items-center mr-3 border ${defaultColor}`}><Tag size={16} color={colors.textSecondary} /></View>;

    const index = catId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
    const icons = [
      { bg: 'bg-emerald-50 border-emerald-100', icon: <Coffee size={18} color="#059669" /> },
      { bg: 'bg-rose-50 border-rose-100', icon: <Sparkles size={18} color="#e11d48" /> },
      { bg: 'bg-amber-50 border-amber-100', icon: <Layers size={18} color="#d97706" /> },
      { bg: 'bg-violet-50 border-violet-100', icon: <Tag size={18} color="#7c3aed" /> },
    ];

    const schema = icons[index] ?? { bg: defaultColor, icon: <Tag size={18} color={colors.textSecondary} /> };
    return (
      <View className={`w-12 h-12 rounded-xl justify-center items-center mr-3 border ${schema.bg}`}>
        {schema.icon}
      </View>
    );
  };

  // Dynamic Category color-coding maps
  const getCategoryColorSchema = (catId: string) => {
    const defaultSchema = { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-700' };
    if (!catId) return defaultSchema;
    
    const index = catId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
    const schemas = [
      { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' }, // Mint / Green
      { bg: 'bg-rose-50 border-rose-100', text: 'text-rose-700' }, // Rose / Pink
      { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700' }, // Gold / Orange
      { bg: 'bg-violet-50 border-violet-100', text: 'text-violet-700' }, // Lavender / Purple
      { bg: 'bg-cyan-50 border-cyan-100', text: 'text-cyan-700' }, // Sky / Cyan
    ];
    return schemas[index] ?? defaultSchema;
  };

  // Filter & Sort Logic
  const filteredAndSortedProducts = products
    .filter(p => {
      // 1. Category selector pill filter
      const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
      
      // 2. Search keyword filter
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      
      // 3. Availability Filter
      let matchesAvailability = true;
      if (availabilityFilter === 'available') {
        matchesAvailability = p.is_available === true;
      } else if (availabilityFilter === 'unavailable') {
        matchesAvailability = p.is_available !== true;
      }

      return matchesCategory && matchesSearch && matchesAvailability;
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
  const categoryCount = categories.length;

  return (
    <View className="flex-1 bg-surface-tint p-2 rounded-2xl">
      
      {/* 🚀 Header Area with Back button & "+ Add New Item" */}
      <View className="flex-row items-center justify-between pb-4 mb-4 flex-wrap gap-2">
        <View className="flex-row items-center gap-3">
          {onBack && (
            <Pressable
              onPress={onBack}
              className="w-10 h-10 bg-white border border-slate-200 rounded-xl items-center justify-center active:bg-slate-100 shadow-xs"
              style={{ width: 40, height: 40 }}
            >
              <ArrowLeft size={16} color={colors.textPrimary} />
            </Pressable>
          )}
          <View>
            <Text className="text-xl font-black text-text-primary tracking-tight">Menu Management</Text>
            <Text className="text-xs text-text-secondary mt-0.5">Manage your menu items, categories and availability</Text>
          </View>
        </View>

        <Pressable
          className="flex-row items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary active:opacity-90 shadow-sm"
          style={{ height: 42 }}
          onPress={handleOpenAdd}
        >
          <Plus size={16} color="white" />
          <Text className="text-white font-extrabold text-sm">Add New Item</Text>
        </Pressable>
      </View>

      {/* 📊 4 Analytics Metrics Row */}
      <View className="flex-row gap-4 mb-5 flex-wrap">
        {/* Card 1: Total Items */}
        <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-4">
          <View className="p-3 bg-blue-50/50 border border-blue-100 rounded-2xl">
            <Coffee size={20} color={colors.primary} />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-xs">Total Items</Text>
            <Text className="text-2xl font-black text-text-primary font-mono leading-none mt-1">{totalCount}</Text>
            <Text className="text-[10px] text-text-secondary mt-1 font-medium">All menu items</Text>
          </View>
        </View>

        {/* Card 2: Available */}
        <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-4">
          <View className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
            <Check size={20} color="#10b981" />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-xs">Available</Text>
            <Text className="text-2xl font-black text-emerald-600 font-mono leading-none mt-1">{activeCount}</Text>
            <Text className="text-[10px] text-text-secondary mt-1 font-medium">Currently available</Text>
          </View>
        </View>

        {/* Card 3: Unavailable */}
        <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-4">
          <View className="p-3 bg-amber-50/50 border border-amber-100 rounded-2xl">
            <EyeOff size={20} color="#f59e0b" />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-xs">Unavailable</Text>
            <Text className="text-2xl font-black text-amber-500 font-mono leading-none mt-1">{soldOutCount}</Text>
            <Text className="text-[10px] text-text-secondary mt-1 font-medium">Currently hidden</Text>
          </View>
        </View>

        {/* Card 4: Categories */}
        <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-4">
          <View className="p-3 bg-purple-50/50 border border-purple-100 rounded-2xl">
            <Layers size={20} color="#8b5cf6" />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-xs">Categories</Text>
            <Text className="text-2xl font-black text-purple-600 font-mono leading-none mt-1">{categoryCount}</Text>
            <Text className="text-[10px] text-text-secondary mt-1 font-medium">Menu categories</Text>
          </View>
        </View>
      </View>

      {/* 🍽️ Main Catalog Board */}
      <View className="flex-1 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        
        {/* 🔍 Wide Search & Dropdown Filters Bar */}
        <View className="flex-col lg:flex-row gap-3 mb-4 items-stretch lg:items-center">
          {/* Search Box */}
          <View className="flex-1 flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3" style={{ height: 42 }}>
            <Search size={14} color={colors.textSecondary} className="mr-2" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search menu items..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-text-primary text-xs font-semibold h-full"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} className="p-0.5">
                <X size={14} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Filters dropdown triggers */}
          <View className="flex-row gap-2 flex-wrap items-center">
            {/* Category Dropdown */}
            <View className="relative">
              <Pressable
                onPress={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowAvailabilityDropdown(false);
                  setShowSortDropdown(false);
                }}
                className="flex-row items-center justify-between gap-3 px-3 rounded-xl border border-slate-200 bg-white active:bg-slate-50"
                style={{ height: 42, minWidth: 150 }}
              >
                <Text className="text-text-primary text-xs font-bold">
                  {selectedCategoryId === 'all' ? 'All Categories' : categories.find(c => c.id === selectedCategoryId)?.name ?? 'Categories'}
                </Text>
                <ChevronDown size={14} color={colors.textSecondary} />
              </Pressable>

              {showCategoryDropdown && (
                <View className="absolute right-0 top-12 z-50 bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 w-[180px]">
                  <Pressable
                    onPress={() => {
                      setSelectedCategoryId('all');
                      setShowCategoryDropdown(false);
                    }}
                    className={`p-2 rounded-lg ${selectedCategoryId === 'all' ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                  >
                    <Text className={`text-xs font-semibold ${selectedCategoryId === 'all' ? 'text-primary font-bold' : 'text-text-primary'}`}>
                      All Categories
                    </Text>
                  </Pressable>
                  {categories.map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        setSelectedCategoryId(cat.id);
                        setShowCategoryDropdown(false);
                      }}
                      className={`p-2 rounded-lg ${selectedCategoryId === cat.id ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                    >
                      <Text className={`text-xs font-semibold ${selectedCategoryId === cat.id ? 'text-primary font-bold' : 'text-text-primary'}`}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Availability Dropdown */}
            <View className="relative">
              <Pressable
                onPress={() => {
                  setShowAvailabilityDropdown(!showAvailabilityDropdown);
                  setShowCategoryDropdown(false);
                  setShowSortDropdown(false);
                }}
                className="flex-row items-center justify-between gap-3 px-3 rounded-xl border border-slate-200 bg-white active:bg-slate-50"
                style={{ height: 42, minWidth: 150 }}
              >
                <Text className="text-text-primary text-xs font-bold">
                  Availability: {availabilityFilter === 'all' ? 'All' : availabilityFilter === 'available' ? 'Available' : 'Unavailable'}
                </Text>
                <ChevronDown size={14} color={colors.textSecondary} />
              </Pressable>

              {showAvailabilityDropdown && (
                <View className="absolute right-0 top-12 z-50 bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 w-[180px]">
                  {[
                    { value: 'all', label: 'Availability: All' },
                    { value: 'available', label: 'Availability: Available' },
                    { value: 'unavailable', label: 'Availability: Unavailable' },
                  ].map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        setAvailabilityFilter(opt.value as AvailabilityFilter);
                        setShowAvailabilityDropdown(false);
                      }}
                      className={`p-2 rounded-lg ${availabilityFilter === opt.value ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                    >
                      <Text className={`text-xs font-semibold ${availabilityFilter === opt.value ? 'text-primary font-bold' : 'text-text-primary'}`}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Sort Dropdown */}
            <View className="relative">
              <Pressable
                onPress={() => {
                  setShowSortDropdown(!showSortDropdown);
                  setShowCategoryDropdown(false);
                  setShowAvailabilityDropdown(false);
                }}
                className="flex-row items-center justify-between gap-3 px-3 rounded-xl border border-slate-200 bg-white active:bg-slate-50"
                style={{ height: 42, minWidth: 130 }}
              >
                <View className="flex-row items-center gap-1.5">
                  <ArrowUpDown size={12} color={colors.textSecondary} />
                  <Text className="text-text-primary text-xs font-bold">
                    Sort: {
                      sortBy === 'name-asc' ? 'A-Z' :
                      sortBy === 'name-desc' ? 'Z-A' :
                      sortBy === 'price-asc' ? 'Price: Low' : 'Price: High'
                    }
                  </Text>
                </View>
                <ChevronDown size={14} color={colors.textSecondary} />
              </Pressable>

              {showSortDropdown && (
                <View className="absolute right-0 top-12 z-50 bg-white border border-slate-200 shadow-lg rounded-xl p-1.5 w-[160px]">
                  {[
                    { value: 'name-asc', label: 'Sort: A -> Z' },
                    { value: 'name-desc', label: 'Sort: Z -> A' },
                    { value: 'price-asc', label: 'Price: Low -> High' },
                    { value: 'price-desc', label: 'Price: High -> Low' },
                  ].map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        setSortBy(opt.value as SortOption);
                        setShowSortDropdown(false);
                      }}
                      className={`p-2 rounded-lg ${sortBy === opt.value ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                    >
                      <Text className={`text-xs font-semibold ${sortBy === opt.value ? 'text-primary font-bold' : 'text-text-primary'}`}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 🏷️ Dynamic Category Tab Pills with Gray Pill Count Indicators (Directly from reference design!) */}
        <View className="mb-4 border-b border-slate-100 pb-3">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: 'all', name: 'All Items' }, ...categories]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const isSelected = selectedCategoryId === item.id;
              
              // Calculate dynamic counts per category pill
              const count = item.id === 'all'
                ? products.length
                : products.filter(p => p.category_id === item.id).length;

              return (
                <Pressable
                  onPress={() => setSelectedCategoryId(item.id)}
                  className={`px-4 py-2.5 rounded-full border flex-row items-center gap-2 transition-all ${
                    isSelected ? 'bg-primary border-primary shadow-xs' : 'bg-slate-50 border-slate-200 active:bg-slate-100'
                  }`}
                  style={{ minHeight: 38 }}
                >
                  <Text className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                    {item.name}
                  </Text>
                  
                  {/* Dynamic counts indicator pill */}
                  <View className={`px-2 py-0.5 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-200/60'}`}>
                    <Text className={`text-[10px] font-black font-mono ${isSelected ? 'text-primary' : 'text-text-secondary'}`}>
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>

        {success && (
          <View className="flex-row items-center gap-1.5 bg-green-50 p-2 border border-green-200 rounded-lg mb-3">
            <Check size={14} color="#15803d" />
            <Text className="text-green-700 font-bold text-[11px] flex-1">{success}</Text>
          </View>
        )}

        {/* 🍽️ Two-Column High-Density Product Grid Board (Replicated exactly!) */}
        {loading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View className="items-center justify-center py-10 bg-red-50 rounded-xl p-4 border border-red-200">
            <AlertCircle size={24} color="#dc2626" />
            <Text className="text-red-700 text-center font-bold mt-1 text-sm">Menu Error</Text>
            <Text className="text-red-600 text-center text-xs mt-0.5">{error}</Text>
          </View>
        ) : filteredAndSortedProducts.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20 border-2 border-dashed border-border rounded-xl">
            <Plus size={36} color={colors.textSecondary} className="opacity-40" />
            <Text className="text-text-primary font-bold text-sm mt-3 text-center">No Products Discovered</Text>
            <Text className="text-text-secondary text-xs text-center mt-1 px-6">
              No products found matching filters.
            </Text>
          </View>
        ) : (
          <FlatList
            key={isWide ? 'catalog-grid-2col' : 'catalog-list-1col'}
            numColumns={isWide ? 2 : 1}
            columnWrapperStyle={isWide ? { gap: 16 } : undefined}
            data={filteredAndSortedProducts}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 130 }}
            renderItem={({ item }) => {
              const category = categories.find(c => c.id === item.category_id);
              const colorSchema = getCategoryColorSchema(item.category_id ?? '');
              const isInlineEditingPrice = inlinePriceId === item.id;
              const isAvailable = item.is_available ?? false;
              
              // Ellipsis action menu popup toggler
              const isMenuOpen = activeMenuId === item.id;

              return (
                <View className="flex-1 flex-row items-center justify-between p-3.5 mb-3 bg-white border border-slate-100 rounded-2xl shadow-xs relative" style={{ minHeight: 76 }}>
                  
                  {/* Left Column: Icon Thumbnail, Name, Category pill & Available Dot */}
                  <View className="flex-1 mr-3 flex-row items-center">
                    
                    {/* Visual Rounded Category Icon Thumbnail */}
                    {renderProductImage(item.category_id ?? '')}

                    <View className="flex-1 flex-col justify-center">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <Text className="font-bold text-sm text-text-primary select-all">{item.name}</Text>
                        {category && (
                          <View className={`px-2 py-0.5 rounded-full border text-[8px] font-black tracking-wide ${colorSchema.bg}`}>
                            <Text className={`text-[8px] font-black tracking-wide ${colorSchema.text}`}>{category.name}</Text>
                          </View>
                        )}
                      </View>

                      {/* Dot Availability Indicator */}
                      <View className="flex-row items-center gap-1.5 mt-1">
                        <View className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <Text className={`text-[9px] font-extrabold uppercase ${isAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {isAvailable ? 'Available' : 'Unavailable'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Center Column: Price Tag Badge (Clickable for inline pricing edits!) */}
                  <View className="w-24 items-end justify-center mr-3">
                    {isInlineEditingPrice ? (
                      <View className="flex-row items-center gap-1 bg-white border border-primary/40 rounded-xl px-1.5" style={{ height: 32 }}>
                        <Text className="text-text-secondary text-[10px] font-bold">₹</Text>
                        <TextInput
                          value={inlinePriceValue}
                          onChangeText={setInlinePriceValue}
                          className="w-12 h-full text-text-primary text-[10px] font-black font-mono"
                          keyboardType="numeric"
                          autoFocus
                          placeholder="Price"
                        />
                        <Pressable
                          onPress={() => handleQuickPriceSave(item)}
                          className="bg-emerald-100 p-0.5 rounded"
                        >
                          <Check size={10} color="#059669" />
                        </Pressable>
                        <Pressable
                          onPress={() => setInlinePriceId(null)}
                          className="bg-slate-100 p-0.5 rounded"
                        >
                          <X size={10} color="#475569" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setInlinePriceId(item.id);
                          setInlinePriceValue(String(item.price));
                        }}
                        className="active:bg-slate-50 px-2 py-1 rounded-xl transition-all"
                        style={{ height: 32, justifyContent: 'center' }}
                      >
                        <Text className="text-primary font-black text-sm font-mono">₹{item.price}</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Right Column: High Density Compact Icon Buttons */}
                  <View className="flex-row items-center gap-1.5 z-10">
                    
                    {/* Pencil Edit button */}
                    <Pressable
                      className="w-9 h-9 bg-white border border-slate-200 active:bg-slate-50 rounded-xl items-center justify-center shadow-xs"
                      onPress={() => handleOpenEdit(item)}
                    >
                      <Edit2 size={13} color={colors.textSecondary} />
                    </Pressable>

                    {/* Ellipsis Vertical options activator */}
                    <View className="relative">
                      <Pressable
                        className="w-9 h-9 bg-white border border-slate-200 active:bg-slate-50 rounded-xl items-center justify-center shadow-xs"
                        onPress={() => {
                          setActiveMenuId(isMenuOpen ? null : item.id);
                        }}
                      >
                        <MoreVertical size={14} color={colors.textSecondary} />
                      </Pressable>

                      {/* Mini contextual popup dropdown menu */}
                      {isMenuOpen && (
                        <View className="absolute right-0 top-10 bg-white border border-slate-200 shadow-xl rounded-2xl p-1.5 w-[180px] z-50">
                          <Pressable
                            onPress={() => handleToggleAvailability(item)}
                            className="p-2.5 rounded-xl active:bg-slate-50 flex-row items-center gap-2"
                          >
                            <Check size={12} color={isAvailable ? '#f59e0b' : '#10b981'} />
                            <Text className="text-[11px] font-bold text-text-primary">
                              {isAvailable ? 'Mark as Out of Stock' : 'Mark as Available'}
                            </Text>
                          </Pressable>
                          
                          <Pressable
                            onPress={() => handleArchive(item)}
                            className="p-2.5 rounded-xl active:bg-rose-50 flex-row items-center gap-2 border-t border-slate-100"
                          >
                            <Archive size={12} color="#dc2626" />
                            <Text className="text-[11px] font-bold text-red-600">
                              Archive Product
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
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
