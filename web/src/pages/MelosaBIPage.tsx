import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ImagePanZoomLightbox from "../components/bi/ImagePanZoomLightbox";
import MelosaMovimentacaoFormModal, {
  type MelosaMovimentacaoFormRow,
} from "../components/bi/MelosaMovimentacaoFormModal";
import MelosaFotosModal, { type MelosaFotosRow } from "../components/bi/MelosaFotosModal";
import MelosaTicketModal, { type MelosaTicketRow } from "../components/bi/MelosaTicketModal";
import StoragePhotoCell from "../components/bi/StoragePhotoCell";
import MovementsMap, { type MapPoint } from "../components/bi/MovementsMap";
import { useAuth } from "../state/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { fmtTicketNumero, ticketNumeroParaFiltro } from "../lib/ticketNumero";
import { downloadMelosaDescarbonizeExcel, type MelosaExcelRowInput } from "../lib/melosaDescarbonizeExcel";
import {
  aggregateEquipamentosNaoCadastrados,
  downloadMelosaEquipamentosNaoCadastradosExcel,
} from "../lib/melosaEquipamentosNaoCadastradosExcel";
import {
  downloadMelosaBiResumoExcel,
  type MelosaBiResumoRow,
} from "../lib/melosaBiResumoExcel";
import { enrichMelosaTicketRowsWithSignatures, fetchMelosaPhotoSignedUrl } from "../lib/melosaPhotoUrl";
import { labelEquipamentoEmpresa } from "../lib/equipamentoEmpresa";
import { fmtEquipamentoTicketLabel, enrichMelosaRowsWithEquipamentoDescricao } from "../lib/equipamentoTicketLabel";
import { biTableRowKey, resolveSelectedRows } from "../lib/biSelection";
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

type LinhaMelosa = Record<string, unknown> & {
  id?: string;
  operation_id?: string;
  ticket_numero?: number | null;
  usuario_id?: string;
  obra_codigo?: number;
  obra_nome?: string | null;
  data_hora?: string;
  placa_texto?: string | null;
  ativo_melosa_texto?: string | null;
  ativo_equipamento_texto?: string | null;
  fornecedor_texto?: string | null;
  ativo_equipamento_nome?: string | null;
  ativo_equipamento_empresa?: string | null;
  tanque_numero?: number | string | null;
  melosa_combustivel_tipo_registro?: string | null;
  melosa_combustivel_tipo_retirada?: string | null;
  melosa_quantidade_abastecida?: string | null;
  melosa_quantidade_abastecida_storage_path?: string | null;
  melosa_equipamento_operador_storage_path?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  melosa_horimetro_equipamento_abastecido_storage_path?: string | null;
  melosa_motorista_equipamento_abastecido?: string | null;
  melosa_operador_nome?: string | null;
  melosa_assinatura_operador_storage_path?: string | null;
  melosa_assinatura_motorista_storage_path?: string | null;
  melosa_categoria?: string | null;
  melosa_lubrificado?: boolean | null;
  litros?: number | string | null;
  local_latitude?: number | string | null;
  local_longitude?: number | string | null;
  local_address?: string | null;
  usuario_full_name?: string | null;
  obs?: string | null;
};

function toMelosaExcelInput(
  m: LinhaMelosa,
  mobilidadeByAtivo?: Map<string, string>,
): MelosaExcelRowInput {
  const ativoKey = normalizeAtivoKey(ativoEquipamentoRaw(m));
  return {
    obraCodigo: typeof m.obra_codigo === "number" ? m.obra_codigo : undefined,
    obraNome: m.obra_nome,
    melosaCategoria: m.melosa_categoria,
    equipamentoMobilidade: ativoKey ? mobilidadeByAtivo?.get(ativoKey) ?? null : null,
    dataHora: m.data_hora,
    insumoRetirada: m.melosa_combustivel_tipo_retirada,
    insumoRegistro: m.melosa_combustivel_tipo_registro,
    quantidadeAbastecida: m.melosa_quantidade_abastecida,
    placaTexto: m.ativo_melosa_texto ?? m.placa_texto,
    ativoEquipamento: m.ativo_equipamento_texto ?? m.fornecedor_texto,
  };
}

function empresaEquipamentoParaResumo(m: LinhaMelosa): string {
  const raw =
    typeof m.ativo_equipamento_empresa === "string" ? m.ativo_equipamento_empresa : null;
  const label = labelEquipamentoEmpresa(raw);
  return label === "—" ? "Sem empresa" : label;
}

