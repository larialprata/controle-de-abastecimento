import { useCallback, useEffect, useMemo, useState } from "react";
import { Workbook } from "exceljs";
import ImagePanZoomLightbox from "../components/bi/ImagePanZoomLightbox";
import MovementsMap, { type MapPoint } from "../components/bi/MovementsMap";
import StoragePhotoCell from "../components/bi/StoragePhotoCell";
import { useAuth } from "../state/AuthContext";
import { glassField, glassPanel } from "../lib/glass";

type LinhaSupabase = Record<string, unknown> & {
  id?: string;
  operation_id?: string;
  usuario_id?: string;
  usuario_full_name?: string | null;
  tipo?: string;
  obra_codigo?: number;
  obra_nome?: string | null;
  data_hora?: string;
  litros?: number;
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  return String(v);
}

function fmtPlacaRow(m: LinhaSupabase): string {
  return fmt(m.placa_texto ?? m.placa_caminhao);
}

function fmtFornecedorRow(m: LinhaSupabase): string {
  return fmt(m.fornecedor_texto);
}

function fmtTanqueNumRow(m: LinhaSupabase): string {
  const n = m.tanque_numero;
  if (n === 1 || n === "1") return "1";
  if (n === 2 || n === "2") return "2";
  return "—";
}

function isRetiradaTanque(m: LinhaSupabase): boolean {
  return m.tipo === "RETIRADA_TANQUE";
}

function isEntradaTanque(m: LinhaSupabase): boolean {
  return m.tipo === "ENTRADA_TANQUE_OBRA";
}

function fmtPatrimonioRow(m: LinhaSupabase): string {
  return fmt(m.placa_texto ?? m.placa_caminhao);
}

function fmtEquipamentoRow(m: LinhaSupabase): string {
  return fmt(m.fornecedor_texto);
}

function fmtHorimetroRow(m: LinhaSupabase): string {
  return isRetiradaTanque(m) ? fmt(m.tanque_texto) : "—";
}

