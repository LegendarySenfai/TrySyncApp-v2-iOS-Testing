import React, { useState } from 'react';
import {
  exportToPDF,
  exportToExcel,
  exportToWord,
  filterByDateRange,
  buildDateRangeLabel,
  getReportUsername,
} from '../utils/reportExporter';

/**
 * ReportModal — reusable report generator for any DuoSync table.
 *
 * Props:
 *   isOpen      {boolean}          — controls visibility
 *   onClose     {() => void}       — called when modal should close
 *   title       {string}           — report heading printed in document
 *   allData     {Array}            — the currently filtered table data
 *   dateField   {string|null}      — item key used for date-range filtering
 *                                    (pass null for snapshot data like inventory)
 *   columns     {string[]}         — column header labels
 *   rowMapper   {(item) => any[]}  — maps one data item to a row of cell values
 *   filename    {string}           — base filename without extension
 */
export default function ReportModal({
  isOpen,
  onClose,
  title,
  allData = [],
  dateField = null,
  columns = [],
  rowMapper,
  filename = 'Report',
}) {
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [format, setFormat]         = useState('pdf');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError]           = useState('');

  if (!isOpen) return null;

  const handleGenerate = () => {
    setError('');

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      setError('Start date cannot be after end date.');
      return;
    }

    setIsGenerating(true);

    try {
      // Filter data by date range
      const filtered = dateField
        ? filterByDateRange(allData, dateField, startDate, endDate)
        : allData;

      if (filtered.length === 0) {
        setError('No records found for the selected date range.');
        setIsGenerating(false);
        return;
      }

      // Build rows
      const rows = filtered.map(item => rowMapper(item).map(v => String(v ?? '')));

      const payload = {
        title,
        columns,
        rows,
        filename,
        generatedBy: getReportUsername(),
        dateRangeLabel: buildDateRangeLabel(startDate, endDate),
      };

      if (format === 'pdf')   exportToPDF(payload);
      if (format === 'excel') exportToExcel(payload);
      if (format === 'word')  exportToWord(payload);

      // Brief visual feedback then close
      setTimeout(() => {
        setIsGenerating(false);
        onClose();
      }, 400);
    } catch (err) {
      console.error('Report generation error:', err);
      setError('An error occurred while generating the report. Please try again.');
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setStartDate('');
    setEndDate('');
    setFormat('pdf');
    setError('');
    onClose();
  };

  const generatedBy = getReportUsername();

  return (
    <div style={s.overlay}>
      <div style={s.modal}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <div>
              <h3 style={s.headerTitle}>Generate Report</h3>
              <p style={s.headerSub}>{title}</p>
            </div>
          </div>
          <button onClick={handleClose} style={s.closeBtn} title="Close">✕</button>
        </div>

        {/* ── Body ── */}
        <div style={s.body}>

          {/* Date Range — only shown when a dateField is provided */}
          {dateField ? (
            <div style={s.section}>
              <div style={s.sectionTitle}>📅 Date Range</div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={s.input}
                  />
                </div>
                <div style={s.arrowWrap}>→</div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    style={s.input}
                  />
                </div>
              </div>
              <p style={s.helpText}>
                Leave both blank to export <strong>all time</strong> data. Applies on top of any active table filters.
              </p>
            </div>
          ) : (
            <div style={{ ...s.section, background: '#f0fdf4', border: '1px solid #86efac' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#15803d', fontWeight: '600' }}>
                ℹ️ This report is a current snapshot — date filtering is not applicable.
              </p>
            </div>
          )}

          {/* Format Selector */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Export Format</div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              {[
                { value: 'pdf',   icon: '📄', label: 'PDF',       sub: 'Print-ready layout' },
                { value: 'excel', icon: '📊', label: 'Excel',     sub: '.xlsx spreadsheet'  },
                { value: 'word',  icon: '📝', label: 'Word',      sub: '.doc document'       },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  style={{
                    ...s.formatBtn,
                    ...(format === opt.value ? s.formatBtnActive : {}),
                  }}
                >
                  <span style={{ fontSize: '22px' }}>{opt.icon}</span>
                  <span style={{ fontWeight: '700', fontSize: '13px' }}>{opt.label}</span>
                  <span style={{ fontSize: '11px', color: format === opt.value ? '#93c5fd' : '#94a3b8' }}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Attribution */}
          <div style={s.attribution}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              Report will be attributed to: <strong style={{ color: '#0f172a' }}>{generatedBy}</strong>
            </span>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              Records available: <strong style={{ color: '#0f172a' }}>{allData.length}</strong>
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={s.errorBox}>{error}</div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={s.footer}>
          <button onClick={handleClose} style={s.cancelBtn}>
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{ ...s.generateBtn, opacity: isGenerating ? 0.7 : 1 }}
          >
            {isGenerating ? '⏳ Generating...' : `Generate ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 2000, padding: '20px',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    width: '540px',
    maxWidth: '100%',
    boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
  },
  headerIcon: { fontSize: '28px', marginRight: '12px', display: 'inline-block' },
  headerTitle: { color: '#fff', margin: 0, fontSize: '18px', fontWeight: '800', display: 'inline', verticalAlign: 'middle' },
  headerSub: { color: '#dbe1ea', margin: '4px 0 0 0', fontSize: '12px' },
  closeBtn: {
    background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
    width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: '24px' },
  section: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '16px',
  },
  sectionTitle: { fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px',
    color: '#0f172a', background: '#fff', outline: 'none',
  },
  arrowWrap: { alignSelf: 'flex-end', paddingBottom: '10px', color: '#94a3b8', fontWeight: 'bold', fontSize: '18px' },
  helpText: { margin: '10px 0 0 0', fontSize: '11px', color: '#2f3236' },
  formatBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '4px', padding: '14px 8px', border: '2px solid #e2e8f0',
    borderRadius: '10px', cursor: 'pointer', background: '#fff',
    transition: 'all 0.15s',
  },
  formatBtnActive: {
    border: '2px solid #3b82f6', background: '#1e293b', color: '#fff',
  },
  attribution: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px',
    background: '#f1f5f9',
    borderRadius: '8px',
    marginBottom: '4px',
  },
  errorBox: {
    marginTop: '12px', padding: '10px 14px',
    background: '#fef2f2', border: '1px solid #fca5a5',
    color: '#dc2626', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
  },
  footer: {
    display: 'flex', gap: '10px', padding: '16px 24px',
    borderTop: '1px solid #f1f5f9', background: '#f8fafc',
  },
  cancelBtn: {
    flex: 1, 
    padding: '12px', border: '1.5px solid #e2e8f0',
    borderRadius: '8px', background: '#fff', cursor: 'pointer',
    fontWeight: '700', fontSize: '14px', color: '#475569',
  },
  generateBtn: {
    flex: 1, // Change this from 2 to 1
    padding: '12px', border: 'none',
    borderRadius: '8px', background: '#1e293b', cursor: 'pointer',
    fontWeight: '700', fontSize: '14px', color: '#fff',
  },
};