import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  StyleSheet,
  Modal,
  Platform,
  Alert,
  Easing,
  Animated,
  Image,
} from 'react-native';
import { Search, Plus, GlassWater, Soup, Coffee, ChefHat, Leaf } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Path, Defs, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { useNavigation } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { printReceipt, buildReceiptText, isPrintAgentRunning } from '@/services/printService';

import { CategoryTabs } from '@/components/pos/CategoryTabs';
import { Sidebar } from '@/components/pos/Sidebar';
import { OrderPanel } from '@/components/pos/OrderPanel';
import { ProductCard } from '@/components/pos/ProductCard';
import { SettlementModal } from '@/components/pos/SettlementModal';
import { colors } from '@/lib/pos/brand';
import {
  calculateOrderSubtotal,
  calculateOrderTotal,
  TAX_RATE,
} from '@/lib/pos/order-utils';
import {
  getCategories,
  getProducts,
  type Category,
  type Product,
} from '@/lib/pos/products-service';
import { useOrdersStore } from '@/lib/pos/use-orders-store';
import { seedDevDatabase } from '@/lib/pos/dev-seed';

const TABLET_BREAKPOINT = 768;

type ModalType =
  | null
  | 'save_kot_first'
  | 'save_kot_update'
  | 'cancel_order'
  | 'unsaved_edits_guard'
  | 'draft_collision_guard'
  | 'empty_unpaid_prevention';

type PendingAction = {
  type: 'create' | 'select';
  targetId?: string;
};

// Reusable premium confirmation modal
type ConfirmModalProps = {
  visible: boolean;
  title: string;
  description: string;
  buttons: {
    text: string;
    onPress: () => void | Promise<void>;
    variant?: 'primary' | 'secondary' | 'danger';
  }[];
  onClose: () => void;
};

