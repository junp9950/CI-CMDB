import { useState, useEffect } from "react";
import api from "../api/client";

const TOKEN_KEY = "cidb_admin_token";

export function useAdmin() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const isAdmin = !!token;

  useEffect(() => {
    if (token) {
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common["Authorization"];
    }
  }, [token]);

  const login = async (password: string): Promise<boolean> => {
    try {
      const r = await api.post("/auth/login", { password });
      const t = r.data.token;
      localStorage.setItem(TOKEN_KEY, t);
      api.defaults.headers.common["Authorization"] = `Bearer ${t}`;
      setToken(t);
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  return { isAdmin, login, logout };
}