function toNaoCadastradoInput(m: LinhaMelosa) {
  const empresaRaw =
    typeof m.ativo_equipamento_empresa === "string" ? m.ativo_equipamento_empresa : null;
  const empresa = labelEquipamentoEmpresa(empresaRaw);
  return {
    ativoEquipamento: ativoEquipamentoRaw(m),
    descricao: typeof m.ativo_equipamento_nome === "string" ? m.ativo_equipamento_nome : null,
    obraCodigo: typeof m.obra_codigo === "number" ? m.obra_codigo : undefined,
    obraNome: m.obra_nome,
    empresa: empresa === "—" ? null : empresa,
    dataHora: m.data_hora,
    quantidadeLitros: calcQuantidadeLitros(m),
  };
}

function toMelosaBiResumoRow(m: LinhaMelosa): MelosaBiResumoRow {
  const obraCodigo = typeof m.obra_codigo === "number" ? m.obra_codigo : undefined;
  const responsavelMelosa = (() => {
    const raw =
      typeof m.melosa_operador_nome === "string" && m.melosa_operador_nome.trim()
        ? m.melosa_operador_nome.trim()
        : "";
    const usuario =
      typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
        ? m.usuario_full_name.trim()
        : "";
    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return raw;
    if (usuario) return usuario;
    return raw || null;
  })();
  const motorista = m.melosa_motorista_equipamento_abastecido;
  return {
    empresa: empresaEquipamentoParaResumo(m),
    obraCodigo,
    obraNome: m.obra_nome,
    dataHora: m.data_hora,
    ativoMelosa: fmtAtivoPlaca(m) !== "—" ? fmtAtivoPlaca(m) : null,
    ativoEquipamento: fmtAtivoEquipamento(m) !== "—" ? fmtAtivoEquipamento(m) : null,
    insumo: fmtInsumoMel(m) !== "—" ? fmtInsumoMel(m) : null,
    quantidadeLitros: calcQuantidadeLitros(m),
    responsavelEquipamento:
      motorista != null && String(motorista).trim() ? String(motorista).trim() : null,
    responsavelMelosa,
    local: fmtLocal(m) !== "—" ? fmtLocal(m) : null,
  };
}

async function enrichMelosaBiResumoRowsWithPhotoUrls(
  rows: MelosaBiResumoRow[],
  linhas: LinhaMelosa[],
  token: string,
): Promise<MelosaBiResumoRow[]> {
  const cache = new Map<string, string | null>();
  const urlFor = async (path?: string) => {
    const p = path?.trim();
    if (!p) return null;
    if (cache.has(p)) return cache.get(p) ?? null;
    const url = await fetchMelosaPhotoSignedUrl(token, p);
    cache.set(p, url);
    return url;
  };

  return Promise.all(
    rows.map(async (row, index) => {
      const m = linhas[index];
      const fotoQuantidadeUrl = await urlFor(storagePath(m, "melosa_quantidade_abastecida_storage_path"));
      return { ...row, fotoQuantidadeUrl };
    }),
  );
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
  const qtd = parseMedidorNumero(m.melosa_quantidade_abastecida);
  if (qtd != null && qtd > 0) return qtd;
  const litros = parseLitrosField(m.litros);
  if (litros != null && litros > 0) return litros;
  return null;
}

function fmtQuantidade(m: LinhaMelosa): string {
  const q = calcQuantidadeLitros(m);
  if (q == null) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(q);
}

function fmtHorimetro(m: LinhaMelosa): string {
  return fmt(m.melosa_horimetro_equipamento_abastecido_numero);
}

function fmtLubrificado(m: LinhaMelosa): string {
  return m.melosa_lubrificado === true ? "Sim" : "—";
}

function fmtUsuarioMelosa(m: LinhaMelosa): string {
  const nome = m.usuario_full_name;
  return typeof nome === "string" && nome.trim() ? nome.trim() : "—";
}

