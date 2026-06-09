import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Switch, Alert, Platform, useWindowDimensions, Modal, ScrollView } from 'react-native';
import { Plus, Edit2, Archive, Check, AlertCircle, Tag, Search, X, ArrowUpDown, ChevronDown, Coffee, Sparkles, Layers, EyeOff, MoreVertical, ArrowLeft, Upload, Download } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { getCategories, type Category } from '@/lib/pos/products-service';
import { fetchActiveProducts, toggleProductAvailability, addProduct, updateProduct, archiveProduct, type MenuProduct } from '@/lib/pos/menu-service';
import { fetchRecipes, type InventoryRecipe } from '@/lib/pos/inventory-service';
import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import {
  validateProductImportRows,
  importMenuProducts,
  type ProductImportRow,
  type ValidatedProductRow,
  type ProductValidationSummary
} from '@/lib/pos/menu-import-service';

type ProductFormInput = {
  id?: string;
  name: string;
  price: string;
  category_id: string;
  is_available: boolean;
  inventory_tracking_enabled: boolean;
  recipe_id: string;
};

const initialFormInput: ProductFormInput = {
  name: '',
  price: '',
  category_id: '',
  is_available: true,
  inventory_tracking_enabled: false,
  recipe_id: '',
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
  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
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

  // Excel Import states
  const [importSummary, setImportSummary] = useState<ProductValidationSummary | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Global Inventory Tracking State
  const [globalTracking, setGlobalTracking] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('globalInventoryTracking') !== 'false';
    }
    return true;
  });

  const handleToggleGlobalTracking = (val: boolean) => {
    setGlobalTracking(val);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('globalInventoryTracking', String(val));
    }
  };

  // Load Categories & Products
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catsRes, prodsRes, recipesRes] = await Promise.all([
        getCategories(),
        fetchActiveProducts(),
        fetchRecipes()
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

      if (recipesRes.data) {
        setRecipes(recipesRes.data);
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

  const handleDownloadTemplate = () => {
    try {
      const templateData = [
        {
          'Product Name*': 'Pistachio Cheesecake',
          'Price*': 350,
          'Category Name*': 'Signature Desserts',
          'Inventory Tracking Enabled': 'Yes',
          'Linked Recipe Code': 'REC01'
        },
        {
          'Product Name*': 'Nutella Milkshake',
          'Price*': 220,
          'Category Name*': 'Milkshakes & Drinks',
          'Inventory Tracking Enabled': 'No',
          'Linked Recipe Code': ''
        }
      ];

      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Product Menu');

      if (Platform.OS === 'web') {
        XLSX.writeFile(wb, 'grovit_product_menu_template.xlsx');
      } else {
        Alert.alert('Info', 'Excel template download is supported on the web version.');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to generate template: ' + (err.message || err));
    }
  };

  const handleImportExcelClick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv'
        ],
        copyToCacheDirectory: true
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];

      if (Platform.OS === 'web') {
        const file = asset.file;
        if (!file) {
          Alert.alert('Error', 'Unable to access the selected file.');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = e.target?.result;
            if (!data) {
              Alert.alert('Error', 'File content is empty.');
              return;
            }

            const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json<ProductImportRow>(worksheet);

            if (json.length === 0) {
              Alert.alert('Error', 'The uploaded Excel file contains no data rows.');
              return;
            }

            const summary = await validateProductImportRows(json);
            setImportSummary(summary);
            setIsImportModalOpen(true);
          } catch (err: any) {
            Alert.alert('Error', 'Failed to parse Excel file: ' + (err.message || err));
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        Alert.alert('Info', 'Excel import is currently supported on the web version.');
      }
    } catch (err: any) {
      Alert.alert('Error', 'File picker error: ' + (err.message || err));
    }
  };

  const handleExecuteImport = async () => {
    if (!importSummary || isImporting) return;
    setIsImporting(true);

    try {
      const result = await importMenuProducts(importSummary.rows);
      if (result.error) {
        Alert.alert('Import Failed', result.error);
      } else if (result.data) {
        Alert.alert('Import Success', `Successfully imported ${result.data.count} menu products.`);
        setIsImportModalOpen(false);
        setImportSummary(null);
        await loadData();
      }
    } catch (err: any) {
      Alert.alert('Error', 'An unexpected error occurred: ' + (err.message || err));
    } finally {
      setIsImporting(false);
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
      inventory_tracking_enabled: product.inventory_tracking_enabled ?? false,
      recipe_id: product.recipe_id ?? '',
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
      inventory_tracking_enabled: formInput.inventory_tracking_enabled,
      recipe_id: formInput.recipe_id || null,
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
    if (!catId) return <View className={`w-10 h-10 rounded-xl justify-center items-center mr-2.5 border ${defaultColor}`}><Tag size={13} color={colors.textSecondary} /></View>;

    const index = catId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
    const icons = [
      { bg: 'bg-emerald-50 border-emerald-100', icon: <Coffee size={14} color="#059669" /> },
      { bg: 'bg-rose-50 border-rose-100', icon: <Sparkles size={14} color="#e11d48" /> },
      { bg: 'bg-amber-50 border-amber-100', icon: <Layers size={14} color="#d97706" /> },
      { bg: 'bg-violet-50 border-violet-100', icon: <Tag size={14} color="#7c3aed" /> },
    ];

    const schema = icons[index] ?? { bg: defaultColor, icon: <Tag size={14} color={colors.textSecondary} /> };
    return (
      <View className={`w-10 h-10 rounded-xl justify-center items-center mr-2.5 border ${schema.bg}`}>
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
    <View className="flex-1 bg-surface-tint p-3 rounded-2xl">
      
      {/* 🚀 Header Area with Back button & "+ Add New Item" */}
      <View className="flex-row items-center justify-between pb-3 mb-3 flex-wrap gap-2">
        <View className="flex-row items-center gap-2.5">
          {onBack && (
            <Pressable
              onPress={onBack}
              className="bg-white border border-slate-200 rounded-xl items-center justify-center active:bg-slate-100 shadow-xs"
              style={{ width: 32, height: 32 }}
            >
              <ArrowLeft size={14} color={colors.textPrimary} />
            </Pressable>
          )}
          <View>
            <Text className="text-lg font-black text-text-primary tracking-tight">Menu Management</Text>
            <Text className="text-[11px] text-text-secondary mt-0.5">Manage your menu items, categories and availability</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5 flex-wrap">
          <Pressable
            className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 active:bg-slate-50 shadow-xs"
            style={{ height: 34 }}
            onPress={handleDownloadTemplate}
          >
            <Download size={12} color="#475569" />
            <Text className="text-slate-700 font-extrabold text-[11px]">Download Template</Text>
          </Pressable>

          <Pressable
            className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 active:bg-slate-50 shadow-xs"
            style={{ height: 34 }}
            onPress={handleImportExcelClick}
          >
            <Upload size={12} color="#475569" />
            <Text className="text-slate-700 font-extrabold text-[11px]">Import Excel</Text>
          </Pressable>

          <Pressable
            className="flex-row items-center gap-1 px-4 py-1.5 rounded-xl bg-primary active:opacity-90 shadow-sm"
            style={{ height: 34 }}
            onPress={handleOpenAdd}
          >
            <Plus size={13} color="white" />
            <Text className="text-white font-extrabold text-xs">Add New Item</Text>
          </Pressable>
        </View>
      </View>

      {/* 📊 4 Analytics Metrics Row */}
      <View className="flex-row gap-2.5 mb-4 flex-wrap">
        {/* Card 1: Total Items */}
        <View className="flex-1 min-w-[160px] bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-3">
          <View className="p-2 bg-blue-50/50 border border-blue-100 rounded-2xl">
            <Coffee size={16} color={colors.primary} />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-[11px]">Total Items</Text>
            <Text className="text-lg font-black text-text-primary font-mono leading-none mt-1">{totalCount}</Text>
            <Text className="text-[9px] text-text-secondary mt-1 font-medium">All menu items</Text>
          </View>
        </View>

        {/* Card 2: Available */}
        <View className="flex-1 min-w-[160px] bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-3">
          <View className="p-2 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
            <Check size={16} color="#10b981" />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-[11px]">Available</Text>
            <Text className="text-lg font-black text-emerald-600 font-mono leading-none mt-1">{activeCount}</Text>
            <Text className="text-[9px] text-text-secondary mt-1 font-medium">Currently available</Text>
          </View>
        </View>

        {/* Card 3: Unavailable */}
        <View className="flex-1 min-w-[160px] bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-3">
          <View className="p-2 bg-amber-50/50 border border-amber-100 rounded-2xl">
            <EyeOff size={16} color="#f59e0b" />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-[11px]">Unavailable</Text>
            <Text className="text-lg font-black text-amber-500 font-mono leading-none mt-1">{soldOutCount}</Text>
            <Text className="text-[9px] text-text-secondary mt-1 font-medium">Currently hidden</Text>
          </View>
        </View>

        {/* Card 4: Categories */}
        <View className="flex-1 min-w-[160px] bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-3">
          <View className="p-2 bg-purple-50/50 border border-purple-100 rounded-2xl">
            <Layers size={16} color="#8b5cf6" />
          </View>
          <View>
            <Text className="text-text-secondary font-semibold text-[11px]">Categories</Text>
            <Text className="text-lg font-black text-purple-600 font-mono leading-none mt-1">{categoryCount}</Text>
            <Text className="text-[9px] text-text-secondary mt-1 font-medium">Menu categories</Text>
          </View>
        </View>
      </View>

      {/* 🍽️ Main Catalog Board */}
      <View className="flex-1 bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
        
        {/* 🔍 Wide Search & Dropdown Filters Bar */}
        <View className="flex-col lg:flex-row gap-3 mb-4 items-stretch lg:items-center">
          {/* Search Box */}
          <View className="flex-1 flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5" style={{ height: 34 }}>
            <Search size={12} color={colors.textSecondary} className="mr-1.5" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search menu items..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-text-primary text-[11px] font-semibold h-full"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} className="p-0.5">
                <X size={12} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Filters dropdown triggers */}
          <View className="flex-row gap-1.5 flex-wrap items-center">
            {/* Category Dropdown */}
            <View className="relative">
              <Pressable
                onPress={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowAvailabilityDropdown(false);
                  setShowSortDropdown(false);
                }}
                className="flex-row items-center justify-between gap-2 px-2.5 rounded-xl border border-slate-200 bg-white active:bg-slate-50"
                style={{ height: 34, minWidth: 120 }}
              >
                <Text className="text-text-primary text-[11px] font-bold">
                  {selectedCategoryId === 'all' ? 'All Categories' : categories.find(c => c.id === selectedCategoryId)?.name ?? 'Categories'}
                </Text>
                <ChevronDown size={11} color={colors.textSecondary} />
              </Pressable>

              {showCategoryDropdown && (
                <View className="absolute right-0 top-10 z-50 bg-white border border-slate-200 shadow-lg rounded-xl p-1 w-[150px]">
                  <Pressable
                    onPress={() => {
                      setSelectedCategoryId('all');
                      setShowCategoryDropdown(false);
                    }}
                    className={`p-1.5 rounded-lg ${selectedCategoryId === 'all' ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                  >
                    <Text className={`text-[11px] font-semibold ${selectedCategoryId === 'all' ? 'text-primary font-bold' : 'text-text-primary'}`}>
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
                      className={`p-1.5 rounded-lg ${selectedCategoryId === cat.id ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                    >
                      <Text className={`text-[11px] font-semibold ${selectedCategoryId === cat.id ? 'text-primary font-bold' : 'text-text-primary'}`}>
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
                className="flex-row items-center justify-between gap-2 px-2.5 rounded-xl border border-slate-200 bg-white active:bg-slate-50"
                style={{ height: 34, minWidth: 120 }}
              >
                <Text className="text-text-primary text-[11px] font-bold">
                  Availability: {availabilityFilter === 'all' ? 'All' : availabilityFilter === 'available' ? 'Available' : 'Unavailable'}
                </Text>
                <ChevronDown size={11} color={colors.textSecondary} />
              </Pressable>

              {showAvailabilityDropdown && (
                <View className="absolute right-0 top-10 z-50 bg-white border border-slate-200 shadow-lg rounded-xl p-1 w-[150px]">
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
                      className={`p-1.5 rounded-lg ${availabilityFilter === opt.value ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                    >
                      <Text className={`text-[11px] font-semibold ${availabilityFilter === opt.value ? 'text-primary font-bold' : 'text-text-primary'}`}>
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
                className="flex-row items-center justify-between gap-2 px-2.5 rounded-xl border border-slate-200 bg-white active:bg-slate-50"
                style={{ height: 34, minWidth: 110 }}
              >
                <View className="flex-row items-center gap-1">
                  <ArrowUpDown size={11} color={colors.textSecondary} />
                  <Text className="text-text-primary text-[11px] font-bold">
                    Sort: {
                      sortBy === 'name-asc' ? 'A-Z' :
                      sortBy === 'name-desc' ? 'Z-A' :
                      sortBy === 'price-asc' ? 'Price: Low' : 'Price: High'
                    }
                  </Text>
                </View>
                <ChevronDown size={11} color={colors.textSecondary} />
              </Pressable>

              {showSortDropdown && (
                <View className="absolute right-0 top-10 z-50 bg-white border border-slate-200 shadow-lg rounded-xl p-1 w-[140px]">
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
                      className={`p-1.5 rounded-lg ${sortBy === opt.value ? 'bg-slate-100' : 'active:bg-slate-50'}`}
                    >
                      <Text className={`text-[11px] font-semibold ${sortBy === opt.value ? 'text-primary font-bold' : 'text-text-primary'}`}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Global Inventory Tracking Setting */}
            <View className="flex-row items-center gap-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl" style={{ height: 34 }}>
              <Text className="text-[11px] font-extrabold text-slate-600">Track Inventory</Text>
              <Switch
                value={globalTracking}
                onValueChange={handleToggleGlobalTracking}
                trackColor={{ false: '#cbd5e1', true: colors.accent }}
                thumbColor={globalTracking ? colors.primary : '#f4f3f4'}
                style={{ transform: [{ scale: 0.65 }] }}
              />
            </View>

          </View>
        </View>

        {/* 🏷️ Dynamic Category Tab Pills with Gray Pill Count Indicators (Directly from reference design!) */}
        <View className="mb-3 border-b border-slate-100 pb-2.5">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: 'all', name: 'All Items' }, ...categories]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 6 }}
            renderItem={({ item }) => {
              const isSelected = selectedCategoryId === item.id;
              
              // Calculate dynamic counts per category pill
              const count = item.id === 'all'
                ? products.length
                : products.filter(p => p.category_id === item.id).length;

              return (
                <Pressable
                  onPress={() => setSelectedCategoryId(item.id)}
                  className={`px-3.5 py-1.5 rounded-full border flex-row items-center gap-1.5 transition-all ${
                    isSelected ? 'bg-primary border-primary shadow-xs' : 'bg-slate-50 border-slate-200 active:bg-slate-100'
                  }`}
                  style={{ minHeight: 30 }}
                >
                  <Text className={`font-bold text-[11px] ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                    {item.name}
                  </Text>
                  
                  {/* Dynamic counts indicator pill */}
                  <View className={`px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-200/60'}`}>
                    <Text className={`text-[9px] font-black font-mono ${isSelected ? 'text-primary' : 'text-text-secondary'}`}>
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
            columnWrapperStyle={isWide ? { gap: 12 } : undefined}
            data={filteredAndSortedProducts}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110 }}
            renderItem={({ item }) => {
              const category = categories.find(c => c.id === item.category_id);
              const colorSchema = getCategoryColorSchema(item.category_id ?? '');
              const isInlineEditingPrice = inlinePriceId === item.id;
              const isAvailable = item.is_available ?? false;
              
              // Ellipsis action menu popup toggler
              const isMenuOpen = activeMenuId === item.id;
              const linkedRecipe = recipes.find(r => r.id === item.recipe_id);

              return (
                <View className="flex-1 flex-row items-center justify-between p-2.5 mb-2 bg-white border border-slate-100 rounded-2xl shadow-xs relative" style={{ minHeight: 60, zIndex: isMenuOpen ? 50 : 1 }}>
                  
                  {/* Left Column: Icon Thumbnail, Name, Category pill & Available Switch */}
                  <View className="flex-1 mr-2.5 flex-row items-center">
                    
                    {/* Visual Rounded Category Icon Thumbnail */}
                    {renderProductImage(item.category_id ?? '')}

                    <View className="flex-1 flex-col justify-center">
                      <View className="flex-row items-center gap-1.5 flex-wrap">
                        <Text className="font-bold text-[12.5px] text-text-primary select-all">{item.name}</Text>
                        {category && (
                          <View className={`px-1.5 py-0.5 rounded-full border text-[7.5px] font-black tracking-wide ${colorSchema.bg}`}>
                            <Text className={`text-[7.5px] font-black tracking-wide ${colorSchema.text}`}>{category.name}</Text>
                          </View>
                        )}
                      </View>

                      {/* Inline Switch Availability Indicator */}
                      <View className="flex-row items-center gap-1 mt-0.5 flex-wrap">
                        <Switch
                          value={isAvailable}
                          onValueChange={() => handleToggleAvailability(item)}
                          trackColor={{ false: '#cbd5e1', true: colors.accent }}
                          thumbColor={isAvailable ? colors.primary : '#f4f3f4'}
                          style={{ transform: [{ scale: 0.6 }], marginVertical: -4 }}
                        />
                        <Text className={`text-[8.5px] font-extrabold uppercase ${isAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {isAvailable ? 'Available' : 'Unavailable'}
                        </Text>
                        {item.inventory_tracking_enabled && (
                          <View className="bg-blue-50 border border-blue-100 rounded px-1 py-0.25">
                            <Text className="text-[7.5px] font-black text-blue-700 uppercase">Tracked</Text>
                          </View>
                        )}
                      </View>

                      {/* Margin analysis badges */}
                      {linkedRecipe && (
                        <View className="flex-row items-center gap-1 mt-1 flex-wrap">
                          <View className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5">
                            <Text className="text-[7.5px] font-semibold text-slate-500">Cost: ₹{linkedRecipe.cost_snapshot.toFixed(2)}</Text>
                          </View>
                          {(() => {
                            const marginAmt = item.price - linkedRecipe.cost_snapshot;
                            const marginPct = item.price > 0 ? (marginAmt / item.price) * 100 : 0;
                            const isMarginHealthy = marginPct >= 50;
                            return (
                              <>
                                <View className={`border rounded px-1 py-0.5 ${isMarginHealthy ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                                  <Text className={`text-[7.5px] font-black ${isMarginHealthy ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    Margin: ₹{marginAmt.toFixed(2)}
                                  </Text>
                                </View>
                                <View className={`border rounded px-1 py-0.5 ${isMarginHealthy ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                                  <Text className={`text-[7.5px] font-black ${isMarginHealthy ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {marginPct.toFixed(1)}%
                                  </Text>
                                </View>
                              </>
                            );
                          })()}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Center Column: Price Tag Badge (Clickable for inline pricing edits!) */}
                  <View className="w-20 items-end justify-center mr-2">
                    {isInlineEditingPrice ? (
                      <View className="flex-row items-center gap-0.5 bg-white border border-primary/40 rounded-xl px-1" style={{ height: 26 }}>
                        <Text className="text-text-secondary text-[9px] font-bold">₹</Text>
                        <TextInput
                          value={inlinePriceValue}
                          onChangeText={setInlinePriceValue}
                          className="w-10 h-full text-text-primary text-[9px] font-black font-mono"
                          keyboardType="numeric"
                          autoFocus
                          placeholder="Price"
                        />
                        <Pressable
                          onPress={() => handleQuickPriceSave(item)}
                          className="bg-emerald-100 p-0.5 rounded animate-bounce"
                        >
                          <Check size={9} color="#059669" />
                        </Pressable>
                        <Pressable
                          onPress={() => setInlinePriceId(null)}
                          className="bg-slate-100 p-0.5 rounded"
                        >
                          <X size={9} color="#475569" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setInlinePriceId(item.id);
                          setInlinePriceValue(String(item.price));
                        }}
                        className="active:bg-slate-50 px-1.5 py-0.5 rounded-xl transition-all"
                        style={{ height: 26, justifyContent: 'center' }}
                      >
                        <Text className="text-primary font-black text-[12px] font-mono">₹{item.price}</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Right Column: High Density Compact Icon Buttons */}
                  <View className="flex-row items-center gap-1 z-10">
                    
                    {/* Pencil Edit button */}
                    <Pressable
                      className="bg-white border border-slate-200 active:bg-slate-50 rounded-xl items-center justify-center shadow-xs"
                      style={{ width: 30, height: 30 }}
                      onPress={() => handleOpenEdit(item)}
                    >
                      <Edit2 size={11} color={colors.textSecondary} />
                    </Pressable>

                    {/* Ellipsis Vertical options activator */}
                    <View className="relative">
                      <Pressable
                        className="bg-white border border-slate-200 active:bg-slate-50 rounded-xl items-center justify-center shadow-xs"
                        style={{ width: 30, height: 30 }}
                        onPress={() => {
                          setActiveMenuId(isMenuOpen ? null : item.id);
                        }}
                      >
                        <MoreVertical size={12} color={colors.textSecondary} />
                      </Pressable>

                      {/* Mini contextual popup dropdown menu */}
                      {isMenuOpen && (
                        <View className="absolute right-0 top-8 bg-white border border-slate-200 shadow-xl rounded-2xl p-1 w-[150px] z-50">
                          <Pressable
                            onPress={() => handleToggleAvailability(item)}
                            className="p-2 rounded-xl active:bg-slate-50 flex-row items-center gap-1.5"
                          >
                            <Check size={10} color={isAvailable ? '#f59e0b' : '#10b981'} />
                            <Text className="text-[10px] font-bold text-text-primary">
                              {isAvailable ? 'Out of Stock' : 'Mark Available'}
                            </Text>
                          </Pressable>
                          
                          <Pressable
                            onPress={() => handleArchive(item)}
                            className="p-2 rounded-xl active:bg-rose-50 flex-row items-center gap-1.5 border-t border-slate-100"
                          >
                            <Archive size={10} color="#dc2626" />
                            <Text className="text-[10px] font-bold text-red-600">
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

        {/* Excel Product Import Preview Modal */}
        <Modal visible={isImportModalOpen} animationType="fade" transparent>
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white w-[90%] md:w-[80%] lg:w-[70%] rounded-3xl border border-border shadow-panel p-4.5 justify-between flex-col" style={{ maxHeight: '90%' }}>
              
              <View className="flex-1 flex-col overflow-hidden">
                {/* Header */}
                <View className="flex-row justify-between items-center border-b border-slate-100 pb-3 mb-3">
                  <View className="flex-row items-center gap-2">
                    <Upload size={15} color={colors.primary} />
                    <Text className="text-sm font-black text-slate-900">
                      Product Excel Import Verification & Dry-run
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setIsImportModalOpen(false);
                      setImportSummary(null);
                    }}
                  >
                    <X size={16} color="#64748b" />
                  </Pressable>
                </View>

                {/* Summary cards */}
                {importSummary && (
                  <View className="flex-row gap-2 mb-3 flex-wrap">
                    <View className="flex-1 min-w-[100px] bg-slate-50 border border-slate-100 rounded-2xl p-2.5 items-center">
                      <Text className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Rows</Text>
                      <Text className="text-base font-black text-slate-800 mt-1">{importSummary.totalRows}</Text>
                    </View>
                    <View className="flex-1 min-w-[100px] bg-emerald-50/70 border border-emerald-100 rounded-2xl p-2.5 items-center">
                      <Text className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">To Create</Text>
                      <Text className="text-base font-black text-emerald-700 mt-1">{importSummary.createCount}</Text>
                    </View>
                    <View className="flex-1 min-w-[100px] bg-blue-50/70 border border-blue-100 rounded-2xl p-2.5 items-center">
                      <Text className="text-[9px] font-black text-blue-600 uppercase tracking-widest">To Update</Text>
                      <Text className="text-base font-black text-blue-700 mt-1">{importSummary.updateCount}</Text>
                    </View>
                    <View className="flex-1 min-w-[100px] bg-rose-50/70 border border-rose-100 rounded-2xl p-2.5 items-center">
                      <Text className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Errors</Text>
                      <Text className="text-base font-black text-rose-700 mt-1">{importSummary.errorRows}</Text>
                    </View>
                  </View>
                )}

                {/* Warnings Alert Banner for Recipes/etc. */}
                {importSummary && importSummary.rows.some(r => r.warnings.length > 0) && (
                  <View className="mb-3 bg-amber-50 border border-amber-200 rounded-2xl p-2.5 gap-0.5">
                    <View className="flex-row items-center gap-1 mb-0.5">
                      <AlertCircle size={13} color="#d97706" />
                      <Text className="text-[11px] font-black text-amber-800">
                        Import Warnings Notification
                      </Text>
                    </View>
                    <Text className="text-[10px] text-amber-700 font-medium">
                      Missing product categories will be auto-created during execution. Recipes will NOT be auto-created; rows referencing missing recipe codes will be imported without recipe links.
                    </Text>
                  </View>
                )}

                {/* Table Details */}
                <View className="flex-1 overflow-hidden border border-slate-200 rounded-2xl mb-3 bg-slate-50/30 flex-col">
                  
                  {/* Table Header */}
                  <View className="flex-row border-b border-slate-200 p-2.5 bg-slate-50/50">
                    <View style={{ width: '25%' }}><Text className="text-[8px] font-black text-slate-400 uppercase">Product Name</Text></View>
                    <View style={{ width: '12%', alignItems: 'flex-end' }}><Text className="text-[8px] font-black text-slate-400 uppercase">Price</Text></View>
                    <View style={{ width: '20%' }}><Text className="text-[8px] font-black text-slate-400 uppercase">Category Assignment</Text></View>
                    <View style={{ width: '15%' }}><Text className="text-[8px] font-black text-slate-400 uppercase">Tracking</Text></View>
                    <View style={{ width: '16%' }}><Text className="text-[8px] font-black text-slate-400 uppercase">Recipe Link</Text></View>
                    <View style={{ width: '12%', alignItems: 'center' }}><Text className="text-[8px] font-black text-slate-400 uppercase">Action</Text></View>
                  </View>

                  {/* Table Body */}
                  <FlatList
                    data={importSummary ? importSummary.rows : []}
                    keyExtractor={(item, idx) => String(idx)}
                    showsVerticalScrollIndicator={true}
                    renderItem={({ item: row }) => {
                      const isError = row.status === 'invalid';
                      const isUpdate = row.action === 'update';
                      
                      let actionBadgeColor = 'bg-emerald-50 border-emerald-200 text-emerald-700';
                      let actionBadgeText = 'Create';
                      
                      if (isError) {
                        actionBadgeColor = 'bg-rose-50 border-rose-200 text-rose-700';
                        actionBadgeText = 'Error';
                      } else if (isUpdate) {
                        actionBadgeColor = 'bg-blue-50 border-blue-200 text-blue-700';
                        actionBadgeText = 'Update';
                      }

                      return (
                        <View className="flex-row items-start py-1.5 border-b border-slate-100 px-2 hover:bg-slate-50/50">
                          <View style={{ width: '25%' }} className="pr-1.5">
                            <Text className={`text-[11px] font-semibold ${isError ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                              {row.productName || 'N/A'}
                            </Text>
                            {isError && row.errors.map((e, eIdx) => (
                              <Text key={eIdx} className="text-[8px] text-rose-600 font-bold mt-0.5">
                                • {e}
                              </Text>
                            ))}
                          </View>
                          <View style={{ width: '12%', alignItems: 'flex-end' }} className="pr-2">
                            <Text className="text-[11px] text-slate-700 font-black font-mono">₹{row.price.toFixed(2)}</Text>
                          </View>
                          <View style={{ width: '20%' }} className="pr-1.5">
                            <Text className="text-[11px] text-slate-600 font-semibold">{row.categoryName || 'N/A'}</Text>
                            {!row.categoryId && !!row.categoryName ? (
                              <View className="bg-amber-50 border border-amber-100 px-0.75 py-0.25 rounded self-start mt-0.5 animate-pulse">
                                <Text className="text-[7.5px] text-amber-700 font-extrabold">Auto-create</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ width: '15%' }}>
                            <Text className="text-[11px] text-slate-500 font-bold uppercase">
                              {row.inventoryTrackingEnabled ? 'Enabled' : 'Disabled'}
                            </Text>
                          </View>
                          <View style={{ width: '16%' }} className="pr-1">
                            <Text className="text-[11px] text-slate-600 font-medium truncate">{row.linkedRecipeCode || 'N/A'}</Text>
                            {!row.recipeId && !!row.linkedRecipeCode ? (
                              <View className="bg-rose-50 border border-rose-100 px-0.75 py-0.25 rounded self-start mt-0.5">
                                <Text className="text-[7.5px] text-rose-700 font-extrabold">Not Linked</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ width: '12%', alignItems: 'center' }}>
                            <View className={`px-2 py-0.25 rounded-full border ${actionBadgeColor}`}>
                              <Text className="text-[8px] font-black uppercase">{actionBadgeText}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    }}
                  />
                </View>
              </View>

              {/* Actions Footer */}
              <View className="flex-row justify-end border-t border-slate-100 pt-3 gap-2.5">
                <Pressable
                  onPress={() => {
                    setIsImportModalOpen(false);
                    setImportSummary(null);
                  }}
                  className="bg-slate-100 border border-slate-200 py-1.5 px-5 rounded-xl active:scale-95 shadow-xs items-center justify-center"
                  style={{ minHeight: 36 }}
                >
                  <Text className="text-[11px] font-bold text-slate-600">Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleExecuteImport}
                  disabled={isImporting || !importSummary || importSummary.validRows === 0}
                  className={`py-1.5 px-5 rounded-xl flex-row items-center justify-center gap-1.5 active:scale-95 shadow-xs ${
                    !importSummary || importSummary.validRows === 0
                      ? 'bg-slate-200 border border-slate-200'
                      : 'bg-primary active:opacity-90'
                  }`}
                  style={{ minHeight: 36 }}
                >
                  {isImporting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Check size={12} color="white" strokeWidth={3} />
                      <Text className="text-[11px] font-bold text-white">
                        Confirm Import ({importSummary ? importSummary.validRows : 0} Rows)
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

            </View>
          </View>
        </Modal>

        <Modal visible={isModalOpen} animationType="fade" transparent>
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white w-[90%] md:w-[65%] lg:w-[45%] max-w-lg rounded-3xl border border-border shadow-2xl p-5 flex-col" style={{ maxHeight: '90%' }}>
              
              <View className="flex-row items-center gap-1.5 border-b border-border pb-2.5 mb-3">
                <Sparkles size={16} color={colors.primary} />
                <Text className="text-base font-black text-text-primary">
                  {isEditMode ? 'Modify Product Specifications' : 'Create New Menu Product'}
                </Text>
              </View>

              {formError && (
                <View className="flex-row items-center gap-2 bg-red-50 p-3 border border-red-200 rounded-xl mb-3">
                  <AlertCircle size={16} color="#dc2626" />
                  <Text className="text-red-700 font-semibold flex-1 text-xs">{formError}</Text>
                </View>
              )}

              {/* Scrollable Form Body */}
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Form Input Grid */}
                <View className="flex-row flex-wrap -mx-1.5">
                  <View className="w-full px-1.5 mb-3">
                    <Text className="text-[11px] font-bold text-text-primary mb-1.5">Product Name</Text>
                    <TextInput
                      value={formInput.name}
                      onChangeText={(text) => setFormInput(prev => ({ ...prev, name: text }))}
                      placeholder="e.g. UFO Chocolate Burger"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-3 py-2 text-text-primary bg-slate-50 focus:bg-white text-xs font-semibold"
                      style={{ minHeight: 36 }}
                    />
                  </View>

                  <View className="w-full md:w-1/2 px-1.5 mb-3">
                    <Text className="text-[11px] font-bold text-text-primary mb-1.5">Pricing (₹)</Text>
                    <TextInput
                      value={formInput.price}
                      onChangeText={(text) => setFormInput(prev => ({ ...prev, price: text }))}
                      placeholder="e.g. 290"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-3 py-2 text-text-primary bg-slate-50 focus:bg-white text-xs font-black font-mono"
                      style={{ minHeight: 36 }}
                      keyboardType="numeric"
                    />
                  </View>

                  <View className="w-full md:w-1/2 px-1.5 mb-3">
                    <Text className="text-[11px] font-bold text-text-primary mb-1.5">Availability Status</Text>
                    <View className="flex-row items-center gap-2.5 bg-slate-50 border border-border px-3 rounded-xl h-9" style={{ height: 36 }}>
                      <Switch
                        value={formInput.is_available}
                        onValueChange={(val) => setFormInput(prev => ({ ...prev, is_available: val }))}
                        trackColor={{ false: '#cbd5e1', true: colors.accent }}
                        thumbColor={formInput.is_available ? colors.primary : '#f4f3f4'}
                        style={{ transform: [{ scale: 0.7 }] }}
                      />
                      <Text className="text-[11px] font-bold text-text-primary">Instant Available ON</Text>
                    </View>
                  </View>

                  <View className="w-full px-1.5 mb-3">
                    <Text className="text-[11px] font-bold text-text-primary mb-1.5">Category Assignment</Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {categories.map((cat) => {
                        const isSelected = formInput.category_id === cat.id;
                        return (
                          <Pressable
                            key={cat.id}
                            className={`px-3 py-1.5 border rounded-xl items-center justify-center ${
                              isSelected ? 'bg-primary border-primary shadow-xs' : 'bg-slate-50 border-border active:bg-slate-100'
                            }`}
                            style={{ minHeight: 34 }}
                            onPress={() => setFormInput(prev => ({ ...prev, category_id: cat.id }))}
                          >
                            <Text className={`font-bold text-[11px] ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                              {cat.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Recipe Association & Settings */}
                  <View className="w-full px-1.5 border-t border-slate-100 pt-3 mt-1">
                    <Text className="text-[11px] font-black text-text-primary mb-2.5">Recipe Association</Text>
                    
                    <View className="w-full mb-1.5">
                      <Text className="text-[11px] font-bold text-text-primary mb-1.5">Linked Recipe</Text>
                      <View className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <select
                          value={formInput.recipe_id}
                          onChange={(e) => setFormInput(prev => ({ ...prev, recipe_id: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '8.5px 12px',
                            fontSize: 11,
                            border: 'none',
                            outline: 'none',
                            backgroundColor: '#FFFFFF',
                            fontWeight: '600',
                            color: colors.textPrimary
                          }}
                        >
                          <option value="">-- No Linked Recipe --</option>
                          {recipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.recipe_name || r.name} ({r.recipe_code}) - Cost: ₹{(r.cost_snapshot || 0).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </View>
                    </View>
                  </View>
                </View>
              </ScrollView>

              <View className="flex-row gap-3 border-t border-border pt-3 mt-3 justify-end">
                <Pressable
                  className="px-5 rounded-xl border border-border bg-white active:bg-slate-50 items-center justify-center"
                  style={{ height: 36 }}
                  onPress={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  <Text className="font-bold text-text-secondary text-xs">Cancel</Text>
                </Pressable>

                <Pressable
                  className="px-6 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-1.5 shadow-sm"
                  style={{ height: 36 }}
                  onPress={handleSave}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="font-bold text-white text-xs">Save Specifications</Text>
                  )}
                </Pressable>
              </View>

            </View>
          </View>
        </Modal>

      </View>
    </View>
  );
}
