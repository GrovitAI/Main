import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Modal,
} from 'react-native';
import {
  Plus,
  Trash2,
  Copy,
  Layers,
  Search,
  X,
  Check,
  Calculator,
  TrendingUp,
  TrendingDown,
  BookOpen,
  AlertCircle,
  ChevronRight,
  Flame,
  History,
  BarChart2,
  Package,
  Star,
  ChevronDown,
  Pencil,
  Save,
  RefreshCcw,
  ArrowDown,
  Minus,
} from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import {
  fetchRecipes,
  fetchRecipeItems,
  saveRecipe,
  deleteRecipe,
  fetchMaterials,
  fetchUnits,
  fetchStockLedger,
  type InventoryRecipe,
  type InventoryRecipeItem,
  type InventoryMaterial,
  type InventoryStockLedger,
} from '@/lib/pos/inventory-service';
import { getProducts, type Product } from '@/lib/pos/products-service';
import { useUIContext } from '@/lib/pos/ui-context';

// ─── Constants ─────────────────────────────────────────────────────────────────

type CostBasis = 'average' | 'last_purchase';
type RightTab = 'details' | 'cost_analysis' | 'consumption';
type RecipeType = 'MENU_ITEM' | 'PRODUCTION';

interface RecipeItemDraft {
  id?: string;
  material_id: string;
  quantity: string;
  selected_unit?: string;
}

