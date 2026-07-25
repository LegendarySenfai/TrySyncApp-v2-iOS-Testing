import React, { useState } from 'react';
import api from '../config/api';

/**
 * Phase 2 — CreateAccountAdmin
 * Removed: OTP step, password field
 * Added:   Email required; backend generates and emails a secure activation link.
 */
export default function CreateAccountAdmin({ onAccountCreated, onCancel }) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name:  '',
    email:      '',
    username:   '',
    role:       'milktea_staff',
  });
  const [status, setStatus]             = useState(null); // { type: 'success'|'error', message }
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatus(null);
    setIsSubmitting(true);
    try {
      const res = await api.post('/admin/create-account', formData);
      setStatus({ type: 'success', message: res.data.message });
      if (onAccountCreated) setTimeout(() => onAccountCreated(), 2200);
    } catch (err) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Failed to create account.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = [
    { value: 'milktea_staff', label: '🧋 Milktea Staff' },
    { value: 'laundry_staff', label: '🧺 Laundry Staff'  },
    { value: 'admin',         label: '🛡️ Admin'          },
  ];

  const isSuccess = status?.type === 'success';

  return (
    <div style={{ backgroundColor:'white', borderRadius:'12px', boxShadow:'0 10px 25px rgba(0,0,0,0.18)', border:'1px solid #e2e8f0', overflow:'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background:'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', padding:'24px 28px' }}>
        <h2 style={{ color:'#fff', margin:'0 0 5px 0', fontSize:'18px', fontWeight:'800' }}>Create Staff Account</h2>
        <p style={{ color:'#94a3b8', margin:0, fontSize:'13px', lineHeight:'1.5' }}>
          No password needed from you. The staff member will receive a private email link to set their own password.
        </p>
      </div>

      {/* ── Status Banner ── */}
      {status && (
        <div style={{
          padding:'13px 28px', fontSize:'13px', fontWeight:'600', lineHeight:'1.5',
          background: isSuccess ? '#f0fdf4' : '#fef2f2',
          borderBottom: `1px solid ${isSuccess ? '#86efac' : '#fca5a5'}`,
          color: isSuccess ? '#16a34a' : '#dc2626',
        }}>
          {isSuccess ? '✅ ' : '❌ '}{status.message}
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} style={{ padding:'20px 28px 28px' }}>

        {/* ── Name Row ── */}
        <div style={{ display:'flex', gap:'12px' }}>
          <div style={{ flex:1 }}>
            <label style={lbl}>First Name</label>
            <input name="first_name" required placeholder="e.g. Juan"
              value={formData.first_name} onChange={handleChange} style={inp} />
          </div>
          <div style={{ flex:1 }}>
            <label style={lbl}>Last Name</label>
            <input name="last_name" required placeholder="e.g. Dela Cruz"
              value={formData.last_name} onChange={handleChange} style={inp} />
          </div>
        </div>

        {/* ── Email ── */}
        <label style={lbl}>
          Email Address <span style={{ color:'#ef4444' }}>*</span>
          <span style={{ color:'#94a3b8', fontWeight:'400', textTransform:'none', marginLeft:'6px', fontSize:'10px' }}>
            — activation link will be sent here
          </span>
        </label>
        <input name="email" type="email" required placeholder="staff@example.com"
          value={formData.email} onChange={handleChange} style={inp} />

        {/* ── Username ── */}
        <label style={lbl}>Username <span style={{ color:'#ef4444' }}>*</span></label>
        <input name="username" required placeholder="Choose a login username" autoCapitalize="none"
          value={formData.username} onChange={handleChange} style={inp} />

        {/* ── Role ── */}
        <label style={lbl}>Role / Access Level</label>
        <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
          {roleOptions.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => setFormData({ ...formData, role: opt.value })}
              style={{
                flex:1, padding:'10px 4px', borderRadius:'8px', cursor:'pointer',
                fontSize:'12px', fontWeight:'600', transition:'all 0.15s',
                border: formData.role === opt.value ? '2px solid #1e293b' : '2px solid #e2e8f0',
                background: formData.role === opt.value ? '#1e293b' : '#fff',
                color: formData.role === opt.value ? '#fff' : '#475569',
              }}
            >{opt.label}</button>
          ))}
        </div>

        {/* ── How It Works callout ── */}
        <div style={{ background:'#f8fafc', border:'1px dashed #cbd5e1', borderRadius:'8px', padding:'12px 14px', marginBottom:'20px' }}>
          <p style={{ margin:0, fontSize:'12px', color:'#64748b', lineHeight:'1.7' }}>
            <strong style={{ color:'#475569' }}>How it works:</strong> DuoSync will email{' '}
            <strong style={{ color:'#3b82f6' }}>{formData.email || 'the staff member'}</strong> a secure
            one-time activation link. They click it, set their password, and their account becomes active automatically.
            No OTP required on your end.
          </p>
        </div>

        {/* ── Buttons ── */}
        <div style={{ display:'flex', gap:'10px' }}>
          <button type="submit" disabled={isSubmitting || isSuccess}
            style={{
              flex:2, padding:'13px',
              background: isSuccess ? '#10b981' : '#1e293b',
              color:'white', border:'none', borderRadius:'8px',
              cursor: (isSubmitting || isSuccess) ? 'default' : 'pointer',
              fontWeight:'700', fontSize:'14px',
              opacity: isSubmitting ? 0.7 : 1,
            }}>
            {isSubmitting ? 'Sending...' : isSuccess ? 'Activation Email Sent!' : 'Create & Send Activation Link'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}
              style={{ flex:1, padding:'13px', background:'#94a3b8', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'14px' }}>
              Cancel
            </button>
          )}
        </div>

      </form>
    </div>
  );
}

const lbl = {
  display:'block', fontSize:'11px', fontWeight:'700', color:'#475569',
  marginBottom:'6px', marginTop:'16px', textTransform:'uppercase', letterSpacing:'0.04em',
};
const inp = {
  width:'100%', padding:'11px 14px', border:'1.5px solid #e2e8f0',
  borderRadius:'8px', fontSize:'14px', color:'#0f172a', background:'#f8fafc',
  outline:'none', boxSizing:'border-box',
};