function CustomConfirmModal({ visible, title, description, buttons, onClose }: ConfirmModalProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Reset highlight when modal opens or buttons change
  useEffect(() => {
    if (visible) {
      setHighlightedIndex(0);
    }
  }, [visible, buttons.length]);

  // Scoped keyboard listener — only active while modal is visible
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || buttons.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const len = buttons.length;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % len);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + len) % len);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const btn = buttons[highlightedIndex];
        if (btn) {
          void btn.onPress();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, buttons, highlightedIndex, onClose]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 45, 90, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f2744', marginBottom: 8 }}>{title}</Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#5b6b7c', lineHeight: 18, marginBottom: 24 }}>{description}</Text>
          {Platform.OS === 'web' && buttons.length > 1 && (
            <Text style={{ fontSize: 10, fontWeight: '500', color: '#94A3B8', marginBottom: 10, textAlign: 'center' }}>
              Use ← → or Tab to navigate · Enter to confirm · Esc to close
            </Text>
          )}
          <View style={{ gap: 8 }}>
            {buttons.map((btn, index) => {
              const isPrimary = btn.variant === 'primary';
              const isDanger = btn.variant === 'danger';
              const isHighlighted = index === highlightedIndex;
              
              let bgColor = '#FFFFFF';
              let textColor = '#0066b2';
              let borderColor = '#0066b2';
              let borderWidth = 2;
              
              if (isPrimary) {
                bgColor = '#0066b2';
                textColor = '#FFFFFF';
                borderWidth = 0;
              } else if (isDanger) {
                bgColor = '#EF4444';
                textColor = '#FFFFFF';
                borderWidth = 0;
              } else if (btn.variant === 'secondary') {
                bgColor = '#F1F5F9';
                textColor = '#475569';
                borderWidth = 0;
              }

              // Premium highlight overrides
              let highlightStyle = {};
              if (isHighlighted && Platform.OS === 'web') {
                if (isPrimary) {
                  highlightStyle = {
                    borderWidth: 2,
                    borderColor: '#80B3FF',
                    shadowColor: '#0066b2',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.25,
                    shadowRadius: 12,
                    elevation: 6,
                    transform: [{ scale: 1.02 }],
                  };
                } else if (isDanger) {
                  highlightStyle = {
                    borderWidth: 2,
                    borderColor: '#FCA5A5',
                    shadowColor: '#EF4444',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.2,
                    shadowRadius: 12,
                    elevation: 6,
                    transform: [{ scale: 1.02 }],
                  };
                } else {
                  // secondary / default
                  highlightStyle = {
                    borderWidth: 2,
                    borderColor: '#0066b2',
                    backgroundColor: '#E8F2FA',
                    shadowColor: '#0066b2',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 4,
                    transform: [{ scale: 1.02 }],
                  };
                }
              }
              
              return (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  onPress={btn.onPress}
                  onHoverIn={() => setHighlightedIndex(index)}
                  style={[
                    { height: 46, borderRadius: 14, backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center', borderWidth: borderWidth, borderColor: borderColor },
                    highlightStyle,
                  ]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: textColor }}>{btn.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function PosBillingScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_BREAKPOINT;
  const productColumns = isTablet ? 4 : 2;

  // ─── Zustand selectors only (high performance) ───
  const orders = useOrdersStore((s) => s.orders);
  const heldOrders = useOrdersStore((s) => s.heldOrders);
  const activeOrderId = useOrdersStore((s) => s.activeOrderId);
  const activeOrderItems = useOrdersStore((s) => s.activeOrderItems);
  const itemCountByOrderId = useOrdersStore((s) => s.itemCountByOrderId);
  const isLoadingOrders = useOrdersStore((s) => s.isLoadingOrders);
  const isLoadingActiveOrder = useOrdersStore((s) => s.isLoadingActiveOrder);
  const isMutating = useOrdersStore((s) => s.isMutating);
  const isEditingUnpaid = useOrdersStore((s) => s.isEditingUnpaid);
  const hasUnsavedChanges = useOrdersStore((s) => s.hasUnsavedChanges);
  const isReadOnlyView = useOrdersStore((s) => s.isReadOnlyView);
  const billPrintedByOrderId = useOrdersStore((s) => s.billPrintedByOrderId);
  const ordersError = useOrdersStore((s) => s.error);

  const loadOrders = useOrdersStore((s) => s.loadOrders);
  const setProductCatalog = useOrdersStore((s) => s.setProductCatalog);
  const selectOrder = useOrdersStore((s) => s.selectOrder);
  const createOrder = useOrdersStore((s) => s.createOrder);
  const addProductToActiveOrder = useOrdersStore((s) => s.addProductToActiveOrder);
  const incrementItem = useOrdersStore((s) => s.incrementItem);
  const decrementItem = useOrdersStore((s) => s.decrementItem);
  const removeItem = useOrdersStore((s) => s.removeItem);
  const resetCart = useOrdersStore((s) => s.resetCart);
  const holdOrder = useOrdersStore((s) => s.holdOrder);
  const saveKot = useOrdersStore((s) => s.saveKot);
  const saveAndPrint = useOrdersStore((s) => s.saveAndPrint);
  const settleBill = useOrdersStore((s) => s.settleBill);
  const cancelOrder = useOrdersStore((s) => s.cancelOrder);
  const enterEditMode = useOrdersStore((s) => s.enterEditMode);
  const discardChanges = useOrdersStore((s) => s.discardChanges);
  const clearError = useOrdersStore((s) => s.clearError);

  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [settlementVisible, setSettlementVisible] = useState(false);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [heldHighlightedIndex, setHeldHighlightedIndex] = useState(0);

  // Guard Modals & Safeguard States
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Local Print Agent Health Check state
  const [printAgentOnline, setPrintAgentOnline] = useState<boolean | null>(null);

  const [activeAction, setActiveAction] = useState<'save_kot' | 'save_print' | 'settle' | null>(null);

  useEffect(() => {
    if (!isMutating) {
      setActiveAction(null);
    }
  }, [isMutating]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const isOnline = await isPrintAgentRunning();
        setPrintAgentOnline(isOnline);
      } catch {
        setPrintAgentOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const [timeStr, setTimeStr] = useState('11:42 AM');
  const [dateStr, setDateStr] = useState('20 May 2025');

  const isInitialLoading =
    (isLoadingOrders && orders.length === 0) || (catalogLoading && allProducts.length === 0);

  // Loading animations & splash states
  const [loadingFinished, setLoadingFinished] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const loadingFadeAnim = useRef(new Animated.Value(1)).current;
  const loadingScaleAnim = useRef(new Animated.Value(1)).current;
  const loadingSpinAnim = useRef(new Animated.Value(0)).current;
  const itemSplashScaleAnim = useRef(new Animated.Value(1)).current;

  // Video player configuration for full-screen loading screen
  const videoAsset = require('../../../assets/Loading_Screen.mp4');
  const videoSource = Image.resolveAssetSource(videoAsset);
  const videoPlayer = useVideoPlayer(videoSource?.uri || '', (player) => {
    player.muted = true;
    player.loop = true;
    player.play();
  });

  // Fail-safe to ensure autoplay works on web after mount
  useEffect(() => {
    if (videoPlayer) {
      videoPlayer.muted = true;
      videoPlayer.loop = true;
      videoPlayer.play();
    }
  }, [videoPlayer]);

  // Enforce minimum 3 seconds loader display and animate progress bar
  useEffect(() => {
    Animated.timing(loadingProgress, {
      toValue: 1,
      duration: 3000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 3000);

    const startTime = Date.now();
    const duration = 3000;
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgressPercent(pct);
      if (pct >= 100) {
        clearInterval(progressInterval);
      }
    }, 30);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, []);

  // Endless spinner rotation
  useEffect(() => {
    let spinLoop: Animated.CompositeAnimation | null = null;
    spinLoop = Animated.loop(
      Animated.timing(loadingSpinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoop.start();
    return () => spinLoop?.stop();
  }, [loadingSpinAnim]);

  useEffect(() => {
    if (!isInitialLoading && minTimeElapsed && !loadingFinished) {
      // 1. Splash item scale (explodes outwards)
      Animated.timing(itemSplashScaleAnim, {
        toValue: 5,
        duration: 550,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }).start();

      // 2. Main overlay fade out and scale up
      Animated.parallel([
        Animated.timing(loadingFadeAnim, {
          toValue: 0,
          duration: 550,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(loadingScaleAnim, {
          toValue: 1.15,
          duration: 550,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setLoadingFinished(true);
      });
    }
  }, [isInitialLoading, minTimeElapsed]);

  const rotateSpin = loadingSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const renderCheckItem = (label: string, sub: string, checked: boolean) => {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 160 }}>
        {checked ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900', marginTop: -1 }}>✓</Text>
          </View>
        ) : (
          <Animated.View style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: 'rgba(51, 153, 255, 0.2)',
            borderTopColor: '#3399ff',
            transform: [{
              rotate: rotateSpin
            }]
          }} />
        )}
        <View style={{ alignItems: 'flex-start' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
          <Text style={{ color: checked ? '#A3E635' : '#94A3B8', fontSize: 9.5, fontWeight: '600', marginTop: 1 }}>{sub}</Text>
        </View>
      </View>
    );
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      setTimeStr(`${hours}:${minutes} ${ampm}`);

      const day = now.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      setDateStr(`${day} ${month} ${year}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === activeOrderId) ?? null,
    [orders, activeOrderId],
  );

  const activeOrderIndex = useMemo(
    () => orders.findIndex((order) => order.id === activeOrderId),
    [orders, activeOrderId],
  );

  // Derived filtered selectors
  const draftOrders = useMemo(
    () => orders.filter((o) => o.status === 'draft' || o.status === 'open'),
    [orders]
  );
  
  const heldOrdersFiltered = useMemo(
    () => orders.filter((o) => o.status === 'held'),
    [orders]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [qtyMode, setQtyMode] = useState(false);
  const [qtyInput, setQtyInput] = useState('1');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const searchRef = useRef<TextInput>(null);
  const qtyRef = useRef<TextInput>(null);
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setTimeout(() => {
        searchRef.current?.focus();
      }, 50);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isInitialLoading) return;

    const frame = requestAnimationFrame(() => {
      window.focus();
      searchRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isInitialLoading]);

  useEffect(() => {
    if (qtyMode) {
      const timer = setTimeout(() => {
        qtyRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [qtyMode]);

  // Blur search input when confirmation modal opens so its window listener becomes keyboard owner
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (activeModal) {
      searchRef.current?.blur();
    }
  }, [activeModal]);



  const visibleProducts = useMemo(() => {
    const activeOnly = allProducts.filter((product) => product.is_available !== false);
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      return activeOnly.filter((product) => product.name.toLowerCase().includes(q));
    }
    if (!selectedCategoryId) {
      return activeOnly;
    }
    return activeOnly.filter((product) => product.category_id === selectedCategoryId);
  }, [allProducts, selectedCategoryId, searchQuery]);



  const handleQtySubmit = useCallback(async () => {
    const trimmed = qtyInput.trim();
    const isPositiveInteger = /^[1-9]\d*$/.test(trimmed);
    if (!isPositiveInteger) {
      showToast('Please enter a valid positive quantity.');
      qtyRef.current?.focus();
      return;
    }

    // Accidental edit intercept for locked unpaid orders
    const isUnpaid = activeOrder ? (activeOrder.status === 'unpaid' || activeOrder.status === 'in_kitchen') : false;
    if (isUnpaid && !isEditingUnpaid) {
      showToast('This bill is locked. Tap "Edit Bill" to make changes.');
      return;
    }

    const qtyVal = parseInt(trimmed, 10);
    if (selectedProduct) {
      await addProductToActiveOrder(selectedProduct, qtyVal);
      showToast(`${selectedProduct.name} ×${qtyVal} added.`);
    }
    setSearchQuery('');
    setQtyMode(false);
    setSelectedProduct(null);
    setQtyInput('1');
    setTimeout(() => {
      searchRef.current?.focus();
    }, 50);
  }, [qtyInput, selectedProduct, activeOrder, isEditingUnpaid, addProductToActiveOrder, showToast]);

  const handleQtyKeyPress = useCallback((e: any) => {
    const key = e.nativeEvent.key;
    if (key === 'Enter') {
      e.preventDefault?.();
      void handleQtySubmit();
    } else if (key === 'Escape' || key === 'Esc') {
      e.preventDefault?.();
      setSearchQuery('');
      setQtyMode(false);
      setSelectedProduct(null);
      setQtyInput('1');
      setTimeout(() => {
        searchRef.current?.focus();
      }, 50);
    }
  }, [handleQtySubmit]);

  const orderTotal = useMemo(() => {
    const subtotal = calculateOrderSubtotal(activeOrderItems);
    return calculateOrderTotal(subtotal, TAX_RATE);
  }, [activeOrderItems]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);

    const [categoriesResult, productsResult] = await Promise.all([
      getCategories(),
      getProducts(),
    ]);

    if (categoriesResult.error) {
      setCatalogError(categoriesResult.error);
    } else {
      setCategories(categoriesResult.data ?? []);
    }

    if (productsResult.error) {
      setCatalogError(productsResult.error);
    } else {
      const products = productsResult.data ?? [];
      setAllProducts(products);
      setProductCatalog(products);
    }

    setCatalogLoading(false);
  }, [setProductCatalog]);

  useEffect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[Grovit] Running DEV seed');
      void (async () => {
        await seedDevDatabase();
        void loadOrders();
        void loadCatalog();
      })();
    } else {
      void loadOrders();
      void loadCatalog();
    }
  }, [loadOrders, loadCatalog]);

  const handleRetry = useCallback(() => {
    clearError();
    setCatalogError(null);
    void loadOrders();
    void loadCatalog();
  }, [clearError, loadOrders, loadCatalog]);

  // ─── stable useCallback wrappers to avoid re-renders ───
  const handleAddProduct = useCallback((product: Product) => {
    if (isMutating) return;

    // Block when inspecting a closed bill
    if (isReadOnlyView) {
      showToast('This bill is read-only.');
      return;
    }

    // Accidental edit intercept for locked unpaid orders
    const isUnpaid = activeOrder ? (activeOrder.status === 'unpaid' || activeOrder.status === 'in_kitchen') : false;
    if (isUnpaid && !isEditingUnpaid) {
      showToast('This bill is locked. Tap "Edit Bill" to make changes.');
      return;
    }
    void addProductToActiveOrder(product, 1);
  }, [isMutating, isReadOnlyView, activeOrder, isEditingUnpaid, addProductToActiveOrder, showToast]);

  const handleIncrementItem = useCallback((itemId: string) => {
    if (isMutating) return;
    void incrementItem(itemId);
  }, [isMutating, incrementItem]);

  const handleDecrementItem = useCallback((itemId: string) => {
    if (isMutating) return;
    void decrementItem(itemId);
  }, [isMutating, decrementItem]);

  const handleRemoveItem = useCallback((itemId: string) => {
    if (isMutating) return;
    void removeItem(itemId);
  }, [isMutating, removeItem]);

  // Intercepting transitions (creating new or switching active orders)
  const executePendingAction = useCallback(async (action: PendingAction) => {
    if (action.type === 'create') {
      await createOrder();
      showToast('New order started.');
    } else if (action.type === 'select' && action.targetId) {
      const success = await selectOrder(action.targetId);
      if (success) {
        showToast('Resumed active order.');
      } else {
        showToast('Could not open order. Please try again.');
      }
    }
    setPendingAction(null);
  }, [createOrder, selectOrder, showToast]);

  const handleCreateOrderClick = useCallback(() => {
    if (isMutating) return;

    if (isEditingUnpaid && hasUnsavedChanges) {
      setPendingAction({ type: 'create' });
      setActiveModal('unsaved_edits_guard');
    } else if (activeOrder && activeOrder.status === 'draft' && activeOrderItems.length > 0) {
      setPendingAction({ type: 'create' });
      setActiveModal('draft_collision_guard');
    } else {
      void createOrder();
      showToast('New order started.');
    }
  }, [isMutating, isEditingUnpaid, hasUnsavedChanges, activeOrder, activeOrderItems.length, createOrder, showToast]);

  const handleSelectOrderClick = useCallback((targetId: string) => {
    if (isMutating || targetId === activeOrderId) return;

    if (isEditingUnpaid && hasUnsavedChanges) {
      setPendingAction({ type: 'select', targetId });
      setActiveModal('unsaved_edits_guard');
    } else if (activeOrder && activeOrder.status === 'draft' && activeOrderItems.length > 0) {
      setPendingAction({ type: 'select', targetId });
      setActiveModal('draft_collision_guard');
    } else {
      void selectOrder(targetId).then((success) => {
        if (success) {
          showToast('Loaded active order.');
        } else {
          showToast('Could not open order. Please try again.');
        }
      });
    }
  }, [isMutating, activeOrderId, isEditingUnpaid, hasUnsavedChanges, activeOrder, activeOrderItems.length, selectOrder, showToast]);

  // KOT Confirmation Handlers
  const handleSaveKotClick = useCallback(() => {
    if (isMutating) return;

    if (activeOrderItems.length === 0) {
      setActiveModal('empty_unpaid_prevention');
      return;
    }

    const hasUnsent = activeOrderItems.some((item) => !item.kot_sent);
    if (!hasUnsent) {
      showToast('No changes since last KOT.');
      return;
    }

    if (activeOrder && (activeOrder.status === 'unpaid' || activeOrder.status === 'in_kitchen')) {
      setActiveModal('save_kot_update');
    } else {
      setActiveModal('save_kot_first');
    }
  }, [isMutating, activeOrderItems, activeOrder, showToast]);

  const confirmSaveKotFirst = useCallback(async () => {
    setActiveModal(null);
    setActiveAction('save_kot');
    const success = await saveKot();
    if (success) {
      showToast('KOT saved and sent to kitchen.');
    }
  }, [saveKot, showToast]);

  const confirmSaveKotUpdate = useCallback(async () => {
    setActiveModal(null);
    setActiveAction('save_kot');
    const success = await saveKot();
    if (success) {
      showToast('KOT updated and sent to kitchen.');
    }
  }, [saveKot, showToast]);

  const handleSaveAndPrintClick = useCallback(async () => {
    if (isMutating) return;
    if (activeOrderItems.length === 0) {
      showToast('Cannot Save & Print for an empty cart.');
      return;
    }
    setActiveAction('save_print');
    
    // Capture order details before saveAndPrint updates the active state
    const currentOrderId = activeOrderId;
    const orderName = activeOrder?.order_name || `Order #${activeOrderId}`;
    const invoiceNumber = activeOrder?.invoice_number;
    const items = activeOrderItems.map((item) => ({
      name: item.product_name || item.item_name || 'Item',
      qty: item.qty,
      price: item.price,
    }));
    const totalAmount = activeOrderItems.reduce((sum, item) => sum + item.qty * item.price, 0);

    const success = await saveAndPrint();
    if (success) {
      showToast('Provisional bill printed.');
      
      void (async () => {
        try {
          const printerName = typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem('billingPrinter')
            : null;

          if (printerName) {
            // Retrieve updated order details from store to get the assigned order number!
            const updatedOrder = useOrdersStore.getState().orders.find((o) => o.id === currentOrderId);
            const updatedOrderName = updatedOrder?.order_name || orderName;
            const updatedInvoiceNumber = updatedOrder?.invoice_number || invoiceNumber;

            const receiptText = buildReceiptText(updatedOrderName, updatedInvoiceNumber, items, totalAmount);
            const printResult = await printReceipt(printerName, receiptText);
            if (printResult.success) {
              showToast('Provisional bill printed successfully.');
            } else {
              showToast(`Provisional bill saved. (Print failed: ${printResult.error || 'unknown error'})`);
            }
          }
        } catch (printErr) {
          console.warn('[Print] Silent provisional printing failed:', printErr);
        }
      })();
    }
  }, [isMutating, activeOrderId, activeOrder, activeOrderItems, saveAndPrint, showToast]);

  // Cancel order handler
  const handleCancelClick = useCallback(() => {
    if (isMutating) return;
    setActiveModal('cancel_order');
  }, [isMutating]);

  const confirmCancelOrder = useCallback(async () => {
    setActiveModal(null);
    await cancelOrder();
    showToast('Order cancelled.');
  }, [cancelOrder, showToast]);

  // Hold order wrapper
  const confirmHoldOrder = useCallback(async () => {
    if (isMutating) return;
    await holdOrder();
    showToast('Cart held.');
  }, [isMutating, holdOrder, showToast]);

  // Edit Bill wrapper
  const handleEditBillClick = useCallback(() => {
    if (isMutating) return;
    enterEditMode();
    showToast('Editing active bill.');
  }, [isMutating, enterEditMode, showToast]);

  // Discard Changes / Reset Cart wrapper
  const handleDiscardChangesClick = useCallback(async () => {
    if (isMutating) return;
    if (isEditingUnpaid) {
      await discardChanges();
      showToast('Unsaved edits discarded.');
    } else {
      await resetCart();
      showToast('Cart cleared.');
    }
  }, [isMutating, isEditingUnpaid, discardChanges, resetCart, showToast]);

  // Start New Order from read-only inspection
  const handleStartNewOrder = useCallback(async () => {
    await createOrder();
    showToast('New order started.');
  }, [createOrder, showToast]);

  // Settle Bill wrapper (double settlement check)
  const handleSettleClick = useCallback(() => {
    if (isMutating) return;
    if (activeOrder && activeOrder.status === 'paid') {
      showToast('Bill already settled.');
      return;
    }
    setSettlementVisible(true);
  }, [isMutating, activeOrder, showToast]);

  const confirmSettlement = useCallback(async (paymentType: string = 'cash') => {
    setActiveAction('settle');
    // 1. Capture order details before settleBill wipes the active cart state
    const items = activeOrderItems.map((item) => ({
      name: item.item_name || 'Item',
      qty: item.qty,
      price: item.price,
    }));
    const totalAmount = activeOrderItems.reduce((sum, item) => sum + item.qty * item.price, 0);

    // 2. Perform DB write
    const result = await settleBill(paymentType);
    const success = !!(result && !result.error && result.data);
    
    // 3. Printing asynchronously after successful save
    if (success && result.data) {
      showToast('Bill settled successfully.');
      const updatedOrder = result.data;
      
      void (async () => {
        try {
          const printerName = typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem('billingPrinter')
            : null;

          if (printerName) {
            const receiptText = buildReceiptText(
              updatedOrder.order_name,
              updatedOrder.invoice_number,
              items,
              totalAmount,
              updatedOrder.payment_method
            );
            const printResult = await printReceipt(printerName, receiptText);
            if (printResult.success) {
              showToast('Bill settled & receipt printed.');
            } else {
              showToast(`Bill settled successfully. (Print failed: ${printResult.error || 'unknown error'})`);
            }
          }
        } catch (printErr) {
          console.warn('[Print] Silent thermal printing failed:', printErr);
        }
      })();
    } else {
      showToast(result?.error || 'Settlement failed. Please try again.');
    }
    return success;
  }, [settleBill, activeOrderItems, showToast]);

  // Guard Modals mapping
  const activeModalConfig = useMemo(() => {
    if (!activeModal) return null;

    switch (activeModal) {
      case 'save_kot_first':
        return {
          title: 'Save KOT and send to kitchen?',
          description: 'This will create an unpaid kitchen order and send items to preparation.',
          buttons: [
            { text: 'Save KOT', onPress: confirmSaveKotFirst, variant: 'primary' as const },
            { text: 'Back', onPress: () => setActiveModal(null), variant: 'secondary' as const },
          ],
        };
      case 'save_kot_update':
        return {
          title: 'Update KOT?',
          description: 'This will update the existing kitchen order. Ensure changes are final.',
          buttons: [
            { text: 'Update KOT', onPress: confirmSaveKotUpdate, variant: 'primary' as const },
            { text: 'Back', onPress: () => setActiveModal(null), variant: 'secondary' as const },
          ],
        };
      case 'cancel_order':
        return {
          title: 'Cancel this order?',
          description: 'This order will be cancelled permanently and removed from active billing.',
          buttons: [
            { text: 'Cancel Order', onPress: confirmCancelOrder, variant: 'danger' as const },
            { text: 'Back', onPress: () => setActiveModal(null), variant: 'secondary' as const },
          ],
        };
      case 'empty_unpaid_prevention':
        return {
          title: 'Bill cannot be empty',
          description: 'You cannot save an empty kitchen order. Would you like to cancel this order instead?',
          buttons: [
            { text: 'Cancel Order instead', onPress: confirmCancelOrder, variant: 'danger' as const },
            { text: 'Back', onPress: () => setActiveModal(null), variant: 'secondary' as const },
          ],
        };
      case 'unsaved_edits_guard':
        return {
          title: 'You have unsaved bill changes',
          description: 'Do you want to save changes before leaving this bill?',
          buttons: [
            {
              text: 'Save & Continue',
              onPress: async () => {
                setActiveModal(null);
                const success = await saveKot();
                if (success && pendingAction) {
                  showToast('KOT updated.');
                  await executePendingAction(pendingAction);
                } else {
                  setPendingAction(null);
                }
              },
              variant: 'primary' as const,
            },
            {
              text: 'Discard Changes',
              onPress: async () => {
                setActiveModal(null);
                await discardChanges();
                if (pendingAction) {
                  await executePendingAction(pendingAction);
                }
              },
              variant: 'danger' as const,
            },
            {
              text: 'Continue Editing',
              onPress: () => {
                setActiveModal(null);
                setPendingAction(null);
              },
              variant: 'secondary' as const,
            },
          ],
        };
      case 'draft_collision_guard':
        return {
          title: 'You already have an active order',
          description: 'You have an active draft cart. What would you like to do before switching?',
          buttons: [
            {
              text: 'Hold & Switch',
              onPress: async () => {
                setActiveModal(null);
                await holdOrder();
                const checkState = useOrdersStore.getState();
                if (checkState.activeOrderId === null && pendingAction) {
                  showToast('Cart held.');
                  await executePendingAction(pendingAction);
                } else {
                  showToast('Could not hold cart. Staying on current bill.');
                  setPendingAction(null);
                }
              },
              variant: 'primary' as const,
            },
            {
              text: 'Discard & Switch',
              onPress: async () => {
                setActiveModal(null);
                await resetCart();
                if (pendingAction) {
                  await executePendingAction(pendingAction);
                }
              },
              variant: 'danger' as const,
            },
            {
              text: 'Continue Current',
              onPress: () => {
                setActiveModal(null);
                setPendingAction(null);
              },
              variant: 'secondary' as const,
            },
          ],
        };
      default:
        return null;
    }
  }, [
    activeModal,
    pendingAction,
    confirmSaveKotFirst,
    confirmSaveKotUpdate,
    confirmCancelOrder,
    saveKot,
    discardChanges,
    holdOrder,
    resetCart,
    executePendingAction,
    showToast,
  ]);

  const handleSearchKeyPress = useCallback((e: any) => {
    const key = e.nativeEvent.key;
    const altKey = e.nativeEvent.altKey;

    // ── Modal overlays active — settlement & confirmation modals own their own focus ──
    if (settlementVisible || activeModal) {
      return;
    }

    // ── Held orders popover keyboard interception ──
    if (popoverVisible && heldOrdersFiltered.length > 0) {
      if (key === 'ArrowDown' || key === 'ArrowRight' || (key === 'Tab' && !e.nativeEvent.shiftKey)) {
        e.preventDefault?.();
        setHeldHighlightedIndex((prev) => (prev + 1) % heldOrdersFiltered.length);
        return;
      }
      if (key === 'ArrowUp' || key === 'ArrowLeft' || (key === 'Tab' && e.nativeEvent.shiftKey)) {
        e.preventDefault?.();
        setHeldHighlightedIndex((prev) => (prev - 1 + heldOrdersFiltered.length) % heldOrdersFiltered.length);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault?.();
        const order = heldOrdersFiltered[heldHighlightedIndex];
        if (order) {
          setPopoverVisible(false);
          setHeldHighlightedIndex(0);
          handleSelectOrderClick(order.id);
        }
        return;
      }
      if (key === 'Escape' || key === 'Esc') {
        e.preventDefault?.();
        setPopoverVisible(false);
        setHeldHighlightedIndex(0);
        return;
      }
      // Block all other keys while popover is navigating
      return;
    }

    // Alt + N or F6: New Order
    if ((altKey && key.toLowerCase() === 'n') || key === 'F6') {
      e.preventDefault?.();
      handleCreateOrderClick();
      return;
    }
    // Alt + K or F2: Save / Update KOT
    if ((altKey && key.toLowerCase() === 'k') || key === 'F2') {
      e.preventDefault?.();
      const isDraft = activeOrder && (activeOrder.status === 'draft' || activeOrder.status === 'open');
      const hasUnsent = activeOrderItems.some((item) => !item.kot_sent);
      const canSaveKot = !isReadOnlyView && hasUnsent && (isDraft || isEditingUnpaid);
      if (canSaveKot) {
        handleSaveKotClick();
      }
      return;
    }
    // Alt + P or F3: Save & Print
    if ((altKey && key.toLowerCase() === 'p') || key === 'F3') {
      e.preventDefault?.();
      handleSaveAndPrintClick();
      return;
    }
    // Alt + H or F4: Hold Order
    if ((altKey && key.toLowerCase() === 'h') || key === 'F4') {
      e.preventDefault?.();
      const isDraft = activeOrder && (activeOrder.status === 'draft' || activeOrder.status === 'open');
      const hasItems = activeOrderItems.length > 0;
      if (isDraft && hasItems && !isMutating) {
        void confirmHoldOrder();
      }
      return;
    }
    // Alt + R: Reset Cart / Discard Changes
    if (altKey && key.toLowerCase() === 'r') {
      e.preventDefault?.();
      const hasItems = activeOrderItems.length > 0;
      if (activeOrder && !isMutating) {
        if (isEditingUnpaid) {
          if (Platform.OS === 'web') {
            if (window.confirm('Discard unsaved edits?')) {
              void handleDiscardChangesClick();
            }
          } else {
            Alert.alert('Discard unsaved edits?', 'All unsaved changes will be lost.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: () => void handleDiscardChangesClick() }
            ]);
          }
        } else if (hasItems) {
          if (Platform.OS === 'web') {
            if (window.confirm('Clear current cart?\n\nThis will remove all items from the current cart.')) {
              void handleDiscardChangesClick();
            }
          } else {
            Alert.alert('Clear current cart?', 'This will remove all items from the current cart.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear Cart', style: 'destructive', onPress: () => void handleDiscardChangesClick() }
            ]);
          }
        }
      }
      return;
    }
    // Alt + S or F8: Settle Bill
    if ((altKey && key.toLowerCase() === 's') || key === 'F8') {
      e.preventDefault?.();
      handleSettleClick();
      return;
    }
    // /: Select all text if already focused
    if (key === '/') {
      e.preventDefault?.();
      if (Platform.OS === 'web') {
        const input = searchRef.current as any;
        if (input && typeof input.select === 'function') {
          input.select();
        }
      }
      return;
    }
    // Escape: Universal dismiss
    if (key === 'Escape' || key === 'Esc') {
      e.preventDefault?.();
      if (settlementVisible) {
        setSettlementVisible(false);
        return;
      }
      if (activeModal) {
        setActiveModal(null);
        setPendingAction(null);
        return;
      }
      if (qtyMode) {
        setSearchQuery('');
        setQtyMode(false);
        setSelectedProduct(null);
        setQtyInput('1');
        setTimeout(() => {
          searchRef.current?.focus();
        }, 50);
        return;
      }
      if (searchQuery.trim() !== '') {
        setSearchQuery('');
        return;
      }
      // Blur search
      searchRef.current?.blur();
      return;
    }

    // Default search arrow navigation
    if (key === 'ArrowDown') {
      e.preventDefault?.();
      setHighlightedIndex((prev) =>
        visibleProducts.length > 0 ? (prev + 1) % visibleProducts.length : 0
      );
    } else if (key === 'ArrowUp') {
      e.preventDefault?.();
      setHighlightedIndex((prev) =>
        visibleProducts.length > 0 ? (prev - 1 + visibleProducts.length) % visibleProducts.length : 0
      );
    } else if (key === 'Enter') {
      e.preventDefault?.();
      if (visibleProducts.length === 0) {
        showToast('No item found');
        return;
      }
      const product = visibleProducts[highlightedIndex];
      if (product) {
        if (isReadOnlyView) {
          showToast('This bill is read-only.');
          return;
        }
        const isUnpaid = activeOrder ? (activeOrder.status === 'unpaid' || activeOrder.status === 'in_kitchen') : false;
        if (isUnpaid && !isEditingUnpaid) {
          showToast('This bill is locked. Tap "Edit Bill" to make changes.');
          return;
        }
        setSelectedProduct(product);
        setQtyInput('1');
        setQtyMode(true);
      }
    }
  }, [
    visibleProducts,
    highlightedIndex,
    activeOrder,
    isReadOnlyView,
    isEditingUnpaid,
    showToast,
    settlementVisible,
    activeModal,
    qtyMode,
    searchQuery,
    isMutating,
    activeOrderItems,
    handleCreateOrderClick,
    handleSaveKotClick,
    confirmHoldOrder,
    handleSettleClick,
    popoverVisible,
    heldOrdersFiltered,
    heldHighlightedIndex,
    handleSelectOrderClick,
  ]);





  // We no longer early-return for isInitialLoading so the POS mounts in the background
  // and transitions smoothly when loading completes.

  // ─── Error state ───
  if ((ordersError || catalogError) && orders.length === 0 && allProducts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tint px-6">
        <View className="w-full max-w-md rounded-xl border border-border-soft bg-surface-elevated p-8 shadow-panel">
          <Text className="text-center text-lg font-semibold text-text-primary">
            {ordersError ?? catalogError ?? 'Something went wrong.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleRetry}
            className="mt-6 min-h-[48px] items-center justify-center overflow-hidden rounded-xl bg-primary-mid px-6"
          >
            <Text className="font-bold text-text-on-primary">Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }



  // ─── Product grid ───
  const productGrid = (
    <View className="min-h-0 flex-1">
      {/* Search Bar Area */}
      <View className="flex-row items-center" style={{ marginBottom: 12, gap: 8 }}>
        <View 
          style={{ 
            height: 50, 
            borderRadius: 16, 
            paddingHorizontal: 16, 
            backgroundColor: '#FFFFFF', 
            shadowColor: '#0D264C', 
            shadowOffset: { width: 0, height: 2 }, 
            shadowOpacity: 0.04, 
            shadowRadius: 12, 
            elevation: 1,
            flexDirection: 'row',
            alignItems: 'center',
            borderColor: qtyMode ? '#0066b2' : 'transparent',
            borderWidth: qtyMode ? 1.5 : 0
          }} 
          className="flex-1"
        >
          {qtyMode && selectedProduct ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0066b2', marginRight: 4 }}>
                  Qty for:
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f2744', flex: 1 }} numberOfLines={1}>
                  {selectedProduct.name}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TextInput
                  ref={qtyRef}
                  id="qty-input"
                  value={qtyInput}
                  onChangeText={setQtyInput}
                  selectTextOnFocus={true}
                  keyboardType="number-pad"
                  onKeyPress={handleQtyKeyPress}
                  onSubmitEditing={handleQtySubmit}
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: '#0f2744',
                    borderWidth: 1,
                    borderColor: '#c5d9eb',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    height: 34,
                    width: 70,
                    textAlign: 'center',
                    backgroundColor: '#e8f2fa',
                    outlineStyle: 'none' as any,
                  }}
                />
                <Text style={{ fontSize: 9, fontWeight: '600', color: '#5b6b7c' }}>
                  [Enter] Add  •  [Esc] Cancel
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Search color="#9BA8BA" size={16} style={{ opacity: 0.6 }} />
              <TextInput
                ref={searchRef}
                id="search-input"
                placeholder="Search items... [/]"
                placeholderTextColor="#9BA8BA"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onKeyPress={handleSearchKeyPress}
                style={{ fontSize: 13, fontWeight: '500', marginLeft: 8, flex: 1, color: '#111', outlineStyle: 'none' as any }}
                editable={!isMutating}
              />
            </>
          )}
        </View>
        <View style={{ height: 50, minWidth: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 14, backgroundColor: '#FFFFFF', shadowColor: '#0D264C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>
            {qtyMode ? 'Qty Entry' : (searchQuery.trim() !== '' ? 'Search active' : 'All Items')}
          </Text>
        </View>
      </View>

      {catalogLoading ? (
        <View className="flex-1 items-center justify-center py-10">
          <ActivityIndicator color={colors.primaryMid} size="large" />
        </View>
      ) : catalogError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-text-secondary">{catalogError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadCatalog()}
            className="mt-4 min-h-[44px] items-center justify-center rounded-xl border-2 border-primary-mid px-5"
          >
            <Text className="text-xs font-bold text-primary-mid">Retry catalog</Text>
          </Pressable>
        </View>
      ) : visibleProducts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="rounded-xl border border-dashed border-border-soft bg-surface-elevated px-6 py-8">
            <Text className="text-center text-sm text-text-secondary">
              No products found. Add products in Settings.
            </Text>
          </View>
        </View>
      ) : Platform.OS === 'web' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 10 }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {visibleProducts.map((item, index) => (
              <View
                key={item.id}
                style={{
                  width: isTablet ? 'calc(25% - 9px)' : 'calc(50% - 6px)',
                  minWidth: isTablet ? 150 : 120,
                  marginBottom: 12,
                } as any}
              >
                <ProductCard
                  product={item}
                  disabled={isMutating}
                  onAdd={handleAddProduct}
                  highlighted={!qtyMode && searchQuery.trim() !== '' && index === highlightedIndex}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={visibleProducts}
          key={productColumns}
          numColumns={productColumns}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ paddingBottom: 10, gap: 12 }}
          initialNumToRender={12}
          windowSize={8}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          renderItem={({ item, index }) => (
            <View className="flex-1" style={{ maxWidth: isTablet ? '25%' : '50%' }}>
              <ProductCard
                product={item}
                disabled={isMutating}
                onAdd={handleAddProduct}
                highlighted={!qtyMode && searchQuery.trim() !== '' && index === highlightedIndex}
              />
            </View>
          )}
        />
      )}
    </View>
  );

  // ─── Order panel ───
  const orderPanel = (
    <OrderPanel
      order={activeOrder}
      items={activeOrderItems}
      orderIndex={activeOrderIndex >= 0 ? activeOrderIndex : 0}
      isLoading={isLoadingActiveOrder}
      isMutating={isMutating}
      activeAction={activeAction}
      isEditingUnpaid={isEditingUnpaid}
      hasUnsavedChanges={hasUnsavedChanges}
      isReadOnlyView={isReadOnlyView}
      isBillPrinted={activeOrderId ? !!billPrintedByOrderId[activeOrderId] : false}
      onIncrementItem={handleIncrementItem}
      onDecrementItem={handleDecrementItem}
      onRemoveItem={handleRemoveItem}
      onSaveKot={handleSaveKotClick}
      onSaveAndPrint={handleSaveAndPrintClick}
      onSettle={handleSettleClick}
      onCancel={handleCancelClick}
      onHoldOrder={confirmHoldOrder}
      onEditBill={handleEditBillClick}
      onDiscardChanges={handleDiscardChangesClick}
      onStartNewOrder={() => void handleStartNewOrder()}
      heldOrders={heldOrdersFiltered}
      itemCountByOrderId={itemCountByOrderId}
      onResumeOrder={handleSelectOrderClick}
    />
  );

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: '#F5F8FC' }}>
      {/* Popover click outside backdrop */}
      {popoverVisible && (
        <Pressable
          style={[StyleSheet.absoluteFill, { zIndex: 9998, backgroundColor: 'transparent' }]}
          onPress={() => setPopoverVisible(false)}
        />
      )}

      {/* LEFT Sidebar */}
      {isTablet && (
        <Sidebar
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
        />
      )}

      {/* MAIN CONTAINER */}
      <View className="flex-1 flex-col" style={{ paddingVertical: 12, paddingRight: 12, paddingLeft: 12, gap: 12 }}>
        {isTablet && (
          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', zIndex: 9999, elevation: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 9999 }}>
              {/* Print Agent Status Indicator */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', gap: 6, height: 34 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: printAgentOnline === true ? '#22C55E' : printAgentOnline === false ? '#EF4444' : '#94A3B8' }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: printAgentOnline === true ? '#1E293B' : printAgentOnline === false ? '#EF4444' : '#64748B' }}>
                  {printAgentOnline === true ? '🟢 Printer Connected' : printAgentOnline === false ? '⚠ Print Agent Offline' : 'Checking Printer...'}
                </Text>
              </View>
              {/* + New Order */}
              <Pressable
                disabled={isMutating}
                onPress={handleCreateOrderClick}
                style={({ pressed }) => [
                  {
                    height: 34,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: '#013b8c',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    shadowColor: '#013b8c',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.12,
                    shadowRadius: 6,
                    elevation: 2,
                  },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
                ]}
              >
                <Plus color="#FFFFFF" size={14} strokeWidth={2.5} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>New Order</Text>
                {Platform.OS === 'web' && (
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#c5d9eb', opacity: 0.8, marginLeft: 4 }}>Alt+N · F6</Text>
                )}
              </Pressable>
 
              {/* Held Carts Popover */}
              {heldOrdersFiltered.length > 0 && (
                <View style={{ position: 'relative', zIndex: 9999 }}>
                  <Pressable
                    disabled={isMutating}
                    onPress={() => {
                      setPopoverVisible(!popoverVisible);
                      setHeldHighlightedIndex(0);
                    }}
                    style={({ pressed }) => [
                      {
                        height: 34,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.04,
                        shadowRadius: 4,
                        elevation: 1,
                      },
                      pressed && { opacity: 0.85 }
                    ]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#013b8c' }}>
                      Held ({heldOrdersFiltered.length})
                    </Text>
                  </Pressable>
                  
                  {popoverVisible && (
                    <View style={{ position: 'absolute', top: 40, right: 0, width: 260, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 20, zIndex: 9999 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: '#4B5563', marginBottom: 10 }}>
                        Held Orders
                      </Text>
                      <FlatList
                        data={heldOrdersFiltered}
                        keyExtractor={(item) => item.id}
                        scrollEnabled={heldOrdersFiltered.length > 4}
                        style={{ maxHeight: 220 }}
                        renderItem={({ item, index: rowIndex }) => {
                          const itemsCount = itemCountByOrderId[item.id] ?? 0;
                          const elapsed = getElapsedLabel(item.created_at);
                          const isRowHighlighted = rowIndex === heldHighlightedIndex && Platform.OS === 'web';
                          return (
                            <View
                              style={[
                                { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', borderRadius: 8 },
                                isRowHighlighted && {
                                  backgroundColor: '#E8F2FA',
                                  borderColor: '#0066b2',
                                  borderWidth: 1,
                                  borderBottomColor: '#0066b2',
                                  shadowColor: '#0066b2',
                                  shadowOffset: { width: 0, height: 0 },
                                  shadowOpacity: 0.12,
                                  shadowRadius: 6,
                                  elevation: 2,
                                },
                              ]}
                            >
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                                  Draft Order
                                </Text>
                                <Text style={{ fontSize: 9, color: '#6B7280', marginTop: 1 }}>
                                  {itemsCount} {itemsCount === 1 ? 'item' : 'items'} • {elapsed}
                                </Text>
                              </View>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                  setPopoverVisible(false);
                                  setHeldHighlightedIndex(0);
                                  handleSelectOrderClick(item.id);
                                }}
                                style={{ height: 26, paddingHorizontal: 10, borderRadius: 6, backgroundColor: isRowHighlighted ? '#0066b2' : '#E8F2FA', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '700', color: isRowHighlighted ? '#FFFFFF' : '#0D6CE0' }}>Resume</Text>
                              </Pressable>
                            </View>
                          );
                        }}
                      />
                    </View>
                  )}
                </View>
              )}

              <View style={{ width: 1, height: 20, backgroundColor: '#E2E8F0' }} />

              {/* Clock */}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0D2F67' }}>{timeStr}</Text>
                <Text style={{ fontSize: 9, fontWeight: '500', color: '#6B7280', marginTop: 1 }}>{dateStr}</Text>
              </View>
              
              <View style={{ width: 1, height: 22, backgroundColor: '#E2E8F0' }} />
              
              {/* Cashier profile */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#0A67C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>AM</Text>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D2F67' }}>Cashier</Text>
                  <Text style={{ fontSize: 8, fontWeight: '500', color: '#10b981' }}>Active</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Inline error panel */}
        {ordersError ? (
          <View className="mx-2 mb-1 rounded-lg border border-border-soft bg-accent-soft px-3 py-1.5">
            <Text className="text-center text-[11px] font-medium text-primary-deep">
              {ordersError}
            </Text>
          </View>
        ) : null}

        {/* Main Grid & Panel area */}
        {isTablet ? (
          <View className="min-h-0 flex-1 flex-row" style={{ gap: 12 }}>
            <View className="min-h-0 flex-1 overflow-hidden" style={{ paddingHorizontal: 4 }}>
              {productGrid}
            </View>
            <View className="min-h-0 overflow-hidden" style={{ width: 390 }}>
              {orderPanel}
            </View>
          </View>
        ) : (
          <View className="min-h-0 flex-1 px-2 pb-2">
            <CategoryTabs
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />
            <View className="min-h-0 flex-[0.56] overflow-hidden rounded-xl border border-border-soft bg-surface-tint shadow-card">
              {productGrid}
            </View>
            <View className="mt-2 min-h-[280px] max-h-[44%] overflow-hidden rounded-xl border border-border-soft bg-surface-elevated shadow-panel">
              {orderPanel}
            </View>
          </View>
        )}
      </View>

      {/* Action Guard Modals */}
      {activeModalConfig && (
        <CustomConfirmModal
          visible={!!activeModal}
          title={activeModalConfig.title}
          description={activeModalConfig.description}
          buttons={activeModalConfig.buttons}
          onClose={() => {
            setActiveModal(null);
            setPendingAction(null);
            setTimeout(() => searchRef.current?.focus(), 50);
          }}
        />
      )}

      {/* Settlement overlay */}
      <SettlementModal
        visible={settlementVisible}
        total={orderTotal}
        onClose={() => {
          setSettlementVisible(false);
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
        onConfirm={confirmSettlement}
        isMutating={isMutating}
      />

      {/* Root Toast Indicator */}
      {toastMessage && (
        <View style={{ position: 'absolute', bottom: 30, left: '50%', transform: [{ translateX: -150 }], width: 300, zIndex: 99999, alignItems: 'center' }}>
          <View style={{ backgroundColor: '#0F2744', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 99, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{toastMessage}</Text>
          </View>
        </View>
      )}

      {/* 🚀 Splash Screen Loading Overlay */}
      {!loadingFinished && (
        <Modal
          visible={!loadingFinished}
          transparent={true}
          animationType="none"
          statusBarTranslucent={true}
        >
          <Animated.View
            style={{
              position: Platform.OS === 'web' ? 'fixed' : 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              width: windowWidth,
              height: windowHeight,
              zIndex: 999999,
              opacity: loadingFadeAnim,
              transform: [{ scale: loadingScaleAnim }],
              backgroundColor: '#0D47A1',
            }}
          >
            {/* Background Video playing the Loading Screen Animation */}
            <VideoView
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              player={videoPlayer}
              contentFit="cover"
              nativeControls={false}
            />

            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 45, paddingHorizontal: 20 }}>
              {/* Top spacer */}
              <View />

              {/* Center spacer so the video's main animation shines in the center */}
              <View />

              {/* Bottom Section: Progress bar, checklist container, and footer */}
              <View style={{ width: '100%', alignItems: 'center' }}>
                {/* Progress Bar and Percentage Count */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, width: '100%', maxWidth: 420 }}>
                  <View style={{ flex: 1, height: 8, backgroundColor: 'rgba(0, 45, 90, 0.45)', borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                    <Animated.View style={{
                      height: '100%',
                      width: loadingProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor: '#FFFFFF',
                      borderRadius: 5,
                    }} />
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', width: 45, textAlign: 'right' }}>
                    {progressPercent}%
                  </Text>
                </View>

                {/* Boot Status Checklist Panel */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(15, 39, 68, 0.35)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 16,
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                  width: '100%',
                  maxWidth: 680,
                  marginTop: 20,
                  gap: 15,
                }}>
                  {renderCheckItem('Menu Loaded', progressPercent >= 28 ? '120 items' : 'Loading...', progressPercent >= 28)}
                  <View style={{ width: 1, height: 24, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                  {renderCheckItem('Inventory Synced', progressPercent >= 56 ? '98% updated' : 'Syncing...', progressPercent >= 56)}
                  <View style={{ width: 1, height: 24, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                  {renderCheckItem('Printers Connected', progressPercent >= 84 ? '3 devices' : 'Connecting...', progressPercent >= 84)}
                  <View style={{ width: 1, height: 24, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                  {renderCheckItem('Kitchen Display', progressPercent >= 98 ? 'Ready' : 'Starting up...', progressPercent >= 98)}
                </View>
              </View>

              {/* Branded Footer */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                opacity: 0.75,
                marginBottom: 5,
              }}>
                <Text style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 12, fontWeight: '500' }}>
                  💙 Thank you for choosing Le Leban POS
                </Text>
                <View style={{ width: 1, height: 12, backgroundColor: 'rgba(255, 255, 255, 0.25)' }} />
                <Text style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 12, fontWeight: '500' }}>
                  Powering great restaurants 🚀
                </Text>
              </View>
            </View>
          </Animated.View>
        </Modal>
      )}
    </View>
  );
}

function getElapsedLabel(createdAt: string): string {
  const createdMs = new Date(createdAt).getTime();
  const minutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60_000));
  if (minutes < 1) {
    return 'Just now';
  }
  return `${minutes}m ago`;
}
