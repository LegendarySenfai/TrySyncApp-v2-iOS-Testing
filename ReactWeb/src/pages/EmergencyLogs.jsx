import React, { useState, useEffect } from 'react';
import api from '../config/api';
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

export default function EmergencyLogs() {
  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [searchDate, setSearchDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [reportOpen, setReportOpen]   = useState(false);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [voidModal, setVoidModal] = useState({ isOpen: false, id: null });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type: 'success' }), 3000);
  };

  // ── ORIGINAL fetch logic — PRESERVED EXACTLY ────────────────────────────
  useEffect(() => {
    fetchLogs();
    const refreshInterval = setInterval(() => { fetchLogs(); }, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/admin/emergency-logs');
      setLogs(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const confirmAcknowledge = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.put(`/admin/emergency-logs/acknowledge/${voidModal.id}`);
      fetchLogs();
      setVoidModal({ isOpen: false, id: null }); // Close the modal
      showToast('Log successfully verified!', 'success'); // Show green toast
    } catch (err) { 
      showToast('Failed to update log.', 'error'); // Show red toast
    } finally {
      setIsSubmitting(false);
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => { setCurrentPage(1); }, [searchDate, searchText]);

  const filteredLogs = logs.filter(log => {
    if (searchDate) {
      const d = new Date(log.timestamp);
      const fmt = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (fmt !== searchDate) return false;
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      return log.staff_name?.toLowerCase().includes(q)
          || log.item_name?.toLowerCase().includes(q)
          || log.shop_category?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ROWS_PER_PAGE));
  const paginated  = filteredLogs.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  if (loading) return (
    <div style={pageWrap}>
      <Sidebar />
      <div style={{ flex:1, padding:'50px', marginLeft:260, textAlign:'center', color:'#64748b' }}>
        <h2>⏳ Loading Audit Logs...</h2>
      </div>
    </div>
  );

  return (
    <div style={pageWrap}>
      <Sidebar />

      <div style={mainWrap}>
        {/* ── Header ── */}
        <div style={headerRow}>
          <div>
            <h2 style={pageTitle}>🚨 Emergency Restock Audit Log</h2>
            <p style={pageSubtitle}>Monitor staff overrides. Physically verify backroom stock before clearing these alerts.</p>
          </div>
          <button onClick={() => setReportOpen(true)} style={reportBtn}>📊 Generate Report</button>
        </div>

        {/* ── Filters ── */}
        <div style={{ display:'flex', gap:'12px', marginBottom:'20px', flexWrap:'wrap' }}>
          <input
            type="text" placeholder="Search by staff, item, or category..."
            value={searchText} onChange={e => setSearchText(e.target.value)} style={searchInput}
          />
          <div style={filterBox}>
            <span style={filterLabel}>Date:</span>
            <input
              type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
              style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', outline:'none', color:'#334155', fontWeight:'600', cursor:'pointer', background:'#f8fafc' }}
            />
            {searchDate && (
              <button onClick={() => setSearchDate('')}
                style={{ background:'#ef4444', color:'white', border:'none', padding:'6px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:'bold' }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div style={tableCard}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead>
              <tr style={{ background:'#1e293b', color:'#fff', textAlign:'left' }}>
                <th style={th}>Timestamp</th>
                <th style={th}>Staff Member</th>
                <th style={th}>Category</th>
                <th style={th}>Item Restocked</th>
                <th style={th}>Amount Added</th>
                <th style={{ ...th, textAlign:'center' }}>Status / Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan="6" style={emptyCell}>
                  {searchDate ? 'No restocks found for this date.' : 'No emergency restocks logged.'}
                </td></tr>
              )}
              {paginated.map(log => (
                <tr key={log.id} style={{ borderBottom:'1px solid #f1f5f9', background: log.is_acknowledged ? '#f8fafc' : '#fff5f5' }}>
                  <td style={{ ...td, color:'#64748b' }}>{new Date(log.timestamp).toLocaleString()}</td>
                  <td style={{ ...td, fontWeight:'700', color:'#334155' }}>{log.staff_name}</td>
                  <td style={td}>
                    <span style={{ background:'#e2e8f0', padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'700', textTransform:'uppercase', color:'#475569' }}>
                      {log.shop_category}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight:'700', color:'#0f172a' }}>{log.item_name}</td>
                  <td style={{ ...td, color:'#e74c3c', fontWeight:'700', fontSize:'16px' }}>+{log.amount_added}</td>
                  <td style={{ ...td, textAlign:'center' }}>
                    {log.is_acknowledged ? (
                      <span style={{ color:'#10b981', fontWeight:'700' }}>✓ Verified</span>
                    ) : (
                      <button onClick={() => setVoidModal({ isOpen: true, id: log.id })}
                        style={{ background:'#3b82f6', color:'white', border:'none', padding:'7px 14px', borderRadius:'6px', cursor:'pointer', fontWeight:'700', fontSize:'12px' }}>
                        Mark Verified
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={footerRow}>
            <span style={countText}>Showing {paginated.length} of {filteredLogs.length} records</span>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Emergency Restock Audit Log"
        allData={filteredLogs}
        dateField="timestamp"
        columns={['Timestamp', 'Staff Member', 'Category', 'Item Restocked', 'Amount Added', 'Status']}
        rowMapper={log => [
          new Date(log.timestamp).toLocaleString(),
          log.staff_name,
          log.shop_category,
          log.item_name,
          `+${log.amount_added}`,
          log.is_acknowledged ? 'Verified' : 'Pending Verification',
        ]}
        filename="EmergencyRestockLogs"
      />

      {/* ── Custom Verification Modal ── */}
      {voidModal.isOpen && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, width: '400px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: '#fef2f2', color: '#ef4444', width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                🚨
              </div>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>Physically Verify?</h3>
            </div>

            <p style={{ color: '#475569', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px 0' }}>
              Have you physically verified this stock in the backroom? 
              <br /><br />
              This action marks the log as resolved and cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button disabled={isSubmitting} onClick={confirmAcknowledge} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', flex: 1, fontWeight: 'bold', cursor: 'pointer' }}>
                {isSubmitting ? 'Verifying...' : 'Yes, Verified'}
              </button>
              <button disabled={isSubmitting} onClick={() => setVoidModal({ isOpen: false, id: null })} style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '5px', flex: 1, fontWeight: 'bold', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Toast Notification ── */}
      {toast.visible && (
        <div style={{
          position: 'fixed', top: '40px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white', padding: '14px 24px', borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontWeight: '600', fontSize: '14px',
          zIndex: 9999, display: 'flex', alignItems: 'center'
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const pageWrap    = { display:'flex', minHeight:'100vh', background:'#F0F2F5'};
const mainWrap    = { flex:1, padding:'24px 32px', marginLeft:260, boxSizing:'border-box', maxWidth:'calc(100% - 260px)' };
const headerRow   = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' };
const pageTitle   = { color:'#0f172a', margin:'0 0 4px 0', fontSize:'22px', fontWeight:'800' };
const pageSubtitle= { color:'#64748b', margin:0, fontSize:'14px' };
const tableCard   = { background:'#fff', borderRadius:'12px', boxShadow:'0 4px 6px rgba(0,0,0,0.05)', overflow:'hidden' };
const th          = { padding:'14px 16px', fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' };
const td          = { padding:'14px 16px', verticalAlign:'middle' };
const emptyCell   = { padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'15px' };
const footerRow   = { display:'flex',flexDirection: 'column', justifyContent:'center', alignItems:'center', padding:'0 16px', borderTop:'1px solid #f1f5f9' };
const countText   = { fontSize:'13px', color:'#94a3b8', padding:'12px 0' };
const searchInput = { flex:1, minWidth:'240px', padding:'10px 16px', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'14px', color:'#334155', outline:'none', background:'white' };
const filterBox   = { display:'flex', alignItems:'center', gap:'10px', background:'white', padding:'10px 16px', borderRadius:'8px', border:'1.5px solid #e2e8f0' };
const filterLabel = { fontWeight:'700', color:'#475569', fontSize:'13px', whiteSpace:'nowrap' };
const reportBtn   = { background:'#1e293b', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px', whiteSpace:'nowrap' };
const modalOverlay = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.7)',
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  zIndex: 2000, padding: '20px'
};
const modalContent = {
  backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
  boxShadow: '0 25px 50px rgba(0,0,0,0.3)', width: '100%'
};