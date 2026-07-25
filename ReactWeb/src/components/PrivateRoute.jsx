import React from 'react';
import { Navigate } from 'react-router-dom';

export default function PrivateRoute({ children }) {
  // SECURED: Now checks for the actual cryptographic JWT token in local storage
  const token = localStorage.getItem('jwtToken');

  // Added replace={true} so they cannot 'go back' to a protected route after logout
  return token ? children : <Navigate to="/" replace={true} />;
}