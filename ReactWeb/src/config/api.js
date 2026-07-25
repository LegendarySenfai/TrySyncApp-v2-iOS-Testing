import axios from 'axios';

// 🛠️ DYNAMIC URL SWITCHER FOR WEB
// Set VITE_API_URL in Vercel's project env vars (or a local .env for ReactWeb)
// to point at whichever Render backend is currently live — no code edit needed
// next time you redeploy to a new Render service.
export const BASE_URL = window.location.hostname === "localhost" 
  ? "http://localhost:5000" 
  : (import.meta.env.VITE_API_URL || "https://trysyncapp-v2.onrender.com");

const api = axios.create({
  baseURL: BASE_URL, 
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwtToken');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
