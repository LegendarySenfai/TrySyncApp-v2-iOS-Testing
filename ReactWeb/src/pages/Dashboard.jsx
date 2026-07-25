import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import Sidebar from '../components/Sidebar';

const styles = `

  .dash-root * { box-sizing: border-box; }

  .dash-root {
    background: #F0F2F5;
    min-height: 100vh;
    display: flex;
  }

  /* ── Cards ── */
  .metric-card {
    background: #ffffff;
    border-radius: 16px;
    padding: 22px 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    position: relative;
    overflow: hidden;
  }
  .metric-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.10);
  }
  .metric-card .card-accent {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 16px 16px 0 0;
  }
  .metric-card .card-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94A3B8;
    margin-bottom: 10px;
  }
  .metric-card .card-value {
    font-size: 22px;
    font-weight: 700;
    color: #0F172A;
  }
  .metric-card .card-icon {
    position: absolute;
    top: 20px; right: 20px;
    width: 36px; height: 36px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }

  /* ── Panel ── */
  .panel {
    background: #ffffff;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
  }
  .panel-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #64748B;
    margin: 0 0 20px 0;
  }

  /* ── Filter buttons ── */
  .filter-bar {
    background: #ffffff;
    border-radius: 10px;
    padding: 4px;
    display: flex;
    gap: 2px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .filter-btn {
    border: none;
    padding: 7px 14px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .filter-btn.active {
    background: #0F172A;
    color: #ffffff;
  }
  .filter-btn:not(.active) {
    background: transparent;
    color: #94A3B8;
  }
  .filter-btn:not(.active):hover {
    background: #F1F5F9;
    color: #475569;
  }

  /* ── Date input ── */
  .date-input {
    padding: 8px 12px;
    border: 1.5px solid #E2E8F0;
    border-radius: 8px;
    font-size: 13px;
    color: #334155;
    font-weight: 600;
    background: #F8FAFC;
    color-scheme: light;
    outline: none;
    transition: border-color 0.15s;
  }
  .date-input:focus { border-color: #3B82F6; }

  /* ── Top sellers ── */
  .seller-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 0;
    border-bottom: 1px solid #F1F5F9;
  }
  .seller-row:last-child { border-bottom: none; }
  .seller-rank {
    font-size: 11px;
    font-weight: 700;
    color: #0F172A;
    width: 18px;
  }
  .seller-name {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    margin-left: 8px;
  }
  .seller-badge {
    font-size: 11px;
    font-weight: 700;
    color: #10B981;
    background: #ECFDF5;
    padding: 3px 9px;
    border-radius: 20px;
  }

  /* ── Breakdown bar ── */
  .breakdown-bar {
    background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
    border-radius: 16px;
    padding: 28px 32px;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 8px 24px rgba(15,23,42,0.18);
  }
  .breakdown-stat-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #eeefef; /* FIX: Brighter silver text */
    margin-bottom: 4px;
  }
  .breakdown-stat-value {
    font-size: 18px;
    font-weight: 500;
  }
  .breakdown-divider {
    width: 1px;
    height: 48px;
    background: #334155;
    margin: 0 32px;
  }
  .breakdown-net-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .breakdown-net-value {
    font-size: 28px;
    font-weight: 700;
  }

  /* ── Page title ── */
  .page-title {
    font-size: 28px;
    font-weight: 700;
    color: #0F172A;
    margin: 0;
    letter-spacing: -0.02em;
  }

  /* ── Custom tooltip ── */
  .custom-tooltip {
    background: #0F172A;
    border-radius: 8px;
    padding: 10px 14px;
    color: white;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }

  /* ── AI Status Banner ── */
  @keyframes aiBannerPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }
  .ai-status-dot-pulse { animation: aiBannerPulse 2s ease-in-out infinite; }
  .ai-cta-btn {
    background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 12px 22px;
    font-weight: 800;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(59,130,246,0.40);
    transition: transform 0.15s, box-shadow 0.15s;
    letter-spacing: 0.1px;
  }
  .ai-cta-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 22px rgba(59,130,246,0.50);
  }
`;

