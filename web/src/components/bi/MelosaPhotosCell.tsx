import { useState } from "react";
import { Loader2 } from "lucide-react";
import { requireEnv } from "../../lib/env";

type Props = {
  comprovantePath?: string | null;
  tanquePath?: string | null;
  token: string;
  onOpen: (signedUrl: string) => void;
};

export default function MelosaPhotosCell({ comprovantePath, tanquePath, token, onOpen }: Props) {
  const [loading, setLoading] = useState(false);
  const comp = typeof comprovantePath === "string" ? comprovantePath.trim() : "";
  const tanque = typeof tanquePath === "string" ? tanquePath.trim() : "";
  const chosenPath = comp || tanque;

  if (!chosenPath) return <span className="text-slate-400">—</span>;

  async function openPhoto() {
    if (!chosenPath || loading) return;
    setLoading(true);
    try {
      const API_URL = requireEnv("VITE_API_URL");
      const paths = [chosenPath, chosenPath === comp ? tanque : comp].filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0
      );
      for (const p of paths) {
        const res = await fetch(`${API_URL}/v1/melosa/photo-url?path=${encodeURIComponent(p)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && typeof json?.url === "string" && json.url.trim()) {
          onOpen(json.url);
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openPhoto}
      className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-60 dark:text-rose-400"
      disabled={loading}
      title={chosenPath}
    >
      {loading ? (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          A abrir foto...
        </span>
      ) : (
        "Abrir foto"
      )}
    </button>
  );
}

