import { useState } from "react";
import { Loader2 } from "lucide-react";
import { requireEnv } from "../../lib/env";

type Props = {
  storagePath: string | null | undefined;
  token: string;
  onOpen: (signedUrl: string) => void;
  /** Rota da API: tanque (movimentações) ou melosa */
  api?: "tanque" | "melosa";
  shortLabel?: string;
};

export default function StoragePhotoCell({
  storagePath,
  token,
  onOpen,
  api = "tanque",
  shortLabel = "Abrir foto",
}: Props) {
  const [loading, setLoading] = useState(false);

  if (!storagePath || !String(storagePath).trim()) {
    return <span className="block w-full text-center text-slate-400">—</span>;
  }

  async function openPhoto() {
    if (loading) return;
    const path = String(storagePath).trim();
    if (!path) return;
    setLoading(true);
    try {
      const API_URL = requireEnv("VITE_API_URL");
      const endpoint = api === "melosa" ? "/v1/melosa/photo-url" : "/v1/tanque/photo-url";
      const res = await fetch(`${API_URL}${endpoint}?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && typeof json?.url === "string" && json.url.trim()) {
        onOpen(json.url);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openPhoto}
      className="mx-auto inline-flex items-center justify-center text-xs font-semibold text-rose-600 hover:underline disabled:opacity-60 dark:text-rose-400"
      disabled={loading}
      title={storagePath}
    >
      {loading ? (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          A abrir…
        </span>
      ) : (
        shortLabel
      )}
    </button>
  );
}
