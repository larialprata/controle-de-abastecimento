import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import ImagePanZoomLightbox from "../components/bi/ImagePanZoomLightbox";
import TanqueTicketModal, { type TanqueTicketRow } from "../components/bi/TanqueTicketModal";
import TanqueRetiradaEquipamentoModal from "../components/bi/TanqueRetiradaEquipamentoModal";
import StoragePhotoCell from "../components/bi/StoragePhotoCell";
import MovementsMap, { type MapPoint } from "../components/bi/MovementsMap";
import { useAuth } from "../state/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { fmtTicketNumero, ticketNumeroParaFiltro } from "../lib/ticketNumero";
import { enrichMelosaTicketRowsWithSignatures } from "../lib/melosaPhotoUrl";
import { fmtEquipamentoTicketLabel, enrichMelosaRowsWithEquipamentoDescricao } from "../lib/equipamentoTicketLabel";
import { downloadTanqueDescarbonizeExcel, type TanqueExcelRowInput } from "../lib/tanqueDescarbonizeExcel";
import { resolveLitrosMovimentoTanque } from "../lib/descarbonizeExcel";
import { biMovementRowKey, resolveSelectedRows } from "../lib/biSelection";
import {
  defaultPeriodoMesAtual,
  parseDateInputValue,
  passesDashboardFilters,
  toDateInputValue,
} from "../lib/aggregateCombustivelDashboard";
import { glassField, glassPanel, glassSelect } from "../lib/glass";
import {
  EMPRESA_LABEL,
  OBRA_EMPRESAS,
  obraCodigosDaEmpresa,
  empresasDasLinhas,
  filtrarObrasPorEmpresa,
  type ObraComEmpresa,
  type ObraEmpresa,
} from "../lib/obrasEmpresa";

type ObraRow = ObraComEmpresa;

type LinhaTanque = Record<string, unknown> & {
  id?: string;
  operation_id?: string;
  ticket_numero?: number | null;
  usuario_id?: string;
  usuario_full_name?: string | null;
  tipo?: string;
  obra_codigo?: number;
  obra_nome?: string | null;
  data_hora?: string;
  litros?: number;
  combustivel_tipo?: string | null;
  nota_numero?: string | number | null;
  nota_storage_path?: string | null;
  valor_unitario?: string | number | null;
  fornecedor_texto?: string | null;
  placa_texto?: string | null;
  placa_caminhao?: string | null;
  tanque_texto?: string | null;
  tanque_operador_nome?: string | null;
  tanque_assinatura_operador_storage_path?: string | null;
  tanque_assinatura_melosa_storage_path?: string | null;
  fornecedor_nome?: string | null;
  ativo_equipamento_nome?: string | null;
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

function fmtValorUnitario(m: LinhaTanque): string {
  if (!isEntradaTanque(m)) return "—";
  const v = m.valor_unitario;
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return fmt(v);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
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
    medidorTanqueInicial: null,
    medidorTanqueFinal: null,
    litros: calcQuantidadeLitros(m),
    placaTexto: m.placa_texto != null ? String(m.placa_texto) : undefined,
  };
}

function isTicketavelTanque(m: LinhaTanque): boolean {
  return isEntradaTanque(m) || isRetiradaTanque(m);
}