function storagePath(m: LinhaSupabase, key: string): string | undefined {
  const v = m[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const tdCls =
  "border-b border-white/25 px-3 py-2 align-middle text-slate-800 dark:border-white/5 dark:text-slate-200";

const tdPhotoCls =
  "border-b border-white/25 px-2 py-2 text-center align-middle dark:border-white/5";

const TABLE_COL_COUNT = 25;

function truncPath(s: string, max = 36): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function parseCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmtDateBr(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
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
  if (upper.includes("DIESEL")) return "DIESEL";
  return raw.replaceAll("_", " ");
}

function toExcelNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function excelCellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "object" && v && "text" in (v as Record<string, unknown>)) {
    const t = (v as Record<string, unknown>).text;
    return typeof t === "string" ? t : "";
  }
  return String(v);
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

const TIPOS = ["", "ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE", "RETIRADA_MELOSA"] as const;
const PAGE_SIZE = 500;

const labelCls =
  "flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

type DadosPageProps = {
  fixedTipo?: "ENTRADA_TANQUE_OBRA" | "RETIRADA_TANQUE";
  title?: string;
};

const thCls =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-white/30 bg-white/50 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300";

export default function DadosPage({ fixedTipo, title }: DadosPageProps) {
  const { token } = useAuth();
  const [raw, setRaw] = useState<LinhaSupabase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const apiBase = useMemo(() => import.meta.env.VITE_API_URL as string, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows: LinhaSupabase[] = [];
      let offset = 0;
      for (let i = 0; i < 200; i += 1) {
        const res = await fetch(`${apiBase}/v1/movimentacoes?limit=${PAGE_SIZE}&offset=${offset}&origem=tanque`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
        const chunk = (json?.movimentacoes ?? []) as LinhaSupabase[];
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
    if (fixedTipo) {
      rows = rows.filter((r) => r.tipo === fixedTipo);
    } else if (filtroTipo) {
      rows = rows.filter((r) => r.tipo === filtroTipo);
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    return rows;
  }, [raw, fixedTipo, filtroTipo, busca]);

  const rowKey = useCallback((m: LinhaSupabase, idx: number) => {
    return `${String(m.operation_id ?? "")}-${String(m.id ?? idx)}-${idx}`;
  }, []);

  const visibleKeys = useMemo(() => filtradas.map((m, idx) => rowKey(m, idx)), [filtradas, rowKey]);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.includes(k));
  const selectedRows = useMemo(
    () => filtradas.filter((m, idx) => selectedKeys.includes(rowKey(m, idx))),
    [filtradas, rowKey, selectedKeys],
  );
  const selectedOperationIds = useMemo(() => {
    const set = new Set<string>();
    selectedRows.forEach((row) => {
      const op = typeof row.operation_id === "string" ? row.operation_id : "";
      if (op) set.add(op);
    });
    return Array.from(set);
  }, [selectedRows]);

  const mapRows = useMemo(() => {
    if (fixedTipo) return raw.filter((r) => r.tipo === fixedTipo);
    return raw;
  }, [raw, fixedTipo]);

  const mapPoints = useMemo((): MapPoint[] => {
    const out: MapPoint[] = [];
    mapRows.forEach((m, idx) => {
      const tipoTxt = String(m.tipo ?? "").toUpperCase();
      // const isEntrada = tipoTxt.includes("ENTRADA");
      const isSaida = tipoTxt.includes("RETIRADA");

      const lat = parseCoord(m.local_latitude);
      const lng = parseCoord(m.local_longitude);
      if (lat == null || lng == null) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      const when = fmtDateBr(m.data_hora);
      const nome =
        typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
          ? m.usuario_full_name.trim()
          : fmt(m.usuario_id) !== "—"
            ? truncPath(String(m.usuario_id), 14)
            : "—";
      const obra = `${m.obra_codigo ?? "—"}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`;
      const litros = fmt(m.litros);
      const municipio = municipioFromAddress(m.local_address);
      out.push({
        lat,
        lng,
        key: `${String(m.operation_id ?? "")}-${String(m.id ?? idx)}-${idx}`,
        dataHora: when,
        usuario: nome,
        obra,
        litros,
        municipio,
        movimento: isSaida ? "saida" : "entrada",
      });
    });
    return out;
  }, [mapRows]);

  const openDeleteConfirm = useCallback(() => {
    if (!token) return;
    if (selectedOperationIds.length === 0) return;
    setConfirmDeleteOpen(true);
  }, [token, selectedOperationIds.length]);

  const executeDeleteSelected = useCallback(async () => {
    if (!token) return;
    if (selectedOperationIds.length === 0) return;
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
    if (!token) return;
    if (selectedOperationIds.length !== 1) return;
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
    const monthNames = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    const signedPhotoUrlCache = new Map<string, string | null>();
    const resolveTanquePhotoUrl = async (pathValue: unknown): Promise<string | null> => {
      const path = typeof pathValue === "string" ? pathValue.trim() : "";
      if (!path || !token) return null;
      if (signedPhotoUrlCache.has(path)) return signedPhotoUrlCache.get(path) ?? null;
      try {
        const res = await fetch(`${apiBase}/v1/tanque/photo-url?path=${encodeURIComponent(path)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        const url = res.ok && typeof json?.url === "string" && json.url.trim() ? String(json.url).trim() : null;
        signedPhotoUrlCache.set(path, url);
        return url;
      } catch {
        signedPhotoUrlCache.set(path, null);
        return null;
      }
    };

    const photoLink = async (pathValue: unknown) => {
      const url = await resolveTanquePhotoUrl(pathValue);
      return url ? ({ text: "Abrir foto", hyperlink: url } as any) : "—";
    };

    const linhas = await Promise.all(filtradas.map(async (m) => {
      const movimento = isEntradaTanque(m) ? "Entrada" : isRetiradaTanque(m) ? "Saída" : "—";
      const local =
        m.local_address != null && String(m.local_address).trim()
          ? fmt(m.local_address)
          : [m.local_latitude, m.local_longitude].every((x) => x != null)
            ? `${fmt(m.local_latitude)}, ${fmt(m.local_longitude)}`
            : "—";
      const insumo = fmtCombustivelCurto(m.combustivel_tipo);
      const parsedDate = m.data_hora ? new Date(String(m.data_hora)) : null;
      const monthIndex = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getMonth() : null;

      return {
        monthIndex,
        row: [
          fmtDateBr(m.data_hora),
          `${m.obra_codigo ?? "—"}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`,
          typeof m.usuario_full_name === "string" && m.usuario_full_name.trim() ? m.usuario_full_name.trim() : "—",
          movimento,
          toExcelNumber(m.litros) ?? null,
          insumo,
          isEntradaTanque(m) ? fmt(m.nota_numero) : "—",
          isEntradaTanque(m) ? await photoLink(m.nota_storage_path) : "—",
          isEntradaTanque(m) ? toExcelNumber(m.valor_unitario) ?? null : null,
          fmtPatrimonioRow(m),
          fmtEquipamentoRow(m),
          fmtHorimetroRow(m),
          fmtTanqueNumRow(m),
          isRetiradaTanque(m) ? fmt(m.lacre_tanque_numero) : "—",
          isRetiradaTanque(m) ? await photoLink(m.lacre_tanque_storage_path) : "—",
          isRetiradaTanque(m) ? fmt(m.lacre_melosa_numero) : "—",
          isRetiradaTanque(m) ? await photoLink(m.lacre_melosa_storage_path) : "—",
          isRetiradaTanque(m) ? fmt(m.medidor_tanque_numero_inicial) : "—",
          isRetiradaTanque(m) ? await photoLink(m.medidor_tanque_foto_inicial_storage_path) : "—",
          isRetiradaTanque(m) ? fmt(m.medidor_tanque_numero_final) : "—",
          isRetiradaTanque(m) ? await photoLink(m.medidor_tanque_foto_final_storage_path) : "—",
          isRetiradaTanque(m) ? await photoLink(m.confirmacao_abastecimento_foto_storage_path) : "—",
          local,
          fmt(m.obs),
        ],
      };
    }));

    const workbook = new Workbook();
    const headers = [
      "Data/Hora",
      "Obra",
      "Usuário",
      "Movimento",
      "Quantidade (L)",
      "Insumo",
      "Nº nota",
      "Foto nota",
      "Valor unit. (L)",
      "Patrimônio (placa/ativo)",
      "Equipamento / fornecedor",
      "Horímetro/Hodômetro",
      "Tanque",
      "Nº lacre tanque",
      "Foto lacre tanque",
      "Nº lacre melosa",
      "Foto lacre melosa",
      "Medidor tanque ini.",
      "Foto med. ini.",
      "Medidor tanque fin.",
      "Foto med. fin.",
      "Foto confirmação",
      "Local",
      "OBS",
    ];

    const grouped = Array.from({ length: 12 }, () => [] as unknown[][]);
    linhas.forEach(({ monthIndex, row }) => {
      if (monthIndex == null || monthIndex < 0 || monthIndex > 11) return;
      grouped[monthIndex].push(row);
    });

    for (let m = 0; m < 12; m += 1) {
      const sheet = workbook.addWorksheet(monthNames[m]);
      const rows = grouped[m];
      const tableName = `MovMes${String(m + 1).padStart(2, "0")}`;

      sheet.mergeCells(1, 1, 1, headers.length);
      sheet.getCell(1, 1).value = `BI Tanque - ${monthNames[m]}`;
      sheet.getCell(1, 1).font = { name: "Arial", bold: true, size: 14 };
      sheet.getCell(1, 1).alignment = { horizontal: "center" };
      sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };

      sheet.addRow([]);
      sheet.addTable({
        name: tableName,
        ref: "A3",
        headerRow: true,
        totalsRow: true,
        style: {
          theme: "TableStyleMedium9",
          showRowStripes: true,
        },
        columns: headers.map((h, idx) => ({
          name: h,
          filterButton: true,
          totalsRowFunction: idx === 4 ? "sum" : undefined,
          totalsRowLabel: idx === 0 ? "Total Litros" : undefined,
        })),
        rows: rows as (string | number | null)[][],
      });
      sheet.views = [{ state: "frozen", ySplit: 3 }];

      const headerRowNumber = 3;
      const firstDataRow = 4;
      const lastDataRow = rows.length > 0 ? firstDataRow + rows.length - 1 : firstDataRow - 1;
      const totalRowNumber = firstDataRow + rows.length;

      for (let r = firstDataRow; r <= lastDataRow; r += 1) {
        sheet.getCell(r, 5).numFmt = "#,##0.00";
        sheet.getCell(r, 9).numFmt = "#,##0.00";
      }
      sheet.getCell(totalRowNumber, 5).numFmt = "#,##0.00";

      for (let r = firstDataRow; r <= lastDataRow; r += 1) {
        const bg = r % 2 === 0 ? "FFFFFFFF" : "FFF3FAF1";
        for (let c = 1; c <= headers.length; c += 1) {
          const cell = sheet.getCell(r, c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          cell.alignment = { vertical: "middle", horizontal: c === 5 || c === 9 ? "right" : "left" };
        }
      }

      for (let c = 1; c <= headers.length; c += 1) {
        const cell = sheet.getCell(headerRowNumber, c);
        cell.font = { name: "Arial", bold: true, size: 11 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }

      for (let r = 1; r <= totalRowNumber; r += 1) {
        for (let c = 1; c <= headers.length; c += 1) {
          const cell = sheet.getCell(r, c);
          cell.border = {
            top: { style: "thin", color: { argb: "FFB7D7A8" } },
            left: { style: "thin", color: { argb: "FFB7D7A8" } },
            bottom: { style: "thin", color: { argb: "FFB7D7A8" } },
            right: { style: "thin", color: { argb: "FFB7D7A8" } },
          };
          cell.font = {
            name: "Arial",
            size: cell.font?.size ?? 11,
            bold: cell.font?.bold ?? false,
            italic: cell.font?.italic ?? false,
            underline: cell.font?.underline,
            color: cell.font?.color,
          };
        }
      }

      const computedWidths = headers.map((h, colIndex) => {
        const maxDataLen = rows.reduce((acc, row) => {
          const txt = excelCellText(row[colIndex]);
          return Math.max(acc, txt.length);
        }, 0);
        const base = Math.max(h.length, maxDataLen) + 2;
        return Math.min(60, Math.max(10, base));
      });

      computedWidths.forEach((w, i) => {
        sheet.getColumn(i + 1).width = w;
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dataTag = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bi-tanque-${dataTag}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [apiBase, filtradas, token]);

  return (
    <div>
      <header className={`mb-6 ${glassPanel} px-5 py-5 text-center md:text-left`}>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white md:text-3xl">{title ?? "BI — tanque / obra"}</h1>
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
        {!fixedTipo ? (
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Tipo</span>
            <select className={glassField} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t || "all"} value={t}>
                  {t === "" ? "Todos" : t}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Movimentações</h2>
            <div className="flex items-center gap-2">
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
                {filtradas.length} {filtradas.length === 1 ? "linha" : "linhas"} · {selectedOperationIds.length} selecionada
                {selectedOperationIds.length === 1 ? "" : "s"}
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
                  const obra = `${m.obra_codigo ?? "—"}${m.obra_nome ? ` · ${m.obra_nome}` : ""}`;
                  const movimento = isEntradaTanque(m) ? "Entrada" : isRetiradaTanque(m) ? "Saída" : "—";
                  const insumo = fmtCombustivelCurto(m.combustivel_tipo);
                  const valorUnit =
                    isEntradaTanque(m) && m.valor_unitario != null && m.valor_unitario !== ""
                      ? fmt(m.valor_unitario)
                      : "—";
                  const local =
                    m.local_address != null && String(m.local_address).trim()
                      ? fmt(m.local_address)
                      : [m.local_latitude, m.local_longitude].every((x) => x != null)
                        ? `${fmt(m.local_latitude)}, ${fmt(m.local_longitude)}`
                        : "—";
                  const ret = isRetiradaTanque(m);
                  const ent = isEntradaTanque(m);

                  const zebra =
                    idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";

                  const usuarioCell =
                    typeof m.usuario_full_name === "string" && m.usuario_full_name.trim()
                      ? m.usuario_full_name.trim()
                      : "—";
                  const k = rowKey(m, idx);
                  const checked = selectedKeys.includes(k);
                  const authToken = token ?? "";

                  const photo = (path: string | undefined, label = "Abrir") => (
                    <StoragePhotoCell
                      storagePath={path}
                      token={authToken}
                      onOpen={setLightboxSrc}
                      shortLabel={label}
                    />
                  );

                  return (
                    <tr key={`${String(m.operation_id ?? "")}-${String(m.id ?? "")}`} className={zebra}>
                      <td className={`${tdCls} w-10`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setSelectedKeys((prev) =>
                              isChecked ? [...prev, k] : prev.filter((x) => x !== k)
                            );
                          }}
                          aria-label="Selecionar movimentação"
                        />
                      </td>
                      <td className={`${tdCls} max-w-[200px]`}>{fmtDateBr(m.data_hora)}</td>
                      <td className={`${tdCls} max-w-[220px]`}>{obra}</td>
                      <td
                        className={`${tdCls} max-w-[200px]`}
                        title={typeof m.usuario_id === "string" ? m.usuario_id : undefined}
                      >
                        {usuarioCell}
                      </td>
                      <td className={`${tdCls} max-w-[100px]`}>{movimento}</td>
                      <td className={tdCls}>{fmt(m.litros)}</td>
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
                      <td className={`${tdCls} max-w-[200px]`}>{local}</td>
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
    </div>
  );
}
