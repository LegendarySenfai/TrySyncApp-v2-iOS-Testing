import React, { useState, useEffect, useRef  } from 'react';
import api from '../config/api';
import Sidebar from '../components/Sidebar';
import ReportModal from '../components/ReportModal';
import { exportToPDF, exportToExcel, exportToWord, getReportUsername } from '../utils/reportExporter';

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

function ExportReportDropdown({audit, onExport}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      
      {/* 1. The Toggle Button */}
      <button 
        onClick={() => setOpen(!open)} 
        style={{ background:'#10b981', color:'white', padding:'10px 15px', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        Export Report
      </button>

      {/* 2. The Floating Dropdown Menu */}
      {open && (
        <div style={{ 
          position: 'absolute', 
          top: '100%', 
          right: 0, 
          marginTop: '8px', 
          background: 'white', 
          border: '1px solid #e2e8f0', 
          borderRadius: '8px', 
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
          width: '160px', 
          zIndex: 50,
          overflow: 'hidden'
        }}>
          
          {/* Menu Item 1: CSV (Functional) */}
          <button 
            onClick={() => { onExport(audit, 'excel'); setOpen(false); }}
            style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#334155', fontWeight: '600', fontSize: '14px', borderBottom: '1px solid #f1f5f9' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            📊 Download Excel
          </button>

          <button 
            onClick={() => { onExport(audit, 'pdf'); setOpen(false); }}
            style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#334155', fontWeight: '600', fontSize: '14px', borderBottom: '1px solid #f1f5f9' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            📄 Download PDF
          </button>

          <button 
            onClick={() => { onExport(audit, 'word'); setOpen(false); }}
            style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#334155', fontWeight: '600', fontSize: '14px' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            📝 Download Word
          </button>

        </div>
      )}
    </div>
  );
}

export default function YieldVariance() {
  const [audits, setAudits]             = useState([]);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [searchDate, setSearchDate]     = useState('');
  const [currentPage, setCurrentPage]   = useState(1);
  const [reportOpen, setReportOpen]     = useState(false);

  // ── ORIGINAL fetch logic — PRESERVED EXACTLY ────────────────────────────
  const fetchAudits = () => {
    api.get('/admin/audits').then(res => {
      setAudits(res.data);
      setLoading(false);
    }).catch(err => console.error(err));
  };

  useEffect(() => {
    fetchAudits();
    const refreshInterval = setInterval(() => { fetchAudits(); }, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    api.get('/admin/audits').then(res => {
      setAudits(res.data);
      setLoading(false);
    }).catch(err => console.error(err));
  }, []);

  // ── ORIGINAL exportToCSV — PRESERVED EXACTLY ─────────────────────────────
  // ── UNIFIED SINGLE EXPORT LOGIC ───────────────────────────────────────────
  const handleSingleExport = (audit, format) => {
    // 1. Map the inventory details into rows just like ReportModal does
    const rows = audit.audit_details.map(item => [
      item.item_name,
      String(item.system_stock.toFixed(1)) + ' ' + item.unit,
      String(item.physical_count.toFixed(1)) + ' ' + item.unit,
      item.variance > 0 ? `-${item.variance.toFixed(1)}` : String(item.variance.toFixed(1)),
      `₱${item.loss.toFixed(2)}`
    ]);

    // 2. Build the payload exactly how your utilities expect it
    const payload = {
      title: `Z-Reading Breakdown`,
      columns: ['Item', 'System Expected', 'Actual Count', 'Variance (Missing)', 'Est. Loss (₱)'],
      rows: rows,
      filename: `Z-Reading_${audit.shop_category}_${new Date(audit.audit_date).toLocaleDateString().replace(/\//g, '-')}`,
      generatedBy: getReportUsername(),
      dateRangeLabel: `Category: ${audit.shop_category.toUpperCase()} | Staff: ${audit.staff_name} | Date: ${new Date(audit.audit_date).toLocaleString()}`
    };

    // 3. Trigger your existing utility functions
    if (format === 'pdf') exportToPDF(payload);
    if (format === 'excel') exportToExcel(payload);
    if (format === 'word') exportToWord(payload);
  };

  // ── ORIGINAL date filter logic — PRESERVED EXACTLY ───────────────────────
  const filteredAudits = audits.filter(audit => {
    if (!searchDate) return true;
    const d = new Date(audit.audit_date);
    const year  = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day   = String(d.getDate()).padStart(2, '0');
    const formattedAuditDate = `${year}-${month}-${day}`;
    return formattedAuditDate === searchDate;
  });
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => { setCurrentPage(1); }, [searchDate]);

  const totalPages = Math.max(1, Math.ceil(filteredAudits.length / ROWS_PER_PAGE));
  const paginated  = filteredAudits.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  if (loading) return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#f8fafc'}}>
      <Sidebar />
      <div style={{ flex:1, padding:'50px', marginLeft:260, textAlign:'center', color:'#64748b' }}>
        <h2>⏳ Loading Variance Reports...</h2>
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#F0F2F5'}}>
      <Sidebar />

      <style>{`.audit-row:hover { background-color: #f8fafc !important; }`}</style>

      <div style={{ flex:1, padding:'24px 32px', marginLeft:260, boxSizing:'border-box', maxWidth:'calc(100% - 260px)' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'30px' }}>
          <div>
            <h2 style={{ color:'#0f172a', margin:'0 0 5px 0' }}>⚖️ Z-Reading & Yield Variance Log</h2>
            <p style={{ color:'#64748b', margin:0 }}>Review end-of-shift blind audits submitted by staff.</p>
          </div>

          {/* Right-side controls: Date filter + Generate Report */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', background:'white', padding:'10px 15px', borderRadius:'8px', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' }}>
              <span style={{ fontWeight:'bold', color:'#475569', fontSize:'14px' }}>Filter by Date:</span>
              <input
                type="date"
                value={searchDate}
                onChange={e => setSearchDate(e.target.value)}
                style={{ padding:'6px 12px', border:'1px solid #cbd5e1', borderRadius:'6px', outline:'none', color:'#334155', fontWeight:'bold', cursor:'pointer' }}
              />
              {searchDate && (
                <button
                  onClick={() => setSearchDate('')}
                  style={{ background:'#ef4444', color:'white', border:'none', padding:'6px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:'bold' }}>
                  Clear
                </button>
              )}
            </div>

            <button onClick={() => setReportOpen(true)} style={reportBtn}>
              📊 Generate Report
            </button>
          </div>
        </div>

        {/* ── Main Table ── */}
        <div style={{ background:'#fff', borderRadius:'10px', boxShadow:'0 4px 6px rgba(0,0,0,0.05)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead>
              <tr style={{ background:'#1e293b', color:'#fff', textAlign:'left' }}>
                <th style={{ padding:'15px' }}>Timestamp</th>
                <th style={{ padding:'15px' }}>Staff Member</th>
                <th style={{ padding:'15px' }}>Category</th>
                <th style={{ padding:'15px', textAlign:'right' }}>Total Variance Loss</th>
                <th style={{ padding:'15px', textAlign:'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'16px' }}>
                    {searchDate ? 'No audits found for this date.' : 'No Z-Readings submitted yet.'}
                  </td>
                </tr>
              )}
              {paginated.map(audit => (
                <tr
                  key={audit.id}
                  className="audit-row"
                  onClick={() => setSelectedAudit(audit)}
                  style={{ borderBottom:'1px solid #e2e8f0', cursor:'pointer', background:'white', transition:'background-color 0.2s' }}
                >
                  <td style={{ padding:'15px', color:'#334155', fontWeight:'bold' }}>
                    {new Date(audit.audit_date).toLocaleString()}
                  </td>
                  <td style={{ padding:'15px', color:'#64748b', fontWeight:'bold' }}>{audit.staff_name}</td>
                  <td style={{ padding:'15px' }}>
                    <span style={{ background:'#f1f5f9', padding:'4px 10px', borderRadius:'6px', fontSize:'12px', fontWeight:'bold', color:'#475569', textTransform:'uppercase' }}>
                      {audit.shop_category}
                    </span>
                  </td>
                  <td style={{ padding:'15px', textAlign:'right', color: audit.total_loss > 0 ? '#ef4444' : '#10b981', fontWeight:'700', fontSize:'16px' }}>
                    ₱{parseFloat(audit.total_loss).toFixed(2)}
                  </td>
                  <td style={{ padding:'15px', textAlign:'center' }}>
                    <button style={{ background:'#3b82f6', color:'#fff', border:'none', padding:'8px 16px', borderRadius:'6px', fontWeight:'600', cursor:'pointer' }}>
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination footer */}
          <div style={{ display:'flex', flexDirection: 'column',justifyContent:'center', alignItems:'center', padding:'16px', borderTop:'1px solid #f1f5f9'}}>
            <span style={{ fontSize:'13px', color:'#94a3b8', padding:'12px 0' }}>
              Showing {paginated.length} of {filteredAudits.length} records
            </span>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>

        {/* ── Z-Reading Detail Modal — ORIGINAL PRESERVED EXACTLY ── */}
        {selectedAudit && (
          <div style={modalOverlay}>
            <div style={modalContent}>

              {/* MODAL HEADER */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', paddingBottom:'20px', borderBottom:'2px solid #f1f5f9', marginBottom:'25px' }}>
                <div>
                  <h2 style={{ margin:'0 0 15px 0', color:'#0f172a' }}>Z-Reading Breakdown</h2>
                  <div style={{ fontSize:'22px', fontWeight:'900', color:'#1e293b', marginBottom:'8px' }}>
                    {new Date(selectedAudit.audit_date).toLocaleString()}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <span style={{ background:'#e2e8f0', padding:'4px 10px', borderRadius:'6px', fontSize:'12px', fontWeight:'bold', color:'#475569', textTransform:'uppercase' }}>
                      {selectedAudit.shop_category}
                    </span>
                    <span style={{ fontSize:'14px', color:'#64748b', fontWeight:'500' }}>• Staff: {selectedAudit.staff_name}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'10px' }}>
                  {/* 🟢 Swap out the prop name and the function name here */}
                  <ExportReportDropdown audit={selectedAudit} onExport={handleSingleExport}/>
                  <button onClick={() => setSelectedAudit(null)} style={{ background:'#ef4444', color:'white', padding:'10px 15px', border:'none', borderRadius:'6px', cursor:'pointer' }}>
                    Close
                  </button>
                </div>
              </div>

              {/* CASH AUDIT CARDS */}
              <div style={{ display:'flex', gap:'15px', marginBottom:'30px' }}>
                {[
                  { label:'Starting Cash', value:`₱${parseFloat(selectedAudit.starting_cash||0).toFixed(2)}`, color:'#334155', bg:'#f8fafc', border:'#e2e8f0' },
                  { label:'Shift Sales',   value:`+ ₱${(parseFloat(selectedAudit.expected_cash||0)-parseFloat(selectedAudit.starting_cash||0)).toFixed(2)}`, color:'#3b82f6', bg:'#f8fafc', border:'#e2e8f0' },
                  { label:'Physical Drawer', value:`₱${parseFloat(selectedAudit.actual_cash||0).toFixed(2)}`, color:'#8b5cf6', bg:'#f8fafc', border:'#e2e8f0' },
                  {
                    label:'Cash Missing',
                    value:`₱${parseFloat(selectedAudit.cash_variance||0).toFixed(2)}`,
                    color: parseFloat(selectedAudit.cash_variance) > 0 ? '#ef4444' : '#10b981',
                    bg:    parseFloat(selectedAudit.cash_variance) > 0 ? '#fef2f2' : '#f0fdf4',
                    border:parseFloat(selectedAudit.cash_variance) > 0 ? '#fca5a5' : '#86efac',
                  },
                ].map(card => (
                  <div key={card.label} style={{ flex:1, background:card.bg, padding:'20px', borderRadius:'10px', border:`1px solid ${card.border}` }}>
                    <div style={{ fontSize:'13px', color:card.color, textTransform:'uppercase', fontWeight:'bold', marginBottom:'5px' }}>{card.label}</div>
                    <div style={{ fontSize:'24px', fontWeight:'bold', color:card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* 🌟 NEW: Variance Reason Display */}
              {selectedAudit.variance_reason && (
                <div style={{ marginBottom: '30px', background: '#fffbeb', padding: '15px 20px', borderLeft: '4px solid #f59e0b', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#92400e', fontSize: '14px', textTransform: 'uppercase' }}>⚠️ Cash Variance Explanation</h4>
                  <p style={{ margin: 0, color: '#b45309', fontSize: '14px', whiteSpace: 'pre-wrap' }}>{selectedAudit.variance_reason}</p>
                </div>
              )}

              <h3 style={{ margin:'0 0 15px 0', color:'#334155' }}>📦 Raw Inventory Variance</h3>

              <div style={{ border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
                  <thead>
                    <tr style={{ background:'#1e293b', color:'#fff', textAlign:'left' }}>
                      <th style={{ padding:'15px' }}>Item</th>
                      <th style={{ padding:'15px' }}>System Expected</th>
                      <th style={{ padding:'15px' }}>Actual Count</th>
                      <th style={{ padding:'15px' }}>Variance (Missing)</th>
                      <th style={{ padding:'15px' }}>Est. Loss (₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAudit.audit_details.map((item, idx) => {
                      const isWarning = item.variance > 0;
                      return (
                        <tr key={idx} style={{ borderBottom:'1px solid #eee', background: isWarning ? '#fff5f5' : 'white' }}>
                          <td style={{ padding:'15px', fontWeight:'bold', color:'#334155', fontSize:'15px' }}>{item.item_name}</td>
                          <td style={{ padding:'15px', color:'#3b82f6', fontWeight:'600' }}>{item.system_stock.toFixed(1)} {item.unit}</td>
                          <td style={{ padding:'15px', color:'#8b5cf6', fontWeight:'bold', fontSize:'15px' }}>{item.physical_count.toFixed(1)} {item.unit}</td>
                          <td style={{ padding:'15px', color: isWarning ? '#ef4444' : '#10b981', fontWeight:'bold', fontSize:'15px' }}>
                            {item.variance > 0 ? `-${item.variance.toFixed(1)}` : item.variance.toFixed(1)}
                          </td>
                          <td style={{ padding:'15px', color: isWarning ? '#ef4444' : '#64748b', fontWeight:'bold', fontSize:'15px' }}>
                            ₱{item.loss.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* ── Generate Report Modal ── */}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Z-Reading & Yield Variance Log"
        allData={filteredAudits}
        dateField="audit_date"
        columns={['Timestamp', 'Staff', 'Category', 'Starting Cash', 'Shift Sales', 'Drawer', 'Missing', 'Loss (₱)', 'Explanation']}
        rowMapper={audit => [
          new Date(audit.audit_date).toLocaleString(),
          audit.staff_name,
          audit.shop_category,
          `₱${parseFloat(audit.starting_cash || 0).toFixed(2)}`,
          `₱${(parseFloat(audit.expected_cash || 0) - parseFloat(audit.starting_cash || 0)).toFixed(2)}`,
          `₱${parseFloat(audit.actual_cash || 0).toFixed(2)}`,
          `₱${parseFloat(audit.cash_variance || 0).toFixed(2)}`,
          `₱${parseFloat(audit.total_loss).toFixed(2)}`,
          audit.variance_reason || 'N/A'
        ]}
        filename="YieldVariance_ZReadings"
      />
    </div>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────────
const reportBtn  = { background:'#1e293b', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px', whiteSpace:'nowrap' };
const modalOverlay = {
  position:'fixed', top:0, left:0, right:0, bottom:0,
  backgroundColor:'rgba(15, 23, 42, 0.75)',
  display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000, padding:'20px',
};
const modalContent = {
  backgroundColor:'#fff', padding:'35px', borderRadius:'16px',
  width:'1000px', maxWidth:'100%', maxHeight:'90vh', overflowY:'auto',
  boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
};