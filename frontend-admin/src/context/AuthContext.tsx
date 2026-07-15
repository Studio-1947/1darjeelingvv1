import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import api from '@/lib/api';

const AuthCtx = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem('admin_token');
    if (!t) { 
      setUser(null); 
      setLoading(false); 
      return; 
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch (e) {
      localStorage.removeItem('admin_token');
      setUser(null);
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { 
    refresh(); 
  }, [refresh]);

  const login = useCallback((token: string, u: any) => {
    localStorage.setItem('admin_token', token);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_token');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, setUser }),
    [user, loading, login, logout, refresh]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