function buildTanqueTicketRow(m: LinhaTanque): TanqueTicketRow {
  const responsavel =
    typeof m.tanque_operador_nome === "string" && m.tanque_operador_nome.trim()
      ? m.tanque_operador_nome.trim()
      : typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
        ? m.usuario_full_name.trim()
        : "—";
  const entrada = isEntradaTanque(m);
  const nota = m.nota_numero != null && String(m.nota_numero).trim() ? String(m.nota_numero).trim() : "";
  const assinaturaMotoristaPath =
    typeof m.tanque_assinatura_melosa_storage_path === "string"
      ? m.tanque_assinatura_melosa_storage_path
      : null;
  const assinaturaOperadorPath =
    typeof m.tanque_assinatura_operador_storage_path === "string"
      ? m.tanque_assinatura_operador_storage_path
      : null;
  const movimento = entrada ? "Entrada" : "Saída";
  const obsBase = m.obs != null && String(m.obs).trim() ? String(m.obs).trim() : "";
  const observacoes = obsBase ? `${movimento} · ${obsBase}` : movimento;

  return {
    numero: fmtTicketNumero(m.ticket_numero),
    data: fmtDateOnly(m.data_hora),
    responsavelAbastecimento: responsavel,
    placaAtivo: entrada ? (nota ? `NF ${nota}` : fmtPlacaRow(m)) : fmtPatrimonioRow(m),
    insumo: fmtInsumoTicket(m),
    horimetro: "—",
    litros: fmtQuantidade(m),
    nomeMotorista: entrada ? responsavel : fmt(m.tanque_texto),
    equipamento: entrada
      ? fmtEquipamentoTicketLabel(m.fornecedor_texto, m.fornecedor_nome ?? m.ativo_equipamento_nome)
      : fmtPatrimonioRow(m),
    obra: fmtObra(m),
    observacoes,
    assinaturaMotoristaPath,
    assinaturaOperadorPath,
  };
}

const PAGE_SIZE = 500;
/** Altura visível ≈ 10 linhas + cabeçalho; o restante rola na barra lateral */
const TABLE_SCROLL_MAX_HEIGHT = "min(28.5rem, 52vh)";

const labelCls =
  "flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const thCls =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-white/30 bg-white/50 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300";

const tdCls =
  "border-b border-white/25 px-3 py-2 align-middle text-slate-800 dark:border-white/5 dark:text-slate-200";

const tdPhotoCls =
  "border-b border-white/25 px-2 py-2 text-center align-middle dark:border-white/5";

type TanqueTableVariant = "entrada" | "retirada";

type TanqueTableProps = {
  title: string;
  subtitle: string;
  variant: TanqueTableVariant;
  rows: LinhaTanque[];
  loading: boolean;
  emptyMessage: string;
  authToken: string;
  selectedKeys: string[];
  setSelectedKeys: Dispatch<SetStateAction<string[]>>;
  rowKey: (m: LinhaTanque) => string;
  onOpenPhoto: (src: string) => void;
};

