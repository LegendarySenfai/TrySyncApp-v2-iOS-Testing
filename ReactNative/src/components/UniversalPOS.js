// ============================================================
//  UniversalPOS.js  —  Offline-First Edition
//  ✅ Objective 1: Network Detection & UI Banner
//  ✅ Objective 2: Menu Caching (Read Offline)
//  ✅ Objective 3: Transaction Queueing (Write Offline)
//  ✅ Objective 4: Auto-Sync Background Engine
//
//  INSTALL (run once in project root):
//    npx expo install @react-native-community/netinfo
// ============================================================

import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
// ── OFFLINE ENGINE: added useRef alongside existing hooks ──
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image, TextInput, useWindowDimensions, Modal, FlatList, Platform, KeyboardAvoidingView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
// ── OFFLINE ENGINE: NetInfo for real-time connection monitoring ──
import NetInfo from '@react-native-community/netinfo';

// ── OFFLINE ENGINE: AsyncStorage keys ──────────────────────────
// Menu cache is per-category so milktea and laundry never bleed into each other.
// Transaction queue is global; each payload carries its own `category` field.
const QUEUE_KEY = 'offline_transaction_queue';
const menuCacheKey   = (cat) => `cached_menu_${cat}`;
const modCacheKey    = (cat) => `cached_modifiers_${cat}`;
// ───────────────────────────────────────────────────────────────

