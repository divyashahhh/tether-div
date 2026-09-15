import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "../../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [bootError, setBootError] = useState("");

  const restore = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setBootError("");
    try {
      const { user: me } = await api.me();
      setUser(me);
    } catch (err) {
      if (err.status === 401) setToken(null);
      else setBootError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const value = useMemo(
    () => ({
      user,
      loading,
      bootError,
      retry: restore,
      async signUp(email, password, displayName) {
        const { token, user: me } = await api.signUp(email.trim(), password, displayName.trim());
        setToken(token);
        setUser(me);
      },
      async signIn(email, password) {
        const { token, user: me } = await api.signIn(email.trim(), password);
        setToken(token);
        setUser(me);
      },
      async signOut() {
        try {
          await api.signOut();
        } catch {
          /* token already invalid */
        }
        setToken(null);
        setUser(null);
      },
      async updateProfile(fields) {
        const { user: me } = await api.updateProfile(fields);
        setUser(me);
        return me;
      },
      async refreshMe() {
        const { user: me } = await api.me();
        setUser(me);
      }
    }),
    [user, loading, bootError, restore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
