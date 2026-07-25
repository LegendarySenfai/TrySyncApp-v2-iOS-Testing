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

export default function FinancialBreakdown() {
  const [ledger, setLedger] = useState([]);
  const [localCategory, setLocalCategory] = useState('all'); // 🌟 NEW: Local state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    fetchLedger();
  }, [localCategory, startDate, endDate]);

  const fetchLedger = async () => {
    try {
      const res = await api.get('/finance/ledger', {
        params: { category: localCategory, startDate, endDate } // 🌟 Point to localCategory
      });
      setLedger(res.data);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    }
  };

  const clearDates = () => {
    setStartDate('');
    setEndDate('');
  };

  // Pagination Math
  const totalPages = Math.ceil(ledger.length / ROWS_PER_PAGE) || 1;
  const currentData = ledger.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const getTypeBadge = (type) => {
    const baseStyle = { 
      padding: '5px 12px', 
      borderRadius: '20px', 
      fontSize: '11px', 
      fontWeight: '800', 
      display: 'inline-block', 
      textAlign: 'center', 
      minWidth: '75px',
      letterSpacing: '0.05em'
    };

    if(type === 'SALE') return <span style={{ ...baseStyle, background: '#e0f2fe', color: '#0284c7' }}>SALE</span>;
    if(type === 'EXPENSE') return <span style={{ ...baseStyle, background: '#fee2e2', color: '#dc2626' }}>EXPENSE</span>;
    if(type === 'VARIANCE_LOSS') return <span style={{ ...baseStyle, background: '#fef3c7', color: '#d97706' }}>LOSS</span>;
    
    return <span style={{ ...baseStyle, background: '#f1f5f9', color: '#64748b' }}>{type}</span>;
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#f8fafc' }}>
      <Sidebar />
      
      {/* 🛠️ APPLIED FIX: Added marginLeft and maxWidth to push it out from under the Sidebar */}
      <div style={{ flex: 1, padding: '30px 40px', overflowY: 'auto', marginLeft: 260, maxWidth: 'calc(100% - 260px)', boxSizing: 'border-box' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'20px' }}>
          <div>
            <h1 style={{ margin:0, color:'#0f172a', fontSize:'28px', fontWeight:'800' }}>Master Financial Ledger</h1>
            <p style={{ margin:'5px 0 0 0', color:'#64748b' }}>A complete, row-by-row breakdown of all sales, costs, and losses.</p>
          </div>
          <button onClick={() => setReportOpen(true)} style={{ background:'#1e293b', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'700' }}>
            📄 Export Ledger Report
          </button>
        </div>

        {/* Filters */}
        <div style={{ background:'#fff', padding:'15px 20px', borderRadius:'10px', display:'flex', gap:'15px', alignItems:'flex-end', marginBottom:'20px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* 🌟 NEW: Category Dropdown */}
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            <label style={{ fontSize:'12px', fontWeight:'bold', color:'#475569' }}>Category</label>
            <select 
              value={localCategory} 
              onChange={e => setLocalCategory(e.target.value)} 
              style={{ padding:'8px', borderRadius:'6px', border:'1px solid #cbd5e1', outline: 'none', backgroundColor: 'white', color: '#334155', fontWeight: '600', cursor: 'pointer' }}
            >
              <option value="all">All Transactions</option>
              <option value="milktea">Milktea Only</option>
              <option value="laundry">Laundry Only</option>
            </select>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            <label style={{ fontSize:'12px', fontWeight:'bold', color:'#475569' }}>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding:'8px', borderRadius:'6px', border:'1px solid #cbd5e1' }} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            <label style={{ fontSize:'12px', fontWeight:'bold', color:'#475569' }}>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding:'8px', borderRadius:'6px', border:'1px solid #cbd5e1' }} />
          </div>
          <button onClick={clearDates} style={{ padding:'9px 15px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#f1f5f9', cursor:'pointer', fontWeight:'bold', color:'#475569' }}>Clear</button>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              
              {/* UI UPGRADE: Dark Enterprise Header */}
              <thead style={{ background: '#1e293b', color: '#fff', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <tr>
                  <th style={{ padding: '15px 20px' }}>Date & Time</th>
                  <th style={{ padding: '15px 20px' }}>Type</th>
                  <th style={{ padding: '15px 20px' }}>Ref / Receipt #</th>
                  <th style={{ padding: '15px 20px' }}>Staff</th>
                  <th style={{ padding: '15px 20px', width: '250px' }}>Description / Items</th>
                  <th style={{ padding: '15px 20px', textAlign: 'right' }}>Gross In (₱)</th>
                  <th style={{ padding: '15px 20px', textAlign: 'right' }}>COGS/Exp Out (₱)</th>
                  <th style={{ padding: '15px 20px', textAlign: 'right' }}>Net Impact (₱)</th>
                </tr>
              </thead>
              
              <tbody>
                {currentData.length > 0 ? currentData.map((row, i) => (
                  <tr 
                    key={i} 
                    /* UI UPGRADE: Row hover interactions */
                    
                    style={{ borderBottom: i === currentData.length - 1 ? 'none' : '1px solid #f1f5f9', fontSize: '14px', color: '#1e293b', transition: 'background 0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'} 
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '15px 20px', whiteSpace: 'nowrap' }}>{new Date(row.date).toLocaleString()}</td>
                    <td style={{ padding: '15px 20px' }}>{getTypeBadge(row.type)}</td>
                    <td style={{ padding: '15px 20px', color: '#3b82f6', fontWeight: '700' }}>{row.ref_id || 'N/A'}</td>
                    <td style={{ padding: '15px 20px', color: '#475569', fontWeight: '500' }}>{row.staff}</td>
                    <td style={{ padding: '15px 20px', fontSize: '13px', color: '#64748b' }}>{row.description}</td>
                    
                    <td style={{ padding: '15px 20px', textAlign: 'right', color: '#10b981', fontWeight: '500' }}>
                      {parseFloat(row.cash_in) > 0 ? parseFloat(row.cash_in).toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '15px 20px', textAlign: 'right', color: '#f04444', fontWeight: '500' }}>
                      {(parseFloat(row.cogs_out) + parseFloat(row.expense_out)) > 0 ? (parseFloat(row.cogs_out) + parseFloat(row.expense_out)).toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '15px 20px', textAlign: 'right', fontWeight: '800', color: row.net_impact >= 0 ? '#10b981' : '#f04444' }}>
                      {row.net_impact.toFixed(2)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                      No financial records found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* UI UPGRADE: Clean border line above the pagination */}
          <div style={{ 
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '20px',
            paddingBottom: '5px'
          }}>
            {/* FIX: Added the exact same data counter used in your other tables */}
            {ledger.length > 0 && (
              <span style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '-5px' }}>
                Showing {currentData.length} of {ledger.length} records
              </span>
            )}
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Master Financial Ledger Breakdown"
        allData={ledger}
        dateField="date"
        columns={['Date', 'Type', 'Ref #', 'Staff', 'Description', 'Gross In', 'Deductions', 'Net Impact']}
        rowMapper={row => [
          new Date(row.date).toLocaleString(),
          row.type,
          row.ref_id || 'N/A',
          row.staff,
          row.description,
          `₱${parseFloat(row.cash_in).toFixed(2)}`,
          `₱${(parseFloat(row.cogs_out) + parseFloat(row.expense_out)).toFixed(2)}`,
          `₱${parseFloat(row.net_impact).toFixed(2)}`
        ]}
        filename="Master_Financial_Ledger"
      />
    </div>
  );
}