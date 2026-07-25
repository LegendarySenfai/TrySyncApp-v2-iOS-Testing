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
      setBatchModalVisible(true);
  };
  const handleAmountChange = (id, value) => {
      setBatchAmounts(prev => ({ ...prev, [id]: value }));
  };
  const handleCostChange = (id, value) => {
      setBatchCosts(prev => ({ ...prev, [id]: value })); // 🛠️ NEW: Saves the cost typed by user
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

    if (itemsToRestock.length === 0) {
        return Alert.alert("Required", "Please enter valid positive amounts for the items you bought.");
    }
    if (!referenceNote) {
        return Alert.alert("Required", "Please enter the Receipt or Reference Number.");
    }

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

                <Text style={styles.label}>Receipt OR Reference Note <Text style={{color:'red'}}>*</Text></Text>
                <TextInput 
                    placeholder="e.g. OR# 12345 from Puregold" 
                    value={referenceNote} 
                    onChangeText={setReferenceNote} 
                    style={styles.input} 
                />

                <Text style={[styles.label, {marginTop: 10, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 5}]}>Items Bought</Text>
                <ScrollView style={styles.batchScroll} keyboardShouldPersistTaps="handled">
                    {ingredients.map(item => (
                        <View key={item.id} style={styles.batchRow}>
                            <Text style={styles.batchItemName} numberOfLines={1}>{item.item_name}</Text>
                            <View style={styles.batchInputContainer}>
                                <TextInput 
                                    style={[styles.batchInput, { marginRight: 5 }]}
                                    placeholder="Qty"
                                    keyboardType="numeric"
                                    value={batchAmounts[item.id] || ''}
                                    onChangeText={(val) => handleAmountChange(item.id, val)}
                                />
                                <TextInput 
                                    style={[styles.batchInput, { marginRight: 5, borderColor: '#10b981' }]}
                                    placeholder="Cost ₱"
                                    keyboardType="numeric"
                                    value={batchCosts[item.id] || ''}
                                    onChangeText={(val) => handleCostChange(item.id, val)}
                                />
                                <Text style={styles.batchUnit}>{item.unit}</Text>
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
  batchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  batchItemName: { flex: 1, fontSize: 14, color: '#334155', paddingRight: 10, fontWeight: '500' },
  batchInputContainer: { flexDirection: 'row', alignItems: 'center', width: 170 },
  batchInput: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, padding: 8, textAlign: 'center' },
  batchUnit: { width: 30, textAlign: 'right', fontSize: 12, color: '#94a3b8' },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  btn: { flex: 1, padding: 15, borderRadius: 5, alignItems: 'center', marginHorizontal: 5 },
  cancelBtn: { backgroundColor: '#94a3b8' },
  saveBtn: { backgroundColor: '#27ae60' }
});