import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import api from '../config/api';
import UniversalPOS from '../components/UniversalPOS';

export default function MilkteaScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentCategory, setCurrentCategory] = useState('milktea');

  // UI/UX: List of categories for your selector
  const categories = [
    { label: 'Milktea', value: 'milktea' },
    { label: 'Frappes', value: 'frappe' },
    { label: 'Snacks', value: 'snacks' },
    { label: 'Laundry', value: 'laundry' },
  ];

  useEffect(() => {
    fetchData();
  }, [currentCategory]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/inventory/products?category=${currentCategory}`);
      setItems(response.data);
    } catch (error) {
      console.log("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  if (loading && items.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  return (
    <View style={styles.container}>
      <UniversalPOS 
        category={currentCategory} // Pass category for polling logic
        data={items} 
        title={currentCategory.toUpperCase()} 
        onRefresh={fetchData} 
        categories={categories}
        selectedCategory={currentCategory}
        onCategoryChange={(val) => setCurrentCategory(val)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});