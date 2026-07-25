import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';

export default function Register() {
  const [formData, setFormData]     = useState({ username: '', password: '', email: '', role: 'admin' });
  const [step, setStep]             = useState(1);
  const [otp, setOtp]               = useState('');
  const [error, setError]           = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const isLengthValid = formData.password.length >= 5 && formData.password.length <= 16;

  const handleRegister = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    if (!isLengthValid) { setError('Please meet password requirements.'); return; }
    setIsSubmitting(true);
    try {
      await api.post('/register', formData);
      alert('Ask Main Owner for Approval OTP (Check Console)');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed');
    } finally { setIsSubmitting(false); }
  };

  const handleVerify = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post('/verify-register', { username: formData.username, otp });
      alert('Verified! Please Login.');
      navigate('/');
    } catch (err) {
      setError('Invalid OTP Code');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h2 style={{ textAlign: 'center', color: '#0f172a', marginTop: 0, marginBottom: '24px', fontWeight: '800' }}>Register Admin Account</h2>

        {error && <div style={s.errorBox}>{error}</div>}

        {step === 1 ? (
          <form onSubmit={handleRegister}>
            <label style={s.label}>Username</label>
            <input
              style={s.input} placeholder="Choose a username" maxLength={16}
              onChange={e => setFormData({ ...formData, username: e.target.value })}
            />

            <label style={s.label}>Email Address</label>
            <input
              style={s.input} type="email" placeholder="your@email.com" maxLength={50}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />

            <label style={s.label}>Password</label>
            <input
              style={s.input} type="password" placeholder="5 to 16 characters" maxLength={16}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />

            {/* Password strength indicator */}
            <div style={{ marginBottom: '20px', fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ color: isLengthValid ? '#16a34a' : '#dc2626', fontWeight: '700' }}>
                {isLengthValid ? '✅' : '❌'} 5 to 16 characters
              </span>
            </div>

            <button disabled={isSubmitting} style={{ ...s.button, opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'REQUESTING...' : 'REQUEST ACCOUNT'}
            </button>
          </form>
        ) : (
          <div>
            <p style={{ color: '#475569', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
              Enter the 6-digit approval code provided by the system owner.
            </p>
            <label style={s.label}>Approval OTP</label>
            <input
              style={{ ...s.input, textAlign: 'center', letterSpacing: '8px', fontSize: '20px', fontWeight: 'bold' }}
              placeholder="000000" maxLength={6}
              onChange={e => setOtp(e.target.value)}
            />
            <button disabled={isSubmitting} onClick={handleVerify} style={{ ...s.button, backgroundColor: '#27ae60', opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'VERIFYING...' : 'VERIFY & CREATE'}
            </button>
            <p onClick={() => setStep(1)} style={s.link}>← Back</p>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' },
  card:      { padding: '36px 32px', background: 'white', borderRadius: '16px', width: '420px', boxSizing: 'border-box', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' },
  label:     { display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' },
  input:     { width: '100%', padding: '11px 14px', marginBottom: '16px', borderRadius: '8px', border: '1.5px solid #e2e8f0', boxSizing: 'border-box', fontSize: '14px', color: '#0f172a', outline: 'none', background: '#f8fafc' },
  button:    { width: '100%', padding: '12px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' },
  link:      { textAlign: 'center', marginTop: '14px', cursor: 'pointer', color: '#3b82f6', fontSize: '13px', fontWeight: '500' },
  errorBox:  { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', marginBottom: '16px' },
};