import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import api, { setRequestSide } from '@/lib/api';
import { asHostType, type Audience, type HostType } from '@/lib/audience';

const AuthCtx = createContext(null);

/**
 * Which side of the site a signed-in person is using: travelling or running their business.
 *
 * Same idea as the app's Traveller / Host switch. The account's role never changes here (a host
 * stays a host on the server); the mode only decides what the header, tab bar and dashboards
 * show. It is kept in this browser only, and the login choice sets it.
 */
export type Mode = 'tourist' | 'provider';

const MODE_KEY = 'mode';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'provider' ? 'provider' : 'tourist';
  } catch {
    return 'tourist';
  }
}

function saveMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private windows can refuse storage; the mode then lasts for this visit only.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode>(readMode);
  // The host's business (GET /providers/me), so the site knows what kind of host this is.
  const [provider, setProvider] = useState<any>(null);

  const setMode = useCallback((next: Mode) => {
    saveMode(next);
    setModeState(next);
  }, []);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem('token');
    if (!t) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch (e) {
      localStorage.removeItem('token');
      setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const refreshProvider = useCallback(async () => {
    try {
      const { data } = await api.get('/providers/me');
      setProvider(data.provider ?? null);
    } catch {
      setProvider(null);
    }
  }, []);

  // Only hosts have a business to load.
  useEffect(() => {
    if (user?.role === 'provider') refreshProvider();
    else setProvider(null);
  }, [user?.id, user?.role, refreshProvider]);

  // `nextMode` is the side picked on the login screen. Without one, sign-in starts on the
  // traveller side, as the app does.
  const login = useCallback((token, u, nextMode: Mode = 'tourist') => {
    localStorage.setItem('token', token);
    setMode(nextMode);
    setUser(u);
  }, [setMode]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setMode('tourist');
    setUser(null);
  }, [setMode]);

  // Only a host can be on the business side. Everyone else always sees the traveller side,
  // whatever an old stored mode says.
  const isHostMode = user?.role === 'provider' && mode === 'provider';
  const hostType: HostType | null = asHostType(provider?.business_type);
  const audience: Audience = useMemo(
    () => ({ side: isHostMode ? 'business' : 'traveller', hostType }),
    [isHostMode, hostType]
  );

  // Every request carries the side, so the server can hold the same line the screens do.
  setRequestSide(audience.side);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, setUser, mode, setMode, isHostMode, provider, refreshProvider, hostType, audience }),
    [user, loading, login, logout, refresh, mode, setMode, isHostMode, provider, refreshProvider, hostType, audience]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
