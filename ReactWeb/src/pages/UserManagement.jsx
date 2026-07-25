import React, { useEffect, useState } from 'react';
import api from '../config/api';
import CreateAccountAdmin from './CreateAccountAdmin';
import Sidebar from '../components/Sidebar';
import ReportModal from '../components/ReportModal';

const ROWS_PER_PAGE = 10;

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const btn = (lbl, pg, disabled) => (
    <button key={lbl} onClick={() => onPageChange(pg)} disabled={disabled}
      style={{ background:disabled?'#f1f5f9':'#1e293b', color:disabled?'#94a3b8':'white', border:'none', padding:'6px 12px', borderRadius:'6px', cursor:disabled?'default':'pointer', fontWeight:'bold', fontSize:'14px' }}>
      {lbl}
    </button>
  );
  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'8px', padding:'14px' }}>
      {btn('«', 1, currentPage===1)}
      {btn('‹', currentPage-1, currentPage===1)}
      <span style={{ fontSize:'13px', color:'#64748b', fontWeight:'600', padding:'0 8px' }}>Page {currentPage} of {totalPages}</span>
      {btn('›', currentPage+1, currentPage===totalPages)}
      {btn('»', totalPages, currentPage===totalPages)}
    </div>
  );
}

// ── Three-state status resolver ───────────────────────────────────────────────
// Reads `is_verified` and `is_pending` from the patched GET /users response.
// is_verified=1                     → Active
// is_verified=0 AND is_pending=1    → Pending (Awaiting Activation)
// is_verified=0 AND is_pending=0    → Inactive (Deactivated by Admin)
const getStatus = (u) => {
  if (u.is_verified === 1)
    return { label:'Active',                       dot:'#16a34a', color:'#16a34a', bg:'#f0fdf4' };
  if (Number(u.is_pending) === 1)
    return { label:'Pending — Awaiting Activation', dot:'#f59e0b', color:'#b45309', bg:'#fffbeb' };
  return   { label:'Inactive',                     dot:'#dc2626', color:'#dc2626', bg:'#fef2f2' };
};

  function ConfirmModal({ config, onConfirm, onClose }) {
  if (!config) return null;
  return (
    <div style={modalOverlay}>
      <div style={{ background: 'white', borderRadius: '12px', width: '380px', padding: '28px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: config.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '18px' }}>{config.icon}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{config.title}</h3>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}
          dangerouslySetInnerHTML={{ __html: config.message }} />
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

export default function UserManagement() {
  const [users, setUsers]             = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [reportOpen, setReportOpen]   = useState(false);
  const [modal, setModal] = useState(null); // { config, onConfirm }

const showError = (msg = 'Action failed. Please try again.') => setModal({
  config: { icon: '⚠️', iconBg: '#fef2f2', title: 'Action failed', message: msg, confirmLabel: 'OK', confirmColor: '#0f172a' },
  onConfirm: () => setModal(null),
});

  // ── ORIGINAL fetch + action logic — PRESERVED EXACTLY ────────────────────
  const fetchUsers = () => {
    api.get('/users').then(res => setUsers(res.data)).catch(() => alert('Failed to load users'));
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => {
    const id = setInterval(fetchUsers, 30000);
    return () => clearInterval(id);
  }, []);

  const handleDeactivate = (id) => setModal({
  config: {
    icon: '🚫', iconBg: '#fef2f2', title: 'Deactivate account',
    message: 'Are you sure you want to deactivate this user? They will lose access until reactivated.',
    cancelLabel: 'Cancel', confirmLabel: 'Deactivate', confirmColor: '#dc2626',
  },
  onConfirm: async () => {
    setModal(null);
    try { await api.put(`/users/deactivate/${id}`); fetchUsers(); }
    catch { showError(); }
  },
});

const handleReactivate = (id) => setModal({
  config: {
    icon: '✅', iconBg: '#f0fdf4', title: 'Reactivate account',
    message: "Restore this user's access to the system?",
    cancelLabel: 'Cancel', confirmLabel: 'Reactivate', confirmColor: '#16a34a',
  },
  onConfirm: async () => {
    setModal(null);
    try { await api.put(`/users/reactivate/${id}`); fetchUsers(); }
    catch { showError(); }
  },
});

const handleDelete = (id) => setModal({
  config: {
    icon: '🗑️', iconBg: '#fef2f2', title: 'Delete account permanently',
    message: 'This action <strong style="color:#dc2626">cannot be undone</strong>. The user and all their data will be permanently removed.',
    cancelLabel: 'Cancel', confirmLabel: 'Delete permanently', confirmColor: '#dc2626',
  },
  onConfirm: async () => {
    setModal(null);
    try { await api.delete(`/users/delete/${id}`); fetchUsers(); }
    catch { showError(); }
  },
});

const handleToggleInventory = async (id, currentAccess) => {
  try { await api.put(`/users/toggle-inventory/${id}`, { inventory_access: !currentAccess }); fetchUsers(); }
  catch { showError('Failed to update permissions.'); }
};
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return !q || u.username?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
  });

  const totalPages     = Math.max(1, Math.ceil(filteredUsers.length / ROWS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const roleColors = {
    admin:         { bg:'#f5f3ff', color:'#6d28d9' },
    milktea_staff: { bg:'#e0f2fe', color:'#0369a1' },
    laundry_staff: { bg:'#f0fdf4', color:'#15803d' },
  };




  return (
    <div style={pageWrap}>
      <Sidebar />

      <div style={mainWrap}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
          <div>
            <h1 style={{ color:'#0f172a', margin:'0 0 5px 0', fontSize:'24px', fontWeight:'800' }}>👥 Account Management</h1>
            <p style={{ color:'#64748b', margin:0, fontSize:'14px' }}>Create staff accounts and monitor activation status.</p>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={() => setReportOpen(true)} style={reportBtn}>📊 Generate Report</button>
            <button onClick={() => setIsAddModalOpen(true)} style={addBtn}>+ Add Staff Account</button>
          </div>
        </div>

        {/* ── Legend ── */}
        <div style={{ display:'flex', gap:'20px', marginBottom:'16px', flexWrap:'wrap' }}>
          {[
            { dot:'#16a34a', label:'Active — Account is live' },
            { dot:'#f59e0b', label:'Pending — Awaiting activation email click' },
            { dot:'#dc2626', label:'Inactive — Deactivated by Admin' },
          ].map(s => (
            <span key={s.label} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'12px', color:'#64748b' }}>
              <span style={{ width:'9px', height:'9px', borderRadius:'50%', background:s.dot, display:'inline-block', flexShrink:0 }} />
              {s.label}
            </span>
          ))}
        </div>

        {/* ── Search ── */}
        <div style={{ marginBottom:'20px' }}>
          <input
            type="text"
            placeholder="Search by username or role..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width:'100%', padding:'12px 20px', border:'1px solid #cbd5e1', borderRadius:'8px', outline:'none', fontSize:'14px', background:'#fff', color:'#334155', boxSizing:'border-box' }}
          />
        </div>

        {/* ── Table ── */}
        <div style={{ background:'white', borderRadius:10, boxShadow:'0 4px 6px rgba(0,0,0,0.05)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1e293b', textAlign:'left', color:'#fff' }}>
                <th style={{ padding:14, fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' }}>ID</th>
                <th style={{ padding:14, fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' }}>Username</th>
                <th style={{ padding:14, fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' }}>Role</th>
                <th style={{ padding:14, fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' }}>Account Status</th>
                <th style={{ padding:14, fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' }}>Inventory Access</th>
                <th style={{ padding:14, fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 && (
                <tr><td colSpan="5" style={{ padding:'30px', textAlign:'center', color:'#94a3b8' }}>
                  {searchQuery ? `No users found matching "${searchQuery}"` : 'No staff accounts found.'}
                </td></tr>
              )}
              {paginatedUsers.map(u => {
                const rc = roleColors[u.role] || { bg:'#f1f5f9', color:'#475569' };
                const st = getStatus(u);
                return (
                  <tr key={u.id} style={{ borderBottom:'1px solid #f1f5f9', background: Number(u.is_pending) === 1 ? '#fffef0' : 'white' }}>
                    <td style={{ padding:14, color:'#94a3b8', fontWeight:'600' }}>#{u.id}</td>
                    <td style={{ padding:14, fontWeight:'700', color:'#0f172a' }}>{u.username}</td>
                    <td style={{ padding:14 }}>
                      <span style={{ background:rc.bg, color:rc.color, padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding:14 }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:'700', color:st.color, background:st.bg, padding:'5px 12px', borderRadius:'20px', whiteSpace:'nowrap' }}>
                        <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:st.dot, display:'inline-block', flexShrink:0 }} />
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding:14 }}>
                      {u.role === 'admin' ? (
                        <span style={{ color:'#94a3b8', fontSize:'12px', fontStyle:'italic' }}>Always ON</span>
                      ) : (
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                          <div style={{ position: 'relative' }}>
                            <input type="checkbox" className="sr-only" checked={u.inventory_access === 1} onChange={() => handleToggleInventory(u.id, u.inventory_access === 1)} style={{ opacity: 0, width: 0, height: 0 }} />
                            <div style={{ display: 'block', width: '36px', height: '20px', background: u.inventory_access === 1 ? '#3b82f6' : '#cbd5e1', borderRadius: '100px', transition: 'background 0.3s' }}></div>
                            <div style={{ position: 'absolute', left: u.inventory_access === 1 ? '18px' : '2px', top: '2px', background: 'white', width: '16px', height: '16px', borderRadius: '100px', transition: 'left 0.3s' }}></div>
                          </div>
                        </label>
                      )}
                    </td>
                    <td style={{ padding:14, display:'flex', gap:'12px', alignItems:'center' }}>
                        {u.is_verified === 1 ? (
                            <button onClick={() => handleDeactivate(u.id)} style={aLink('#ef4444')}>Deactivate</button>
                        ) : Number(u.is_pending) === 1 ? (
                            <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '700', cursor: 'not-allowed' }}>
                            Awaiting Setup
                            </span>
                        ) : (
                            <button onClick={() => handleReactivate(u.id)} style={aLink('#16a34a')}>Reactivate</button>
                        )}
                        <button onClick={() => handleDelete(u.id)} style={aLink('#64748b')}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display:'flex', flexDirection: 'column', justifyContent:'center', alignItems:'center', padding:'16px', borderTop:'1px solid #f1f5f9'}}>
            <span style={{ fontSize:'13px', color:'#94a3b8', padding:'12px 0' }}>
              Showing {paginatedUsers.length} of {filteredUsers.length} accounts
            </span>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>

        {/* ── Add Account Modal ── */}
        {isAddModalOpen && (
          <div style={modalOverlay}>
            <div style={{ width:'520px', maxWidth:'100%' }}>
              <CreateAccountAdmin
                onAccountCreated={() => { fetchUsers(); setIsAddModalOpen(false); }}
                onCancel={() => setIsAddModalOpen(false)}
              />
            </div>
          </div>
        )}
      </div>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Staff Account Directory"
        allData={filteredUsers}
        dateField={null}
        columns={['ID', 'Username', 'Role', 'Status']}
        rowMapper={u => [`#${u.id}`, u.username, u.role, getStatus(u).label]}
        filename="StaffAccounts"
      />
      <ConfirmModal
        config={modal?.config}
        onConfirm={modal?.onConfirm}
        onClose={() => setModal(null)}
      />
    </div>
  );
}

const pageWrap   = { display:'flex', minHeight:'100vh', background:'#F0F2F5'};
const mainWrap   = { flex:1, padding:'24px 32px', marginLeft:260, boxSizing:'border-box', maxWidth:'calc(100% - 260px)' };
const reportBtn  = { background:'#1e293b', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px' };
const addBtn     = { background:'#3b82f6', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px', boxShadow:'0 4px 6px rgba(59,130,246,0.3)' };
const aLink      = (color) => ({ color, background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0, fontWeight:'700', fontSize:'13px' });
const modalOverlay = { position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000, padding:'20px' };