function TanqueBiScrollTable({
  title,
  subtitle,
  variant,
  rows,
  loading,
  emptyMessage,
  authToken,
  selectedKeys,
  setSelectedKeys,
  rowKey,
  onOpenPhoto,
}: TanqueTableProps) {
  const isRetiradaTable = variant === "retirada";
  const isEntradaTable = variant === "entrada";
  const colCount = isRetiradaTable ? 15 : 14;
  const visibleKeys = useMemo(() => rows.map((m) => rowKey(m)), [rows, rowKey]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.includes(k));

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${glassPanel} p-0`}>
      <div className="border-b border-white/40 px-4 py-3 dark:border-white/10">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="table-scroll" style={{ maxHeight: TABLE_SCROLL_MAX_HEIGHT }}>
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
                        return Array.from(new Set([...prev, ...visibleKeys]));
                      }
                      const visibleSet = new Set(visibleKeys);
                      return prev.filter((k) => !visibleSet.has(k));
                    });
                  }}
                  aria-label={`Selecionar todas em ${title}`}
                />
              </th>
              <th className={thCls}>Data/hora</th>
              <th className={thCls}>Obra</th>
              <th className={thCls}>Usuário</th>
              <th className={thCls}>Litros</th>
              <th className={thCls}>Insumo</th>
              {isEntradaTable ? (
                <>
                  <th className={thCls}>Nº nota</th>
                  <th className={thCls}>Foto nota</th>
                  <th className={thCls}>Valor unit. (L)</th>
                  <th className={thCls}>Fornecedor</th>
                </>
              ) : null}
              <th className={thCls}>Patrimônio</th>
              {isRetiradaTable ? <th className={thCls}>Horímetro</th> : null}
              <th className={thCls}>Tanque</th>
              {isRetiradaTable ? (
                <>
                  <th className={thCls}>Lacre tanque</th>
                  <th className={thCls}>Foto lacre T.</th>
                  <th className={thCls}>Lacre melosa</th>
                  <th className={thCls}>Foto lacre M.</th>
                </>
              ) : null}
              <th className={thCls}>Local</th>
              <th className={thCls}>Obs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, idx) => {
              const insumo = fmtCombustivelCurto(m.combustivel_tipo);
              const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";
              const k = rowKey(m);
              const checked = selectedKeys.includes(k);
              const usuarioCell =
                typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
                  ? m.usuario_full_name.trim()
                  : "—";
              const photo = (path: string | undefined, label = "Abrir") => (
                <StoragePhotoCell
                  storagePath={path}
                  token={authToken}
                  onOpen={onOpenPhoto}
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
                  <td className={`${tdCls} whitespace-nowrap font-semibold`}>
                    <div className="flex items-center gap-2">
                      <span>{fmtQuantidade(m)}</span>
                      {isRetiradaTable
                        ? photo(storagePath(m, "tanque_quantidade_abastecida_storage_path"), "Medidor")
                        : null}
                    </div>
                  </td>
                  <td className={`${tdCls} max-w-[120px]`}>{insumo}</td>
                  {isEntradaTable ? (
                    <>
                      <td className={`${tdCls} max-w-[100px]`}>{fmt(m.nota_numero)}</td>
                      <td className={tdPhotoCls}>
                        {photo(storagePath(m, "nota_storage_path"), "Nota")}
                      </td>
                      <td className={`${tdCls} max-w-[120px] whitespace-nowrap`}>{fmtValorUnitario(m)}</td>
                      <td className={`${tdCls} max-w-[160px]`}>{fmtFornecedorRow(m)}</td>
                    </>
                  ) : null}
                  <td className={`${tdCls} max-w-[120px]`}>{fmtPatrimonioRow(m)}</td>
                  {isRetiradaTable ? (
                    <td className={`${tdCls} max-w-[120px]`}>{fmtHorimetroRow(m)}</td>
                  ) : null}
                  <td className={`${tdCls} max-w-[72px]`}>{fmtTanqueNumRow(m)}</td>
                  {isRetiradaTable ? (
                    <>
                      <td className={`${tdCls} max-w-[100px]`}>{fmt(m.lacre_tanque_numero)}</td>
                      <td className={tdPhotoCls}>
                        {photo(storagePath(m, "lacre_tanque_storage_path"), "Lacre T.")}
                      </td>
                      <td className={`${tdCls} max-w-[100px]`}>{fmt(m.lacre_melosa_numero)}</td>
                      <td className={tdPhotoCls}>
                        {photo(storagePath(m, "lacre_melosa_storage_path"), "Lacre M.")}
                      </td>
                    </>
                  ) : null}
                  <td className={`${tdCls} max-w-[200px]`}>{fmtLocal(m)}</td>
                  <td className={`${tdCls} max-w-[200px]`}>{fmt(m.obs)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.length > 10 ? (
        <p className="border-t border-white/30 px-4 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          {rows.length} registros — use a barra de rolagem para ver além das 10 primeiras linhas.
        </p>
      ) : null}
    </div>
  );
}

export default function TanqueBIPage() {
  const { token } = useAuth();
  const periodoInicial = defaultPeriodoMesAtual();
  const [raw, setRaw] = useState<LinhaTanque[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataDe, setDataDe] = useState(toDateInputValue(periodoInicial.de));
  const [dataAte, setDataAte] = useState(toDateInputValue(periodoInicial.ate));
  const [empresaFiltro, setEmpresaFiltro] = useState<"" | ObraEmpresa>("");
  const [contratoFiltro, setContratoFiltro] = useState("");
  const [ticketFiltro, setTicketFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketRows, setTicketRows] = useState<TanqueTicketRow[]>([]);
  const [retiradaEquipOpen, setRetiradaEquipOpen] = useState(false);

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
      const obrasJson = await apiGet<{ obras: ObraRow[] }>("/v1/obras", token);
      setRaw(rows);
      setObras(obrasJson?.obras ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
  }, [load]);

  const obrasContratoOpcoes = useMemo(
    () => filtrarObrasPorEmpresa(obras, empresaFiltro),
    [obras, empresaFiltro],
  );

  const obraCodigosEmpresa = useMemo(
    () => obraCodigosDaEmpresa(obras, empresaFiltro),
    [obras, empresaFiltro],
  );

  useEffect(() => {
    if (!contratoFiltro) return;
    const cod = Number(contratoFiltro);
    if (!obrasContratoOpcoes.some((o) => o.codigo === cod)) {
      setContratoFiltro("");
    }
  }, [contratoFiltro, obrasContratoOpcoes]);

  const filtros = useMemo(
    () => ({
      de: parseDateInputValue(dataDe),
      ate: parseDateInputValue(dataAte),
      obraCodigo: contratoFiltro ? Number(contratoFiltro) : null,
    }),
    [contratoFiltro, dataAte, dataDe],
  );

  const filtradas = useMemo(() => {
    let rows = raw.filter((r) => passesDashboardFilters(r, filtros));
    if (obraCodigosEmpresa) {
      rows = rows.filter(
        (r) => typeof r.obra_codigo === "number" && obraCodigosEmpresa.has(r.obra_codigo),
      );
    }
    const ticketQ = ticketFiltro.trim();
    if (ticketQ) {
      rows = rows.filter((r) => ticketNumeroParaFiltro(r.ticket_numero).includes(ticketQ));
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      const qCompact = busca.trim().toUpperCase().replace(/\s+/g, "");
      rows = rows.filter((r) => {
        if (JSON.stringify(r).toLowerCase().includes(q)) return true;
        if (!qCompact) return false;
        return [r.placa_texto, r.placa_caminhao, r.fornecedor_texto]
          .map((v) => String(v ?? "").toUpperCase().replace(/\s+/g, ""))
          .some((p) => p.length > 0 && p.includes(qCompact));
      });
    }
    return rows;
  }, [raw, busca, filtros, obraCodigosEmpresa, ticketFiltro]);

  const filtroTextoAtivo = Boolean(busca.trim() || contratoFiltro || empresaFiltro || ticketFiltro.trim());

  const retiradasFiltradas = useMemo(() => filtradas.filter(isRetiradaTanque), [filtradas]);
  const entradasFiltradas = useMemo(() => filtradas.filter(isEntradaTanque), [filtradas]);

  const rowKey = useCallback((m: LinhaTanque) => biMovementRowKey(m), []);

  const selectedRows = useMemo(
    () => resolveSelectedRows(filtradas, selectedKeys, (row) => biMovementRowKey(row)),
    [filtradas, selectedKeys],
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

  const ticketVariant = useMemo((): ObraEmpresa => {
    const set = empresasDasLinhas(
      obras,
      selectedTicketRows.map((r) => r.obra_codigo),
    );
    if (set.has("DIMENSIONAL")) return "DIMENSIONAL";
    return "DELURB";
  }, [obras, selectedTicketRows]);

  const openTicket = useCallback(async () => {
    if (!token) return;
    const empresas = empresasDasLinhas(
      obras,
      selectedTicketRows.map((r) => r.obra_codigo),
    );
    if (empresas.size > 1) {
      window.alert("Selecione registros de uma única empresa para gerar o ticket.");
      return;
    }

    const operationIds = selectedTicketRows
      .map((r) => (typeof r.operation_id === "string" ? r.operation_id : ""))
      .filter(Boolean);
    if (operationIds.length === 0) return;

    setLoading(true);
    try {
      const json = (await apiPost("/v1/tickets/numeros", token, {
        origem: "tanque",
        operation_ids: operationIds,
      })) as { numeros?: Record<string, number> };
      const numeros = json?.numeros ?? {};
      setRaw((prev) =>
        prev.map((r) => {
          const op = typeof r.operation_id === "string" ? r.operation_id : "";
          const n = op ? numeros[op] : undefined;
          if (n != null) return { ...r, ticket_numero: n };
          return r;
        }),
      );

      const selectedWithNumeros = selectedTicketRows.map((r) => {
        const op = typeof r.operation_id === "string" ? r.operation_id : "";
        const n = op ? numeros[op] : undefined;
        return n != null ? { ...r, ticket_numero: n } : r;
      });

      const withDescricao = await enrichMelosaRowsWithEquipamentoDescricao(
        selectedWithNumeros,
        async (ativo, obraCodigo) => {
          const tryLookup = async (obra: number | null) => {
            try {
              const json = (await apiPost("/v1/equipamentos/qr/lookup", token, {
                qr: ativo,
                obra_codigo: obra,
              })) as { equipamento?: { nome?: string | null } };
              const nome = json.equipamento?.nome?.trim();
              return nome ? { nome } : null;
            } catch {
              return null;
            }
          };
          const comObra = await tryLookup(obraCodigo);
          if (comObra?.nome) return comObra;
          if (obraCodigo != null) return tryLookup(null);
          return null;
        },
      );

      const rowsForTicket = withDescricao.map((r) => buildTanqueTicketRow(r));
      setTicketRows(rowsForTicket);
      setTicketOpen(true);

      void enrichMelosaTicketRowsWithSignatures(token, rowsForTicket).then((enriched) => {
        setTicketRows(enriched);
        const semPaths = enriched.every(
          (r) => !r.assinaturaMotoristaPath?.trim() && !r.assinaturaOperadorPath?.trim(),
        );
        const falhaCarregar = enriched.some(
          (r) =>
            (r.assinaturaMotoristaPath?.trim() && !r.assinaturaMotoristaUrl) ||
            (r.assinaturaOperadorPath?.trim() && !r.assinaturaOperadorUrl),
        );
        if (falhaCarregar) {
          window.alert("Não foi possível carregar as assinaturas. Reinicie a API e tente novamente.");
        } else if (semPaths) {
          window.alert(
            "Este registro não tem assinaturas salvas. Use um registro feito no app com assinatura na última página.",
          );
        }
      });
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao gerar número do ticket");
    } finally {
      setLoading(false);
    }
  }, [obras, selectedTicketRows, token]);

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
    <div className="page-shell">
      <header className={`${glassPanel} px-4 py-4 text-center sm:px-5 sm:py-5 md:text-left`}>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl md:text-3xl dark:text-white">BI — Tanque</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Quantidade (L): entrada usa o campo litros da nota. Na saída, litros = medidor final − medidor
          inicial (medidor acumulado sobe ao abastecer; ex.: 50 → 5000 = 4950 L).
          O Excel Descarbonize usa a mesma planilha modelo do BI abastecimentos; só as retiradas entram na exportação.
        </p>
      </header>

      <div className={`flex flex-wrap items-end gap-3 p-3 sm:gap-4 sm:p-4 ${glassPanel}`}>
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
          <span className={labelCls}>De</span>
          <input type="date" className={glassField} value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Até</span>
          <input type="date" className={glassField} value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </div>
        <div className="filter-field-md">
          <span className={labelCls}>Empresa</span>
          <select
            className={glassSelect}
            value={empresaFiltro}
            onChange={(e) => setEmpresaFiltro(e.target.value as "" | ObraEmpresa)}
          >
            <option value="">Todas</option>
            {OBRA_EMPRESAS.map((e) => (
              <option key={e} value={e}>
                {EMPRESA_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field-md">
          <span className={labelCls}>Contrato</span>
          <select className={glassSelect} value={contratoFiltro} onChange={(e) => setContratoFiltro(e.target.value)}>
            <option value="">Todos</option>
            {obrasContratoOpcoes.map((o) => (
              <option key={o.codigo} value={String(o.codigo)}>
                {o.codigo} — {o.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <span className={labelCls}>Nº ticket</span>
          <input
            type="search"
            inputMode="numeric"
            className={glassField}
            placeholder="Ex.: 4586"
            value={ticketFiltro}
            onChange={(e) => setTicketFiltro(e.target.value)}
          />
        </div>
        <div className="filter-field-wide">
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
        <strong className="text-slate-900 dark:text-white">{retiradasFiltradas.length}</strong> retirada
        {retiradasFiltradas.length === 1 ? "" : "s"} ·{" "}
        <strong className="text-slate-900 dark:text-white">{entradasFiltradas.length}</strong> entrada
        {entradasFiltradas.length === 1 ? "" : "s"}
        {filtroTextoAtivo ? " (filtrado)" : ""} ·{" "}
        <strong className="text-slate-900 dark:text-white">{retiradasFiltradas.length}</strong> para Excel ·{" "}
        <strong className="text-slate-900 dark:text-white">{mapPoints.length}</strong> no mapa.
      </p>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-300/80 bg-red-50/90 px-4 py-3 text-sm font-semibold text-red-800 backdrop-blur-md dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className={`mb-4 flex flex-wrap items-center justify-end gap-2 ${glassPanel} px-4 py-3`}>
        <button
          type="button"
          onClick={() => setRetiradaEquipOpen(true)}
          disabled={loading}
          className="mr-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Retirar para equipamento
        </button>
        <button
          type="button"
          onClick={() => void openTicket()}
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
          {selectedOperationIds.length} selecionada{selectedOperationIds.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <div className="grid gap-5 xl:grid-cols-2">
          <TanqueBiScrollTable
            title="Retirada do tanque"
            subtitle="Retiradas do tanque (saída para abastecimento)"
            variant="retirada"
            rows={retiradasFiltradas}
            loading={loading}
            emptyMessage="Nenhuma retirada registrada."
            authToken={authToken}
            selectedKeys={selectedKeys}
            setSelectedKeys={setSelectedKeys}
            rowKey={rowKey}
            onOpenPhoto={setLightboxSrc}
          />
          <TanqueBiScrollTable
            title="Entrada"
            subtitle="Entradas de combustível no tanque da obra"
            variant="entrada"
            rows={entradasFiltradas}
            loading={loading}
            emptyMessage="Nenhuma entrada registrada."
            authToken={authToken}
            selectedKeys={selectedKeys}
            setSelectedKeys={setSelectedKeys}
            rowKey={rowKey}
            onOpenPhoto={setLightboxSrc}
          />
        </div>

        <div className={`flex min-h-0 flex-col overflow-hidden ${glassPanel} p-0`}>
          <div className="border-b border-white/40 px-4 py-3 dark:border-white/10">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Mapa das localizações</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Retiradas e entradas com coordenadas GPS
            </p>
          </div>
          <div className="relative min-h-[360px] overflow-hidden rounded-b-2xl md:min-h-[420px]">
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
        <TanqueTicketModal
          rows={ticketRows}
          variant={ticketVariant}
          apiToken={token ?? undefined}
          onClose={() => setTicketOpen(false)}
        />
      ) : null}

      <TanqueRetiradaEquipamentoModal
        open={retiradaEquipOpen}
        obras={obras}
        apiBase={apiBase}
        token={authToken}
        onClose={() => setRetiradaEquipOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
