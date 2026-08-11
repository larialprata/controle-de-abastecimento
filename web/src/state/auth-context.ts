import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { WebBiAction, WebBiPageKey, WebPageKey, WebWritePageKey } from "../lib/webPermissions";

export type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  token: string | null;
  isAdmin: boolean;
  accessPlatform: string | null;
  webPermissions: WebPageKey[];
  webWritePermissions: WebWritePageKey[];
  obraCodigos: number[] | null;
  hasObraRestriction: boolean;
  canAccessObra: (obraCodigo: number) => boolean;
  canAccessPage: (pageKey: WebPageKey) => boolean;
  canWriteOnPage: (pageKey: WebWritePageKey) => boolean;
  canWriteBiAction: (page: WebBiPageKey, action: WebBiAction) => boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOutlook: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