export default function UniversalPOS({ category, title, onBeforeCheckout }) {

  // ─── EXISTING STATE (untouched) ────────────────────────────
  const [items, setItems] = useState([]);
  const [availableModifiers, setAvailableModifiers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [inventoryPage, setInventoryPage] = useState(0);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockRawItems, setRestockRawItems] = useState([]);
  const [selectedRawId, setSelectedRawId] = useState('');
  const [restockAmount, setRestockAmount] = useState('');
  const [isSubmittingRestock, setIsSubmittingRestock] = useState(false);
  const [customAlertVisible, setCustomAlertVisible] = useState(false);
  const [customAlertData, setCustomAlertData] = useState({ title: '', message: '', onConfirm: null });
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [rawInventory, setRawInventory] = useState([]);
  const [auditCounts, setAuditCounts] = useState({});
  const [shiftStarted, setShiftStarted] = useState(false);
  const [startingCash, setStartingCash] = useState('');
  const [startingCashError, setStartingCashError] = useState('');
  const [startingCashFocused, setStartingCashFocused] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [endingCash, setEndingCash] = useState('');
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);
  const [cart, setCart] = useState([]);
  const [expandedCartId, setExpandedCartId] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [selectionModalVisible, setSelectionModalVisible] = useState(false);
  const [currentBaseProduct, setCurrentBaseProduct] = useState(null);
  const [selectedSizeId, setSelectedSizeId] = useState(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountApplied, setDiscountApplied] = useState(false);
  const [discountDetails, setDiscountDetails] = useState({ type: 'Senior Citizen', name: '', id: '' });
  const [showPaymentModal, setShowPaymentModal]       = useState(false);
  const [paymentMethod, setPaymentMethod]             = useState('cash');
  const [amountReceived, setAmountReceived]           = useState('');
  const [gcashReference, setGcashReference]           = useState('');
  const [pendingCheckoutTotals, setPendingCheckoutTotals] = useState(null);
  const [shiftSummary, setShiftSummary]               = useState(null);
  const [varianceReason, setVarianceReason]           = useState('');
  const [showVarianceInput, setShowVarianceInput]     = useState(false);
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  const cardFlexBasis = isTablet ? '33.33%' : '100%';

  // ─── OFFLINE ENGINE: New state ───────────────────────────────
  const [isOnline, setIsOnline] = useState(true);
  // Badge count — how many transactions are waiting to sync
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  // Tracks the PREVIOUS connection state so we only trigger sync on the
  // exact moment of reconnection (false → true), not on every re-render.
  const prevOnlineRef = useRef(true);
  // ────────────────────────────────────────────────────────────

  // ── OFFLINE ENGINE: Helper — read the queue and refresh badge ──
  const refreshPendingCount = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      setPendingOfflineCount(queue.length);
    } catch {
      setPendingOfflineCount(0);
    }
  }, []);

  // ── OFFLINE ENGINE: Helper — append one payload to the queue ──
  const enqueueTransaction = useCallback(async (payload) => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      // Stamp it so we can track it in logs
      queue.push({ ...payload, _queuedAt: new Date().toISOString(), _category: category });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      setPendingOfflineCount(queue.length);
    } catch (err) {
      console.error('[OfflineEngine] Failed to enqueue transaction:', err);
    }
  }, [category]);

  // ── OFFLINE ENGINE: Helper — attempt to sync all queued txns ──
  const syncOfflineQueue = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const queue = JSON.parse(raw);
      if (queue.length === 0) return;

      console.log(`[OfflineEngine] Syncing ${queue.length} offline transaction(s)…`);

      const failed = [];
      for (const payload of queue) {
        try {
          // Remove internal tracking fields before posting
          const { _queuedAt, _category, ...apiPayload } = payload;
          await api.post('/transaction/checkout', apiPayload);
          console.log('[OfflineEngine] ✅ Synced offline txn queued at', _queuedAt);
        } catch (err) {
          console.warn('[OfflineEngine] ❌ Failed to sync, will retry next time:', err?.message);
          failed.push(payload); // Keep it in the queue for next cycle
        }
      }

      // Persist only the ones that still failed
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
      setPendingOfflineCount(failed.length);

      if (failed.length === 0) {
        console.log('[OfflineEngine] 🎉 All offline transactions synced successfully.');
      }
    } catch (err) {
      console.error('[OfflineEngine] Sync error:', err);
    }
  }, []);

  // ── OFFLINE ENGINE: Objective 1 — Real-time network monitoring ──
  // Subscribes to NetInfo on mount, cleans up on unmount.
  useEffect(() => {
    // Check current state immediately on mount
    NetInfo.fetch().then((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
      prevOnlineRef.current = online;
      refreshPendingCount();
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);

      // ── Objective 4: Trigger auto-sync the moment we come back online ──
      if (online && !prevOnlineRef.current) {
        console.log('[OfflineEngine] 🌐 Connection restored — starting auto-sync…');
        syncOfflineQueue();
      }

      prevOnlineRef.current = online;
    });

    return () => unsubscribe();
  }, [refreshPendingCount, syncOfflineQueue]);

  // ─── EXISTING EFFECTS (untouched) ───────────────────────────
  React.useEffect(() => {
    navigation.setOptions({
      headerTitle: `Welcome ${user?.username || 'Staff'}`,
      headerRight: () => (
        <TouchableOpacity onPress={handleInitiateEndShift} style={{ marginRight: 15, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: '#e74c3c', marginRight: 5, fontWeight: 'bold' }}>END SHIFT</Text>
          <Ionicons name="log-out-outline" size={26} color="#e74c3c" />
        </TouchableOpacity>
      )
    });
  });

  React.useEffect(() => {
    const checkActiveShift = async () => {
      const shiftStatus = await AsyncStorage.getItem(`shiftActive_${category}`);
      const savedCash = await AsyncStorage.getItem(`startingCash_${category}`);
      if (shiftStatus === 'true') {
        setShiftStarted(true);
        if (savedCash) setStartingCash(savedCash);
      }
    };
    checkActiveShift();
  }, [category]);
  // ────────────────────────────────────────────────────────────

  const showResponsiveAlert = (title, message, onConfirm = null) => {
    setCustomAlertData({ title, message, onConfirm });
    setCustomAlertVisible(true);
  };

  // ── OFFLINE ENGINE: Objective 2 — fetchData with cache write + offline fallback ──
  const fetchData = async () => {
    // Optimistically try the network first
    if (isOnline) {
      try {
        const [invRes, modRes] = await Promise.all([
          api.get(`/inventory/products?category=${category}`),
          api.get(`/modifiers?category=${category}`)
        ]);

        setItems(invRes.data);
        setAvailableModifiers(modRes.data);

        // ── Cache the fresh data for offline use ──
        await AsyncStorage.setItem(menuCacheKey(category), JSON.stringify(invRes.data));
        await AsyncStorage.setItem(modCacheKey(category), JSON.stringify(modRes.data));
        console.log(`[OfflineEngine] 📦 Menu cached for category: ${category}`);

        setLoading(false);
        return; // Done — no need to fall through to cache
      } catch (error) {
        // Network said "online" but request failed anyway (server down, timeout, etc.)
        console.warn('[OfflineEngine] Online fetch failed, falling back to cache:', error?.message);
      }
    }

    // ── Offline path: load cached menu so the cashier can keep ringing up orders ──
    try {
      const [cachedMenu, cachedMods] = await Promise.all([
        AsyncStorage.getItem(menuCacheKey(category)),
        AsyncStorage.getItem(modCacheKey(category))
      ]);

      if (cachedMenu) {
        setItems(JSON.parse(cachedMenu));
        console.log(`[OfflineEngine] 🗂️ Loaded cached menu for: ${category}`);
      } else {
        console.warn('[OfflineEngine] No cached menu found for category:', category);
      }

      if (cachedMods) {
        setAvailableModifiers(JSON.parse(cachedMods));
      }
    } catch (cacheError) {
      console.error('[OfflineEngine] Cache read failed:', cacheError);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [category, isOnline]) // re-run when connectivity changes
  );

  // ─── EXISTING CART/MODAL LOGIC (100% untouched) ─────────────

  const handleOpenSelection = (baseName) => {
    const variations = items.filter(i => {
      const itemBaseName = i.product_name.split(' (')[0];
      return itemBaseName === baseName;
    });
    if (category === 'laundry' || variations.length === 1) {
      handleAddToCart(variations[0]);
      return;
    }
    setCurrentBaseProduct({ name: baseName, variations });
    setSelectedSizeId(variations[0]?.id);
    setSelectionModalVisible(true);
  };

  const deepMergeCart = (cartArray) => {
    const merged = [];
    cartArray.forEach(item => {
      const existing = merged.find(m => {
        if (m.product_id !== item.product_id) return false;
        if (m.modifiers.length !== item.modifiers.length) return false;
        const mMods = [...m.modifiers].sort((a, b) => a.id - b.id);
        const iMods = [...item.modifiers].sort((a, b) => a.id - b.id);
        for (let i = 0; i < mMods.length; i++) {
          if (mMods[i].id !== iMods[i].id || (mMods[i].qty || 1) !== (iMods[i].qty || 1)) return false;
        }
        return true;
      });
      if (existing) {
        existing.qty += item.qty;
      } else {
        merged.push({ ...item });
      }
    });
    return merged;
  };

  const handleAddToCart = (item) => {
    const cartItem = {
      cart_id: Math.random().toString(),
      product_id: item.id,
      item_name: item.product_name,
      base_price: parseFloat(item.base_price),
      qty: 1,
      modifiers: [],
      allow_modifiers: item.allow_modifiers
    };
    setCart(deepMergeCart([...cart, cartItem]));
    setSelectionModalVisible(false);
  };

  const handleAddModifier = (cartId, modifier) => {
    const updatedCart = cart.map(cartItem => {
      if (cartItem.cart_id === cartId) {
        const existingMod = cartItem.modifiers.find(m => m.id === modifier.id);
        if (existingMod) {
          const updatedMods = cartItem.modifiers.map(m => m.id === modifier.id ? { ...m, qty: (m.qty || 1) + 1 } : m);
          return { ...cartItem, modifiers: updatedMods };
        } else {
          return { ...cartItem, modifiers: [...cartItem.modifiers, { ...modifier, qty: 1 }] };
        }
      }
      return cartItem;
    });
    setCart(deepMergeCart(updatedCart));
  };

  const handleRemoveModifier = (cartId, modifierId) => {
    const updatedCart = cart.map(cartItem => {
      if (cartItem.cart_id === cartId) {
        const existingMod = cartItem.modifiers.find(m => m.id === modifierId);
        if (existingMod && (existingMod.qty || 1) > 1) {
          const updatedMods = cartItem.modifiers.map(m => m.id === modifierId ? { ...m, qty: m.qty - 1 } : m);
          return { ...cartItem, modifiers: updatedMods };
        } else {
          return { ...cartItem, modifiers: cartItem.modifiers.filter(m => m.id !== modifierId) };
        }
      }
      return cartItem;
    });
    setCart(deepMergeCart(updatedCart));
  };

  const handleRemoveFromCart = (cartId) => setCart(cart.filter(item => item.cart_id !== cartId));

  const handleQtyChange = (cartId, delta) => {
    const updated = cart.map(item => item.cart_id === cartId ? { ...item, qty: item.qty + delta } : item).filter(item => item.qty > 0);
    setCart(deepMergeCart(updated));
  };

  const getCartTotals = () => {
    let maxItemCost = 0;
    const subtotal = cart.reduce((total, item) => {
      const modsTotal = item.modifiers.reduce((sum, mod) => sum + (parseFloat(mod.additional_price) * (mod.qty || 1)), 0);
      const singleUnitCost = item.base_price + modsTotal;
      if (singleUnitCost > maxItemCost) maxItemCost = singleUnitCost;
      return total + (singleUnitCost * item.qty);
    }, 0);
    if (!discountApplied || cart.length === 0) return { subtotal, discountAmount: 0, finalTotal: subtotal };
    const vatExemptItem = maxItemCost / 1.12;
    const pureDiscount = vatExemptItem * 0.20;
    const totalDeduction = (maxItemCost - vatExemptItem) + pureDiscount;
    return { subtotal, discountAmount: totalDeduction, finalTotal: subtotal - totalDeduction };
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (onBeforeCheckout) {
      const totals = getCartTotals();
      const payload = {
        cart_items: cart,
        total_revenue: totals.finalTotal,
        discount_type: discountApplied ? discountDetails.type : null,
        customer_name: discountApplied ? discountDetails.name : null,
        customer_id: discountApplied ? discountDetails.id : null,
      };
      const result = await onBeforeCheckout(payload);
      if (result?.success) {
        setIsPrinting(true);
        setTimeout(() => {
          setIsPrinting(false);
          const currentReceiptData = {
            cart: [...cart],
            totals: totals,
            date: new Date().toLocaleString(),
            transactionId: result.ticket || `LND-${Math.floor(Math.random() * 90000) + 10000}`,
            discountAmount: discountApplied ? totals.discountAmount : 0,
            isLaundry: true,
            customerName: result.customer || "Walk-in",
            pickupDate: result.pickupDate || "TBA",
            phone: result.phone || "N/A",
            weight: result.weight || "0.0",
            paymentMethod: result.paymentMethod,
            amountReceived: result.amountReceived,
            change: result.change,
            gcashReference: result.gcashReference
          };
          setReceiptData(currentReceiptData);
          setShowReceiptModal(true);
          setCart([]);
          setDiscountApplied(false);
          setDiscountDetails({ type: 'Senior Citizen', name: '', id: '' });
          fetchData();
        }, 2000);
      }
      return;
    }
    const totals = getCartTotals();
    setPendingCheckoutTotals(totals);
    setPaymentMethod('cash');
    setAmountReceived('');
    setGcashReference('');
    setShowPaymentModal(true);
  };

  // ── OFFLINE ENGINE: Objective 3 — Payment confirmation with offline fallback ──
  const handleConfirmPayment = async () => {
    const totals = pendingCheckoutTotals;

    // ── Validation (identical to original) ──
    if (paymentMethod === 'cash') {
      const received = parseFloat(amountReceived);
      if (isNaN(received) || received < totals.finalTotal) {
        return showResponsiveAlert(
          "Invalid Amount",
          `Amount received cannot be less than ₱${totals.finalTotal.toFixed(2)}.`
        );
      }
    } else {
      if (!gcashReference.trim()) {
        return showResponsiveAlert("Required", "Please enter the GCash Reference / Transaction ID.");
      }
    }

    const change = paymentMethod === 'cash'
      ? parseFloat(amountReceived) - totals.finalTotal
      : 0;

    // Build the complete transaction payload — same shape as the original api.post call
    const transactionPayload = {
      cart_items:      cart,
      total_revenue:   totals.finalTotal,
      discount_type:   discountApplied ? discountDetails.type : null,
      customer_name:   discountApplied ? discountDetails.name : null,
      customer_id:     discountApplied ? discountDetails.id   : null,
      payment_method:  paymentMethod,
      amount_received: paymentMethod === 'cash'  ? parseFloat(amountReceived) : totals.finalTotal,
      gcash_reference: paymentMethod === 'gcash' ? gcashReference.trim()      : null,
    };

    // Build receipt data — same shape as original, generated locally so
    // the cashier always sees a receipt whether online or offline
    const currentReceiptData = {
      cart:           [...cart],
      totals:         totals,
      date:           new Date().toLocaleString(),
      transactionId:  `TXN-${Math.floor(Math.random() * 90000) + 10000}`,
      discountAmount: discountApplied ? totals.discountAmount : 0,
      paymentMethod,
      amountReceived: paymentMethod === 'cash'  ? parseFloat(amountReceived) : null,
      change:         paymentMethod === 'cash'  ? change                     : null,
      gcashReference: paymentMethod === 'gcash' ? gcashReference.trim()      : null,
    };

    setShowPaymentModal(false);
    setIsPrinting(true);

    // ── OFFLINE ENGINE: Branch on connection state ──────────────
    if (!isOnline) {
      // ── OFFLINE PATH: Queue locally, show success, reset cart ──
      setTimeout(async () => {
        setIsPrinting(false);

        await enqueueTransaction(transactionPayload);

        // Show a branded offline-success alert
        Alert.alert(
          '✅ Transaction Saved Offline',
          'This transaction has been saved locally and will sync automatically when WiFi returns.',
          [{ text: 'Next Customer', style: 'default' }]
        );

        setReceiptData(currentReceiptData);
        setShowReceiptModal(true);
        setCart([]);
        setDiscountApplied(false);
        setDiscountDetails({ type: 'Senior Citizen', name: '', id: '' });
        fetchData();
      }, 1500);

      return; // Do NOT fall through to the online path
    }
    // ── ONLINE PATH: Original logic, untouched ──────────────────
    setTimeout(async () => {
      try {
        await api.post('/transaction/checkout', transactionPayload);

        setIsPrinting(false);
        setReceiptData(currentReceiptData);
        setShowReceiptModal(true);
        setCart([]);
        setDiscountApplied(false);
        setDiscountDetails({ type: 'Senior Citizen', name: '', id: '' });
        fetchData();
      } catch (error) {
        setIsPrinting(false);
        const errorDetail = error.response?.data?.error || error.response?.data?.message || "Server Error";
        showResponsiveAlert("Transaction Blocked", errorDetail);
      }
    }, 1500);
  };
  // ────────────────────────────────────────────────────────────

  // ─── EXISTING NON-CHECKOUT HANDLERS (untouched) ─────────────

  const handleOpenRestock = async (product) => {
    try {
      const res = await api.get(`/inventory/missing-ingredients/${product.id}`);
      setRestockRawItems(res.data);
      setShowRestockModal(true);
    } catch (err) {
      showResponsiveAlert("Error", "Could not load missing materials.");
    }
  };

  const submitEmergencyRestock = async () => {
    if (isSubmittingRestock) return;
    if (!selectedRawId || !restockAmount || isNaN(parseFloat(restockAmount)) || parseFloat(restockAmount) <= 0) {
      return showResponsiveAlert("Error", "Select an item and enter a valid positive amount.");
    }
    setIsSubmittingRestock(true);
    try {
      await api.post('/inventory/emergency-restock', {
        staff_name: user?.username || "Staff",
        shop_category: category,
        raw_inventory_id: selectedRawId,
        amount_added: parseFloat(restockAmount)
      });
      showResponsiveAlert("Success", "Stock updated! The POS is unlocked.");
      setShowRestockModal(false);
      setSelectedRawId('');
      setRestockAmount('');
      fetchData();
    } catch (err) {
      showResponsiveAlert("Error", "Failed to add stock.");
    } finally {
      setIsSubmittingRestock(false);
    }
  };

  // Same validation condition as before — shown inline instead of an OS alert.
  const handleOpenRegister = async () => {
    if (!startingCash || isNaN(parseFloat(startingCash)) || parseFloat(startingCash) < 0) {
      setStartingCashError('Please enter a valid starting cash amount (0 or higher).');
      return;
    }
    setStartingCashError('');
    setShiftStarted(true);
    await AsyncStorage.setItem(`shiftActive_${category}`, 'true');
    await AsyncStorage.setItem(`startingCash_${category}`, startingCash.toString());
  };

  const handleInitiateEndShift = async () => {
    try {
      const [invRes, summaryRes] = await Promise.all([
        api.get(`/inventory/raw?category=${category}`),
        api.get(`/audit/shift-summary?category=${category}&starting_cash=${parseFloat(startingCash) || 0}`)
      ]);
      setRawInventory(invRes.data);
      setShiftSummary(summaryRes.data);
      const initialCounts = {};
      invRes.data.forEach(item => initialCounts[item.id] = '');
      setAuditCounts(initialCounts);
      setVarianceReason('');
      setShowVarianceInput(false);
      setInventoryPage(0);
      setShowAuditModal(true);
    } catch (err) {
      showResponsiveAlert("Error", "Could not load inventory for auditing.");
    }
  };

  const submitEndShiftAudit = async () => {
    if (isSubmittingAudit) return;
    if (endingCash === '' || isNaN(parseFloat(endingCash)) || parseFloat(endingCash) < 0) {
      return showResponsiveAlert("Invalid Input", "Please enter a valid ending cash amount (0 or higher).");
    }
    const missingOrNegativeItems = [];
    Object.keys(auditCounts).forEach(itemId => {
      const countStr = auditCounts[itemId];
      const countNum = parseFloat(countStr);
      if (countStr === '' || isNaN(countNum) || countNum < 0) {
        const item = rawInventory.find(i => String(i.id) === String(itemId));
        if (item) missingOrNegativeItems.push(item.item_name);
      }
    });
    if (missingOrNegativeItems.length > 0) {
      return showResponsiveAlert(
        "Invalid Inputs",
        `Found blank or negative boxes (${missingOrNegativeItems.length} items). Please fix: ${missingOrNegativeItems.slice(0, 3).join(', ')}`
      );
    }
    const expectedCash = shiftSummary?.expected_cash ?? 0;
    const endCashNum   = parseFloat(endingCash) || 0;
    const cashVariance = Math.abs(expectedCash - endCashNum);
    if (cashVariance > 0.01 && !varianceReason.trim()) {
      setShowVarianceInput(true);
      return showResponsiveAlert(
        "⚠️ Variance Detected",
        `Expected: ₱${expectedCash.toFixed(2)}\n`
        + `You entered: ₱${endCashNum.toFixed(2)}\n`
        + `Difference: ₱${cashVariance.toFixed(2)}\n\n`
        + `A written explanation is required. Please fill in the highlighted reason field and tap Submit again.`
      );
    }
    setIsSubmittingAudit(true);
    const numericCounts = {};
    Object.keys(auditCounts).forEach(id => {
      numericCounts[id] = parseFloat(auditCounts[id]) || 0;
    });
    try {
      await api.post('/audit/submit', {
        staff_name:      user?.username || "Unknown Staff",
        shop_category:   category,
        physical_counts: numericCounts,
        starting_cash:   parseFloat(startingCash) || 0,
        actual_cash:     parseFloat(endingCash)   || 0,
        variance_reason: varianceReason.trim() || null,
      });
      setShowAuditModal(false);
      await AsyncStorage.removeItem(`shiftActive_${category}`);
      await AsyncStorage.removeItem(`startingCash_${category}`);
      showResponsiveAlert("Success", "Remittance submitted successfully.", () => {
        logout();
      });
    } catch (err) {
      showResponsiveAlert("Server Error", err.response?.data?.message || "Failed to submit audit.");
      setIsSubmittingAudit(false);
    }
  };

  // ─── EXISTING UI GROUPING LOGIC (untouched) ──────────────────
  const filteredItems = items.filter(i => i.product_name.toLowerCase().includes(searchText.toLowerCase()) && i.category === category);

  const getSubCategory = (item) => {
    if (item.sub_category === 'frappe')     return 'ICE BLENDED';
    if (item.sub_category === 'cheesecake') return 'CHEESE CAKE';
    if (item.sub_category === 'classic')    return 'MILK TEA';
    if (item.sub_category === 'fruit_tea')  return 'FRUIT TEA';
    if (item.sub_category === 'iced_drink') return 'ICED DRINKS';
    const lower = item.product_name.toLowerCase();
    if (lower.includes('wash') || lower.includes('dry') || lower.includes('iron') ||
        lower.includes('fold') || lower.includes('service') || lower.includes('comforter')) return 'LAUNDRY SERVICES';
    return 'OTHER';
  };

  const groupedItems = filteredItems.reduce((acc, item) => {
    const baseName = item.product_name.split(' (')[0];
    const subCat = getSubCategory(item);
    if (!acc[subCat]) acc[subCat] = {};
    if (!acc[subCat][baseName]) acc[subCat][baseName] = item;
    return acc;
  }, {});

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3498db" /></View>;

  const totals = getCartTotals();
  const activeCategories = ['ICE BLENDED', 'ICED DRINKS', 'CHEESE CAKE', 'FRUIT TEA', 'MILK TEA', 'LAUNDRY SERVICES', 'OTHER'].filter(cat => groupedItems[cat]);

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ════════════════════════════════════════════════════════
          OFFLINE ENGINE — Objective 1: Offline Status Banner
          Absolute-positioned so it floats above the entire POS
          UI without shifting any existing layout.
          ════════════════════════════════════════════════════════ */}
      {!isOnline && (
        <View style={styles.offlineBanner} pointerEvents="none">
          <View style={styles.offlineBannerInner}>
            <Text style={styles.offlineBannerText}>
              🔴 Offline Mode — Saving transactions locally
            </Text>
            {pendingOfflineCount > 0 && (
              <View style={styles.offlineBadge}>
                <Text style={styles.offlineBadgeText}>
                  {pendingOfflineCount} pending sync
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Small sync badge when we're back online and still have a queue */}
      {isOnline && pendingOfflineCount > 0 && (
        <View style={styles.syncingBanner} pointerEvents="none">
          <Text style={styles.syncingBannerText}>
            🔄 Syncing {pendingOfflineCount} offline transaction{pendingOfflineCount !== 1 ? 's' : ''}…
          </Text>
        </View>
      )}
      {/* ════════════════════════════════════════════════════════ */}

      {/* LEFT SIDE: PRODUCT GRID (70% Width) — UNTOUCHED */}
      <View style={{ flex: isTablet ? 6 : 5, borderRightWidth: 1, borderColor: '#eee', backgroundColor: '#fdfdfd' }}>
        <View style={styles.searchContainer}>
          <TextInput
            placeholder="Search Menu..." style={styles.searchInput}
            value={searchText} onChangeText={setSearchText} onFocus={() => setSearchText('')}
          />
        </View>

        <FlatList
          data={activeCategories}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 50 }}
          renderItem={({ item: sectionTitle }) => (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{sectionTitle.toUpperCase()}</Text>
              </View>
              <View style={styles.gridContainer}>
                {Object.keys(groupedItems[sectionTitle]).map(baseName => {
                  const item = groupedItems[sectionTitle][baseName];
                  const isOutOfStock = item.missing_ingredients > 0;
                  return (
                    <View key={`${baseName}-${item.missing_ingredients}`} style={{ flexBasis: cardFlexBasis, padding: 5 }}>
                      <TouchableOpacity
                        style={[styles.card, isOutOfStock && { opacity: 0.4 }]}
                        onPress={() => {
                          if (isOutOfStock) {
                            handleOpenRestock(item);
                          } else {
                            handleOpenSelection(baseName);
                          }
                        }}
                      >
                        <Image
                          source={{
                            uri: item.image_url
                              ? `${BASE_URL}/uploads/${item.image_url}`
                              : 'https://via.placeholder.com/150'
                          }}
                          style={[styles.cardImage, { height: isTablet ? 100 : 130 }]}
                        />
                        <View style={styles.cardContent}>
                          <Text style={styles.itemName}>{baseName}</Text>
                          {category === 'laundry' ? (
                            <View style={{ marginVertical: 8, minHeight: 60 }}>
                              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#1e293b' }}>INCLUDES:</Text>
                              {item.recipe?.map((r, idx) => (
                                <Text key={idx} style={{ fontSize: 10, color: '#64748b' }}>• {r.item_name}</Text>
                              ))}
                              {(!item.recipe || item.recipe.length === 0) && <Text style={{ fontSize: 10, color: '#94a3b8' }}>Standard Wash</Text>}
                            </View>
                          ) : (
                            <Text style={styles.itemDescription} numberOfLines={4}>
                              Includes: {item.recipe?.map(r => r.item_name).join(', ') || 'Standard'}
                            </Text>
                          )}
                          <Text style={styles.price}>₱{item.base_price}</Text>
                          {isOutOfStock && (
                            <View style={{ backgroundColor: '#ef4444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: 'flex-start' }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>TAP TO RESTOCK</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        />
      </View>

      {/* RIGHT SIDE: CART SIDEBAR (30% Width) — UNTOUCHED */}
      <View style={{ flex: isTablet ? 4 : 5, backgroundColor: '#e9e9e9' }}>
        <View style={[styles.cartHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={styles.cartTitle}>Current Order</Text>
        </View>

        <ScrollView 
  style={{ flex: 1 }} 
  contentContainerStyle={{ padding: 10, flexGrow: 1 }}
  showsVerticalScrollIndicator={true}
>
          {cart.map((item) => (
            <View key={item.cart_id} style={styles.cartItem}>
              <View style={styles.cartItemRow}>
                <Text style={styles.cartItemName} numberOfLines={2} ellipsizeMode="tail">{item.qty}x {item.item_name}</Text>
<Text style={styles.cartItemPrice}>₱{item.base_price}</Text>
              </View>

              {item.modifiers.map((mod, index) => (
                <View key={index} style={styles.modifierRow}>
                  <Text style={styles.modifierText}>+ {(mod.qty || 1) > 1 ? `${mod.qty}x ` : ''}{mod.modifier_name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.modifierPrice}>₱{(mod.additional_price * (mod.qty || 1)).toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => handleRemoveModifier(item.cart_id, mod.id)}>
                      <Text style={{ color: '#e74c3c', fontSize: 11, fontWeight: 'bold' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
                <TouchableOpacity
                  onPress={() => handleQtyChange(item.cart_id, -1)}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1' }}
                >
                  <Text style={{ fontWeight: 'bold', color: '#475569', fontSize: 16, lineHeight: 22 }}>−</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1e293b', minWidth: 20, textAlign: 'center' }}>
                  {item.qty}
                </Text>
                <TouchableOpacity
                  onPress={() => handleQtyChange(item.cart_id, 1)}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#27ae60', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontWeight: 'bold', color: 'white', fontSize: 16, lineHeight: 22 }}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <TouchableOpacity onPress={() => handleRemoveFromCart(item.cart_id)}>
                  <Text style={{ color: '#e74c3c', fontSize: 11, fontWeight: 'bold' }}>Remove</Text>
                </TouchableOpacity>

                {item.allow_modifiers ? (
                  <TouchableOpacity
                    onPress={() => setExpandedCartId(expandedCartId === item.cart_id ? null : item.cart_id)}
                    style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}
                  >
                    <Text style={{ color: '#3498db', fontSize: 11, fontWeight: 'bold' }}>
                      {expandedCartId === item.cart_id ? 'Close ✕' : 'Add-on +'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: '#94a3b8', fontSize: 10, fontStyle: 'italic' }}>No add-ons</Text>
                )}
              </View>

              {expandedCartId === item.cart_id && (
                <View style={styles.dropdown}>
                  {[...availableModifiers]
                    .sort((a, b) => {
                      const aOut = a.is_out_of_stock || a.missing_ingredients > 0;
                      const bOut = b.is_out_of_stock || b.missing_ingredients > 0;
                      if (aOut === bOut) return 0;
                      return aOut ? 1 : -1;
                    })
                    .map(mod => {
                      const isModOutOfStock = parseFloat(mod.stock_quantity) < parseFloat(mod.amount_needed);
                      return (
                        <TouchableOpacity
                          key={mod.id}
                          style={[styles.dropdownItem, isModOutOfStock && { opacity: 0.5, backgroundColor: '#f8fafc' }]}
                          onPress={() => {
                            if (isModOutOfStock) {
                              showResponsiveAlert("Out of Stock", `${mod.modifier_name} is currently unavailable.`);
                            } else {
                              handleAddModifier(item.cart_id, mod);
                            }
                          }}
                        >
                          <Text style={[
                            { fontSize: 12, color: '#333' },
                            isModOutOfStock && { textDecorationLine: 'line-through', color: '#94a3b8' }
                          ]}>
                            {mod.modifier_name} (+₱{mod.additional_price}) {isModOutOfStock ? ' ❌' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  }
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* CHECKOUT FOOTER — UNTOUCHED */}
        <View style={styles.checkoutFooter}>
          <View style={[styles.totalRow, { marginBottom: 5 }]}>
            <Text style={{ fontSize: 14, color: '#64748b' }}>Subtotal</Text>
            <Text style={{ fontSize: 14, color: '#64748b' }}>₱{totals.subtotal.toFixed(2)}</Text>
          </View>

          {discountApplied ? (
            <View style={{ marginBottom: 15, padding: 10, backgroundColor: '#fee2e2', borderRadius: 5 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
      <Text style={{ color: '#e74c3c', fontSize: 11, fontWeight: 'bold', flex: 1, marginRight: 8 }}>
        - {discountDetails.type}{'\n'}(VAT Exc. + 20%)
      </Text>
      <Text style={{ color: '#e74c3c', fontSize: 12, fontWeight: 'bold', flexShrink: 0 }}>
        -₱{totals.discountAmount.toFixed(2)}
      </Text>
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: '#e74c3c', fontSize: 10, flex: 1, marginRight: 8 }} numberOfLines={1} ellipsizeMode="tail">
        {discountDetails.name} ({discountDetails.id})
      </Text>
      <TouchableOpacity onPress={() => setDiscountApplied(false)}>
        <Text style={{ color: '#94a3b8', fontSize: 10, textDecorationLine: 'underline' }}>Remove</Text>
      </TouchableOpacity>
    </View>
  </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowDiscountModal(true)}
              disabled={cart.length === 0}
              style={[styles.discountTriggerBtn, cart.length === 0 && styles.discountTriggerBtnDisabled]}
            >
              <Text style={[styles.discountTriggerText, cart.length === 0 && styles.discountTriggerTextDisabled]}>
                {cart.length === 0 ? 'Add items to apply a discount' : 'Apply Senior / PWD Discount'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={[styles.totalRow, { borderTopWidth: 1, borderColor: '#eee', paddingTop: 10 }]}>
            <Text style={styles.totalText}>Total Due</Text>
            <Text style={styles.totalAmount}>₱{totals.finalTotal.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.checkoutBtn, cart.length === 0 ? { backgroundColor: '#cbd5e1' } : { backgroundColor: '#27ae60' }]}
            onPress={handleCheckout}
            disabled={cart.length === 0 || isPrinting}
          >
            <Text style={styles.checkoutBtnText}>
              {cart.length === 0 ? "SELECT ITEMS FIRST" : `PAY ₱${totals.finalTotal.toFixed(2)}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══════════ ALL MODALS BELOW — 100% UNTOUCHED ════════════ */}

      {/* 💳 SENIOR / PWD DISCOUNT MODAL */}
      <Modal visible={showDiscountModal} animationType="none" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.discountBackdrop}
        >
          <View style={styles.discountCard}>
            <Text style={styles.discountTitle}>Apply Legal Discount</Text>
            <Text style={styles.discountNotice}>* Required for BIR Auditing purposes.</Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {discountError ? (
                <View style={styles.formErrorBanner}>
                  <Text style={styles.formErrorText}>{discountError}</Text>
                </View>
              ) : null}

              <View style={styles.discountTypeRow}>
                <TouchableOpacity
                  onPress={() => setDiscountDetails({ ...discountDetails, type: 'Senior Citizen' })}
                  style={[styles.discountTypeChip, discountDetails.type === 'Senior Citizen' && styles.discountTypeChipActive]}
                >
                  <Text style={[styles.discountTypeText, discountDetails.type === 'Senior Citizen' && styles.discountTypeTextActive]}>
                    Senior Citizen
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDiscountDetails({ ...discountDetails, type: 'PWD' })}
                  style={[styles.discountTypeChip, discountDetails.type === 'PWD' && styles.discountTypeChipActive]}
                >
                  <Text style={[styles.discountTypeText, discountDetails.type === 'PWD' && styles.discountTypeTextActive]}>
                    PWD
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.discountLabel}>Customer Name (On ID)</Text>
              <TextInput
                style={[styles.discountInput, !!discountError && !discountDetails.name && styles.discountInputError]}
                placeholder="e.g. Juan Dela Cruz"
                placeholderTextColor="#94A3B8"
                value={discountDetails.name}
                autoCapitalize="words"
                returnKeyType="next"
                onChangeText={(val) => {
                  setDiscountDetails({ ...discountDetails, name: val });
                  if (discountError) setDiscountError('');
                }}
              />

              <Text style={styles.discountLabel}>Control / ID Number</Text>
              <TextInput
                style={[styles.discountInput, { marginBottom: 20 }, !!discountError && !discountDetails.id && styles.discountInputError]}
                placeholder="e.g. 123456789012"
                placeholderTextColor="#94A3B8"
                value={discountDetails.id}
                onChangeText={(val) => {
                  setDiscountDetails({ ...discountDetails, id: val.replace(/[^0-9]/g, '') });
                  if (discountError) setDiscountError('');
                }}
                keyboardType="numeric"
                maxLength={15}
                returnKeyType="done"
              />
            </ScrollView>

            <View style={styles.discountActions}>
              <TouchableOpacity
                onPress={() => {
                  setDiscountError('');
                  setShowDiscountModal(false);
                }}
                style={styles.discountCancelBtn}
              >
                <Text style={styles.discountCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!discountDetails.name || !discountDetails.id) {
                    setDiscountError('Please enter the Customer Name and ID Number from the physical card.');
                    return;
                  }
                  setDiscountError('');
                  setDiscountApplied(true);
                  setShowDiscountModal(false);
                }}
                style={styles.discountApplyBtn}
              >
                <Text style={styles.discountApplyText}>APPLY DISCOUNT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🟢 STARTING CASH MODAL (HARD GATE) */}
      <Modal visible={!shiftStarted} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.shiftBackdrop}
        >
          <View style={styles.shiftCard}>
            <Text style={styles.shiftTitle}>Open Shift</Text>
            <Text style={styles.shiftSubtitle}>
              Welcome! To unlock the POS, please count the starting cash currently in the register.
            </Text>

            {startingCashError ? (
              <View style={styles.formErrorBanner}>
                <Text style={styles.formErrorText}>{startingCashError}</Text>
              </View>
            ) : null}

            <Text style={styles.shiftLabel}>STARTING CASH</Text>
            <View style={[
                styles.shiftInputWrap,
                startingCashFocused && styles.shiftInputWrapFocused,
                !!startingCashError && styles.shiftInputWrapError,
              ]}>
              <Text style={styles.shiftPeso}>₱</Text>
              <TextInput
                style={styles.shiftInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                value={startingCash}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleOpenRegister}
                onFocus={() => setStartingCashFocused(true)}
                onBlur={() => setStartingCashFocused(false)}
                onChangeText={(text) => {
                  let filtered = text.replace(/[^0-9.]/g, '');
                  const parts = filtered.split('.');
                  if (parts.length > 2) filtered = parts[0] + '.' + parts.slice(1).join('');
                  setStartingCash(filtered);
                  if (startingCashError) setStartingCashError('');
                }}
              />
            </View>

            <TouchableOpacity onPress={handleOpenRegister} style={styles.shiftButton}>
              <Text style={styles.shiftButtonText}>OPEN REGISTER</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🛑 END SHIFT BLIND AUDIT MODAL */}
      <Modal visible={showAuditModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', padding: 20, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, width: '100%', maxWidth: 550, maxHeight: '85%' }}>
            <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 5, color: '#e74c3c' }}>🛑 End of Shift Remittance</Text>
            <Text style={{ color: '#64748b', marginBottom: 10, fontSize: 13 }}>Please perform a physical count of the cash drawer and all backroom inventory.</Text>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
              <View style={{ backgroundColor: '#f8fafc', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 12, color: '#334155' }}>Cash Drawer Count</Text>
                {shiftSummary && (
                  <View style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ fontSize: 13, color: '#64748b' }}>Starting Cash</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>₱{parseFloat(shiftSummary.starting_cash).toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={{ fontSize: 13, color: '#64748b' }}>Shift Sales</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#27ae60' }}>+ ₱{parseFloat(shiftSummary.shift_sales).toFixed(2)}</Text>
                    </View>
                    {parseFloat(shiftSummary.total_expenses) > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                        <Text style={{ fontSize: 13, color: '#64748b' }}>Expenses Deducted</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#e74c3c' }}>− ₱{parseFloat(shiftSummary.total_expenses).toFixed(2)}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0f172a' }}>Expected in Drawer</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: '#3b82f6' }}>₱{parseFloat(shiftSummary.expected_cash).toFixed(2)}</Text>
                    </View>
                  </View>
                )}
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>Your Physical Count (₱)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', borderRadius: 8, padding: 12, fontSize: 18, textAlign: 'center' }}
                  keyboardType="numeric"
                  placeholder="Count and enter cash in drawer"
                  value={endingCash}
                  onChangeText={(val) => {
                    setEndingCash(val);
                    setShowVarianceInput(false);
                  }}
                />
                {showVarianceInput && (
                  <View style={{ marginTop: 12, backgroundColor: '#fef9c3', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fde68a' }}>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#92400e', marginBottom: 4 }}>⚠️ MANDATORY: Explain the Cash Variance</Text>
                    <Text style={{ fontSize: 11, color: '#78350f', marginBottom: 8 }}>
                      Expected ₱{parseFloat(shiftSummary?.expected_cash ?? 0).toFixed(2)} · You entered ₱{parseFloat(endingCash || 0).toFixed(2)} · Difference ₱{Math.abs((shiftSummary?.expected_cash ?? 0) - parseFloat(endingCash || 0)).toFixed(2)}
                    </Text>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: '#f59e0b', borderRadius: 6, padding: 10, fontSize: 13, backgroundColor: '#fff', minHeight: 70, textAlignVertical: 'top' }}
                      placeholder="e.g. Gave wrong change to customer #3, short by ₱50."
                      multiline
                      value={varianceReason}
                      onChangeText={setVarianceReason}
                    />
                  </View>
                )}
              </View>

              <Text style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 10, color: '#334155' }}>Inventory Count</Text>
              <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 15, minHeight: 230 }}>
                {rawInventory.slice(inventoryPage * 3, (inventoryPage + 1) * 3).map(item => (
                  <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', flex: 1, paddingRight: 15, lineHeight: 20 }}>
                      {item.item_name} ({item.unit})
                    </Text>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 10, minWidth: 80, maxWidth: 100, textAlign: 'center', fontSize: 16, backgroundColor: '#f8fafc' }}
                      keyboardType="numeric"
                      placeholder="0"
                      value={auditCounts[item.id]}
                      onChangeText={(val) => setAuditCounts(prev => ({ ...prev, [item.id]: val }))}
                    />
                  </View>
                ))}
                {Math.ceil(rawInventory.length / 3) > 1 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 10, borderTopWidth: 1, borderColor: '#e2e8f0' }}>
                    <TouchableOpacity
                      disabled={inventoryPage === 0}
                      onPress={() => setInventoryPage(prev => prev - 1)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, opacity: inventoryPage === 0 ? 0.3 : 1 }}
                    >
                      <Text style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: 13 }}>◀ Prev</Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: 'bold' }}>
                      Page {inventoryPage + 1} of {Math.ceil(rawInventory.length / 3)}
                    </Text>
                    <TouchableOpacity
                      disabled={inventoryPage >= Math.ceil(rawInventory.length / 3) - 1}
                      onPress={() => setInventoryPage(prev => prev + 1)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, opacity: inventoryPage >= Math.ceil(rawInventory.length / 3) - 1 ? 0.3 : 1 }}
                    >
                      <Text style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: 13 }}>Next ▶</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
              <TouchableOpacity
                onPress={submitEndShiftAudit}
                disabled={isSubmittingAudit}
                style={[{ flex: 1, backgroundColor: '#e74c3c', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, isSubmittingAudit && { opacity: 0.5 }]}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15, textAlign: 'center' }}>
                  {isSubmittingAudit ? "SUBMITTING..." : "SUBMIT REMITTANCE"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setEndingCash('');
                  setAuditCounts({});
                  setInventoryPage(0);
                  setShowVarianceInput(false);
                  setShowAuditModal(false);
                }}
                style={{ flex: 1, backgroundColor: '#94a3b8', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15, textAlign: 'center' }}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🖨️ RECEIPT PRINTING MODAL */}
      <Modal visible={isPrinting} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', padding: 30, borderRadius: 15, alignItems: 'center', width: 250 }}>
            <ActivityIndicator size="large" color="#2c3e50" style={{ marginBottom: 15 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2c3e50' }}>Printing Receipt...</Text>
            <Text style={{ color: '#7f8c8d', marginTop: 5, fontSize: 12 }}>Please wait</Text>
          </View>
        </View>
      </Modal>

      {/* 🧾 DIGITAL THERMAL RECEIPT MODAL */}
      <Modal visible={showReceiptModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', width: 320, padding: 25, borderRadius: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }}>
            <Text style={{ textAlign: 'center', fontSize: 22, fontWeight: '900', marginBottom: 5, color: '#0f172a' }}>DuoSync Hub</Text>
            <Text style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>The Meet Up Hub • Taguig City</Text>
            <Text style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginBottom: 15 }}>{receiptData?.date}</Text>
            <View style={{ backgroundColor: '#f1f5f9', borderRadius: 6, padding: 10, marginBottom: 12, alignItems: 'center' }}>
  <Text style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1, marginBottom: 2 }}>RECEIPT NO.</Text>
  <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: '900', color: '#0f172a', letterSpacing: 2 }}>
    {receiptData?.transactionId}
  </Text>
</View>

            {receiptData?.isLaundry && (
              <View style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 4, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' }}>
                <Text style={{ textAlign: 'center', fontSize: 11, color: '#475569', fontWeight: 'bold', marginBottom: 6 }}>LAUNDRY CLAIM TICKET</Text>
                <Text style={{ textAlign: 'center', fontSize: 12, color: '#0f172a' }}>Customer: {receiptData.customerName}</Text>
                <Text style={{ textAlign: 'center', fontSize: 12, color: '#0f172a' }}>Phone: {receiptData.phone}</Text>
                <Text style={{ textAlign: 'center', fontSize: 12, color: '#0f172a' }}>Weight: {receiptData.weight} kg</Text>
                <Text style={{ textAlign: 'center', fontSize: 12, color: '#0f172a', fontWeight: 'bold', marginTop: 4 }}>Pickup: {receiptData.pickupDate}</Text>
              </View>
            )}

            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8', borderStyle: 'dashed', marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 12, color: '#334155' }}>QTY  ITEM</Text>
              <Text style={{ fontWeight: 'bold', fontSize: 12, color: '#334155' }}>AMOUNT</Text>
            </View>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8', borderStyle: 'dashed', marginBottom: 10 }} />

            <ScrollView style={{ maxHeight: 200 }}>
              {receiptData?.cart.map((item, idx) => (
                <View key={idx} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, flex: 1, color: '#0f172a', fontWeight: '600' }}>{item.qty}x {item.item_name}</Text>
                    <Text style={{ fontSize: 12, color: '#0f172a', fontWeight: '600' }}>{(item.base_price * item.qty).toFixed(2)}</Text>
                  </View>
                  {item.modifiers.map((mod, mIdx) => (
                    <View key={mIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 15, marginTop: 2 }}>
                      <Text style={{ fontSize: 10, color: '#64748b' }}>+ {(mod.qty || 1) > 1 ? `${mod.qty}x ` : ''}{mod.modifier_name}</Text>
                      <Text style={{ fontSize: 10, color: '#64748b' }}>{(mod.additional_price * item.qty * (mod.qty || 1)).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>

            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8', borderStyle: 'dashed', marginVertical: 10 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 12, color: '#475569' }}>Subtotal</Text>
              <Text style={{ fontSize: 12, color: '#475569' }}>{receiptData?.totals.subtotal.toFixed(2)}</Text>
            </View>
            {receiptData?.discountAmount > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ fontSize: 12, color: '#e74c3c', fontWeight: 'bold' }}>Discount Applied</Text>
                <Text style={{ fontSize: 12, color: '#e74c3c', fontWeight: 'bold' }}>-{receiptData.discountAmount.toFixed(2)}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>TOTAL</Text>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>₱{receiptData?.totals.finalTotal.toFixed(2)}</Text>
            </View>

            {receiptData?.paymentMethod && (
              <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>Payment</Text>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase' }}>
                    {receiptData.paymentMethod === 'gcash' ? 'GCash' : 'Cash'}
                  </Text>
                </View>
                {receiptData.paymentMethod === 'cash' && receiptData.amountReceived != null && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>Amount Received</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#0f172a' }}>₱{receiptData.amountReceived.toFixed(2)}</Text>
                  </View>
                )}
                {receiptData.paymentMethod === 'gcash' && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>GCash Ref #</Text>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#3b82f6' }}>{receiptData.gcashReference}</Text>
                  </View>
                )}
              </View>
            )}

            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8', borderStyle: 'dashed', marginVertical: 15 }} />
            <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: 'bold', color: '#334155', marginBottom: 20 }}>THANK YOU FOR YOUR PURCHASE!</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#3b82f6', padding: 12, borderRadius: 6, alignItems: 'center' }}
                onPress={() => setShowReceiptModal(false)}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 💳 PAYMENT METHOD MODAL */}
      <Modal visible={showPaymentModal} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Payment Method</Text>
            <Text style={[styles.modalSubtitle, { marginBottom: 20 }]}>Amount due for this order</Text>
            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 36, fontWeight: '900', color: '#16A34A' }}>
                ₱{pendingCheckoutTotals?.finalTotal.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <TouchableOpacity
                onPress={() => setPaymentMethod('cash')}
                style={{ flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 2, borderColor: paymentMethod === 'cash' ? '#16A34A' : '#E2E8F0', backgroundColor: paymentMethod === 'cash' ? '#F0FDF4' : '#fff' }}
              >
                <Text style={{ fontWeight: '700', color: paymentMethod === 'cash' ? '#16A34A' : '#64748B' }}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPaymentMethod('gcash')}
                style={{ flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 2, borderColor: paymentMethod === 'gcash' ? '#3B82F6' : '#E2E8F0', backgroundColor: paymentMethod === 'gcash' ? '#EFF6FF' : '#fff' }}
              >
                <Text style={{ fontWeight: '700', color: paymentMethod === 'gcash' ? '#3B82F6' : '#64748B' }}>GCash</Text>
              </TouchableOpacity>
            </View>

            {paymentMethod === 'cash' && (
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.fieldLabel}>AMOUNT RECEIVED</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 100"
                  placeholderTextColor="#adb5bd"
                  keyboardType="decimal-pad"
                  value={amountReceived}
                  onChangeText={(val) => setAmountReceived(val.replace(/[^0-9.]/g, ''))}
                />
                {parseFloat(amountReceived) >= (pendingCheckoutTotals?.finalTotal ?? 0) && amountReceived !== '' && (
                  <Text style={{ color: '#16A34A', fontSize: 12, marginTop: 4 }}>
                    Change: ₱{(parseFloat(amountReceived) - (pendingCheckoutTotals?.finalTotal ?? 0)).toFixed(2)}
                  </Text>
                )}
                {parseFloat(amountReceived) < (pendingCheckoutTotals?.finalTotal ?? 0) && amountReceived !== '' && (
                  <Text style={{ color: '#DC2626', fontSize: 12, marginTop: 4 }}>
                    ⚠️ Short by ₱{((pendingCheckoutTotals?.finalTotal ?? 0) - parseFloat(amountReceived)).toFixed(2)}
                  </Text>
                )}
              </View>
            )}

            {paymentMethod === 'gcash' && (
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.fieldLabel}>GCASH REFERENCE / TRANSACTION ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1234567890"
                  placeholderTextColor="#adb5bd"
                  value={gcashReference}
                  onChangeText={(val) => setGcashReference(val.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  maxLength={13}
                />
                <Text style={{ color: '#3B82F6', fontSize: 12, marginTop: 4 }}>
                  Double check if ₱{pendingCheckoutTotals?.finalTotal.toFixed(2)} is successfully sent to GCash.
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPaymentModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: paymentMethod === 'gcash' ? '#3B82F6' : '#16A34A' }]}
                onPress={handleConfirmPayment}
              >
                <Text style={styles.confirmBtnText}>
                  {paymentMethod === 'gcash' ? 'Confirm GCash' : 'Confirm Cash'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ⚠️ UNIVERSAL CUSTOM ALERT MODAL */}
      <Modal transparent={true} visible={customAlertVisible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 400, alignItems: 'center', padding: 25 }]}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#26b134', marginBottom: 10, textAlign: 'center' }}>
              {customAlertData.title === "Invalid Inputs" ? " " + customAlertData.title : customAlertData.title}
            </Text>
            <Text style={{ fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
              {customAlertData.message}
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#0f172a', paddingVertical: 12, width: '100%', borderRadius: 8, alignItems: 'center' }}
              onPress={() => {
                setCustomAlertVisible(false);
                if (customAlertData.onConfirm) customAlertData.onConfirm();
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 📦 EMERGENCY RESTOCK MODAL */}
      <Modal visible={showRestockModal} animationType="none" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', padding: 30, justifyContent: 'center' }}>
          <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#2980b9' }}>📦 Emergency Restock</Text>
            <Text style={{ color: '#64748b', marginBottom: 20 }}>This action will be logged. Select the raw ingredient you just brought from the stockroom to unlock the POS.</Text>
            <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>1. Select Raw Ingredient</Text>
            <ScrollView style={{ maxHeight: 150, marginBottom: 15, borderWidth: 1, borderColor: '#eee', borderRadius: 5 }}>
              {restockRawItems.map(raw => (
                <TouchableOpacity
                  key={raw.id}
                  onPress={() => setSelectedRawId(raw.id)}
                  style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: selectedRawId === raw.id ? '#e0f2fe' : 'white' }}
                >
                  <Text style={{ color: selectedRawId === raw.id ? '#0369a1' : '#333', fontWeight: selectedRawId === raw.id ? 'bold' : 'normal' }}>
                    {raw.item_name} (Have: {raw.stock_quantity}{raw.unit} | Need: {raw.amount_needed}{raw.unit})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>2. Amount Added</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 12, fontSize: 16, marginBottom: 20 }}
              keyboardType="numeric"
              placeholder="Enter total amount (e.g. 500)"
              value={restockAmount}
              onChangeText={setRestockAmount}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={submitEmergencyRestock}
                disabled={isSubmittingRestock}
                style={[{ flex: 1, backgroundColor: '#2980b9', padding: 15, borderRadius: 5, alignItems: 'center' }, isSubmittingRestock && { opacity: 0.5 }]}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>
                  {isSubmittingRestock ? 'SUBMITTING...' : 'SUBMIT LOG'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowRestockModal(false)}
                disabled={isSubmittingRestock}
                style={[{ flex: 1, backgroundColor: '#95a5a6', padding: 15, borderRadius: 5, alignItems: 'center' }, isSubmittingRestock && { opacity: 0.5 }]}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🟢 SELECTION MODAL */}
      <Modal visible={selectionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.selectionModal}>
            <Text style={styles.modalTitle}>{currentBaseProduct?.name}</Text>
            <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>Select Size:</Text>
            {currentBaseProduct?.variations.map(v => (
              <TouchableOpacity
                key={v.id}
                style={[styles.sizeOption, selectedSizeId === v.id && styles.activeSize]}
                onPress={() => setSelectedSizeId(v.id)}
              >
                <Text style={{ fontWeight: selectedSizeId === v.id ? 'bold' : 'normal' }}>
                  {v.product_name.split('(')[1]?.replace(')', '') || 'Standard'} — ₱{v.base_price}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectionModalVisible(false)}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => handleAddToCart(currentBaseProduct.variations.find(v => v.id === selectedSizeId))}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Add to Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── STYLESHEET ─────────────────────────────────────────────────────────────
// All original styles are 100% preserved below.
// Two new style blocks are added at the very end for the offline banner.
const styles = StyleSheet.create({
  // ── Discount trigger button (cart footer) ──
  discountTriggerBtn: {
    backgroundColor: '#C7E0FA',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 15,
  },
  discountTriggerBtnDisabled: { backgroundColor: '#F1F5F9' },
  discountTriggerText: { color: '#3B82F6', fontWeight: 'bold', fontSize: 12 },
  discountTriggerTextDisabled: { color: '#94A3B8' },

  // ── Senior / PWD discount modal ──
  discountBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  discountCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  discountTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  discountNotice: { color: '#DC2626', fontSize: 12, fontWeight: '700', marginBottom: 18 },
  discountTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  discountTypeChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  discountTypeChipActive: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  discountTypeText: { fontSize: 14, fontWeight: '600', color: '#64748B', textAlign: 'center' },
  discountTypeTextActive: { fontWeight: '800', color: '#3B82F6' },
  discountLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  discountInput: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 14,
  },
  discountInputError: { borderColor: '#EF4444' },
  discountActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  discountCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  discountCancelText: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  discountApplyBtn: {
    flex: 2,
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  discountApplyText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // ── Open Shift modal ──
  shiftBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shiftCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 400,
  },
  shiftTitle: { fontSize: 24, fontWeight: '800', color: '#16A34A', marginBottom: 8 },
  shiftSubtitle: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
  shiftLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, letterSpacing: 0.5 },
  shiftInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  shiftInputWrapFocused: { borderColor: '#16A34A', backgroundColor: '#fff' },
  shiftInputWrapError: { borderColor: '#EF4444' },
  shiftPeso: { fontSize: 22, fontWeight: '700', color: '#64748B', marginRight: 8 },
  shiftInput: {
  flex: 1,
  paddingVertical: 14,
  fontSize: 22,
  fontWeight: '700',
  color: '#0F172A',
  ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  shiftButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  shiftButtonText: { color: '#fff', fontWeight: '800', fontSize: 17, letterSpacing: 0.5 },
  quickAmountRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  quickAmountChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  quickAmountChipActive: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  quickAmountText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  quickAmountTextActive: { color: '#16A34A' },
  formErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  formErrorText: { color: '#DC2626', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  searchContainer: { margin: 15, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#f1f5f9', borderRadius: 8 },
  searchInput: { fontSize: 16, color: '#333' },

  sectionContainer: { marginBottom: 20 },
  sectionHeader: {
    backgroundColor: '#5b7d99',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginBottom: 10,
    marginHorizontal: 5,
  },
  sectionHeaderText: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap' },

  card: { backgroundColor: '#fff', borderRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#eee', overflow: 'hidden' },
  itemDescription: { fontSize: 10, color: '#64748b', fontStyle: 'italic', marginBottom: 6 },
  cardImage: { width: '100%', height: 90, resizeMode: 'cover' },
  cardContent: { padding: 8 },
  itemName: { fontSize: 13, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  price: { fontSize: 14, fontWeight: '900', color: '#27ae60' },

  cartHeader: { padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  cartTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  cartItem: { backgroundColor: '#fff', padding: 12, marginBottom: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0' },
  cartItemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  cartItemName: { fontSize: 13, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 8 },
cartItemPrice: { fontSize: 13, fontWeight: 'bold', color: '#333', flexShrink: 0 },
  modifierRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 15, marginBottom: 2, flexWrap: 'wrap' },
  modifierText: { fontSize: 12, color: '#64748b', flex: 1, flexWrap: 'wrap', paddingRight: 4 },
  modifierPrice: { fontSize: 12, color: '#64748b', flexShrink: 0 },
  cartActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' },
  addonBtn: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },

  dropdown: { marginTop: 10, backgroundColor: '#f8fafc', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },

  checkoutFooter: { padding: 15, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  totalText: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  totalAmount: { fontSize: 20, fontWeight: '900', color: '#2c3e50', flexShrink: 1 },
  checkoutBtn: { backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  checkoutBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  selectionModal: { backgroundColor: '#fff', padding: 25, borderRadius: 12, width: 350, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#1e293b' },
  sizeOption: { padding: 15, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, marginBottom: 10 },
  activeSize: { borderColor: '#27ae60', backgroundColor: '#f0fdf4' },
  addBtn: { flex: 1, backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center' },
  cancelBtn: { flex: 1, backgroundColor: '#f1f5f9', padding: 15, borderRadius: 8, alignItems: 'center' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  modalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 2,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#16A34A',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },

  // ── OFFLINE ENGINE: New styles for status banners ──────────────────────
  // Floats above everything using absolute positioning.
  // zIndex 999 ensures it renders on top of all siblings without
  // disturbing the existing flex layout at all.
  offlineBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#1e293b',
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  offlineBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offlineBannerText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  offlineBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  offlineBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  syncingBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#0369a1',
    paddingVertical: 7,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  syncingBannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  // ──────────────────────────────────────────────────────────────────────
});