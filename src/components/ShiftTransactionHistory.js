import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../config/api';

export default function ShiftTransactionHistory({ category }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ order_count: 0, total_revenue: 0, shift_start: null });
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchShiftTransactions = useCallback(async () => {
    try {
      let txns = [];
      let totalRev = 0;
      let shiftDate = null;

      try {
        // 1. Try dedicated shift endpoint
        const response = await api.get('/transactions/shift', {
          params: { category },
        });
        txns = response.data.transactions || [];
        totalRev = response.data.total_revenue || 0;
        shiftDate = response.data.shift_start;
      } catch (shiftErr) {
        // 2. Safe fallback to /admin/transactions (already live in your system)
        const response = await api.get('/admin/transactions');
        const allData = response.data || [];
        const todayStr = new Date().toDateString();

        const filtered = allData.filter(
          (item) =>
            item.type === 'sale' &&
            (item.category || '').toLowerCase() === (category || '').toLowerCase() &&
            (!item.timestamp || new Date(item.timestamp).toDateString() === todayStr)
        );

        txns = filtered.map((row) => ({
          ...row,
          ref_id: `#TXN-${String(row.id).padStart(5, '0')}`,
          amount: parseFloat(row.amount || 0),
        }));

        totalRev = txns
          .filter((t) => !t.is_voided)
          .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        shiftDate = new Date().toLocaleDateString();
      }

      setTransactions(txns);
      setSummary({
        order_count: txns.length,
        total_revenue: totalRev,
        shift_start: shiftDate,
      });
    } catch (err) {
      console.error('Error fetching shift transactions:', err?.response?.data || err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => {
    fetchShiftTransactions();
  }, [fetchShiftTransactions]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchShiftTransactions();
  };

  const openDetails = (txn) => {
    setSelectedTxn(txn);
    setModalVisible(true);
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const d = new Date(timestamp);
    return d.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item }) => {
    const isVoided = item.is_voided;
    const itemsList = Array.isArray(item.details)
      ? item.details
      : item.details?.items || [];

    const previewText = itemsList
      .map((i) => `${i.qty}x ${i.item_name || 'Item'}`)
      .join(', ') || 'No item details';

    return (
      <TouchableOpacity
        style={[styles.card, isVoided && styles.cardVoided]}
        onPress={() => openDetails(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.refBadge}>
            <Text style={styles.refText}>{item.ref_id}</Text>
          </View>
          <View style={[styles.statusBadge, isVoided ? styles.statusVoided : styles.statusCompleted]}>
            <Text style={[styles.statusText, isVoided ? styles.textVoided : styles.textCompleted]}>
              {isVoided ? 'VOIDED' : 'COMPLETED'}
            </Text>
          </View>
        </View>

        <Text style={styles.previewText} numberOfLines={1}>
          {previewText}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color="#64748B" />
            <Text style={styles.timestampText}>{formatDateTime(item.timestamp)}</Text>
          </View>

          <View style={styles.metaRow}>
            <Ionicons
              name={item.payment_method === 'gcash' ? 'phone-portrait-outline' : 'cash-outline'}
              size={13}
              color="#3B82F6"
            />
            <Text style={styles.paymentMethodText}>
              {item.payment_method?.toUpperCase()}
            </Text>
            <Text style={[styles.amountText, isVoided && styles.amountVoided]}>
              ₱{item.amount.toFixed(2)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0F172A" />
        <Text style={styles.loadingText}>Loading shift transactions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Transaction List with Scrollable Summary Header ── */}
      <FlatList
        style={{ flex: 1 }}
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { flexGrow: 1, paddingBottom: 60 }]}
        showsVerticalScrollIndicator={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.summaryCard}>
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>CURRENT SHIFT ORDERS</Text>
              <Text style={styles.summaryValue}>{summary.order_count}</Text>
              <Text style={styles.summarySub}>{category?.toUpperCase()} POS</Text>
            </View>
            <View style={styles.dividerVertical} />
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>SHIFT GROSS SALES</Text>
              <Text style={styles.summarySales}>₱{summary.total_revenue.toFixed(2)}</Text>
              <Text style={styles.summarySub}>Excludes voids</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Transactions In This Shift</Text>
            <Text style={styles.emptySubtitle}>
              Orders placed in this role's POS will appear here automatically.
            </Text>
          </View>
        }
      />

      {/* ── Detailed Receipt Modal ── */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedTxn?.ref_id}</Text>
                <Text style={styles.modalSubtitle}>{formatDateTime(selectedTxn?.timestamp)}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Customer Info */}
              <View style={styles.detailSection}>
                <Text style={styles.sectionHeader}>CUSTOMER DETAILS</Text>
                <Text style={styles.detailText}>
                  Name: <Text style={styles.detailBold}>{selectedTxn?.customer_name || 'Walk-in'}</Text>
                </Text>
                {selectedTxn?.customer_id && (
                  <Text style={styles.detailText}>
                    ID: <Text style={styles.detailBold}>{selectedTxn.customer_id}</Text>
                  </Text>
                )}
                {selectedTxn?.discount_type && (
                  <Text style={styles.detailText}>
                    Discount: <Text style={styles.detailBold}>{selectedTxn.discount_type}</Text>
                  </Text>
                )}
              </View>

              {/* Laundry Specific Metadata */}
              {selectedTxn?.details?.laundry_data && (
                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>LAUNDRY MANIFEST</Text>
                  <Text style={styles.detailText}>
                    Claim Ticket: <Text style={styles.detailBold}>#{selectedTxn.details.laundry_data.claim_ticket || 'N/A'}</Text>
                  </Text>
                  <Text style={styles.detailText}>
                    Weight: <Text style={styles.detailBold}>{selectedTxn.details.laundry_data.weight_kg || '0'} kg</Text>
                  </Text>
                  <Text style={styles.detailText}>
                    Pickup Date: <Text style={styles.detailBold}>{selectedTxn.details.laundry_data.pickup_date || 'N/A'}</Text>
                  </Text>
                  <Text style={styles.detailText}>
                    Phone: <Text style={styles.detailBold}>{selectedTxn.details.laundry_data.customer_phone || 'N/A'}</Text>
                  </Text>
                </View>
              )}

              {/* Itemized Breakdown */}
              <View style={styles.detailSection}>
                <Text style={styles.sectionHeader}>PURCHASED ITEMS</Text>
                {(Array.isArray(selectedTxn?.details)
                  ? selectedTxn.details
                  : selectedTxn?.details?.items || []
                ).map((item, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>
                        {item.qty}x {item.item_name}
                      </Text>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <Text style={styles.itemMods}>
                          Add-ons: {item.modifiers.map((m) => m.name || m.item_name).join(', ')}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.itemPrice}>
                      ₱{((item.base_price || 0) * (item.qty || 1)).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Payment Summary */}
              <View style={[styles.detailSection, { borderBottomWidth: 0 }]}>
                <Text style={styles.sectionHeader}>PAYMENT</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.detailText}>Method:</Text>
                  <Text style={styles.detailBold}>{selectedTxn?.payment_method?.toUpperCase()}</Text>
                </View>
                {selectedTxn?.gcash_reference && (
                  <View style={styles.priceRow}>
                    <Text style={styles.detailText}>GCash Ref:</Text>
                    <Text style={styles.detailBold}>{selectedTxn.gcash_reference}</Text>
                  </View>
                )}
                {selectedTxn?.amount_received && (
                  <View style={styles.priceRow}>
                    <Text style={styles.detailText}>Amount Tendered:</Text>
                    <Text style={styles.detailBold}>₱{selectedTxn.amount_received.toFixed(2)}</Text>
                  </View>
                )}
                <View style={[styles.priceRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#E2E8F0' }]}>
                  <Text style={styles.totalLabel}>TOTAL PAID</Text>
                  <Text style={styles.totalValue}>₱{selectedTxn?.amount.toFixed(2)}</Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeBtnText}>Close Receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#64748B', fontSize: 14 },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  summaryColumn: { flex: 1, alignItems: 'center' },
  dividerVertical: { width: 1, height: '80%', backgroundColor: '#334155' },
  summaryLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  summaryValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 4 },
  summarySales: { color: '#38BDF8', fontSize: 22, fontWeight: '800', marginTop: 4 },
  summarySub: { color: '#64748B', fontSize: 11, marginTop: 2 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardVoided: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  refBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  refText: { color: '#0F172A', fontWeight: '700', fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusCompleted: { backgroundColor: '#DCFCE7' },
  statusVoided: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 10, fontWeight: '800' },
  textCompleted: { color: '#16A34A' },
  textVoided: { color: '#DC2626' },
  previewText: { fontSize: 13, color: '#334155', fontWeight: '500', marginBottom: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#F1F5F9', paddingTop: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timestampText: { fontSize: 12, color: '#64748B' },
  paymentMethodText: { fontSize: 11, color: '#3B82F6', fontWeight: '700', marginRight: 8 },
  amountText: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  amountVoided: { textDecorationLine: 'line-through', color: '#94A3B8' },
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4, lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, maxHeight: '85%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  modalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  modalBody: { paddingHorizontal: 18, paddingVertical: 12 },
  detailSection: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 6 },
  detailText: { fontSize: 13, color: '#475569', marginBottom: 3 },
  detailBold: { fontWeight: '700', color: '#0F172A' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  itemName: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  itemMods: { fontSize: 11, color: '#64748B', marginTop: 1 },
  itemPrice: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  totalValue: { fontSize: 18, fontWeight: '900', color: '#16A34A' },
  closeBtn: { backgroundColor: '#0F172A', padding: 14, alignItems: 'center' },
  closeBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});