function looksLikeEmail(value: unknown): boolean {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function fmtOperadorMelosa(m: LinhaMelosa): string {
  const raw = typeof m.melosa_operador_nome === "string" ? m.melosa_operador_nome.trim() : "";
  const usuario = typeof m.usuario_full_name === "string" ? m.usuario_full_name.trim() : "";
  if (raw && !looksLikeEmail(raw)) return raw;
  if (usuario) return usuario;
  if (raw) return raw;
  return "—";
}

function fmtMotoristaMelosa(m: LinhaMelosa): string {
  const nome = m.melosa_motorista_equipamento_abastecido;
  return typeof nome === "string" && nome.trim() ? nome.trim() : "—";
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
  const responsavel = fmtOperadorMelosa(m);
  const assinaturaMotoristaPath =
    typeof m.melosa_assinatura_motorista_storage_path === "string"
      ? m.melosa_assinatura_motorista_storage_path
      : null;
  const assinaturaOperadorPath =
    typeof m.melosa_assinatura_operador_storage_path === "string"
      ? m.melosa_assinatura_operador_storage_path
      : null;
  return {
    numero: fmtTicketNumero(m.ticket_numero),
    data: fmtDateOnly(m.data_hora),
    responsavelAbastecimento: responsavel,
    placaAtivo: fmtAtivoPlaca(m),
    insumo: fmtInsumoTicket(m),
    horimetro: fmt(m.melosa_horimetro_equipamento_abastecido_numero),
    litros: fmtQuantidade(m),
    nomeMotorista: fmt(m.melosa_motorista_equipamento_abastecido),
    equipamento: fmtAtivoEquipamento(m),
    obra: fmtObra(m),
    observacoes: m.obs != null && String(m.obs).trim() ? String(m.obs).trim() : "",
    assinaturaMotoristaPath,
    assinaturaOperadorPath,
  };
}

function fmtAtivoPlaca(m: LinhaMelosa): string {
  return fmt(m.ativo_melosa_texto ?? m.placa_texto);
}

function fmtAtivoEquipamento(m: LinhaMelosa): string {
  return fmtEquipamentoTicketLabel(
    m.ativo_equipamento_texto ?? m.fornecedor_texto,
    m.ativo_equipamento_nome,
  );
}

function normalizeAtivoKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}

function ativoEquipamentoRaw(m: LinhaMelosa): string {
  return String(m.ativo_equipamento_texto ?? m.fornecedor_texto ?? "").trim();
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
  const lat = parseCoord(m.local_latitude);
  const lng = parseCoord(m.local_longitude);
  if (lat != null && lng != null) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  return "—";
}

