import { useCallback, useEffect, useMemo, useState } from "react";
import ImagePanZoomLightbox from "../components/bi/ImagePanZoomLightbox";
import TanqueTicketModal, { type TanqueTicketRow } from "../components/bi/TanqueTicketModal";
import StoragePhotoCell from "../components/bi/StoragePhotoCell";
import MovementsMap, { type MapPoint } from "../components/bi/MovementsMap";
import { useAuth } from "../state/AuthContext";
import { downloadTanqueDescarbonizeExcel, type TanqueExcelRowInput } from "../lib/tanqueDescarbonizeExcel";
import { resolveLitrosMovimentoTanque } from "../lib/descarbonizeExcel";
import { biTableRowKey, resolveSelectedRows } from "../lib/biSelection";
import { glassField, glassPanel } from "../lib/glass";

type LinhaTanque = Record<string, unknown> & {
  id?: string;
  operation_id?: string;
  usuario_id?: string;
  usuario_full_name?: string | null;
  tipo?: string;
  obra_codigo?: number;
  obra_nome?: string | null;
  data_hora?: string;
  litros?: number;
  combustivel_tipo?: string | null;
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  return String(v);
}

function fmtPlacaRow(m: LinhaTanque): string {
  return fmt(m.placa_texto ?? m.placa_caminhao);
}

function fmtFornecedorRow(m: LinhaTanque): string {
  return fmt(m.fornecedor_texto);
}

function fmtTanqueNumRow(m: LinhaTanque): string {
  const n = m.tanque_numero;
  if (n === 1 || n === "1") return "1";
  if (n === 2 || n === "2") return "2";
  return "—";
}

function isRetiradaTanque(m: LinhaTanque): boolean {
  return m.tipo === "RETIRADA_TANQUE";
}

function isEntradaTanque(m: LinhaTanque): boolean {
  return m.tipo === "ENTRADA_TANQUE_OBRA";
}

function fmtPatrimonioRow(m: LinhaTanque): string {
  return fmt(m.placa_texto ?? m.placa_caminhao);
}

function fmtEquipamentoRow(m: LinhaTanque): string {
  return fmt(m.fornecedor_texto);
}

function fmtHorimetroRow(m: LinhaTanque): string {
  return isRetiradaTanque(m) ? fmt(m.tanque_texto) : "—";
}

