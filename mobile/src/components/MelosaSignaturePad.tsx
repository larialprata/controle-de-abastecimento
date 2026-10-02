import { useCallback, useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export type MelosaSignaturePadProps = {
  label: string;
  isDarkMode: boolean;
  onSigned: (dataUrl: string) => void;
  onClear?: () => void;
  /** Bloqueia scroll da tela enquanto o usuário desenha dentro do retângulo. */
  onScrollLockChange?: (locked: boolean) => void;
};

function buildSignatureHtml(penColor: string, backgroundColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
    background: ${backgroundColor};
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    background: ${backgroundColor};
  }
</style>
</head>
<body>
<canvas id="pad"></canvas>
<script>
  const canvas = document.getElementById("pad");
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let hasStroke = false;

  function post(type, extra) {
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, extra || {})));
  }

  function resize() {
    const w = document.documentElement.clientWidth || window.innerWidth;
    const h = document.documentElement.clientHeight || window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "${penColor}";
  }

  window.addEventListener("resize", resize);
  setTimeout(resize, 80);

  document.addEventListener("touchmove", function (e) {
    e.preventDefault();
  }, { passive: false });

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    post("start");
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    hasStroke = true;
    const p = pointFromEvent(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function exportPad() {
    if (!hasStroke) {
      post("empty");
      return;
    }
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d");
    octx.fillStyle = "${backgroundColor}";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    post("ok", { data: out.toDataURL("image/png") });
  }

  function end(e) {
    e.preventDefault();
    drawing = false;
    post("end");
    if (hasStroke) setTimeout(exportPad, 120);
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end, { passive: false });

  window.clearSignature = function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStroke = false;
    post("clear");
  };
</script>
</body>
</html>`;
}

export default function MelosaSignaturePad({
  label,
  isDarkMode,
  onSigned,
  onClear,
  onScrollLockChange,
}: MelosaSignaturePadProps) {
  const webRef = useRef<WebView>(null);
  // Sempre papel branco + tinta preta — legível no ticket impresso e em qualquer tema do app.
  const html = useMemo(() => buildSignatureHtml("#000000", "#ffffff"), []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as { type?: string; data?: string };
        if (msg.type === "start") onScrollLockChange?.(true);
        if (msg.type === "end") onScrollLockChange?.(false);
        if (msg.type === "ok" && msg.data) onSigned(msg.data);
        if (msg.type === "clear") {
          onScrollLockChange?.(false);
          onClear?.();
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onSigned, onClear, onScrollLockChange],
  );

  const clearPad = () => {
    onScrollLockChange?.(false);
    webRef.current?.injectJavaScript("window.clearSignature && window.clearSignature(); true;");
    onClear?.();
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, isDarkMode ? styles.labelDark : styles.labelLight]}>{label}</Text>
      <View style={[styles.padShell, styles.padShellPaper]} collapsable={false}>
        <WebView
          ref={webRef}
          source={{ html, baseUrl: "https://localhost" }}
          onMessage={onMessage}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          javaScriptEnabled
          originWhitelist={["*"]}
          style={styles.webview}
          setBuiltInZoomControls={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={false}
          androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        />
      </View>
      <TouchableOpacity
        onPress={clearPad}
        style={[styles.clearBtn, isDarkMode ? styles.clearBtnDark : styles.clearBtnLight]}
      >
        <Text style={[styles.clearBtnText, isDarkMode ? styles.textDark : styles.textLight]}>Limpar assinatura</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  label: { fontSize: 13, fontWeight: "700" },
  labelLight: { color: "#334155" },
  labelDark: { color: "#e2e8f0" },
  padShell: {
    height: 128,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  padShellPaper: {
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
  },
  webview: { flex: 1, backgroundColor: "#ffffff" },
  clearBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearBtnLight: { backgroundColor: "rgba(148,163,184,0.2)" },
  clearBtnDark: { backgroundColor: "rgba(148,163,184,0.15)" },
  clearBtnText: { fontSize: 12, fontWeight: "600" },
  textLight: { color: "#334155" },
  textDark: { color: "#e2e8f0" },
});
