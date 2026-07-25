import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); 
  const [inventoryAccess, setInventoryAccess] = useState(null); // 🌟 NEW STATE
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const token = await AsyncStorage.getItem('jwtToken');
        const savedUser = await AsyncStorage.getItem('username');
        const savedRole = await AsyncStorage.getItem('userRole');
        const savedInvAccess = await AsyncStorage.getItem('inventoryAccess'); // 🌟 NEW

        if (token && savedUser && savedRole) {
          setUser({ username: savedUser });
          setRole(savedRole);
          setInventoryAccess(savedInvAccess); // 🌟 NEW
        }
      } catch (e) {
        console.error("Failed to load session", e);
      } finally {
        setIsInitializing(false);
      }
    };
    loadSession();
  }, []);

  const login = async (username, password) => {
    try {
      const response = await api.post('/login', { username, password, source: 'mobile' });
      if (response.data.step === 'otp_verification') {
        return { status: 'OTP_REQUIRED', username: response.data.username };
      }
    } catch (error) {
      alert('Login Error: ' + (error.response?.data?.message || "Check Server Connection"));
      return { status: 'ERROR' };
    }
  };

  // 🌟 UPDATED: Now accepts invAccess
  const finalizeLogin = async (username, userRole, token, invAccess) => {
    try {
      await AsyncStorage.setItem('jwtToken', token); 
      await AsyncStorage.setItem('username', username);
      await AsyncStorage.setItem('userRole', userRole);
      await AsyncStorage.setItem('inventoryAccess', String(invAccess)); // 🌟 NEW
      
      setUser({ username });
      setRole(userRole);
      setInventoryAccess(String(invAccess)); // 🌟 NEW
    } catch (e) {
      console.error("Storage error:", e);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('jwtToken'); 
      await AsyncStorage.removeItem('username');
      await AsyncStorage.removeItem('userRole');
      await AsyncStorage.removeItem('inventoryAccess'); // 🌟 NEW
      
      setUser(null);
      setRole(null);
      setInventoryAccess(null); // 🌟 NEW
    } catch (e) {
      console.error("Storage error:", e);
    }
  };

  // 🌟 EXPORT inventoryAccess
  return (
    <AuthContext.Provider value={{ user, role, inventoryAccess, isInitializing, login, finalizeLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);