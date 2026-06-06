import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import {
  Plus,
  Edit2,
  Trash2,
  Copy,
  ArrowRight,
  Sparkles,
  Layers,
  Search,
  X,
  Check,
  Calculator,
  Percent,
  TrendingUp,
  ArrowUpDown,
  BookOpen,
} from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import {
  fetchRecipes,
  fetchRecipeItems,
  saveRecipe,
  deleteRecipe,
  fetchMaterials,
  fetchUnits,
  type InventoryRecipe,
  type InventoryRecipeItem,
  type InventoryMaterial,
  type InventoryUnit,
} from '@/lib/pos/inventory-service';
import { getProducts, type Product } from '@/lib/pos/products-service';

type CostBasis = 'average' | 'last_purchase';

interface RecipeItemForm {
  material_id: string;
  quantity: string;
}

export default function RecipeManagement() {
  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Cost Basis: default to 'average'
  const [costBasis, setCostBasis] = useState<CostBasis>('average');
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal / Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Partial<InventoryRecipe> | null>(null);
  const [recipeItems, setRecipeItems] = useState<RecipeItemForm[]>([]);
  const [recipeCode, setRecipeCode] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [yieldQuantity, setYieldQuantity] = useState('1');
  const [yieldUnit, setYieldUnit] = useState('portion');
  const [linkedProductId, setLinkedProductId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Selected recipe detail view
  const [selectedRecipe, setSelectedRecipe] = useState<InventoryRecipe | null>(null);
  const [selectedRecipeItems, setSelectedRecipeItems] = useState<InventoryRecipeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, matRes, unitRes, prodRes] = await Promise.all([
        fetchRecipes(),
        fetchMaterials(),
        fetchUnits(),
        getProducts(),
      ]);

      if (recRes.error) setError(recRes.error);
      else if (recRes.data) setRecipes(recRes.data);

      if (matRes.error) setError(matRes.error);
      else if (matRes.data) setMaterials(matRes.data);

      if (unitRes.error) setError(unitRes.error);
      else if (unitRes.data) setUnits(unitRes.data);

      if (prodRes.error) setError(prodRes.error);
      else if (prodRes.data) setProducts(prodRes.data);

    } catch (err: any) {
      setError('Connection failure. Unable to synchronize recipe manager.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Handle recipe selection to view cost breakdown
  const handleSelectRecipe = async (recipe: InventoryRecipe) => {
    setSelectedRecipe(recipe);
    setLoadingItems(true);
    try {
      const res = await fetchRecipeItems(recipe.id);
      if (res.data) {
        setSelectedRecipeItems(res.data);
      } else {
        setSelectedRecipeItems([]);
      }
    } catch {
      setSelectedRecipeItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  // Open Form for Adding
  const handleOpenAdd = () => {
    setEditingRecipe(null);
    setRecipeCode(`REC-${Math.floor(1000 + Math.random() * 9000)}`);
    setRecipeName('');
    setYieldQuantity('1');
    setYieldUnit('portion');
    setLinkedProductId('');
    setRecipeItems([{ material_id: '', quantity: '' }]);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = async (recipe: InventoryRecipe) => {
    setFormError(null);
    setEditingRecipe(recipe);
    setRecipeCode(recipe.recipe_code || '');
    setRecipeName(recipe.recipe_name || recipe.name || '');
    setYieldQuantity(String(recipe.yield_quantity || '1'));
    setYieldUnit(recipe.yield_unit || 'portion');
    setLinkedProductId(recipe.menu_item_id || '');

    setSubmitting(true);
    try {
      const res = await fetchRecipeItems(recipe.id);
      if (res.data && res.data.length > 0) {
        setRecipeItems(res.data.map(ri => ({
          material_id: ri.material_id,
          quantity: String(ri.quantity)
        })));
      } else {
        setRecipeItems([{ material_id: '', quantity: '' }]);
      }
    } catch {
      setRecipeItems([{ material_id: '', quantity: '' }]);
    } finally {
      setSubmitting(false);
      setIsModalOpen(true);
    }
  };

  // Duplicate recipe
  const handleDuplicate = async (recipe: InventoryRecipe) => {
    setSubmitting(true);
    try {
      const itemsRes = await fetchRecipeItems(recipe.id);
      const itemsPayload = itemsRes.data && itemsRes.data.length > 0
        ? itemsRes.data.map(ri => ({ material_id: ri.material_id, quantity: String(ri.quantity) }))
        : [{ material_id: '', quantity: '' }];

      setEditingRecipe(null);
      setRecipeCode(`${recipe.recipe_code || 'REC'}_copy`);
      setRecipeName(`${recipe.recipe_name || recipe.name || 'Recipe'}_copy`);
      setYieldQuantity(String(recipe.yield_quantity || '1'));
      setYieldUnit(recipe.yield_unit || 'portion');
      setLinkedProductId('');
      setRecipeItems(itemsPayload);
      setFormError(null);
      setIsModalOpen(true);
    } catch {
      Alert.alert('Duplication Failed', 'Could not clone recipe details.');
    } finally {
      setSubmitting(false);
    }
  };

  // Add ingredient row
  const addIngredientRow = () => {
    setRecipeItems([...recipeItems, { material_id: '', quantity: '' }]);
  };

  // Remove ingredient row
  const removeIngredientRow = (idx: number) => {
    const updated = [...recipeItems];
    updated.splice(idx, 1);
    setRecipeItems(updated.length > 0 ? updated : [{ material_id: '', quantity: '' }]);
  };

  // Update ingredient row
  const updateIngredientRow = (idx: number, field: keyof RecipeItemForm, val: string) => {
    const updated = [...recipeItems];
    updated[idx][field] = val;
    setRecipeItems(updated);
  };

  // Calculate live costing of active form edit session
  const calculatedCostInfo = useMemo(() => {
    let total = 0;
    const list = recipeItems.map(itm => {
      const mat = materials.find(m => m.id === itm.material_id);
      const qty = parseFloat(itm.quantity) || 0;
      const unitCost = mat ? (costBasis === 'average' ? (mat.average_cost || 0) : (mat.last_purchase_price || 0)) : 0;
      const lineCost = qty * unitCost;
      total += lineCost;
      return {
        material_name: mat?.material_name || 'Ingredient',
        qty,
        unit_short_name: mat?.unit_short_name || '',
        unitCost,
        lineCost
      };
    });
    const yieldQty = parseFloat(yieldQuantity) || 1;
    const costPerPortion = total / yieldQty;
    return { list, total, costPerPortion };
  }, [recipeItems, materials, costBasis, yieldQuantity]);

  // Save recipe execution
  const handleSave = async () => {
    if (!recipeCode.trim()) {
      setFormError('Recipe code is required.');
      return;
    }
    if (!recipeName.trim()) {
      setFormError('Recipe name is required.');
      return;
    }
    const parsedYield = parseFloat(yieldQuantity);
    if (isNaN(parsedYield) || parsedYield <= 0) {
      setFormError('Please enter a valid positive yield quantity.');
      return;
    }

    // Filter valid ingredients
    const validItems = recipeItems.filter(itm => itm.material_id && parseFloat(itm.quantity) > 0);
    if (validItems.length === 0) {
      setFormError('Recipe must contain at least one ingredient with a quantity > 0.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const itemsPayload = validItems.map(itm => ({
      material_id: itm.material_id,
      quantity: parseFloat(itm.quantity)
    }));

    const recipePayload: Partial<InventoryRecipe> = {
      id: editingRecipe?.id,
      recipe_code: recipeCode.trim(),
      recipe_name: recipeName.trim(),
      menu_item_id: linkedProductId || null,
      is_active: true,
      yield_quantity: parsedYield,
      yield_unit: yieldUnit.trim() || 'portion',
      cost_snapshot: calculatedCostInfo.costPerPortion
    };

    const res = await saveRecipe(recipePayload, itemsPayload);
    setSubmitting(false);

    if (res.error || !res.data) {
      setFormError(res.error || 'Failed to save recipe.');
    } else {
      setIsModalOpen(false);
      void loadData();
      if (selectedRecipe && selectedRecipe.id === editingRecipe?.id) {
        setSelectedRecipe(res.data);
        const updatedItems = await fetchRecipeItems(res.data.id);
        setSelectedRecipeItems(updatedItems.data || []);
      }
    }
  };

  // Delete recipe
  const handleDelete = (recipe: InventoryRecipe) => {
    const executeDelete = async () => {
      setLoading(true);
      const res = await deleteRecipe(recipe.id);
      if (res.error) {
        Alert.alert('Archive Failed', res.error);
      } else {
        if (selectedRecipe?.id === recipe.id) {
          setSelectedRecipe(null);
          setSelectedRecipeItems([]);
        }
        void loadData();
      }
      setLoading(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Archive recipe “${recipe.recipe_name || recipe.name}”?`)) {
        void executeDelete();
      }
    } else {
      Alert.alert(
        'Archive Recipe?',
        `Are you sure you want to archive “${recipe.recipe_name || recipe.name}”?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Archive', style: 'destructive', onPress: () => void executeDelete() }
        ]
      );
    }
  };

  // Filter recipes
  const filteredRecipes = recipes.filter(r => {
    const query = searchQuery.toLowerCase().trim();
    const matchesName = (r.recipe_name || r.name || '').toLowerCase().includes(query);
    const matchesCode = (r.recipe_code || '').toLowerCase().includes(query);
    return matchesName || matchesCode;
  });

  return (
    <View className="flex-1 bg-slate-50 flex-col lg:flex-row gap-5 p-1">
      
      {/* LEFT PANEL: RECIPE LIST */}
      <View className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm min-h-[400px]">
        <View className="flex-row items-center justify-between pb-4 mb-4 border-b border-slate-100 flex-wrap gap-2">
          <View className="flex-row items-center gap-2">
            <BookOpen size={18} color={colors.primary} />
            <Text className="text-lg font-black text-text-primary">Standard Recipes</Text>
          </View>
          <Pressable
            className="flex-row items-center gap-1 bg-primary px-4 py-2 rounded-xl active:opacity-90"
            onPress={handleOpenAdd}
            style={{ height: 38 }}
          >
            <Plus size={14} color="white" />
            <Text className="text-white font-extrabold text-xs">Create Recipe</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 mb-4" style={{ height: 40 }}>
          <Search size={14} color={colors.textSecondary} className="mr-2" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search recipes by name or code..."
            placeholderTextColor="#94a3b8"
            className="flex-1 text-text-primary text-xs font-semibold h-full"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <X size={14} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Cost Basis Toggle Banner */}
        <View className="flex-row items-center justify-between bg-blue-50/60 border border-blue-100 rounded-xl p-3 mb-4 flex-wrap gap-2">
          <View className="flex-row items-center gap-2">
            <Calculator size={16} color={colors.primary} />
            <Text className="text-text-secondary font-bold text-xs">Cost Basis:</Text>
          </View>
          <View className="flex-row gap-1">
            <Pressable
              onPress={() => setCostBasis('average')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                costBasis === 'average'
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-slate-200 text-text-secondary active:bg-slate-50'
              }`}
            >
              <Text className={`text-[10px] font-bold ${costBasis === 'average' ? 'text-white' : 'text-text-secondary'}`}>
                Average Purchase
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCostBasis('last_purchase')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                costBasis === 'last_purchase'
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-slate-200 text-text-secondary active:bg-slate-50'
              }`}
            >
              <Text className={`text-[10px] font-bold ${costBasis === 'last_purchase' ? 'text-white' : 'text-text-secondary'}`}>
                Last Purchase Price
              </Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredRecipes.length === 0 ? (
          <View className="flex-1 items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
            <BookOpen size={32} color={colors.textSecondary} className="opacity-40" />
            <Text className="text-text-primary font-bold text-sm mt-3">No Recipes Discovered</Text>
            <Text className="text-text-secondary text-xs text-center mt-1 px-4">
              Add standard recipe measurements to manage ingredient consumption.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredRecipes}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isSelected = selectedRecipe?.id === item.id;
              const product = products.find(p => p.id === item.menu_item_id);
              
              // Calculate recipe cost dynamically based on basis
              return (
                <Pressable
                  onPress={() => void handleSelectRecipe(item)}
                  className={`p-3.5 mb-2 border rounded-xl flex-row items-center justify-between active:bg-slate-50 transition-all ${
                    isSelected ? 'bg-blue-50/20 border-primary/40 shadow-xs' : 'bg-white border-slate-200'
                  }`}
                >
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="font-extrabold text-sm text-text-primary">
                        {item.recipe_name || item.name}
                      </Text>
                      <Text className="text-[10px] font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                        {item.recipe_code}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-text-secondary mt-1">
                      Yield: {item.yield_quantity} {item.yield_unit || 'portions'}
                      {product ? ` • Linked: ${product.name}` : ''}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View className="items-end mr-1">
                      <Text className="text-[10px] text-text-secondary uppercase tracking-wider font-extrabold">Cost Snapshot</Text>
                      <Text className="text-sm font-black font-mono text-primary mt-0.5">
                        ₹{(item.cost_snapshot || 0).toFixed(2)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Pressable
                        onPress={() => void handleDuplicate(item)}
                        className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg justify-center items-center active:bg-slate-100"
                        accessibilityLabel="Duplicate Recipe"
                      >
                        <Copy size={12} color="#64748b" />
                      </Pressable>
                      <Pressable
                        onPress={() => void handleOpenEdit(item)}
                        className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg justify-center items-center active:bg-slate-100"
                        accessibilityLabel="Edit Recipe"
                      >
                        <Edit2 size={12} color="#64748b" />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(item)}
                        className="w-8 h-8 bg-rose-50 border border-rose-100 rounded-lg justify-center items-center active:bg-rose-100"
                        accessibilityLabel="Archive Recipe"
                      >
                        <Trash2 size={12} color="#e11d48" />
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* RIGHT PANEL: RECIPE BREAKDOWN DETAILS */}
      <View className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm min-h-[400px]">
        {selectedRecipe ? (
          <View className="flex-1 flex-col">
            <View className="pb-3 border-b border-slate-100 mb-4 flex-row justify-between items-start flex-wrap gap-2">
              <View>
                <View className="flex-row items-center gap-2">
                  <Layers size={18} color={colors.primary} />
                  <Text className="text-base font-black text-text-primary">
                    {selectedRecipe.recipe_name || selectedRecipe.name}
                  </Text>
                </View>
                <Text className="text-xs text-text-secondary mt-0.5 select-all">Code: {selectedRecipe.recipe_code}</Text>
              </View>
              <View className="items-end bg-blue-50/40 border border-blue-100 rounded-xl px-3 py-1.5">
                <Text className="text-[10px] text-text-secondary font-bold">Portion Cost Basis ({costBasis === 'average' ? 'Avg' : 'Last'})</Text>
                <Text className="text-base font-black font-mono text-primary mt-0.5">
                  ₹{(selectedRecipe.cost_snapshot || 0).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Product Mapping Detail Panel */}
            <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
              <Text className="text-[10px] text-text-secondary uppercase tracking-wider font-extrabold mb-1.5">Product Link</Text>
              {(() => {
                const prod = products.find(p => p.id === selectedRecipe.menu_item_id);
                if (prod) {
                  const marginAmt = prod.price - (selectedRecipe.cost_snapshot || 0);
                  const marginPct = prod.price > 0 ? (marginAmt / prod.price) * 100 : 0;
                  return (
                    <View className="flex-row items-center justify-between flex-wrap gap-2">
                      <View>
                        <Text className="text-xs font-bold text-text-primary">{prod.name}</Text>
                        <Text className="text-[10px] text-text-secondary font-semibold mt-0.5">POS Price: ₹{prod.price}</Text>
                      </View>
                      <View className="flex-row gap-1.5">
                        <View className="bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 items-end">
                          <Text className="text-[8px] text-emerald-800 font-extrabold uppercase">Profit Margin</Text>
                          <Text className="text-xs font-black font-mono text-emerald-600 mt-0.5">₹{marginAmt.toFixed(2)}</Text>
                        </View>
                        <View className={`border rounded-lg px-2 py-1 items-end ${marginPct >= 50 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                          <Text className={`text-[8px] font-extrabold uppercase ${marginPct >= 50 ? 'text-emerald-800' : 'text-rose-800'}`}>Margin %</Text>
                          <Text className={`text-xs font-black font-mono mt-0.5 ${marginPct >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>{marginPct.toFixed(1)}%</Text>
                        </View>
                      </View>
                    </View>
                  );
                } else {
                  return (
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-xs text-slate-400 font-semibold italic">No active menu product linked.</Text>
                    </View>
                  );
                }
              })()}
            </View>

            {/* Ingredients Table */}
            <Text className="text-xs font-extrabold text-text-primary mb-2.5">Recipe Ingredient Breakdown</Text>
            {loadingItems ? (
              <View className="py-10 items-center justify-center">
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : selectedRecipeItems.length === 0 ? (
              <View className="py-10 border border-dashed border-slate-200 rounded-xl justify-center items-center">
                <Text className="text-text-secondary text-xs font-medium">No ingredient records link to this recipe.</Text>
              </View>
            ) : (
              <View className="flex-1 border border-slate-200 rounded-xl overflow-hidden mb-4">
                {/* Header */}
                <View className="flex-row bg-slate-100 border-b border-slate-200 p-2.5">
                  <Text className="flex-[2] text-[10px] font-black text-text-secondary uppercase">Ingredient</Text>
                  <Text className="flex-1 text-[10px] font-black text-text-secondary uppercase text-right">Quantity</Text>
                  <Text className="flex-1 text-[10px] font-black text-text-secondary uppercase text-right">Unit Cost</Text>
                  <Text className="flex-1 text-[10px] font-black text-text-secondary uppercase text-right">Total Cost</Text>
                </View>
                <FlatList
                  data={selectedRecipeItems}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const mat = materials.find(m => m.id === item.material_id);
                    const qty = item.quantity || 0;
                    const unitCost = mat ? (costBasis === 'average' ? (mat.average_cost || 0) : (mat.last_purchase_price || 0)) : 0;
                    const lineCost = qty * unitCost;
                    return (
                      <View className="flex-row border-b border-slate-100 p-2.5 items-center">
                        <Text className="flex-[2] text-xs font-bold text-text-primary">
                          {mat ? mat.material_name : 'Unknown Ingredient'}
                        </Text>
                        <Text className="flex-1 text-xs font-bold text-text-secondary text-right font-mono">
                          {qty} {mat?.unit_short_name || ''}
                        </Text>
                        <Text className="flex-1 text-xs font-semibold text-text-secondary text-right font-mono">
                          ₹{unitCost.toFixed(2)}
                        </Text>
                        <Text className="flex-1 text-xs font-bold text-primary text-right font-mono">
                          ₹{lineCost.toFixed(2)}
                        </Text>
                      </View>
                    );
                  }}
                />
              </View>
            )}
          </View>
        ) : (
          <View className="flex-1 items-center justify-center py-24 border border-slate-100 rounded-2xl bg-slate-50/50">
            <Calculator size={36} color={colors.textSecondary} className="opacity-40" />
            <Text className="text-text-primary font-bold text-sm mt-3">Recipe Detail Inspector</Text>
            <Text className="text-text-secondary text-xs text-center mt-1 px-4">
              Select a recipe on the left panel to inspect detailed ingredient measurements and profit margins.
            </Text>
          </View>
        )}
      </View>

      {/* MODAL FORM: CREATE / EDIT RECIPE */}
      {isModalOpen && (
        <View className="absolute inset-0 bg-black/40 z-50 flex-1 items-center justify-center p-6">
          <View className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl p-6 justify-between flex-col" style={{ maxHeight: '90%' }}>
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <View className="flex-row items-center gap-2">
                <Sparkles size={18} color={colors.primary} />
                <Text className="text-base font-black text-text-primary">
                  {editingRecipe ? 'Modify Recipe Details' : 'Create New Menu Recipe'}
                </Text>
              </View>
              <Pressable onPress={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center active:bg-slate-200">
                <X size={16} color="#475569" />
              </Pressable>
            </View>

            {formError && (
              <View className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
                <Text className="text-rose-700 text-xs font-bold">{formError}</Text>
              </View>
            )}

            <ScrollView className="flex-1 pr-1" showsVerticalScrollIndicator={false}>
              {/* Header Fields */}
              <View className="flex-row gap-4 mb-4 flex-wrap">
                <View className="flex-1 min-w-[200px]">
                  <Text className="text-[10px] font-bold text-text-secondary mb-1">Recipe Code *</Text>
                  <TextInput
                    value={recipeCode}
                    onChangeText={setRecipeCode}
                    placeholder="e.g. REC-CHOCO"
                    className="border border-slate-200 rounded-xl p-2.5 text-text-primary text-xs font-semibold bg-slate-50"
                  />
                </View>
                <View className="flex-1 min-w-[200px]">
                  <Text className="text-[10px] font-bold text-text-secondary mb-1">Recipe Name *</Text>
                  <TextInput
                    value={recipeName}
                    onChangeText={setRecipeName}
                    placeholder="e.g. Belgian Chocolate Shake"
                    className="border border-slate-200 rounded-xl p-2.5 text-text-primary text-xs font-semibold"
                  />
                </View>
              </View>

              <View className="flex-row gap-4 mb-4 flex-wrap">
                <View className="flex-1 min-w-[200px]">
                  <Text className="text-[10px] font-bold text-text-secondary mb-1">Yield Quantity *</Text>
                  <TextInput
                    value={yieldQuantity}
                    onChangeText={setYieldQuantity}
                    keyboardType="numeric"
                    placeholder="e.g. 2"
                    className="border border-slate-200 rounded-xl p-2.5 text-text-primary text-xs font-semibold"
                  />
                </View>
                <View className="flex-1 min-w-[200px]">
                  <Text className="text-[10px] font-bold text-text-secondary mb-1">Yield Unit *</Text>
                  <TextInput
                    value={yieldUnit}
                    onChangeText={setYieldUnit}
                    placeholder="e.g. portions / batch"
                    className="border border-slate-200 rounded-xl p-2.5 text-text-primary text-xs font-semibold"
                  />
                </View>
              </View>

              {/* Product link selection */}
              <View className="mb-4">
                <Text className="text-[10px] font-bold text-text-secondary mb-1">Linked Menu Product</Text>
                <View className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <select
                    value={linkedProductId}
                    onChange={(e) => setLinkedProductId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      fontSize: 12,
                      border: 'none',
                      outline: 'none',
                      backgroundColor: '#FFFFFF',
                      fontWeight: '600',
                      color: colors.textPrimary
                    }}
                  >
                    <option value="">-- No Linked Product --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{p.price})
                      </option>
                    ))}
                  </select>
                </View>
              </View>

              {/* Ingredients Editor List */}
              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-2 pb-1 border-b border-slate-100">
                  <Text className="text-xs font-black text-text-primary">Recipe Ingredients</Text>
                  <Pressable
                    onPress={addIngredientRow}
                    className="flex-row items-center gap-1 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg active:bg-slate-200"
                  >
                    <Plus size={10} color="#475569" />
                    <Text className="text-slate-700 font-bold text-[10px]">Add Ingredient</Text>
                  </Pressable>
                </View>

                {recipeItems.map((itm, idx) => {
                  const selectedMat = materials.find(m => m.id === itm.material_id);
                  return (
                    <View key={idx} className="flex-row gap-2 items-center mb-2 flex-wrap">
                      {/* Material Select */}
                      <View className="flex-[3] min-w-[200px] border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <select
                          value={itm.material_id}
                          onChange={(e) => updateIngredientRow(idx, 'material_id', e.target.value)}
                          style={{
                            width: '100%',
                            padding: 10,
                            fontSize: 12,
                            border: 'none',
                            outline: 'none',
                            backgroundColor: '#FFFFFF',
                            fontWeight: '600',
                            color: colors.textPrimary
                          }}
                        >
                          <option value="">-- Choose Material --</option>
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.material_name} ({m.unit_short_name})
                            </option>
                          ))}
                        </select>
                      </View>

                      {/* Quantity Input */}
                      <View className="flex-1 min-w-[80px]">
                        <TextInput
                          value={itm.quantity}
                          onChangeText={(v) => updateIngredientRow(idx, 'quantity', v)}
                          keyboardType="numeric"
                          placeholder="Qty"
                          className="border border-slate-200 rounded-xl p-2 text-text-primary text-xs font-semibold text-right"
                          style={{ height: 38 }}
                        />
                      </View>

                      {/* Display Unit short name */}
                      {selectedMat && (
                        <View className="w-12 items-start justify-center">
                          <Text className="text-[10px] text-text-secondary font-bold font-mono">
                            {selectedMat.unit_short_name || ''}
                          </Text>
                        </View>
                      )}

                      {/* Trash Delete button */}
                      <Pressable
                        onPress={() => removeIngredientRow(idx)}
                        className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 justify-center items-center active:bg-rose-100"
                      >
                        <Trash2 size={12} color="#dc2626" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {/* Live Cost Summary Card */}
              <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                <Text className="text-[10px] font-black text-text-secondary uppercase mb-2">Live Cost Calculation Basis ({costBasis === 'average' ? 'Avg' : 'Last'})</Text>
                <View className="flex-row justify-between items-center flex-wrap gap-2">
                  <View>
                    <Text className="text-xs text-text-secondary font-bold">Total Ingredients Cost:</Text>
                    <Text className="text-sm font-black text-text-primary font-mono mt-0.5">₹{calculatedCostInfo.total.toFixed(2)}</Text>
                  </View>
                  <View className="items-end bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1">
                    <Text className="text-[8px] text-primary font-extrabold uppercase">Cost Per Yield Portion</Text>
                    <Text className="text-sm font-black font-mono text-primary mt-0.5">₹{calculatedCostInfo.costPerPortion.toFixed(2)}</Text>
                  </View>
                </View>
              </View>

            </ScrollView>

            <View className="flex-row justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
              <Pressable
                onPress={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl active:bg-slate-200"
                style={{ height: 38 }}
              >
                <Text className="text-slate-700 font-bold text-xs">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSave()}
                disabled={submitting}
                className="px-4 py-2 bg-primary rounded-xl active:opacity-90 flex-row items-center gap-1.5"
                style={{ height: 38 }}
              >
                {submitting && <ActivityIndicator size="small" color="white" />}
                <Text className="text-white font-extrabold text-xs">Save Recipe</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

    </View>
  );
}
