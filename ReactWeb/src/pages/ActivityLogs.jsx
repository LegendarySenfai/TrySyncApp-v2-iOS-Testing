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

export default function ActivityLogs() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('All');
  const [search, setSearch]   = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [reportOpen, setReportOpen]   = useState(false);

  // ── ORIGINAL fetch logic — PRESERVED EXACTLY ────────────────────────────
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      api.get('/admin/activity-logs')
         .then(res => { setLogs(res.data); setLoading(false); })
         .catch(err => console.error(err));
    }, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    api.get('/admin/activity-logs')
       .then(res => { setLogs(res.data); setLoading(false); })
       .catch(err => console.error(err));
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => { setCurrentPage(1); }, [filter, search]);

  const uniqueCategories = ['All', ...new Set(logs.map(l => l.action))];

  const filteredLogs = logs.filter(log => {
    const matchCat    = filter === 'All' || log.action === filter;
    const q           = search.toLowerCase();
    const matchSearch = !q
      || log.username?.toLowerCase().includes(q)
      || log.details?.toLowerCase().includes(q)
      || log.action?.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ROWS_PER_PAGE));
  const paginated  = filteredLogs.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  if (loading) return (
    <div style={pageWrap}>
      <Sidebar />
      <div style={{ flex:1, padding:'50px', marginLeft:260, textAlign:'center', color:'#64748b' }}>
        <h2>⏳ Loading System Logs...</h2>
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
            <h2 style={pageTitle}>🕵️ System Activity Trail</h2>
            <p style={pageSubtitle}>Monitor all critical changes made by Admins and Staff across the system.</p>
          </div>
          <button onClick={() => setReportOpen(true)} style={reportBtn}>📊 Generate Report</button>
        </div>

        {/* ── Filters ── */}
        <div style={{ display:'flex', gap:'12px', marginBottom:'20px', flexWrap:'wrap' }}>
          <input
            type="text" placeholder="Search by user, category, or details..."
            value={search} onChange={e => setSearch(e.target.value)} style={searchInput}
          />
          <div style={filterBox}>
            <span style={filterLabel}>Category:</span>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={selectStyle}>
              {uniqueCategories.map((c, i) => <option key={i} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ── Table ── */}
        <div style={tableCard}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'14px' }}>
            <thead>
              <tr style={{ background:'#1e293b', color:'#fff', textAlign:'left' }}>
                <th style={th}>Date & Time</th>
                <th style={th}>User</th>
                <th style={th}>Category</th>
                <th style={th}>Action Details</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan="4" style={emptyCell}>No activity logs match this filter.</td></tr>
              )}
              {paginated.map(log => (
                <tr key={log.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={td}>
                    <div style={{ fontWeight:'700', color:'#334155' }}>{new Date(log.timestamp).toLocaleDateString()}</div>
                    <div style={{ fontSize:'12px', color:'#64748b' }}>{new Date(log.timestamp).toLocaleTimeString()}</div>
                  </td>
                  <td style={{ ...td, fontWeight:'700', color:'#3b82f6' }}>{log.username}</td>
                  <td style={td}>
                    <span style={{ background:'#f1f5f9', padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'700', color:'#475569', textTransform:'uppercase' }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ ...td, color:'#334155' }}>{log.details}</td>
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
        title="System Activity Trail"
        allData={filteredLogs}
        dateField="timestamp"
        columns={['Date', 'Time', 'User', 'Category', 'Action Details']}
        rowMapper={log => [
          new Date(log.timestamp).toLocaleDateString(),
          new Date(log.timestamp).toLocaleTimeString(),
          log.username,
          log.action,
          log.details,
        ]}
        filename="ActivityLogs"
      />
    </div>
  );
}

const pageWrap    = { display:'flex', minHeight:'100vh', background:'#F0F2F5' };
const mainWrap    = { flex:1, padding:'24px 32px', marginLeft:260, boxSizing:'border-box', maxWidth:'calc(100% - 260px)' };
const headerRow   = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' };
const pageTitle   = { color:'#0f172a', margin:'0 0 4px 0', fontSize:'22px', fontWeight:'800' };
const pageSubtitle= { color:'#64748b', margin:0, fontSize:'14px' };
const tableCard   = { background:'#fff', borderRadius:'12px', boxShadow:'0 4px 6px rgba(0,0,0,0.05)', overflow:'hidden' };
const th          = { padding:'14px 16px', fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' };
const td          = { padding:'14px 16px', verticalAlign:'middle' };
const emptyCell   = { padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'15px' };
const footerRow   = { display:'flex', flexDirection: 'column', justifyContent:'center', alignItems:'center', padding:'0 16px', borderTop:'1px solid #f1f5f9'};
const countText   = { fontSize:'13px', color:'#94a3b8', padding:'12px 0' };
const searchInput = { flex:1, minWidth:'240px', padding:'10px 16px', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'14px', color:'#334155', outline:'none', background:'white' };
const filterBox   = { display:'flex', alignItems:'center', gap:'10px', background:'white', padding:'10px 16px', borderRadius:'8px', border:'1.5px solid #e2e8f0' };
const filterLabel = { fontWeight:'700', color:'#475569', fontSize:'13px', whiteSpace:'nowrap' };
const selectStyle = { padding:'5px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', outline:'none', cursor:'pointer', fontWeight:'700', color:'#3b82f6', background:'#f8fafc' };
const reportBtn   = { background:'#1e293b', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px', whiteSpace:'nowrap' };