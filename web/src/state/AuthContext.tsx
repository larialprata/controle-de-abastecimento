import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { apiPost } from "../lib/api";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  token: string | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshIsAdmin: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const user = session?.user ?? null;

  async function refreshIsAdminInternal(sess: Session) {
    const { data } = await supabase.from("profiles").select("role").eq("user_id", sess.user.id).maybeSingle();
    const role = data?.role ?? "user";
    setIsAdmin(role === "admin");
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setToken(data.session?.access_token ?? null);
      setLoading(false);

      const nextSession = data.session;
      if (nextSession) {
        try {
          await apiPost("/v1/auth/ensure-role", nextSession.access_token, { role: "user" });
          await refreshIsAdminInternal(nextSession);
        } catch {
          setIsAdmin(false);
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setToken(nextSession?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function refreshIsAdmin() {
    if (!session) return;
    await refreshIsAdminInternal(session);
  }

  async function signIn(email: string, password: string) {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw new Error(error.message);
    }
    setSession(data.session);
    setToken(data.session?.access_token ?? null);

    if (data.session) {
      await apiPost("/v1/auth/ensure-role", data.session.access_token, { role: "user" });
      await refreshIsAdminInternal(data.session);
    }
    setLoading(false);
  }

  async function signOut() {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoading(false);
      throw new Error(error.message);
    }
    setSession(null);
    setToken(null);
    setIsAdmin(false);
    setLoading(false);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user,
      token,
      isAdmin,
      signIn,
      signOut,
      refreshIsAdmin,
    }),
    [loading, session, user, token, isAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

