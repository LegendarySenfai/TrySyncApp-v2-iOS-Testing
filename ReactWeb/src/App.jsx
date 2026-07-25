import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import ActivateAccount from './pages/ActivateAccount'; // 🚀 IMPORTED NEW PAGE
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import PrivateRoute from './components/PrivateRoute'; 
import TransactionHistory from './pages/TransactionHistory';
import InventoryControl from './pages/InventoryControl'; 
import MenuManager from './pages/MenuManager';
import YieldVariance from './pages/YieldVariance';
import EmergencyLogs from './pages/EmergencyLogs';
import ActivityLogs from './pages/ActivityLogs';
import ChangePassword from './pages/ChangePassword';
import FinancialBreakdown from './pages/FinancialBreakdown';
import AiControlCenter from './pages/AiControlCenter';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* 🚀 NEW DYNAMIC ROUTE FOR EMAIL ACTIVATION */}
        <Route path="/activate/:token" element={<ActivateAccount />} />

        {/* PROTECTED ROUTES */}
        <Route path="/dashboard" element={
          <PrivateRoute><Dashboard /></PrivateRoute>
        } />
        <Route path="/ledger" element={
          <PrivateRoute><FinancialBreakdown /></PrivateRoute>
        } />
        <Route path="/users" element={
          <PrivateRoute><UserManagement /></PrivateRoute>
        } />
        <Route path="/transactions" element={
          <PrivateRoute><TransactionHistory /></PrivateRoute>
        } />
        <Route path="/inventory" element={
          <PrivateRoute><InventoryControl /></PrivateRoute>
        } />
        <Route path="/menu-manager" element={
          <PrivateRoute><MenuManager /></PrivateRoute>
        } />
        <Route path="/variance" element={
          <PrivateRoute><YieldVariance /></PrivateRoute>
        } />
        <Route path="/emergency-logs" element={
          <PrivateRoute><EmergencyLogs /></PrivateRoute>
        } />
        <Route path="/activity-logs" element={
          <PrivateRoute><ActivityLogs /></PrivateRoute>
        } />
        <Route path="/change-password" element={
          <PrivateRoute><ChangePassword /></PrivateRoute>
        } />
        <Route path="/ai-control" element={
          <PrivateRoute><AiControlCenter /></PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;