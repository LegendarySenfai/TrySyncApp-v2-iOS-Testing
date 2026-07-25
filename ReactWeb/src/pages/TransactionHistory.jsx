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

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [currentPage, setCurrentPage]   = useState(1);
  const [reportOpen, setReportOpen]     = useState(false);

  // Expense Modal States — ORIGINAL PRESERVED
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expense, setExpense] = useState({ amount: '', description: '', category: 'general', receipt_number: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [voidModal, setVoidModal] = useState({ isOpen: false, id: null });
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type: 'success' }), 3000);
  };

  // ── ORIGINAL fetch logic — PRESERVED EXACTLY ────────────────────────────
  useEffect(() => {
    const refreshInterval = setInterval(() => { fetchTransactions(); }, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    try {
      const res = await api.get('/admin/transactions');
      setTransactions(res.data);
    } catch (err) { console.error('Failed to fetch transactions'); }
    finally { setLoading(false); }
  };

  // 1. Opens the custom modal
  const handleVoidClick = (id) => {
    setVoidModal({ isOpen: true, id });
  };

  // 2. Executes the void when they click "Yes, Void It"
  const confirmVoid = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.put(`/admin/transactions/void/${voidModal.id}`);
      fetchTransactions();
      setVoidModal({ isOpen: false, id: null });
      showToast('Transaction successfully voided', 'delete'); // Shows the red trash-can toast
    } catch (err) { 
      showToast('Failed to void transaction.', 'error'); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    // FIX: Replaced alert with error toast
    if (parseFloat(expense.amount) <= 0) return showToast('Expense amount must be greater than zero.', 'error');
    
    setIsSubmitting(true);
    try {
      await api.post('/admin/expenses', expense);
      setIsExpenseModalOpen(false);
      setExpense({ amount: '', description: '', category: 'general', receipt_number: '' });
      showToast('Expense successfully logged!', 'success'); // FIX: Replaced alert with success toast
      fetchTransactions();
    } catch (err) { 
      showToast('Failed to log expense.', 'error'); // FIX: Replaced alert with error toast
    } finally { 
      setIsSubmitting(false); 
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  // ── ORIGINAL filter logic — PRESERVED EXACTLY ────────────────────────────
  const filteredTransactions = transactions.filter(txn => {
    const query = searchQuery.toLowerCase();
    const prefix = txn.type === 'expense' ? 'exp' : 'txn';
    const txnId  = `${prefix}-${txn.id.toString().padStart(5, '0')}`.toLowerCase();
    const dateStr = new Date(txn.timestamp).toLocaleDateString().toLowerCase();
    const itemsArray = Array.isArray(txn.details) ? txn.details : (txn.details?.items || []);
    const hasItemMatch = itemsArray.some(item => (item.item_name || `Product #${item.product_id}` || '').toLowerCase().includes(query));
    return txnId.includes(query) || dateStr.includes(query) || hasItemMatch;
  });
  // ────────────────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / ROWS_PER_PAGE));
  const paginated  = filteredTransactions.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  // ── Report row mapper ─────────────────────────────────────────────────────
  const reportRowMapper = (txn) => {
    const prefix     = txn.type === 'expense' ? '#EXP' : '#TXN';
    const txnId      = `${prefix}-${txn.id.toString().padStart(5, '0')}`;
    const itemsArray = Array.isArray(txn.details) ? txn.details : (txn.details?.items || []);
    const items      = txn.type === 'expense'
      ? `Store Expense: ${itemsArray[0]?.item_name || ''}`
      : itemsArray.map(i => `${i.qty}x ${i.item_name}`).join(', ');
    const amount = `${txn.type === 'expense' ? '-' : ''}₱${parseFloat(txn.amount).toFixed(2)}`;
    const status = txn.type === 'expense' ? 'Expense' : txn.is_voided ? 'VOIDED' : 'Valid';
    return [txnId, new Date(txn.timestamp).toLocaleDateString(), new Date(txn.timestamp).toLocaleTimeString(), items, amount, status];
  };

  if (loading) return (
    <div style={pageWrap}>
      <Sidebar />
      <div style={{ flex:1, padding:'50px', marginLeft:260, textAlign:'center', color:'#64748b' }}>
        <h2>⏳ Loading Transactions...</h2>
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
            <h2 style={pageTitle}>🧾 Sales & Petty Cash Log</h2>
            <p style={pageSubtitle}>Monitor transactions, void mistakes, and log external store expenses.</p>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={() => setReportOpen(true)} style={reportBtn}>📊 Generate Report</button>
            <button onClick={() => setIsExpenseModalOpen(true)} style={actionBtn}>+ Log Store Expense</button>
          </div>
        </div>

        {/* ── Search ── */}
        <div style={{ marginBottom:'20px' }}>
          <input
            type="text" placeholder="Search by TXN ID, date, or item name..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={searchInput}
          />
        </div>

        {/* ── Table ── */}
        <div style={tableCard}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1e293b', color:'#fff', textAlign:'left' }}>
                <th style={th}>Transaction ID</th>
                <th style={th}>Date & Time</th>
                <th style={th}>Items Sold (Receipt)</th>
                <th style={th}>Total Revenue & Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan="4" style={emptyCell}>No transactions found matching "{searchQuery}"</td></tr>
              ) : (
                paginated.map(txn => (
                  <tr key={`${txn.type}-${txn.id}`} style={{ borderBottom:'1px solid #f1f5f9', background: txn.type==='expense' ? '#fef2f2' : (txn.is_voided ? '#fff5f5' : 'white') }}>

                    <td style={td}>
                      {txn.type === 'expense'
                        ? <span style={{ color:'#ef4444', fontWeight:'bold' }}>#EXP-{txn.id.toString().padStart(5,'0')}</span>
                        : <span style={{ color:'#334155', fontWeight:'bold', textDecoration: txn.is_voided ? 'line-through' : 'none' }}>#TXN-{txn.id.toString().padStart(5,'0')}</span>
                      }
                    </td>

                    <td style={td}>
                      <div style={{ fontWeight:'bold', color:'#334155', textDecoration: txn.is_voided ? 'line-through' : 'none' }}>
                        {new Date(txn.timestamp).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize:'12px', color:'#64748b' }}>{new Date(txn.timestamp).toLocaleTimeString()}</div>
                    </td>

                    <td style={td}>
                      {txn.type === 'expense' ? (
                        <div style={{ color:'#ef4444', fontWeight:'bold', fontSize:'13px' }}>
                          💸 Store Expense: <span style={{ color:'#475569', fontWeight:'normal' }}>{txn.details[0].item_name}</span>
                          {/* 🌟 NEW: Display the OR/Receipt Number */}
                          {txn.receipt_number && (
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', textTransform: 'uppercase' }}>
                                Receipt / OR #: {txn.receipt_number}
                            </div>
                          )}
                        </div>
                      ) : (() => {
                        const itemsArray  = Array.isArray(txn.details) ? txn.details : (txn.details?.items || []);
                        const laundryData = !Array.isArray(txn.details) ? txn.details?.laundry_data : null;
                        return itemsArray.length > 0 ? (
                          <div style={{ opacity: txn.is_voided ? 0.5 : 1 }}>
                            <ul style={{ margin:0, paddingLeft:'15px', fontSize:'13px', color:'#475569' }}>
                              {itemsArray.map((item, idx) => (
                                <li key={idx} style={{ marginBottom:'4px' }}>
                                  <b>{item.qty}x</b> {item.item_name || `Product #${item.product_id}`}
                                  {item.modifiers && item.modifiers.length > 0 && (
                                    <div style={{ fontSize:'11px', color:'#8b5cf6', marginLeft:'10px' }}>
                                      {item.modifiers.map(mod => `+ ${mod.modifier_name}`).join(', ')}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                            {laundryData && (
                              <div style={{ marginTop:'8px', padding:'8px', background:'#f8fafc', borderRadius:'6px', border:'1px dashed #cbd5e1', fontSize:'12px', color:'#475569' }}>
                                <div style={{ fontWeight:'bold', color:'#3b82f6', marginBottom:'4px' }}>🎟️ Ticket: {laundryData.claim_ticket}</div>
                                <div><b>Weight:</b> {laundryData.weight_kg} kg</div>
                                <div><b>Pickup:</b> {laundryData.pickup_date}</div>
                                {laundryData.customer_phone && <div><b>Phone:</b> {laundryData.customer_phone}</div>}
                              </div>
                            )}
                          </div>
                        ) : <span style={{ color:'#94a3b8', fontStyle:'italic' }}>No itemized details</span>;
                      })()}
                    </td>

                    <td style={td}>
                      {txn.type === 'expense' ? (
                        <div style={{ fontWeight:'bold', color:'#ef4444', fontSize:'16px' }}>- ₱ {parseFloat(txn.amount).toFixed(2)}</div>
                      ) : txn.is_voided ? (
                        <div style={{ color:'#ef4444', fontWeight:'bold', fontSize:'14px', padding:'5px 10px', background:'#fee2e2', display:'inline-block', borderRadius:'5px' }}>
                          🚫 VOIDED
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight:'bold', color:'#27ae60', fontSize:'16px' }}>₱ {parseFloat(txn.amount).toFixed(2)}</div>
                          <button onClick={() => handleVoidClick(txn.id)}
                            style={{ marginTop:'8px', background:'#ef4444', color:'white', border:'none', padding:'5px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }}>
                            Void Sale
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div style={footerRow}>
            <span style={countText}>Showing {paginated.length} of {filteredTransactions.length} records</span>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>

        {/* ── Add Expense Modal — ORIGINAL PRESERVED ── */}
        {isExpenseModalOpen && (
          <div style={modalOverlay}>
            <form onSubmit={handleAddExpense} style={modalContent}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h3 style={{ color:'#0f172a', margin:'0 0 6px 0', fontWeight:'800', fontSize: '20px' }}>Log Petty Cash / Expense</h3>
                <p style={{ color:'#64748b', fontSize:'12px', margin: 0 }}>Record money taken from the drawer to buy supplies.</p>
              </div>

              <label style={lbl}>Shop Category</label>
              <select value={expense.category} onChange={e => setExpense({...expense, category:e.target.value})} style={inp} required>
                <option value="general">General / Shared</option>
                <option value="milktea">Milktea</option>
                <option value="laundry">Laundry</option>
              </select>

              <label style={lbl}>Amount Taken</label>
              <div style={inputWrapper}>
                <div style={prefixStyle}>₱</div>
                <input type="number" step="0.01" min="0" placeholder="150" 
                  value={expense.amount} 
                  onChange={e => setExpense({...expense, amount:e.target.value})} 
                  style={rawInputStyle} required />
              </div>

              {/* 🌟 NEW: Receipt Number Input */}
              <label style={lbl}>Official Receipt / Ref # (Optional)</label>
              <input type="text" inputMode="numeric" placeholder="e.g. OR-123456" 
                value={expense.receipt_number} 
                onChange={e => setExpense({...expense, receipt_number:e.target.value.replace(/\D/g, '')})} 
                style={inp} />

              <label style={lbl}>Reason / Description</label>
              <input type="text" placeholder="e.g. Bought 3 bags of tube ice" value={expense.description} onChange={e => setExpense({...expense, description:e.target.value})} style={inp} required />
              
              <div style={{ display:'flex', gap:'10px', marginTop:'15px' }}>
                <button type="submit" disabled={isSubmitting} style={{ opacity:isSubmitting?0.7:1, color:'#fff', border:'none', padding:'10px 15px', borderRadius:'5px', cursor:'pointer', fontWeight:'bold', background:'#3b82f6', flex:1 }}>
                  {isSubmitting ? 'Logging...' : 'Log Expense'}
                </button>
                <button type="button" onClick={() => setIsExpenseModalOpen(false)} style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Sales & Petty Cash Log"
        allData={filteredTransactions}
        dateField="timestamp"
        columns={['Transaction ID', 'Date', 'Time', 'Items / Description', 'Amount', 'Status']}
        rowMapper={reportRowMapper}
        filename="TransactionHistory"
      />

      {/* ── Custom Void Modal ── */}
        {voidModal.isOpen && (
          <div style={modalOverlay}>
            <div style={{ ...modalContent, width: '400px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#fef2f2', color: '#ef4444', width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                  🚨
                </div>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>Void Transaction?</h3>
              </div>

              <p style={{ color: '#475569', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px 0' }}>
                Are you sure you want to void this transaction?
                <br /><br />
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Warning:</span> This will reverse the revenue calculations for this sale and mark it as invalid in your ledger.
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button disabled={isSubmitting} onClick={confirmVoid} style={{ background: isSubmitting ? '#fca5a5' : '#ef4444', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}>
                  {isSubmitting ? 'Voiding...' : 'Yes, Void It'}
                </button>
                <button disabled={isSubmitting} onClick={() => setVoidModal({ isOpen: false, id: null })} style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', flex: 1 }}>
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
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontWeight: 'bold', fontSize: '14px',
            zIndex: 9999, display: 'flex', alignItems: 'center', gap: '10px',
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
const th          = { padding:'15px', fontSize:'14px', fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.5px' };
const td          = { padding:'15px', verticalAlign:'top' };
const emptyCell   = { padding:'30px', textAlign:'center', color:'#94a3b8' };
const footerRow   = { display:'flex',flexDirection: 'column', justifyContent:'center', alignItems:'center', padding:'0 16px', borderTop:'1px solid #f1f5f9' };
const countText   = { fontSize:'13px', color:'#94a3b8', padding:'12px 0' };
const searchInput = { width:'100%', padding:'12px 20px', border:'1px solid #cbd5e1', borderRadius:'8px', boxSizing:'border-box', fontSize:'14px', background:'#fff', color:'#334155', outline:'none' };
const reportBtn   = { background:'#1e293b', color:'#fff', border:'none', padding:'10px 18px', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px' };
const actionBtn   = { background:'#3b82f6', color:'#fff', border:'none', padding:'10px 15px', borderRadius:'5px', cursor:'pointer', fontWeight:'700' };
const modalOverlay = { position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000 };
const modalContent = { backgroundColor:'#fff', padding:'25px', borderRadius:'10px', width:'400px', boxShadow:'0 10px 25px rgba(0,0,0,0.2)' };
const lbl = { display:'block', fontSize:'12px', color:'#64748b', marginBottom:'4px', fontWeight:'bold' };
const inp = { width:'100%', padding:'12px 20px', marginBottom:'10px', border:'1px solid #cbd5e1', borderRadius:'8px', boxSizing:'border-box', fontSize:'14px', background:'#fff', color:'#334155', outline:'none' };
const inputWrapper = { 
  display: 'flex', 
  alignItems: 'stretch', 
  border: '1px solid #cbd5e1', 
  borderRadius: '8px', 
  marginBottom: '10px',
  overflow: 'hidden',
  background: '#fff'
};

const rawInputStyle = { 
  flex: 1, 
  padding: '12px 20px', 
  border: 'none', 
  outline: 'none', 
  color: '#334155',
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '14px'
};

const prefixStyle = {
  padding: '0 16px', 
  color: '#475569', 
  fontWeight: 'bold',
  fontSize: '15px',
  background: '#f8fafc',
  borderRight: '1px solid #cbd5e1', 
  display: 'flex',
  alignItems: 'center', 
  justifyContent: 'center'
};