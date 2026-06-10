import { useCallback, useEffect, useMemo, useState } from "react";
import ImagePanZoomLightbox from "../components/bi/ImagePanZoomLightbox";
import MelosaTicketModal, { type MelosaTicketRow } from "../components/bi/MelosaTicketModal";
import StoragePhotoCell from "../components/bi/StoragePhotoCell";
import MovementsMap, { type MapPoint } from "../components/bi/MovementsMap";
import { useAuth } from "../state/AuthContext";
import { downloadMelosaDescarbonizeExcel, type MelosaExcelRowInput } from "../lib/melosaDescarbonizeExcel";
import { biTableRowKey, resolveSelectedRows } from "../lib/biSelection";
import { glassField, glassPanel } from "../lib/glass";

type LinhaMelosa = Record<string, unknown> & {
  id?: string;
  operation_id?: string;
  usuario_id?: string;
  obra_codigo?: number;
  obra_nome?: string | null;
  data_hora?: string;
  placa_texto?: string | null;
  ativo_melosa_texto?: string | null;
  ativo_equipamento_texto?: string | null;
  tanque_numero?: number | string | null;
  melosa_combustivel_tipo_registro?: string | null;
  melosa_combustivel_tipo_retirada?: string | null;
  melosa_medidor_acumulado_inicial_numero?: string | null;
  melosa_medidor_acumulado_final_numero?: string | null;
  melosa_lacre_numero?: string | null;
  melosa_lacre_storage_path?: string | null;
  melosa_equipamento_operador_storage_path?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  melosa_motorista_equipamento_abastecido?: string | null;
  melosa_categoria?: string | null;
  litros?: number | string | null;
  local_latitude?: number | string | null;
  local_longitude?: number | string | null;
  local_address?: string | null;
  usuario_full_name?: string | null;
};

function toMelosaExcelInput(m: LinhaMelosa): MelosaExcelRowInput {
  return {
    obraCodigo: typeof m.obra_codigo === "number" ? m.obra_codigo : undefined,
    obraNome: m.obra_nome,
    melosaCategoria: m.melosa_categoria,
    dataHora: m.data_hora,
    insumoRetirada: m.melosa_combustivel_tipo_retirada,
    insumoRegistro: m.melosa_combustivel_tipo_registro,
    medidorInicial: m.melosa_medidor_acumulado_inicial_numero,
    medidorFinal: m.melosa_medidor_acumulado_final_numero,
    placaTexto: m.ativo_melosa_texto ?? m.placa_texto,
  };
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  return String(v);
}

function fmtCombustivelCurto(v: unknown): string {
  const raw = fmt(v);
  if (raw === "—") return raw;
  const upper = raw.trim().toUpperCase();
  if (upper === "DIESEL" || upper === "DIESEL_S10") return "Diesel";
  if (upper === "GASOLINA") return "Gasolina";
  if (upper === "ALCOOL" || upper === "ÁLCOOL") return "Álcool";
  return raw.replaceAll("_", " ");
}