interface CompletenessStatus {
  label: 'Complete' | 'Missing Ingredients' | 'Missing Product Link' | 'No Ingredients';
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function generateRecipeCode(productName?: string): string {
  const prefix = productName
    ? productName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6)
    : 'REC';
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${suffix}`;
}

function getCompletenessStatus(
  recipe: InventoryRecipe,
  items: InventoryRecipeItem[],
  materials: InventoryMaterial[],
): CompletenessStatus {
  const hasProductLink = !!recipe.menu_item_id;
  const hasItems = items.length > 0;
  const allMaterialsValid = items.every((itm) => materials.some((m) => m.id === itm.material_id));

  if (!hasItems) {
    return {
      label: 'No Ingredients',
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
      icon: <AlertCircle size={10} color="#dc2626" />,
    };
  }
  if (!allMaterialsValid) {
    return {
      label: 'Missing Ingredients',
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      icon: <AlertCircle size={10} color="#d97706" />,
    };
  }
  if (!hasProductLink) {
    return {
      label: 'Missing Product Link',
      color: '#7c3aed',
      bg: '#f5f3ff',
      border: '#ddd6fe',
      icon: <AlertCircle size={10} color="#7c3aed" />,
    };
  }
  return {
    label: 'Complete',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icon: <Check size={10} color="#059669" />,
  };
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

interface AutocompleteProps<T> {
  value: string;
  onChange: (id: string, item: T) => void;
  items: T[];
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string;
  placeholder: string;
  disabled?: boolean;
}

function Autocomplete<T extends { id: string }>({
  value,
  onChange,
  items,
  getLabel,
  getSublabel,
  placeholder,
  disabled = false,
}: AutocompleteProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<React.ElementRef<typeof Pressable>>(null);

  const selected = items.find((i) => i.id === value);
  const displayText = selected ? getLabel(selected) : '';

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return items.filter((i) => getLabel(i).toLowerCase().includes(q)).slice(0, 20);
  }, [items, query, getLabel]);

  const openDropdown = () => {
    if (disabled) return;
    if (triggerRef.current) {
      // measure() returns absolute page coordinates — works on both native and web
      (triggerRef.current as any).measure(
        (_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
          setDropdownPos({ top: pageY + height + 4, left: pageX, width });
          setOpen(true);
        },
      );
    } else {
      setOpen(true);
    }
  };

  const handleSelect = (item: T) => {
    onChange(item.id, item);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange('', items[0]);
    setQuery('');
  };

  return (
    <View>
      {/* Trigger button */}
      <Pressable
        ref={triggerRef}
        onPress={open ? () => setOpen(false) : openDropdown}
        className={`flex-row items-center border rounded-xl px-3 ${
          disabled ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'
        }`}
        style={{ height: 40 }}
      >
        <Text
          className={`flex-1 text-xs font-semibold ${
            selected ? 'text-text-primary' : 'text-slate-400'
          }`}
          numberOfLines={1}
        >
          {selected ? displayText : placeholder}
        </Text>
        {selected && !disabled && (
          <Pressable onPress={handleClear} hitSlop={8}>
            <X size={12} color="#94a3b8" />
          </Pressable>
        )}
        {!selected && <ChevronDown size={14} color="#94a3b8" />}
      </Pressable>

      {/* Dropdown rendered in a Modal to escape ScrollView / overflow:hidden clipping */}
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => { setOpen(false); setQuery(''); }}
      >
        {/* Full-screen backdrop — tap outside to close */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => { setOpen(false); setQuery(''); }}
        >
          {/* Inner pressable stops touches from bubbling to the backdrop */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              backgroundColor: '#ffffff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.12,
              shadowRadius: 20,
              elevation: 24,
              overflow: 'hidden',
            }}
          >
            {/* Search input */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: '#f1f5f9',
                paddingHorizontal: 12,
                height: 38,
              }}
            >
              <Search size={12} color="#94a3b8" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Type to search..."
                placeholderTextColor="#94a3b8"
                style={{
                  flex: 1,
                  marginLeft: 8,
                  fontSize: 12,
                  fontWeight: '600',
                  color: '#0f2744',
                  height: '100%',
                } as any}
                autoFocus
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <X size={11} color="#94a3b8" />
                </Pressable>
              )}
            </View>

            {/* Results list */}
            <ScrollView
              style={{ maxHeight: 220 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filtered.length === 0 ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500' }}>
                    No results
                  </Text>
                </View>
              ) : (
                filtered.map((item, idx) => (
                  <Pressable
                    key={item.id}
                    onPress={() => handleSelect(item)}
                    style={({ pressed, hovered }: any) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderBottomWidth: idx < filtered.length - 1 ? 1 : 0,
                      borderBottomColor: '#f8fafc',
                      backgroundColor: pressed || hovered ? '#eff6ff' : '#ffffff',
                    })}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f2744' }}>
                      {getLabel(item)}
                    </Text>
                    {getSublabel && (
                      <Text style={{ fontSize: 10, color: '#5b6b7c', marginTop: 2 }}>
                        {getSublabel(item)}
                      </Text>
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}


function getUnitConversionMultiplier(enteredUnit: string, baseUnit: string): number {
  const ent = enteredUnit.toLowerCase().trim();
  const base = baseUnit.toLowerCase().trim();
  
  const isWeightBase = base === 'kg' || base === 'kilogram' || base === 'kilograms';
  const isWeightGram = base === 'g' || base === 'gram' || base === 'grams';
  
  const isVolumeBase = base === 'l' || base === 'litre' || base === 'litres' || base === 'ltr';
  const isVolumeMl = base === 'ml' || base === 'millilitre' || base === 'millilitres';
  
  if (isWeightBase) {
    if (ent === 'g' || ent === 'gram' || ent === 'grams') return 0.001;
    return 1;
  }
  if (isWeightGram) {
    if (ent === 'kg' || ent === 'kilogram' || ent === 'kilograms') return 1000;
    return 1;
  }
  
  if (isVolumeBase) {
    if (ent === 'ml' || ent === 'millilitre' || ent === 'millilitres') return 0.001;
    return 1;
  }
  if (isVolumeMl) {
    if (ent === 'l' || ent === 'litre' || ent === 'litres' || ent === 'ltr') return 1000;
    return 1;
  }
  
  return 1;
}

function getCompatibleUnitOptions(baseUnit: string): string[] {
  const base = baseUnit.toLowerCase().trim();
  const isWeight = base === 'kg' || base === 'kilogram' || base === 'kilograms' || base === 'g' || base === 'gram' || base === 'grams';
  if (isWeight) {
    return ['kg', 'g'];
  }
  const isVolume = base === 'l' || base === 'litre' || base === 'litres' || base === 'ltr' || base === 'ml' || base === 'millilitre' || base === 'millilitres';
  if (isVolume) {
    return ['L', 'ml'];
  }
  return [baseUnit];
}

function formatRecipeQuantity(qty: number, baseUnit: string): string {
  const base = baseUnit.toLowerCase().trim();
  if (base === 'l' || base === 'litre' || base === 'litres' || base === 'ltr') {
    if (qty < 1 && qty > 0) {
      return `${(qty * 1000).toFixed(0)} ml`;
    }
    return `${qty} L`;
  }
  if (base === 'kg' || base === 'kilogram' || base === 'kilograms') {
    if (qty < 1 && qty > 0) {
      return `${(qty * 1000).toFixed(0)} g`;
    }
    return `${qty} kg`;
  }
  return `${qty} ${baseUnit}`;
}

function getInitialDraftQtyAndUnit(qty: number, baseUnit: string): { quantity: string; selected_unit: string } {
  const base = baseUnit.toLowerCase().trim();
  if (base === 'l' || base === 'litre' || base === 'litres' || base === 'ltr') {
    if (qty < 1 && qty > 0) {
      return { quantity: String(qty * 1000), selected_unit: 'ml' };
    }
    return { quantity: String(qty), selected_unit: 'L' };
  }
  if (base === 'kg' || base === 'kilogram' || base === 'kilograms') {
    if (qty < 1 && qty > 0) {
      return { quantity: String(qty * 1000), selected_unit: 'g' };
    }
    return { quantity: String(qty), selected_unit: 'kg' };
  }
  return { quantity: String(qty), selected_unit: baseUnit };
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function RecipeManagement() {
  // ── Data State ──────────────────────────────────────────────────────────────
  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ledger, setLedger] = useState<InventoryStockLedger[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Global Settings ─────────────────────────────────────────────────────────
  const [costBasis, setCostBasis] = useState<CostBasis>('average');

  // ── Left Panel State ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Selected Recipe ─────────────────────────────────────────────────────────
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedRecipeItems, setSelectedRecipeItems] = useState<InventoryRecipeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('details');

  // ── Editor State (inline, no modal) ────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form fields
  const [editLinkedProductId, setEditLinkedProductId] = useState('');
  const [editRecipeCode, setEditRecipeCode] = useState('');
  const [editRecipeName, setEditRecipeName] = useState('');
  const [editYieldQuantity, setEditYieldQuantity] = useState('1');
  const [editYieldUnit, setEditYieldUnit] = useState('portion');
  const [editItems, setEditItems] = useState<RecipeItemDraft[]>([]);
  const [openLineUnitDropdownIdx, setOpenLineUnitDropdownIdx] = useState<number | null>(null);
  const [editIngredientSearch, setEditIngredientSearch] = useState('');
  const [recipeType] = useState<RecipeType>('MENU_ITEM'); // hidden; PRODUCTION reserved
  const [formError, setFormError] = useState<string | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  );

  const { setTabBarHidden } = useUIContext();

  // Hide the global tab bar while the inline editor is open
  useEffect(() => {
    const editorOpen = isEditing || isCreating;
    setTabBarHidden(editorOpen);
    return () => {
      setTabBarHidden(false);
    };
  }, [isEditing, isCreating, setTabBarHidden]);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, matRes, prodRes, ledRes] = await Promise.all([
        fetchRecipes(),
        fetchMaterials(),
        getProducts(),
        fetchStockLedger(),
      ]);

      if (recRes.data) setRecipes(recRes.data);
      else if (recRes.error) setError(recRes.error);

      if (matRes.data) setMaterials(matRes.data);
      if (prodRes.data) setProducts(prodRes.data);
      if (ledRes.data) setLedger(ledRes.data);
    } catch {
      setError('Connection failure. Unable to load recipe data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ─── Recipe Selection ──────────────────────────────────────────────────────

  const handleSelectRecipe = useCallback(
    async (recipeId: string) => {
      if (isEditing || isCreating) return; // guard unsaved edits
      setSelectedRecipeId(recipeId);
      setRightTab('details');
      setLoadingItems(true);
      try {
        const res = await fetchRecipeItems(recipeId);
        setSelectedRecipeItems(res.data ?? []);
      } catch {
        setSelectedRecipeItems([]);
      } finally {
        setLoadingItems(false);
      }
    },
    [isEditing, isCreating],
  );

  // ─── Editor Open / Close ───────────────────────────────────────────────────

  const openCreateEditor = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedRecipeId(null);
    setSelectedRecipeItems([]);
    setEditLinkedProductId('');
    setEditRecipeCode('');
    setEditRecipeName('');
    setEditYieldQuantity('1');
    setEditYieldUnit('portion');
    setEditItems([{ material_id: '', quantity: '' }]);
    setFormError(null);
    setRightTab('details');
  };

  const openEditEditor = async (recipe: InventoryRecipe) => {
    setIsEditing(true);
    setIsCreating(false);
    setSelectedRecipeId(recipe.id);
    setEditLinkedProductId(recipe.menu_item_id ?? '');
    setEditRecipeCode(recipe.recipe_code ?? '');
    setEditRecipeName(recipe.recipe_name ?? recipe.name ?? '');
    setEditYieldQuantity(String(recipe.yield_quantity ?? 1));
    setEditYieldUnit(recipe.yield_unit ?? 'portion');
    setFormError(null);
    setRightTab('details');

    setLoadingItems(true);
    try {
      const res = await fetchRecipeItems(recipe.id);
      const items = res.data ?? [];
      setSelectedRecipeItems(items);
      setEditItems(
        items.length > 0
          ? items.map((i) => {
              const mat = materials.find((m) => m.id === i.material_id);
              const initial = getInitialDraftQtyAndUnit(i.quantity ?? 0, mat?.unit_short_name ?? 'units');
              return { id: i.id, material_id: i.material_id, quantity: initial.quantity, selected_unit: initial.selected_unit };
            })
          : [{ material_id: '', quantity: '' }],
      );
    } catch {
      setEditItems([{ material_id: '', quantity: '' }]);
    } finally {
      setLoadingItems(false);
    }
  };

  const cancelEditor = () => {
    setIsEditing(false);
    setIsCreating(false);
    setFormError(null);
    if (!selectedRecipeId && recipes.length > 0) {
      void handleSelectRecipe(recipes[0].id);
    }
  };

  // ─── Duplicate ─────────────────────────────────────────────────────────────

  const handleDuplicate = async (recipe: InventoryRecipe) => {
    setSubmitting(true);
    try {
      const res = await fetchRecipeItems(recipe.id);
      setIsCreating(true);
      setIsEditing(false);
      setSelectedRecipeId(null);
      setEditLinkedProductId('');
      setEditRecipeCode(`${recipe.recipe_code ?? 'REC'}_COPY`);
      setEditRecipeName(`${recipe.recipe_name ?? recipe.name ?? 'Recipe'} (Copy)`);
      setEditYieldQuantity(String(recipe.yield_quantity ?? 1));
      setEditYieldUnit(recipe.yield_unit ?? 'portion');
      setEditItems(
        res.data && res.data.length > 0
          ? res.data.map((i) => {
              const mat = materials.find((m) => m.id === i.material_id);
              const initial = getInitialDraftQtyAndUnit(i.quantity ?? 0, mat?.unit_short_name ?? 'units');
              return { material_id: i.material_id, quantity: initial.quantity, selected_unit: initial.selected_unit };
            })
          : [{ material_id: '', quantity: '' }],
      );
      setFormError(null);
      setRightTab('details');
    } catch {
      Alert.alert('Duplication Failed', 'Could not clone recipe details.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Product selection in editor ──────────────────────────────────────────

  const handleProductSelected = (productId: string, product: Product) => {
    setEditLinkedProductId(productId);
    if (productId) {
      setEditRecipeName(product.name);
      setEditRecipeCode(generateRecipeCode(product.name));
    }
  };

  // ─── Ingredient editor helpers ────────────────────────────────────────────

  const addIngredientRow = () =>
    setEditItems((prev) => [...prev, { material_id: '', quantity: '' }]);

  const removeIngredientRow = (idx: number) =>
    setEditItems((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      return next.length > 0 ? next : [{ material_id: '', quantity: '' }];
    });

  const updateIngredientMaterial = (idx: number, materialId: string) =>
    setEditItems((prev) => {
      const next = [...prev];
      const mat = materials.find((m) => m.id === materialId);
      next[idx] = { 
        ...next[idx], 
        material_id: materialId,
        selected_unit: mat?.unit_short_name || 'units'
      };
      return next;
    });

  const updateIngredientUnit = (idx: number, unit: string) =>
    setEditItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], selected_unit: unit };
      return next;
    });

  const updateIngredientQuantity = (idx: number, qty: string) =>
    setEditItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: qty };
      return next;
    });

  // ─── Live costing (for editor) ────────────────────────────────────────────

  const liveCostInfo = useMemo(() => {
    let total = 0;
    const lines = editItems.map((itm) => {
      const mat = materials.find((m) => m.id === itm.material_id);
      const qtyEntered = parseFloat(itm.quantity) || 0;
      
      const baseUnit = mat?.unit_short_name || 'units';
      const enteredUnit = itm.selected_unit || baseUnit;
      const multiplier = getUnitConversionMultiplier(enteredUnit, baseUnit);
      const qty = qtyEntered * multiplier;

      const unitCost = mat
        ? costBasis === 'average'
          ? (mat.average_cost ?? 0)
          : (mat.last_purchase_price ?? 0)
        : 0;
      const lineCost = qty * unitCost;
      total += lineCost;
      return { mat, qty, unitCost, lineCost };
    });
    const yieldQty = parseFloat(editYieldQuantity) || 1;
    const costPerPortion = total / yieldQty;
    return { lines, total, costPerPortion };
  }, [editItems, materials, costBasis, editYieldQuantity]);

  // ─── Selected recipe costing (for viewer) ────────────────────────────────

  const viewCostInfo = useMemo(() => {
    if (!selectedRecipeItems.length) return null;
    let total = 0;
    const lines = selectedRecipeItems.map((itm) => {
      const mat = materials.find((m) => m.id === itm.material_id);
      const qty = itm.quantity ?? 0;
      const unitCost = mat
        ? costBasis === 'average'
          ? (mat.average_cost ?? 0)
          : (mat.last_purchase_price ?? 0)
        : 0;
      const lineCost = qty * unitCost;
      total += lineCost;
      return { itm, mat, qty, unitCost, lineCost };
    });
    const yieldQty = selectedRecipe?.yield_quantity ?? 1;
    const costPerPortion = total / yieldQty;

    // highest cost driver
    const maxLine = lines.reduce(
      (acc, l, idx) => (l.lineCost > acc.cost ? { idx, cost: l.lineCost } : acc),
      { idx: -1, cost: 0 },
    );

    return { lines, total, costPerPortion, maxLineIdx: maxLine.idx };
  }, [selectedRecipeItems, materials, costBasis, selectedRecipe]);

  // ─── Product margin info ──────────────────────────────────────────────────

  const linkedProduct = useMemo(() => {
    const recipeMenuId = isEditing || isCreating ? editLinkedProductId : selectedRecipe?.menu_item_id;
    return products.find((p) => p.id === recipeMenuId) ?? null;
  }, [products, selectedRecipe, isEditing, isCreating, editLinkedProductId]);

  const marginInfo = useMemo(() => {
    if (!linkedProduct) return null;
    const cost = isEditing || isCreating ? liveCostInfo.costPerPortion : (viewCostInfo?.costPerPortion ?? 0);
    const marginAmt = linkedProduct.price - cost;
    const marginPct = linkedProduct.price > 0 ? (marginAmt / linkedProduct.price) * 100 : 0;
    const foodCostPct = linkedProduct.price > 0 ? (cost / linkedProduct.price) * 100 : 0;
    return { marginAmt, marginPct, foodCostPct, cost };
  }, [linkedProduct, isEditing, isCreating, liveCostInfo, viewCostInfo]);

  // ─── Completeness ─────────────────────────────────────────────────────────

  const completenessStatus = useMemo(() => {
    if (!selectedRecipe) return null;
    return getCompletenessStatus(selectedRecipe, selectedRecipeItems, materials);
  }, [selectedRecipe, selectedRecipeItems, materials]);

  // ─── Consumption history (product-centric) ────────────────────────────────

  const consumptionHistory = useMemo(() => {
    if (!selectedRecipeItems.length) return [];
    const materialIds = new Set(selectedRecipeItems.map((i) => i.material_id));
    return ledger
      .filter(
        (l) =>
          materialIds.has(l.material_id) &&
          (l.transaction_type === 'Consumption' ||
            l.transaction_type === 'Recipe Consumption' ||
            l.transaction_type?.toLowerCase().includes('consumption')),
      )
      .slice(0, 50);
  }, [ledger, selectedRecipeItems]);

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setFormError(null);

    if (!editLinkedProductId) {
      setFormError('Please select a menu product first. Product selection is required.');
      return;
    }
    if (!editRecipeCode.trim()) {
      setFormError('Recipe code is required.');
      return;
    }
    if (!editRecipeName.trim()) {
      setFormError('Recipe name is required.');
      return;
    }
    const parsedYield = parseFloat(editYieldQuantity);
    if (isNaN(parsedYield) || parsedYield <= 0) {
      setFormError('Yield quantity must be a positive number.');
      return;
    }
    const validItems = editItems.filter((i) => i.material_id && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) {
      setFormError('Add at least one ingredient with a quantity > 0.');
      return;
    }

    setSubmitting(true);
    const itemsPayload = validItems.map((i) => {
      const mat = materials.find((m) => m.id === i.material_id);
      const baseUnit = mat?.unit_short_name || 'units';
      const enteredUnit = i.selected_unit || baseUnit;
      const multiplier = getUnitConversionMultiplier(enteredUnit, baseUnit);
      return {
        material_id: i.material_id,
        quantity: parseFloat(i.quantity) * multiplier,
      };
    });

    const recipePayload: Partial<InventoryRecipe> = {
      id: isEditing ? selectedRecipeId ?? undefined : undefined,
      recipe_code: editRecipeCode.trim(),
      recipe_name: editRecipeName.trim(),
      menu_item_id: editLinkedProductId || null,
      is_active: true,
      yield_quantity: parsedYield,
      yield_unit: editYieldUnit.trim() || 'portion',
      cost_snapshot: liveCostInfo.costPerPortion,
    };

    const res = await saveRecipe(recipePayload, itemsPayload);
    setSubmitting(false);

    if (res.error || !res.data) {
      setFormError(res.error ?? 'Failed to save recipe.');
    } else {
      setIsEditing(false);
      setIsCreating(false);
      await loadData();
      setSelectedRecipeId(res.data.id);
      const itemsRes = await fetchRecipeItems(res.data.id);
      setSelectedRecipeItems(itemsRes.data ?? []);
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = (recipe: InventoryRecipe) => {
    const execDelete = async () => {
      setLoading(true);
      const res = await deleteRecipe(recipe.id);
      if (res.error) {
        Alert.alert('Archive Failed', res.error);
      } else {
        if (selectedRecipeId === recipe.id) {
          setSelectedRecipeId(null);
          setSelectedRecipeItems([]);
          setIsEditing(false);
          setIsCreating(false);
        }
        void loadData();
      }
      setLoading(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Archive recipe "${recipe.recipe_name ?? recipe.name}"?`)) {
        void execDelete();
      }
    } else {
      Alert.alert(
        'Archive Recipe?',
        `Are you sure you want to archive "${recipe.recipe_name ?? recipe.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Archive', style: 'destructive', onPress: () => void execDelete() },
        ],
      );
    }
  };

  // ─── Filtered list ────────────────────────────────────────────────────────

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return recipes;
    return recipes.filter((r) => {
      const name = (r.recipe_name ?? r.name ?? '').toLowerCase();
      const code = (r.recipe_code ?? '').toLowerCase();
      const prod = products.find((p) => p.id === r.menu_item_id);
      const prodName = (prod?.name ?? '').toLowerCase();
      return name.includes(q) || code.includes(q) || prodName.includes(q);
    });
  }, [recipes, searchQuery, products]);

  // ─── Right panel content in view mode ────────────────────────────────────

  const renderDetailsTab = () => {
    if (!selectedRecipe) return null;
    const prod = linkedProduct;

    return (
      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {/* Product link card */}
        <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
          <Text className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">
            Linked Menu Product
          </Text>
          {prod ? (
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-black text-text-primary">{prod.name}</Text>
                <Text className="text-[10px] text-text-secondary font-semibold mt-0.5">
                  Selling Price: ₹{prod.price.toFixed(2)}
                </Text>
              </View>
              {completenessStatus && (
                <View
                  className="flex-row items-center gap-1 rounded-full px-2 py-1"
                  style={{
                    backgroundColor: completenessStatus.bg,
                    borderWidth: 1,
                    borderColor: completenessStatus.border,
                  }}
                >
                  {completenessStatus.icon}
                  <Text
                    className="text-[9px] font-black uppercase"
                    style={{ color: completenessStatus.color }}
                  >
                    {completenessStatus.label}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View className="flex-row items-center gap-1.5">
              <AlertCircle size={12} color="#7c3aed" />
              <Text className="text-xs text-slate-500 font-semibold italic">
                No menu product linked
              </Text>
              {completenessStatus && (
                <View
                  className="flex-row items-center gap-1 rounded-full px-2 py-0.5 ml-1"
                  style={{
                    backgroundColor: completenessStatus.bg,
                    borderWidth: 1,
                    borderColor: completenessStatus.border,
                  }}
                >
                  {completenessStatus.icon}
                  <Text
                    className="text-[9px] font-black uppercase"
                    style={{ color: completenessStatus.color }}
                  >
                    {completenessStatus.label}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Ingredient Breakdown Table */}
        <Text className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">
          Ingredient Breakdown
        </Text>
        {loadingItems ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : selectedRecipeItems.length === 0 ? (
          <View className="py-8 border border-dashed border-slate-200 rounded-xl items-center justify-center">
            <Package size={24} color="#94a3b8" />
            <Text className="text-xs text-slate-400 font-semibold mt-2">No ingredients added</Text>
          </View>
        ) : (
          <View className="border border-slate-200 rounded-xl overflow-hidden mb-3">
            {/* Table Header */}
            <View className="flex-row bg-slate-100 border-b border-slate-200 px-3 py-2">
              <Text className="flex-[2] text-[9px] font-black text-text-secondary uppercase">
                Ingredient
              </Text>
              <Text className="w-16 text-[9px] font-black text-text-secondary uppercase text-right">
                Stock
              </Text>
              <Text className="w-20 text-[9px] font-black text-text-secondary uppercase text-right">
                Qty
              </Text>
              <Text className="w-14 text-[9px] font-black text-text-secondary uppercase text-right">
                Unit ₹
              </Text>
              <Text className="w-16 text-[9px] font-black text-text-secondary uppercase text-right">
                Total ₹
              </Text>
            </View>
            {(viewCostInfo?.lines ?? []).map((line, idx) => {
              const mat = line.mat;
              const stock = mat?.current_stock ?? 0;
              const stockLow = stock < (mat?.reorder_level ?? 0);
              return (
                <View
                  key={line.itm.id}
                  className={`flex-row px-3 py-2.5 border-b border-slate-100 items-center ${
                    idx === viewCostInfo?.maxLineIdx ? 'bg-amber-50/40' : ''
                  }`}
                >
                  <View className="flex-[2]">
                    <View className="flex-row items-center gap-1">
                      {idx === viewCostInfo?.maxLineIdx && (
                        <Flame size={9} color="#d97706" />
                      )}
                      <Text className="text-xs font-bold text-text-primary" numberOfLines={1}>
                        {mat ? mat.material_name : 'Unknown'}
                      </Text>
                    </View>
                    <Text className="text-[9px] text-text-secondary mt-0.5">
                      {mat?.unit_short_name ?? ''}
                    </Text>
                  </View>
                  <View className="w-16 items-end">
                    <Text
                      className={`text-[10px] font-bold font-mono ${
                        stockLow ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {stock.toFixed(2)}
                    </Text>
                    {stockLow && (
                      <Text className="text-[8px] text-rose-500 font-bold">LOW</Text>
                    )}
                  </View>
                  <Text className="w-20 text-xs font-bold text-text-secondary text-right font-mono">
                    {formatRecipeQuantity(line.qty, mat?.unit_short_name ?? '')}
                  </Text>
                  <Text className="w-14 text-xs font-semibold text-text-secondary text-right font-mono">
                    ₹{line.unitCost.toFixed(2)}
                  </Text>
                  <Text className="w-16 text-xs font-black text-right font-mono" style={{ color: colors.primary }}>
                    ₹{line.lineCost.toFixed(2)}
                  </Text>
                </View>
              );
            })}
            {/* Total row */}
            <View className="flex-row px-3 py-2.5 bg-slate-50 items-center">
              <Text className="flex-[2] text-[10px] font-black text-text-secondary uppercase">
                Total ({selectedRecipe.yield_quantity} {selectedRecipe.yield_unit})
              </Text>
              <Text className="w-16" />
              <Text className="w-14" />
              <Text className="w-14" />
              <Text className="w-16 text-sm font-black text-right font-mono" style={{ color: colors.primary }}>
                ₹{(viewCostInfo?.total ?? 0).toFixed(2)}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderCostAnalysisTab = () => {
    if (!selectedRecipe || !viewCostInfo) return (
      <View className="flex-1 items-center justify-center py-12">
        <BarChart2 size={28} color="#94a3b8" />
        <Text className="text-xs text-slate-400 font-semibold mt-2">No cost data available</Text>
      </View>
    );

    const sortedLines = [...viewCostInfo.lines].sort((a, b) => b.lineCost - a.lineCost);
    const topLine = sortedLines[0];

    return (
      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {/* Cost driver callout */}
        {topLine && topLine.lineCost > 0 && (
          <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex-row items-center gap-3">
            <View className="w-8 h-8 bg-amber-100 rounded-lg items-center justify-center">
              <Flame size={16} color="#d97706" />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] font-black text-amber-700 uppercase tracking-widest">
                Highest Cost Driver
              </Text>
              <Text className="text-sm font-black text-amber-900 mt-0.5">
                {topLine.mat?.material_name ?? 'Unknown'}
              </Text>
              <Text className="text-[10px] text-amber-700 font-semibold mt-0.5">
                ₹{topLine.lineCost.toFixed(2)} · {((topLine.lineCost / viewCostInfo.total) * 100).toFixed(1)}% of total cost
              </Text>
            </View>
          </View>
        )}

        {/* Cost breakdown bar chart */}
        <Text className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">
          Cost Distribution
        </Text>
        <View className="border border-slate-200 rounded-xl overflow-hidden mb-3">
          {sortedLines.map((line, idx) => {
            const pct = viewCostInfo.total > 0 ? (line.lineCost / viewCostInfo.total) * 100 : 0;
            const isTop = idx === 0;
            return (
              <View key={line.itm.id} className="px-3 py-2.5 border-b border-slate-100">
                <View className="flex-row items-center justify-between mb-1">
                  <View className="flex-row items-center gap-1">
                    {isTop && <Flame size={10} color="#d97706" />}
                    <Text className="text-xs font-bold text-text-primary">
                      {line.mat?.material_name ?? 'Unknown'}
                    </Text>
                  </View>
                  <Text className="text-xs font-black font-mono text-text-primary">
                    ₹{line.lineCost.toFixed(2)}
                    <Text className="text-[9px] font-semibold text-text-secondary"> ({pct.toFixed(1)}%)</Text>
                  </Text>
                </View>
                <View className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isTop ? '#f59e0b' : colors.primary,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Costing basis toggle */}
        <View className="flex-row items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 mb-3">
          <View className="flex-row items-center gap-1.5">
            <Calculator size={14} color={colors.primary} />
            <Text className="text-xs font-black text-text-secondary">Cost Basis</Text>
          </View>
          <View className="flex-row gap-1">
            {(['average', 'last_purchase'] as CostBasis[]).map((b) => (
              <Pressable
                key={b}
                onPress={() => setCostBasis(b)}
                className="px-2.5 py-1 rounded-lg border"
                style={{
                  backgroundColor: costBasis === b ? colors.primary : '#fff',
                  borderColor: costBasis === b ? colors.primary : '#e2e8f0',
                }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: costBasis === b ? '#fff' : colors.textSecondary }}
                >
                  {b === 'average' ? 'Avg Cost' : 'Last Price'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderConsumptionTab = () => (
    <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
      <Text className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">
        Recent Consumption Events
      </Text>
      {consumptionHistory.length === 0 ? (
        <View className="py-12 border border-dashed border-slate-200 rounded-xl items-center justify-center">
          <History size={24} color="#94a3b8" />
          <Text className="text-xs text-slate-400 font-semibold mt-2">
            No consumption records yet
          </Text>
          <Text className="text-[10px] text-slate-400 text-center mt-1 px-4">
            Consumption events appear after orders with this recipe are settled.
          </Text>
        </View>
      ) : (
        <View className="border border-slate-200 rounded-xl overflow-hidden">
          <View className="flex-row bg-slate-100 border-b border-slate-200 px-3 py-2">
            <Text className="flex-[2] text-[9px] font-black text-text-secondary uppercase">Material</Text>
            <Text className="w-16 text-[9px] font-black text-text-secondary uppercase text-right">Date</Text>
            <Text className="w-16 text-[9px] font-black text-text-secondary uppercase text-right">Deducted</Text>
          </View>
          {consumptionHistory.map((l) => (
            <View key={l.id} className="flex-row px-3 py-2.5 border-b border-slate-100 items-center">
              <Text className="flex-[2] text-xs font-bold text-text-primary" numberOfLines={1}>
                {l.material_name ?? 'Material'}
              </Text>
              <Text className="w-16 text-[10px] text-text-secondary text-right font-mono">
                {new Date(l.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </Text>
              <Text className="w-16 text-xs font-black text-rose-600 text-right font-mono">
                -{l.qty_out.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  // ─── Editor Panel ─────────────────────────────────────────────────────────

  const filteredMaterials = useMemo(() => {
    const q = editIngredientSearch.toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.material_name.toLowerCase().includes(q) ||
        (m.material_code ?? '').toLowerCase().includes(q),
    );
  }, [materials, editIngredientSearch]);

  const renderEditor = () => {
    const editorTitle = isCreating ? 'New Recipe' : 'Edit Recipe';

    return (
      <View className="flex-1 flex-col">
        {/* Editor Header */}
        <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <View className="flex-row items-center gap-2">
            <Pencil size={16} color={colors.primary} />
            <Text className="text-base font-black text-text-primary">{editorTitle}</Text>
          </View>
          <Pressable
            onPress={cancelEditor}
            className="w-8 h-8 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200"
          >
            <X size={14} color="#475569" />
          </Pressable>
        </View>

        {formError && (
          <View className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3 flex-row items-start gap-2">
            <AlertCircle size={14} color="#dc2626" />
            <Text className="text-rose-700 text-xs font-bold flex-1">{formError}</Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          {/* Step 1: Product Selection (required first) */}
          <View className="mb-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
            <View className="flex-row items-center gap-1 mb-2">
              <View className="w-5 h-5 bg-primary rounded-full items-center justify-center">
                <Text className="text-white text-[9px] font-black">1</Text>
              </View>
              <Text className="text-xs font-black text-text-primary">Select Menu Product *</Text>
              <Text className="text-[9px] text-rose-500 font-bold">(Required)</Text>
            </View>
            <Autocomplete<Product>
              value={editLinkedProductId}
              onChange={(id, product) => handleProductSelected(id, product)}
              items={products}
              getLabel={(p) => p.name}
              getSublabel={(p) => `₹${p.price.toFixed(2)}`}
              placeholder="Search and select a product..."
            />
          </View>

          {/* Step 2: Recipe identity */}
          <View className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <View className="flex-row items-center gap-1 mb-2">
              <View className="w-5 h-5 bg-slate-400 rounded-full items-center justify-center">
                <Text className="text-white text-[9px] font-black">2</Text>
              </View>
              <Text className="text-xs font-black text-text-primary">Recipe Identity</Text>
            </View>
            <View className="flex-row gap-2 mb-2">
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-text-secondary mb-1">Recipe Name *</Text>
                <TextInput
                  value={editRecipeName}
                  onChangeText={setEditRecipeName}
                  placeholder="Auto-filled from product"
                  placeholderTextColor="#94a3b8"
                  className="border border-slate-200 rounded-xl px-3 text-text-primary text-xs font-semibold bg-white"
                  style={{ height: 36 }}
                />
              </View>
              <View style={{ width: 130 }}>
                <Text className="text-[10px] font-bold text-text-secondary mb-1">Recipe Code *</Text>
                <TextInput
                  value={editRecipeCode}
                  onChangeText={setEditRecipeCode}
                  placeholder="Auto-generated"
                  placeholderTextColor="#94a3b8"
                  className="border border-slate-200 rounded-xl px-3 text-text-primary text-xs font-semibold bg-white font-mono"
                  style={{ height: 36 }}
                />
              </View>
            </View>
            <View className="flex-row gap-2">
              <View style={{ width: 90 }}>
                <Text className="text-[10px] font-bold text-text-secondary mb-1">Yield Qty *</Text>
                <TextInput
                  value={editYieldQuantity}
                  onChangeText={setEditYieldQuantity}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor="#94a3b8"
                  className="border border-slate-200 rounded-xl px-3 text-text-primary text-xs font-semibold bg-white text-right"
                  style={{ height: 36 }}
                />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] font-bold text-text-secondary mb-1">Yield Unit *</Text>
                <TextInput
                  value={editYieldUnit}
                  onChangeText={setEditYieldUnit}
                  placeholder="portion / batch"
                  placeholderTextColor="#94a3b8"
                  className="border border-slate-200 rounded-xl px-3 text-text-primary text-xs font-semibold bg-white"
                  style={{ height: 36 }}
                />
              </View>
            </View>
          </View>

          {/* Step 3: Ingredients */}
          <View className="mb-3 p-3 border border-slate-200 rounded-xl">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-1">
                <View className="w-5 h-5 bg-slate-400 rounded-full items-center justify-center">
                  <Text className="text-white text-[9px] font-black">3</Text>
                </View>
                <Text className="text-xs font-black text-text-primary">Ingredients</Text>
              </View>
              <Pressable
                onPress={addIngredientRow}
                className="flex-row items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg active:bg-slate-200"
              >
                <Plus size={10} color="#475569" />
                <Text className="text-[10px] font-bold text-slate-600">Add Row</Text>
              </Pressable>
            </View>

            {/* Ingredient search filter */}
            <View
              className="flex-row items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 mb-2"
              style={{ height: 32 }}
            >
              <Search size={11} color="#94a3b8" />
              <TextInput
                value={editIngredientSearch}
                onChangeText={setEditIngredientSearch}
                placeholder="Filter materials..."
                placeholderTextColor="#94a3b8"
                className="flex-1 ml-2 text-[11px] font-semibold text-text-primary"
              />
            </View>

            {/* Ingredient table header */}
            <View className="flex-row border-b border-slate-100 pb-1 mb-1">
              <Text className="flex-[2] text-[9px] font-black text-text-secondary uppercase">Material</Text>
              <Text className="w-16 text-[9px] font-black text-text-secondary uppercase text-center">In Stock</Text>
              <Text className="w-14 text-[9px] font-black text-text-secondary uppercase text-right">Qty</Text>
              <Text className="w-14 text-[9px] font-black text-text-secondary uppercase text-center">Unit</Text>
              <Text className="w-16 text-[9px] font-black text-text-secondary uppercase text-right">Line ₹</Text>
              <Text className="w-8" />
            </View>

            {editItems.map((itm, idx) => {
              const mat = materials.find((m) => m.id === itm.material_id);
              const line = liveCostInfo.lines[idx];
              const stock = mat?.current_stock ?? null;
              return (
                <View key={idx} className="flex-row items-center mb-1.5 gap-1" style={{ zIndex: 100 - idx }}>
                  {/* Material selector */}
                  <View className="flex-[2]">
                    <Autocomplete<InventoryMaterial>
                      value={itm.material_id}
                      onChange={(id) => updateIngredientMaterial(idx, id)}
                      items={filteredMaterials}
                      getLabel={(m) => m.material_name}
                      getSublabel={(m) => `${m.unit_short_name} · Stock: ${(m.current_stock ?? 0).toFixed(1)}`}
                      placeholder="Choose material..."
                    />
                  </View>

                  {/* Stock badge */}
                  <View className="w-16 items-center">
                    {stock !== null ? (
                      <Text
                        className={`text-[10px] font-bold font-mono ${
                          mat && stock < (mat.reorder_level ?? 0) ? 'text-rose-500' : 'text-emerald-600'
                        }`}
                      >
                        {stock.toFixed(1)} {mat?.unit_short_name ?? ''}
                      </Text>
                    ) : (
                      <Text className="text-[10px] text-slate-300">—</Text>
                    )}
                  </View>

                  {/* Quantity input */}
                  <TextInput
                    value={itm.quantity}
                    onChangeText={(v) => updateIngredientQuantity(idx, v)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    className="w-14 border border-slate-200 rounded-lg px-2 text-text-primary text-xs font-bold text-right bg-white"
                    style={{ height: 36 }}
                  />

                  {/* Unit Selector */}
                  <View className="w-14 relative" style={{ zIndex: 1000 }}>
                    <Pressable
                      onPress={() => setOpenLineUnitDropdownIdx(openLineUnitDropdownIdx === idx ? null : idx)}
                      className="flex-row items-center justify-between border border-slate-200 rounded-lg px-2 bg-white active:scale-95"
                      style={{ height: 36 }}
                    >
                      <Text className="text-[10px] font-bold text-slate-600">
                        {itm.selected_unit || mat?.unit_short_name || 'Unit'}
                      </Text>
                      <ChevronDown size={8} color="#64748b" />
                    </Pressable>

                    {openLineUnitDropdownIdx === idx && mat && (
                      <View className="absolute top-10 left-0 bg-white border border-slate-200 rounded-lg shadow-lg w-20 p-1 z-[2000]" style={{ zIndex: 2000 }}>
                        {getCompatibleUnitOptions(mat.unit_short_name || 'units').map((opt) => (
                          <Pressable
                            key={opt}
                            onPress={() => {
                              updateIngredientUnit(idx, opt);
                              setOpenLineUnitDropdownIdx(null);
                            }}
                            className={`p-1.5 rounded hover:bg-slate-50 active:bg-slate-100 ${
                              (itm.selected_unit || mat.unit_short_name) === opt ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <Text className={`text-[10px] font-bold ${
                              (itm.selected_unit || mat.unit_short_name) === opt ? 'text-blue-600' : 'text-slate-700'
                            } text-center`}>
                              {opt}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Line cost */}
                  <Text className="w-16 text-xs font-black font-mono text-right" style={{ color: colors.primary }}>
                    {line ? `₹${line.lineCost.toFixed(2)}` : '—'}
                  </Text>

                  {/* Remove */}
                  <Pressable
                    onPress={() => removeIngredientRow(idx)}
                    className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 items-center justify-center active:bg-rose-100"
                  >
                    <Minus size={11} color="#dc2626" />
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Live cost summary */}
          <View className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <Text className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-2">
              Live Cost Preview · {costBasis === 'average' ? 'Avg Cost' : 'Last Purchase'}
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1 bg-white border border-slate-200 rounded-lg p-2 items-center">
                <Text className="text-[9px] text-text-secondary font-bold uppercase">Total Ingredients</Text>
                <Text className="text-sm font-black font-mono text-text-primary mt-0.5">
                  ₹{liveCostInfo.total.toFixed(2)}
                </Text>
              </View>
              <View
                className="flex-1 rounded-lg p-2 items-center border"
                style={{ backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }}
              >
                <Text className="text-[9px] font-bold uppercase" style={{ color: colors.primary }}>
                  Cost / Portion
                </Text>
                <Text className="text-sm font-black font-mono mt-0.5" style={{ color: colors.primary }}>
                  ₹{liveCostInfo.costPerPortion.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Save / Cancel actions */}
        <View className="flex-row gap-2 pt-3 border-t border-slate-100">
          <Pressable
            onPress={cancelEditor}
            className="px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl active:bg-slate-200"
          >
            <Text className="text-slate-700 font-bold text-xs">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSave()}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 active:opacity-90"
            style={{ backgroundColor: colors.primary }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Save size={13} color="white" />
            )}
            <Text className="text-white font-extrabold text-xs">
              {submitting ? 'Saving…' : 'Save Recipe'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // ─── Right panel header ───────────────────────────────────────────────────

  const renderRightPanelHeader = () => {
    if (isEditing || isCreating) return null;
    if (!selectedRecipe) return null;
    return (
      <View className="pb-3 mb-3 border-b border-slate-100">
        <View className="flex-row items-start justify-between mb-1.5">
          <View className="flex-1 mr-3">
            <Text className="text-base font-black text-text-primary" numberOfLines={1}>
              {selectedRecipe.recipe_name ?? selectedRecipe.name}
            </Text>
            <Text className="text-[10px] font-mono text-text-secondary mt-0.5">
              {selectedRecipe.recipe_code} · Yield: {selectedRecipe.yield_quantity}{' '}
              {selectedRecipe.yield_unit}
            </Text>
          </View>
          <View className="flex-row gap-1.5 items-center">
            <Pressable
              onPress={() => void handleDuplicate(selectedRecipe)}
              className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100"
              accessibilityLabel="Duplicate"
            >
              <Copy size={13} color="#475569" />
            </Pressable>
            <Pressable
              onPress={() => void openEditEditor(selectedRecipe)}
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg border active:opacity-80"
              style={{ backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }}
            >
              <Pencil size={11} color={colors.primary} />
              <Text className="text-[10px] font-black" style={{ color: colors.primary }}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleDelete(selectedRecipe)}
              className="w-8 h-8 bg-rose-50 border border-rose-100 rounded-lg items-center justify-center active:bg-rose-100"
              accessibilityLabel="Archive"
            >
              <Trash2 size={13} color="#dc2626" />
            </Pressable>
          </View>
        </View>

        {/* Tab bar */}
        <View className="flex-row gap-1 mt-1">
          {(
            [
              { key: 'details', label: 'Details', icon: <Layers size={11} color={rightTab === 'details' ? '#fff' : colors.textSecondary} /> },
              { key: 'cost_analysis', label: 'Cost Analysis', icon: <BarChart2 size={11} color={rightTab === 'cost_analysis' ? '#fff' : colors.textSecondary} /> },
              { key: 'consumption', label: 'Consumption', icon: <History size={11} color={rightTab === 'consumption' ? '#fff' : colors.textSecondary} /> },
            ] as { key: RightTab; label: string; icon: React.ReactNode }[]
          ).map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setRightTab(tab.key)}
              className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg border"
              style={{
                backgroundColor: rightTab === tab.key ? colors.primary : '#f8fafc',
                borderColor: rightTab === tab.key ? colors.primary : '#e2e8f0',
              }}
            >
              {tab.icon}
              <Text
                className="text-[10px] font-black"
                style={{ color: rightTab === tab.key ? '#fff' : colors.textSecondary }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  // ─── Sticky Footer (profitability) ────────────────────────────────────────

  const renderStickyFooter = () => {
    const cost = isEditing || isCreating ? liveCostInfo.costPerPortion : (viewCostInfo?.costPerPortion ?? 0);
    const recipe = isEditing ? selectedRecipe : null;

    if (!linkedProduct && !marginInfo) {
      return (
        <View className="mt-3 pt-3 border-t border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 flex-row items-center gap-2">
          <Calculator size={14} color="#94a3b8" />
          <Text className="text-xs text-slate-400 font-semibold">
            Link a product to see profitability metrics
          </Text>
        </View>
      );
    }

    const info = marginInfo;
    if (!info) return null;

    const marginColor = info.marginPct >= 60 ? '#059669' : info.marginPct >= 40 ? '#d97706' : '#dc2626';
    const foodCostColor = info.foodCostPct <= 30 ? '#059669' : info.foodCostPct <= 45 ? '#d97706' : '#dc2626';

    return (
      <View
        className="mt-3 pt-3 border-t border-slate-200"
        style={{ borderTopColor: '#e2e8f0' }}
      >
        <Text className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-2">
          Profitability · {linkedProduct?.name}
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          {/* Cost / portion */}
          <View className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 items-center">
            <Text className="text-[8px] font-black text-text-secondary uppercase">Recipe Cost</Text>
            <Text className="text-sm font-black font-mono text-text-primary mt-0.5">
              ₹{info.cost.toFixed(2)}
            </Text>
          </View>

          {/* Selling price */}
          <View className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 items-center">
            <Text className="text-[8px] font-black text-text-secondary uppercase">Selling Price</Text>
            <Text className="text-sm font-black font-mono text-text-primary mt-0.5">
              ₹{linkedProduct!.price.toFixed(2)}
            </Text>
          </View>

          {/* Margin amount */}
          <View
            className="flex-1 min-w-[90px] rounded-xl p-2.5 items-center border"
            style={{
              backgroundColor: `${marginColor}15`,
              borderColor: `${marginColor}30`,
            }}
          >
            <Text className="text-[8px] font-black uppercase" style={{ color: marginColor }}>
              Gross Margin
            </Text>
            <Text className="text-sm font-black font-mono mt-0.5" style={{ color: marginColor }}>
              ₹{info.marginAmt.toFixed(2)}
            </Text>
          </View>

          {/* Margin % */}
          <View
            className="flex-1 min-w-[90px] rounded-xl p-2.5 items-center border"
            style={{
              backgroundColor: `${marginColor}15`,
              borderColor: `${marginColor}30`,
            }}
          >
            <View className="flex-row items-center gap-1">
              <TrendingUp size={8} color={marginColor} />
              <Text className="text-[8px] font-black uppercase" style={{ color: marginColor }}>
                Margin %
              </Text>
            </View>
            <Text className="text-sm font-black font-mono mt-0.5" style={{ color: marginColor }}>
              {info.marginPct.toFixed(1)}%
            </Text>
          </View>

          {/* Food Cost % */}
          <View
            className="flex-1 min-w-[90px] rounded-xl p-2.5 items-center border"
            style={{
              backgroundColor: `${foodCostColor}15`,
              borderColor: `${foodCostColor}30`,
            }}
          >
            <View className="flex-row items-center gap-1">
              <Flame size={8} color={foodCostColor} />
              <Text className="text-[8px] font-black uppercase" style={{ color: foodCostColor }}>
                Food Cost %
              </Text>
            </View>
            <Text className="text-sm font-black font-mono mt-0.5" style={{ color: foodCostColor }}>
              {info.foodCostPct.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-slate-50" style={{ flexDirection: 'row', gap: 12, padding: 4 }}>

      {/* ── LEFT PANEL: Recipe Browser (40%) ─────────────────────────── */}
      <View
        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
        style={{ width: '38%', minWidth: 260 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <View className="flex-row items-center gap-2">
            <BookOpen size={16} color={colors.primary} />
            <Text className="text-base font-black text-text-primary">Recipes</Text>
            <View className="bg-slate-100 rounded-full px-1.5 py-0.5">
              <Text className="text-[10px] font-black text-text-secondary">{recipes.length}</Text>
            </View>
          </View>
          <Pressable
            onPress={openCreateEditor}
            className="flex-row items-center gap-1 px-3 py-2 rounded-xl active:opacity-80"
            style={{ backgroundColor: colors.primary, height: 34 }}
          >
            <Plus size={12} color="white" />
            <Text className="text-white font-extrabold text-[11px]">New</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View
          className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 mb-3"
          style={{ height: 38 }}
        >
          <Search size={13} color="#94a3b8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search recipes, products..."
            placeholderTextColor="#94a3b8"
            className="flex-1 ml-2 text-xs font-semibold text-text-primary"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={12} color="#94a3b8" />
            </Pressable>
          )}
        </View>

        {/* Cost Basis toggle */}
        <View className="flex-row items-center bg-blue-50/60 border border-blue-100 rounded-xl px-2.5 py-2 mb-3 gap-2">
          <Calculator size={13} color={colors.primary} />
          <Text className="text-[10px] font-bold text-text-secondary flex-1">Basis:</Text>
          <View className="flex-row gap-1">
            {(['average', 'last_purchase'] as CostBasis[]).map((b) => (
              <Pressable
                key={b}
                onPress={() => setCostBasis(b)}
                className="px-2 py-1 rounded-lg border"
                style={{
                  backgroundColor: costBasis === b ? colors.primary : '#fff',
                  borderColor: costBasis === b ? colors.primary : '#e2e8f0',
                }}
              >
                <Text
                  className="text-[9px] font-black"
                  style={{ color: costBasis === b ? '#fff' : colors.textSecondary }}
                >
                  {b === 'average' ? 'Avg' : 'Last'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recipe List */}
        {loading ? (
          <View className="flex-1 items-center justify-center py-16">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center py-12 px-4">
            <AlertCircle size={28} color="#dc2626" />
            <Text className="text-rose-600 text-xs font-bold mt-2 text-center">{error}</Text>
            <Pressable
              onPress={() => void loadData()}
              className="mt-3 flex-row items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-100 rounded-xl active:bg-rose-100"
            >
              <RefreshCcw size={12} color="#dc2626" />
              <Text className="text-rose-600 text-xs font-bold">Retry</Text>
            </Pressable>
          </View>
        ) : filteredRecipes.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
            <BookOpen size={28} color="#94a3b8" />
            <Text className="text-text-primary font-bold text-sm mt-2">No Recipes</Text>
            <Text className="text-text-secondary text-xs text-center mt-1 px-4">
              {searchQuery ? 'No matches found.' : 'Create your first recipe to get started.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredRecipes}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isSelected = selectedRecipeId === item.id;
              const prod = products.find((p) => p.id === item.menu_item_id);
              const costSnapshot = item.cost_snapshot ?? 0;
              const marginPct =
                prod && prod.price > 0
                  ? ((prod.price - costSnapshot) / prod.price) * 100
                  : null;

              const mColor =
                marginPct === null
                  ? '#94a3b8'
                  : marginPct >= 60
                  ? '#059669'
                  : marginPct >= 40
                  ? '#d97706'
                  : '#dc2626';

              return (
                <Pressable
                  onPress={() => void handleSelectRecipe(item.id)}
                  className={`p-3 mb-2 rounded-xl border active:opacity-80 ${
                    isSelected
                      ? 'border-primary/40 shadow-sm'
                      : 'border-slate-200 bg-white'
                  }`}
                  style={isSelected ? { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}50` } : {}}
                >
                  {/* Name row */}
                  <View className="flex-row items-start justify-between mb-1">
                    <View className="flex-1 mr-2">
                      <Text className="text-xs font-extrabold text-text-primary" numberOfLines={1}>
                        {item.recipe_name ?? item.name}
                      </Text>
                      {prod && (
                        <Text className="text-[9px] text-text-secondary mt-0.5" numberOfLines={1}>
                          ↳ {prod.name}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: colors.primary }}
                      >
                        <ChevronRight size={10} color="white" />
                      </View>
                    )}
                  </View>

                  {/* Meta row */}
                  <View className="flex-row items-center justify-between flex-wrap gap-1">
                    <Text className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                      {item.recipe_code}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      {/* Cost snapshot */}
                      <Text className="text-[10px] font-black font-mono" style={{ color: colors.primary }}>
                        ₹{costSnapshot.toFixed(2)}
                      </Text>
                      {/* Margin badge */}
                      {marginPct !== null && (
                        <View
                          className="rounded px-1.5 py-0.5"
                          style={{ backgroundColor: `${mColor}18` }}
                        >
                          <Text className="text-[9px] font-black" style={{ color: mColor }}>
                            {marginPct.toFixed(0)}%
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* ── RIGHT PANEL: Editor or Detail Viewer (60%) ──────────────── */}
      <View className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        {isEditing || isCreating ? (
          renderEditor()
        ) : selectedRecipe ? (
          <View className="flex-1 flex-col">
            {renderRightPanelHeader()}

            {/* Tab content */}
            <View className="flex-1">
              {rightTab === 'details' && renderDetailsTab()}
              {rightTab === 'cost_analysis' && renderCostAnalysisTab()}
              {rightTab === 'consumption' && renderConsumptionTab()}
            </View>

            {/* Sticky profitability footer */}
            {renderStickyFooter()}
          </View>
        ) : (
          // Empty state
          <View className="flex-1 items-center justify-center">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: `${colors.primary}10` }}
            >
              <Calculator size={28} color={colors.primary} />
            </View>
            <Text className="text-text-primary font-black text-base mb-1">Recipe Costing Workstation</Text>
            <Text className="text-text-secondary text-xs text-center px-8 mb-5">
              Select a recipe from the left panel to inspect cost breakdowns, margins, and
              consumption history — or create a new recipe.
            </Text>
            <Pressable
              onPress={openCreateEditor}
              className="flex-row items-center gap-2 px-5 py-3 rounded-xl active:opacity-80"
              style={{ backgroundColor: colors.primary }}
            >
              <Plus size={14} color="white" />
              <Text className="text-white font-extrabold text-sm">Create First Recipe</Text>
            </Pressable>
          </View>
        )}
      </View>

    </View>
  );
}
