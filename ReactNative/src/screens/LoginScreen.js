import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Platform, SafeAreaView, KeyboardAvoidingView, Image, Modal } from 'react-native';
import { useAuth } from '../context/AuthContext';
import EyeIcon    from '../../assets/images/noun-show-eye.svg';
import EyeOffIcon from '../../assets/images/noun-eye-hide.svg';
import api from '../config/api';


export default function LoginScreen({ navigation }) {
  const { login, finalizeLogin } = useAuth();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [step, setStep] = useState(1);
  const [otpInput, setOtpInput] = useState('');
  const [tempUser, setTempUser] = useState('');

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotType, setForgotType] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '' });

  const [showNewPassword, setShowNewPassword]         = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [timer, setTimer]       = useState(300);
  const [canResend, setCanResend] = useState(false);

  const isLengthValid = newPassword.length >= 8;
  const hasUppercase  = /[A-Z]/.test(newPassword);
  const hasNumber     = /[0-9]/.test(newPassword);
  const hasSpecial    = /[!@#$%^&*]/.test(newPassword);

  const showAlert = (title, message) => {
    setModalContent({ title, message });
    setModalVisible(true);
  };

  const reset = (toStep) => {
    setStep(toStep);
    if (toStep === 1) {
      setForgotEmail('');
      setForgotOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setOtpInput('');
      setPassword('');
    }
  };

  const handleLogin = async () => {
    const cleanUser = username.trim();
    if (!cleanUser || !password.trim()) {
        showAlert("Validation Error", "Please enter your credentials.");
        return;
    }
    const originalAlert = global.alert;
    let interceptedMessage = null;
    global.alert = (msg) => { interceptedMessage = msg; };

    setLoading(true);
    const result = await login(cleanUser, password);
    setLoading(false);

    global.alert = originalAlert;

    if (interceptedMessage) {
    showAlert("Login Error", interceptedMessage.replace("Login Error: ", ""));
    return;
  }
    
    if (result && result.status === 'OTP_REQUIRED') {
      setPassword('');
      setStep(2);
      setTempUser(result.username);
      showAlert("Security", "Verification code sent to email.");
    }
  };

  const handleVerifyOtp = async () => {
    const cleanOtp = String(otpInput).replace(/[^0-9]/g, '');
    
    if (cleanOtp.length !== 6) {
      showAlert("Invalid Code", "OTP must be exactly 6 digits.");
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.post('/verify-login-otp', { username: tempUser, otp: cleanOtp });
      setOtpInput('');
      finalizeLogin(tempUser, response.data.role, response.data.token, response.data.inventory_access);
    } catch (error) {
      const msg = error.response?.data?.message || "Invalid Code";
      showAlert("Access Denied", msg);
      
      if (msg.toLowerCase().includes("locked") || msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("terminated")) {
        reset(1); 
        setPassword('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async () => {
    const cleanEmail = forgotEmail.trim();
    if (!cleanEmail) return showAlert("Error", "Please enter your email address.");
    setLoading(true);
    try {
      const res = await api.post('/forgot-request', { email: cleanEmail, type: forgotType, source: 'mobile' });
      showAlert("Success", res.data.message);
      setStep(4);
    } catch (err) {
      const msg = err.response?.data?.message || 'Error finding email.';
      showAlert("Error", msg);
      if (msg.toLowerCase().includes('locked')) reset(1);
    } finally { setLoading(false); }
  };

  const handleForgotVerify = async () => {
    const cleanOtp = String(forgotOtp).replace(/[^0-9]/g, '');
    if (cleanOtp.length !== 6) return showAlert("Error", "OTP must be exactly 6 digits.");
    setLoading(true);
    try {
      const res = await api.post('/forgot-verify-otp', { email: forgotEmail.trim(), otp: cleanOtp });
      setForgotOtp('');
      showAlert("Success", res.data.message);
      if (forgotType === 'username') setStep(6);
      else setStep(5);
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid OTP.';
      showAlert("Error", msg);
      if (msg.toLowerCase().includes('locked')) reset(1);
    } finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) return showAlert("Error", "Passwords do not match.");
    if (newPassword.length < 5) return showAlert("Error", "Password must be at least 8 characters.");
    setLoading(true);
    try {
      const res = await api.post('/forgot-reset-password', { email: forgotEmail.trim(), newPassword });
      showAlert("Success", res.data.message);
      setNewPassword('');
      setConfirmPassword('');
      setForgotEmail('');
      setPassword('');
      setUsername('');
      reset(1);
    } catch (err) {
      showAlert("Error", err.response?.data?.message || 'Failed to reset password.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let interval;
    if (step === 4 && timer > 0) {
      interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    } else if (timer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  // Reset timer whenever we arrive at step 4
  useEffect(() => {
    if (step === 4) {
      setTimer(300);
      setCanResend(false);
    }
  }, [step]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleResendOTP = async () => {
    setTimer(300);
    setCanResend(false);
    try {
      await api.post('/forgot-request', { email: forgotEmail.trim(), type: forgotType, source: 'mobile' });
      showAlert('Success', 'A new OTP has been sent to your email.');
    } catch {
      showAlert('Error', 'Failed to resend OTP. Please try again.');
      setTimer(0);
      setCanResend(true);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        
        {step === 1 && (
          <View style={styles.header}>
            <Image 
              source={require('../../assets/images/DuoSync Logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>DuoSync</Text>
            <Text style={styles.subtitle}>The Meet Up Hub • POS</Text>
          </View>
        )}

        {step === 1 && (
          <View style={styles.form}>
            <Text style={styles.label}>Username</Text>
            <TextInput 
              placeholder="Enter your username" 
              placeholderTextColor="#94A3B8"
              style={styles.input} 
              value={username} 
              onChangeText={setUsername} 
              autoCapitalize="none"
            />
            
            <Text style={styles.label}>Password</Text>
            <TextInput 
              placeholder="Enter your password" 
              placeholderTextColor="#94A3B8"
              style={styles.input} 
              secureTextEntry 
              value={password} 
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => { setForgotType('password'); reset(3); }} style={{ alignItems: 'flex-end', marginBottom: 16 }}>
              <Text style={styles.linkText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'SIGNING IN...' : 'LOGIN'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setForgotType('username'); reset(3); }} style={{ alignItems: 'center', marginTop: 24 }}>
              <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '500' }}>Forgot Username?</Text>
            </TouchableOpacity>

            
          </View>
        )}

        {step === 2 && (
          <View style={styles.form}>
            <Text style={styles.otpHeader}>Security Verification</Text>
            <Text style={styles.otpSubheader}>Enter the 6-digit code sent to your email.</Text>
            
            <TextInput 
              placeholder="000000" 
              style={styles.otpInput} 
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              value={otpInput} 
              onChangeText={setOtpInput} 
              maxLength={6} 
            />
            
            <TouchableOpacity style={[styles.button, {backgroundColor: '#059669'}, loading && { opacity: 0.7 }]} onPress={handleVerifyOtp} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'VERIFYING...' : 'VERIFY & ACCESS'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.cancelButton} onPress={() => reset(1)}>
              <Text style={styles.cancelText}>Back to login</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && (
          <View style={styles.form}>
            <Text style={styles.otpHeader}>Recover Account</Text>
            <Text style={styles.otpSubheader}>Enter your registered email address.</Text>
            <Text style={styles.label}>Email Address</Text>
            <TextInput 
              placeholder="Enter your email" 
              placeholderTextColor="#94A3B8"
              style={styles.input} 
              value={forgotEmail} 
              onChangeText={setForgotEmail} 
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity style={[styles.button, {backgroundColor: '#0F172A'}, loading && { opacity: 0.7 }]} onPress={handleForgotRequest} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'SENDING...' : 'SEND VERIFICATION CODE'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => reset(1)}>
              <Text style={styles.cancelText}>Back to login</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 4 && (
          <View style={styles.form}>
            <Text style={styles.otpHeader}>Verify Email</Text>
            <Text style={styles.otpSubheader}>Enter the 6-digit code sent to your email.</Text>
            <TextInput 
              placeholder="000000" 
              style={styles.otpInput} 
              keyboardType="number-pad"
              value={forgotOtp} 
              onChangeText={setForgotOtp} 
              maxLength={6} 
            />
            <TouchableOpacity style={[styles.button, {backgroundColor: '#059669'}, loading && { opacity: 0.7 }]} onPress={handleForgotVerify} disabled={loading}>
      <Text style={styles.buttonText}>{loading ? 'VERIFYING...' : 'VERIFY OTP'}</Text>
    </TouchableOpacity>

    <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
      {canResend ? (
        <TouchableOpacity onPress={handleResendOTP}>
          <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>
            Didn't receive code? <Text style={{ fontWeight: '700' }}>Resend OTP</Text>
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ fontSize: 13, color: '#64748B' }}>
          Code expires in{' '}
          <Text style={{ fontWeight: '700', color: timer < 60 ? '#dc2626' : '#0f172a' }}>
            {formatTime(timer)}
          </Text>
        </Text>
      )}
    </View>

    <TouchableOpacity style={styles.cancelButton} onPress={() => reset(1)}>
      <Text style={styles.cancelText}>Cancel</Text>
    </TouchableOpacity>
          </View>
        )}

        {step === 5 && (
  <View style={styles.form}>
    <Text style={styles.otpHeader}>Create New Password</Text>
    <Text style={styles.otpSubheader}>Must be 8 to 16 characters long.</Text>

    <Text style={styles.label}>New Password</Text>
    <View style={styles.passwordWrapper}>
      <TextInput
        placeholder="Enter new password"
        placeholderTextColor="#94A3B8"
        style={styles.passwordInput}
        secureTextEntry={!showNewPassword}
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
  {showNewPassword
    ? <EyeOffIcon width={18} height={18} opacity={0.6} />
    : <EyeIcon    width={18} height={18} opacity={0.6} />}
</TouchableOpacity>
    </View>

    {/* ── Requirements Checklist ── */}
    <View style={styles.checklistContainer}>
      <Text style={[styles.checklistItem, { color: isLengthValid ? '#16a34a' : '#94a3b8' }]}>
        {isLengthValid ? '✓' : '○'}  At least 5 characters
      </Text>
      <Text style={[styles.checklistItem, { color: hasUppercase ? '#16a34a' : '#94a3b8' }]}>
        {hasUppercase ? '✓' : '○'}  One uppercase letter
      </Text>
      <Text style={[styles.checklistItem, { color: hasNumber ? '#16a34a' : '#94a3b8' }]}>
        {hasNumber ? '✓' : '○'}  One number
      </Text>
      <Text style={[styles.checklistItem, { color: hasSpecial ? '#16a34a' : '#94a3b8' }]}>
        {hasSpecial ? '✓' : '○'}  (Optional) One special character (!@#$%)
      </Text>
    </View>

    <Text style={styles.label}>Confirm Password</Text>
    <View style={styles.passwordWrapper}>
      <TextInput
        placeholder="Confirm new password"
        placeholderTextColor="#94A3B8"
        style={styles.passwordInput}
        secureTextEntry={!showConfirmPassword}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
  {showConfirmPassword
    ? <EyeOffIcon width={18} height={18} opacity={0.6} />
    : <EyeIcon    width={18} height={18} opacity={0.6} />}
</TouchableOpacity>
    </View>

    <TouchableOpacity style={[styles.button, { backgroundColor: '#0F172A' }, loading && { opacity: 0.7 }]} onPress={handleResetPassword} disabled={loading}>
      <Text style={styles.buttonText}>{loading ? 'UPDATING...' : 'CONFIRM PASSWORD'}</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.cancelButton} onPress={() => reset(1)}>
      <Text style={styles.cancelText}>Cancel</Text>
    </TouchableOpacity>
  </View>
)}

        {step === 6 && (
          <View style={styles.form}>
            <Text style={styles.otpHeader}>Success!</Text>
            <Text style={styles.otpSubheader}>Successfully sent the username to your registered email address.</Text>
            <TouchableOpacity style={[styles.button, {backgroundColor: '#0F172A'}]} onPress={() => reset(1)}>
              <Text style={styles.buttonText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.footer}></Text>
        <Modal transparent={true} visible={modalVisible} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>{modalContent.title}</Text>
              <Text style={styles.modalMessage}>{modalContent.message}</Text>
              <TouchableOpacity style={styles.modalButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    marginBottom: 48,
    alignItems: 'center',
  },
  logo: {
    width: 120,         
    height: 120,        
    borderRadius: 60,    
    marginBottom: 20,
    borderWidth: 2,     
    borderColor: '#E2E8F0', 
    overflow: 'hidden', 
  },
  title: { 
    fontSize: 40, 
    fontWeight: '800', 
    color: '#0F172A', 
    letterSpacing: -1,
  },
  subtitle: { 
    fontSize: 14, 
    color: '#64748B', 
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: { 
    backgroundColor: 'white', 
    height: 55, 
    paddingHorizontal: 16, 
    borderRadius: 12, 
    marginBottom: 20, 
    borderWidth: 1.5, 
    borderColor: '#E2E8F0',
    fontSize: 16,
    color: '#0F172A',
  },
  button: { 
    backgroundColor: '#0f172a', 
    height: 55,
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: 10,
    ...Platform.select({
        ios: { shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
        android: { elevation: 4 }
    })
  },
  buttonText: { 
    color: 'white', 
    fontWeight: '700', 
    fontSize: 15,
    letterSpacing: 1,
  },
  linkText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '600',
  },
  otpHeader: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#0F172A', 
    textAlign: 'center',
    marginBottom: 8 
  },
  otpSubheader: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center', 
    marginBottom: 32 
  },
  otpInput: { 
    fontSize: 32, 
    letterSpacing: 12, 
    textAlign: 'center', 
    backgroundColor: 'white', 
    height: 70,
    borderWidth: 2, 
    borderColor: '#2563EB', 
    borderRadius: 12, 
    marginBottom: 24,
    color: '#0F172A',
    fontWeight: 'bold'
  },
  cancelButton: { 
    marginTop: 24, 
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  cancelText: { 
    color: '#475569', 
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalContainer: { 
    backgroundColor: 'white', 
    padding: 24, 
    borderRadius: 16, 
    width: '80%', 
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 8 }
    })
  },
  modalTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#0F172A', 
    marginBottom: 8,
  },
  modalMessage: { 
    fontSize: 14, 
    color: '#475569', 
    textAlign: 'center', 
    marginBottom: 24,
    lineHeight: 20
  },
  modalButton: { 
    backgroundColor: '#0f172a', 
    paddingVertical: 12, 
    paddingHorizontal: 32, 
    borderRadius: 8 
  },
  modalButtonText: { 
    color: 'white', 
    fontWeight: 'bold',
    fontSize: 14
  },
 footer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    fontSize: 12,
    color: '#CBD5E1',
    letterSpacing: 1
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginBottom: 12,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    height: 55,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },
  eyeButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklistContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  checklistItem: {
    fontSize: 13,
    fontWeight: '500',
  }
});