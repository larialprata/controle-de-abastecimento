import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { apiPost } from "../lib/api";
import {
  canAccessWebPage,
  canWriteWebPage,
  DEFAULT_WEB_PERMISSIONS,
  normalizeWebPermissions,
  normalizeWebWritePermissions,
  type WebPageKey,
  type WebWritePageKey,
} from "../lib/webPermissions";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  token: string | null;
  isAdmin: boolean;
  accessPlatform: string | null;
  webPermissions: WebPageKey[];
  webWritePermissions: WebWritePageKey[];
  /** null = todas as obras; array = só essas obras */
  obraCodigos: number[] | null;
  hasObraRestriction: boolean;
  canAccessObra: (obraCodigo: number) => boolean;
  canAccessPage: (pageKey: WebPageKey) => boolean;
  canWriteOnPage: (pageKey: WebWritePageKey) => boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOutlook: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Falha ao validar acesso";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessPlatform, setAccessPlatform] = useState<string | null>(null);
  const [webPermissions, setWebPermissions] = useState<WebPageKey[]>(DEFAULT_WEB_PERMISSIONS);
  const [webWritePermissions, setWebWritePermissions] = useState<WebWritePageKey[]>([]);
  const [obraCodigos, setObraCodigos] = useState<number[] | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const user = session?.user ?? null;

  const applyProfileRow = useCallback(
    (row: {
      role?: string | null;
      access_platform?: string | null;
      web_permissions?: unknown;
      web_write_permissions?: unknown;
    } | null) => {
      setIsAdmin((row?.role ?? "user") === "admin");
      setAccessPlatform(row?.access_platform ?? null);
      const read = normalizeWebPermissions(row?.web_permissions);
      setWebPermissions(read);
      setWebWritePermissions(normalizeWebWritePermissions(read, row?.web_write_permissions));
    },
    [],
  );

  const applyObraCodigos = useCallback((codigos: number[] | null | undefined) => {
    if (codigos == null) {
      setObraCodigos(null);
      return;
    }
    const normalized = Array.from(new Set(codigos.filter((c) => Number.isFinite(c)))).sort((a, b) => a - b);
    setObraCodigos(normalized.length > 0 ? normalized : null);
  }, []);

  const refreshProfileInternal = useCallback(
    async (sess: Session) => {
      const { data } = await supabase
        .from("profiles")
        .select("role, access_platform, web_permissions, web_write_permissions")
        .eq("user_id", sess.user.id)
        .maybeSingle();
      applyProfileRow(data);
    },
    [applyProfileRow]
  );

  const validateWebSession = useCallback(
    async (sess: Session) => {
      const ensure = await apiPost("/v1/auth/ensure-role", sess.access_token, { role: "user", platform: "web" });
      await refreshProfileInternal(sess);
      applyObraCodigos((ensure as { obra_codigos?: number[] | null }).obra_codigos);
      setAuthError(null);
    },
    [refreshProfileInternal, applyObraCodigos]
  );

  const rejectSession = useCallback(async (message: string) => {
    await supabase.auth.signOut();
    setSession(null);
    setToken(null);
    setIsAdmin(false);
    setAccessPlatform(null);
    setWebPermissions(DEFAULT_WEB_PERMISSIONS);
    setWebWritePermissions([]);
    setObraCodigos(null);
    setAuthError(message);
  }, []);

  const hasObraRestriction = obraCodigos != null && obraCodigos.length > 0;

  const canAccessObra = useCallback(
    (obraCodigo: number) => {
      if (!hasObraRestriction) return true;
      return obraCodigos!.includes(obraCodigo);
    },
    [hasObraRestriction, obraCodigos]
  );

  const canAccessPage = useCallback(
    (pageKey: WebPageKey) => canAccessWebPage(isAdmin, accessPlatform, webPermissions, pageKey),
    [isAdmin, accessPlatform, webPermissions],
  );

  const canWriteOnPage = useCallback(
    (pageKey: WebWritePageKey) =>
      canWriteWebPage(isAdmin, accessPlatform, webPermissions, webWritePermissions, pageKey),
    [isAdmin, accessPlatform, webPermissions, webWritePermissions],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        const nextSession = data.session;
        setSession(nextSession);
        setToken(nextSession?.access_token ?? null);

        if (nextSession) {
          try {
            await validateWebSession(nextSession);
          } catch (err) {
            if (!cancelled) await rejectSession(authErrorMessage(err));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setToken(nextSession?.access_token ?? null);

      if (event === "SIGNED_OUT") {
        setIsAdmin(false);
        setAccessPlatform(null);
        setWebPermissions(DEFAULT_WEB_PERMISSIONS);
        setWebWritePermissions([]);
        setObraCodigos(null);
        setAuthError(null);
      }

      // OAuth: após redirect o Supabase dispara SIGNED_IN — validar em background.
      if (event === "SIGNED_IN" && nextSession) {
        void validateWebSession(nextSession).catch((err) => {
          void rejectSession(authErrorMessage(err));
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [rejectSession, validateWebSession]);

  async function refreshProfile() {
    if (!session) return;
    await refreshProfileInternal(session);
  }

  async function signIn(email: string, password: string) {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    setSession(data.session);
    setToken(data.session?.access_token ?? null);

    if (data.session) {
      try {
        await validateWebSession(data.session);
      } catch (ensureErr) {
        await rejectSession(authErrorMessage(ensureErr));
        throw ensureErr;
      }
    }
  }

  async function signInWithOutlook() {
    setAuthError(null);
    const redirectTo = `${window.location.origin}/login`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo,
        scopes: "email openid profile",
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    if (error) throw new Error(error.message);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    setSession(null);
    setToken(null);
    setIsAdmin(false);
    setAccessPlatform(null);
    setWebPermissions(DEFAULT_WEB_PERMISSIONS);
    setWebWritePermissions([]);
    setObraCodigos(null);
    setAuthError(null);
  }

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user,
      token,
      isAdmin,
      accessPlatform,
      webPermissions,
      webWritePermissions,
      obraCodigos,
      hasObraRestriction,
      canAccessObra,
      canAccessPage,
      canWriteOnPage,
      authError,
      signIn,
      signInWithOutlook,
      signOut,
      refreshProfile,
      clearAuthError,
    }),
    [loading, session, user, token, isAdmin, accessPlatform, webPermissions, webWritePermissions, obraCodigos, hasObraRestriction, canAccessObra, canAccessPage, canWriteOnPage, authError, clearAuthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
