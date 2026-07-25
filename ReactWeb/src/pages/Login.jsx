import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/images/DuoSync Logo.png';
import eyeIcon from '../assets/images/noun-show-eye.svg';
import eyeOffIcon from '../assets/images/noun-eye-hide.svg';
import api from '../config/api';


export default function Login() {
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [otp, setOtp]                 = useState('');
  const [showPassword, setShowPassword]               = useState(false);
  const [showNewPassword, setShowNewPassword]         = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep]               = useState(1);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp]     = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotType, setForgotType]   = useState(''); // 'username' or 'password'
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLengthValid = newPassword.length >= 8;
  const hasUppercase  = /[A-Z]/.test(newPassword);
  const hasNumber     = /[0-9]/.test(newPassword);
  const hasSpecial    = /[!@#$%^&*]/.test(newPassword);

  // Automatically clear errors and success messages when this screen loads
  useEffect(() => {
    setError('');
    setSuccess('');
  }, []);

  const navigate = useNavigate();

  const reset = (toStep) => { 
    setError(''); 
    setSuccess(''); 
    setStep(toStep); 
    // If they are going back to the main login screen, wipe the forgot password inputs
    if (toStep === 1) {
      setForgotEmail('');
      setForgotOtp('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    if (!username.trim() || !password.trim()) return setError('Fields cannot be empty.');
    setIsSubmitting(true);
    try {
      const res = await api.post('/login', { username, password, source: 'web' });
      if (res.data.role && res.data.role !== 'admin') {
          setError('Access Denied: The Web Portal is strictly for Administrators. Please use the DuoSync Mobile App.');
          setIsSubmitting(false);
          return;
      }
      if (res.data.step === 'otp_verification' || res.data.step === 'otp_required') {
        setPassword('');
        setOtp('');
        setStep(2); 
      } else {
        localStorage.setItem('jwtToken', res.data.token);
        localStorage.setItem('username', res.data.username || username);
        localStorage.setItem('role', res.data.role);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials.');
    } finally { setIsSubmitting(false); }
  };

  const handleVerifyOtp = async () => {
    if (isSubmitting) return;
    setError('');
    if (otp.length !== 6) return alert('OTP must be exactly 6 digits.');
    setIsSubmitting(true);
    try {
      const res = await api.post('/verify-login-otp', { username, otp });
      setOtp('');
      localStorage.setItem('adminAuth', 'true');
      localStorage.setItem('jwtToken', res.data.token);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid OTP';
      setOtp('');
      setError(msg);
      if (msg.includes('locked')) setTimeout(() => { setStep(1); setOtp(''); setPassword(''); }, 2000);
    } finally { setIsSubmitting(false); }
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(''); setSuccess('');
    setIsSubmitting(true);
    try {
      const res = await api.post('/forgot-request', { email: forgotEmail, type: forgotType, source: 'web' });
      setSuccess(res.data.message);
      setStep(4);
    } catch (err) {
      const msg = err.response?.data?.message || 'Error finding email.';
      setError(msg);
      if (msg.includes('locked')) setTimeout(() => { setStep(1); setForgotEmail(''); }, 2500);
    } finally { setIsSubmitting(false); }
  };

  const handleForgotVerify = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(''); setSuccess('');
    setIsSubmitting(true);
    try {
      const res = await api.post('/forgot-verify-otp', { email: forgotEmail, otp: forgotOtp });
      setForgotOtp('');
      setSuccess(res.data.message);
      if (forgotType === 'username') setStep(6); // Success screen
      else setStep(5); // Password reset screen
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid OTP.';
      setForgotOtp('');
      setError(msg);
      if (msg.includes('locked')) setTimeout(() => { setStep(1); setForgotEmail(''); setForgotOtp(''); }, 2500);
    } finally { setIsSubmitting(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(''); setSuccess('');
    if (newPassword !== confirmPassword) return setError("Passwords do not match.");
    setIsSubmitting(true);
    try {
      const res = await api.post('/forgot-reset-password', { email: forgotEmail, newPassword });
      setForgotOtp(''); setNewPassword(''); setConfirmPassword('');
      setStep(7);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password.');
    } finally { setIsSubmitting(false); }
  };

  // NEW: OTP Timer states
  const [timer, setTimer] = useState(300); // 300 seconds = 5 minutes
  const [canResend, setCanResend] = useState(false);

  // NEW: The live countdown effect
  useEffect(() => {
    let interval;
    // Only run the timer if we are on an OTP step (Step 2 or Step 4) and timer is above 0
    if ((step === 2 || step === 4) && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setCanResend(true); // Unlock the resend button when it hits 0
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  // Helper to format seconds into MM:SS (e.g., 04:59)
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Helper to restart the timer if they click "Resend"
  const handleResendOTP = async () => {
    // 1. Reset the UI immediately so the user can't spam the click button
    setTimer(300); 
    setCanResend(false);
    setError('');
    setSuccess('');

    // 2. Tell the backend to send a new email based on which step we are on
    try {
      if (step === 2) {
        // We are on the Login OTP screen, so we re-trigger the login request
        await api.post('/login', { username, password, source: 'web' });
      } else if (step === 4) {
        // We are on the Forgot Password OTP screen, so we re-trigger the forgot request
        await api.post('/forgot-request', { email: forgotEmail, type: forgotType, source: 'web' });
      }
      
      // Show a little green success message so they know it actually worked
      setSuccess('A new OTP has been sent to your email.');
      
    } catch (err) {
      // If the server crashes, show an error and let them try clicking Resend again
      setError('Failed to resend OTP. Please try again.');
      setTimer(0);
      setCanResend(true);
    }
  };

  return (
    <div style={s.container}>
      <div style={s.backgroundBlur}></div>
      <div style={s.card}>

        {step === 1 && (
          <>
            <img src={logo} alt="DuoSync Logo" style={{ width: 90, height: 90, display: 'block', margin: '0 auto 12px', borderRadius: '50%', border: '3px solid #e2e8f0' }} />
            <h2 style={{ textAlign: 'center', color: '#0f172a', margin: '0 0 6px 0', fontSize: '22px', fontWeight: '800' }}>DuoSync</h2>
            <p style={{ textAlign: 'center', color: '#64748b', margin: '0 0 24px 0', fontSize: '13px', letterSpacing: '1px'}}>Admin Dashboard</p>
          </>
        )}

        {error   && <div style={s.errorBox}>{error}</div>}

        

        {step === 1 && (
          <form onSubmit={handleLogin}>
            <label style={s.label}>Username</label>
            <input style={s.input} placeholder="e.g. admin_user" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" />
            <label style={s.label}>Password</label>
            <div style={s.passwordWrapper}>
              <input 
                style={s.passwordInput} 
                type={showPassword ? "text" : "password"} 
                placeholder="Enter your password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={s.eyeButton} tabIndex="-1">
                <img 
                  src={showPassword ? eyeOffIcon : eyeIcon} 
                  alt="Toggle Password" 
                  style={{ width: '18px', height: '18px', opacity: 0.6 }} 
                />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', marginTop: '-4px' }}>
              <p onClick={() => { setForgotType('username'); reset(3); }} style={s.link}>
                Forgot Username
              </p>
              <p onClick={() => { setForgotType('password'); reset(3); }} style={s.link}>
                Forgot Password
              </p>
            </div>
            <button disabled={isSubmitting} style={{ ...s.button, opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'SIGNING IN...' : 'LOGIN'}
            </button>
            
          </form>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ textAlign: 'center', color: '#0F172A', marginTop: 0, marginBottom: '8px' }}>Enter OTP</h3>
            <p style={{ textAlign: 'center', color: '#475569', fontSize: '14px', marginBottom: '6px' }}>A 6-digit code was sent to your email.</p>
            <label style={s.label}>Verification Code</label>
            <input 
              style={s.otpInput} 
              placeholder="000000" 
              maxLength={6} 
              value={otp} 
              onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))} 
            />
            <button disabled={isSubmitting} onClick={handleVerifyOtp} style={{ ...s.button, backgroundColor: '#0f172a', opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'VERIFYING...' : 'VERIFY OTP'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '16px 0', fontSize: '13px' }}>
              {canResend ? (
                <p onClick={handleResendOTP} style={{ ...s.link, margin: 0 }}>Didn't receive code? <b>Resend OTP</b></p>
              ) : (
                <p style={{ color: '#64748b', margin: 0 }}>
                  Code expires in <span style={{ fontWeight: 'bold', color: timer < 60 ? '#dc2626' : '#0f172a' }}>{formatTime(timer)}</span>
                </p>
              )}
            </div>

            <p onClick={() => reset(1)} style={s.link}>Back to Login</p>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleForgotRequest}>
            <h3 style={{ textAlign: 'center', color: '#0F172A', marginTop: 0, marginBottom: '8px' }}>{forgotType === 'username' ? 'Forgot Username' : 'Forgot Password'}</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Enter the email address you used for that account.</p>
            <label style={s.label}>Email Address</label>
            <input style={s.input} type="email" placeholder="Enter registered email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
            <button disabled={isSubmitting} style={{ ...s.button, backgroundColor: '#0f172a', opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'SENDING...' : 'Send Verification Code'}
            </button>
            <p onClick={() => reset(1)} style={s.link}>Back to Login</p>
          </form>
        )}

        {step === 4 && (
          <form onSubmit={handleForgotVerify}>
            <h3 style={{ textAlign: 'center', color: '#0F172A', marginTop: 0, marginBottom: '8px' }}>Enter OTP</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>An email has been sent to the given email address with the OTP. Enter it below.</p>
            <label style={s.label}>Reset Code</label>
            <input 
              style={s.otpInput} 
              placeholder="000000" 
              maxLength={6} 
              value={forgotOtp} 
              onChange={e => setForgotOtp(e.target.value.replace(/[^0-9]/g, ''))} 
              required 
            />
            <button disabled={isSubmitting} style={{ ...s.button, backgroundColor: '#0f172a', opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'VERIFYING...' : 'Verify OTP'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '16px 0', fontSize: '13px' }}>
              {canResend ? (
                <p onClick={handleResendOTP} style={{ ...s.link, margin: 0 }}>Didn't receive code? <b>Resend OTP</b></p>
              ) : (
                <p style={{ color: '#64748b', margin: 0 }}>
                  Code expires in <span style={{ fontWeight: 'bold', color: timer < 60 ? '#dc2626' : '#0f172a' }}>{formatTime(timer)}</span>
                </p>
              )}
            </div>
            
            <p onClick={() => reset(1)} style={s.link}>Cancel</p>
          </form>
        )}

        {step === 5 && (
          <form onSubmit={handleResetPassword}>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', textAlign: 'center'}}>Create a new password (5–16 characters).</p>
            <label style={s.label}>New Password</label>
            <div style={s.passwordWrapper}>
              <input 
                style={s.passwordInput} 
                type={showNewPassword ? "text" : "password"} 
                placeholder="Enter new password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                minLength="5" maxLength="16" required 
              />
              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} style={s.eyeButton} tabIndex="-1">
                <img 
                  src={showNewPassword ? eyeOffIcon : eyeIcon} 
                  alt="Toggle Password" 
                  style={{ width: '18px', height: '18px', opacity: 0.6 }} 
                />
              </button>
            </div>

            <div style={s.checklistContainer}>
              <span style={{ ...s.checklistItem, color: isLengthValid ? '#16a34a' : '#94a3b8' }}>
                {isLengthValid ? '✓' : '○'} At least 8 characters
              </span>
              <span style={{ ...s.checklistItem, color: hasUppercase ? '#16a34a' : '#94a3b8' }}>
                {hasUppercase ? '✓' : '○'} One uppercase letter
              </span>
              <span style={{ ...s.checklistItem, color: hasNumber ? '#16a34a' : '#94a3b8' }}>
                {hasNumber ? '✓' : '○'} One number
              </span>
              <span style={{ ...s.checklistItem, color: hasSpecial ? '#16a34a' : '#94a3b8' }}>
                {hasSpecial ? '✓' : '○'} (Optional) One special character (!@#$%)
              </span>
            </div>

            <label style={s.label}>Confirm New Password</label>
            <div style={s.passwordWrapper}>
              <input 
                style={s.passwordInput} 
                type={showConfirmPassword ? "text" : "password"} 
                placeholder="Confirm new password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                minLength="5" maxLength="16" required 
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={s.eyeButton} tabIndex="-1">
                <img 
                  src={showConfirmPassword ? eyeOffIcon : eyeIcon} 
                  alt="Toggle Password" 
                  style={{ width: '18px', height: '18px', opacity: 0.6 }} 
                />
              </button>
            </div>
            <button disabled={isSubmitting} style={{ ...s.button, backgroundColor: '#0f172a', opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'UPDATING...' : 'Confirm New Password'}
            </button>
            <p onClick={() => reset(1)} style={s.link}>Cancel</p>
          </form>
        )}

        {step === 6 && (
          <div>
            <p style={{ textAlign: 'center', color: '#16a34a', fontSize: '14px', fontWeight: 'bold' }}>Success!</p>
            <p style={{ textAlign: 'center', color: '#475569', fontSize: '13px', marginBottom: '20px' }}>Successfully sent the username in your registered email address.</p>
            <button onClick={() => reset(1)} style={{ ...s.button, backgroundColor: '#0f172a' }}>Back to Login</button>
          </div>
        )}

        {step === 7 && (
          <div>
            <p style={{ textAlign: 'center', color: '#16a34a', fontSize: '14px', fontWeight: 'bold' }}>Password Updated!</p>
            <p style={{ textAlign: 'center', color: '#475569', fontSize: '13px', marginBottom: '20px' }}>Your new password has been set successfully. You can now log in using your new credentials.</p>
            
            {/* This button reuses your reset() function to safely wipe everything and go back to login */}
            <button onClick={() => reset(1)} style={{ ...s.button, backgroundColor: '#0f172a' }}>
              Back to Login
            </button>
          </div>
        )}

      </div>
    </div>

    
  );
}

const s = {
  container:  { position: 'relative', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  backgroundBlur: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0F172A',
    backgroundImage: `
      radial-gradient(circle at 0% 0%, rgba(30, 58, 138, 0.4) 0%, transparent 50%),
      radial-gradient(circle at 100% 100%, rgba(15, 23, 42, 1) 0%, transparent 50%),
      radial-gradient(circle at 100% 0%, rgba(59, 130, 246, 0.15) 0%, transparent 40%)
    `,
    zIndex: -1
  },
  checklistContainer: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px', marginTop: '-10px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' },
  checklistItem:      { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s' },
  card:       { position: 'relative', padding: '36px 32px', background: 'white', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.4)', width: '380px', boxSizing: 'border-box', zIndex: 1 },
  label:      { display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px', letterSpacing: '0.03em', textTransform: 'uppercase' },
  input:      { width: '100%', padding: '11px 14px', marginBottom: '18px', borderRadius: '8px', border: '1.5px solid #e2e8f0', boxSizing: 'border-box', fontSize: '14px', color: '#0f172a', outline: 'none', background: '#f8fafc', transition: 'border-color 0.15s' },
  passwordWrapper: { position: 'relative', marginBottom: '18px', width: '100%' },
  passwordInput:   { width: '100%', padding: '11px 40px 11px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', boxSizing: 'border-box', fontSize: '14px', color: '#0f172a', outline: 'none', background: '#f8fafc', transition: 'border-color 0.15s' },
  eyeButton:       { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' },
  otpInput:   { width: '100%', padding: '14px', marginBottom: '18px', borderRadius: '8px', border: '2px solid #3b82f6', boxSizing: 'border-box', textAlign: 'center', letterSpacing: '10px', fontSize: '22px', fontWeight: 'bold', color: '#0f172a', background: '#eff6ff' },
  button:     { width: '100%', padding: '12px', background: '#0F172A', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', letterSpacing: '0.5px', marginBottom: '4px', boxShadow: '0 4px 8px rgba(37, 99, 235, 0.2)' },
  link:       { margin: '0', cursor: 'pointer', color: '#3b82f6', fontSize: '13px', fontWeight: '500', textAlign: 'center' },
  errorBox:   { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', marginBottom: '16px' },
  successBox: { background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', marginBottom: '16px' },
};