/**
 * AiControlCenter.jsx  —  DuoSync Multi-Horizon Predictive Intelligence Dashboard
 * Route: /ai-control
 *
 * Fetches from:
 *   GET  /api/ai-insights/latest      → AI text summaries (stored reports)
 *   GET  /api/test/ai-forecaster      → raw EWMA + DoW + horizon data
 *   GET  /api/ai/staff-eligible       → staff dropdown
 *   POST /api/ai/delegate-restock     → create PDF task
 *
 * Backend data structures are NOT altered. This file is purely presentational.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, CartesianGrid,
} from 'recharts';
import api from '../config/api';
import Sidebar from '../components/Sidebar';

function Pagination({ currentPage, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;
    const btn = (lbl, pg, disabled) => (
        <button key={lbl} onClick={() => onPageChange(pg)} disabled={disabled}
            style={{ background: disabled ? '#f1f5f9' : '#1e293b', color: disabled ? '#94a3b8' : 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: disabled ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
            {lbl}
        </button>
    );
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '14px' }}>
            {btn('«', 1, currentPage === 1)}
            {btn('‹', currentPage - 1, currentPage === 1)}
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', padding: '0 8px' }}>Page {currentPage} of {totalPages}</span>
            {btn('›', currentPage + 1, currentPage === totalPages)}
            {btn('»', totalPages, currentPage === totalPages)}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(parseFloat(n || 0) * 100) / 100;

const STATUS_META = {
    critical: { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5', dot: '#ef4444', label: 'Critical',  glow: 'rgba(239,68,68,0.15)'   },
    warning:  { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b', label: 'Warning',   glow: 'rgba(245,158,11,0.15)'   },
    ok:       { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', dot: '#22c55e', label: 'Healthy',   glow: 'rgba(34,197,94,0.12)'    },
    infinite: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', dot: '#94a3b8', label: 'No Usage',  glow: 'rgba(148,163,184,0.12)'  },
};

const TREND_META = {
    accelerating: { icon: '↑', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Accelerating' },
    decelerating: { icon: '↓', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Decelerating' },
    stable:       { icon: '→', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'Stable'       },
};

// ─────────────────────────────────────────────────────────────────────────────
// ── TOAST
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDone }) {
    useEffect(() => {
        const t = setTimeout(onDone, 3500);
        return () => clearTimeout(t);
    }, [onDone]);
    const isOk = type === 'success';
    return (
        <div style={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
            background: isOk ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${isOk ? '#86efac' : '#fca5a5'}`,
            color: isOk ? '#15803d' : '#dc2626',
            padding: '14px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', maxWidth: 380,
            animation: 'slideUp 0.3s ease',
        }}>
            {isOk ? '✅ ' : '❌ '}{message}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── RECHARTS CUSTOM TOOLTIPS
// ─────────────────────────────────────────────────────────────────────────────

const DowTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const isSurge = d.payload.isSurge;
    return (
        <div style={{
            background: '#0f172a', borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1px solid #1e293b',
        }}>
            <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                {d.payload.name}
            </div>
            <div style={{ color: isSurge ? '#fbbf24' : '#60a5fa', fontWeight: 800, fontSize: 16 }}>
                {d.value.toFixed(2)}×
            </div>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                {isSurge ? '⚡ Surge Day' : 'Normal demand'}
            </div>
        </div>
    );
};

const TrendTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#0f172a', borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1px solid #1e293b',
        }}>
            <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                {payload[0].payload.period}
            </div>
            <div style={{ color: '#60a5fa', fontWeight: 800, fontSize: 16 }}>
                {payload[0].value.toFixed(4)} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>units/day avg</span>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// ── HORIZON CARD
// ─────────────────────────────────────────────────────────────────────────────

function HorizonCard({ label, data, unit }) {
    if (!data) return null;
    const isAdequate      = data.stock_adequate;
    const stockoutDay     = data.projected_stockout_day;
    const stockAfter      = data.stock_after_horizon;
    const predictedDemand = data.predicted_demand;
    const surgeMultiplier = data.avg_surge_multiplier;

    const accent = isAdequate ? '#16a34a' : '#dc2626';
    const bg     = isAdequate ? '#f0fdf4' : '#fef2f2';
    const border = isAdequate ? '#86efac' : '#fca5a5';

    return (
        <div style={{
            background: 'white', borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${border}`, flex: 1, minWidth: '180px',
            boxShadow: `0 4px 20px ${isAdequate ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'}`,
        }}>
            {/* Card top band */}
            <div style={{ background: accent, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'white', fontWeight: 800, fontSize: 13, letterSpacing: '0.5px' }}>{label}</span>
                <span style={{
                    background: 'rgba(255,255,255,0.2)', color: 'white',
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.5px',
                }}>
                    {isAdequate ? '✓ ADEQUATE' : '⚠ RISK'}
                </span>
            </div>

            {/* Demand metric */}
            <div style={{ padding: '16px 16px 14px', background: bg, borderBottom: `1px solid ${border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                    Projected Demand
                </div>
                <div style={{ fontWeight: 800, fontSize: 22, color: '#0f172a', letterSpacing: '-0.5px' }}>
                    {predictedDemand.toFixed(2)}
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>{unit}</span>
                </div>
            </div>

            {/* Stats */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatRow
                    label="Stock After Horizon"
                    value={isAdequate ? `+${stockAfter.toFixed(2)} ${unit}` : 'Stockout'}
                    color={isAdequate ? '#15803d' : '#dc2626'}
                />
                {!isAdequate && stockoutDay && (
                    <StatRow
                        label="Stockout Day"
                        value={`Day ${stockoutDay}`}
                        color="#dc2626"
                    />
                )}
                <StatRow
                    label="Avg Surge Multiplier"
                    value={`${surgeMultiplier.toFixed(3)}×`}
                    color={surgeMultiplier > 1.1 ? '#b45309' : '#334155'}
                />
            </div>
        </div>
    );
}

function StatRow({ label, value, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color }}>{value}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EWMA STAT BOX
// ─────────────────────────────────────────────────────────────────────────────

function EwmaBox({ label, value, unit, alpha, isHighlighted }) {
    return (
        <div style={{
            background: isHighlighted ? 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)' : '#f8fafc',
            border: isHighlighted ? 'none' : '1px solid #e2e8f0',
            borderRadius: 10, padding: '12px 14px', flex: 1, textAlign: 'center',
            boxShadow: isHighlighted ? '0 4px 16px rgba(29,78,216,0.3)' : 'none',
        }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, color: isHighlighted ? '#93c5fd' : '#64748b' }}>
                {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: isHighlighted ? 'white' : '#0f172a', letterSpacing: '-0.5px' }}>
                {value.toFixed(4)}
            </div>
            <div style={{ fontSize: 10, color: isHighlighted ? '#60a5fa' : '#94a3b8', marginTop: 4, fontWeight: 600 }}>
                {unit} &nbsp;·&nbsp; α={alpha}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AiControlCenter() {
    const baseFont = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // ── Font injection ────────────────────────────────────────────────────
    useEffect(() => {
        if (document.head.querySelector('[data-aic-fonts]')) return;
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap';
        link.setAttribute('data-aic-fonts', 'true');
        document.head.appendChild(link);
    }, []);

    // ── State ─────────────────────────────────────────────────────────────
    const [insights, setInsights]               = useState(null);
    const [forecaster, setForecaster]           = useState(null);
    const [eligibleStaff, setEligibleStaff]     = useState([]);
    const [selectedStaff, setSelectedStaff]     = useState('');
    const [loading, setLoading]                 = useState(true);
    const [delegating, setDelegating]           = useState(false);
    const [toast, setToast]                     = useState(null);
    const [searchFilter, setSearchFilter]       = useState('');
    const [statusFilter, setStatusFilter]       = useState('all');
    const [selectedItemId, setSelectedItemId]   = useState(null);
    const [activeReportModal, setActiveReportModal] = useState(null);
    const [activePillTab, setActivePillTab] = useState('critical');

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // ── Auto-select first critical/warning item when data loads ───────────
    useEffect(() => {
        if (forecaster?.data?.length > 0 && !selectedItemId) {
            const first = forecaster.data.find(i => i.status === 'critical')
                       || forecaster.data.find(i => i.status === 'warning')
                       || forecaster.data[0];
            if (first) setSelectedItemId(first.raw_inventory_id);
        }
    }, [forecaster, selectedItemId]);

    // ── Fetch all data ────────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [insRes, foreRes, staffRes] = await Promise.allSettled([
                api.get('/api/ai-insights/latest'),
                api.get('/api/test/ai-forecaster'),
                api.get('/api/ai/staff-eligible'),
            ]);
            if (insRes.status   === 'fulfilled') setInsights(insRes.value.data);
            if (foreRes.status  === 'fulfilled') setForecaster(foreRes.value.data);
            if (staffRes.status === 'fulfilled') {
                setEligibleStaff(staffRes.value.data);
                if (staffRes.value.data.length > 0) setSelectedStaff(staffRes.value.data[0].username);
            }
        } catch (err) {
            console.error('AiControlCenter fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Delegate ──────────────────────────────────────────────────────────
    const handleDelegate = async () => {
        if (!selectedStaff) return setToast({ message: 'Please select a staff member first.', type: 'error' });
        if (!forecaster?.data?.length) return setToast({ message: 'No forecaster data available.', type: 'error' });

        setDelegating(true);
        try {
            const itemsToSend = forecaster.data.filter(i => i.status === 'critical' || i.status === 'warning');
            if (itemsToSend.length === 0) {
                setToast({ message: 'No critical or warning items to delegate.', type: 'error' });
                setDelegating(false);
                return;
            }
            const res = await api.post('/api/ai/delegate-restock', { items: itemsToSend, assigned_to: selectedStaff });
            setToast({ message: `${res.data.message} PDF ready at ${res.data.pdf_url}`, type: 'success' });
        } catch (err) {
            setToast({ message: err.response?.data?.error || 'Delegation failed.', type: 'error' });
        } finally {
            setDelegating(false);
        }
    };

    // ── Derived data ──────────────────────────────────────────────────────
    const tableData = (forecaster?.data || []).filter(item => {
        const matchSearch = !searchFilter || item.item_name?.toLowerCase().includes(searchFilter.toLowerCase());
        const matchStatus = statusFilter === 'all' || item.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const totalPages = Math.max(1, Math.ceil(tableData.length / itemsPerPage));
    const paginatedData = tableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const criticalCount     = (forecaster?.data || []).filter(i => i.status === 'critical').length;
    const warningCount      = (forecaster?.data || []).filter(i => i.status === 'warning').length;
    const weekendRiskCount  = (forecaster?.data || []).filter(i => i.weekend_surge_risk).length;
    const healthyCount      = (forecaster?.data || []).filter(i => i.status === 'ok').length;

    const selectedItem = forecaster?.data?.find(i => i.raw_inventory_id === selectedItemId);
    const hasAnalytics = selectedItem && selectedItem.status !== 'infinite' && selectedItem.ewma_analysis;

    // DoW Surge Chart data
    const dowChartData = (selectedItem?.dow_surge_profile || []).map(d => ({
        name:    d.name.slice(0, 3),
        fullName: d.name,
        value:   d.surge_index,
        raw:     d.raw_consumption,
        isSurge: d.surge_index > 1.15,
    }));

    // Demand Trajectory (block averages — oldest to newest so the chart reads left→right as time progresses)
    const trendData = hasAnalytics ? [
        { period: '90–180d', value: selectedItem.ewma_analysis.block_averages.long,        isNewest: false },
        { period: '30–90d',  value: selectedItem.ewma_analysis.block_averages.medium,      isNewest: false },
        { period: '7–30d',   value: selectedItem.ewma_analysis.block_averages.short,       isNewest: false },
        { period: 'Last 7d', value: selectedItem.ewma_analysis.block_averages.ultra_short, isNewest: true  },
    ] : [];

    const TREND_COLORS = ['#cbd5e1', '#93c5fd', '#60a5fa', '#2563eb'];

    // Momentum velocity display
    const velocity  = hasAnalytics ? (selectedItem.ewma_analysis.momentum_velocity || 0) : 0;
    const direction = hasAnalytics ? (selectedItem.ewma_analysis.trend_direction || 'stable') : 'stable';
    const trendMeta = TREND_META[direction] || TREND_META.stable;
    const velPct    = (Math.abs(velocity) * 100).toFixed(1);

    // ── LOADING ───────────────────────────────────────────────────────────
    if (loading) return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F2F5', fontFamily: baseFont }}>
            <Sidebar />
            <div style={{ flex: 1, marginLeft: 260, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 2s linear infinite' }}>⚙️</div>
                    <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 700 }}>Loading AI Intelligence…</div>
                    <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 6 }}>Fetching EWMA forecasts and surge profiles</div>
                </div>
            </div>
        </div>
    );

    // ─────────────────────────────────────────────────────────────────────
    // ── RENDER
    // ─────────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F2F5', fontFamily: baseFont }}>
            <Sidebar />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@700;800;900&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .aic-root * { box-sizing: border-box; }

                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }

                .item-pill {
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-weight: 700;
                    font-size: 12px;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: all 0.15s ease;
                    border-width: 1.5px;
                    border-style: solid;
                }
                .item-pill:hover { transform: translateY(-1px); }

                .table-row-hover:hover { background: #f0f9ff !important; cursor: pointer; }
                .table-row-selected { box-shadow: inset 3px 0 0 #2563eb; }

                .delegate-btn {
                    padding: 12px 28px;
                    background: linear-gradient(135deg, #1d4ed8, #3b82f6);
                    color: white; border: none; border-radius: 10px;
                    font-weight: 800; font-size: 14px; cursor: pointer;
                    box-shadow: 0 4px 16px rgba(59,130,246,0.35);
                    transition: all 0.2s; white-space: nowrap;
                }
                .delegate-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 24px rgba(59,130,246,0.45);
                }
                .delegate-btn:disabled { background: #94a3b8; box-shadow: none; cursor: wait; }

                .aic-section { animation: fadeIn 0.4s ease; }
            `}</style>

            {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

            <div className="aic-root" style={{ flex: 1, marginLeft: 260, maxWidth: 'calc(100% - 260px)', boxSizing: 'border-box' }}>

                {/* ══════════════════════════════════════════════════════ */}
                {/* HERO HEADER                                           */}
                {/* ══════════════════════════════════════════════════════ */}
                <div style={{
                    background: 'linear-gradient(145deg, #050d1f 0%, #0d1f3c 55%, #102b52 100%)',
                    padding: '32px 40px 36px',
                    position: 'relative', overflow: 'hidden',
                }}>
                    {/* Dot-grid texture */}
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.20) 1px, transparent 1px)',
                        backgroundSize: '30px 30px',
                    }} />
                    {/* Glow orb */}
                    <div style={{
                        position: 'absolute', top: -80, right: 80, width: 300, height: 300,
                        background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Title row */}
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 28 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <div style={{
                                    width: 44, height: 44, background: 'rgba(59,130,246,0.2)',
                                    border: '1px solid rgba(59,130,246,0.4)', borderRadius: 12,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                                }}>🤖</div>
                                <h1 style={{
                                    margin: 0, color: 'white', fontSize: 26, fontWeight: 900,
                                    fontFamily: "'Outfit', 'DM Sans', sans-serif", letterSpacing: '-0.5px',
                                }}>
                                    AI Command Center
                                </h1>
                                <div style={{
                                    background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)',
                                    color: '#93c5fd', fontSize: 10, fontWeight: 700, letterSpacing: '2px',
                                    textTransform: 'uppercase', padding: '4px 12px', borderRadius: 20,
                                }}>
                                    LIVE
                                </div>
                            </div>
                            <p style={{ color: '#cbd2dc', margin: 0, fontSize: 13, maxWidth: 480, lineHeight: 1.6 }}>
                                Smart Operations Assistant · Predictive Stock Forecasting · Day-of-Week Surge Profiling
                            </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: 4 }}>
                            <div style={{ color: '#cdd1d7', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 4 }}>Last Run</div>
                            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
                                {forecaster ? new Date(forecaster.generated_at).toLocaleString() : '—'}
                            </div>
                            {forecaster && (
                                <div style={{ color: '#dcdcdc', fontSize: 11, marginTop: 3 }}>
                                    {forecaster.total_sales_analyzed} transactions · {forecaster.analysis_window_days}-day window
                                </div>
                            )}
                        </div>
                    </div>

                    {/* KPI Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, position: 'relative', zIndex: 1 }}>
                        {[
                            { label: 'Critical',      value: criticalCount,    icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.25)'    },
                            { label: 'Warning',       value: warningCount,     icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   border: 'rgba(245,158,11,0.25)'   },
                            { label: 'Healthy',       value: healthyCount,     icon: '🟢', color: '#22c55e', bg: 'rgba(34,197,94,0.10)',    border: 'rgba(34,197,94,0.25)'    },
                            { label: 'Weekend Risk',  value: weekendRiskCount, icon: '⚡', color: '#a78bfa', bg: 'rgba(167,139,250,0.10)',  border: 'rgba(167,139,250,0.25)'  },
                        ].map(k => (
                            <div key={k.label} style={{
                                background: k.bg, border: `1px solid ${k.border}`,
                                borderRadius: 12, padding: '16px 20px',
                                display: 'flex', alignItems: 'center', gap: 14,
                            }}>
                                <div style={{ fontSize: 24 }}>{k.icon}</div>
                                <div>
                                    <div style={{ color: k.color, fontWeight: 900, fontSize: 28, lineHeight: 1, letterSpacing: '-1px' }}>
                                        {k.value}
                                    </div>
                                    <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginTop: 3 }}>
                                        {k.label}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main content area */}
                <div style={{ padding: '28px 40px' }}>

                    {/* ── Urgent Alert Banner ── */}
                    {(criticalCount > 0 || warningCount > 0) && (
                        <div style={{
                            background: criticalCount > 0 ? '#fef2f2' : '#fffbeb',
                            border: `1px solid ${criticalCount > 0 ? '#fca5a5' : '#fde68a'}`,
                            color: criticalCount > 0 ? '#dc2626' : '#b45309',
                            padding: '13px 20px', borderRadius: 12, marginBottom: 24,
                            display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700,
                        }}>
                            {criticalCount > 0
                                ? `🔴 URGENT: ${criticalCount} ingredient${criticalCount !== 1 ? 's' : ''} will run out within 7 days.`
                                : `🟡 ATTENTION: ${warningCount} ingredient${warningCount !== 1 ? 's' : ''} are running low (within 15 days).`}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* SECTION 1: CFO FINANCIAL STATUS (compact, no raw text) */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {/* CFO FINANCIAL STATUS */}
                    <div 
                        className="aic-section" 
                        onClick={() => { if(insights?.financial?.report_text) setActiveReportModal('financial') }}
                        style={{
                            background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
                            padding: '18px 24px', marginBottom: 24,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                            cursor: insights?.financial?.report_text ? 'pointer' : 'default',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => { if(insights?.financial?.report_text) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)'; } }}
                        onMouseLeave={(e) => { if(insights?.financial?.report_text) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; } }}
                    >
                        <div style={{
                            width: 44, height: 44, background: '#ede9fe', borderRadius: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                        }}>
                            📊
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>
                                CFO Weekly Financial Analysis
                            </div>
                            <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                                {insights?.financial?.report_text
                                    ? `Report generated · ${new Date(insights.financial.generated_at).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                                    : 'Awaiting first financial generation. The AI cron job has not run yet.'
                                }
                            </div>
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: insights?.financial?.report_text ? '#f0fdf4' : '#f8fafc',
                            border: `1px solid ${insights?.financial?.report_text ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: 8, padding: '8px 14px',
                        }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: insights?.financial?.report_text ? '#22c55e' : '#94a3b8',
                            }} />
                            <span style={{
                                fontSize: 12, fontWeight: 700,
                                color: insights?.financial?.report_text ? '#15803d' : '#64748b',
                            }}>
                                {insights?.financial?.report_text ? 'Report Ready' : 'No Data'}
                            </span>
                        </div>

                        {/* Loss Prevention status */}
                        <div style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />
                        
                        {/* 🛡️ THE NEW CLICKABLE AUDITOR WRAPPER */}
                        <div 
                            onClick={() => { if(insights?.auditor?.report_text) setActiveReportModal('auditor') }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 20, flex: 1,
                                cursor: insights?.auditor?.report_text ? 'pointer' : 'default',
                                padding: '8px', borderRadius: 12, transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => { if(insights?.auditor?.report_text) e.currentTarget.style.background = '#f8fafc' }}
                            onMouseLeave={(e) => { if(insights?.auditor?.report_text) e.currentTarget.style.background = 'transparent' }}
                        >
                            <div style={{
                                width: 44, height: 44, background: '#fee2e2', borderRadius: 12,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                            }}>
                                🛡️
                            </div>
                            <div style={{ flex: 1, minWidth: 160 }}>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>Loss Prevention Audit</div>
                                <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                                    {insights?.auditor?.report_text
                                        ? `Audit generated · ${new Date(insights.auditor.generated_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
                                        : 'Nightly audit pending.'
                                    }
                                </div>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: insights?.auditor?.report_text ? '#f0fdf4' : '#f8fafc',
                                border: `1px solid ${insights?.auditor?.report_text ? '#bbf7d0' : '#e2e8f0'}`,
                                borderRadius: 8, padding: '8px 14px',
                            }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: insights?.auditor?.report_text ? '#22c55e' : '#94a3b8',
                                }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: insights?.auditor?.report_text ? '#15803d' : '#64748b' }}>
                                    {insights?.auditor?.report_text ? 'Audit Ready' : 'Pending'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* SECTION 2: DEEP DIVE ANALYTICS PANEL                 */}
                    {/* ══════════════════════════════════════════════════════ */}
                    <div className="aic-section" style={{
                        background: 'white', borderRadius: 16, border: '1px solid #e2e8f0',
                        marginBottom: 24, overflow: 'hidden',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                    }}>
                        {/* Panel Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #1e293b 0%, #1e3a5f 100%)',
                            padding: '18px 24px',
                            display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                            <span style={{ fontSize: 20 }}>🔬</span>
                            <div>
                                <div style={{
                                    color: 'white', fontWeight: 800, fontSize: 16,
                                    fontFamily: "'Outfit', sans-serif",
                                }}>
                                    Deep Dive Analytics
                                </div>
                                <div style={{ color: '#d8d8d8', fontSize: 12, marginTop: 2 }}>
                                    Select an ingredient below to explore its Exponentially Weighted Moving Average profile, DoW surge pattern, and multi-horizon forecast
                                </div>
                            </div>
                        </div>

                        {/* ✨ NEW: Master-Detail 2-Column Layout */}
                        <div style={{ display: 'flex' }}>
                            
                            {/* ── LEFT COLUMN: The Ingredient Menu ── */}
                            <div style={{ width: '320px', borderRight: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                
                                {/* Pinned Filter Tabs */}
                                <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#000000', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
                                        Filter By Status
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        {[
                                            { id: 'critical', label: '🔴 Critical' },
                                            { id: 'warning', label: '🟡 Warning' },
                                            { id: 'ok', label: '🟢 Healthy' }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActivePillTab(tab.id)}
                                                style={{
                                                    flex: 1, background: activePillTab === tab.id ? 'white' : 'transparent',
                                                    color: activePillTab === tab.id ? '#0f172a' : '#64748b',
                                                    border: 'none', padding: '8px 0', borderRadius: '6px',
                                                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                                                    boxShadow: activePillTab === tab.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Scrollable Ingredient List */}
                                <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', maxHeight: '680px' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#000000', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12, marginLeft: 4 }}>
                                        Select Ingredient to Analyze
                                    </div>
                                    
                                    {forecaster?.data
                                        ?.filter(i => i.status !== 'infinite' && i.status === activePillTab)
                                        .map(item => {
                                        const st = STATUS_META[item.status] || STATUS_META.ok;
                                        const isActive = item.raw_inventory_id === selectedItemId;
                                        return (
                                            <div
                                                key={item.raw_inventory_id}
                                                onClick={() => setSelectedItemId(item.raw_inventory_id)}
                                                style={{
                                                    padding: '12px 16px', marginBottom: '8px', borderRadius: '8px',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                                    background: isActive ? st.bg : 'white',
                                                    border: `1px solid ${isActive ? st.border : 'transparent'}`,
                                                    boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.02)' : 'none',
                                                    transition: 'all 0.15s'
                                                }}
                                                onMouseEnter={(e) => { if(!isActive) e.currentTarget.style.background = '#f1f5f9' }}
                                                onMouseLeave={(e) => { if(!isActive) e.currentTarget.style.background = 'white' }}
                                            >
                                                <span style={{ fontSize: '14px' }}>
                                                    {item.status === 'critical' ? '🔴' : item.status === 'warning' ? '🟡' : '🟢'}
                                                </span>
                                                <div style={{ fontWeight: 700, color: isActive ? st.color : '#334155', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.item_name}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {/* Fallback if a tab is empty */}
                                    {forecaster?.data?.filter(i => i.status === activePillTab).length === 0 && (
                                        <div style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic', padding: '16px 12px', textAlign: 'center' }}>
                                            No {activePillTab} items found.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── RIGHT COLUMN: Deep Dive Charts ── */}
                            <div style={{ flex: 1, padding: '32px 40px', background: 'white', minWidth: 0, overflowX: 'hidden' }}>
                                
                                {!hasAnalytics ? (
                                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
                                        <div style={{ fontSize: 36, marginBottom: 12 }}>
                                            {selectedItem?.status === 'infinite' ? '∞' : '📊'}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: '#64748b', marginBottom: 6 }}>
                                            {selectedItem?.status === 'infinite' ? 'No consumption data for this ingredient' : 'Select an ingredient on the left to view its analytics'}
                                        </div>
                                        <div style={{ fontSize: 13 }}>
                                            {selectedItem?.status === 'infinite' ? 'This ingredient has no recorded sales in the analysis window.' : 'EWMA convergence, DoW surge profile, and demand horizons will appear here.'}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* ── Selected Item Header ── */}
                                        <div style={{
                                            background: '#f8fafc', border: '1px solid #e2e8f0',
                                            borderRadius: 10, padding: '14px 18px', marginBottom: 20,
                                            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                                        }}>
                                            <div style={{
                                                background: STATUS_META[selectedItem.status]?.bg,
                                                border: `1px solid ${STATUS_META[selectedItem.status]?.border}`,
                                                color: STATUS_META[selectedItem.status]?.color,
                                                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 800,
                                            }}>
                                                {STATUS_META[selectedItem.status]?.label}
                                            </div>
                                            <span style={{ fontWeight: 800, fontSize: 17, color: '#0f172a' }}>
                                                {selectedItem.item_name}
                                            </span>
                                            <span style={{ color: '#94a3b8', fontSize: 13 }}>·</span>
                                            <span style={{ color: '#64748b', fontSize: 13 }}>{selectedItem.category}</span>
                                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 10, color: '#212327212327', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Current Stock</div>
                                                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{selectedItem.current_stock} {selectedItem.unit}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 10, color: '#212327', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Days Remaining</div>
                                                    <div style={{ fontWeight: 800, color: STATUS_META[selectedItem.status]?.color, fontSize: 15 }}>
                                                        {typeof selectedItem.days_remaining === 'number' ? `${selectedItem.days_remaining.toFixed(1)} days` : '∞'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Chart Grid (2 columns) ── */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                                            {/* LEFT: Day-of-Week Surge Profile */}
                                            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 16px' }}>
                                                <div style={{ marginBottom: 14 }}>
                                                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>⚡ Day-of-Week Surge Profile</div>
                                                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 3 }}>Surge index by weekday (1.0 = average demand)</div>
                                                </div>
                                                <ResponsiveContainer width="100%" height={185}>
                                                    <BarChart data={dowChartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={28}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                                        <YAxis domain={[0, dataMax => Math.max(dataMax + 0.15, 1.5)]} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} />
                                                        <Tooltip content={<DowTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                                                        <ReferenceLine y={1.0} stroke="#94a3b8" strokeDasharray="5 4" label={{ value: 'avg', position: 'insideTopRight', fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                                        <ReferenceLine y={1.15} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
                                                        <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                                                            {dowChartData.map((entry, index) => (
                                                                <Cell key={`dow-${index}`} fill={entry.isSurge ? '#f59e0b' : '#3b82f6'} opacity={entry.isSurge ? 1 : 0.75} />
                                                            ))}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                                {selectedItem.surge_days?.length > 0 && (
                                                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {selectedItem.surge_days.map(d => (
                                                            <span key={d} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>⚡ {d}</span>
                                                        ))}
                                                        {selectedItem.weekend_surge_risk && (
                                                            <span style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>🔴 Weekend Risk</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* RIGHT: Momentum + EWMA Panel */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                                {/* Momentum Velocity Badge */}
                                                <div style={{ background: trendMeta.bg, border: `1.5px solid ${trendMeta.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                                                    <div style={{ width: 52, height: 52, borderRadius: 14, background: trendMeta.color, opacity: 0.12, position: 'absolute' }} />
                                                    <div style={{ width: 52, height: 52, borderRadius: 14, border: `2px solid ${trendMeta.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: trendMeta.color, background: 'white', flexShrink: 0 }}>
                                                        {trendMeta.icon}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: trendMeta.color, marginBottom: 4 }}>Momentum Velocity</div>
                                                        <div style={{ fontWeight: 900, fontSize: 24, color: '#0f172a', letterSpacing: '-0.5px', lineHeight: 1 }}>{velocity >= 0 ? '+' : '−'}{velPct}%</div>
                                                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Demand is <strong style={{ color: trendMeta.color }}>{trendMeta.label.toLowerCase()}</strong> vs baseline</div>
                                                    </div>
                                                </div>

                                                {/* EWMA Convergence */}
                                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#212327', marginBottom: 12 }}>EWMA Convergence</div>
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <EwmaBox label="7-Day" value={selectedItem.ewma_analysis.ewma_7d} unit={selectedItem.unit + '/day'} alpha={selectedItem.ewma_analysis.alpha_short} isHighlighted={true} />
                                                        <EwmaBox label="15-Day" value={selectedItem.ewma_analysis.ewma_15d} unit={selectedItem.unit + '/day'} alpha={selectedItem.ewma_analysis.alpha_medium} isHighlighted={false} />
                                                        <EwmaBox label="30-Day" value={selectedItem.ewma_analysis.ewma_30d} unit={selectedItem.unit + '/day'} alpha={selectedItem.ewma_analysis.alpha_long} isHighlighted={false} />
                                                    </div>
                                                </div>

                                                {/* Demand Trajectory Chart */}
                                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', flex: 1 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#212327', marginBottom: 10 }}>Demand Trajectory (oldest → newest)</div>
                                                    <ResponsiveContainer width="100%" height={90}>
                                                        <BarChart data={trendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={22}>
                                                            <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                                            <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(2)} />
                                                            <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                                {trendData.map((entry, index) => (
                                                                    <Cell key={`trend-${index}`} fill={TREND_COLORS[index]} />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Prediction Horizon Cards ── */}
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#212327212327', marginBottom: 12 }}>Multi-Horizon Demand Projections</div>
                                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                                <HorizonCard label="7-Day Forecast" data={selectedItem.prediction_horizons?.h7} unit={selectedItem.unit} />
                                                <HorizonCard label="15-Day Forecast" data={selectedItem.prediction_horizons?.h15} unit={selectedItem.unit} />
                                                <HorizonCard label="30-Day Forecast" data={selectedItem.prediction_horizons?.h30} unit={selectedItem.unit} />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* SECTION 3: SUPPLY CHAIN INTELLIGENCE TABLE           */}
                    {/* ══════════════════════════════════════════════════════ */}
                    <div className="aic-section" style={{
                        background: 'white', borderRadius: 16, border: '1px solid #e2e8f0',
                        marginBottom: 24, overflow: 'hidden',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                    }}>
                        {/* Panel Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
                            padding: '18px 24px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 20 }}>📦</span>
                                <div>
                                    <div style={{ color: 'white', fontWeight: 800, fontSize: 16, fontFamily: "'Outfit', sans-serif" }}>
                                        Supply Chain — Restock Intelligence
                                    </div>
                                    <div style={{ color: '#c8e2ff', fontSize: 12, marginTop: 2 }}>
                                        {forecaster?.analysis_window_days || 180}-day demand analysis · {forecaster?.summary?.total_ingredients || 0} ingredients tracked
                                    </div>
                                </div>
                            </div>
                            
                        </div>

                        <div style={{ padding: '20px 24px' }}>

                            {/* Summary pills */}
                            {forecaster?.summary && (
                                <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'Critical',  value: forecaster.summary.critical,  ...STATUS_META.critical },
                                        { label: 'Warning',   value: forecaster.summary.warning,   ...STATUS_META.warning  },
                                        { label: 'Healthy',   value: forecaster.summary.ok,        ...STATUS_META.ok       },
                                        { label: 'No Usage',  value: forecaster.summary.infinite,  ...STATUS_META.infinite },
                                    ].map(s => (
                                        <div key={s.label} style={{
                                            background: s.bg, border: `1px solid ${s.border}`,
                                            borderRadius: 10, padding: '10px 18px',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80,
                                        }}>
                                            <span style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</span>
                                            <span style={{ fontSize: 10, color: s.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 2 }}>{s.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Filters */}
                            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    placeholder="🔍 Search ingredients…"
                                    value={searchFilter}
                                    onChange={e => { setSearchFilter(e.target.value); setCurrentPage(1); }}
                                    style={{
                                        flex: 1, minWidth: 220, padding: '9px 14px',
                                        border: '1.5px solid #e2e8f0', borderRadius: 8,
                                        fontSize: 14, outline: 'none', background: '#f8fafc', color: '#334155',
                                    }}
                                />
                                <select
                                    value={statusFilter}
                                    onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                    style={{
                                        padding: '9px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8,
                                        fontSize: 14, outline: 'none', background: '#f8fafc', color: '#334155',
                                        fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    <option value="all">All Statuses</option>
                                    <option value="critical">🔴 Critical Only</option>
                                    <option value="warning">🟡 Warning Only</option>
                                    <option value="ok">🟢 Healthy Only</option>
                                    <option value="infinite">∞ No Usage</option>
                                </select>
                            </div>

                            {/* Data Table */}
                            {tableData.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontSize: 14 }}>
                                    No ingredients match your filter.
                                </div>
                            ) : (
                                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: '#1e293b', color: 'white', textAlign: 'left' }}>
                                                {['Ingredient', 'Unit', 'Stock', 'Daily Burn Rate', 'Trend', 'Days Left', '7-Day Order', 'Status'].map(h => (
                                                    <th key={h} style={{
                                                        padding: '11px 14px', fontSize: 10, fontWeight: 700,
                                                        textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8',
                                                    }}>
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedData.map((item, idx) => {
                                                const st         = STATUS_META[item.status]    || STATUS_META.ok;
                                                const tm         = TREND_META[item.ewma_analysis?.trend_direction] || TREND_META.stable;
                                                const stock      = parseFloat(item.current_stock)  || 0;
                                                const burn       = parseFloat(item.daily_burn_rate) || 0;
                                                const orderQty   = Math.max(0, round2((burn * 7) - stock));
                                                const isSelected = item.raw_inventory_id === selectedItemId;
                                                const isEven     = idx % 2 === 0;

                                                return (
                                                    <tr
                                                        key={item.raw_inventory_id}
                                                        className={`table-row-hover${isSelected ? ' table-row-selected' : ''}`}
                                                        onClick={() => setSelectedItemId(item.raw_inventory_id)}
                                                        style={{
                                                            borderBottom: '1px solid #f1f5f9',
                                                            background: isSelected
                                                                ? '#eff6ff'
                                                                : item.status === 'critical' ? '#fef9f9'
                                                                : item.status === 'warning'  ? '#fffef7'
                                                                : isEven ? '#fafafa' : 'white',
                                                            transition: 'background 0.1s',
                                                        }}
                                                    >
                                                        {/* Ingredient */}
                                                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                                                            {item.item_name}
                                                        </td>

                                                        {/* Unit */}
                                                        <td style={{ padding: '12px 14px', color: '#94a3b8', fontSize: 11 }}>
                                                            {item.unit}
                                                        </td>

                                                        {/* Stock */}
                                                        <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 600 }}>
                                                            {stock.toFixed(1)}
                                                        </td>

                                                        {/* Burn Rate */}
                                                        <td style={{ padding: '12px 14px', color: '#334155', fontFamily: 'monospace', fontSize: 12 }}>
                                                            {burn > 0 ? `${burn.toFixed(3)}/day` : '—'}
                                                        </td>

                                                        {/* Trend indicator */}
                                                        <td style={{ padding: '12px 14px' }}>
                                                            {item.ewma_analysis?.trend_direction ? (
                                                                <span style={{
                                                                    background: tm.bg, color: tm.color,
                                                                    border: `1px solid ${tm.border}`,
                                                                    padding: '3px 9px', borderRadius: 20,
                                                                    fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                }}>
                                                                    <span style={{ fontSize: 12 }}>{tm.icon}</span>
                                                                    {(Math.abs(item.ewma_analysis.momentum_velocity) * 100).toFixed(0)}%
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                                                            )}
                                                        </td>

                                                        {/* Days Left */}
                                                        <td style={{ padding: '12px 14px', fontWeight: 800, color: st.color }}>
                                                            {typeof item.days_remaining === 'number'
                                                                ? `${item.days_remaining.toFixed(1)}d`
                                                                : '∞'}
                                                        </td>

                                                        {/* Order Qty */}
                                                        <td style={{ padding: '12px 14px', fontWeight: 700, color: orderQty > 0 ? '#1d4ed8' : '#94a3b8', fontSize: 12 }}>
                                                            {orderQty > 0 ? `${orderQty.toFixed(1)} ${item.unit}` : '—'}
                                                        </td>

                                                        {/* Status badge */}
                                                        <td style={{ padding: '12px 14px' }}>
                                                            <span style={{
                                                                background: st.bg, color: st.color,
                                                                border: `1px solid ${st.border}`,
                                                                padding: '4px 10px', borderRadius: 20,
                                                                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                                            }}>
                                                                <span style={{ marginRight: 4 }}>
                                                                    {item.status === 'critical' ? '🔴' : item.status === 'warning' ? '🟡' : item.status === 'ok' ? '🟢' : '∞'}
                                                                </span>
                                                                {st.label}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 16px', borderTop: '1px solid #f1f5f9' }}>
                                        <span style={{ fontSize: '13px', color: '#94a3b8', padding: '12px 0' }}>
                                            Showing {paginatedData.length} of {tableData.length} ingredients
                                        </span>
                                        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                                    </div>
                                </div>
                            )}

                            {/* ── Delegation Block ── */}
                            <div style={{
                                marginTop: 24, background: '#f0f9ff',
                                border: '1px solid #bae6fd', borderRadius: 12, padding: '20px 22px',
                            }}>
                                <h3 style={{ color: '#0369a1', margin: '0 0 6px 0', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span>📋</span> Approve & Delegate Restock Order
                                </h3>
                                <p style={{ color: '#0369a1', margin: '0 0 16px 0', fontSize: 13, opacity: 0.8, lineHeight: 1.6 }}>
                                    Generates a professional PDF restock order and assigns it to the selected staff member's mobile Task Inbox.
                                    Only <strong>Critical</strong> and <strong>Warning</strong> items are included.
                                </p>

                                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                    {eligibleStaff.length === 0 ? (
                                        <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 700, background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 16px', borderRadius: 8 }}>
                                            ⚠️ No eligible staff found. Enable Inventory Access for a staff member first.
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ flex: 1, minWidth: 220 }}>
                                                <label style={{
                                                    display: 'block', fontSize: 10, fontWeight: 800, color: '#0369a1',
                                                    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em',
                                                }}>
                                                    Assign To
                                                </label>
                                                <select
                                                    value={selectedStaff}
                                                    onChange={e => setSelectedStaff(e.target.value)}
                                                    style={{
                                                        width: '100%', padding: '10px 14px',
                                                        border: '1.5px solid #7dd3fc', borderRadius: 8,
                                                        fontSize: 14, fontWeight: 600, color: '#0f172a',
                                                        background: 'white', outline: 'none', cursor: 'pointer',
                                                    }}
                                                >
                                                    {eligibleStaff.map(s => (
                                                        <option key={s.id} value={s.username}>
                                                            {s.username} ({s.role.replace('_', ' ')})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div style={{ alignSelf: 'flex-end' }}>
                                                <button
                                                    className="delegate-btn"
                                                    onClick={handleDelegate}
                                                    disabled={delegating || !selectedStaff}
                                                >
                                                    {delegating ? '⏳ Generating PDF…' : 'Approve & Delegate to Staff'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer meta */}
                    {forecaster && (
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, marginBottom: 32 }}>
                            Algorithm: {forecaster.algorithm} · {forecaster.total_sales_analyzed} transactions analyzed · Generated: {new Date(forecaster.generated_at).toLocaleString()}
                        </p>
                    )}
                    
                    {/* ══════════════════════════════════════════════════════ */}
                    {/* FULL REPORT MODAL OVERLAY                              */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {activeReportModal && insights?.[activeReportModal] && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
                            zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 20, animation: 'fadeIn 0.2s ease-out'
                        }}>
                            <div style={{
                                background: 'white', borderRadius: 20, width: '100%', maxWidth: 640,
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                maxHeight: '85vh', border: '1px solid #e2e8f0'
                            }}>
                                {/* Modal Header */}
                                <div style={{
                                    padding: '24px 32px', borderBottom: '1px solid #e2e8f0',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: activeReportModal === 'financial' ? '#faf5ff' : '#fef2f2'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                        <div style={{ 
                                            fontSize: 28, background: 'white', width: 48, height: 48, 
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                            borderRadius: 14, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' 
                                        }}>
                                            {activeReportModal === 'financial' ? '📊' : '🛡️'}
                                        </div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
                                                {activeReportModal === 'financial' ? 'Executive Financial Briefing' : 'Loss Prevention Audit'}
                                            </h2>
                                            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>
                                                AI Generated on {new Date(insights[activeReportModal].generated_at).toLocaleString('en-PH')}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => setActiveReportModal(null)} style={{
                                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '50%',
                                        width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 16, color: '#64748b', cursor: 'pointer', transition: 'all 0.15s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >✕</button>
                                </div>

                                {/* Modal Body (Auto-formats AI Text) */}
                                <div style={{ padding: '32px', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
                                    {insights[activeReportModal].report_text.replace(/\$/g, '₱').split('\n\n').map((paragraph, i) => {
                                        const parts = paragraph.split(':\n');
                                        if (parts.length > 1) {
                                            return (
                                                <div key={i} style={{ marginBottom: 24, background: 'white', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                    <h4 style={{ 
                                                        margin: '0 0 10px 0', 
                                                        color: activeReportModal === 'financial' ? '#7e22ce' : '#dc2626', 
                                                        fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px',
                                                        display: 'flex', alignItems: 'center', gap: 6
                                                    }}>
                                                        {activeReportModal === 'financial' ? '✦' : '⚠️'} {parts[0]}
                                                    </h4>
                                                    <p style={{ margin: 0, color: '#334155', fontSize: 15, lineHeight: 1.7, fontWeight: 500 }}>{parts[1]}</p>
                                                </div>
                                            );
                                        }
                                        return <p key={i} style={{ margin: '0 0 16px 0', color: '#475569', fontSize: 15, lineHeight: 1.7 }}>{paragraph}</p>;
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}