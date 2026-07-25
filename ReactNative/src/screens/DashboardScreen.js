import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function DashboardScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Owner Dashboard</Text>

      {/* Summary Cards */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Total Revenue (Today)</Text>
        <Text style={styles.bigNumber}>₱ 12,450.00</Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.cardTitle}>Milkteaaa</Text>
          <Text style={styles.stat}>45 Cups</Text>
        </View>
        <View style={[styles.card, { flex: 1 }]}>
          <Text style={styles.cardTitle}>Carwash</Text>
          <Text style={styles.stat}>8 Cars</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f6f8' },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, marginTop: 40, color: '#2c3e50' },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 15, marginBottom: 15, elevation: 3 }, // elevation adds shadow on Android
  cardTitle: { fontSize: 14, color: '#7f8c8d', marginBottom: 5 },
  bigNumber: { fontSize: 32, fontWeight: 'bold', color: '#27ae60' },
  row: { flexDirection: 'row' },
  stat: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' }
});