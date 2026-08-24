/**
 * TaskInboxScreen.js
 * React Native — Staff Task Inbox
 * Fetches pending restock tasks and handles closed-loop inventory updates.
 */

import React, { useState, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, Linking, RefreshControl, Platform,
    Modal, TextInput, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api, { BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
};

const sanitizeDecimal = (raw) => {
    let filtered = raw.replace(/[^0-9.]/g, '');
    const parts = filtered.split('.');
    if (parts.length > 2) {
        filtered = parts[0] + '.' + parts.slice(1).join('');
    }
    return filtered;
};

const TASK_LABELS = {
    restock:      { icon: 'bag-add-outline',    color: '#1d4ed8', label: 'Restock Order'  },
    audit_check:  { icon: 'checkmark-circle-outline', color: '#15803d', label: 'Audit Check' },
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function TaskInboxScreen() {
    const { user } = useAuth();
    const [tasks, setTasks]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [activeTask, setActiveTask]     = useState(null);
    const [batchAmounts, setBatchAmounts] = useState({});
    const [batchCosts, setBatchCosts]     = useState({});
    const [referenceNote, setReferenceNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');     
    const [fieldErrors, setFieldErrors] = useState({}); 

    // ── Fetch Tasks ──────────────────────────────────────────
    const fetchTasks = useCallback(async () => {
        if (!user?.username) return;
        try {
            const res = await api.get(`/api/ai/mobile-tasks/${user.username}`);
            setTasks(res.data);
        } catch (err) {
            console.error('[TaskInbox] fetch error:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.username]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchTasks();
        }, [fetchTasks])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchTasks();
    };

    // ── Open PDF ─────────────────────────────────────────────
    const handleOpenPDF = async (task) => {
        const fullUrl = `${BASE_URL}${task.pdf_file_url}`;
        try {
            const supported = await Linking.canOpenURL(fullUrl);
            if (!supported) {
                return Alert.alert('Cannot Open', `No app found to open PDF.\n\nURL: ${fullUrl}`);
            }
            await Linking.openURL(fullUrl);
        } catch (err) {
            Alert.alert('Error', `Failed to open PDF: ${err.message}`);
        }
    };

    // ── Open Modal ───────────────────────────────────────────
    const openRestockModal = (task) => {
        if (task.task_type !== 'restock') {
            return handleMarkComplete(task.id); 
        }
        setActiveTask(task);
        setBatchAmounts({});
        setBatchCosts({});
        setReferenceNote('');
        setFormError('');       
         setFieldErrors({}); 
        setModalVisible(true);
    };

    // ── Submit Closed-Loop Restock ───────────────────────────
    const handleSubmitRestock = async () => {
        if (isSubmitting || !activeTask) return;

        // 1. Parse the AI items
        let items = [];
        try {
            items = typeof activeTask.items_payload === 'string' 
                ? JSON.parse(activeTask.items_payload) 
                : activeTask.items_payload;
        } catch (e) { items = []; }
//a
        if (!items || items.length === 0) {
            setFormError('No items found in this AI task to restock.');  // ← changed
            return;      
        }

        // 2. STRICT VALIDATION & Formatting Payload for the Backend
        const formattedItems = [];
        const newFieldErrors = {};   
        let hasError = false;         

        for (const item of items) {
            const id = item.raw_inventory_id;
            const addedStockStr = batchAmounts[id];
            const costAmountStr = batchCosts[id];
            const addedStock = parseFloat(addedStockStr);
            const costAmount = parseFloat(costAmountStr);

            // ← changed: combine "empty" and "invalid number" into one flag per field
            const qtyInvalid  = !addedStockStr || addedStockStr.trim() === '' || isNaN(addedStock) || addedStock <= 0;
            const costInvalid = !costAmountStr || costAmountStr.trim() === '' || isNaN(costAmount) || costAmount < 0;

            if (qtyInvalid || costInvalid) {                       
                hasError = true;                                    
                newFieldErrors[id] = { qty: qtyInvalid, cost: costInvalid };  
            } else {                                                
                formattedItems.push({
                    raw_inventory_id: id,
                    amount_added: addedStock,
                    cost_amount: costAmount
                });
            }
        }

        if (hasError) {                                            
            setFieldErrors(newFieldErrors);                        
            setFormError('Please fill in a valid Qty and Cost for every item');  
            return;                                                  
        }

        setFieldErrors({});   
        setFormError('');     

        // If validation passes, start submission process
        setIsSubmitting(true);

        try {
            // 3. Post to the backend route
            await api.post('/inventory/batch-restock', {
                items: formattedItems,
                reference_note: referenceNote || 'AI Delegated Restock',
                staff_name: user?.username || 'Staff'
            });

            // 4. Mark AI task as permanently complete
            await api.post(`/api/ai/complete-task/${activeTask.id}`);

            // 5. Cleanup & Success Alert
            setModalVisible(false);
            setActiveTask(null);
            setTasks(prev => prev.filter(t => t.id !== activeTask.id));
            Alert.alert("Success", "Restock officially logged! The inventory and expenses have been updated.");

        } catch (err) {
            // Extract exact error message from backend
            const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || "Failed to log restock.";
            Alert.alert("Server Error", errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Fallback for simple non-restock task completion
    const handleMarkComplete = async (taskId) => {
        try {
            await api.post(`/api/ai/complete-task/${taskId}`);
            setTasks(prev => prev.filter(t => t.id !== taskId));
        } catch (err) {
            console.error(err);
        }
    };

    // ── Parse Active Items for Modal ─────────────────────────
    const getActiveItems = () => {
        if (!activeTask || !activeTask.items_payload) return [];
        try {
            return typeof activeTask.items_payload === 'string' 
                ? JSON.parse(activeTask.items_payload) 
                : activeTask.items_payload;
        } catch (e) { return []; }
    };

    // ── Render Item ──────────────────────────────────────────
    const renderTask = ({ item }) => {
        const meta = TASK_LABELS[item.task_type] || TASK_LABELS.restock;
        return (
            <TouchableOpacity style={styles.card} onPress={() => handleOpenPDF(item)} activeOpacity={0.82}>
                <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />
                <View style={[styles.iconWrap, { backgroundColor: meta.color + '18' }]}>
                    <Ionicons name={meta.icon} size={26} color={meta.color} />
                </View>
                <View style={styles.cardBody}>
                    <Text style={styles.taskType}>{meta.label}</Text>
                    <Text style={styles.taskDate}>{formatDate(item.created_at)}</Text>
                    <View style={styles.statusRow}>
                        <View style={styles.pendingBadge}>
                            <Text style={styles.pendingText}>⏳ Pending</Text>
                        </View>
                        <Text style={styles.tapHint}>Tap to open PDF →</Text>
                    </View>
                </View>
                <TouchableOpacity style={styles.doneBtn} onPress={() => openRestockModal(item)}>
                    <Ionicons name="checkmark-done-outline" size={18} color="white" />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    // ── Loading / Empty states ───────────────────────────────
    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#1d4ed8" />
                <Text style={styles.loadingText}>Loading your tasks...</Text>
            </View>
        );
    }

    const Empty = () => (
        <View style={styles.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#86efac" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>All Clear!</Text>
            <Text style={styles.emptySubtitle}>You have no pending tasks right now.{'\n'}Pull down to refresh.</Text>
        </View>
    );

    // ── Main Render ──────────────────────────────────────────
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.headerTitle}>📋 Task Inbox</Text>
                    <Text style={styles.headerSub}>Welcome, {user?.username || 'Staff'}</Text>
                </View>
                {tasks.length > 0 && (
                    <View style={styles.badge}><Text style={styles.badgeText}>{tasks.length}</Text></View>
                )}
            </View>

            {tasks.length > 0 && (
                <View style={styles.infoBar}>
                    <Ionicons name="information-circle-outline" size={15} color="#1d4ed8" />
                    <Text style={styles.infoText}>
                        {tasks.length} pending task(s) · Tap to view PDF, check ✓ when bought.
                    </Text>
                </View>
            )}

            <FlatList
                data={tasks}
                keyExtractor={item => String(item.id)}
                renderItem={renderTask}
                ListEmptyComponent={Empty}
                contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1d4ed8']} tintColor="#1d4ed8" />}
            />

            {/* ── BATCH RESTOCK MODAL ── */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Confirm Restock</Text>
                        <Text style={styles.modalSubtitle}>Input the exact amounts bought and prices paid based on the AI order.</Text>

                        {formError ? (                                             
                        <View style={styles.formErrorBanner}>                     
                            <Text style={styles.formErrorText}>{formError}</Text>   
                        </View>                                                   
                        ) : null}                                                   

                        <Text style={[styles.label, { marginTop: 15 }]}>Receipt / Reference Note (Optional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. OR# 10293 from SM Supermarket"
                            value={referenceNote}
                            onChangeText={setReferenceNote}
                        />

                        <Text style={[styles.label, { marginTop: 10, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingBottom: 5 }]}>
                            Items Ordered by AI
                        </Text>

                        <ScrollView style={styles.batchScroll}>
                            {getActiveItems().map(item => (
                                <View key={item.raw_inventory_id} style={styles.batchRow}>
                                    <Text style={styles.batchItemName} numberOfLines={2}>{item.item_name}</Text>
                                    <View style={styles.batchInputContainer}>
                                            <TextInput
                                            style={[
                                                styles.input,
                                                { width: 80, marginRight: 5, marginBottom: 0 },
                                                fieldErrors[item.raw_inventory_id]?.qty ? { borderColor: '#EF4444' } : null 
                                            ]}
                                            placeholder={`+ Qty (${item.unit})`}
                                            keyboardType="decimal-pad"
                                            value={batchAmounts[item.raw_inventory_id] || ''}
                                            onChangeText={(text) => {
                                                setBatchAmounts(prev => ({ ...prev, [item.raw_inventory_id]: sanitizeDecimal(text) }));
                                                if (fieldErrors[item.raw_inventory_id]?.qty) {                               
                                                    setFieldErrors(prev => ({                                                
                                                        ...prev,                                                             
                                                        [item.raw_inventory_id]: { ...prev[item.raw_inventory_id], qty: false }
                                                    }));                                                                    
                                                }                                                                           
                                            }}
                                        />
                                        <TextInput
                                            style={[
                                                styles.input,
                                                { width: 80, marginBottom: 0 },
                                                fieldErrors[item.raw_inventory_id]?.cost ? { borderColor: '#EF4444' } : null 
                                            ]}
                                            placeholder="Cost (₱)"
                                            keyboardType="decimal-pad"
                                            value={batchCosts[item.raw_inventory_id] || ''}
                                            onChangeText={(text) => {                                                        /* ← changed */
                                                setBatchCosts(prev => ({ ...prev, [item.raw_inventory_id]: sanitizeDecimal(text) }));
                                                if (fieldErrors[item.raw_inventory_id]?.cost) {                              
                                                    setFieldErrors(prev => ({                                                
                                                        ...prev,                                                             
                                                        [item.raw_inventory_id]: { ...prev[item.raw_inventory_id], cost: false }
                                                    }));                                                                    
                                                }                                                                           
                                            }}
                                        />
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.submitBtn, { flex: 1, opacity: isSubmitting ? 0.7 : 1 }]} 
                                onPress={handleSubmitRestock} 
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Confirm Delivery</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F2F5' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
    loadingText: { marginTop: 12, color: '#64748b', fontSize: 14 },
    header: { backgroundColor: '#0f172a', paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { color: 'white', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    headerSub: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
    badge: { backgroundColor: '#ef4444', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    badgeText: { color: 'white', fontSize: 13, fontWeight: '800' },
    infoBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', borderBottomWidth: 1, borderColor: '#bfdbfe', paddingHorizontal: 16, paddingVertical: 10 },
    infoText: { color: '#1d4ed8', fontSize: 12, fontWeight: '600', flex: 1 },
    listContent: { padding: 16 },
    card: { backgroundColor: 'white', borderRadius: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    cardAccent: { width: 5, alignSelf: 'stretch' },
    iconWrap: { width: 52, height: 52, borderRadius: 10, justifyContent: 'center', alignItems: 'center', margin: 14 },
    cardBody: { flex: 1, paddingVertical: 14, paddingRight: 8 },
    taskType: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 3 },
    taskDate: { fontSize: 12, color: '#64748b', marginBottom: 8 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pendingBadge: { backgroundColor: '#fef9c3', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: '#fde68a' },
    pendingText: { fontSize: 11, color: '#92400e', fontWeight: '700' },
    tapHint: { fontSize: 12, color: '#94a3b8' },
    doneBtn: { backgroundColor: '#16a34a', width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    emptyContainer: { flex: 1 },
    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingTop: 80 },
    emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },

    // ── Modal Styles ───────────────────────────
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.75)', padding: 20 },
    modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
    modalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4, marginBottom: 10 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 5 },
    input: { borderWidth: 1, borderColor: '#cbd5e1', padding: 12, borderRadius: 8, fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc' },
    batchScroll: { maxHeight: 300, marginBottom: 15 },
    batchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' },
    batchItemName: { flex: 1, fontSize: 14, color: '#334155', paddingRight: 10, fontWeight: '600' },
    batchInputContainer: { flexDirection: 'row', alignItems: 'center', width: 170 },
    modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    cancelBtn: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 8, alignItems: 'center' },
    submitBtn: { backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center' },

    cancelBtnText: { fontWeight: 'bold', color: '#64748b' },
    submitBtnText: { fontWeight: 'bold', color: 'white' },

    
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
