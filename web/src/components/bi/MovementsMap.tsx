import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from "@react-google-maps/api";

export type MapPoint = {
  lat: number;
  lng: number;
  key: string;
  dataHora?: string;
  usuario?: string;
  obra?: string;
  litros?: string;
  municipio?: string;
  movimento?: "entrada" | "saida";
};

function spreadOverlappingPoints(points: MapPoint[]): MapPoint[] {
  const byCoord = new Map<string, MapPoint[]>();
  points.forEach((p) => {
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const list = byCoord.get(key) ?? [];
    list.push(p);
    byCoord.set(key, list);
  });

  const out: MapPoint[] = [];
  byCoord.forEach((group) => {
    if (group.length <= 1) {
      out.push(group[0]);
      return;
    }

    const radius = 0.00012;
    const step = (2 * Math.PI) / group.length;
    group.forEach((p, idx) => {
      const angle = idx * step;
      out.push({
        ...p,
        lat: p.lat + Math.sin(angle) * radius,
        lng: p.lng + Math.cos(angle) * radius,
      });
    });
  });

  return out;
}

const BR_CENTER = { lat: -14.235, lng: -51.9253 };
const BR_ZOOM = 4;

function mapPinIcon(color: "green" | "red"): google.maps.Icon {
  const grad =
    color === "red"
      ? { top: "#f87171", mid: "#ef4444", bot: "#b91c1c", stroke: "#7f1d1d", center: "#991b1b" }
      : { top: "#4ade80", mid: "#22c55e", bot: "#15803d", stroke: "#14532d", center: "#166534" };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
  <defs>
    <linearGradient id="pinG" x1="28" y1="6" x2="28" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${grad.top}"/>
      <stop offset="55%" stop-color="${grad.mid}"/>
      <stop offset="100%" stop-color="${grad.bot}"/>
    </linearGradient>
  </defs>
  <path fill="url(#pinG)" stroke="${grad.stroke}" stroke-width="2" stroke-linejoin="round"
    d="M28 5 C15.3 5 6 14.8 6 27.2 C6 39.5 28 67 28 67 C28 67 50 39.5 50 27.2 C50 14.8 40.7 5 28 5 Z"/>
  <circle cx="28" cy="27" r="8" fill="#ffffff" stroke="${grad.center}" stroke-width="1.2"/>
</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(48, 62),
    anchor: new google.maps.Point(24, 60),
  };
}

type InnerProps = {
  points: MapPoint[];
  apiKey: string;
};

function MovementsMapInner({ points, apiKey }: InnerProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "abastecimento-google-maps",
    googleMapsApiKey: apiKey,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const plottedPoints = useMemo(() => spreadOverlappingPoints(points), [points]);

  const icons = useMemo(
    () =>
      isLoaded && typeof google !== "undefined"
        ? { entrada: mapPinIcon("green"), saida: mapPinIcon("red") }
        : undefined,
    [isLoaded]
  );

  const onMapLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
  }, []);

  useEffect(() => {
    if (!map || !window.google?.maps) return;

    if (plottedPoints.length === 0) {
      map.setCenter(BR_CENTER);
      map.setZoom(BR_ZOOM);
      return;
    }

    if (plottedPoints.length === 1) {
      map.setCenter({ lat: plottedPoints[0].lat, lng: plottedPoints[0].lng });
      map.setZoom(15);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    plottedPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
  }, [map, plottedPoints]);

  const activePoint = activeKey ? plottedPoints.find((p) => p.key === activeKey) : undefined;

  const containerClass =
    "h-[min(52vh,520px)] min-h-[320px] w-full overflow-hidden rounded-b-2xl";

  if (loadError) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-slate-900/5 px-4 py-6 text-center text-sm text-red-700 dark:bg-white/5 dark:text-red-300 ${containerClass}`}
      >
        <p className="font-medium">Não foi possível carregar o Google Maps (InvalidKey).</p>
        <p className="max-w-lg text-xs leading-relaxed text-red-600/90 dark:text-red-200/90">
          No Google Cloud → Credenciais → sua chave: (1) ative a <strong>Maps JavaScript API</strong> no projeto; (2) em
          &quot;Restrições de aplicativo&quot; use <strong>Referenciadores HTTP</strong> (não endereços IP — IP só
          funciona em APIs de servidor); (3) inclua <code className="rounded bg-black/10 px-1">http://localhost:*</code>{" "}
          e o domínio de produção; (4) em &quot;Restrições de API&quot;, inclua Maps JavaScript API.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-900/5 text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400 ${containerClass}`}
      >
        A carregar mapa…
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={BR_CENTER}
        zoom={BR_ZOOM}
        onLoad={onMapLoad}
        options={{
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "greedy",
        }}
      >
        {plottedPoints.map((p) => (
          <Marker
            key={p.key}
            position={{ lat: p.lat, lng: p.lng }}
            icon={p.movimento === "saida" ? icons?.saida : icons?.entrada}
            zIndex={activeKey === p.key ? 999 : 1}
            onClick={() => setActiveKey(p.key)}
          />
        ))}
        {activePoint ? (
          <InfoWindow
            position={{ lat: activePoint.lat, lng: activePoint.lng }}
            onCloseClick={() => setActiveKey(null)}
            options={{
              pixelOffset: new google.maps.Size(0, -40),
            }}
          >
            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: 1.45, color: "#1e293b" }}>
              <div><strong>Data/Hora:</strong> {activePoint.dataHora ?? "—"}</div>
              <div><strong>Usuário:</strong> {activePoint.usuario ?? "—"}</div>
              <div><strong>Obra:</strong> {activePoint.obra ?? "—"}</div>
              <div>
                <strong>Movimento:</strong>{" "}
                <span style={{ color: activePoint.movimento === "saida" ? "#dc2626" : "#166534", fontWeight: 700 }}>
                  {activePoint.movimento === "saida" ? "Retirada" : "Entrada"}
                </span>
              </div>
              <div><strong>Litros:</strong> {activePoint.litros ?? "—"}</div>
              <div><strong>Município:</strong> {activePoint.municipio ?? "—"}</div>
            </div>
          </InfoWindow>
        ) : null}
      </GoogleMap>
    </div>
  );
}

export default function MovementsMap({ points }: { points: MapPoint[] }) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? "";

  if (!apiKey) {
    return (
      <div className="flex h-[min(52vh,520px)] min-h-[320px] w-full items-center justify-center rounded-b-2xl bg-slate-900/5 px-4 text-center text-sm text-slate-600 dark:bg-white/5 dark:text-slate-400">
        Defina <code className="rounded bg-black/10 px-1 dark:bg-black/20">VITE_GOOGLE_MAPS_API_KEY</code> no ficheiro{" "}
        <code className="rounded bg-black/10 px-1 dark:bg-black/20">.env</code> da pasta web e ative a{" "}
        <strong>Maps JavaScript API</strong> no Google Cloud.
      </div>
    );
  }

  return <MovementsMapInner points={points} apiKey={apiKey} />;
}