function mapsUrlLocal(m: LinhaMelosa): string | null {
  const lat = parseCoord(m.local_latitude);
  const lng = parseCoord(m.local_longitude);
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
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
const TABLE_COL_COUNT = 17;
const TABLE_SCROLL_MAX_HEIGHT = "min(28.5rem, 52vh)";

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
  const [searchParams] = useSearchParams();
  const periodoInicial = defaultPeriodoMesAtual();
  const ativoUrl = searchParams.get("ativo")?.trim() ?? "";
  const deUrl = searchParams.get("de")?.trim() ?? "";
  const ateUrl = searchParams.get("ate")?.trim() ?? "";
  const opUrl = searchParams.get("op")?.trim() ?? "";
  const [raw, setRaw] = useState<LinhaMelosa[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataDe, setDataDe] = useState(deUrl || toDateInputValue(periodoInicial.de));
  const [dataAte, setDataAte] = useState(ateUrl || toDateInputValue(periodoInicial.ate));
  const [empresaFiltro, setEmpresaFiltro] = useState<"" | ObraEmpresa>("");
  const [contratoFiltro, setContratoFiltro] = useState("");
  const [ticketFiltro, setTicketFiltro] = useState("");
  const [busca, setBusca] = useState(ativoUrl);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketRows, setTicketRows] = useState<MelosaTicketRow[]>([]);
  const [patrimonioFiltro, setPatrimonioFiltro] = useState("");
  const [melosasCadastradas, setMelosasCadastradas] = useState<string[]>([]);
  const [equipamentosCadastrados, setEquipamentosCadastrados] = useState<Set<string>>(new Set());
  const [mobilidadeByAtivo, setMobilidadeByAtivo] = useState<Map<string, string>>(new Map());
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [formRow, setFormRow] = useState<MelosaMovimentacaoFormRow | null>(null);
  const [fotosOpen, setFotosOpen] = useState(false);
  const [fotosRow, setFotosRow] = useState<MelosaFotosRow | null>(null);
  const [highlightOp, setHighlightOp] = useState(opUrl);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHighlightOp(opUrl);
  }, [opUrl]);

  const apiBase = useMemo(() => import.meta.env.VITE_API_URL as string, []);

  const isEquipamentoNaoCadastrado = useCallback(
    (m: LinhaMelosa) => {
      if (equipamentosCadastrados.size === 0) return false;
      const raw = ativoEquipamentoRaw(m);
      if (!raw) return false;
      return !equipamentosCadastrados.has(normalizeAtivoKey(raw));
    },
    [equipamentosCadastrados],
  );

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
      const obrasJson = await apiGet<{ obras: ObraRow[] }>("/v1/obras", token);
      let melosasAtivos: string[] = [];
      try {
        const eqJson = await apiGet<{ equipamentos?: { ativo?: string }[] }>(
          "/v1/equipamentos?tipo=MELOSA",
          token,
        );
        melosasAtivos = (eqJson?.equipamentos ?? [])
          .map((e) => (typeof e.ativo === "string" ? e.ativo.trim().toUpperCase() : ""))
          .filter(Boolean);
      } catch {
        melosasAtivos = [];
      }
      // Considera qualquer ativo cadastrado (EQUIPAMENTO, MELOSA ou TANQUE) como "existente",
      // pois uma melosa pode abastecer a si mesma e já está cadastrada.
      let equipamentosAtivos = new Set<string>();
      let mobilidadeMap = new Map<string, string>();
      try {
        const eqJson = await apiGet<{ equipamentos?: { ativo?: string; placa?: string | null; mobilidade?: string | null }[] }>(
          "/v1/equipamentos",
          token,
        );
        for (const e of eqJson?.equipamentos ?? []) {
          const ativo = normalizeAtivoKey(e.ativo);
          const placa = normalizeAtivoKey(e.placa);
          const mobilidade =
            typeof e.mobilidade === "string" && e.mobilidade.trim()
              ? e.mobilidade.trim().toUpperCase()
              : null;
          if (ativo) {
            equipamentosAtivos.add(ativo);
            if (mobilidade) mobilidadeMap.set(ativo, mobilidade);
          }
          if (placa) {
            equipamentosAtivos.add(placa);
            if (mobilidade) mobilidadeMap.set(placa, mobilidade);
          }
        }
      } catch {
        equipamentosAtivos = new Set();
        mobilidadeMap = new Map();
      }
      setRaw(rows);
      setObras(obrasJson?.obras ?? []);
      setMelosasCadastradas(melosasAtivos);
      setEquipamentosCadastrados(equipamentosAtivos);
      setMobilidadeByAtivo(mobilidadeMap);
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

  const patrimoniosMelosaOpcoes = useMemo(() => {
    const set = new Set<string>(melosasCadastradas);
    raw.forEach((r) => {
      const v = r.ativo_melosa_texto ?? r.placa_texto;
      if (v != null && String(v).trim()) set.add(String(v).trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [melosasCadastradas, raw]);

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
    if (patrimonioFiltro) {
      const pat = patrimonioFiltro.trim().toUpperCase();
      rows = rows.filter((r) => {
        const v = String(r.ativo_melosa_texto ?? r.placa_texto ?? "").trim().toUpperCase();
        return v === pat;
      });
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      const qCompact = busca.trim().toUpperCase().replace(/\s+/g, "");
      rows = rows.filter((r) => {
        if (JSON.stringify(r).toLowerCase().includes(q)) return true;
        if (!qCompact) return false;
        return [
          r.ativo_melosa_texto,
          r.ativo_equipamento_texto,
          r.ativo_equipamento_nome,
          r.placa_texto,
          r.fornecedor_texto,
        ]
          .map((v) => String(v ?? "").toUpperCase().replace(/\s+/g, ""))
          .some((p) => p.length > 0 && p.includes(qCompact));
      });
    }
    return rows;
  }, [raw, busca, filtros, obraCodigosEmpresa, patrimonioFiltro, ticketFiltro]);

  const naoCadastradosFiltrados = useMemo(
    () => filtradas.filter(isEquipamentoNaoCadastrado),
    [filtradas, isEquipamentoNaoCadastrado],
  );

  const naoCadastradosUnicos = useMemo(() => {
    const keys = new Set<string>();
    for (const m of naoCadastradosFiltrados) {
      const key = normalizeAtivoKey(ativoEquipamentoRaw(m));
      if (key) keys.add(key);
    }
    return keys.size;
  }, [naoCadastradosFiltrados]);

  const filtroTextoAtivo = Boolean(
    busca.trim() || contratoFiltro || empresaFiltro || ticketFiltro.trim() || patrimonioFiltro,
  );

  useEffect(() => {
    if (!highlightOp || loading) return;
    const found = filtradas.some(
      (r) => String(r.operation_id ?? "").trim() === highlightOp,
    );
    if (!found) return;
    const el = document.getElementById(`mov-${highlightOp}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightOp(""), 6000);
    return () => window.clearTimeout(timer);
  }, [highlightOp, loading, filtradas]);

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

  const ticketVariant = useMemo((): ObraEmpresa => {
    const set = empresasDasLinhas(
      obras,
      selectedRows.map((r) => r.obra_codigo),
    );
    if (set.has("DIMENSIONAL")) return "DIMENSIONAL";
    return "DELURB";
  }, [obras, selectedRows]);

  const openTicket = useCallback(async () => {
    if (!token) return;
    const empresas = empresasDasLinhas(
      obras,
      selectedRows.map((r) => r.obra_codigo),
    );
    if (empresas.size > 1) {
      window.alert("Selecione registros de uma única empresa para gerar o ticket.");
      return;
    }

    const operationIds = selectedRows
      .map((r) => (typeof r.operation_id === "string" ? r.operation_id : ""))
      .filter(Boolean);
    if (operationIds.length === 0) return;

    setLoading(true);
    try {
      const json = (await apiPost("/v1/tickets/numeros", token, {
        origem: "melosa",
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

      const selectedWithNumeros = selectedRows.map((r) => {
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

      const rowsForTicket = withDescricao.map((r) => buildMelosaTicketRow(r));
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
  }, [obras, selectedRows, token]);

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
        operationId: typeof m.operation_id === "string" ? m.operation_id : undefined,
        dataHora: `${fmtDateOnly(m.data_hora)} ${fmtTimeOnly(m.data_hora)}`,
        usuario: fmtAtivoPlaca(m),
        registradoPor: fmtUsuarioMelosa(m),
        equipamento: fmtAtivoEquipamento(m),
        obra: fmtObra(m),
        litros: fmtQuantidade(m),
        municipio: municipioFromAddress(m.local_address),
        movimento: "saida",
      });
    });
    return out;
  }, [filtradas]);

  const focusOperationId = useMemo(() => {
    if (selectedRows.length === 0) return null;
    const last = selectedRows[selectedRows.length - 1];
    return typeof last.operation_id === "string" ? last.operation_id : null;
  }, [selectedRows]);

  const focusPointDisponivel = useMemo(
    () => Boolean(focusOperationId) && mapPoints.some((p) => p.operationId === focusOperationId),
    [focusOperationId, mapPoints],
  );

  useEffect(() => {
    if (!focusPointDisponivel) return;
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusOperationId, focusPointDisponivel]);

  const openAddForm = useCallback(() => {
    setFormMode("add");
    setFormRow(null);
    setFormOpen(true);
  }, []);

  const openEditForm = useCallback(() => {
    if (selectedRows.length !== 1) return;
    const row = selectedRows[0];
    const operationId = typeof row.operation_id === "string" ? row.operation_id : "";
    if (!operationId) return;
    setFormMode("edit");
    setFormRow({
      operation_id: operationId,
      obra_codigo: typeof row.obra_codigo === "number" ? row.obra_codigo : undefined,
      data_hora: row.data_hora,
      ativo_melosa_texto: row.ativo_melosa_texto ?? row.placa_texto,
      ativo_equipamento_texto: row.ativo_equipamento_texto ?? row.fornecedor_texto,
      tanque_numero: row.tanque_numero,
      melosa_combustivel_tipo_retirada: row.melosa_combustivel_tipo_retirada,
      melosa_combustivel_tipo_registro: row.melosa_combustivel_tipo_registro,
      melosa_quantidade_abastecida: row.melosa_quantidade_abastecida,
      litros: row.litros,
      melosa_categoria: row.melosa_categoria,
      melosa_horimetro_equipamento_abastecido_numero: row.melosa_horimetro_equipamento_abastecido_numero,
      melosa_motorista_equipamento_abastecido: row.melosa_motorista_equipamento_abastecido,
      melosa_operador_nome: row.melosa_operador_nome,
      melosa_lubrificado: row.melosa_lubrificado,
      obs: row.obs != null ? String(row.obs) : null,
    });
    setFormOpen(true);
  }, [selectedRows]);

  const openFotosForm = useCallback(
    (row?: LinhaMelosa) => {
      const target = row ?? (selectedRows.length === 1 ? selectedRows[0] : null);
      if (!target) return;
      const operationId = typeof target.operation_id === "string" ? target.operation_id : "";
      if (!operationId) return;
      setFotosRow({
        operation_id: operationId,
        obra_codigo: typeof target.obra_codigo === "number" ? target.obra_codigo : null,
        data_hora: target.data_hora,
        ativo_equipamento_texto: target.ativo_equipamento_texto ?? target.fornecedor_texto ?? null,
        melosa_quantidade_abastecida_storage_path: storagePath(
          target,
          "melosa_quantidade_abastecida_storage_path",
        ),
        melosa_horimetro_equipamento_abastecido_storage_path: storagePath(
          target,
          "melosa_horimetro_equipamento_abastecido_storage_path",
        ),
        melosa_equipamento_operador_storage_path: storagePath(
          target,
          "melosa_equipamento_operador_storage_path",
        ),
        melosa_assinatura_operador_storage_path: storagePath(
          target,
          "melosa_assinatura_operador_storage_path",
        ),
        melosa_assinatura_motorista_storage_path: storagePath(
          target,
          "melosa_assinatura_motorista_storage_path",
        ),
      });
      setFotosOpen(true);
    },
    [selectedRows],
  );

  const handleFormSaved = useCallback(() => {
    setSelectedKeys([]);
    void load();
  }, [load]);

  const handleFotosSaved = useCallback(() => {
    void load();
  }, [load]);

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

  const handleExportExcelResumo = useCallback(async () => {
    if (filtradas.length === 0) {
      window.alert("Não há registros para exportar.");
      return;
    }
    if (!token?.trim()) {
      window.alert("Sessão expirada. Faça login novamente.");
      return;
    }
    try {
      const baseRows = filtradas.map((m) => toMelosaBiResumoRow(m));
      const rows = await enrichMelosaBiResumoRowsWithPhotoUrls(baseRows, filtradas, token);
      await downloadMelosaBiResumoExcel(rows, {
        periodoDe: dataDe,
        periodoAte: dataAte,
        filenamePrefix: "bi-melosa-resumo",
      });
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao exportar Excel resumo");
    }
  }, [dataAte, dataDe, filtradas, token]);

  const handleExportExcel = useCallback(async () => {
    if (filtradas.length === 0) {
      window.alert("Não há registros para exportar.");
      return;
    }
    try {
      await downloadMelosaDescarbonizeExcel(
        filtradas.map((m) => toMelosaExcelInput(m, mobilidadeByAtivo)),
        "bi-melosa",
      );
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao exportar Excel");
    }
  }, [filtradas, mobilidadeByAtivo]);

  const handleExportNaoCadastrados = useCallback(async () => {
    if (naoCadastradosFiltrados.length === 0) {
      window.alert("Não há equipamentos não cadastrados nos registros filtrados.");
      return;
    }
    try {
      const rows = aggregateEquipamentosNaoCadastrados(
        naoCadastradosFiltrados.map((m) => toNaoCadastradoInput(m)),
      );
      await downloadMelosaEquipamentosNaoCadastradosExcel(rows, {
        periodoDe: dataDe,
        periodoAte: dataAte,
        filenamePrefix: "bi-melosa-nao-cadastrados",
      });
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao exportar equipamentos não cadastrados");
    }
  }, [dataAte, dataDe, naoCadastradosFiltrados]);

  const authToken = token ?? "";

  return (
    <div className="page-shell flex flex-col">
      <header className={`${glassPanel} px-4 py-4 text-center sm:px-5 sm:py-5 md:text-left`}>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl md:text-3xl dark:text-white">BI — Abastecimentos</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Quantidade (L) informada no app na retirada melosa. Use <strong>Exportar Excel Resumo</strong> para a planilha
          organizada por empresa do equipamento; <strong>Descarbonize</strong> preenche o modelo GHG (uma aba por mês) a partir da linha 2.
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
          <span className={labelCls}>Movimentação</span>
          <button
            type="button"
            onClick={openAddForm}
            disabled={loading}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover disabled:opacity-50"
          >
            Adicionar movimentação
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Exportação</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportExcelResumo}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              Exportar Excel Resumo
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
            >
              Exportar Excel Descarbonize
            </button>
            <button
              type="button"
              onClick={handleExportNaoCadastrados}
              disabled={naoCadastradosUnicos === 0}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Exportar não cadastrados
              {naoCadastradosUnicos > 0 ? ` (${naoCadastradosUnicos})` : ""}
            </button>
          </div>
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
        <div className="filter-field-md">
          <span className={labelCls}>Patrimônio melosa</span>
          <select
            className={glassSelect}
            value={patrimonioFiltro}
            onChange={(e) => setPatrimonioFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            {patrimoniosMelosaOpcoes.map((p) => (
              <option key={p} value={p}>
                {p}
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

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Mostrando <strong className="text-slate-900 dark:text-white">{filtradas.length}</strong> de{" "}
        <strong className="text-slate-900 dark:text-white">{raw.length}</strong> linhas
        {filtroTextoAtivo ? " (filtrado)" : ""} ·{" "}
        <strong className="text-slate-900 dark:text-white">{mapPoints.length}</strong> com coordenadas no mapa.
      </p>

      {error ? (
        <div className="rounded-2xl border border-red-300/80 bg-red-50/90 px-4 py-3 text-sm font-semibold text-red-800 backdrop-blur-md dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center justify-between gap-2 ${glassPanel} px-4 py-3`}>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {filtradas.length} {filtradas.length === 1 ? "linha" : "linhas"} · {selectedOperationIds.length}{" "}
          selecionada{selectedOperationIds.length === 1 ? "" : "s"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openEditForm}
            disabled={loading || selectedRows.length !== 1}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Editar selecionada
          </button>
          <button
            type="button"
            onClick={() => openFotosForm()}
            disabled={loading || selectedRows.length !== 1}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Adicionar / fotos
          </button>
          <button
            type="button"
            onClick={() => void openTicket()}
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
        </div>
      </div>

      <div className={`flex min-w-0 flex-col overflow-hidden ${glassPanel} p-0`}>
        <div className="border-b border-white/40 px-4 py-3 dark:border-white/10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Movimentações Melosa</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Retiradas registradas no app — role horizontalmente se necessário
          </p>
          {(() => {
            const naoCadastrados = filtradas.filter(isEquipamentoNaoCadastrado).length;
            if (naoCadastrados === 0) return null;
            return (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-amber-200/80 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/25 dark:text-amber-100">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden />
                {naoCadastrados} equipamento(s) com patrimônio não cadastrado no sistema (destacados em amarelo)
              </p>
            );
          })()}
        </div>
        <div className="table-scroll" style={{ maxHeight: TABLE_SCROLL_MAX_HEIGHT }}>
          <table className="w-full min-w-[1320px] border-collapse text-sm">
            <thead>
              <tr className="text-left align-middle">
                <th className={`${thCls} w-10`}>
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
                  <th className={`${thCls} min-w-[150px]`}>Obra</th>
                  <th className={`${thCls} min-w-[120px]`}>Usuário</th>
                  <th className={`${thCls} min-w-[96px]`}>Data início</th>
                  <th className={`${thCls} min-w-[96px]`}>Data fim</th>
                  <th className={`${thCls} min-w-[72px]`}>Horário</th>
                  <th className={`${thCls} min-w-[110px]`}>Ativo Melosa</th>
                  <th className={`${thCls} min-w-[120px]`}>Ativo equipamento</th>
                  <th className={`${thCls} min-w-[88px]`}>Insumo</th>
                  <th className={`${thCls} min-w-[100px]`}>Quantidade (L)</th>
                  <th className={`${thCls} min-w-[100px]`}>Foto qtd. (L)</th>
                  <th className={`${thCls} min-w-[88px]`}>Horímetro</th>
                  <th className={`${thCls} min-w-[100px]`}>Foto horímetro</th>
                  <th className={`${thCls} min-w-[88px]`}>Lubrificado</th>
                  <th className={`${thCls} min-w-[120px]`}>Motorista</th>
                  <th className={`${thCls} min-w-[100px]`}>Foto operador</th>
                  <th className={`${thCls} min-w-[180px]`}>Local</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((m, idx) => {
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";
                  const k = rowKey(m, idx);
                  const checked = selectedKeys.includes(k);
                  const dataRef = fmtDateOnly(m.data_hora);
                  const opId = String(m.operation_id ?? "").trim();
                  const destacada = Boolean(highlightOp) && opId === highlightOp;

                  const photo = (path: string | undefined, label: string) => (
                    <StoragePhotoCell
                      storagePath={path}
                      token={authToken}
                      onOpen={setLightboxSrc}
                      api="melosa"
                      shortLabel={label}
                      onAddClick={() => openFotosForm(m)}
                    />
                  );

                  return (
                    <tr
                      key={k}
                      id={opId ? `mov-${opId}` : undefined}
                      className={`${zebra} ${
                        destacada
                          ? "outline outline-2 -outline-offset-2 outline-sky-500 bg-sky-100/70 dark:bg-sky-900/40"
                          : ""
                      }`}
                    >
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
                      <td className={`${tdCls} max-w-[200px] truncate`} title={fmtObra(m)}>
                        {fmtObra(m)}
                      </td>
                      <td className={`${tdCls} max-w-[140px] truncate`} title={fmtUsuarioMelosa(m)}>
                        {fmtUsuarioMelosa(m)}
                      </td>
                      <td className={`${tdCls} whitespace-nowrap`}>{dataRef}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{dataRef}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtTimeOnly(m.data_hora)}</td>
                      <td className={`${tdCls} max-w-[120px] truncate`} title={fmtAtivoPlaca(m)}>
                        {fmtAtivoPlaca(m)}
                      </td>
                      <td
                        className={`${tdCls} max-w-[140px] truncate ${
                          isEquipamentoNaoCadastrado(m)
                            ? "bg-amber-200/80 font-semibold text-amber-900 dark:bg-amber-500/30 dark:text-amber-100"
                            : ""
                        }`}
                        title={
                          isEquipamentoNaoCadastrado(m)
                            ? `${fmtAtivoEquipamento(m)} — patrimônio não cadastrado. Clique para cadastrar.`
                            : fmtAtivoEquipamento(m)
                        }
                      >
                        {isEquipamentoNaoCadastrado(m) ? (
                          <Link
                            to={`/equipamentos?novo=${encodeURIComponent(ativoEquipamentoRaw(m))}`}
                            className="underline decoration-dotted underline-offset-2 hover:text-amber-950 dark:hover:text-white"
                          >
                            {fmtAtivoEquipamento(m)}
                          </Link>
                        ) : (
                          fmtAtivoEquipamento(m)
                        )}
                      </td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtInsumoMel(m)}</td>
                      <td className={`${tdCls} whitespace-nowrap font-semibold`}>{fmtQuantidade(m)}</td>
                      <td className={tdPhotoCls}>
                        {photo(storagePath(m, "melosa_quantidade_abastecida_storage_path"), "Qtd. (L)")}
                      </td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtHorimetro(m)}</td>
                      <td className={tdPhotoCls}>
                        {photo(storagePath(m, "melosa_horimetro_equipamento_abastecido_storage_path"), "Horímetro")}
                      </td>
                      <td
                        className={`${tdCls} whitespace-nowrap text-center ${
                          m.melosa_lubrificado === true
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : ""
                        }`}
                      >
                        {fmtLubrificado(m)}
                      </td>
                      <td className={`${tdCls} max-w-[140px] truncate`} title={fmtMotoristaMelosa(m)}>
                        {fmtMotoristaMelosa(m)}
                      </td>
                      <td className={tdPhotoCls}>
                        {photo(storagePath(m, "melosa_equipamento_operador_storage_path"), "Operador")}
                      </td>
                      <td className={`${tdCls} max-w-[220px] truncate`} title={fmtLocal(m)}>
                        {(() => {
                          const label = fmtLocal(m);
                          const href = mapsUrlLocal(m);
                          if (label === "—" || !href) return label;
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent underline-offset-2 hover:underline"
                              title={label}
                            >
                              {label}
                            </a>
                          );
                        })()}
                      </td>
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

      <div ref={mapSectionRef} className={`flex min-w-0 flex-col overflow-hidden ${glassPanel} p-0`}>
        <div className="border-b border-white/40 px-4 py-3 dark:border-white/10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Mapa das localizações</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Pontos GPS das movimentações filtradas · selecione uma linha para focar no mapa
          </p>
        </div>
        <div className="relative min-h-[360px] overflow-hidden rounded-b-2xl md:min-h-[420px]">
          <MovementsMap points={mapPoints} focusKey={focusOperationId} />
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

      {formOpen ? (
        <MelosaMovimentacaoFormModal
          open={formOpen}
          mode={formMode}
          initialRow={formRow}
          obras={obras.map((o) => ({ codigo: o.codigo, nome: o.nome }))}
          melosasAtivos={patrimoniosMelosaOpcoes}
          apiBase={apiBase}
          token={authToken}
          onClose={() => setFormOpen(false)}
          onSaved={handleFormSaved}
        />
      ) : null}

      {fotosOpen ? (
        <MelosaFotosModal
          open={fotosOpen}
          row={fotosRow}
          apiBase={apiBase}
          token={authToken}
          onClose={() => setFotosOpen(false)}
          onSaved={handleFotosSaved}
          onOpenPhoto={setLightboxSrc}
        />
      ) : null}

      {ticketOpen && ticketRows.length > 0 ? (
        <MelosaTicketModal
          rows={ticketRows}
          variant={ticketVariant}
          apiToken={authToken || undefined}
          onClose={() => setTicketOpen(false)}
        />
      ) : null}
    </div>
  );
}
