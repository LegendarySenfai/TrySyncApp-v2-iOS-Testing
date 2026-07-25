import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Alert, View, ActivityIndicator } from 'react-native';
import LaundryScreen from '../screens/LaundryScreen';


// Context
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import UniversalPOS from '../components/UniversalPOS';
import TaskInboxScreen from '../screens/TaskInboxScreen';
import UniversalInventory from '../components/UniversalInventory';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// --- 1. CONFIGURING THE SCREENS ---

// ✅ FIXED: Explicitly defined 'milktea' category
const MilkteaPOSScreen = () => <UniversalPOS category="milktea" title="Milktea POS" />;
const MilkteaInventoryScreen = () => <UniversalInventory category="milktea" />;

// Laundry Screens
const LaundryPOSScreen = LaundryScreen;
const LaundryInventoryScreen = () => <UniversalInventory category="laundry" />;


// --- 2. LOGOUT BUTTON (SECURED) ---
const LogoutButton = () => {
  const { logout, role } = useAuth();
  
  const handleLogoutPress = () => {
    if (role === 'admin') {
      logout(); // Admin can leave anytime
    } else {
      // Staff are blocked and forced to do the Z-Reading
      Alert.alert(
        "Action Blocked 🛑", 
        "You cannot bypass the End of Shift Remittance. Please go to the POS screen and tap 'END SHIFT' to complete your blind audit."
      );
    }
  };

  return (
    <TouchableOpacity onPress={handleLogoutPress} style={{ marginRight: 15 }}>
      <Ionicons name="log-out-outline" size={24} color="red" />
    </TouchableOpacity>
  );
};

// --- 3. MILKTEA TAB NAVIGATOR ---
function MilkteaTabs() {
  const { inventoryAccess } = useAuth(); // 🌟 Pull access status
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerRight: () => <LogoutButton />,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'POS')       iconName = 'cafe';
          else if (route.name === 'Inbox') iconName = 'mail-unread-outline';
          else                            iconName = 'list';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#27ae60',
      })}
    >
      <Tab.Screen name="POS" component={MilkteaPOSScreen} />
      {/* 🌟 HIDE TAB IF ACCESS IS DENIED */}
      {Number(inventoryAccess) === 1 && (
        <Tab.Screen name="Inventory" component={MilkteaInventoryScreen} />
      )}
      {/* ★ ADD: Task Inbox always visible to all staff */}
      <Tab.Screen
        name="Inbox"
        component={TaskInboxScreen}
        options={{ tabBarBadge: undefined }} // badge count can be wired later
      />
    </Tab.Navigator>
  );
}

// --- 4. LAUNDRY TAB NAVIGATOR ---
function LaundryTabs() {
  const { inventoryAccess } = useAuth(); // 🌟 Pull access status

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerRight: () => <LogoutButton />,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'POS')        iconName = 'water';
          else if (route.name === 'Inbox') iconName = 'mail-unread-outline';
          else                             iconName = 'list';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#3498db',
      })}
    >
      <Tab.Screen name="POS" component={LaundryPOSScreen} />
      {/* 🌟 HIDE TAB IF ACCESS IS DENIED */}
      {Number(inventoryAccess) === 1 && (
        <Tab.Screen name="Inventory" component={LaundryInventoryScreen} />
      )}
      {/* ★ ADD: Task Inbox always visible to all staff */}
      <Tab.Screen
        name="Inbox"
        component={TaskInboxScreen}
        options={{ tabBarBadge: undefined }}
      />
    </Tab.Navigator>
  );
}

// --- 4.5 ADMIN "GOD MODE" TAB NAVIGATOR ---
function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerRight: () => <LogoutButton />,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = route.name === 'Milktea POS' ? 'cafe' : 'water';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#8e44ad', // Purple color for Admin
      })}
    >
      <Tab.Screen name="Milktea POS" component={MilkteaPOSScreen} />
      <Tab.Screen name="Laundry POS" component={LaundryPOSScreen} />
    </Tab.Navigator>
  );
}

// --- 5. MAIN NAVIGATOR ---
export default function AppNavigator() {
  const { role, user, isInitializing } = useAuth(); // 🌟 Pull in isInitializing

  // 🌟 Show a loading spinner while checking local storage
  if (isInitializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          role === 'admin' ? (
            <Stack.Screen name="AdminHome" component={AdminTabs} />
          ) : role === 'milktea_staff' ? (
            <Stack.Screen name="MilkteaHome" component={MilkteaTabs} />
          ) : role === 'laundry_staff' ? (
            <Stack.Screen name="LaundryHome" component={LaundryTabs} />
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} /> 
          )
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}