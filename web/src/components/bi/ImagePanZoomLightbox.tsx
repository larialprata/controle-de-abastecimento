import { useEffect, useRef, useState } from "react";
import { RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";

type Props = {
  src: string;
  onClose: () => void;
};

const SCALE_MIN = 0.35;
const SCALE_MAX = 8;

export default function ImagePanZoomLightbox({ src, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, [src]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      setScale((s) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s * factor)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setTx((x) => x + dx);
    setTy((y) => y + dy);
  };

  const endDrag = (e: React.PointerEvent) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* já libertado */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Foto da nota"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] max-w-[min(96vw,1280px)] flex-col gap-2 rounded-2xl border border-white/15 bg-slate-950/95 p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setScale((s) => Math.min(SCALE_MAX, s * 1.2))}
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setScale((s) => Math.max(SCALE_MIN, s / 1.2))}
            aria-label="Diminuir zoom"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => {
              setScale(1);
              setTx(0);
              setTy(0);
            }}
            aria-label="Repor zoom e posição"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-lg border border-accent/60 bg-accent p-2 text-white hover:bg-accent-hover"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={viewportRef}
          className="flex h-[min(78vh,820px)] w-[min(92vw,1200px)] cursor-grab touch-none items-center justify-center overflow-hidden rounded-xl bg-black/40 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          >
            <img
              src={src}
              alt="Foto da nota fiscal"
              draggable={false}
              className="max-h-[min(72vh,760px)] max-w-[min(88vw,1100px)] select-none object-contain"
            />
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Roda do rato: zoom · Arrastar com o botão esquerdo: mover · Esc: fechar
        </p>
      </div>
    </div>
  );
}
