import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import Sidebar from '../components/Sidebar';

export default function ChangePassword() {
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automatically clear errors and success messages when this screen loads
  useEffect(() => {
    setError('');
    setSuccess('');
  }, []);

  const handleEmailCheck = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      await api.post('/change-password-check', { email, source: 'web' });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed.');
    } finally { setIsSubmitting(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(''); setSuccess('');
    if (newPassword !== confirmPassword) return setError("New passwords do not match.");
    setIsSubmitting(true);
    try {
      const res = await api.post('/change-password-auth', { email, oldPassword, newPassword });
      setSuccess(res.data.message);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password.');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F2F5'}}>
      <Sidebar />
      <div style={{ flex: 1, padding: '40px', marginLeft: 260, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ background: 'white', padding: '36px 32px', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', width: '400px' }}>
          <h2 style={{ margin: '0 0 20px 0', color: '#0f172a' }}>Change Password</h2>
          
          {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
          {success && <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>{success}</div>}

          {step === 1 && (
            <form onSubmit={handleEmailCheck}>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Please input your email address to authenticate.</p>
              <label style={s.label}>Email Address</label>
              <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              <button disabled={isSubmitting} style={s.button}>{isSubmitting ? 'Checking...' : 'Submit'}</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handlePasswordChange}>
              <label style={s.label}>Old Password</label>
              <input style={s.input} type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required />
              
              <label style={s.label}>New Password</label>
              <input style={s.input} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength="5" maxLength="16" required />
              
              <label style={s.label}>Confirm New Password</label>
              <input style={s.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength="5" maxLength="16" required />
              
              <button disabled={isSubmitting} style={s.button}>{isSubmitting ? 'Updating...' : 'Update Password'}</button>
            </form>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
               <p style={{ color: '#475569', fontSize: '14px' }}>Your password has been changed securely.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  label: { display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' },
  input: { width: '100%', padding: '11px 14px', marginBottom: '18px', borderRadius: '8px', border: '1.5px solid #e2e8f0', boxSizing: 'border-box', fontSize: '14px', outline: 'none' },
  button: { width: '100%', padding: '12px', background: '#1e293b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }
};