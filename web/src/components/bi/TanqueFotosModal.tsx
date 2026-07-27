import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { glassPanel } from "../../lib/glass";
import StoragePhotoCell from "./StoragePhotoCell";

export type TanqueFotoKind =
  | "nota"
  | "quantidade"
  | "lacre_tanque"
  | "lacre_melosa"
  | "assinatura_operador"
  | "assinatura_melosa"
  | "horimetro";

type FotoSlot = {
  kind: TanqueFotoKind;
  label: string;
  pathKey: string;
  hint: string;
  forTipo: "ENTRADA_TANQUE_OBRA" | "RETIRADA_TANQUE" | "BOTH";
};

const SLOTS: FotoSlot[] = [
  {
    kind: "nota",
    label: "Foto da nota",
    pathKey: "nota_storage_path",
    hint: "Entrada de combustível",
    forTipo: "ENTRADA_TANQUE_OBRA",
  },
  {
    kind: "quantidade",
    label: "Foto medidor / quantidade",
    pathKey: "tanque_quantidade_abastecida_storage_path",
    hint: "Retirada do tanque",
    forTipo: "RETIRADA_TANQUE",
  },
  {
    kind: "lacre_tanque",
    label: "Foto lacre tanque",
    pathKey: "lacre_tanque_storage_path",
    hint: "Retirada",
    forTipo: "RETIRADA_TANQUE",
  },
  {
    kind: "lacre_melosa",
    label: "Foto lacre melosa",
    pathKey: "lacre_melosa_storage_path",
    hint: "Retirada",
    forTipo: "RETIRADA_TANQUE",
  },
  {
    kind: "horimetro",
    label: "Foto horímetro",
    pathKey: "retirada_horimetro_foto_storage_path",
    hint: "Opcional na retirada",
    forTipo: "RETIRADA_TANQUE",
  },
  {
    kind: "assinatura_operador",
    label: "Assinatura operador",
    pathKey: "tanque_assinatura_operador_storage_path",
    hint: "Ticket",
    forTipo: "BOTH",
  },
  {
    kind: "assinatura_melosa",
    label: "Assinatura melosa / entrega",
    pathKey: "tanque_assinatura_melosa_storage_path",
    hint: "Ticket",
    forTipo: "BOTH",
  },
];

export type TanqueFotosRow = {
  operation_id: string;
  tipo?: string | null;
  obra_codigo?: number | null;
  data_hora?: string;
  nota_storage_path?: string | null;
  tanque_quantidade_abastecida_storage_path?: string | null;
  lacre_tanque_storage_path?: string | null;
  lacre_melosa_storage_path?: string | null;
  retirada_horimetro_foto_storage_path?: string | null;
  tanque_assinatura_operador_storage_path?: string | null;
  tanque_assinatura_melosa_storage_path?: string | null;
};

type Props = {
  open: boolean;
  row: TanqueFotosRow | null;
  apiBase: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
  onOpenPhoto: (signedUrl: string) => void;
};

function pathOf(row: TanqueFotosRow, key: string): string | null {
  const v = (row as Record<string, unknown>)[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Falha ao ler o arquivo"));
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function TanqueFotosModal({
  open,
  row,
  apiBase,
  token,
  onClose,
  onSaved,
  onOpenPhoto,
}: Props) {
  const [paths, setPaths] = useState<Record<string, string | null>>({});
  const [uploadingKind, setUploadingKind] = useState<TanqueFotoKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const tipo = String(row?.tipo ?? "").toUpperCase();
  const slots = useMemo(
    () =>
      SLOTS.filter(
        (s) =>
          s.forTipo === "BOTH" ||
          (tipo.includes("ENTRADA") && s.forTipo === "ENTRADA_TANQUE_OBRA") ||
          (tipo.includes("RETIRADA") && s.forTipo === "RETIRADA_TANQUE"),
      ),
    [tipo],
  );

  useEffect(() => {
    if (!open || !row) return;
    setError(null);
    setOkMsg(null);
    setUploadingKind(null);
    const next: Record<string, string | null> = {};
    for (const s of SLOTS) next[s.pathKey] = pathOf(row, s.pathKey);
    setPaths(next);
  }, [open, row]);

  if (!open || !row) return null;

  const upload = async (kind: TanqueFotoKind, file: File) => {
    setError(null);
    setOkMsg(null);
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem (JPG, PNG, WEBP…).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Imagem muito grande (máx. 10 MB).");
      return;
    }

    setUploadingKind(kind);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch(`${apiBase}/v1/tanque/movimentacoes/${row.operation_id}/photos`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind,
          data_base64: dataUrl,
          content_type: file.type,
          filename: file.name,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      }
      const storagePath = typeof json?.storage_path === "string" ? json.storage_path : null;
      const slot = SLOTS.find((s) => s.kind === kind);
      if (slot && storagePath) {
        setPaths((prev) => ({ ...prev, [slot.pathKey]: storagePath }));
      }
      setOkMsg(`${slot?.label ?? "Foto"} enviada.`);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setUploadingKind(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tanque-fotos-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploadingKind) onClose();
      }}
    >
      <div className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="tanque-fotos-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Fotos do tanque
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Complete as fotos em falta ou substitua as existentes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(uploadingKind)}
            className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-300/80 bg-red-50/90 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {okMsg ? (
          <div className="mt-3 rounded-lg border border-emerald-300/80 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            {okMsg}
          </div>
        ) : null}

        <ul className="mt-4 space-y-3">
          {slots.map((slot) => {
            const path = paths[slot.pathKey];
            const busy = uploadingKind === slot.kind;
            const inputId = `tanque-foto-${slot.kind}`;
            return (
              <li
                key={slot.kind}
                className="rounded-xl border border-white/50 bg-white/40 px-3 py-3 dark:border-white/10 dark:bg-black/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{slot.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{slot.hint}</p>
                  </div>
                  <div className="shrink-0">
                    {path ? (
                      <StoragePhotoCell
                        storagePath={path}
                        token={token}
                        onOpen={onOpenPhoto}
                        api="tanque"
                        shortLabel="Ver"
                      />
                    ) : (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Em falta</span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={inputId}
                    className={[
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition",
                      busy ? "cursor-wait bg-slate-400" : "bg-accent hover:bg-accent-hover",
                    ].join(" ")}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Camera className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {path ? "Substituir" : "Adicionar"}
                  </label>
                  <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={Boolean(uploadingKind)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(slot.kind, file);
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(uploadingKind)}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
