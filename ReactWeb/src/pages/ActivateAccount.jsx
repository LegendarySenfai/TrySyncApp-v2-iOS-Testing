import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../config/api';
import eyeIcon    from '../assets/images/noun-show-eye.svg';
import eyeOffIcon from '../assets/images/noun-eye-hide.svg';

export default function ActivateAccount() {
  const { token } = useParams();
  const navigate  = useNavigate();

  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage]                 = useState('');
  const [error, setError]                     = useState('');
  const [isSubmitting, setIsSubmitting]       = useState(false);

  // ── Eye toggle states ──────────────────────────────────────────────────
  const [showNewPassword, setShowNewPassword]         = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Password requirement checks (same as login.jsx) ───────────────────
  const isLengthValid = newPassword.length >= 8;
  const hasUppercase  = /[A-Z]/.test(newPassword);
  const hasNumber     = /[0-9]/.test(newPassword);
  const hasSpecial    = /[!@#$%^&*]/.test(newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!isLengthValid) return setError('Password must be at least 8 characters long.');
    if (!hasUppercase)  return setError('Password must contain at least one uppercase letter.');
    if (!hasNumber)     return setError('Password must contain at least one number.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');

    setIsSubmitting(true);
    try {
      await api.post('/activate', { token, newPassword });
      setMessage('Account successfully activated! Redirecting to login...');
      setTimeout(() => navigate('/'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to activate account. The link may be invalid or expired.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (message) {
  return (
    <div style={styles.container}>
      <div style={styles.backgroundBlur}></div>
      <div style={{ ...styles.card, textAlign: 'center' }}>

        <div style={styles.successIcon}>
          <img src={eyeIcon} alt="" style={{ width: 0 }} /> {/* keeps imports alive */}
          ✓
        </div>

        <h2 style={styles.title}>Account Activated!</h2>
        <p style={styles.subtitle}>
          Your password has been set successfully. You can now log in with your new credentials.
        </p>

        <div style={styles.successBox}>{message}</div>

        <button
          onClick={() => navigate('/')}
          style={styles.button}
        >
          Proceed to Login →
        </button>

      </div>
    </div>
  );
}

  return (
    <div style={styles.container}>
      <div style={styles.backgroundBlur}></div>
      <div style={styles.card}>
        <h2 style={styles.title}>Activate Account</h2>
        <p style={styles.subtitle}>Welcome to DuoSync! Please set your secure password to activate your staff profile.</p>

        {error   && <div style={styles.errorBox}>{error}</div>}
        {message && <div style={styles.successBox}>{message}</div>}

        <form onSubmit={handleSubmit}>

          {/* ── New Password ── */}
          <label style={styles.label}>New Password</label>
          <div style={styles.passwordWrapper}>
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={styles.passwordInput}
              placeholder="Enter new password"
              required
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              style={styles.eyeButton}
              tabIndex="-1"
            >
              <img
                src={showNewPassword ? eyeOffIcon : eyeIcon}
                alt="Toggle Password"
                style={{ width: '18px', height: '18px', opacity: 0.6 }}
              />
            </button>
          </div>

          {/* ── Requirements Checklist ── */}
          <div style={styles.checklistContainer}>
            <span style={{ ...styles.checklistItem, color: isLengthValid ? '#16a34a' : '#94a3b8' }}>
              {isLengthValid ? '✓' : '○'} At least 8 characters
            </span>
            <span style={{ ...styles.checklistItem, color: hasUppercase ? '#16a34a' : '#94a3b8' }}>
              {hasUppercase ? '✓' : '○'} One uppercase letter
            </span>
            <span style={{ ...styles.checklistItem, color: hasNumber ? '#16a34a' : '#94a3b8' }}>
              {hasNumber ? '✓' : '○'} One number
            </span>
            <span style={{ ...styles.checklistItem, color: hasSpecial ? '#16a34a' : '#94a3b8' }}>
              {hasSpecial ? '✓' : '○'} (Optional) One special character (!@#$%)
            </span>
          </div>

          {/* ── Confirm Password ── */}
          <label style={styles.label}>Confirm Password</label>
          <div style={styles.passwordWrapper}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={styles.passwordInput}
              placeholder="Re-type new password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeButton}
              tabIndex="-1"
            >
              <img
                src={showConfirmPassword ? eyeOffIcon : eyeIcon}
                alt="Toggle Password"
                style={{ width: '18px', height: '18px', opacity: 0.6 }}
              />
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !!message}
            style={{ ...styles.button, opacity: (isSubmitting || message) ? 0.7 : 1 }}
          >
            {isSubmitting ? 'Activating...' : 'Activate & Save Password'}
          </button>

        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative', minHeight: '100vh',
    display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  backgroundBlur: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0F172A',
    backgroundImage: `
      radial-gradient(circle at 0% 0%, rgba(30, 58, 138, 0.4) 0%, transparent 50%),
      radial-gradient(circle at 100% 100%, rgba(15, 23, 42, 1) 0%, transparent 50%),
      radial-gradient(circle at 100% 0%, rgba(59, 130, 246, 0.15) 0%, transparent 40%)
    `,
    zIndex: -1,
  },
  card: {
    position: 'relative', padding: '40px', background: 'white',
    borderRadius: '16px', width: '400px', boxSizing: 'border-box',
    boxShadow: '0 2px 4px rgba(0,0,0,0.4)', zIndex: 1,
  },
  title:    { margin: '0 0 8px 0', fontSize: '24px', color: '#0f172a', textAlign: 'center', fontWeight: '800' },
  subtitle: { margin: '0 0 24px 0', fontSize: '13px', color: '#64748b', textAlign: 'center', lineHeight: '1.5' },
  label:    { display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' },

  // ── Password field with eye button ──
  passwordWrapper: { position: 'relative', marginBottom: '18px', width: '100%' },
  passwordInput:   { width: '100%', padding: '11px 40px 11px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', boxSizing: 'border-box', fontSize: '14px', color: '#0f172a', outline: 'none', background: '#f8fafc', transition: 'border-color 0.15s' },
  eyeButton:       { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' },

  // ── Checklist ──
  checklistContainer: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px', marginTop: '-10px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' },
  checklistItem:      { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s' },

  button:     { width: '100%', padding: '12px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' },
  errorBox:   { padding: '12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', textAlign: 'center', fontWeight: '600' },
  successBox: { padding: '12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', textAlign: 'center', fontWeight: '600' },
  successIcon: {
  width: '72px', height: '72px', borderRadius: '50%',
  background: '#f0fdf4', border: '2px solid #bbf7d0',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 20px', fontSize: '32px', color: '#16a34a',
},
};