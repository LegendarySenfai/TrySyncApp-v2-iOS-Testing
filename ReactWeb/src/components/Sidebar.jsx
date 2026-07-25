import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function ConfirmModal({ config, onConfirm, onClose }) {
  if (!config) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '12px', width: '380px', padding: '28px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: config.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '18px' }}>{config.icon}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{config.title}</h3>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>{config.message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          {config.cancelLabel && (
            <button onClick={onClose}
              style={{ padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              {config.cancelLabel}
            </button>
          )}
          <button onClick={onConfirm}
            style={{ padding: '8px 18px', background: config.confirmColor, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ shopFilter, setShopFilter }) {
    const navigate = useNavigate();
    const location = useLocation();
    const path = location.pathname;
    const [modal, setModal] = useState(null);

    const handleLogout = () => setModal({
        config: {
            icon: '🚪', iconBg: '#fef2f2', title: 'Confirm logout',
            message: 'Are you sure you want to log out of DuoSync Admin?',
            cancelLabel: 'Stay', confirmLabel: 'Log out', confirmColor: '#ef4444',
        },
        onConfirm: () => {
            setModal(null);
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('role');
            localStorage.removeItem('username');
            localStorage.removeItem('adminAuth');
            navigate('/', { replace: true });
        },
    });

    // 🛠️ APPLIED FIX: Explicitly set to 14px, tighter padding, and flex alignment for icons
    const navStyle = (isActive) => ({
        fontSize: '14px',
        padding: '10px 20px', 
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer', 
        background: isActive ? '#334155' : 'transparent', 
        color: isActive ? 'white' : '#cbd5e1', 
        transition: '0.2s', 
        fontWeight: isActive ? '600' : '500', 
        borderLeft: isActive ? '4px solid #3b82f6' : '4px solid transparent',
        textDecoration: 'none'
    });

    // Helper function: If they click a filter from another page, take them to the dashboard first!
    const handleFilterClick = (filterName) => {
        if (setShopFilter) {
            setShopFilter(filterName);
        } else {
            navigate('/dashboard'); 
        }
    };

    return (
        <div style={{ width: 260, background: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh', top: 0, left: 0, zIndex: 1000 }}>
            
            {/* 🛠️ APPLIED FIX: De-zoomed the main header title */}
            <div style={{ padding: '24px 20px', fontSize: '20px', fontWeight: '800', borderBottom: '1px solid #334155', letterSpacing: '0.5px', margin: 0 }}>
                DuoSync Admin
            </div>

            {/* 🛠️ APPLIED FIX: Sleek, spaced out section headers (11px) */}
            <div style={{ padding: '20px 20px 10px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 'bold' }}>
                Dashboard Filters
            </div>
            
            <div onClick={() => handleFilterClick('all')} style={navStyle(path === '/dashboard' && (shopFilter === 'all' || !shopFilter))}>📊 Executive View</div>
            <div onClick={() => handleFilterClick('milktea')} style={navStyle(path === '/dashboard' && shopFilter === 'milktea')}>🧋 Milktea View</div>
            <div onClick={() => handleFilterClick('laundry')} style={navStyle(path === '/dashboard' && shopFilter === 'laundry')}>🧺 Laundry View</div>

            {/* 🛠️ APPLIED FIX: Sleek, spaced out section headers (11px) */}
            <div style={{ padding: '20px 20px 10px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 'bold' }}>
                System Modules
            </div>
            
            <div onClick={() => navigate('/inventory')} style={navStyle(path === '/inventory')}>📦 Inventory Control</div>
            <div onClick={() => navigate('/menu-manager')} style={navStyle(path === '/menu-manager')}>📋 Menu Manager</div>
            <div onClick={() => navigate('/transactions')} style={navStyle(path === '/transactions')}>🧾 Sales & Deductions</div>
            <div onClick={() => navigate('/ledger')} style={navStyle(path === '/ledger')}>💳 Financial Ledger</div>
            <div onClick={() => navigate('/variance')} style={navStyle(path === '/variance')}>⚖️ Yield Variance</div>
            <div onClick={() => navigate('/emergency-logs')} style={navStyle(path === '/emergency-logs')}>🚨 Restock Logs</div>
            <div onClick={() => navigate('/activity-logs')} style={navStyle(path === '/activity-logs')}>🕵️ System Logs</div>
            <div onClick={() => navigate('/ai-control')} style={navStyle(path === '/ai-control')}>🤖 AI Control Center</div>
            <div onClick={() => navigate('/users')} style={navStyle(path === '/users')}>👥 Staff Accounts</div>

            <div style={{ marginTop: 'auto', borderTop: '1px solid #334155' }}>
                <div onClick={handleLogout} style={{...navStyle(false), color: '#ef4444', fontWeight: 'bold'}}>🚪 Logout</div>
            </div>

            <ConfirmModal
                config={modal?.config}
                onConfirm={modal?.onConfirm}
                onClose={() => setModal(null)}
            />
        </div>
    );
}