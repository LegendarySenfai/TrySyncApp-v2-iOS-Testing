import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';

export default function UniversalInventory({ category }) {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Batch Restock Modal State
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [referenceNote, setReferenceNote] = useState('');
  const [batchAmounts, setBatchAmounts] = useState({});
  const [batchCosts, setBatchCosts] = useState({}); // 🛠️ NEW: Tracks the money spent per item
  const [isSubmitting, setIsSubmitting] = useState(false); // 🛠️ NEW: Anti-spam lock
  const [formError, setFormError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const fetchIngredients = async () => {
    try {
      const res = await api.get(`/inventory/raw?category=${category}`);
      setIngredients(res.data);
    } catch (err) {
      console.log("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const [refreshing, setRefreshing] = useState(false);

  // Fetch only ONCE when the tab is first loaded
  useEffect(() => { 
      fetchIngredients(); 
  }, [category]);

  // Allow manual pull-to-refresh if Admin adds a new ingredient
  const onRefresh = useCallback(async () => {
      setRefreshing(true);
      await fetchIngredients();
      setRefreshing(false);
  }, [category]);

  const openBatchModal = () => {
      setReferenceNote('');
      setBatchAmounts({});
      setBatchCosts({}); // 🛠️ NEW: Clears old cost data
      setFormError(''); // ← new
      setBatchModalVisible(true);
  };
  const handleAmountChange = (id, rawValue) => {
      let filtered = rawValue.replace(/[^0-9.]/g, '');      
      const parts = filtered.split('.');
      if (parts.length > 2) {                                
          filtered = parts[0] + '.' + parts.slice(1).join('');
      }
      setBatchAmounts(prev => ({ ...prev, [id]: filtered }));
      if (formError) setFormError('');
  };
  const handleCostChange = (id, rawValue) => {
    let filtered = rawValue.replace(/[^0-9.]/g, '');
    const parts = filtered.split('.');
    if (parts.length > 2) {
        filtered = parts[0] + '.' + parts.slice(1).join('');
    }
    setBatchCosts(prev => ({ ...prev, [id]: filtered }));
    if (formError) setFormError('');
};

  const handleSubmitBatch = async () => {
    if (isSubmitting) return; // Anti-spam lock

    // 🛠️ STRICT VALIDATION: Filter out empty inputs AND negative numbers
    const itemsToRestock = ingredients
        .filter(item => {
            const amt = parseFloat(batchAmounts[item.id]);
            return !isNaN(amt) && amt > 0; // Must be a valid number greater than 0
        })
        .map(item => ({
            id: item.id,
            name: item.item_name,
            unit: item.unit,
            amount: parseFloat(batchAmounts[item.id]),
            total_cost_paid: parseFloat(batchCosts[item.id]) || 0 
        }));

    if (!referenceNote.trim()) {
        setFormError('Please enter the Receipt or Reference Number.');   // ← changed
        return;                                                          // ← changed
    }
    if (itemsToRestock.length === 0) {
        setFormError('Please enter a quantity for at least one item.');  // ← changed
        return;                                                          // ← changed
    }


    setFormError('');
    setIsSubmitting(true); // 🔒 Lock the button!

    try {
      await api.post('/inventory/batch-restock', {
        staff_name: user?.username || 'Staff',
        reference_note: referenceNote,
        items: itemsToRestock
      });
      
      Alert.alert("Success", `Successfully logged ${itemsToRestock.length} items from receipt.`);
      setBatchModalVisible(false);
      fetchIngredients(); 
    } catch (err) {
      Alert.alert("Error", "Could not log restock.");
    } finally {
      setIsSubmitting(false); // 🔓 Unlock the button when done
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.itemName}>{item.item_name}</Text>
        <Text style={styles.details}>Measurement Unit: {item.unit}</Text> 
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{category.toUpperCase()} INGREDIENTS</Text>
        <TouchableOpacity style={styles.mainBatchBtn} onPress={openBatchModal}>
            <Text style={styles.mainBatchBtnText}>🧾 Log Grocery Receipt</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#3498db" /> : (
        <FlatList 
            data={ingredients} 
            keyExtractor={(item, index) => index.toString()} 
            renderItem={renderItem} 
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#27ae60']} />
            }
        />
      )}

      {/* BATCH RESTOCK MODAL */}
      <Modal visible={batchModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center'}}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Log Full Receipt</Text>
                <Text style={{color: '#64748b', marginBottom: 15, fontSize: 12}}>
                    Enter the receipt number once, then input the quantities for all items bought on that receipt.
                </Text>
                {formError ? (                                                  
                  <View style={styles.formErrorBanner}>                        
                    <Text style={styles.formErrorText}>{formError}</Text>       
                  </View>                                                          
                ) : null}      

                <Text style={styles.label}>Receipt OR Reference Note <Text style={{color:'red'}}>*</Text></Text>
                <TextInput 
                    placeholder="e.g. OR# 12345 from Puregold" 
                    value={referenceNote} 
                    onChangeText={(text) => {                                   
                        setReferenceNote(text);                                   
                        if (formError) setFormError('');                      
                    }}
                    style={[styles.input, formError && !referenceNote.trim() ? { borderColor: '#EF4444' } : null]}  
                />

                <Text style={[styles.label, {marginTop: 10, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 5}]}>Items Bought</Text>
                <ScrollView style={styles.batchScroll} keyboardShouldPersistTaps="handled">
                    {ingredients.map(item => (
                          <View key={item.id} style={styles.batchRow}>
                              <Text style={styles.batchItemName} numberOfLines={2}>{item.item_name}</Text>
                              <View style={styles.batchInputContainer}>
                                  <View style={[styles.batchField, focusedField === `${item.id}-qty` && styles.batchFieldFocused]}>
                                      <TextInput 
                                          style={styles.batchInput}
                                          placeholder="Qty"
                                          placeholderTextColor="#94A3B8"
                                          keyboardType="decimal-pad"
                                          value={batchAmounts[item.id] || ''}
                                          onChangeText={(val) => handleAmountChange(item.id, val)}
                                          onFocus={() => setFocusedField(`${item.id}-qty`)}
                                          onBlur={() => setFocusedField(null)}
                                      />
                                      <Text style={styles.batchUnit}>{item.unit}</Text>
                                  </View>
                                  <View style={[styles.batchField, focusedField === `${item.id}-cost` && styles.batchFieldFocused]}>
                                      <Text style={styles.batchPeso}>₱</Text>
                                      <TextInput 
                                          style={styles.batchInput}
                                          placeholder="Cost"
                                          placeholderTextColor="#94A3B8"
                                          keyboardType="decimal-pad"
                                          value={batchCosts[item.id] || ''}
                                          onChangeText={(val) => handleCostChange(item.id, val)}
                                          onFocus={() => setFocusedField(`${item.id}-cost`)}
                                          onBlur={() => setFocusedField(null)}
                                      />
                                  </View>
                              </View>
                          </View>
                    ))}
                </ScrollView>

                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={() => setBatchModalVisible(false)} style={[styles.btn, styles.cancelBtn]}>
                      <Text style={{color:'white', fontWeight: 'bold'}}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                      onPress={handleSubmitBatch} 
                      disabled={isSubmitting} // 🔒 Native disable
                      style={[styles.btn, styles.saveBtn, isSubmitting && { opacity: 0.5 }]}
                  >
                      <Text style={{color:'white', fontWeight: 'bold'}}>
                          {isSubmitting ? "Submitting..." : "Submit Entire Receipt"}
                      </Text>
                  </TouchableOpacity>
                </View>
              </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
  mainBatchBtn: { backgroundColor: '#27ae60', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  mainBatchBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  
  row: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  itemName: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  details: { color: '#7f8c8d', fontSize: 12, marginTop: 4 },
  
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 10, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 5, color: '#0f172a' },
  label: { fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', padding: 12, marginBottom: 5, borderRadius: 5, fontSize: 16 },
  
  batchScroll: { maxHeight: 300, marginBottom: 15 },
  batchRow: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  batchItemName: { fontSize: 14, color: '#334155', fontWeight: '600', marginBottom: 8 },
  batchInputContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  batchField: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
  },
  batchFieldFocused: { borderColor: '#0F172A', backgroundColor: '#fff' },
  batchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  batchUnit: { fontSize: 12, color: '#94A3B8', marginLeft: 6 },
  batchPeso: { fontSize: 15, fontWeight: '700', color: '#64748B', marginRight: 4 },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  btn: { flex: 1, padding: 15, borderRadius: 5, alignItems: 'center', marginHorizontal: 5 },
  cancelBtn: { backgroundColor: '#94a3b8' },
  saveBtn: { backgroundColor: '#27ae60' },

    formErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  formErrorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});