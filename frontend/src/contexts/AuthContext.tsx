import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState } from '../types';
import { api } from '../lib/api';
import { encryptPassword } from '../lib/passwordCrypto';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => Promise<void>;
  changePassword: (email: string, password: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
      api.setToken(token);
      setState({
        token,
        user: JSON.parse(user),
        isAuthenticated: true,
      });
    }
    
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const encryptedPassword = await encryptPassword(password);
    const data = await api.post<{ access_token: string; user: User; message: string }>(
      '/auth/login',
      { username, encrypted_password: encryptedPassword }
    );
    
    api.setToken(data.access_token);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    setState({
      token: data.access_token,
      user: data.user,
      isAuthenticated: true,
    });
  };

  const register = async (username: string, email: string, password: string) => {
    const encryptedPassword = await encryptPassword(password);
    const data = await api.post<{ access_token: string; user: User; message: string }>(
      '/auth/register',
      { username, email, encrypted_password: encryptedPassword }
    );
    
    api.setToken(data.access_token);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    setState({
      token: data.access_token,
      user: data.user,
      isAuthenticated: true,
    });
  };

  const logout = () => {
    api.setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  };

  const updateUser = async (data: Partial<User>) => {
    const response = await api.put<{ user: User; message: string }>('/auth/me', data);
    
    const updatedUser = response.user;
    localStorage.setItem('user', JSON.stringify(updatedUser));
    
    setState(prev => ({
      ...prev,
      user: updatedUser,
    }));
  };

  const changePassword = async (email: string, password: string) => {
    const encryptedPassword = await encryptPassword(password);
    await api.put<{ message: string }>('/auth/change-password', {
      email,
      encrypted_password: encryptedPassword,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        updateUser,
        changePassword,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
