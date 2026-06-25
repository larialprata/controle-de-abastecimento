import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeEquipamentoQrScan } from "../lib/equipamentoQr";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export type EquipamentoQrScannerProps = {
  visible: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
};

export default function EquipamentoQrScanner({
  visible,
  isDarkMode,
  onClose,
  onScanned,
}: EquipamentoQrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const handledRef = useRef(false);

  const handleScan = useCallback(
    (result: { data?: string }) => {
      const data = result.data ? normalizeEquipamentoQrScan(result.data) : "";
      if (!data || handledRef.current || locked) return;
      handledRef.current = true;
      setLocked(true);
      onScanned(data);
    },
    [locked, onScanned],
  );

  const handleClose = useCallback(() => {
    handledRef.current = false;
    setLocked(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    handledRef.current = false;
    setLocked(false);
  }, [visible]);

  if (!visible) return null;

  const closeBtnStyle = isDarkMode ? styles.closeBtnDark : styles.closeBtnLight;
  const closeBtnTextStyle = isDarkMode ? styles.closeBtnTextDark : styles.closeBtnTextLight;

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.root, isDarkMode ? styles.rootDark : styles.rootLight]}>
        <View style={styles.header}>
          <Text style={[styles.title, isDarkMode ? styles.textDark : styles.textLight]}>
            Ler QR do equipamento
          </Text>
          <TouchableOpacity onPress={handleClose} style={closeBtnStyle} accessibilityRole="button" accessibilityLabel="Sair da leitura do QR code">
            <Text style={closeBtnTextStyle}>Sair</Text>
          </TouchableOpacity>
        </View>

        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={isDarkMode ? "#fff" : "#0f172a"} />
            <TouchableOpacity onPress={handleClose} style={styles.exitSecondaryBtn}>
              <Text style={[styles.exitSecondaryBtnText, isDarkMode ? styles.textDark : styles.textLight]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={[styles.hint, isDarkMode ? styles.textDark : styles.textLight]}>
              Permita o acesso à câmera para ler o QR code do equipamento.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void requestPermission()}>
              <Text style={styles.primaryBtnText}>Permitir câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} style={styles.exitSecondaryBtn}>
              <Text style={[styles.exitSecondaryBtnText, isDarkMode ? styles.textDark : styles.textLight]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={locked ? undefined : handleScan}
            />
            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.frame} />
              <Text style={styles.overlayHint}>QR do Controle de Equipamentos ou do Abast</Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootDark: { backgroundColor: "#0f172a" },
  rootLight: { backgroundColor: "#f8fafc" },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "700", flex: 1 },
  textDark: { color: "#f8fafc" },
  textLight: { color: "#0f172a" },
  closeBtnDark: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(148,163,184,0.25)",
  },
  closeBtnLight: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(15,23,42,0.08)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
  },
  closeBtnTextDark: { fontWeight: "600", color: "#f8fafc" },
  closeBtnTextLight: { fontWeight: "600", color: "#0f172a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  hint: { textAlign: "center", fontSize: 15, lineHeight: 22 },
  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  cameraWrap: { flex: 1, margin: 16, borderRadius: 16, overflow: "hidden" },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  overlayHint: {
    marginTop: 20,
    color: "#fff",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  exitSecondaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)",
  },
  exitSecondaryBtnText: { fontWeight: "600", fontSize: 15 },
});