function storagePath(m: LinhaTanque, key: string): string | undefined {
  const v = m[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
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

function fmtDateBr(v: unknown): string {
  if (!v) return "—";
  const d = parseDataHora(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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

function fmtInsumoTicket(m: LinhaTanque): string {
  const ins = fmtCombustivelCurto(m.combustivel_tipo);
  if (ins === "Diesel") return "DIESEL - S10";
  if (ins === "Gasolina") return "GASOLINA";
  return ins;
}

function calcQuantidadeLitros(m: LinhaTanque): number | null {
  return resolveLitrosMovimentoTanque(m);
}

function fmtQuantidade(m: LinhaTanque): string {
  const q = calcQuantidadeLitros(m);
  if (q == null) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(q);
}

function fmtObra(m: LinhaTanque): string {
  return `${m.obra_codigo ?? "—"}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`;
}

function fmtLocal(m: LinhaTanque): string {
  if (m.local_address != null && String(m.local_address).trim()) return fmt(m.local_address);
  if ([m.local_latitude, m.local_longitude].every((x) => x != null)) {
    return `${fmt(m.local_latitude)}, ${fmt(m.local_longitude)}`;
  }
  return "—";
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

function toTanqueExcelInput(m: LinhaTanque): TanqueExcelRowInput {
  return {
    obraCodigo: typeof m.obra_codigo === "number" ? m.obra_codigo : undefined,
    obraNome: m.obra_nome,
    dataHora: m.data_hora,
    combustivelTipo: m.combustivel_tipo,
    medidorTanqueInicial:
      m.medidor_tanque_numero_inicial != null ? String(m.medidor_tanque_numero_inicial) : null,
    medidorTanqueFinal:
      m.medidor_tanque_numero_final != null ? String(m.medidor_tanque_numero_final) : null,
    litros: calcQuantidadeLitros(m),
    placaTexto: m.placa_texto != null ? String(m.placa_texto) : undefined,
  };
}

function isTicketavelTanque(m: LinhaTanque): boolean {
  return isEntradaTanque(m) || isRetiradaTanque(m);
}

function buildTanqueTicketRow(m: LinhaTanque): TanqueTicketRow {
  const responsavel =
    typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
      ? m.usuario_full_name.trim()
      : "—";
  const entrada = isEntradaTanque(m);
  const nota = m.nota_numero != null && String(m.nota_numero).trim() ? String(m.nota_numero).trim() : "";
  return {
    data: fmtDateOnly(m.data_hora),
    responsavelAbastecimento: responsavel,
    placaAtivo: entrada ? (nota ? `NF ${nota}` : "—") : fmtPatrimonioRow(m),
    insumo: fmtInsumoTicket(m),
    horimetro: entrada ? fmtTanqueNumRow(m) : fmtHorimetroRow(m),
    litros: fmtQuantidade(m),
    equipamento: entrada
      ? `Entrada${fmtEquipamentoRow(m) !== "—" ? ` · ${fmtEquipamentoRow(m)}` : ""}`
      : fmtEquipamentoRow(m),
    movimento: entrada ? "Entrada" : "Saída",
  };
}

const TIPOS = ["", "ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE"] as const;
const PAGE_SIZE = 500;
const TABLE_COL_COUNT = 25;

const labelCls =
  "flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const thCls =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-white/30 bg-white/50 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300";

const tdCls =
  "border-b border-white/25 px-3 py-2 align-middle text-slate-800 dark:border-white/5 dark:text-slate-200";

const tdPhotoCls =
  "border-b border-white/25 px-2 py-2 text-center align-middle dark:border-white/5";

export default function TanqueBIPage() {
  const { token } = useAuth();
  const [raw, setRaw] = useState<LinhaTanque[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
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
      const rows: LinhaTanque[] = [];
      let offset = 0;
      for (let i = 0; i < 200; i += 1) {
        const res = await fetch(`${apiBase}/v1/movimentacoes?limit=${PAGE_SIZE}&offset=${offset}&origem=tanque`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
        const chunk = (json?.movimentacoes ?? []) as LinhaTanque[];
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
    let rows = raw;
    if (filtroTipo) {
      rows = rows.filter((r) => r.tipo === filtroTipo);
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    return rows;
  }, [raw, filtroTipo, busca]);

  const retiradasFiltradas = useMemo(() => filtradas.filter(isRetiradaTanque), [filtradas]);

  const rowKey = useCallback((m: LinhaTanque, idx: number) => biTableRowKey(m, idx), []);

  const visibleKeys = useMemo(() => filtradas.map((m, idx) => rowKey(m, idx)), [filtradas, rowKey]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.includes(k));
  const selectedRows = useMemo(
    () => resolveSelectedRows(filtradas, selectedKeys, rowKey),
    [filtradas, selectedKeys, rowKey],
  );
  const selectedTicketRows = useMemo(() => selectedRows.filter(isTicketavelTanque), [selectedRows]);
  const selectedOperationIds = useMemo(() => {
    const set = new Set<string>();
    selectedRows.forEach((row) => {
      const op = typeof row.operation_id === "string" ? row.operation_id : "";
      if (op) set.add(op);
    });
    return Array.from(set);
  }, [selectedRows]);

  const ticketRows = useMemo(
    () => selectedTicketRows.map((m) => buildTanqueTicketRow(m)),
    [selectedTicketRows],
  );

  const mapPoints = useMemo((): MapPoint[] => {
    const out: MapPoint[] = [];
    filtradas.forEach((m, idx) => {
      const tipoTxt = String(m.tipo ?? "").toUpperCase();
      const isSaida = tipoTxt.includes("RETIRADA");
      const lat = parseCoord(m.local_latitude);
      const lng = parseCoord(m.local_longitude);
      if (lat == null || lng == null) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      out.push({
        lat,
        lng,
        key: `${String(m.operation_id ?? "")}-${String(m.id ?? idx)}-${idx}`,
        dataHora: fmtDateBr(m.data_hora),
        usuario:
          typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
            ? m.usuario_full_name.trim()
            : fmtPatrimonioRow(m),
        obra: fmtObra(m),
        litros: fmtQuantidade(m),
        municipio: municipioFromAddress(m.local_address),
        movimento: isSaida ? "saida" : "entrada",
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
          const res = await fetch(`${apiBase}/v1/tanque/movimentacoes/${operationId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
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

  const handleEditSelected = useCallback(async () => {
    if (!token || selectedOperationIds.length !== 1) return;
    const row = selectedRows[0];
    const operationId = selectedOperationIds[0];
    if (!row || !operationId) return;

    const litrosCurrent = row.litros != null ? String(row.litros) : "";
    const combustivelCurrent = row.combustivel_tipo != null ? String(row.combustivel_tipo) : "";
    const notaCurrent = row.nota_numero != null ? String(row.nota_numero) : "";
    const valorCurrent = row.valor_unitario != null ? String(row.valor_unitario) : "";
    const placaCurrent = fmtPlacaRow(row) === "—" ? "" : fmtPlacaRow(row);
    const fornecedorCurrent = fmtFornecedorRow(row) === "—" ? "" : fmtFornecedorRow(row);
    const tanqueCurrent = fmtTanqueNumRow(row);
    const obsCurrent = row.obs != null ? String(row.obs) : "";

    const litrosInput = window.prompt("Editar litros:", litrosCurrent);
    if (litrosInput === null) return;
    const combustivelInput = window.prompt("Editar insumo/combustível (vazio para limpar):", combustivelCurrent);
    if (combustivelInput === null) return;
    const notaInput = window.prompt("Editar número da nota (vazio para limpar):", notaCurrent);
    if (notaInput === null) return;
    const valorInput = window.prompt("Editar valor unitário (vazio para limpar):", valorCurrent);
    if (valorInput === null) return;
    const placaInput = window.prompt("Editar placa (vazio para limpar):", placaCurrent);
    if (placaInput === null) return;
    const fornecedorInput = window.prompt("Editar fornecedor (vazio para limpar):", fornecedorCurrent);
    if (fornecedorInput === null) return;
    const tanqueInput = window.prompt("Tanque: 1 ou 2 (vazio para limpar):", tanqueCurrent === "—" ? "" : tanqueCurrent);
    if (tanqueInput === null) return;
    const obsInput = window.prompt("Editar observação (vazio para limpar):", obsCurrent);
    if (obsInput === null) return;

    const parseNullableNumber = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const num = Number(trimmed.replace(",", "."));
      return Number.isFinite(num) && num >= 0 ? num : NaN;
    };
    const litros = parseNullableNumber(litrosInput);
    const valorUnitario = parseNullableNumber(valorInput);

    if (litros === null || Number.isNaN(litros)) {
      window.alert("Litros inválido.");
      return;
    }
    if (Number.isNaN(valorUnitario)) {
      window.alert("Valor unitário inválido.");
      return;
    }

    const tanqueTrim = tanqueInput.trim();
    let tanqueNumero: number | null = null;
    if (tanqueTrim === "1") tanqueNumero = 1;
    else if (tanqueTrim === "2") tanqueNumero = 2;
    else if (tanqueTrim !== "") {
      window.alert("Tanque inválido. Use 1 ou 2, ou deixe vazio.");
      return;
    }

    try {
      setLoading(true);
      const payload: Record<string, unknown> = {
        litros,
        combustivel_tipo: combustivelInput.trim() ? combustivelInput.trim() : null,
        nota_numero: notaInput.trim() ? notaInput.trim() : null,
        valor_unitario: valorUnitario,
        placa_texto: placaInput.trim() ? placaInput.trim() : null,
        placa_caminhao: placaInput.trim() ? placaInput.trim() : null,
        fornecedor_texto: fornecedorInput.trim() ? fornecedorInput.trim() : null,
        tanque_numero: tanqueNumero,
        obs: obsInput.trim() ? obsInput.trim() : null,
      };

      const res = await fetch(`${apiBase}/v1/tanque/movimentacoes/${operationId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
      setSelectedKeys([]);
      await load();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao editar movimentação");
    } finally {
      setLoading(false);
    }
  }, [apiBase, load, selectedOperationIds, selectedRows, token]);

  const handleExportExcel = useCallback(async () => {
    const rows = retiradasFiltradas;
    if (rows.length === 0) {
      window.alert(
        "Não há retiradas de tanque para exportar. O Excel Descarbonize inclui apenas movimentações do tipo RETIRADA_TANQUE.",
      );
      return;
    }
    try {
      await downloadTanqueDescarbonizeExcel(rows.map((m) => toTanqueExcelInput(m)), "bi-tanque");
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao exportar Excel");
    }
  }, [retiradasFiltradas]);

  const authToken = token ?? "";

  return (
    <div>
      <header className={`mb-6 ${glassPanel} px-5 py-5 text-center md:text-left`}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">BI — Tanque</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Quantidade (L): entrada usa o campo litros da nota. Na saída, litros = medidor final − medidor
          inicial (medidor acumulado sobe ao abastecer; ex.: 50 → 5000 = 4950 L).
          O Excel Descarbonize usa a mesma planilha modelo do BI Melosa; só as retiradas entram na exportação.
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
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Tipo</span>
          <select className={glassField} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t || "all"} value={t}>
                {t === "" ? "Todos" : t === "ENTRADA_TANQUE_OBRA" ? "Entrada" : "Retirada"}
              </option>
            ))}
          </select>
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
        {filtroTipo || busca ? " (filtrado)" : ""} ·{" "}
        <strong className="text-slate-900 dark:text-white">{retiradasFiltradas.length}</strong> retirada
        {retiradasFiltradas.length === 1 ? "" : "s"} para Excel ·{" "}
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
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Movimentações Tanque</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTicketOpen(true)}
                disabled={loading || selectedTicketRows.length === 0}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ticket{selectedTicketRows.length > 0 ? ` (${selectedTicketRows.length})` : ""}
              </button>
              <button
                type="button"
                onClick={handleEditSelected}
                disabled={loading || selectedOperationIds.length !== 1}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Editar selecionada
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
                  <th className={thCls}>Data/hora</th>
                  <th className={thCls}>Obra</th>
                  <th className={thCls}>Usuário</th>
                  <th className={thCls}>Movimento</th>
                  <th className={thCls}>Litros</th>
                  <th className={thCls}>Insumo</th>
                  <th className={thCls}>Nº nota</th>
                  <th className={thCls}>Foto nota</th>
                  <th className={thCls}>Valor unit. (L)</th>
                  <th className={thCls}>Patrimônio</th>
                  <th className={thCls}>Equipamento</th>
                  <th className={thCls}>Horímetro</th>
                  <th className={thCls}>Tanque</th>
                  <th className={thCls}>Lacre tanque</th>
                  <th className={thCls}>Foto lacre T.</th>
                  <th className={thCls}>Lacre melosa</th>
                  <th className={thCls}>Foto lacre M.</th>
                  <th className={thCls}>Med. ini.</th>
                  <th className={thCls}>Foto med. ini.</th>
                  <th className={thCls}>Med. fin.</th>
                  <th className={thCls}>Foto med. fin.</th>
                  <th className={thCls}>Confirmação</th>
                  <th className={thCls}>Local</th>
                  <th className={thCls}>Obs</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((m, idx) => {
                  const movimento = isEntradaTanque(m) ? "Entrada" : isRetiradaTanque(m) ? "Saída" : "—";
                  const insumo = fmtCombustivelCurto(m.combustivel_tipo);
                  const valorUnit =
                    isEntradaTanque(m) && m.valor_unitario != null && m.valor_unitario !== ""
                      ? fmt(m.valor_unitario)
                      : "—";
                  const ret = isRetiradaTanque(m);
                  const ent = isEntradaTanque(m);
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";
                  const k = rowKey(m, idx);
                  const checked = selectedKeys.includes(k);

                  const usuarioCell =
                    typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
                      ? m.usuario_full_name.trim()
                      : "—";

                  const photo = (path: string | undefined, label = "Abrir") => (
                    <StoragePhotoCell
                      storagePath={path}
                      token={authToken}
                      onOpen={setLightboxSrc}
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
                      <td className={`${tdCls} max-w-[200px]`}>{fmtDateBr(m.data_hora)}</td>
                      <td className={`${tdCls} max-w-[220px]`}>{fmtObra(m)}</td>
                      <td className={`${tdCls} max-w-[200px]`}>{usuarioCell}</td>
                      <td className={`${tdCls} max-w-[100px]`}>{movimento}</td>
                      <td className={`${tdCls} whitespace-nowrap font-semibold`}>{fmtQuantidade(m)}</td>
                      <td className={`${tdCls} max-w-[120px]`}>{insumo}</td>
                      <td className={`${tdCls} max-w-[100px]`}>{ent ? fmt(m.nota_numero) : "—"}</td>
                      <td className={tdPhotoCls}>
                        {ent ? photo(storagePath(m, "nota_storage_path"), "Nota") : "—"}
                      </td>
                      <td className={`${tdCls} max-w-[120px]`}>{valorUnit}</td>
                      <td className={`${tdCls} max-w-[120px]`}>{fmtPatrimonioRow(m)}</td>
                      <td className={`${tdCls} max-w-[160px]`}>{fmtEquipamentoRow(m)}</td>
                      <td className={`${tdCls} max-w-[120px]`}>{fmtHorimetroRow(m)}</td>
                      <td className={`${tdCls} max-w-[72px]`}>{fmtTanqueNumRow(m)}</td>
                      <td className={`${tdCls} max-w-[100px]`}>{ret ? fmt(m.lacre_tanque_numero) : "—"}</td>
                      <td className={tdPhotoCls}>
                        {ret ? photo(storagePath(m, "lacre_tanque_storage_path"), "Lacre T.") : "—"}
                      </td>
                      <td className={`${tdCls} max-w-[100px]`}>{ret ? fmt(m.lacre_melosa_numero) : "—"}</td>
                      <td className={tdPhotoCls}>
                        {ret ? photo(storagePath(m, "lacre_melosa_storage_path"), "Lacre M.") : "—"}
                      </td>
                      <td className={`${tdCls} max-w-[100px]`}>
                        {ret ? fmt(m.medidor_tanque_numero_inicial) : "—"}
                      </td>
                      <td className={tdPhotoCls}>
                        {ret
                          ? photo(storagePath(m, "medidor_tanque_foto_inicial_storage_path"), "Med. ini.")
                          : "—"}
                      </td>
                      <td className={`${tdCls} max-w-[100px]`}>
                        {ret ? fmt(m.medidor_tanque_numero_final) : "—"}
                      </td>
                      <td className={tdPhotoCls}>
                        {ret
                          ? photo(storagePath(m, "medidor_tanque_foto_final_storage_path"), "Med. fin.")
                          : "—"}
                      </td>
                      <td className={tdPhotoCls}>
                        {ret
                          ? photo(storagePath(m, "confirmacao_abastecimento_foto_storage_path"), "Confirm.")
                          : "—"}
                      </td>
                      <td className={`${tdCls} max-w-[200px]`}>{fmtLocal(m)}</td>
                      <td className={`${tdCls} max-w-[200px]`}>{fmt(m.obs)}</td>
                    </tr>
                  );
                })}
                {filtradas.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={TABLE_COL_COUNT} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Nenhuma linha. Confirme se o app já sincronizou os registros.
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
          aria-labelledby="confirm-delete-tanque-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteOpen(false);
          }}
        >
          <div className={`max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <h2 id="confirm-delete-tanque-title" className="text-lg font-bold text-slate-900 dark:text-white">
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
        <TanqueTicketModal rows={ticketRows} onClose={() => setTicketOpen(false)} />
      ) : null}
    </div>
  );
}