function parseMedidorNumero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseLitrosField(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function calcQuantidadeLitros(m: LinhaMelosa): number | null {
  const ini = parseMedidorNumero(m.melosa_medidor_acumulado_inicial_numero);
  const fin = parseMedidorNumero(m.melosa_medidor_acumulado_final_numero);
  if (ini != null && fin != null && ini !== fin) {
    const diff = fin > ini ? fin - ini : ini - fin;
    if (Number.isFinite(diff) && diff > 0) return diff;
  }
  const litros = parseLitrosField(m.litros);
  if (litros != null && litros > 0) return litros;
  return null;
}

function fmtQuantidade(m: LinhaMelosa): string {
  const q = calcQuantidadeLitros(m);
  if (q == null) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(q);
}

function fmtInsumoMel(m: LinhaMelosa): string {
  const ret = m.melosa_combustivel_tipo_retirada;
  const reg = m.melosa_combustivel_tipo_registro;
  if (ret != null && String(ret).trim()) return fmtCombustivelCurto(ret);
  if (reg != null && String(reg).trim()) return fmtCombustivelCurto(reg);
  return "—";
}

function fmtInsumoTicket(m: LinhaMelosa): string {
  const ins = fmtInsumoMel(m);
  if (ins === "Diesel") return "DIESEL - S10";
  if (ins === "Gasolina") return "GASOLINA";
  return ins;
}

function buildMelosaTicketRow(m: LinhaMelosa): MelosaTicketRow {
  const responsavel =
    typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
      ? m.usuario_full_name.trim()
      : "—";
  return {
    data: fmtDateOnly(m.data_hora),
    responsavelAbastecimento: responsavel,
    placaAtivo: fmtAtivoPlaca(m),
    insumo: fmtInsumoTicket(m),
    horimetro: fmt(m.melosa_horimetro_equipamento_abastecido_numero),
    litros: fmtQuantidade(m),
    nomeMotorista: fmt(m.melosa_motorista_equipamento_abastecido),
  };
}

function fmtAtivoPlaca(m: LinhaMelosa): string {
  return fmt(m.ativo_melosa_texto ?? m.placa_texto);
}

function fmtAtivoEquipamento(m: LinhaMelosa): string {
  return fmt(m.ativo_equipamento_texto ?? m.fornecedor_texto);
}

function fmtObra(m: LinhaMelosa): string {
  return `${m.obra_codigo ?? "—"}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`;
}

function parseCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseDataHora(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateOnly(v: unknown): string {
  const d = parseDataHora(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtTimeOnly(v: unknown): string {
  const d = parseDataHora(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtLocal(m: LinhaMelosa): string {
  if (m.local_address != null && String(m.local_address).trim()) return fmt(m.local_address);
  if ([m.local_latitude, m.local_longitude].every((x) => x != null)) {
    return `${fmt(m.local_latitude)}, ${fmt(m.local_longitude)}`;
  }
  return "—";
}

function storagePath(m: LinhaMelosa, key: string): string | undefined {
  const v = m[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function municipioFromAddress(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "—";
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const semCep = parts.filter((p) => !/^\d{5}-?\d{3}$/.test(p));
  const semPais = semCep.filter((p) => p.toLowerCase() !== "brasil");
  if (semPais.length >= 2) return semPais[1];
  return semPais[0] ?? "—";
}

const PAGE_SIZE = 500;
const TABLE_COL_COUNT = 13;

const labelCls =
  "flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const thCls =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-white/30 bg-white/50 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300";

const tdCls =
  "border-b border-white/25 px-3 py-2 align-middle text-slate-800 dark:border-white/5 dark:text-slate-200";

const tdPhotoCls =
  "border-b border-white/25 px-2 py-2 text-center align-middle dark:border-white/5";

export default function MelosaBIPage() {
  const { token } = useAuth();
  const [raw, setRaw] = useState<LinhaMelosa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);

  const apiBase = useMemo(() => import.meta.env.VITE_API_URL as string, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows: LinhaMelosa[] = [];
      let offset = 0;
      for (let i = 0; i < 200; i += 1) {
        const res = await fetch(`${apiBase}/v1/movimentacoes?limit=${PAGE_SIZE}&offset=${offset}&origem=melosa`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
        const chunk = (json?.movimentacoes ?? []) as LinhaMelosa[];
        rows.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setRaw(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [raw, busca]);

  const rowKey = useCallback((m: LinhaMelosa, idx: number) => biTableRowKey(m, idx), []);

  const visibleKeys = useMemo(() => filtradas.map((m, idx) => rowKey(m, idx)), [filtradas, rowKey]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.includes(k));
  const selectedRows = useMemo(
    () => resolveSelectedRows(filtradas, selectedKeys, rowKey),
    [filtradas, selectedKeys, rowKey],
  );
  const selectedOperationIds = useMemo(() => {
    const set = new Set<string>();
    selectedRows.forEach((row) => {
      const op = typeof row.operation_id === "string" ? row.operation_id : "";
      if (op) set.add(op);
    });
    return Array.from(set);
  }, [selectedRows]);

  const ticketRows = useMemo(
    () => selectedRows.map((m) => buildMelosaTicketRow(m)),
    [selectedRows],
  );

  const mapPoints = useMemo((): MapPoint[] => {
    const out: MapPoint[] = [];
    filtradas.forEach((m, idx) => {
      const lat = parseCoord(m.local_latitude);
      const lng = parseCoord(m.local_longitude);
      if (lat == null || lng == null) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      out.push({
        lat,
        lng,
        key: `${String(m.operation_id ?? "")}-${String(m.id ?? idx)}-${idx}`,
        dataHora: `${fmtDateOnly(m.data_hora)} ${fmtTimeOnly(m.data_hora)}`,
        usuario: fmtAtivoPlaca(m),
        obra: fmtObra(m),
        litros: fmtQuantidade(m),
        municipio: municipioFromAddress(m.local_address),
        movimento: "saida",
      });
    });
    return out;
  }, [filtradas]);

  const openDeleteConfirm = useCallback(() => {
    if (!token || selectedOperationIds.length === 0) return;
    setConfirmDeleteOpen(true);
  }, [token, selectedOperationIds.length]);

  const executeDeleteSelected = useCallback(async () => {
    if (!token || selectedOperationIds.length === 0) return;
    setConfirmDeleteOpen(false);
    try {
      setLoading(true);
      await Promise.all(
        selectedOperationIds.map(async (operationId) => {
          const res = await fetch(`${apiBase}/v1/melosa/movimentacoes/${operationId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
          }
        }),
      );
      setSelectedKeys([]);
      await load();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao excluir movimentações");
    } finally {
      setLoading(false);
    }
  }, [apiBase, load, selectedOperationIds, token]);

  const handleExportExcel = useCallback(async () => {
    if (filtradas.length === 0) {
      window.alert("Não há registros para exportar.");
      return;
    }
    try {
      await downloadMelosaDescarbonizeExcel(
        filtradas.map((m) => toMelosaExcelInput(m)),
        "bi-melosa",
      );
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao exportar Excel");
    }
  }, [filtradas]);

  const authToken = token ?? "";

  return (
    <div>
      <header className={`mb-6 ${glassPanel} px-5 py-5 text-center md:text-left`}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">BI — Melosa</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Quantidade (L): medidor final − medidor inicial (o final deve ser maior que o inicial). O Excel usa a
          planilha modelo do projeto (cores e cabeçalhos intactos); só os dados são preenchidos a partir da linha 2.
        </p>
      </header>

      <div className={`mb-4 flex flex-wrap items-end gap-4 p-4 ${glassPanel}`}>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Atualizar</span>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "A carregar…" : "Recarregar"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Exportação</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            Exportar Excel
          </button>
        </div>
        <div className="min-w-[200px] flex-1 flex-col gap-1 sm:min-w-[260px]">
          <span className={labelCls}>Buscar</span>
          <input
            className={`${glassField} w-full`}
            type="search"
            placeholder="Texto em qualquer campo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
        Mostrando <strong className="text-slate-900 dark:text-white">{filtradas.length}</strong> de{" "}
        <strong className="text-slate-900 dark:text-white">{raw.length}</strong> linhas
        {busca ? " (filtrado)" : ""} ·{" "}
        <strong className="text-slate-900 dark:text-white">{mapPoints.length}</strong> com coordenadas no mapa.
      </p>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-300/80 bg-red-50/90 px-4 py-3 text-sm font-semibold text-red-800 backdrop-blur-md dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(300px,440px)] xl:grid-cols-[1fr_minmax(340px,480px)]">
        <div className={`flex min-h-0 flex-col overflow-hidden ${glassPanel} p-0`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/40 px-4 py-3 dark:border-white/10">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Movimentações Melosa</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTicketOpen(true)}
                disabled={loading || selectedRows.length === 0}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ticket{selectedRows.length > 0 ? ` (${selectedRows.length})` : ""}
              </button>
              <button
                type="button"
                onClick={openDeleteConfirm}
                disabled={loading || selectedOperationIds.length === 0}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Excluir selecionadas
              </button>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {filtradas.length} {filtradas.length === 1 ? "linha" : "linhas"} · {selectedOperationIds.length}{" "}
                selecionada{selectedOperationIds.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="max-h-[min(72vh,780px)] overflow-auto">
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr className="text-left align-middle">
                  <th className={thCls}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedKeys((prev) => {
                          if (checked) {
                            const merged = new Set([...prev, ...visibleKeys]);
                            return Array.from(merged);
                          }
                          const visibleSet = new Set(visibleKeys);
                          return prev.filter((k) => !visibleSet.has(k));
                        });
                      }}
                      aria-label="Selecionar todas as movimentações visíveis"
                    />
                  </th>
                  <th className={thCls}>Obra</th>
                  <th className={thCls}>Data início</th>
                  <th className={thCls}>Data fim</th>
                  <th className={thCls}>Horário</th>
                  <th className={thCls}>Ativo Melosa</th>
                  <th className={thCls}>Ativo equipamento</th>
                  <th className={thCls}>Insumo</th>
                  <th className={thCls}>Quantidade (L)</th>
                  <th className={thCls}>Nº lacre</th>
                  <th className={thCls}>Foto lacre</th>
                  <th className={thCls}>Foto operador</th>
                  <th className={thCls}>Local</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((m, idx) => {
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";
                  const k = rowKey(m, idx);
                  const checked = selectedKeys.includes(k);
                  const lacreNum = m.melosa_lacre_numero;
                  const temLacre = lacreNum != null && String(lacreNum).trim().length > 0;
                  const dataRef = fmtDateOnly(m.data_hora);

                  const photo = (path: string | undefined, label: string) => (
                    <StoragePhotoCell
                      storagePath={path}
                      token={authToken}
                      onOpen={setLightboxSrc}
                      api="melosa"
                      shortLabel={label}
                    />
                  );

                  return (
                    <tr key={k} className={zebra}>
                      <td className={`${tdCls} w-10`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setSelectedKeys((prev) =>
                              isChecked ? [...prev, k] : prev.filter((x) => x !== k),
                            );
                          }}
                          aria-label="Selecionar movimentação"
                        />
                      </td>
                      <td className={`${tdCls} max-w-[220px]`}>{fmtObra(m)}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{dataRef}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{dataRef}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtTimeOnly(m.data_hora)}</td>
                      <td className={`${tdCls} max-w-[140px]`}>{fmtAtivoPlaca(m)}</td>
                      <td className={`${tdCls} max-w-[140px]`}>{fmtAtivoEquipamento(m)}</td>
                      <td className={`${tdCls} max-w-[140px]`}>{fmtInsumoMel(m)}</td>
                      <td className={`${tdCls} whitespace-nowrap font-semibold`}>{fmtQuantidade(m)}</td>
                      <td className={`${tdCls} max-w-[100px]`}>{temLacre ? fmt(lacreNum) : "—"}</td>
                      <td className={tdPhotoCls}>
                        {temLacre ? photo(storagePath(m, "melosa_lacre_storage_path"), "Lacre") : "—"}
                      </td>
                      <td className={tdPhotoCls}>
                        {photo(storagePath(m, "melosa_equipamento_operador_storage_path"), "Operador")}
                      </td>
                      <td className={`${tdCls} max-w-[220px]`}>{fmtLocal(m)}</td>
                    </tr>
                  );
                })}
                {filtradas.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={TABLE_COL_COUNT} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Nenhuma linha Melosa. Confirme se o app já sincronizou os registros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`flex min-h-0 flex-col overflow-hidden ${glassPanel} p-0`}>
          <div className="border-b border-white/40 px-4 py-3 dark:border-white/10">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Mapa das localizações</h2>
          </div>
          <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-b-2xl">
            <MovementsMap points={mapPoints} />
          </div>
        </div>
      </div>

      {confirmDeleteOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-melosa-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteOpen(false);
          }}
        >
          <div className={`max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <h2 id="confirm-delete-melosa-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Confirmar exclusão
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Tem certeza que deseja excluir{" "}
              <strong className="text-slate-900 dark:text-slate-200">{selectedOperationIds.length}</strong>{" "}
              movimenta{selectedOperationIds.length === 1 ? "ção" : "ções"} selecionada
              {selectedOperationIds.length === 1 ? "" : "s"}? Esta ação não pode ser desfeita.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/20 dark:bg-black/20 dark:text-slate-100 dark:hover:bg-white/15"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteSelected()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxSrc ? (
        <ImagePanZoomLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      ) : null}

      {ticketOpen && ticketRows.length > 0 ? (
        <MelosaTicketModal rows={ticketRows} onClose={() => setTicketOpen(false)} />
      ) : null}
    </div>
  );
}
