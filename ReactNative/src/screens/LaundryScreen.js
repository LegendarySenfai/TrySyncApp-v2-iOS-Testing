import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Platform, KeyboardAvoidingView
} from 'react-native';
import api from '../config/api';
import UniversalPOS from '../components/UniversalPOS';

// ─────────────────────────────────────────────
//  Helper: generate a readable claim ticket ID
//  e.g. "LND-20260422-0047"
// ─────────────────────────────────────────────
const generateClaimTicket = () => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `LND-${datePart}-${rand}`;
};

// ─────────────────────────────────────────────
//  Default pickup time: next day, same hour
// ─────────────────────────────────────────────
const getDefaultPickupDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
};

const showResponsiveAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function LaundryScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Customer Info Modal State ──────────────
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [pendingCheckoutPayload, setPendingCheckoutPayload] = useState(null);
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [weightKg, setWeightKg]           = useState('');
  const [pickupDate, setPickupDate]       = useState(getDefaultPickupDate());
  const [claimTicket, setClaimTicket]     = useState('');

  // ── Payment Method Modal State ─────────────
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [gcashReference, setGcashReference] = useState('');
  const [pendingTotal, setPendingTotal] = useState(0);

  // ── Claim Ticket Success Modal ─────────────
  const [ticketModalVisible, setTicketModalVisible] = useState(false);
  const [lastTicket, setLastTicket]     = useState('');
  const [lastCustomer, setLastCustomer] = useState('');
  const [lastPickup, setLastPickup]     = useState('');
  const [lastPhone, setLastPhone]       = useState('');
  const [lastWeight, setLastWeight]     = useState('');
  const [lastTotal, setLastTotal]       = useState(0);
  const [checkoutResolver, setCheckoutResolver] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // 🛠️ NEW: Anti-spam lock

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/inventory/products?category=laundry');
      setItems(response.data);
    } catch {
      console.log('Failed to load laundry products');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  This function is passed to UniversalPOS as `onBeforeCheckout`.
  //  UniversalPOS will call it INSTEAD of its own api.post('/transaction/checkout')
  //  when the category is "laundry".
  //  It receives the fully-built payload that UniversalPOS already prepared,
  //  so we do NOT touch any cart/math/discount logic — we just intercept it,
  //  show the customer info modal, then forward it to the backend ourselves.
  // ─────────────────────────────────────────────────────────────────────────
  const handleBeforeCheckout = (payload) => {
  return new Promise((resolve) => {
    setPendingCheckoutPayload(payload);
    setPendingTotal(payload.total_revenue ?? 0);
    setPaymentMethod('cash');
    setAmountReceived('');
    setGcashReference('');
    setPaymentModalVisible(true);   // ← show payment modal first
    setCheckoutResolver(() => resolve);
  });
};

const handleConfirmPayment = () => {
  // Validate
  if (paymentMethod === 'cash') {
    const received = parseFloat(amountReceived);
    if (isNaN(received) || received < pendingTotal) {
      return showResponsiveAlert('Invalid Amount', `Amount received cannot be less than ₱${pendingTotal.toFixed(2)}.`);
    }
  } else {
    if (!gcashReference.trim()) {
      return showResponsiveAlert('Required', 'Please enter the GCash Reference / Transaction ID.');
    }
  }

  // Payment is valid — close payment modal and open customer info modal
  setPaymentModalVisible(false);
  setCustomerName('');
  setCustomerPhone('');
  setWeightKg('');
  setPickupDate(getDefaultPickupDate());
  setClaimTicket(generateClaimTicket());
  setCustomerModalVisible(true);
};

  const handleConfirmCustomerInfo = async () => {
    if (isSubmitting) return; // 🛠️ NEW: Anti-spam lock prevents double execution

    if (!customerName.trim()) {
      return showResponsiveAlert('Required', 'Please enter the customer name.');
    }
    const phoneRegex = /^09\d{9}$/;
    if (!phoneRegex.test(customerPhone.trim())) {
      return showResponsiveAlert('Invalid Number', 'Enter a valid phone number.');
    }
    if (!weightKg.trim() || isNaN(parseFloat(weightKg)) || parseFloat(weightKg) <= 0) {
      return showResponsiveAlert('Required', 'Please enter a valid weight in kg.');
    }

    setIsSubmitting(true); // 🔒 Lock the button!

    try {
      // Forward the payload UniversalPOS built + laundry-specific fields
      await api.post('/transaction/checkout', {
        ...pendingCheckoutPayload,            // cart_items, total_revenue, discount_* (untouched)
        customer_name:  customerName.trim(),  // override/add customer_name
        customer_phone: customerPhone.trim(),
        weight_kg:      parseFloat(weightKg),
        pickup_date:    pickupDate,
        claim_ticket:   claimTicket,
        order_type:     'laundry',
        payment_method:  paymentMethod,                                          // ADD
        amount_received: paymentMethod === 'cash' ? parseFloat(amountReceived) : null,  // ADD
        gcash_reference: paymentMethod === 'gcash' ? gcashReference.trim() : null,
      });

      // Save all details for the ticket modal
      setLastTicket(claimTicket);
      setLastCustomer(customerName.trim());
      setLastPickup(pickupDate);
      setLastPhone(customerPhone.trim());
      setLastWeight(parseFloat(weightKg).toFixed(1));
      setLastTotal(pendingCheckoutPayload?.total_revenue ?? 0);

      setCustomerModalVisible(false);
      setTicketModalVisible(true);

    } catch (err) {
      showResponsiveAlert('Checkout Failed', err.response?.data?.message || 'Server Error');
      if (checkoutResolver) checkoutResolver({ success: false });
    } finally {
      setIsSubmitting(false); // 🔓 Unlock the button safely
    }
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── UniversalPOS (unchanged internals) ─────────────────────────── */}
      <UniversalPOS
        category="laundry"
        title="LAUNDRY SERVICES"
        onBeforeCheckout={handleBeforeCheckout}
      />

      {/* ── Payment Method Modal ───────────────────────────────────────── */}
<Modal
  visible={paymentModalVisible}
  animationType="slide"
  transparent
  onRequestClose={() => {
    setPaymentModalVisible(false);
    if (checkoutResolver) checkoutResolver({ success: false });
  }}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.modalCard}>

      {/* Header */}
      <Text style={styles.modalTitle}>Select Payment Method</Text>
      <Text style={[styles.modalSubtitle, { marginBottom: 20 }]}>Amount due for this order</Text>

      {/* Total Amount Display */}
      <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 36, fontWeight: '900', color: '#16A34A' }}>
          ₱{Number(pendingTotal).toFixed(2)}
        </Text>
      </View>

      {/* Cash / GCash Toggle */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <TouchableOpacity
          onPress={() => setPaymentMethod('cash')}
          style={{
            flex: 1, padding: 14, borderRadius: 10, alignItems: 'center',
            borderWidth: 2,
            borderColor: paymentMethod === 'cash' ? '#16A34A' : '#E2E8F0',
            backgroundColor: paymentMethod === 'cash' ? '#F0FDF4' : '#fff',
          }}
        >
          
          <Text style={{ fontWeight: '700', color: paymentMethod === 'cash' ? '#16A34A' : '#64748B', marginTop: 2, textAlign: 'center' }}>Cash</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPaymentMethod('gcash')}
          style={{
            flex: 1, padding: 14, borderRadius: 10, alignItems: 'center',
            borderWidth: 2,
            borderColor: paymentMethod === 'gcash' ? '#3B82F6' : '#E2E8F0',
            backgroundColor: paymentMethod === 'gcash' ? '#EFF6FF' : '#fff',
          }}
        >
          
          <Text style={{ fontWeight: '700', color: paymentMethod === 'gcash' ? '#3B82F6' : '#64748B', marginTop: 2, textAlign: 'center' }}>GCash</Text>
        </TouchableOpacity>
      </View>

      {/* Cash: Amount Received Input */}
      {paymentMethod === 'cash' && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.fieldLabel}>AMOUNT RECEIVED</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 100"
            placeholderTextColor="#adb5bd"
            keyboardType="decimal-pad"
            value={amountReceived}
            onChangeText={setAmountReceived}
          />
          {parseFloat(amountReceived) >= pendingTotal && (
            <Text style={{ color: '#16A34A', fontSize: 12, marginTop: 4 }}>
              Change: ₱{(parseFloat(amountReceived) - pendingTotal).toFixed(2)}
            </Text>
          )}
        </View>
      )}

      {/* GCash: Reference Input */}
      {paymentMethod === 'gcash' && (
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.fieldLabel}>GCASH REFERENCE / TRANSACTION ID</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 1234567890"
            placeholderTextColor="#adb5bd"
            value={gcashReference}
            onChangeText={setGcashReference}
          />
          <Text style={{ color: '#3B82F6', fontSize: 12, marginTop: 4 }}>
            Double check if ₱{Number(pendingTotal).toFixed(2)} is successfully sent to GCash.
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.modalActions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => {
            setPaymentModalVisible(false);
            if (checkoutResolver) checkoutResolver({ success: false });
          }}
        >
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

      {/* ── Customer Info Modal ─────────────────────────────────────────── */}
      <Modal
        visible={customerModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomerModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>

            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBadge}>
                <Text style={styles.modalIcon}>🧺</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Customer Drop-Off</Text>
                <Text style={styles.modalSubtitle}>Fill in details before confirming the order</Text>
              </View>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ marginBottom: 10 }}
            >
              {/* Claim Ticket Preview */}
              <View style={styles.ticketPreview}>
                <Text style={styles.ticketPreviewLabel}>CLAIM TICKET</Text>
                <Text style={styles.ticketPreviewNumber}>{claimTicket}</Text>
              </View>

              {/* Customer Name */}
              <Text style={styles.fieldLabel}>Customer Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Maria Santos"
                placeholderTextColor="#adb5bd"
                value={customerName}
                onChangeText={setCustomerName}
                autoCapitalize="words"
                returnKeyType="next"
              />

              {/* Contact Number */}
              <Text style={styles.fieldLabel}>Contact Number <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 09171234567"
                placeholderTextColor="#adb5bd"
                value={customerPhone}
                onChangeText={(text) => setCustomerPhone(text.replace(/[^0-9]/g, ''))}
                keyboardType="phone-pad"
                maxLength={11}
                returnKeyType="next"
              />

              {/* Weight */}
              <Text style={styles.fieldLabel}>
                Load Weight <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="0.0"
                  placeholderTextColor="#adb5bd"
                  value={weightKg}
                  onChangeText={setWeightKg}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <View style={styles.unitBadge}>
                  <Text style={styles.unitBadgeText}>kg</Text>
                </View>
              </View>
              <Text style={styles.fieldHint}>Weigh the load before entering</Text>

              {/* Pickup Date */}
              <Text style={[styles.fieldLabel, { marginTop: 15 }]}>Pickup Date</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. May 1, 2026"
                placeholderTextColor="#adb5bd"
                value={pickupDate}
                onChangeText={setPickupDate}
              />

            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setCustomerModalVisible(false);
                  if (checkoutResolver) checkoutResolver({ success: false });
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, isSubmitting && { opacity: 0.5 }]}
                onPress={handleConfirmCustomerInfo}
                disabled={isSubmitting} // 🔒 Native disable
              >
                <Text style={styles.confirmBtnText}>
                  {isSubmitting ? "Confirming..." : "Confirm Order"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Claim Ticket Success Modal ──────────────────────────────────── */}
      <Modal
        visible={ticketModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setTicketModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { alignItems: 'center', paddingVertical: 35 }]}>

            <Text style={{ fontSize: 48, marginBottom: 10 }}>🎟️</Text>
            <Text style={styles.successTitle}>Order Confirmed!</Text>
            <Text style={styles.successSub}>Attach this ticket to the laundry bag</Text>

            <View style={[styles.bigTicket, { paddingHorizontal: 20 }]}>
              <Text style={styles.bigTicketLabel}>CLAIM TICKET</Text>
              <Text
                style={styles.bigTicketNumber}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
              >
                {lastTicket}
              </Text>
            </View>

            <View style={styles.successDetails}>
              <View style={styles.successRow}>
                <Text style={styles.successKey}>Customer</Text>
                <Text style={styles.successVal}>{lastCustomer}</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successKey}>Phone</Text>
                <Text style={styles.successVal}>{lastPhone}</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successKey}>Weight</Text>
                <Text style={styles.successVal}>{lastWeight} kg</Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successKey}>Total</Text>
                <Text style={[styles.successVal, { color: '#27ae60', fontWeight: 'bold' }]}>
                  ₱{Number(lastTotal).toFixed(2)}
                </Text>
              </View>
              <View style={styles.successRow}>
                <Text style={styles.successKey}>Pickup Date</Text>
                <Text style={styles.successVal}>{lastPickup}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, { flex: 0, marginTop: 25, width: '100%', justifyContent: 'center' }]}
              onPress={() => {
                setTicketModalVisible(false);
                
                if (checkoutResolver) checkoutResolver({ 
                    success: true, 
                    ticket: lastTicket, 
                    customer: lastCustomer, 
                    pickupDate: lastPickup,
                    phone: lastPhone,      
                    weight: lastWeight,
                    paymentMethod: paymentMethod,
                    amountReceived: paymentMethod === 'cash' ? parseFloat(amountReceived) : null,
                    change: paymentMethod === 'cash' ? (parseFloat(amountReceived) - (pendingCheckoutPayload?.total_revenue ?? 0)) : null,
                    gcashReference: paymentMethod === 'gcash' ? gcashReference : null
                });
                
                fetchData();
              }}
            >
              <Text style={styles.confirmBtnText}>Print</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Modal shell
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

  // Modal header
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  modalIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalIcon:     { fontSize: 24 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  modalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },

  // Ticket preview inside form
  ticketPreview: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  ticketPreviewLabel:  { fontSize: 10, fontWeight: '700', color: '#16A34A', letterSpacing: 2 },
  ticketPreviewNumber: { fontSize: 22, fontWeight: '900', color: '#15803D', marginVertical: 4, letterSpacing: 1 },
  ticketPreviewHint:   { fontSize: 11, color: '#4ADE80' },

  // Form fields
  fieldLabel:  { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 14 },
  required:    { color: '#EF4444' },
  fieldHint:   { fontSize: 11, color: '#94A3B8', marginTop: 4 },
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
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unitBadge: {
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  unitBadgeText: { fontWeight: '700', color: '#475569', fontSize: 14 },

  // Buttons
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText:  { color: '#64748B', fontWeight: '700', fontSize: 14 },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#16A34A',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Success / ticket modal
  successTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  successSub:   { fontSize: 13, color: '#64748B', marginBottom: 20 },
  bigTicket: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
  },
  bigTicketLabel:  { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  bigTicketNumber: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 6, letterSpacing: 2 },
  successDetails: {
    width: '100%',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  successRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  successKey: { fontSize: 13, color: '#64748B' },
  successVal: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
});