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
  /** Quando não há foto, exibe botão para completar */
  onAddClick?: () => void;
};

export default function StoragePhotoCell({
  storagePath,
  token,
  onOpen,
  api = "tanque",
  shortLabel = "Abrir foto",
  onAddClick,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!storagePath || !String(storagePath).trim()) {
    if (onAddClick) {
      return (
        <button
          type="button"
          onClick={onAddClick}
          className="mx-auto block text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400"
          title="Adicionar foto"
        >
          Adicionar
        </button>
      );
    }
    return <span className="block w-full text-center text-slate-400">—</span>;
  }

  async function openPhoto() {
    if (loading) return;
    const path = String(storagePath).trim();
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const API_URL = requireEnv("VITE_API_URL");
      const endpoint = api === "melosa" ? "/v1/melosa/photo-url" : "/v1/tanque/photo-url";
      const res = await fetch(`${API_URL}${endpoint}?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && typeof json?.url === "string" && json.url.trim()) {
        onOpen(json.url);
        return;
      }
      setError(typeof json?.error === "string" ? json.error : "Não foi possível abrir a foto.");
    } catch {
      setError("Erro de rede ao abrir a foto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
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
      {error ? (
        <span className="max-w-[120px] text-center text-[10px] leading-tight text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
