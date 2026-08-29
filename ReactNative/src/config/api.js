import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 📱 DYNAMIC URL SWITCHER FOR MOBILE
// __DEV__ is true when running via Expo on your computer, false in production
export const BASE_URL = __DEV__ 
  ? "http://192.168.86.2:5000"                   // <-- Your Local Laptop IP
  : "https://trysyncapp-v2.onrender.com"; // <-- Your Live Server

const api = axios.create({
  baseURL: BASE_URL, 
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('jwtToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (error) {
    console.error("Error fetching token", error);
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;




//if mag error, ito ang original code 
//import axios from 'axios';
// import AsyncStorage from '@react-native-async-storage/async-storage';

// // 🛠️ DYNAMIC URL SWITCHER FOR MOBILE
// // Change 192.168.x.x to your laptop's IPv4 address (Find via 'ipconfig' on Windows or 'ifconfig' on Mac)
// export const BASE_URL = "https://trisync-backend-q965.onrender.com";

// const api = axios.create({
//   baseURL: BASE_URL,
//   headers: {
//     'Content-Type': 'application/json',
//   },
// });

// api.interceptors.request.use(async (config) => {
//   try {
//     const token = await AsyncStorage.getItem('jwtToken'); 
//     if (token) {
//       config.headers['Authorization'] = `Bearer ${token}`;
//     }
//   } catch (error) {}
//   return config;
// }, (error) => {
//   return Promise.reject(error);
// });

// export default api;
