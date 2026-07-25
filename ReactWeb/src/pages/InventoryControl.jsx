import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function InventoryControl() {
  const navigate = useNavigate();
  const [inventory, setInventory]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [reportOpen, setReportOpen]   = useState(false);

  const unitMap = { g: 'grams', ml: 'milliliters', pcs: 'pieces' };
  
  // Modal States — ORIGINAL PRESERVED
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState({ id:'', stock_quantity:'', total_cost:'', cost_per_unit:'' });
  const [isAddModalOpen, setIsAddModalOpen]   = useState(false);
  const [newItem, setNewItem] = useState({ item_name:'', category:'milktea', unit:'g', total_quantity:'', total_cost:'' });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, name: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type: 'success' }), 3000);
  };

  // ── ORIGINAL fetch logic — PRESERVED EXACTLY ────────────────────────────
  useEffect(() => {
    const refreshInterval = setInterval(() => { fetchInventory(); }, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => { fetchInventory(); }, []);

  const fetchInventory = async () => {
    try {
      const res = await api.get('/admin/raw_inventory');
      setInventory(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // 1. Opens the custom modal and remembers which item we clicked
  const handleDeleteClick = (id, name) => {
    setDeleteModal({ isOpen: true, id, name });
  };

  // 2. Actually does the deleting when they click "Yes, Delete" inside the modal
  const confirmDelete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try { 
      await api.delete(`/admin/raw_inventory/${deleteModal.id}`); 
      setDeleteModal({ isOpen: false, id: null, name: '' });
      fetchInventory(); 
      showToast('Ingredient deleted successfully', 'delete');
    }
    catch (err) { showToast('Delete failed. Please try again.', 'error'); } // <-- REPLACED ALERT
    finally { setIsSubmitting(false); }
  };
  
  const handleEditSave = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const calculatedCostPerUnit = parseFloat(editingItem.total_cost) / parseFloat(editingItem.stock_quantity);
    try {
      await api.put(`/admin/raw_inventory/${editingItem.id}`, {
        stock_quantity: parseFloat(editingItem.stock_quantity),
        cost_per_unit: calculatedCostPerUnit
      });
      setIsEditModalOpen(false);
      showToast('System Overridden: Stock and Cost corrected.', 'success'); // <-- REPLACED ALERT
      fetchInventory();
    } catch (err) { showToast('Update failed. Please check your connection.', 'error'); } // <-- REPLACED ALERT
    finally { setIsSubmitting(false); }
  };

  const handleAddSave = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post('/admin/raw_inventory/add', newItem);
      setIsAddModalOpen(false);
      showToast('Ingredient successfully added!', 'success'); // <-- REPLACED ALERT
      setNewItem({ item_name:'', category:'milktea', unit:'g', total_quantity:'', total_cost:'' });
      fetchInventory();
    } catch (err) { 
      showToast('Failed to add ingredient.', 'error'); // <-- REPLACED ALERT
      console.error(err); 
    }
    finally { setIsSubmitting(false); }
  };
  // ── ORIGINAL renderMetrics logic — PRESERVED EXACTLY ────────────────────
  const renderMetrics = (item) => {
    const stock = parseFloat(item.stock_quantity);
    const cost  = parseFloat(item.cost_per_unit);
    if (item.unit === 'g')
      return { stockStr:`${stock.toFixed(0)}g`, costStr:`₱${(cost*15).toFixed(2)} / scoop`, servingStr:`${(stock/15).toFixed(1)} Scoops left` };
    if (item.unit === 'ml')
      return { stockStr:`${stock.toFixed(0)}ml`, costStr:`₱${(cost*10).toFixed(2)} / pump`, servingStr:`${(stock/10).toFixed(1)} Pumps left` };
    return { stockStr:`${stock.toFixed(0)} ${item.unit}`, costStr:`₱${cost.toFixed(2)} / each`, servingStr:`${stock.toFixed(0)} left` };
  };
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const filteredInventory = inventory.filter(item =>
    item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / ROWS_PER_PAGE));
  const paginated  = filteredInventory.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  if (loading) return (
    <div style={pageWrap}>
      <Sidebar />
      <div style={{ flex:1, padding:'50px', marginLeft:260, textAlign:'center', color:'#64748b' }}>
        <h2>⏳ Loading Inventory...</h2>
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
            <h2 style={pageTitle}>📦 Inventory Control</h2>
            <p style={pageSubtitle}>Manage raw ingredients, stock levels, and cost per serving.</p>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={() => setReportOpen(true)} style={reportBtn}>📊 Generate Report</button>
            <button onClick={() => setIsAddModalOpen(true)} style={{...actionBtn, background:'#3b82f6'}}>+ Add Raw Ingredient</button>
            <button onClick={() => navigate('/menu-manager')} style={{...actionBtn, background:'#10b981'}}>Menu & Recipe Manager</button>
          </div>
        </div>

        {/* ── Search ── */}
        <div style={{ marginBottom:'20px' }}>
          <input
            type="text" placeholder="Search ingredients by name or shop..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width:'100%', padding:'12px 20px', border:'1px solid #cbd5e1', borderRadius:'8px', outline:'none', fontSize:'14px', background:'#fff', color:'#334155', boxShadow:'0 2px 4px rgba(0,0,0,0.02)', boxSizing:'border-box' }}
          />
        </div>

        {/* ── Table ── */}
        <div style={tableCard}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1e293b', color:'#fff', textAlign:'left' }}>
                <th style={th}>Shop</th>
                <th style={th}>Ingredient Name</th>
                <th style={th}>Total Stock</th>
                <th style={th}>Cost Per Serving</th>
                <th style={th}>Servings Left</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan="6" style={{ padding:'20px', textAlign:'center', color:'#94a3b8' }}>No ingredients found matching "{searchQuery}"</td></tr>
              )}
              {paginated.map(item => {
                const m = renderMetrics(item);
                return (
                  <tr key={item.id} style={{ borderBottom:'1px solid #eee' }}>
                    <td style={td}>
                      <span style={{ background: item.category==='milktea' ? '#e0f2fe' : '#f3e8ff', color: item.category==='milktea' ? '#0284c7' : '#7e22ce', padding:'5px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:'bold', textTransform:'uppercase' }}>
                        {item.category}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight:'bold', color:'#334155' }}>{item.item_name}</td>
                    <td style={{ ...td, color:'#334155', fontWeight:'bold' }}>{m.stockStr}</td>
                    <td style={{ ...td, color:'#334155' }}>{m.costStr}</td>
                    <td style={td}><span style={{ fontWeight:'bold', color:'#27ae60', fontSize:'15px' }}>{m.servingStr}</span></td>
                    <td style={td}>
                      <button onClick={() => {
                        setEditingItem({ 
                          id: item.id, 
                          stock_quantity: Math.round(item.stock_quantity), 
                          total_cost: Math.round(item.stock_quantity * item.cost_per_unit), 
                          cost_per_unit: item.cost_per_unit 
                        });
                        setIsEditModalOpen(true);
                      }} style={editBtn}>Edit</button>
                      <button onClick={() => handleDeleteClick(item.id, item.item_name)} style={deleteBtn}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={footerRow}>
            <span style={countText}>Showing {paginated.length} of {filteredInventory.length} ingredients</span>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>

        {/* ── Edit Modal — ORIGINAL PRESERVED ── */}
        {isEditModalOpen && (
          <div style={modalOverlay}>
            <form onSubmit={handleEditSave} style={modalContent}>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <h3 style={{ color: '#b45309', margin: 0, fontSize: '15px' }}>⚠️ Admin Override</h3>
                <p style={{ fontSize: '12px', color: '#92400e', margin: '4px 0 0 0' }}>
                  Use this to correct typos made by staff during restocking, or to manually adjust the Moving Average Cost (MAC).
                </p>
              </div>
              
              <label style={labelStyle}>Corrected Total Raw Stock</label>
              <div style={inputWrapper}>
                <input type="number" step="1" min="0" value={editingItem.stock_quantity}
                  onChange={e => {
                    const v = e.target.value;
                    setEditingItem({ ...editingItem, stock_quantity:v, total_cost: v==='' ? '' : Math.round(parseFloat(v)*editingItem.cost_per_unit) });
                  }} style={rawInputStyle} required />
                
                <div style={adornmentStyle}>
                  {unitMap[inventory.find(i => i.id === editingItem.id)?.unit] || 'units'}
                </div>
              </div>
                
                <label style={labelStyle}>Total Value of this Stock</label>
                <div style={inputWrapper}>
                  <div style={prefixStyle}>₱</div>
                  <input type="number" step="1" min="0" value={editingItem.total_cost} 
                    onChange={e => setEditingItem({...editingItem, total_cost:e.target.value})} 
                    style={rawInputStyle} required />
                </div>

              <div style={{ display:'flex', gap:'10px', marginTop:'20px' }}>
                <button type="submit" disabled={isSubmitting} style={{...actionBtn, background:isSubmitting?'#fcd34d':'#f59e0b', flex:1, color:'#fff'}}>
                  {isSubmitting ? 'Updating...' : 'Force Update'}
                </button>
                {/* FIX: Changed Cancel to a "Subtle Button" (light background, dark text, subtle border) */}
                <button type="button" disabled={isSubmitting} onClick={() => setIsEditModalOpen(false)} 
                  style={{...actionBtn, background:'#f8fafc', color:'#475569', border:'1px solid #cbd5e1', flex:1}}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Add Modal — ORIGINAL PRESERVED ── */}
        {isAddModalOpen && (
          <div style={modalOverlay}>
            <form onSubmit={handleAddSave} style={modalContent}>
              <h3 style={{ color: '#0f172a', marginTop: 0, marginBottom: '20px', fontSize: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                Register New Ingredient
              </h3>

              <label style={labelStyle}>Ingredient Name</label>
              <input type="text" placeholder="e.g. Cocoa Powder" value={newItem.item_name} onChange={e => setNewItem({...newItem, item_name:e.target.value})} style={inputStyle} required />
              <label style={labelStyle}>Shop Category</label>
              <select value={newItem.category} onChange={e => setNewItem({...newItem, category:e.target.value})} style={inputStyle}>
                <option value="milktea">Milk Tea</option>
                <option value="laundry">Laundry</option>
              </select>

              <label style={labelStyle}>Measurement Unit</label>
              <select value={newItem.unit} onChange={e => setNewItem({...newItem, unit:e.target.value})} style={inputStyle}>
                <option value="g">Grams (Powders/Sinkers)</option>
                <option value="ml">Milliliters (Syrups/Liquids)</option>
                <option value="pcs">Pieces (Sachets/Cups)</option>
              </select>

              <div style={{ display:'flex', gap:'15px', marginTop: '5px' }}>
              <div style={{ flex:1 }}>
                {/* UI CHANGE: Removed unit from label */}
                <label style={labelStyle}>Total Package Size</label>
                <div style={inputWrapper}>
                  <input type="number" step="0.01" min="0" placeholder="e.g. 1000" 
                    value={newItem.total_quantity} onChange={e => setNewItem({...newItem, total_quantity:e.target.value})} 
                    style={rawInputStyle} required />
                  <div style={adornmentStyle}>
                    {newItem.unit}
                  </div>
                </div>
              </div>

                <div style={{ flex:1 }}>
                    <label style={labelStyle}>Total Cost</label>
                    <div style={inputWrapper}>
                      <div style={prefixStyle}>₱</div>
                      <input type="number" step="0.01" min="0" placeholder="e.g. 500" 
                        value={newItem.total_cost} onChange={e => setNewItem({...newItem, total_cost:e.target.value})} 
                        style={rawInputStyle} required />
                    </div>
                  </div>
                </div>
                
              <div style={{ display:'flex', gap:'10px', marginTop:'15px' }}>
                <button type="submit" disabled={isSubmitting} style={{...actionBtn, background:isSubmitting?'#93c5fd':'#3b82f6', flex:1}}>
                  {isSubmitting ? 'Adding...' : 'Add Ingredient'}
                </button>
                <button type="button" disabled={isSubmitting} onClick={() => setIsAddModalOpen(false)} style={{...actionBtn, background:'#94a3b8', flex:1}}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Custom Delete Modal ── */}
        {deleteModal.isOpen && (
          <div style={modalOverlay}>
            <div style={{ ...modalContent, width: '400px' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#fef2f2', color: '#ef4444', width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                  🗑️
                </div>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>Delete Ingredient?</h3>
              </div>

              <p style={{ color: '#475569', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px 0' }}>
                Are you sure you want to delete <strong>{deleteModal.name}</strong>?
                <br /><br />
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Warning:</span> This action cannot be undone and will permanently break any menu recipes currently using this item.
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button disabled={isSubmitting} onClick={confirmDelete} style={{ ...actionBtn, background: isSubmitting ? '#fca5a5' : '#ef4444', flex: 1, color: '#fff' }}>
                  {isSubmitting ? 'Deleting...' : 'Yes, Delete It'}
                </button>
                <button disabled={isSubmitting} onClick={() => setDeleteModal({ isOpen: false, id: null, name: '' })} style={{ ...actionBtn, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', flex: 1 }}>
                  Cancel
                </button>
              </div>
              
            </div>
          </div>
        )}

      {/* ── Custom Toast Notification ── */}
      {toast.visible && (
        <div style={{
          position: 'fixed',
          top: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '14px 24px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          fontWeight: 'bold',
          fontSize: '14px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeInDown 0.3s ease-out' // Optional: if you have CSS animations setup
        }}>
          <span>{toast.type === 'success'}</span>
          {toast.message}
        </div>
      )}

      {/* dateField=null → snapshot report, no date filtering */}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Raw Inventory Control — Current Snapshot"
        allData={filteredInventory}
        dateField={null}
        columns={['Shop', 'Ingredient Name', 'Total Stock', 'Cost Per Serving', 'Servings Left']}
        rowMapper={item => {
          const m = renderMetrics(item);
          return [item.category.toUpperCase(), item.item_name, m.stockStr, m.costStr, m.servingStr];
        }}
        filename="InventoryControl"
      />
    </div>
  );
}

const pageWrap    = { display:'flex', minHeight:'100vh', background:'#F0F2F5'};
const mainWrap    = { flex:1, padding:'24px 32px', marginLeft:260, boxSizing:'border-box', maxWidth:'calc(100% - 260px)' };
const headerRow   = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' };
const pageTitle   = { color:'#0f172a', margin:'0 0 4px 0', fontSize:'22px', fontWeight:'800' };
const pageSubtitle= { color:'#64748b', margin:0, fontSize:'14px' };
const tableCard   = { background:'#fff', borderRadius:'10px', boxShadow:'0 4px 6px rgba(0,0,0,0.05)', overflow:'hidden' };
const th          = { padding:'15px', fontSize:'14px', textTransform:'uppercase', fontWeight:'bold' };
const td          = { padding:'15px', verticalAlign:'middle' };
const footerRow   = { display:'flex', flexDirection: 'column', justifyContent:'center', alignItems:'center', padding:'0 16px', borderTop:'1px solid #f1f5f9' };
const countText   = { fontSize:'13px', color:'#94a3b8', padding:'12px 0' };
const reportBtn   = { background:'#1e293b', color:'#fff', border:'none', padding:'10px 18px', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px' };
const actionBtn   = { color:'#fff', border:'none', padding:'10px 15px', borderRadius:'5px', cursor:'pointer', fontWeight:'bold' };
const editBtn     = { background:'#4779c8', color:'#fff', border:'none', padding:'8px 12px', borderRadius:'5px', marginRight:'5px', cursor:'pointer' };
const deleteBtn   = { background:'#ef4444', color:'#fff', border:'none', padding:'8px 12px', borderRadius:'5px', cursor:'pointer' };
const inputStyle  = { width:'100%', padding:'10px', marginBottom:'10px', border:'1px solid #cbd5e1', borderRadius:'5px', boxSizing:'border-box', color:'#334155' };
const labelStyle  = { display:'block', fontSize:'12px', color:'#64748b', marginBottom:'4px', fontWeight:'bold' };
const modalOverlay = { position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000 };
const modalContent = { backgroundColor:'#fff', padding:'25px', borderRadius:'10px', width:'400px', boxShadow:'0 10px 25px rgba(0,0,0,0.2)' };
const inputWrapper = { 
  display: 'flex', 
  alignItems: 'center', 
  border: '1px solid #cbd5e1', 
  borderRadius: '5px', 
  marginBottom: '10px',
  overflow: 'hidden',
  background: '#fff'
};
const rawInputStyle = { 
  flex: 1, 
  padding: '10px', 
  border: 'none', 
  outline: 'none', 
  color: '#334155',
  width: '100%',
  boxSizing: 'border-box'
};
const adornmentStyle = { 
  padding: '0 12px', 
  color: '#282525', 
  fontWeight: 'bold',
  fontSize: '13px',
  background: '#f8fafc',
  borderLeft: '1px solid #cbd5e1', 
  height: '100%',
  display: 'flex',
  alignItems: 'center'
};
const prefixStyle = {
  ...adornmentStyle,
  borderLeft: 'none',
  borderRight: '1px solid #cbd5e1' 
};