// ── Custom Recharts Tooltip ──────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <div style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>{label}</div>
        <div style={{ fontWeight: 700 }}>₱ {Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      </div>
    );
  }
  return null;
};

// ── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard = ({ title, value, color, iconBg, icon, onClick }) => (
  <div className="metric-card" onClick={onClick}>
    <div className="card-accent" style={{ background: color }} />
    <div className="card-icon" style={{ background: iconBg }}>{icon}</div>
    <div className="card-label">{title}</div>
    <div className="card-value">{value}</div>
  </div>
);

// ── AI Status Dot ─────────────────────────────────────────────────────────────
const StatusDot = ({ label, active, loading }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div
      className={loading ? 'ai-status-dot-pulse' : ''}
      style={{
        width: 7, height: 7, borderRadius: '50%',
        background: loading ? '#f59e0b' : active ? '#22c55e' : '#475569',
        flexShrink: 0,
      }}
    />
    <span style={{ color: active ? '#d5d8dc' : '#475569', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  </div>
);

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate  = useNavigate();
  const profitRef = useRef(null);

  const [salesHistory, setSalesHistory] = useState([]);
  const [graphData, setGraphData]       = useState([]);
  const [topSellers, setTopSellers]     = useState([]);
  const [summary, setSummary]           = useState({
    total_revenue: 0, total_expenses: 0, total_count: 0,
    cogs: 0, store_expenses: 0, variance_loss: 0,
  });

  // ── AI Insights ──────────────────────────────────────────────────────────
  const [aiInsights, setAiInsights]         = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(true);

  const fetchAiInsights = async () => {
    try {
      const res = await api.get('/api/ai-insights/latest');
      setAiInsights(res.data);
    } catch (error) {
      console.error('Error fetching AI insights:', error);
    } finally {
      setLoadingInsights(false);
    }
  };

  const [shopFilter, setShopFilter]   = useState('all');
  const [dateFilter, setDateFilter]   = useState('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  const fetchData = async () => {
    try {
      let start = '', end = '';
      const today = new Date();

      if (dateFilter === 'today') {
        start = today.toISOString().split('T')[0];
        end   = start;
      } else if (dateFilter === 'week') {
        const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
        start = firstDay.toISOString().split('T')[0];
        end   = new Date().toISOString().split('T')[0];
      } else if (dateFilter === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        end   = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
      } else if (dateFilter === 'custom') {
        start = customStart;
        end   = customEnd;
      }

      let query = `/analytics?category=${shopFilter}`;
      if (start && end) query += `&startDate=${start}&endDate=${end}`;

      const anaRes = await api.get(query);

      const fixedHistory = anaRes.data.history.map(s => ({
        ...s,
        shop: s.category,
        time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));

      setSalesHistory(fixedHistory);
      setGraphData(anaRes.data.graphData);
      setTopSellers(anaRes.data.topSellers || []);
      setSummary({
        total_revenue:   parseFloat(anaRes.data.summary.total_revenue  || 0),
        total_expenses:  parseFloat(anaRes.data.summary.total_expenses || 0),
        total_count:     parseInt(anaRes.data.summary.total_count      || 0),
        cogs:            parseFloat(anaRes.data.summary.cogs           || 0),
        store_expenses:  parseFloat(anaRes.data.summary.store_expenses || 0),
        variance_loss:   parseFloat(anaRes.data.summary.variance_loss  || 0),
      });
    } catch (err) {
      console.error('API Error', err);
    }
  };

  useEffect(() => { fetchData(); fetchAiInsights(); }, [shopFilter, dateFilter, customStart, customEnd]);

  useEffect(() => {
    const refreshInterval = setInterval(() => { fetchData(); }, 30000);
    return () => clearInterval(refreshInterval);
  }, [shopFilter, dateFilter, customStart, customEnd]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('adminAuth');
      window.location.href = '/';
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const netProfit = summary.total_revenue - summary.total_expenses;
  const fmt       = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

  const lastUpdated = aiInsights?.forecaster?.generated_at
                   || aiInsights?.financial?.generated_at
                   || null;
  const lastUpdatedDisplay = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const hasForecaster = !!aiInsights?.forecaster?.report_text;
  const hasFinancial  = !!aiInsights?.financial?.report_text;
  const hasAuditor    = !!aiInsights?.auditor?.report_text;
  const anyReportReady = hasForecaster || hasFinancial || hasAuditor;

  return (
    <>
      <style>{styles}</style>
      <div className="dash-root">
        <Sidebar shopFilter={shopFilter} setShopFilter={setShopFilter} />

        <div style={{ flex: 1, padding: '28px 32px', marginLeft: 260, maxWidth: 'calc(100% - 260px)' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <p style={{ margin: '0 0 2px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8' }}>
                Overview
              </p>
              <h1 className="page-title">
                {shopFilter === 'all'
                  ? 'Executive Dashboard'
                  : shopFilter.charAt(0).toUpperCase() + shopFilter.slice(1) + ' Analytics'}
              </h1>
            </div>

            <div className="filter-bar">
              {['all_time', 'today', 'week', 'month', 'custom'].map(time => (
                <button
                  key={time}
                  className={`filter-btn${dateFilter === time ? ' active' : ''}`}
                  onClick={() => setDateFilter(time)}
                >
                  {time.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date range */}
          {dateFilter === 'custom' && (
            <div style={{
              background: 'white', padding: '14px 20px', borderRadius: 12, marginBottom: 24,
              display: 'flex', gap: 12, alignItems: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Range</span>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="date-input" />
              <span style={{ color: '#CBD5E1', fontWeight: 600 }}>→</span>
              <input type="date" value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   className="date-input" />
            </div>
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* AI INTELLIGENCE STATUS BANNER                       */}
          {/* ════════════════════════════════════════════════════ */}
          <div style={{
            background: 'linear-gradient(145deg, #050d1f 0%, #0d1f3c 55%, #0f2a50 100%)',
            borderRadius: 16, padding: '22px 28px', marginBottom: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
            boxShadow: '0 8px 32px rgba(5,13,31,0.22)',
            position: 'relative', overflow: 'hidden',
          }}>

            {/* Subtle dot-grid decoration */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.18) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }} />

            {/* Left: Icon + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1, minWidth: 0 }}>
              <div style={{
                width: 48, height: 48, background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>
                🤖
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, letterSpacing: '-0.2px' }}>
                  AI Intelligence Engine
                </div>
                <div style={{ color: '#d5d8dc', fontSize: 12, marginTop: 3 }}>
                  {loadingInsights
                    ? 'Syncing with AI engine…'
                    : anyReportReady
                      ? `Reports ready${lastUpdatedDisplay ? ` · Updated ${lastUpdatedDisplay}` : ''}`
                      : 'Awaiting first report generation'
                  }
                </div>
              </div>
            </div>

            {/* Center: Report status dots */}
            <div style={{
              display: 'flex', gap: 20, position: 'relative', zIndex: 1,
              flexShrink: 0,
            }}>
              <StatusDot label="Supply Chain"   active={hasForecaster} loading={loadingInsights} />
              <StatusDot label="CFO Report"     active={hasFinancial}  loading={loadingInsights} />
              <StatusDot label="Loss Prevention" active={hasAuditor}   loading={loadingInsights} />
            </div>

            {/* Right: CTA */}
            <button
              className="ai-cta-btn"
              onClick={() => navigate('/ai-control')}
              style={{ position: 'relative', zIndex: 1 }}
            >
              Open AI Control Center
            </button>
          </div>
          {/* ════════════════════════════════════════════════════ */}

          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginBottom: 24 }}>
            <MetricCard title="Gross Sales"          value={`₱ ${fmt(summary.total_revenue)}`}  color="#3B82F6" iconBg="#EFF6FF" icon="💰" onClick={() => profitRef.current.scrollIntoView({ behavior: 'smooth' })} />
            <MetricCard title="Total Expenses (COGS)" value={`₱ ${fmt(summary.total_expenses)}`} color="#EF4444" iconBg="#FEF2F2" icon="📉" />
            <MetricCard title="Net Profit"            value={`₱ ${fmt(netProfit)}`}              color="#10B981" iconBg="#ECFDF5" icon="💎" onClick={() => profitRef.current.scrollIntoView({ behavior: 'smooth' })} />
            <MetricCard title="Transactions"          value={summary.total_count}                color="#8B5CF6" iconBg="#F5F3FF" icon="🧾" onClick={() => navigate('/transactions')} />
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, marginBottom: 24 }}>
            <div className="panel">
              <p className="panel-title">Revenue Trends</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={graphData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="sales" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="panel">
              <p className="panel-title">Top Selling Products</p>
              {topSellers.map((item, i) => (
                <div key={i} className="seller-row">
                  <span className="seller-rank">{i + 1}</span>
                  <span className="seller-name">{item.name}</span>
                  <span className="seller-badge">{item.qty} sold</span>
                </div>
              ))}
              {topSellers.length === 0 && (
                <div style={{ color: '#CBD5E1', textAlign: 'center', marginTop: 32, fontSize: 13 }}>No sales data.</div>
              )}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div ref={profitRef} className="breakdown-bar">
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', marginBottom: 4 }}>Financial Breakdown</div>
              <div style={{ fontSize: 12, color: '#bfc9d7', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                Reviewing <strong style={{ color: '#F8FAFC' }}>{dateFilter.replace('_', ' ')}</strong> data for <strong style={{ color: '#94A3B8' }}>{shopFilter.toUpperCase()}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ textAlign: 'right' }}>
                <div className="breakdown-stat-label">Gross Sales</div>
                <div className="breakdown-stat-value" style={{ color: '#60A5FA' }}>₱ {fmt(summary.total_revenue)}</div>
              </div>

              <div className="breakdown-divider" style={{ margin: '0 10px' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px' }}>
                  <span style={{ fontSize: '11px', color: 'rgb(231, 233, 234)', fontWeight: 600, textTransform: 'uppercase' }}>Ingredient Cost (COGS)</span>
                  <span style={{ fontSize: '12px', color: '#F87171', fontWeight: 700, width: '110px', textAlign: 'left', whiteSpace: 'nowrap' }}>− ₱ {fmt(summary.cogs)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px' }}>
                  <span style={{ fontSize: '11px', color: 'rgb(231, 233, 234)', fontWeight: 600, textTransform: 'uppercase' }}>Logged Store Expenses</span>
                  <span style={{ fontSize: '12px', color: '#F87171', fontWeight: 700, width: '110px', textAlign: 'left', whiteSpace: 'nowrap' }}>− ₱ {fmt(summary.store_expenses)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '300px' }}>
                  <span style={{ fontSize: '11px', color: 'rgb(231, 233, 234)', fontWeight: 600, textTransform: 'uppercase' }}>Z-Reading Variance Loss</span>
                  <span style={{ fontSize: '12px', color: '#F87171', fontWeight: 700, width: '110px', textAlign: 'left', whiteSpace: 'nowrap' }}>− ₱ {fmt(summary.variance_loss)}</span>
                </div>
              </div>

              <div className="breakdown-divider" style={{ margin: '0 10px' }} />

              <div style={{ textAlign: 'right' }}>
                <div className="breakdown-net-label" style={{ color: netProfit >= 0 ? '#10B981' : '#EF4444' }}>Final Net Profit</div>
                <div className="breakdown-net-value" style={{ color: netProfit >= 0 ? '#34D399' : '#F87171' }}>₱ {fmt(netProfit)}</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}