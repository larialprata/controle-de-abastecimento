import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import { StatusBar } from "expo-status-bar";
import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Modal,
  Pressable,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import * as Location from "expo-location";
import NetInfo from "@react-native-community/netinfo";
import { Picker } from "@react-native-picker/picker";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { env } from "./src/lib/env";
import { pickImageFromCamera, pickImageFromLibrary } from "./src/lib/pickImage";
import {
  clearMelosaFlowCheckpoint,
  loadMelosaFlowCheckpoint,
  saveMelosaFlowCheckpoint,
} from "./src/lib/melosaFlowCheckpoint";
import { clearOutbox, enqueueOutbox, initDb, outboxCount } from "./src/db/sqlite";
import { syncOutbox } from "./src/sync/syncOutbox";
import { OBRAS, OBRA_USINA_CODIGO } from "./src/constants/obras";
import { INSUMOS_MELOSA, INSUMOS_TANQUE, codigoOleoPorTexto, labelInsumo } from "./src/constants/insumos";
import type { MovimentoTipo, MovimentacaoPayload } from "./src/types/movimentacao";
import { v4 as uuidv4 } from "uuid";
import { apiGet, apiPost, registerCredentials } from "./src/lib/api";
import { readImageUriAsArrayBuffer } from "./src/lib/readImageUri";
import { lightTheme } from "./src/theme/light";
import EquipamentoQrScanner from "./src/components/EquipamentoQrScanner";
import MelosaSignaturePad from "./src/components/MelosaSignaturePad";
import { labelEquipamentoEmpresa } from "./src/lib/equipamentoEmpresa";
import {
  buildEquipamentoQrLookupPayload,
  normalizeEquipamentoQrScan,
  parseAbastEquipamentoQrAtivo,
  parseEquipamentoQrContent,
} from "./src/lib/equipamentoQr";
import { normalizeAtivoPatrimonio } from "./src/lib/equipamentoAtivo";
import {
  findCachedEquipamento,
  loadEquipamentoCatalog,
  loadJsonCache,
  MELOSAS_CACHE_KEY,
  mergeCatalogFromApi,
  OBRAS_CACHE_KEY,
  saveEquipamentoCatalog,
  saveJsonCache,
  TANQUES_CACHE_KEY,
  upsertCachedEquipamento,
  type CachedEquipamento,
} from "./src/lib/offlineCatalog";
import { base64ToArrayBuffer, parseBase64DataUrl } from "./src/lib/signatureImage";
import { extFromUri, stageImageFromDataUrl, stageImageFromUri } from "./src/sync/offlineMedia";
import { APP_VERSION } from "./src/lib/appVersion";
import AsyncStorage from "@react-native-async-storage/async-storage";

type SaveAckResult = {
  titulo: string;
  ativo: string;
  litros: string;
  status: "synced" | "pending" | "error";
  erro?: string;
};

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Nome do operador: nunca usa e-mail. */
function pickOperadorNome(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const t = String(raw ?? "").trim().replace(/\s+/g, " ");
    if (!t) continue;
    if (looksLikeEmail(t)) continue;
    return t;
  }
  return "";
}

const operadorNomeCacheKey = (userId: string) => `operador_nome_v1:${userId}`;

type TanqueCadastrado = {
  ativo: string;
  nome: string | null;
  obra_codigo: number | null;
  obra_codigos?: number[];
  tanque_numero: number | null;
};

function obraCodigosTanqueMobile(t: TanqueCadastrado): number[] {
  if (Array.isArray(t.obra_codigos) && t.obra_codigos.length > 0) {
    return t.obra_codigos.map(Number).filter((c) => Number.isFinite(c));
  }
  return t.obra_codigo != null ? [t.obra_codigo] : [];
}

function tanquePertenceObraMobile(t: TanqueCadastrado, obra: number): boolean {
  return obraCodigosTanqueMobile(t).includes(obra);
}

function labelTanqueComObra(t: TanqueCadastrado, obraNome?: string | null): string {
  const tanque = t.tanque_numero != null ? `Tanque ${t.tanque_numero}` : "Tanque";
  const obras = obraCodigosTanqueMobile(t);
  const obra =
    obras.length > 0
      ? obras.map((c) => `${c}${obraNome && c === t.obra_codigo ? ` - ${obraNome}` : ""}`).join(", ")
      : (obraNome ?? "—");
  const descricao = t.nome?.trim() || "—";
  return `${tanque} - (${obra}) - (${descricao})`;
}

function TanqueOpcaoTexto({
  t,
  obraNome,
  isDarkMode,
  compact,
}: {
  t: TanqueCadastrado;
  obraNome?: string | null;
  isDarkMode: boolean;
  compact?: boolean;
}) {
  const obraLabel =
    t.obra_codigo != null
      ? `${t.obra_codigo}${obraNome ? ` - ${obraNome}` : ""}`
      : (obraNome ?? "—");
  return (
    <View style={compact ? styles.tanqueDropdownResumo : undefined}>
      <Text style={[styles.tanqueListaNumero, !isDarkMode ? styles.tanqueListaNumeroLight : null]}>
        {t.tanque_numero != null ? `Tanque ${t.tanque_numero}` : "Tanque"}
      </Text>
      <Text style={[styles.tanqueListaObra, !isDarkMode ? styles.tanqueListaObraLight : null]}>
        ({obraLabel})
      </Text>
      <Text style={[styles.tanqueListaDescricao, !isDarkMode ? styles.tanqueListaDescricaoLight : null]}>
        {t.nome?.trim() || "—"}
      </Text>
    </View>
  );
}

function SeletorTanquesDropdown({
  tanques,
  obrasPorCodigo,
  tanqueAtivo,
  onSelect,
  isDarkMode,
}: {
  tanques: TanqueCadastrado[];
  obrasPorCodigo: Map<number, string>;
  tanqueAtivo: string | null;
  onSelect: (ativo: string) => void;
  isDarkMode: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const selecionado = tanques.find((t) => t.ativo === tanqueAtivo) ?? null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setAberto(true)}
        style={[styles.tanqueDropdownTrigger, !isDarkMode ? styles.tanqueDropdownTriggerLight : null]}
      >
        <View style={styles.tanqueDropdownTriggerBody}>
          {selecionado ? (
            <TanqueOpcaoTexto
              t={selecionado}
              obraNome={obrasPorCodigo.get(selecionado.obra_codigo ?? 0)}
              isDarkMode={isDarkMode}
              compact
            />
          ) : (
            <Text style={[styles.tanqueDropdownPlaceholder, !isDarkMode ? styles.tanqueDropdownPlaceholderLight : null]}>
              Selecione o tanque
            </Text>
          )}
        </View>
        <Text style={[styles.tanqueDropdownChevron, !isDarkMode ? styles.tanqueDropdownChevronLight : null]}>▼</Text>
      </TouchableOpacity>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.tanqueDropdownBackdrop} onPress={() => setAberto(false)}>
          <Pressable
            style={[styles.tanqueDropdownModal, !isDarkMode ? styles.tanqueDropdownModalLight : null]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.tanqueDropdownModalTitle, !isDarkMode ? styles.tanqueDropdownModalTitleLight : null]}>
              Selecionar tanque
            </Text>
            <ScrollView nestedScrollEnabled style={styles.tanqueListaScroll} keyboardShouldPersistTaps="handled">
              {tanques.map((t, idx) => {
                const selected = t.ativo === tanqueAtivo;
                return (
                  <View key={t.ativo}>
                    {idx > 0 ? (
                      <Text
                        style={[styles.tanqueListaSeparador, !isDarkMode ? styles.tanqueListaSeparadorLight : null]}
                        numberOfLines={1}
                        ellipsizeMode="clip"
                      >
                        ────────────────────────────────────────
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => {
                        onSelect(t.ativo);
                        setAberto(false);
                      }}
                      style={[
                        styles.tanqueListaItem,
                        !isDarkMode ? styles.tanqueListaItemLight : null,
                        selected ? styles.tanqueListaItemSelected : null,
                        selected && !isDarkMode ? styles.tanqueListaItemSelectedLight : null,
                      ]}
                    >
                      <TanqueOpcaoTexto
                        t={t}
                        obraNome={obrasPorCodigo.get(t.obra_codigo ?? 0)}
                        isDarkMode={isDarkMode}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.tanqueDropdownFechar, !isDarkMode ? styles.tanqueDropdownFecharLight : null]}
              onPress={() => setAberto(false)}
            >
              <Text style={[styles.tanqueDropdownFecharText, !isDarkMode ? styles.tanqueDropdownFecharTextLight : null]}>
                Fechar
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

type Screen =
  | { name: "login" }
  | { name: "registro" }
  | { name: "home" }
  | { name: "form"; tipo: MovimentoTipo; retiradaStep?: "dados" | "detalhes" | "quantidade_abastecida" | "resumo"; entradaStep?: "dados" | "detalhes" | "resumo" }
  | { name: "melosa"; step: "register" | "quantidade_abastecida" | "horimetro" | "resumo" };

/** Espaço reservado no scroll para o rodapé fixo (Salvar/Cancelar) + barra do sistema. */
const FORM_SCROLL_FOOTER_SPACE = 100;
const FORM_FOOTER_BOTTOM_INSET = Platform.OS === "android" ? 40 : 24;
const SCREEN_CARD_MAX_WIDTH = 520;
const SCREEN_HORIZONTAL_PADDING = 16;
const SCREEN_TOP_INSET =
  Platform.OS === "android" ? Math.max(48, (RNStatusBar.currentHeight ?? 32) + 16) : 10;
const THEME_TOGGLE_WIDTH = 116;
const THEME_TOGGLE_HEIGHT = 40;
const THEME_TOGGLE_POS_FILE = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}theme-toggle-position.json`
  : null;

type CardBounds = { x: number; y: number; width: number; height: number };
type ThemeTogglePosition = { x: number; y: number };

function isMeaningfulSignatureDataUrl(dataUrl: string | null | undefined): boolean {
  if (!dataUrl?.trim()) return false;
  const { base64 } = parseBase64DataUrl(dataUrl);
  return base64.length > 800;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function loadThemeTogglePosition(): Promise<ThemeTogglePosition | null> {
  if (!THEME_TOGGLE_POS_FILE) return null;
  try {
    const info = await FileSystem.getInfoAsync(THEME_TOGGLE_POS_FILE);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(THEME_TOGGLE_POS_FILE);
    const parsed = JSON.parse(raw) as ThemeTogglePosition;
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed;
  } catch {
    // ignore
  }
  return null;
}

async function saveThemeTogglePosition(position: ThemeTogglePosition) {
  if (!THEME_TOGGLE_POS_FILE) return;
  try {
    await FileSystem.writeAsStringAsync(THEME_TOGGLE_POS_FILE, JSON.stringify(position));
  } catch {
    // ignore
  }
}

function scaleFontSize(base: number, screenWidth: number) {
  return Math.max(12, Math.min(base, Math.round((screenWidth / 390) * base)));
}

function AdaptiveCardText({
  children,
  style,
  lightStyle,
  isDarkMode,
  numberOfLines = 2,
}: {
  children: string;
  style: TextStyle;
  lightStyle?: TextStyle;
  isDarkMode: boolean;
  numberOfLines?: number;
}) {
  return (
    <Text
      style={[style, !isDarkMode ? lightStyle : null]}
      adjustsFontSizeToFit
      numberOfLines={numberOfLines}
      minimumFontScale={0.72}
      textAlign="center"
    >
      {children}
    </Text>
  );
}

function useScreenLayout() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  return useMemo(() => {
    const contentWidth = Math.min(screenWidth - SCREEN_HORIZONTAL_PADDING * 2, SCREEN_CARD_MAX_WIDTH);
    const isCompactScreen = screenHeight < 640 || screenWidth < 360;
    const cardShellStyle = {
      width: contentWidth,
      maxWidth: SCREEN_CARD_MAX_WIDTH,
      alignSelf: "center" as const,
    };
    return {
      screenWidth,
      screenHeight,
      isCompactScreen,
      contentWidth,
      cardShellStyle,
      brandLogoSize: {
        width: Math.min(240, Math.max(120, Math.round(contentWidth * (isCompactScreen ? 0.72 : 0.82)))),
        height: Math.min(120, Math.max(56, Math.round(contentWidth * (isCompactScreen ? 0.3 : 0.36)))),
      },
      heroImageHeight: Math.min(120, Math.max(76, Math.round(contentWidth * 0.28))),
      statusFontSize: scaleFontSize(14, screenWidth),
      actionTitleFontSize: scaleFontSize(16, screenWidth),
      authTitleFontSize: scaleFontSize(26, screenWidth),
      authCardInnerStyle: isCompactScreen ? styles.glassInnerCompact : undefined,
    };
  }, [screenWidth, screenHeight]);
}

function GlassCard({
  isDarkMode,
  shellStyle,
  innerStyle,
  children,
}: {
  isDarkMode: boolean;
  shellStyle?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[styles.glassCard, shellStyle, !isDarkMode ? styles.glassCardLight : null]}>
      <BlurView tint={isDarkMode ? "dark" : "light"} intensity={58} style={styles.glassBlur} />
      <View style={[styles.glassInner, innerStyle]}>{children}</View>
    </View>
  );
}

function CardMeasuredWrap({
  layout,
  isDarkMode,
  onBoundsChange,
  innerStyle,
  children,
}: {
  layout: ReturnType<typeof useScreenLayout>;
  isDarkMode: boolean;
  onBoundsChange: (bounds: CardBounds) => void;
  innerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const cardRef = useRef<View>(null);

  const measureCard = () => {
    cardRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) onBoundsChange({ x, y, width, height });
    });
  };

  useEffect(() => {
    const timer = setTimeout(measureCard, 80);
    return () => clearTimeout(timer);
  }, [layout.contentWidth]);

  return (
    <View ref={cardRef} onLayout={measureCard} style={layout.cardShellStyle}>
      <GlassCard isDarkMode={isDarkMode} shellStyle={styles.glassCardFullWidth} innerStyle={innerStyle}>
        {children}
      </GlassCard>
    </View>
  );
}

function DraggableThemeToggle({
  isDarkMode,
  onToggleTheme,
  cardBounds,
  layout,
  position,
  onPositionChange,
}: {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  cardBounds: CardBounds | null;
  layout: ReturnType<typeof useScreenLayout>;
  position: ThemeTogglePosition | null;
  onPositionChange: (position: ThemeTogglePosition) => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const defaultPosition = useMemo(() => {
    if (cardBounds) {
      return {
        x: cardBounds.x + cardBounds.width - THEME_TOGGLE_WIDTH,
        y: Math.max(SCREEN_TOP_INSET, cardBounds.y - THEME_TOGGLE_HEIGHT - 8),
      };
    }
    const cardX = (screenWidth - layout.contentWidth) / 2;
    return { x: cardX + layout.contentWidth - THEME_TOGGLE_WIDTH, y: SCREEN_TOP_INSET + 8 };
  }, [cardBounds, layout.contentWidth, screenWidth]);

  const [dragPos, setDragPos] = useState<ThemeTogglePosition>(position ?? defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOrigin = useRef<ThemeTogglePosition>(defaultPosition);
  const dragPosRef = useRef<ThemeTogglePosition>(defaultPosition);
  const movedDuringDrag = useRef(false);

  useEffect(() => {
    dragPosRef.current = dragPos;
  }, [dragPos]);

  useEffect(() => {
    if (!isDragging) setDragPos(position ?? defaultPosition);
  }, [defaultPosition.x, defaultPosition.y, isDragging, position]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          movedDuringDrag.current = false;
          dragOrigin.current = dragPosRef.current;
          setIsDragging(true);
        },
        onPanResponderMove: (_, gesture) => {
          if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) movedDuringDrag.current = true;
          const next = {
            x: clamp(dragOrigin.current.x + gesture.dx, 8, screenWidth - THEME_TOGGLE_WIDTH - 8),
            y: clamp(dragOrigin.current.y + gesture.dy, 8, screenHeight - THEME_TOGGLE_HEIGHT - 8),
          };
          dragPosRef.current = next;
          setDragPos(next);
        },
        onPanResponderRelease: () => {
          setIsDragging(false);
          if (movedDuringDrag.current) {
            onPositionChange(dragPosRef.current);
          } else {
            onToggleTheme();
          }
        },
        onPanResponderTerminate: () => setIsDragging(false),
      }),
    [onPositionChange, onToggleTheme, screenHeight, screenWidth]
  );

  return (
    <View
      style={[
        styles.themeToggleFloating,
        { left: dragPos.x, top: dragPos.y, opacity: isDragging ? 0.92 : 1 },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.themeToggle, !isDarkMode ? styles.themeToggleLight : null]}>
        <Text style={[styles.themeToggleText, !isDarkMode ? styles.themeToggleTextLight : null]}>
          {isDarkMode ? "Modo claro" : "Modo escuro"}
        </Text>
      </View>
    </View>
  );
}

const CenteredScrollView = forwardRef<
  ScrollView,
  {
    children: ReactNode;
    contentContainerStyle?: StyleProp<ViewStyle>;
    style?: StyleProp<ViewStyle>;
    keyboardPadding?: number;
    preferCenter?: boolean;
    viewportHeightOverride?: number;
    keyboardDismissMode?: "none" | "on-drag" | "interactive";
    scrollEnabled?: boolean;
    nestedScrollEnabled?: boolean;
  }
>(function CenteredScrollView(
  {
    children,
    contentContainerStyle,
    style,
    keyboardPadding = 0,
    preferCenter = true,
    viewportHeightOverride,
    keyboardDismissMode = "on-drag",
    scrollEnabled = true,
    nestedScrollEnabled,
  },
  ref
) {
  const scrollTopInset = SCREEN_TOP_INSET;
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const viewportHeight = viewportHeightOverride && viewportHeightOverride > 0 ? viewportHeightOverride : scrollViewportHeight;
  const keyboardOpen = keyboardPadding > 0;
  const shouldCenter =
    preferCenter &&
    !keyboardOpen &&
    viewportHeight > 0 &&
    contentHeight > 0 &&
    contentHeight + 24 <= viewportHeight;
  const centeredContainerStyle = shouldCenter
    ? {
        flexGrow: 1,
        minHeight: viewportHeight,
        justifyContent: "center" as const,
        paddingTop: 12,
        paddingBottom: 12,
      }
    : {
        paddingTop: scrollTopInset,
        paddingBottom: keyboardOpen ? keyboardPadding + 48 : 32,
      };

  if (!scrollEnabled) {
    return (
      <ScrollView
        ref={ref}
        style={[styles.screenScrollFill, style]}
        onLayout={(event) => setScrollViewportHeight(event.nativeEvent.layout.height)}
        contentContainerStyle={[
          styles.centeredScreenScroll,
          centeredContainerStyle,
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={keyboardDismissMode}
        nestedScrollEnabled={nestedScrollEnabled ?? scrollEnabled}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <View
          style={styles.centeredScrollInner}
          onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
        >
          {children}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={ref}
      style={[styles.screenScrollFill, style]}
      onLayout={(event) => setScrollViewportHeight(event.nativeEvent.layout.height)}
      contentContainerStyle={[
        styles.centeredScreenScroll,
        centeredContainerStyle,
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode={keyboardDismissMode}
      nestedScrollEnabled={nestedScrollEnabled ?? scrollEnabled}
      scrollEnabled={scrollEnabled}
      bounces={scrollEnabled}
      showsVerticalScrollIndicator={scrollEnabled}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    >
      <View
        style={styles.centeredScrollInner}
        onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </ScrollView>
  );
});

const FormScreenScroll = forwardRef<
  ScrollView,
  {
    children: ReactNode;
    contentContainerStyle?: StyleProp<ViewStyle>;
    preferCenter?: boolean;
    layoutKey?: string;
    keyboardDismissMode?: "none" | "on-drag" | "interactive";
    scrollEnabled?: boolean;
    nestedScrollEnabled?: boolean;
  }
>(function FormScreenScroll(
  {
    children,
    contentContainerStyle,
    preferCenter = true,
    layoutKey,
    keyboardDismissMode = "on-drag",
    scrollEnabled = true,
    nestedScrollEnabled,
  },
  ref
) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [scrollAreaHeight, setScrollAreaHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollBody = (
    <CenteredScrollView
      ref={ref}
      contentContainerStyle={contentContainerStyle}
      keyboardPadding={keyboardHeight}
      preferCenter={preferCenter && keyboardHeight === 0}
      viewportHeightOverride={scrollAreaHeight}
      keyboardDismissMode={keyboardDismissMode}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled={nestedScrollEnabled}
    >
      {children}
    </CenteredScrollView>
  );

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView
        key={layoutKey}
        style={styles.formScrollView}
        behavior="padding"
        keyboardVerticalOffset={56}
        onLayout={(event) => setScrollAreaHeight(event.nativeEvent.layout.height)}
      >
        {scrollBody}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      key={layoutKey}
      style={styles.formScrollView}
      onLayout={(event) => setScrollAreaHeight(event.nativeEvent.layout.height)}
    >
      {scrollBody}
    </View>
  );
});

function FormActionFooter({ isDarkMode, children }: { isDarkMode: boolean; children: ReactNode }) {
  const { cardShellStyle } = useScreenLayout();

  return (
    <View
      style={[
        styles.formFooter,
        !isDarkMode ? styles.formFooterLight : null,
        { paddingBottom: 12 + FORM_FOOTER_BOTTOM_INSET },
      ]}
    >
      <View style={cardShellStyle}>{children}</View>
    </View>
  );
}

function GpsLocationBlock({
  isDarkMode,
  label,
  localLatitude,
  localLongitude,
  localAddress,
  onCapture,
  showDetails = true,
}: {
  isDarkMode: boolean;
  label: string;
  localLatitude: number | null;
  localLongitude: number | null;
  localAddress: string | null;
  onCapture: () => void;
  showDetails?: boolean;
}) {
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  useEffect(() => {
    onCaptureRef.current();
  }, []);

  return (
    <>
      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8, textAlign: "center" }]}>
        {label}
      </Text>
      {showDetails ? (
        <>
          {localLatitude != null && localLongitude != null ? (
            <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6, textAlign: "center" }]}>
              Coordenadas: {localLatitude.toFixed(5)}, {localLongitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6, textAlign: "center" }]}>
              Aguardando GPS…
            </Text>
          )}
          <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 4, textAlign: "center" }]}>
            Endereço: {localAddress ?? "— (capturando automaticamente...)"}
          </Text>
        </>
      ) : null}
    </>
  );
}

export default function App() {
  const layout = useScreenLayout();
  const [cardBounds, setCardBounds] = useState<CardBounds | null>(null);
  const [themeTogglePosition, setThemeTogglePosition] = useState<ThemeTogglePosition | null>(null);

  useEffect(() => {
    loadThemeTogglePosition().then((pos) => {
      if (pos) setThemeTogglePosition(pos);
    });
  }, []);

  const handleThemeTogglePositionChange = (position: ThemeTogglePosition) => {
    setThemeTogglePosition(position);
    saveThemeTogglePosition(position);
  };

  const [themeMode, setThemeMode] = useState<"dark" | "light">("light");
  const isDarkMode = themeMode === "dark";
  const barStyle = isDarkMode ? "light" : "dark";
  const inputPlaceholderColor = isDarkMode ? "rgba(255,255,255,0.65)" : lightTheme.placeholder;

  const [screen, setScreen] = useState<Screen>({ name: "login" });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const logoutIntentionalRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const loginEmailRef = useRef<TextInput | null>(null);
  const loginPasswordRef = useRef<TextInput | null>(null);
  const loginScrollRef = useRef<ScrollView | null>(null);
  const scrollLoginForInput = (field: "email" | "password") => {
    requestAnimationFrame(() => {
      if (field === "password") {
        loginScrollRef.current?.scrollToEnd({ animated: true });
        return;
      }
      loginScrollRef.current?.scrollTo({
        y: layout.isCompactScreen ? 72 : 0,
        animated: true,
      });
    });
  };
  const [regPasswordVisible, setRegPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [regFullName, setRegFullName] = useState("");
  const [regCpf, setRegCpf] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regConfirmEmail, setRegConfirmEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [cnhPhotoUri, setCnhPhotoUri] = useState<string | null>(null);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [driverFullName, setDriverFullName] = useState<string>("");
  const [isMelosaUser, setIsMelosaUser] = useState(false);

  const [melosasCadastradas, setMelosasCadastradas] = useState<{ ativo: string; nome: string | null }[]>([]);
  const [tanquesCadastrados, setTanquesCadastrados] = useState<TanqueCadastrado[]>([]);
  const [tanqueAtivo, setTanqueAtivo] = useState<string | null>(null);
  const [obrasCadastradas, setObrasCadastradas] = useState<{ codigo: number; nome: string }[]>([]);
  const obrasDisponiveis = useMemo(
    () => (obrasCadastradas.length > 0 ? obrasCadastradas : [...OBRAS]),
    [obrasCadastradas],
  );
  const obrasPorCodigo = useMemo(
    () => new Map(obrasDisponiveis.map((o) => [o.codigo, o.nome])),
    [obrasDisponiveis],
  );
  const tanquesDisponiveis = useMemo(
    () =>
      tanquesCadastrados.filter(
        (t) => t.tanque_numero != null && obraCodigosTanqueMobile(t).length > 0,
      ),
    [tanquesCadastrados],
  );
  const [melosaObraCodigo, setMelosaObraCodigo] = useState<number>(OBRAS[0]?.codigo ?? 229);
  const [melosaPlacaTexto, setMelosaPlacaTexto] = useState("");
  const [melosaFornecedorTexto, setMelosaFornecedorTexto] = useState("");
  const [melosaIsTransbordo, setMelosaIsTransbordo] = useState(false);
  const [melosaEquipamentoPlacaTexto, setMelosaEquipamentoPlacaTexto] = useState("");
  const [melosaEquipamentoNomeTexto, setMelosaEquipamentoNomeTexto] = useState("");
  const [melosaEquipamentoEmpresa, setMelosaEquipamentoEmpresa] = useState("");
  const [melosaEquipamentoQrOpen, setMelosaEquipamentoQrOpen] = useState(false);
  const [melosaEquipamentoQrLoading, setMelosaEquipamentoQrLoading] = useState(false);
  const [melosaEquipamentoAtivoLookupLoading, setMelosaEquipamentoAtivoLookupLoading] = useState(false);
  const melosaAtivoLookupSeqRef = useRef(0);
  const skipMelosaAtivoLookupRef = useRef(false);
  const skipMelosaPlacaLookupRef = useRef(false);
  const equipamentoCatalogRef = useRef<CachedEquipamento[]>([]);
  const [melosaTanqueNumero, setMelosaTanqueNumero] = useState<1 | 2>(1);
  const [melosaRegKmText, setMelosaRegKmText] = useState("");
  const [melosaRegLitrosText, setMelosaRegLitrosText] = useState("");
  const [melosaRegCombustivelTipo, setMelosaRegCombustivelTipo] = useState("DIESEL_S10");
  const [melosaComprovanteFotoUri, setMelosaComprovanteFotoUri] = useState<string | null>(null);
  const [melosaQuantidadeAbastecidaTexto, setMelosaQuantidadeAbastecidaTexto] = useState("");
  const [melosaQuantidadeAbastecidaFotoUri, setMelosaQuantidadeAbastecidaFotoUri] = useState<string | null>(null);
  const [melosaEncerranteInicialTexto, setMelosaEncerranteInicialTexto] = useState("");
  const [melosaEncerranteFinalTexto, setMelosaEncerranteFinalTexto] = useState("");
  const [melosaHorimetroEquipamentoNumero, setMelosaHorimetroEquipamentoNumero] = useState("");
  const [melosaHorimetroEquipamentoFotoUri, setMelosaHorimetroEquipamentoFotoUri] = useState<string | null>(null);
  const [melosaNaoTenhoHorimetro, setMelosaNaoTenhoHorimetro] = useState(false);
  const [melosaHorimetroMotivo, setMelosaHorimetroMotivo] = useState<"" | "QUEBRADO" | "INEXISTENTE">("");
  const [melosaLubrificado, setMelosaLubrificado] = useState(false);
  const [melosaMotoristaEquipamentoTexto, setMelosaMotoristaEquipamentoTexto] = useState("");
  const [melosaEquipamentoOperadorFotoUri, setMelosaEquipamentoOperadorFotoUri] = useState<string | null>(null);
  const [melosaAssinaturaOperadorDataUrl, setMelosaAssinaturaOperadorDataUrl] = useState<string | null>(null);
  const [melosaAssinaturaMotoristaDataUrl, setMelosaAssinaturaMotoristaDataUrl] = useState<string | null>(null);
  const [signatureScrollLocked, setSignatureScrollLocked] = useState(false);
  const [melosaWdrKmText, setMelosaWdrKmText] = useState("");
  const [melosaWdrLitrosText, setMelosaWdrLitrosText] = useState("");
  const [melosaWdrCombustivelTipo, setMelosaWdrCombustivelTipo] = useState("DIESEL");
  const [melosaTanqueFotoUri, setMelosaTanqueFotoUri] = useState<string | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [pending, setPending] = useState(0);
  const [saveAck, setSaveAck] = useState<SaveAckResult | null>(null);

  const [obraCodigo, setObraCodigo] = useState<number>(OBRAS[0]?.codigo ?? 229);
  const [tanqueTexto, setTanqueTexto] = useState("");
  const [litrosText, setLitrosText] = useState("");

  const [obraCombustivelTipo, setObraCombustivelTipo] = useState<string>("DIESEL_S10");
  const [notaNumero, setNotaNumero] = useState<string>("");
  const [placaTexto, setPlacaTexto] = useState("");
  const [retiradaDestino, setRetiradaDestino] = useState<"MELOSA" | "EQUIPAMENTO">("MELOSA");
  const [tanqueEquipamentoQrOpen, setTanqueEquipamentoQrOpen] = useState(false);
  const [tanqueEquipamentoNome, setTanqueEquipamentoNome] = useState("");
  const [tanqueEquipamentoEmpresa, setTanqueEquipamentoEmpresa] = useState("");
  const [fornecedorTexto, setFornecedorTexto] = useState("");
  const [equipamentoTexto, setEquipamentoTexto] = useState("");
  const [retiradaMotoristaMelosaTexto, setRetiradaMotoristaMelosaTexto] = useState("");
  const [numeroLacreTanque, setNumeroLacreTanque] = useState("");
  const [numeroLacreMelosa, setNumeroLacreMelosa] = useState("");
  const [lacreTanqueFotoUri, setLacreTanqueFotoUri] = useState<string | null>(null);
  const [lacreMelosaFotoUri, setLacreMelosaFotoUri] = useState<string | null>(null);
  const [tanqueQuantidadeAbastecidaTexto, setTanqueQuantidadeAbastecidaTexto] = useState("");
  const [tanqueQuantidadeAbastecidaFotoUri, setTanqueQuantidadeAbastecidaFotoUri] = useState<string | null>(null);
  const [tanqueAssinaturaOperadorDataUrl, setTanqueAssinaturaOperadorDataUrl] = useState<string | null>(null);
  const [tanqueAssinaturaMelosaDataUrl, setTanqueAssinaturaMelosaDataUrl] = useState<string | null>(null);
  const [tanqueNumero, setTanqueNumero] = useState<number | null>(null);
  const [valorUnitarioText, setValorUnitarioText] = useState<string>("");
  const [notaFotoUri, setNotaFotoUri] = useState<string | null>(null);
  const [localLatitude, setLocalLatitude] = useState<number | null>(null);
  const [localLongitude, setLocalLongitude] = useState<number | null>(null);
  const [localAddress, setLocalAddress] = useState<string | null>(null);

  const [obs, setObs] = useState("");

  const tipoAtual: MovimentoTipo | null = useMemo(() => {
    if (screen.name !== "form") return null;
    return screen.tipo;
  }, [screen]);

  useEffect(() => {
    if (screen.name === "form") {
      if (screen.tipo === "ENTRADA_TANQUE_OBRA" || screen.tipo === "RETIRADA_TANQUE") {
        safeCaptureLocationAndAddress();
      }
      if (
        (screen.tipo !== "RETIRADA_TANQUE" || screen.retiradaStep !== "resumo") &&
        (screen.tipo !== "ENTRADA_TANQUE_OBRA" || screen.entradaStep !== "resumo")
      ) {
        setSignatureScrollLocked(false);
      }
      return;
    }
    if (screen.name === "melosa" && screen.step === "resumo") {
      safeCaptureLocationAndAddress();
      return;
    }
    setSignatureScrollLocked(false);
  }, [screen]);

  useEffect(() => {
    initDb()
      .then(() => setPending(outboxCount()))
      .catch((e) => Alert.alert("Erro DB", String(e?.message ?? e)));
    const unsub = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable ?? state.isConnected ?? false;
      setIsOnline(Boolean(reachable));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);

        if (data.session) {
          const checkpoint = await loadMelosaFlowCheckpoint();
          if (checkpoint?.screenStep) {
            applyMelosaFlowCheckpoint(checkpoint);
            setScreen({ name: "melosa", step: checkpoint.screenStep });
          } else {
            setScreen({ name: "home" });
          }
        }
      } finally {
        if (mounted) setAuthReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        if (logoutIntentionalRef.current) {
          logoutIntentionalRef.current = false;
          setSession(null);
          setScreen({ name: "login" });
          return;
        }

        // Offline: ignore logout acidental (refresh de token falhou sem rede).
        const net = await NetInfo.fetch();
        const online = Boolean(net.isInternetReachable ?? net.isConnected);
        if (!online) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            setSession(data.session);
            return;
          }
        }

        setSession(null);
        setScreen({ name: "login" });
        return;
      }

      if (nextSession) {
        setSession(nextSession);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyMelosaFlowCheckpoint(checkpoint: Awaited<ReturnType<typeof loadMelosaFlowCheckpoint>>) {
    if (!checkpoint) return;
    setMelosaObraCodigo(checkpoint.melosaObraCodigo);
    setMelosaPlacaTexto(checkpoint.melosaPlacaTexto);
    setMelosaFornecedorTexto(checkpoint.melosaFornecedorTexto);
    setMelosaIsTransbordo(checkpoint.melosaIsTransbordo === true);
    setMelosaEquipamentoPlacaTexto(checkpoint.melosaEquipamentoPlacaTexto);
    setMelosaEquipamentoNomeTexto(checkpoint.melosaEquipamentoNomeTexto);
    setMelosaEquipamentoEmpresa(checkpoint.melosaEquipamentoEmpresa);
    setMelosaQuantidadeAbastecidaTexto(checkpoint.melosaQuantidadeAbastecidaTexto);
    setMelosaQuantidadeAbastecidaFotoUri(checkpoint.melosaQuantidadeAbastecidaFotoUri);
    setMelosaEncerranteInicialTexto(checkpoint.melosaEncerranteInicialTexto ?? "");
    setMelosaEncerranteFinalTexto(checkpoint.melosaEncerranteFinalTexto ?? "");
    setMelosaHorimetroEquipamentoNumero(checkpoint.melosaHorimetroEquipamentoNumero);
    setMelosaHorimetroEquipamentoFotoUri(checkpoint.melosaHorimetroEquipamentoFotoUri);
    setMelosaNaoTenhoHorimetro(checkpoint.melosaNaoTenhoHorimetro);
    setMelosaHorimetroMotivo(checkpoint.melosaHorimetroMotivo);
    setMelosaLubrificado(checkpoint.melosaLubrificado);
    setMelosaMotoristaEquipamentoTexto(checkpoint.melosaMotoristaEquipamentoTexto);
    setMelosaEquipamentoOperadorFotoUri(checkpoint.melosaEquipamentoOperadorFotoUri);
    setMelosaWdrCombustivelTipo(checkpoint.melosaWdrCombustivelTipo);
    setMelosaAssinaturaOperadorDataUrl(checkpoint.melosaAssinaturaOperadorDataUrl);
    setMelosaAssinaturaMotoristaDataUrl(checkpoint.melosaAssinaturaMotoristaDataUrl);
    setLocalLatitude(checkpoint.localLatitude);
    setLocalLongitude(checkpoint.localLongitude);
    setLocalAddress(checkpoint.localAddress);
  }

  async function persistMelosaFlowCheckpoint(
    step?: "register" | "quantidade_abastecida" | "horimetro" | "resumo",
  ) {
    const screenStep =
      step ??
      (screen.name === "melosa" ? screen.step : "horimetro");
    await saveMelosaFlowCheckpoint({
      savedAt: new Date().toISOString(),
      screenStep,
      melosaObraCodigo,
      melosaPlacaTexto,
      melosaFornecedorTexto,
      melosaIsTransbordo,
      melosaEquipamentoPlacaTexto,
      melosaEquipamentoNomeTexto,
      melosaEquipamentoEmpresa,
      melosaQuantidadeAbastecidaTexto,
      melosaQuantidadeAbastecidaFotoUri,
      melosaEncerranteInicialTexto,
      melosaEncerranteFinalTexto,
      melosaHorimetroEquipamentoNumero,
      melosaHorimetroEquipamentoFotoUri,
      melosaNaoTenhoHorimetro,
      melosaHorimetroMotivo,
      melosaLubrificado,
      melosaMotoristaEquipamentoTexto,
      melosaEquipamentoOperadorFotoUri,
      melosaWdrCombustivelTipo,
      melosaAssinaturaOperadorDataUrl,
      melosaAssinaturaMotoristaDataUrl,
      localLatitude,
      localLongitude,
      localAddress,
    });
  }

  useEffect(() => {
    if (!session?.access_token) return;
    (async () => {
      try {
        // Offline: usa dados já na sessão / cache local.
        const uid = session.user?.id ?? null;
        setAuthUserId(uid);
        const email = session.user?.email ?? "";

        const meta = session.user?.user_metadata as Record<string, unknown> | undefined;
        let fullName = pickOperadorNome(
          typeof meta?.full_name === "string" ? meta.full_name : null,
          typeof meta?.name === "string" ? meta.name : null,
        );

        if (uid) {
          try {
            const cached = await AsyncStorage.getItem(operadorNomeCacheKey(uid));
            fullName = pickOperadorNome(fullName, cached);
          } catch {
            // ignore cache
          }
        }

        const net = await NetInfo.fetch();
        const online = Boolean(net.isInternetReachable ?? net.isConnected);
        if (online && uid) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, is_melosa")
            .eq("user_id", uid)
            .maybeSingle();
          fullName = pickOperadorNome(prof?.full_name, fullName);
          setIsMelosaUser(Boolean((prof as { is_melosa?: boolean } | null)?.is_melosa));
          if (fullName) {
            try {
              await AsyncStorage.setItem(operadorNomeCacheKey(uid), fullName);
            } catch {
              // ignore
            }
          }
        }

        // Prefere o nome; se não achar, usa o e-mail.
        setDriverFullName(fullName || email.trim());
      } catch {
        // Mantém o que já houver — não derruba o login offline.
      }
    })();
  }, [session?.access_token, session?.user]);

  useEffect(() => {
    if (!session?.access_token) {
      setMelosasCadastradas([]);
      return;
    }
    let cancelled = false;
    const token = session.access_token;
    void (async () => {
      const cached = await loadJsonCache<{ ativo: string; nome: string | null }[]>(MELOSAS_CACHE_KEY);
      if (!cancelled && cached?.length) setMelosasCadastradas(cached);
      if (!isOnline) return;
      try {
        const json = await apiGet<{ equipamentos: { ativo: string; nome: string | null }[] }>(
          "/v1/equipamentos?tipo=MELOSA",
          token,
        );
        const list = json.equipamentos ?? [];
        if (!cancelled) setMelosasCadastradas(list);
        await saveJsonCache(MELOSAS_CACHE_KEY, list);
      } catch {
        // Mantém a lista já salva no celular.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, isOnline]);

  useEffect(() => {
    if (!session?.access_token) {
      setTanquesCadastrados([]);
      setTanqueAtivo(null);
      setTanqueNumero(null);
      return;
    }
    let cancelled = false;
    const token = session.access_token;
    void (async () => {
      const cached = await loadJsonCache<TanqueCadastrado[]>(TANQUES_CACHE_KEY);
      if (!cancelled && cached?.length) setTanquesCadastrados(cached);
      if (!isOnline) return;
      try {
        const json = await apiGet<{ equipamentos: TanqueCadastrado[] }>("/v1/equipamentos?tipo=TANQUE", token);
        const list = (json.equipamentos ?? [])
          .map((t) => {
            const obra_codigos = Array.isArray((t as TanqueCadastrado).obra_codigos)
              ? (t as TanqueCadastrado).obra_codigos!.map(Number).filter((c) => Number.isFinite(c))
              : undefined;
            const obra_codigo = t.obra_codigo != null ? Number(t.obra_codigo) : null;
            return {
              ...t,
              obra_codigo,
              obra_codigos:
                obra_codigos && obra_codigos.length > 0
                  ? obra_codigos
                  : obra_codigo != null
                    ? [obra_codigo]
                    : [],
              tanque_numero: t.tanque_numero != null ? Number(t.tanque_numero) : null,
            };
          })
          .filter((t) => t.tanque_numero != null && obraCodigosTanqueMobile(t).length > 0);
        if (!cancelled) setTanquesCadastrados(list);
        await saveJsonCache(TANQUES_CACHE_KEY, list);
      } catch {
        // Mantém os tanques já salvos no celular.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, isOnline]);

  useEffect(() => {
    if (tanquesDisponiveis.length === 0) {
      setTanqueAtivo(null);
      setTanqueNumero(null);
      return;
    }
    setTanqueAtivo((prev) => {
      if (prev && tanquesDisponiveis.some((t) => t.ativo === prev)) return prev;
      return tanquesDisponiveis[0]?.ativo ?? null;
    });
  }, [tanquesDisponiveis]);

  useEffect(() => {
    const tanque = tanquesCadastrados.find((t) => t.ativo === tanqueAtivo) ?? null;
    setTanqueNumero(tanque?.tanque_numero ?? null);
    if (tanque) {
      const obrasT = obraCodigosTanqueMobile(tanque);
      if (obrasT.length > 0 && !obrasT.includes(obraCodigo)) {
        setObraCodigo(obrasT[0]);
      }
    }
  }, [tanqueAtivo, tanquesCadastrados]);

  useEffect(() => {
    if (!tanqueAtivo) return;
    const tanque = tanquesCadastrados.find((t) => t.ativo === tanqueAtivo);
    if (tanque && !tanquePertenceObraMobile(tanque, obraCodigo)) {
      setTanqueAtivo(null);
      setTanqueNumero(null);
    }
  }, [obraCodigo, tanqueAtivo, tanquesCadastrados]);

  const tanqueSelecionado = useMemo(
    () => tanquesCadastrados.find((t) => t.ativo === tanqueAtivo) ?? null,
    [tanquesCadastrados, tanqueAtivo],
  );

  const melosaRegisterAberta = screen.name === "melosa" && screen.step === "register";

  useEffect(() => {
    if (!session?.access_token) {
      setObrasCadastradas([]);
      return;
    }
    let cancelled = false;
    const token = session.access_token;
    void (async () => {
      const cached = await loadJsonCache<{ codigo: number; nome: string }[]>(OBRAS_CACHE_KEY);
      if (!cancelled && cached?.length) setObrasCadastradas(cached);
      if (!isOnline) return;
      try {
        const json = await apiGet<{ obras: { codigo: number; nome: string }[] }>("/v1/obras", token);
        const list = json.obras ?? [];
        if (!cancelled) setObrasCadastradas(list);
        await saveJsonCache(OBRAS_CACHE_KEY, list);
      } catch {
        // Mantém as obras já salvas no celular.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, isOnline, melosaRegisterAberta]);

  useEffect(() => {
    if (!session?.access_token) {
      equipamentoCatalogRef.current = [];
      return;
    }
    let cancelled = false;
    const token = session.access_token;
    void (async () => {
      const cached = await loadEquipamentoCatalog();
      if (!cancelled && cached.length) equipamentoCatalogRef.current = cached;
      if (!isOnline) return;
      try {
        const json = await apiGet<{
          equipamentos: { ativo: string; nome: string | null; empresa: string | null; placa: string | null }[];
        }>("/v1/equipamentos?tipo=EQUIPAMENTO", token);
        if (cancelled) return;
        const merged = mergeCatalogFromApi(equipamentoCatalogRef.current, json.equipamentos ?? []);
        equipamentoCatalogRef.current = merged;
        await saveEquipamentoCatalog(merged);
      } catch {
        // Mantém o cadastro já salvo no celular.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, isOnline]);

  useEffect(() => {
    if (screen.name !== "melosa" || screen.step !== "register") return;
    if (melosaIsTransbordo) return;

    const ativo = melosaFornecedorTexto.trim();
    if (!ativo) {
      setMelosaEquipamentoNomeTexto("");
      setMelosaEquipamentoEmpresa("");
      setMelosaEquipamentoPlacaTexto("");
      setMelosaEquipamentoAtivoLookupLoading(false);
      return;
    }

    if (skipMelosaAtivoLookupRef.current) {
      skipMelosaAtivoLookupRef.current = false;
      return;
    }

    if (!session?.access_token || !isOnline) {
      if (!applyEquipamentoFromLocalCatalog(ativo)) {
        setMelosaEquipamentoNomeTexto("");
        setMelosaEquipamentoEmpresa("");
      }
      return;
    }

    const seq = ++melosaAtivoLookupSeqRef.current;
    const timer = setTimeout(() => {
      setMelosaEquipamentoAtivoLookupLoading(true);
      void fetchMelosaEquipamentoByAtivo(ativo)
        .then((equipamento) => {
          if (seq !== melosaAtivoLookupSeqRef.current) return;
          if (equipamento) {
            rememberEquipamentoLocal(equipamento, ativo);
            applyMelosaEquipamentoFromLookup(equipamento, { updateAtivo: true, updatePlaca: true });
          } else {
            setMelosaEquipamentoNomeTexto("");
            setMelosaEquipamentoEmpresa("");
            skipMelosaPlacaLookupRef.current = true;
            setMelosaEquipamentoPlacaTexto("");
          }
        })
        .catch(() => {
          if (seq === melosaAtivoLookupSeqRef.current && !applyEquipamentoFromLocalCatalog(ativo)) {
            setMelosaEquipamentoNomeTexto("");
            setMelosaEquipamentoEmpresa("");
          }
        })
        .finally(() => {
          if (seq === melosaAtivoLookupSeqRef.current) {
            setMelosaEquipamentoAtivoLookupLoading(false);
          }
        });
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [melosaFornecedorTexto, melosaIsTransbordo, melosaObraCodigo, session?.access_token, isOnline, screen]);

  useEffect(() => {
    if (!session?.access_token) return;
    if (!isOnline) return;
    if (pending <= 0) return;
    syncOutboxWithTokenRetry()
      .then((r) => {
        if (r.synced > 0) setMessage(`Sincronizado: ${r.synced} registro(s).`);
        setPending(outboxCount());
      })
      .catch((e) => {
        setMessage(`Falha ao sincronizar: ${String(e?.message ?? e)}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, pending, session?.access_token]);

  function resetForm() {
    setTanqueTexto("");
    setLitrosText("");

    setObraCombustivelTipo("DIESEL_S10");
    setNotaNumero("");
    setPlacaTexto("");
    setRetiradaDestino("MELOSA");
    setTanqueEquipamentoQrOpen(false);
    setTanqueEquipamentoNome("");
    setTanqueEquipamentoEmpresa("");
    setFornecedorTexto("");
    setEquipamentoTexto("");
    setRetiradaMotoristaMelosaTexto("");
    setNumeroLacreTanque("");
    setNumeroLacreMelosa("");
    setLacreTanqueFotoUri(null);
    setLacreMelosaFotoUri(null);
    setTanqueQuantidadeAbastecidaTexto("");
    setTanqueQuantidadeAbastecidaFotoUri(null);
    setTanqueAssinaturaOperadorDataUrl(null);
    setTanqueAssinaturaMelosaDataUrl(null);
    setTanqueAtivo(null);
    setTanqueNumero(null);
    setValorUnitarioText("");
    setNotaFotoUri(null);
    setLocalLatitude(null);
    setLocalLongitude(null);
    setLocalAddress(null);
    setObs("");
  }

  function resetRegistrationForm() {
    setRegFullName("");
    setRegCpf("");
    setRegAddress("");
    setRegPhone("");
    setRegEmail("");
    setRegConfirmEmail("");
    setRegPassword("");
    setRegPasswordVisible(false);
    setCnhPhotoUri(null);
  }

  function resetMelosaFlow() {
    setMelosaObraCodigo(obrasDisponiveis[0]?.codigo ?? 229);
    setMelosaPlacaTexto("");
    setMelosaFornecedorTexto("");
    setMelosaIsTransbordo(false);
    setMelosaEquipamentoPlacaTexto("");
    setMelosaEquipamentoNomeTexto("");
    setMelosaEquipamentoEmpresa("");
    setMelosaEquipamentoQrOpen(false);
    setMelosaEquipamentoQrLoading(false);
    setMelosaEquipamentoAtivoLookupLoading(false);
    setMelosaTanqueNumero(1);
    setMelosaRegKmText("");
    setMelosaRegLitrosText("");
    setMelosaRegCombustivelTipo("DIESEL_S10");
    setMelosaComprovanteFotoUri(null);
    setMelosaQuantidadeAbastecidaTexto("");
    setMelosaQuantidadeAbastecidaFotoUri(null);
    setMelosaEncerranteInicialTexto("");
    setMelosaEncerranteFinalTexto("");
    setMelosaNaoTenhoHorimetro(false);
    setMelosaHorimetroMotivo("");
    setMelosaLubrificado(false);
    setMelosaHorimetroEquipamentoNumero("");
    setMelosaHorimetroEquipamentoFotoUri(null);
    setMelosaMotoristaEquipamentoTexto("");
    setMelosaEquipamentoOperadorFotoUri(null);
    setMelosaAssinaturaOperadorDataUrl(null);
    setMelosaAssinaturaMotoristaDataUrl(null);
    setMelosaWdrKmText("");
    setMelosaWdrLitrosText("");
    setMelosaWdrCombustivelTipo("DIESEL");
    setMelosaTanqueFotoUri(null);
    setLocalLatitude(null);
    setLocalLongitude(null);
    setLocalAddress(null);
  }

  type MelosaEquipamentoLookup = {
    ativo: string;
    nome: string | null;
    empresa: string | null;
    placa?: string | null;
    contrato?: string | null;
    obra_externa?: string | null;
    source: string;
  };

  function pickMelosaEquipamentoDescricao(ativo: string, nome?: string | null): string {
    const descricao = nome?.trim() || "";
    if (!descricao) return "";
    if (normalizeAtivoPatrimonio(descricao) === normalizeAtivoPatrimonio(ativo)) return "";
    return descricao;
  }

  function applyMelosaEquipamentoFromLookup(
    equipamento: Pick<MelosaEquipamentoLookup, "ativo" | "nome" | "empresa" | "placa">,
    options?: { updateAtivo?: boolean; updatePlaca?: boolean },
  ) {
    if (options?.updateAtivo && equipamento.ativo?.trim()) {
      skipMelosaAtivoLookupRef.current = true;
      setMelosaFornecedorTexto(equipamento.ativo);
    }
    if (options?.updatePlaca) {
      skipMelosaPlacaLookupRef.current = true;
      setMelosaEquipamentoPlacaTexto((equipamento.placa ?? "").trim().toUpperCase());
    }
    setMelosaEquipamentoNomeTexto(pickMelosaEquipamentoDescricao(equipamento.ativo, equipamento.nome));
    setMelosaEquipamentoEmpresa(equipamento.empresa ?? "");
  }

  function rememberEquipamentoLocal(
    equipamento: { ativo: string; nome?: string | null; empresa?: string | null; placa?: string | null },
    extraAlias?: string | null,
  ) {
    const next = upsertCachedEquipamento(equipamentoCatalogRef.current, equipamento, extraAlias);
    equipamentoCatalogRef.current = next;
    void saveEquipamentoCatalog(next);
  }

  function applyEquipamentoFromLocalCatalog(query: string): boolean {
    const found = findCachedEquipamento(equipamentoCatalogRef.current, query);
    if (!found?.ativo?.trim()) return false;
    applyMelosaEquipamentoFromLookup(found, { updateAtivo: true, updatePlaca: true });
    return true;
  }

  function equipamentoLocalParaSalvar(ativo: string): { empresa: string; nome: string } {
    const empresa = melosaEquipamentoEmpresa.trim();
    const nome = melosaEquipamentoNomeTexto.trim();
    if (empresa && nome) return { empresa, nome };
    const found = findCachedEquipamento(equipamentoCatalogRef.current, ativo);
    return {
      empresa: empresa || found?.empresa?.trim() || "",
      nome: nome || found?.nome?.trim() || "",
    };
  }

  async function fetchMelosaEquipamentoByQr(qr: string): Promise<MelosaEquipamentoLookup | null> {
    if (!session?.access_token || !qr.trim()) return null;
    const { equipamento } = await apiPost<{ equipamento: MelosaEquipamentoLookup }>(
      "/v1/equipamentos/qr/lookup",
      session.access_token,
      {
        qr: qr.trim(),
        obra_codigo: melosaObraCodigo,
      },
    );
    return equipamento;
  }

  async function lookupMelosaEquipamentoFromQrScan(qrData: string): Promise<MelosaEquipamentoLookup> {
    const normalized = normalizeEquipamentoQrScan(qrData);
    const primary = buildEquipamentoQrLookupPayload(qrData) || normalized || qrData.trim();

    try {
      const equipamento = await fetchMelosaEquipamentoByQr(primary);
      if (equipamento?.ativo?.trim()) return equipamento;
    } catch (firstError) {
      const parsed = parseEquipamentoQrContent(normalized || qrData);
      if (parsed?.kind === "token" && parsed.token !== primary) {
        const equipamento = await fetchMelosaEquipamentoByQr(parsed.token);
        if (equipamento?.ativo?.trim()) return equipamento;
      }
      throw firstError;
    }

    const parsed = parseEquipamentoQrContent(normalized || qrData);
    if (parsed?.kind === "token") {
      const equipamento = await fetchMelosaEquipamentoByQr(parsed.token);
      if (equipamento?.ativo?.trim()) return equipamento;
    }

    throw new Error("Equipamento não encontrado.");
  }

  async function fetchMelosaEquipamentoByAtivo(ativo: string): Promise<MelosaEquipamentoLookup | null> {
    return fetchMelosaEquipamentoByQr(ativo);
  }

  async function lookupMelosaEquipamentoPatrimonio(ativo: string) {
    if (!session?.access_token || !isOnline || !ativo.trim()) return;
    const seq = ++melosaAtivoLookupSeqRef.current;
    setMelosaEquipamentoAtivoLookupLoading(true);
    try {
      const equipamento = await fetchMelosaEquipamentoByAtivo(ativo.trim());
      if (seq !== melosaAtivoLookupSeqRef.current) return;
      if (equipamento) {
        rememberEquipamentoLocal(equipamento, ativo.trim());
        applyMelosaEquipamentoFromLookup(equipamento, { updateAtivo: true, updatePlaca: true });
      } else {
        setMelosaEquipamentoNomeTexto("");
        setMelosaEquipamentoEmpresa("");
      }
    } catch {
      // Patrimônio não cadastrado (404) ou erro de rede: usa a cópia local, se houver.
      if (seq === melosaAtivoLookupSeqRef.current && !applyEquipamentoFromLocalCatalog(ativo.trim())) {
        setMelosaEquipamentoNomeTexto("");
        setMelosaEquipamentoEmpresa("");
      }
    } finally {
      if (seq === melosaAtivoLookupSeqRef.current) {
        setMelosaEquipamentoAtivoLookupLoading(false);
      }
    }
  }

  async function handleMelosaEquipamentoQrScanned(qrData: string) {
    if (!session?.access_token) {
      Alert.alert("Sem sessão", "Faça login antes de ler o QR code.");
      setMelosaEquipamentoQrOpen(false);
      return;
    }
    if (!isOnline) {
      const parsed = parseEquipamentoQrContent(qrData);
      const ativoLocal =
        (parsed?.kind === "abast" ? parsed.ativo : null) ||
        parseAbastEquipamentoQrAtivo(qrData) ||
        (parsed?.kind === "token" ? parsed.token : "");
      if (ativoLocal && applyEquipamentoFromLocalCatalog(ativoLocal)) {
        setMelosaEquipamentoQrOpen(false);
        Alert.alert(
          "Equipamento identificado",
          "Dados carregados da cópia salva no celular. O lançamento será enviado quando houver internet.",
        );
        return;
      }
      Alert.alert(
        "Sem internet",
        "Este QR ainda não está na cópia do celular. Informe o patrimônio, ou conecte uma vez para atualizar o cadastro. O lançamento fica salvo no celular e sobe depois.",
      );
      setMelosaEquipamentoQrOpen(false);
      return;
    }

    setMelosaEquipamentoQrLoading(true);
    try {
      const equipamento = await lookupMelosaEquipamentoFromQrScan(qrData);
      skipMelosaAtivoLookupRef.current = true;
      skipMelosaPlacaLookupRef.current = true;
      setMelosaFornecedorTexto(equipamento.ativo);
      rememberEquipamentoLocal(equipamento, qrData);
      applyMelosaEquipamentoFromLookup(equipamento, { updateAtivo: true, updatePlaca: true });
      setMelosaEquipamentoQrOpen(false);
      const origem =
        equipamento.source === "externo"
          ? "Controle de Equipamentos"
          : equipamento.source === "abast"
            ? "Controle Abast"
            : "cadastro local";
      const descricao = pickMelosaEquipamentoDescricao(equipamento.ativo, equipamento.nome);
      const descricaoLabel = descricao ? `\nDescrição: ${descricao}` : "";
      const placaLabel = equipamento.placa?.trim() ? `\nPlaca: ${equipamento.placa.trim()}` : "";
      const contratoLabel = equipamento.contrato?.trim() ? `\nContrato: ${equipamento.contrato.trim()}` : "";
      const obraLabel = equipamento.obra_externa?.trim() ? `\nObra: ${equipamento.obra_externa.trim()}` : "";
      Alert.alert(
        "Equipamento identificado",
        `Ativo: ${equipamento.ativo}${placaLabel}\nEmpresa: ${labelEquipamentoEmpresa(equipamento.empresa)}${descricaoLabel}${contratoLabel}${obraLabel}\n\nFonte: ${origem}`,
      );
    } catch (e: unknown) {
      const ativoLocal = parseAbastEquipamentoQrAtivo(qrData);
      if (ativoLocal) {
        const equipamento = await fetchMelosaEquipamentoByAtivo(ativoLocal);
        skipMelosaAtivoLookupRef.current = true;
        skipMelosaPlacaLookupRef.current = true;
        setMelosaFornecedorTexto(equipamento?.ativo ?? ativoLocal);
        if (equipamento) {
          rememberEquipamentoLocal(equipamento, qrData);
          applyMelosaEquipamentoFromLookup(equipamento, { updateAtivo: true, updatePlaca: true });
        } else {
          setMelosaEquipamentoNomeTexto("");
          setMelosaEquipamentoEmpresa("");
          setMelosaEquipamentoPlacaTexto("");
        }
        setMelosaEquipamentoQrOpen(false);
        const empresaLabel = equipamento?.empresa
          ? `\nEmpresa: ${labelEquipamentoEmpresa(equipamento.empresa)}`
          : "";
        const placaLabel = equipamento?.placa?.trim() ? `\nPlaca: ${equipamento.placa.trim()}` : "";
        Alert.alert(
          "Equipamento identificado (QR interno)",
          `Ativo: ${equipamento?.ativo ?? ativoLocal}${placaLabel}${empresaLabel}\n\n${equipamento ? "Dados carregados da API." : "Os dados completos não puderam ser carregados da API. Confira o ativo antes de salvar."}`,
        );
        return;
      }
      setMelosaEquipamentoQrOpen(false);
      const apiHint =
        e instanceof Error && e.message.includes("não reconhecido")
          ? "\n\nVerifique se a API está com EQUIPAMENTOS_DB_URL ou EQUIPAMENTOS_SUPABASE_SERVICE_ROLE_KEY configurados."
          : "";
      Alert.alert("QR não reconhecido", `${e instanceof Error ? e.message : "Não foi possível identificar o equipamento."}${apiHint}`);
    } finally {
      setMelosaEquipamentoQrLoading(false);
    }
  }

  function aplicarEquipamentoNoTanque(equipamento: {
    ativo: string;
    nome?: string | null;
    empresa?: string | null;
  }) {
    setPlacaTexto(equipamento.ativo.trim().toUpperCase());
    setTanqueEquipamentoNome(equipamento.nome?.trim() || "");
    setTanqueEquipamentoEmpresa(equipamento.empresa?.trim() || "");
  }

  async function handleTanqueEquipamentoQrScanned(qrData: string) {
    setTanqueEquipamentoQrOpen(false);
    const parsed = parseEquipamentoQrContent(qrData);
    const ativoLocal =
      (parsed?.kind === "abast" ? parsed.ativo : null) ||
      parseAbastEquipamentoQrAtivo(qrData) ||
      (parsed?.kind === "token" ? parsed.token : "");

    if (!isOnline || !session?.access_token) {
      const found = findCachedEquipamento(equipamentoCatalogRef.current, ativoLocal || qrData);
      if (found?.ativo) {
        aplicarEquipamentoNoTanque(found);
        return;
      }
      if (ativoLocal && parsed?.kind !== "token") {
        setPlacaTexto(ativoLocal.trim().toUpperCase());
        setTanqueEquipamentoNome("");
        setTanqueEquipamentoEmpresa("");
        return;
      }
      Alert.alert(
        "Sem internet",
        "Este QR ainda não está na cópia do celular. Informe o patrimônio do equipamento.",
      );
      return;
    }

    try {
      const { equipamento } = await apiPost<{
        equipamento?: { ativo: string; nome?: string | null; empresa?: string | null } | null;
      }>("/v1/equipamentos/qr/lookup", session.access_token, {
        qr: buildEquipamentoQrLookupPayload(qrData) || qrData.trim(),
        obra_codigo: obraCodigo,
      });
      if (!equipamento?.ativo?.trim()) {
        throw new Error("Equipamento não encontrado.");
      }
      rememberEquipamentoLocal(equipamento, qrData);
      aplicarEquipamentoNoTanque(equipamento);
    } catch (e: unknown) {
      const found = findCachedEquipamento(equipamentoCatalogRef.current, ativoLocal || qrData);
      if (found?.ativo) {
        aplicarEquipamentoNoTanque(found);
        return;
      }
      Alert.alert(
        "QR não reconhecido",
        e instanceof Error ? e.message : "Não foi possível identificar o equipamento.",
      );
    }
  }

  type EnsureProfilePayload = {
    full_name: string;
    cpf: string;
    address: string;
    phone: string;
    email: string;
    cnh_storage_path: string;
  };

  function normalizeCpf(input: string) {
    return input.replace(/\D/g, "");
  }

  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function testApiConnection() {
    let apiBase = "";
    let healthUrl = "";
    try {
      apiBase = env.API_URL?.trim() ?? "";
      if (!apiBase) {
        Alert.alert("API não configurada", "Configure EXPO_PUBLIC_API_URL antes de testar.");
        return;
      }

      healthUrl = `${apiBase.replace(/\/+$/, "")}/health`;
      const response = await withTimeout(
        fetch(healthUrl, { method: "GET" }),
        15000,
        "Tempo limite ao chamar /health da API."
      );

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} em /health. Resposta: ${raw || "(vazia)"}`);
      }

      Alert.alert("API OK", `Conexão funcionando.\n\nURL: ${healthUrl}\nResposta: ${raw || "(vazia)"}`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      Alert.alert(
        "Falha na conexão da API",
        `Erro ao testar EXPO_PUBLIC_API_URL.\n\nAPI_URL: ${apiBase || "(vazia)"}\nHealth URL: ${healthUrl || "(não montada)"}\n\nDetalhe técnico:\n${msg}`
      );
    }
  }

  function isNetworkFailureMessage(message: string) {
    const m = message.toLowerCase();
    return (
      m.includes("network request failed") ||
      m.includes("failed to fetch") ||
      m.includes("network error") ||
      m.includes("tempo limite de rede")
    );
  }

  function isInvalidTokenMessage(message: string) {
    return message.toLowerCase().includes("invalid token");
  }

  async function getUsableAccessToken() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { data: sessionData } = await supabase.auth.getSession();
    const current = sessionData.session;
    if (!current) throw new Error("Sessão não encontrada. Faça login novamente.");

    if (!current.expires_at || current.expires_at - nowSec > 60) {
      return current.access_token;
    }

    // Sem internet: mantém o token local — o registro fica na fila offline
    // e o refresh acontece quando houver conexão.
    const net = await NetInfo.fetch();
    const online = Boolean(net.isInternetReachable ?? net.isConnected);
    if (!online) {
      return current.access_token;
    }

    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !refreshed.session?.access_token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    setSession(refreshed.session);
    return refreshed.session.access_token;
  }

  async function syncOutboxWithTokenRetry() {
    const token = await getUsableAccessToken();
    try {
      return await syncOutbox(token);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!isInvalidTokenMessage(msg)) throw e;

      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshed.session?.access_token) throw e;
      setSession(refreshed.session);
      return syncOutbox(refreshed.session.access_token);
    }
  }

  /** Salva na fila, tenta sync se online e devolve o resultado para o modal de confirmação. */
  async function finalizeSaveWithAck(params: {
    titulo: string;
    ativo: string;
    litros: string | number;
  }): Promise<SaveAckResult> {
    const litrosLabel =
      typeof params.litros === "number"
        ? String(params.litros)
        : String(params.litros ?? "").trim() || "—";
    const base = {
      titulo: params.titulo,
      ativo: params.ativo.trim() || "—",
      litros: litrosLabel,
    };

    if (!isOnline) {
      return {
        ...base,
        status: "pending",
      };
    }

    try {
      const r = await syncOutboxWithTokenRetry();
      setPending(outboxCount());
      if (r.synced > 0) {
        return { ...base, status: "synced" };
      }
      return {
        ...base,
        status: "pending",
      };
    } catch (e: unknown) {
      setPending(outboxCount());
      const msg = e instanceof Error ? e.message : String(e);
      if (isNetworkFailureMessage(msg)) {
        return { ...base, status: "pending" };
      }
      return {
        ...base,
        status: "error",
        erro: msg,
      };
    }
  }

  async function ensureRole(token: string, profile?: EnsureProfilePayload) {
    const body = profile
      ? {
          role: "user" as const,
          platform: "app" as const,
          full_name: profile.full_name,
          cpf: profile.cpf,
          address: profile.address,
          phone: profile.phone,
          email: profile.email,
          cnh_storage_path: profile.cnh_storage_path,
        }
      : { role: "user" as const, platform: "app" as const };
    await apiPost("/v1/auth/ensure-role", token, body, { action: "ensure-role" });
  }

  async function pickCnhPhotoFromLibrary() {
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto da CNH.",
    );
    if (uri) setCnhPhotoUri(uri);
  }

  async function pickCnhPhotoFromCamera() {
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto da CNH.",
    );
    if (uri) setCnhPhotoUri(uri);
  }

  async function pickNotaFotoFromLibrary() {
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto da nota.",
    );
    if (uri) setNotaFotoUri(uri);
  }

  async function pickNotaFotoFromCamera() {
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto da nota.",
    );
    if (uri) setNotaFotoUri(uri);
  }

  async function pickLacreTanqueFotoFromLibrary() {
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto do lacre do tanque.",
    );
    if (uri) setLacreTanqueFotoUri(uri);
  }

  async function pickLacreTanqueFotoFromCamera() {
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto do lacre do tanque.",
    );
    if (uri) setLacreTanqueFotoUri(uri);
  }

  async function pickLacreMelosaFotoFromLibrary() {
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto do lacre da melosa.",
    );
    if (uri) setLacreMelosaFotoUri(uri);
  }

  async function pickLacreMelosaFotoFromCamera() {
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto do lacre da melosa.",
    );
    if (uri) setLacreMelosaFotoUri(uri);
  }

  async function pickTanqueQuantidadeAbastecidaFromLibrary() {
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto do medidor de abastecimento.",
    );
    if (uri) setTanqueQuantidadeAbastecidaFotoUri(uri);
  }

  async function pickTanqueQuantidadeAbastecidaFromCamera() {
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto do medidor de abastecimento.",
    );
    if (uri) setTanqueQuantidadeAbastecidaFotoUri(uri);
  }

  async function pickMelosaComprovanteFromLibrary() {
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto do comprovante.",
    );
    if (uri) setMelosaComprovanteFotoUri(uri);
  }

  async function pickMelosaComprovanteFromCamera() {
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto do comprovante.",
    );
    if (uri) setMelosaComprovanteFotoUri(uri);
  }

  async function pickMelosaQuantidadeAbastecidaFromLibrary() {
    await persistMelosaFlowCheckpoint("quantidade_abastecida");
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto da quantidade abastecida.",
    );
    if (uri) setMelosaQuantidadeAbastecidaFotoUri(uri);
  }

  async function pickMelosaHorimetroEquipamentoFromLibrary() {
    await persistMelosaFlowCheckpoint("horimetro");
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto do horímetro do equipamento abastecido.",
    );
    if (uri) setMelosaHorimetroEquipamentoFotoUri(uri);
  }

  async function pickMelosaHorimetroEquipamentoFromCamera() {
    await persistMelosaFlowCheckpoint("horimetro");
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto do horímetro do equipamento abastecido.",
    );
    if (uri) setMelosaHorimetroEquipamentoFotoUri(uri);
  }

  async function pickMelosaEquipamentoOperadorFromLibrary() {
    await persistMelosaFlowCheckpoint("horimetro");
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto do equipamento com o operador/motorista.",
    );
    if (uri) setMelosaEquipamentoOperadorFotoUri(uri);
  }

  async function pickMelosaEquipamentoOperadorFromCamera() {
    await persistMelosaFlowCheckpoint("horimetro");
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto do equipamento com o operador/motorista.",
    );
    if (uri) setMelosaEquipamentoOperadorFotoUri(uri);
  }

  async function pickMelosaQuantidadeAbastecidaFromCamera() {
    await persistMelosaFlowCheckpoint("quantidade_abastecida");
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto da quantidade abastecida.",
    );
    if (uri) setMelosaQuantidadeAbastecidaFotoUri(uri);
  }

  async function pickMelosaTanqueFromLibrary() {
    const uri = await pickImageFromLibrary(
      "Habilite o acesso à galeria para enviar a foto do tanque.",
    );
    if (uri) setMelosaTanqueFotoUri(uri);
  }

  async function pickMelosaTanqueFromCamera() {
    const uri = await pickImageFromCamera(
      "Habilite o acesso à câmera para tirar a foto do tanque.",
    );
    if (uri) setMelosaTanqueFotoUri(uri);
  }

  async function onRegister() {
    try {
      if (busy) return;
      setBusy(true);
      setMessage(null);

      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        throw new Error("Env do Supabase não configurado (EXPO_PUBLIC_*)");
      }

      const required = [
        ["Nome completo", regFullName],
        ["CPF", regCpf],
        ["Endereço", regAddress],
        ["Telefone", regPhone],
        ["Email", regEmail],
        ["Confirmação email", regConfirmEmail],
        ["Senha", regPassword],
        ["Foto CNH", cnhPhotoUri],
      ] as const;
      for (const [label, value] of required) {
        if (!String(value ?? "").trim()) throw new Error(`${label} é obrigatório.`);
      }

      if (regEmail.trim().toLowerCase() !== regConfirmEmail.trim().toLowerCase()) {
        throw new Error("Os emails não conferem. Verifique a confirmação.");
      }

      const apiBase = env.API_URL?.trim();
      if (!apiBase) {
        throw new Error("Configure EXPO_PUBLIC_API_URL no .env (ex.: http://192.168.x.x:3001).");
      }

      setMessage("Criando credenciais...");
      try {
        await registerCredentials(regEmail.trim(), regPassword);
      } catch (apiErr: any) {
        const detail = String(apiErr?.message ?? apiErr).toLowerCase();
        if (detail.includes("network request failed") || detail.includes("failed to fetch")) {
          throw new Error(
            `O celular não conseguiu falar com a API (${apiBase}).\n\n` +
              `• No PC: deixe rodando UMA instância: cd api && npm run dev (porta 3001).\n` +
              `• No celular, abra o navegador e teste: ${apiBase}/health (deve mostrar {"ok":true}).\n` +
              `• Mesma rede Wi‑Fi no PC e no celular; confira o IPv4 do PC no .env.\n` +
              `• Windows: libere a porta 3001 no Firewall (entrada TCP).\n` +
              `• Se você usa build nativo (não Expo Go), gere de novo o app após mudar app.json (HTTP/cleartext).`
          );
        }
        const alreadyExists =
          detail.includes("já está cadastrado") ||
          detail.includes("already registered") ||
          detail.includes("already exists") ||
          detail.includes("duplicate");
        if (!alreadyExists) throw apiErr;
      }

      setMessage("Entrando na conta...");
      const { data: signInData, error: signInErr } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: regEmail.trim(),
          password: regPassword,
        }),
        20000,
        "Tempo limite ao iniciar sessão no Supabase."
      );
      if (signInErr) throw new Error(signInErr.message);
      const activeSession = signInData.session;
      if (!activeSession?.access_token) throw new Error("Não foi possível iniciar sessão após o cadastro.");

      setSession(activeSession);

      const CNH_BUCKET = "cnh";
      const userId = activeSession.user?.id;
      if (!userId) throw new Error("Usuário não retornou na criação do cadastro.");

      setMessage("Lendo foto da CNH...");
      const { arrayBuffer: cnhBytes, contentType: cnhContentType } = await withTimeout(
        readImageUriAsArrayBuffer(cnhPhotoUri as string),
        20000,
        "Tempo limite ao ler a foto da CNH no dispositivo."
      );
      const extMatch = String(cnhPhotoUri).match(/\.(\w+)(?:\?|#|$)/);
      const ext = (extMatch?.[1] ?? "jpg").toLowerCase();
      const safeExt = ext === "png" ? "png" : "jpg";
      const filePath = `${userId}/cnh.${safeExt}`;
      const cnhBytesArr = new Uint8Array(cnhBytes);
      let cnhBinary = "";
      for (let i = 0; i < cnhBytesArr.length; i++) cnhBinary += String.fromCharCode(cnhBytesArr[i]!);
      const cnhDataBase64 = btoa(cnhBinary);

      setMessage("Enviando foto da CNH...");
      try {
        await withTimeout(
          apiPost(
            "/v1/media/upload",
            activeSession.access_token,
            {
              bucket: CNH_BUCKET,
              storage_path: filePath,
              content_type: cnhContentType,
              data_base64: cnhDataBase64,
              upsert: false,
            },
            { action: "cnh_upload" },
            60000
          ),
          60000,
          "Tempo limite no upload da foto da CNH."
        );
      } catch (uploadErr: any) {
        const msg = String(uploadErr?.message ?? uploadErr);
        if (!msg.toLowerCase().includes("already exists") && !msg.toLowerCase().includes("duplicate")) {
          throw new Error(`Falha ao enviar foto da CNH: ${msg}`);
        }
      }

      setMessage("Gravando perfil...");
      const cpfNormalized = normalizeCpf(regCpf.trim());
      if (cpfNormalized.length !== 11) {
        throw new Error("CPF inválido. Informe os 11 dígitos.");
      }

      const { error: profileError } = await withTimeout(
        supabase.from("profiles").upsert(
          {
            user_id: userId,
            full_name: regFullName.trim(),
            cpf: cpfNormalized,
            address: regAddress.trim(),
            phone: regPhone.trim(),
            email: regEmail.trim().toLowerCase(),
            cnh_storage_path: filePath,
            role: "user",
            active: false,
          },
          { onConflict: "user_id" }
        ),
        20000,
        "Tempo limite ao gravar perfil na tabela profiles."
      );
      if (profileError) {
        const msg = String(profileError.message ?? "");
        if (msg.toLowerCase().includes("duplicate key") || msg.toLowerCase().includes("profiles_cpf_key")) {
          throw new Error("CPF já cadastrado para outro usuário.");
        }
        throw new Error(`Falha ao gravar perfil: ${msg}`);
      }

      setPending(outboxCount());
      setMessage("Cadastro OK. Bem-vindo!");
      setScreen({ name: "home" });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes("rate limit exceeded")) {
        Alert.alert("Limite atingido", "Você atingiu o limite de envio de email do Supabase. Aguarde alguns minutos e tente novamente.");
        setMessage("Limite atingido. Aguarde alguns minutos e tente novamente.");
        return;
      }
      Alert.alert("Registro falhou", msg);
    } finally {
      setBusy(false);
    }
  }

  async function onLogin() {
    try {
      setBusy(true);
      setMessage(null);

      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        throw new Error("Env do Supabase não configurado (EXPO_PUBLIC_*)");
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error("Sessão não criada");

      try {
        await ensureRole(data.session.access_token);
      } catch (ensureErr: any) {
        const ensureMsg = String(ensureErr?.message ?? ensureErr);
        if (isNetworkFailureMessage(ensureMsg)) {
          throw new Error(
            `Falha de rede ao chamar /v1/auth/ensure-role na API (${env.API_URL?.trim() ?? "API_URL não configurada"}). ` +
              "Confirme que a API está rodando (npm run dev na pasta api), celular e PC na mesma rede, " +
              "e que EXPO_PUBLIC_API_URL no mobile/.env usa o IPv4 atual do PC (ipconfig). Reinicie o Expo após alterar o .env."
          );
        }
        throw new Error(`Falha em /v1/auth/ensure-role: ${ensureMsg}`);
      }
      setSession(data.session);
      setScreen({ name: "home" });
      setPending(outboxCount());
      setMessage("Login OK.");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("fieldErrors") && msg.includes("Required")) {
        Alert.alert(
          "Cadastro incompleto",
          "Seu cadastro está incompleto na tabela de perfis (CPF/endereço/telefone/CNH). Refaça o registro e envie a foto da CNH."
        );
        setScreen({ name: "registro" });
      } else if (msg.toLowerCase().includes("perfil inativo")) {
        Alert.alert("Acesso bloqueado", "Seu cadastro está inativo. Peça para um administrador liberar seu acesso.");
        try {
          await supabase.auth.signOut();
        } catch {
        }
      } else if (msg.toLowerCase().includes("não tem permissão") || msg.toLowerCase().includes("aplicativo mobile")) {
        Alert.alert(
          "Acesso bloqueado",
          "Esta conta é de utilizador web e não pode entrar no aplicativo. Peça ao administrador para alterar o tipo de utilizador."
        );
        try {
          await supabase.auth.signOut();
        } catch {
        }
      } else if (isNetworkFailureMessage(msg)) {
        Alert.alert(
          "Login falhou",
          `Falha de rede no login do Supabase.\n\nSUPABASE_URL: ${env.SUPABASE_URL?.trim() ?? "(vazia)"}\nAPI_URL: ${
            env.API_URL?.trim() ?? "(vazia)"
          }\n\nDetalhe técnico:\n${msg}`
        );
      } else {
        Alert.alert("Login falhou", msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    try {
      logoutIntentionalRef.current = true;
      try {
        await supabase.auth.signOut();
      } catch (e: any) {
        Alert.alert("Sair", String(e?.message ?? e));
      }
      await clearMelosaFlowCheckpoint();
      setSession(null);
      setScreen({ name: "login" });
      setLoginPasswordVisible(false);
      resetForm();
      resetRegistrationForm();
      setMessage("Logout.");
    } finally {
      setBusy(false);
    }
  }

  function parseLitros(text: string) {
    const normalized = text.replace(",", ".").trim();
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return value;
  }

  function parseDecimal(text: string) {
    const normalized = text.replace(",", ".").trim();
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return value;
  }

  function parseMelosaMedidorNumero(text: string) {
    const normalized = text.replace(/\s/g, "").replace(",", ".").trim();
    if (!normalized) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return value;
  }

  function isMelosaObraUsina(obraCodigo = melosaObraCodigo) {
    return Number(obraCodigo) === OBRA_USINA_CODIGO;
  }

  function syncMelosaQuantidadeFromEncerrante(inicialTexto: string, finalTexto: string) {
    const inicial = parseMelosaMedidorNumero(inicialTexto);
    const final = parseMelosaMedidorNumero(finalTexto);
    if (inicial == null || final == null || final < inicial) return;
    const diff = final - inicial;
    const formatted = Number.isInteger(diff) ? String(diff) : String(Number(diff.toFixed(3)));
    setMelosaQuantidadeAbastecidaTexto(formatted);
  }

  function onMelosaEncerranteInicialChange(text: string) {
    setMelosaEncerranteInicialTexto(text);
    syncMelosaQuantidadeFromEncerrante(text, melosaEncerranteFinalTexto);
  }

  function onMelosaEncerranteFinalChange(text: string) {
    setMelosaEncerranteFinalTexto(text);
    syncMelosaQuantidadeFromEncerrante(melosaEncerranteInicialTexto, text);
  }

  async function captureLocationAndAddress(): Promise<{
    latitude: number;
    longitude: number;
    address: string | null;
  } | null> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permissão negada", "Habilite a localização para continuar.");
        return null;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocalLatitude(null);
        setLocalLongitude(null);
        setLocalAddress(null);
        Alert.alert("Localização desativada", "Ative os serviços de localização do dispositivo.");
        return null;
      }

      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        setLocalLatitude(lastKnown.coords.latitude);
        setLocalLongitude(lastKnown.coords.longitude);
      }

      let position: Location.LocationObject | null = null;
      try {
        const currentWithTimeout = Promise.race<Location.LocationObject | null>([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<Location.LocationObject | null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
        position = await currentWithTimeout;
      } catch {
        position = null;
      }
      if (!position && !lastKnown) {
        throw new Error("Current location is unavailable. Make sure that location services are enabled");
      }

      const finalPosition = position ?? lastKnown!;
      const latitude = finalPosition.coords.latitude;
      const longitude = finalPosition.coords.longitude;

      setLocalLatitude(latitude);
      setLocalLongitude(longitude);

      if (!isOnline) {
        setLocalAddress(null);
        return { latitude, longitude, address: null };
      }

      let address: string | null = null;
      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        const first = geocoded?.[0];
        address = first
          ? [
              first.street,
              first.city,
              first.region,
              first.postalCode,
              first.country,
            ]
              .filter(Boolean)
              .join(", ")
          : null;
        setLocalAddress(address);
      } catch {
        setLocalAddress(null);
      }
      return { latitude, longitude, address };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes("current location is unavailable")) {
        setLocalLatitude(null);
        setLocalLongitude(null);
        setLocalAddress(null);
        Alert.alert("Localização indisponível", "O emulador não tem posição definida. Defina uma localização no Emulator.");
        return null;
      }
      setLocalAddress(null);
      return null;
    }
  }

  function safeCaptureLocationAndAddress() {
    Promise.resolve(captureLocationAndAddress()).catch(() => {
      setLocalAddress(null);
    });
  }

  function selecionarTanque(ativo: string) {
    setTanqueAtivo(ativo);
    const tanque = tanquesCadastrados.find((t) => t.ativo === ativo);
    const oleo = codigoOleoPorTexto(tanque?.nome);
    if (oleo) {
      setObraCombustivelTipo(oleo);
      return;
    }
    setObraCombustivelTipo((atual) => (codigoOleoPorTexto(atual) ? "DIESEL_S10" : atual));
  }

  function selecionarInsumoTanque(codigo: string) {
    setObraCombustivelTipo(codigo);
    const oleo = codigoOleoPorTexto(codigo);
    if (!oleo) return;
    const daObra = tanquesDisponiveis.filter((t) => tanquePertenceObraMobile(t, obraCodigo));
    const pool = daObra.length > 0 ? daObra : tanquesDisponiveis;
    const tanque = pool.find((t) => codigoOleoPorTexto(t.nome) === oleo);
    if (tanque) setTanqueAtivo(tanque.ativo);
  }

  function continueRetiradaTanqueDados() {
    const paraEquipamento = retiradaDestino === "EQUIPAMENTO";
    if (!tanqueNumero) {
      Alert.alert(
        "Tanque obrigatório",
        tanquesDisponiveis.length === 0
          ? "Nenhum tanque cadastrado. Peça ao administrador cadastrar em Tanques na web."
          : "Selecione o tanque.",
      );
      return;
    }
    if (!placaTexto.trim()) {
      Alert.alert(
        "Patrimônio obrigatório",
        paraEquipamento ? "Informe o patrimônio do equipamento." : "Selecione o patrimônio (melosa).",
      );
      return;
    }
    if (!obraCombustivelTipo.trim()) {
      Alert.alert("Insumo obrigatório", "Selecione o tipo de insumo.");
      return;
    }
    if (!retiradaMotoristaMelosaTexto.trim()) {
      Alert.alert(
        "Nome obrigatório",
        paraEquipamento ? "Informe o operador do equipamento." : "Informe o nome do motorista da melosa.",
      );
      return;
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "detalhes" });
  }

  function continueRetiradaTanqueDetalhes() {
    const paraEquipamento = retiradaDestino === "EQUIPAMENTO";
    if (!numeroLacreTanque.trim()) {
      Alert.alert("Lacre obrigatório", "Informe o número do lacre do tanque.");
      return;
    }
    if (!lacreTanqueFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto do lacre do tanque.");
      return;
    }
    if (!paraEquipamento) {
      if (!numeroLacreMelosa.trim()) {
        Alert.alert("Lacre obrigatório", "Informe o número do lacre da melosa.");
        return;
      }
      if (!lacreMelosaFotoUri) {
        Alert.alert("Foto obrigatória", "Selecione a foto do lacre da melosa.");
        return;
      }
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "quantidade_abastecida" });
  }

  function continueRetiradaTanqueQuantidadeAbastecida() {
    if (!tanqueQuantidadeAbastecidaTexto.trim()) {
      Alert.alert("Quantidade obrigatória", "Informe a quantidade abastecida em litros.");
      return;
    }
    if (!tanqueQuantidadeAbastecidaFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto do medidor de abastecimento.");
      return;
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "resumo" });
  }

  function continueEntradaTanqueDados() {
    if (!tanqueNumero) {
      Alert.alert(
        "Tanque obrigatório",
        tanquesObra.length === 0
          ? "Nenhum tanque cadastrado para esta obra. Peça ao administrador cadastrar em Tanques na web."
          : "Selecione o tanque da obra.",
      );
      return;
    }
    if (!obraCombustivelTipo.trim()) {
      Alert.alert("Combustível obrigatório", "Selecione o tipo de combustível.");
      return;
    }
    if (!placaTexto.trim()) {
      Alert.alert("Placa obrigatória", "Informe a placa do veículo.");
      return;
    }
    if (!fornecedorTexto.trim()) {
      Alert.alert("Fornecedor obrigatório", "Informe o fornecedor.");
      return;
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "ENTRADA_TANQUE_OBRA", entradaStep: "detalhes" });
  }

  function continueEntradaTanqueDetalhes() {
    const litros = parseLitros(litrosText);
    if (litros == null || litros < 0) {
      Alert.alert("Litros inválidos", "Informe uma quantidade em litros.");
      return;
    }
    const valorUnitario = parseDecimal(valorUnitarioText);
    if (valorUnitario === null || valorUnitario < 0) {
      Alert.alert("Valor unitário inválido", "Informe um valor unitário válido.");
      return;
    }
    if (!notaNumero.trim()) {
      Alert.alert("Número da nota obrigatório", "Informe o número da nota.");
      return;
    }
    if (!notaFotoUri) {
      Alert.alert("Foto da nota obrigatória", "Selecione uma foto da nota fiscal.");
      return;
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "ENTRADA_TANQUE_OBRA", entradaStep: "resumo" });
  }

  function continueEntradaTanqueResumo() {
    if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaOperadorDataUrl)) {
      Alert.alert("Assinatura obrigatória", "Peça ao operador do tanque para assinar no resumo.");
      return;
    }
    if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaMelosaDataUrl)) {
      Alert.alert("Assinatura obrigatória", "Peça ao responsável pela entrega para assinar no resumo.");
      return;
    }
    setMessage(null);
    void submitMovement();
  }

  function continueRetiradaTanqueResumo() {
    if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaOperadorDataUrl)) {
      Alert.alert("Assinatura obrigatória", "Peça ao operador do tanque para assinar no resumo.");
      return;
    }
    if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaMelosaDataUrl)) {
      Alert.alert(
        "Assinatura obrigatória",
        retiradaDestino === "EQUIPAMENTO"
          ? "Peça ao operador do equipamento para assinar no resumo."
          : "Peça ao responsável pela melosa para assinar no resumo.",
      );
      return;
    }
    setMessage(null);
    void submitMovement();
  }

  async function submitMovement() {
    if (busy) return;
    setBusy(true);
    if (isMelosaUser) {
      Alert.alert("Acesso restrito", "Seu perfil é Melosa. Você só pode registrar movimentações da Melosa.");
      setBusy(false);
      return;
    }

    if (!session?.access_token) {
      Alert.alert("Sem sessão", "Faça login antes de registrar.");
      setBusy(false);
      return;
    }
    if (!tipoAtual) {
      setBusy(false);
      return;
    }

    try {

    const isTanqueObra = tipoAtual === "ENTRADA_TANQUE_OBRA" || tipoAtual === "RETIRADA_TANQUE";
    const isEntradaTanqueObra = tipoAtual === "ENTRADA_TANQUE_OBRA";
    const isRetiradaTanque = tipoAtual === "RETIRADA_TANQUE";

    let litros = 0;
    if (isEntradaTanqueObra) {
      litros = parseLitros(litrosText) ?? 0;
      if (litros < 0) {
        Alert.alert("Litros inválidos", "Informe uma quantidade em litros.");
        setBusy(false);
        return;
      }
    }

    if (isEntradaTanqueObra) {
      if (!tanqueNumero) {
        Alert.alert(
          "Tanque obrigatório",
          tanquesDisponiveis.length === 0
            ? "Nenhum tanque cadastrado. Peça ao administrador cadastrar em Tanques na web."
            : "Selecione o tanque.",
        );
        return;
      }
      if (!obraCombustivelTipo.trim()) {
        Alert.alert("Combustível obrigatório", "Selecione o tipo de combustível.");
        return;
      }

      if (!placaTexto.trim()) {
        Alert.alert("Placa obrigatória", "Informe a placa do veículo.");
        return;
      }

      if (!fornecedorTexto.trim()) {
        Alert.alert("Fornecedor obrigatório", "Informe o fornecedor.");
        return;
      }

      const valorUnitario = parseDecimal(valorUnitarioText);
      if (valorUnitario === null || valorUnitario < 0) {
        Alert.alert("Valor unitário inválido", "Informe um valor unitário válido.");
        return;
      }

      if (!notaNumero.trim()) {
        Alert.alert("Número da nota obrigatório", "Informe o número da nota.");
        return;
      }

      if (!notaFotoUri) {
        Alert.alert("Foto da nota obrigatória", "Selecione uma foto da nota fiscal.");
        return;
      }
    }
    if (isEntradaTanqueObra) {
      if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaOperadorDataUrl)) {
        Alert.alert("Assinatura obrigatória", "Peça ao operador do tanque para assinar no resumo.");
        setBusy(false);
        return;
      }
      if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaMelosaDataUrl)) {
        Alert.alert("Assinatura obrigatória", "Peça ao responsável pela entrega para assinar no resumo.");
        setBusy(false);
        return;
      }
    }
    if (isRetiradaTanque) {
      const paraEquipamento = retiradaDestino === "EQUIPAMENTO";
      if (!placaTexto.trim()) {
        Alert.alert(
          "Patrimônio obrigatório",
          paraEquipamento ? "Informe o patrimônio do equipamento." : "Selecione o patrimônio (melosa).",
        );
        return;
      }
      if (!obraCombustivelTipo.trim()) {
        Alert.alert("Insumo obrigatório", "Selecione o tipo de insumo.");
        return;
      }
      if (
        !numeroLacreTanque.trim() ||
        !lacreTanqueFotoUri ||
        (!paraEquipamento && (!numeroLacreMelosa.trim() || !lacreMelosaFotoUri))
      ) {
        Alert.alert(
          "Lacres obrigatórios",
          paraEquipamento
            ? "Preencha o lacre do tanque para continuar."
            : "Preencha os dados e fotos dos lacres para continuar.",
        );
        return;
      }
      if (!tanqueQuantidadeAbastecidaTexto.trim()) {
        Alert.alert("Quantidade obrigatória", "Informe a quantidade abastecida em litros.");
        return;
      }
      if (!tanqueQuantidadeAbastecidaFotoUri) {
        Alert.alert("Foto obrigatória", "Selecione a foto do medidor de abastecimento.");
        return;
      }
      if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaOperadorDataUrl)) {
        Alert.alert("Assinatura obrigatória", "Peça ao operador do tanque para assinar no resumo.");
        setBusy(false);
        return;
      }
      if (!isMeaningfulSignatureDataUrl(tanqueAssinaturaMelosaDataUrl)) {
        Alert.alert(
          "Assinatura obrigatória",
          retiradaDestino === "EQUIPAMENTO"
            ? "Peça ao operador do equipamento para assinar no resumo."
            : "Peça ao responsável pela melosa para assinar no resumo.",
        );
        setBusy(false);
        return;
      }
      const litrosTanque = parseMelosaMedidorNumero(tanqueQuantidadeAbastecidaTexto);
      if (litrosTanque == null || litrosTanque <= 0) {
        Alert.alert("Quantidade inválida", "Informe uma quantidade abastecida válida em litros.");
        setBusy(false);
        return;
      }
      litros = litrosTanque;
    }

    if (tipoAtual === "RETIRADA_MELOSA") {
      if (!placaTexto.trim()) {
        Alert.alert("Placa obrigatória", "Informe a placa.");
        return;
      }
      if (!fornecedorTexto.trim()) {
        Alert.alert("Fornecedor obrigatório", "Informe o fornecedor.");
        return;
      }
      if (localLatitude == null || localLongitude == null) {
        Alert.alert("Local obrigatório", "Aguarde a captura do GPS ou verifique se os serviços de localização estão ativos.");
        return;
      }
    }

    const operationId = uuidv4();
    // Data/hora do momento em que o operador salvou no celular (não a da sincronização).
    const dataHoraSalvaLocal = new Date().toISOString();

    let notaStoragePath: string | null = null;
    let lacreTanqueStoragePath: string | null = null;
    let lacreMelosaStoragePath: string | null = null;
    let tanqueQuantidadeAbastecidaStoragePath: string | null = null;
    let tanqueAssinaturaOperadorStoragePath: string | null = null;
    let tanqueAssinaturaMelosaStoragePath: string | null = null;

    if (isEntradaTanqueObra) {
      const NOTA_BUCKET = "notas";
      const TANQUE_ASSINATURAS_BUCKET = "melosa_assinaturas";
      const userId = session?.user?.id;
      if (!userId) throw new Error("Usuário não encontrado para salvar as fotos.");

      const filePath = `${userId}/notas/${operationId}.${extFromUri(notaFotoUri as string)}`;
      await stageImageFromUri(operationId, NOTA_BUCKET, filePath, notaFotoUri as string);
      notaStoragePath = filePath;

      const assinaturaOperadorPath = `${userId}/tanque/entrada/assinaturas/operador/${operationId}.png`;
      const assinaturaEntregaPath = `${userId}/tanque/entrada/assinaturas/entrega/${operationId}.png`;

      await stageImageFromDataUrl(
        operationId,
        TANQUE_ASSINATURAS_BUCKET,
        assinaturaOperadorPath,
        tanqueAssinaturaOperadorDataUrl as string,
      );
      await stageImageFromDataUrl(
        operationId,
        TANQUE_ASSINATURAS_BUCKET,
        assinaturaEntregaPath,
        tanqueAssinaturaMelosaDataUrl as string,
      );

      tanqueAssinaturaOperadorStoragePath = assinaturaOperadorPath;
      tanqueAssinaturaMelosaStoragePath = assinaturaEntregaPath;
    }

    if (isRetiradaTanque) {
      const paraEquipamento = retiradaDestino === "EQUIPAMENTO";
      const LACRE_TANQUE_BUCKET = "lacre_tanque";
      const LACRE_MELOSA_BUCKET = "lacre_melosa";
      const FOTO_QUANTIDADE_ABASTECIDA_BUCKET = "foto_quantidade_abastecida";
      const TANQUE_ASSINATURAS_BUCKET = "melosa_assinaturas";
      const userId = session?.user?.id;
      if (!userId) throw new Error("Usuário não encontrado para salvar as fotos.");

      const tanquePath = `${userId}/lacres/tanque/${operationId}.${extFromUri(lacreTanqueFotoUri as string)}`;
      const quantidadePath = `${userId}/tanque/quantidade/${operationId}.${extFromUri(tanqueQuantidadeAbastecidaFotoUri as string)}`;
      const assinaturaOperadorPath = `${userId}/tanque/assinaturas/operador/${operationId}.png`;
      const assinaturaDestinoPath = `${userId}/tanque/assinaturas/${paraEquipamento ? "equipamento" : "melosa"}/${operationId}.png`;

      await stageImageFromUri(operationId, LACRE_TANQUE_BUCKET, tanquePath, lacreTanqueFotoUri as string);
      let melosaPath: string | null = null;
      if (!paraEquipamento) {
        melosaPath = `${userId}/lacres/melosa/${operationId}.${extFromUri(lacreMelosaFotoUri as string)}`;
        await stageImageFromUri(operationId, LACRE_MELOSA_BUCKET, melosaPath, lacreMelosaFotoUri as string);
      }
      await stageImageFromUri(
        operationId,
        FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
        quantidadePath,
        tanqueQuantidadeAbastecidaFotoUri as string,
      );
      await stageImageFromDataUrl(
        operationId,
        TANQUE_ASSINATURAS_BUCKET,
        assinaturaOperadorPath,
        tanqueAssinaturaOperadorDataUrl as string,
      );
      await stageImageFromDataUrl(
        operationId,
        TANQUE_ASSINATURAS_BUCKET,
        assinaturaDestinoPath,
        tanqueAssinaturaMelosaDataUrl as string,
      );

      lacreTanqueStoragePath = tanquePath;
      lacreMelosaStoragePath = melosaPath;
      tanqueQuantidadeAbastecidaStoragePath = quantidadePath;
      tanqueAssinaturaOperadorStoragePath = assinaturaOperadorPath;
      tanqueAssinaturaMelosaStoragePath = assinaturaDestinoPath;
    }

    const retiradaParaEquipamento = isRetiradaTanque && retiradaDestino === "EQUIPAMENTO";
    const patrimonioRetirada = placaTexto.trim().toUpperCase();
    const obsRetirada = retiradaParaEquipamento
      ? `[TANQUE_EQUIPAMENTO] ${patrimonioRetirada}${obs.trim() ? ` ${obs.trim()}` : ""}`
      : obs.trim()
        ? obs.trim()
        : null;

    const payload: MovimentacaoPayload = {
      operation_id: operationId,
      tipo: tipoAtual,
      obra_codigo: isTanqueObra ? (tanqueSelecionado?.obra_codigo ?? obraCodigo) : obraCodigo,
      data_hora: dataHoraSalvaLocal,
      litros,
      tanque_texto: isRetiradaTanque
        ? retiradaMotoristaMelosaTexto.trim() || null
        : tanqueTexto.trim()
          ? tanqueTexto.trim()
          : null,
      placa_texto: isRetiradaTanque ? patrimonioRetirada : placaTexto.trim(),
      fornecedor_texto: retiradaParaEquipamento ? patrimonioRetirada : isRetiradaTanque ? null : fornecedorTexto.trim(),
      tanque_numero: isTanqueObra
        ? (() => {
            const oleo = codigoOleoPorTexto(obraCombustivelTipo);
            const daObra = tanquesCadastrados.filter((t) => tanquePertenceObraMobile(t, obraCodigo));
            const pool = daObra.length > 0 ? daObra : tanquesCadastrados;
            const tanqueOleo = oleo ? pool.find((t) => codigoOleoPorTexto(t.nome) === oleo) : null;
            const tanqueEscolhido = tanquesCadastrados.find((t) => t.ativo === tanqueAtivo);
            return tanqueOleo?.tanque_numero ?? tanqueEscolhido?.tanque_numero ?? tanqueNumero;
          })()
        : tipoAtual === "RETIRADA_MELOSA"
          ? melosaTanqueNumero
          : null,

      combustivel_tipo: isTanqueObra ? obraCombustivelTipo.trim() : null,
      nota_numero: isEntradaTanqueObra ? notaNumero.trim() : null,
      placa_caminhao: isEntradaTanqueObra ? placaTexto.trim() : null,
      valor_unitario: isEntradaTanqueObra ? parseDecimal(valorUnitarioText) : null,
      nota_storage_path: isEntradaTanqueObra ? notaStoragePath : null,
      lacre_tanque_numero: isRetiradaTanque ? numeroLacreTanque.trim() : null,
      lacre_tanque_storage_path: isRetiradaTanque ? lacreTanqueStoragePath : null,
      lacre_melosa_numero: isRetiradaTanque ? numeroLacreMelosa.trim() : null,
      lacre_melosa_storage_path: isRetiradaTanque ? lacreMelosaStoragePath : null,
      tanque_quantidade_abastecida: isRetiradaTanque ? tanqueQuantidadeAbastecidaTexto.trim() : null,
      tanque_quantidade_abastecida_storage_path: isRetiradaTanque ? tanqueQuantidadeAbastecidaStoragePath : null,
      tanque_operador_nome: isTanqueObra ? pickOperadorNome(driverFullName) || null : null,
      tanque_assinatura_operador_storage_path: isTanqueObra ? tanqueAssinaturaOperadorStoragePath : null,
      tanque_assinatura_melosa_storage_path: isTanqueObra ? tanqueAssinaturaMelosaStoragePath : null,
      retirada_horimetro_foto_storage_path: null,

      local_latitude: localLatitude,
      local_longitude: localLongitude,
      local_address: localAddress,
      obs: isRetiradaTanque ? obsRetirada : obs.trim() ? obs.trim() : null,
    };

    enqueueOutbox(operationId, payload);
    setPending(outboxCount());

    const ativoAck = isRetiradaTanque
      ? placaTexto.trim()
      : isEntradaTanqueObra
        ? `Tanque ${tanqueNumero ?? "—"}`
        : placaTexto.trim() || fornecedorTexto.trim();
    const litrosAck = isRetiradaTanque
      ? tanqueQuantidadeAbastecidaTexto.trim()
      : isEntradaTanqueObra
        ? litrosText.trim() || String(litros)
        : String(litros);

    const ack = await finalizeSaveWithAck({
      titulo: isEntradaTanqueObra
        ? "Entrada no tanque"
        : isRetiradaTanque
          ? retiradaParaEquipamento
            ? "Retirada do tanque para equipamento"
            : "Retirada do tanque"
          : "Registro",
      ativo: ativoAck,
      litros: litrosAck,
    });

    resetForm();
    setSaveAck(ack);
    setScreen({ name: "home" });
    } catch (e: any) {
      Alert.alert("Salvar falhou", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function submitMelosaWithdraw() {
    if (!session?.access_token) {
      Alert.alert("Sem sessão", "Faça login antes de registrar.");
      return;
    }

    if (!melosaPlacaTexto.trim()) {
      Alert.alert("Ativo Melosa obrigatório", "Informe o Ativo Melosa.");
      return;
    }
    if (!melosaFornecedorTexto.trim()) {
      Alert.alert("Patrimônio Equipamento obrigatório", "Informe o Patrimônio Equipamento.");
      return;
    }
    if (!melosaWdrCombustivelTipo.trim()) {
      Alert.alert("Insumo obrigatório", "Selecione o insumo.");
      return;
    }
    if (isMelosaObraUsina()) {
      if (!melosaEncerranteInicialTexto.trim()) {
        Alert.alert("Encerrante obrigatório", "Informe o Encerrante Inicial.");
        return;
      }
      if (!melosaEncerranteFinalTexto.trim()) {
        Alert.alert("Encerrante obrigatório", "Informe o Encerrante Final.");
        return;
      }
      const inicial = parseMelosaMedidorNumero(melosaEncerranteInicialTexto);
      const final = parseMelosaMedidorNumero(melosaEncerranteFinalTexto);
      if (inicial == null || final == null) {
        Alert.alert("Encerrante inválido", "Informe números válidos para Encerrante Inicial e Final.");
        return;
      }
      if (final < inicial) {
        Alert.alert("Encerrante inválido", "O Encerrante Final deve ser maior ou igual ao Inicial.");
        return;
      }
    }
    if (!melosaQuantidadeAbastecidaTexto.trim()) {
      Alert.alert("Quantidade obrigatória", "Informe a quantidade abastecida em litros.");
      return;
    }
    if (!melosaQuantidadeAbastecidaFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto da quantidade abastecida.");
      return;
    }
    if (!melosaMotoristaEquipamentoTexto.trim()) {
      Alert.alert("Motorista obrigatório", "Informe o motorista do equipamento abastecido.");
      return;
    }
    if (!melosaEquipamentoOperadorFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto do equipamento junto com o operador/motorista.");
      return;
    }
    if (!isMeaningfulSignatureDataUrl(melosaAssinaturaOperadorDataUrl)) {
      Alert.alert("Assinatura obrigatória", "Peça ao operador da melosa para assinar no resumo.");
      return;
    }
    if (!isMeaningfulSignatureDataUrl(melosaAssinaturaMotoristaDataUrl)) {
      Alert.alert("Assinatura obrigatória", "Peça ao motorista do equipamento para assinar no resumo.");
      return;
    }
    const litrosMelosa = parseMelosaMedidorNumero(melosaQuantidadeAbastecidaTexto);
    if (litrosMelosa == null || litrosMelosa <= 0) {
      Alert.alert("Quantidade inválida", "Informe uma quantidade abastecida válida em litros (maior que zero).");
      return;
    }
    let gpsLatitude = localLatitude;
    let gpsLongitude = localLongitude;
    let gpsAddress = localAddress;
    if (gpsLatitude == null || gpsLongitude == null) {
      const captured = await captureLocationAndAddress();
      if (captured) {
        gpsLatitude = captured.latitude;
        gpsLongitude = captured.longitude;
        gpsAddress = captured.address;
      }
    }
    if (gpsLatitude == null || gpsLongitude == null) {
      Alert.alert(
        "Localização obrigatória",
        "Não foi possível obter o GPS. Verifique se a localização está ativa e tente salvar novamente."
      );
      return;
    }

    setBusy(true);
    try {
    const operationId = uuidv4();
    // Data/hora do momento em que o operador salvou no celular (não a da sincronização).
    const dataHoraSalvaLocal = new Date().toISOString();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Usuário não encontrado para salvar as fotos.");

    const FOTO_QUANTIDADE_ABASTECIDA_BUCKET = "foto_quantidade_abastecida";
    const MELOSA_HORIMETRO_BUCKET = "melosa_horimetro_equipamento_abastecido";
    const MELOSA_EQUIPAMENTO_OPERADOR_BUCKET = "melosa_equipamento_operador";
    const MELOSA_ASSINATURAS_BUCKET = "melosa_assinaturas";

    const quantidadePath = `${userId}/melosa/quantidade-abastecida/${operationId}.${extFromUri(melosaQuantidadeAbastecidaFotoUri as string)}`;
    const operadorPath = `${userId}/melosa/equipamento-operador/${operationId}.${extFromUri(melosaEquipamentoOperadorFotoUri as string)}`;
    const assinaturaOperadorPath = `${userId}/melosa/assinaturas/operador/${operationId}.png`;
    const assinaturaMotoristaPath = `${userId}/melosa/assinaturas/motorista/${operationId}.png`;

    const incluirHorimetro = !melosaNaoTenhoHorimetro;
    const hasMelosaHorimetroFoto = incluirHorimetro && !!melosaHorimetroEquipamentoFotoUri;
    let horimetroPath: string | null = null;
    if (hasMelosaHorimetroFoto) {
      horimetroPath = `${userId}/melosa/horimetro/${operationId}.${extFromUri(melosaHorimetroEquipamentoFotoUri as string)}`;
    }

    await stageImageFromUri(
      operationId,
      FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
      quantidadePath,
      melosaQuantidadeAbastecidaFotoUri as string,
    );
    if (hasMelosaHorimetroFoto && horimetroPath) {
      await stageImageFromUri(
        operationId,
        MELOSA_HORIMETRO_BUCKET,
        horimetroPath,
        melosaHorimetroEquipamentoFotoUri as string,
      );
    }
    await stageImageFromUri(
      operationId,
      MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
      operadorPath,
      melosaEquipamentoOperadorFotoUri as string,
    );
    await stageImageFromDataUrl(
      operationId,
      MELOSA_ASSINATURAS_BUCKET,
      assinaturaOperadorPath,
      melosaAssinaturaOperadorDataUrl as string,
    );
    await stageImageFromDataUrl(
      operationId,
      MELOSA_ASSINATURAS_BUCKET,
      assinaturaMotoristaPath,
      melosaAssinaturaMotoristaDataUrl as string,
    );

    const origemMelosa = melosaPlacaTexto.trim().toUpperCase();
    const destinoOuEquipamento = melosaFornecedorTexto.trim().toUpperCase();
    const cadastroEquipamento = melosaIsTransbordo
      ? { empresa: "", nome: melosaEquipamentoNomeTexto.trim() }
      : equipamentoLocalParaSalvar(melosaFornecedorTexto);
    const obsTransferencia = melosaIsTransbordo
      ? `[TRANSFERENCIA_MELOSA] ${origemMelosa} → ${destinoOuEquipamento}`
      : null;

    const payload: MovimentacaoPayload = {
      operation_id: operationId,
      tipo: "RETIRADA_MELOSA",
      obra_codigo: melosaObraCodigo,
      data_hora: dataHoraSalvaLocal,
      litros: litrosMelosa,
      placa_texto: melosaPlacaTexto.trim(),
      fornecedor_texto: melosaFornecedorTexto.trim(),
      ativo_equipamento_empresa: melosaIsTransbordo ? null : cadastroEquipamento.empresa || null,
      ativo_equipamento_nome: melosaIsTransbordo
        ? melosaEquipamentoNomeTexto.trim() || melosaFornecedorTexto.trim() || null
        : cadastroEquipamento.nome || null,
      melosa_operador_nome: driverFullName.trim() || null,
      melosa_categoria: null,
      tanque_numero: melosaTanqueNumero,

      melosa_km_registro: null,
      melosa_litros_registro: null,
      melosa_combustivel_tipo_registro: null,
      melosa_comprovante_storage_path: null,
      melosa_quantidade_abastecida: melosaQuantidadeAbastecidaTexto.trim(),
      melosa_quantidade_abastecida_storage_path: quantidadePath,
      melosa_encerrante_inicial_numero: isMelosaObraUsina()
        ? melosaEncerranteInicialTexto.trim() || null
        : null,
      melosa_encerrante_final_numero: isMelosaObraUsina()
        ? melosaEncerranteFinalTexto.trim() || null
        : null,
      melosa_horimetro_equipamento_abastecido_numero: incluirHorimetro
        ? melosaHorimetroEquipamentoNumero.trim() || null
        : melosaHorimetroMotivo === "QUEBRADO"
          ? "Quebrado"
          : melosaHorimetroMotivo === "INEXISTENTE"
            ? "Inexistente"
            : null,
      melosa_horimetro_equipamento_abastecido_storage_path: incluirHorimetro ? horimetroPath ?? null : null,
      melosa_motorista_equipamento_abastecido: melosaMotoristaEquipamentoTexto.trim(),
      melosa_equipamento_operador_storage_path: operadorPath,
      melosa_assinatura_operador_storage_path: assinaturaOperadorPath,
      melosa_assinatura_motorista_storage_path: assinaturaMotoristaPath,
      melosa_lubrificado: melosaLubrificado ? true : null,
      melosa_lacre_numero: null,
      melosa_lacre_storage_path: null,

      melosa_km_retirada: null,
      melosa_combustivel_tipo_retirada: melosaWdrCombustivelTipo.trim(),
      melosa_tanque_storage_path: null,

      local_latitude: gpsLatitude,
      local_longitude: gpsLongitude,
      local_address: gpsAddress,
      obs: obsTransferencia,
    };

    enqueueOutbox(operationId, payload);
    setPending(outboxCount());

    const ack = await finalizeSaveWithAck({
      titulo: melosaIsTransbordo ? "Transbordo entre melosas" : "Retirada da melosa",
      ativo: melosaIsTransbordo
        ? `${origemMelosa} → ${destinoOuEquipamento}`
        : melosaFornecedorTexto.trim() || melosaPlacaTexto.trim(),
      litros: melosaQuantidadeAbastecidaTexto.trim() || litrosMelosa,
    });

    void clearMelosaFlowCheckpoint();
    resetMelosaFlow();
    setSaveAck(ack);
    setScreen({ name: "home" });
    } catch (e: any) {
      Alert.alert("Salvar falhou", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function continueMelosaRegister() {
    if (!melosaPlacaTexto.trim()) {
      Alert.alert("Ativo Melosa obrigatório", "Informe o Ativo Melosa.");
      return;
    }

    const ativo = melosaFornecedorTexto.trim();
    if (!ativo) {
      Alert.alert(
        melosaIsTransbordo ? "Melosa destino obrigatória" : "Patrimônio Equipamento obrigatório",
        melosaIsTransbordo
          ? "Selecione a melosa que vai receber o combustível."
          : "Informe o Patrimônio Equipamento.",
      );
      return;
    }

    if (melosaIsTransbordo) {
      if (ativo.toUpperCase() === melosaPlacaTexto.trim().toUpperCase()) {
        Alert.alert("Melosas iguais", "Origem e destino devem ser melosas diferentes.");
        return;
      }
    } else if (isOnline && session?.access_token) {
      void lookupMelosaEquipamentoPatrimonio(ativo);
    } else {
      applyEquipamentoFromLocalCatalog(ativo);
    }

    setMessage(null);
    setScreen({ name: "melosa", step: "quantidade_abastecida" });
  }

  function continueMelosaQuantidadeAbastecida() {
    if (!melosaWdrCombustivelTipo.trim()) {
      Alert.alert("Insumo obrigatório", "Selecione o insumo.");
      return;
    }
    if (isMelosaObraUsina()) {
      if (!melosaEncerranteInicialTexto.trim()) {
        Alert.alert("Encerrante obrigatório", "Informe o Encerrante Inicial.");
        return;
      }
      if (!melosaEncerranteFinalTexto.trim()) {
        Alert.alert("Encerrante obrigatório", "Informe o Encerrante Final.");
        return;
      }
      const inicial = parseMelosaMedidorNumero(melosaEncerranteInicialTexto);
      const final = parseMelosaMedidorNumero(melosaEncerranteFinalTexto);
      if (inicial == null || final == null) {
        Alert.alert("Encerrante inválido", "Informe números válidos para Encerrante Inicial e Final.");
        return;
      }
      if (final < inicial) {
        Alert.alert("Encerrante inválido", "O Encerrante Final deve ser maior ou igual ao Inicial.");
        return;
      }
    }
    if (!melosaQuantidadeAbastecidaTexto.trim()) {
      Alert.alert("Quantidade obrigatória", "Informe a quantidade abastecida em litros.");
      return;
    }
    const litros = parseMelosaMedidorNumero(melosaQuantidadeAbastecidaTexto);
    if (litros == null || litros <= 0) {
      Alert.alert("Quantidade inválida", "Informe uma quantidade abastecida válida (maior que zero).");
      return;
    }
    if (!melosaQuantidadeAbastecidaFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto da quantidade abastecida.");
      return;
    }
    setMessage(null);
    setMelosaNaoTenhoHorimetro(false);
    setMelosaHorimetroMotivo("");
    setScreen({ name: "melosa", step: "horimetro" });
  }

  function continueMelosaHorimetro() {
    if (melosaNaoTenhoHorimetro) {
      if (!melosaHorimetroMotivo) {
        Alert.alert("Motivo obrigatório", "Selecione Quebrado ou Inexistente.");
        return;
      }
    }
    if (!melosaMotoristaEquipamentoTexto.trim()) {
      Alert.alert("Motorista obrigatório", "Informe o motorista do equipamento abastecido.");
      return;
    }
    if (!melosaEquipamentoOperadorFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto do equipamento junto com o operador/motorista.");
      return;
    }
    setMessage(null);
    setScreen({ name: "melosa", step: "resumo" });
  }

  function continueMelosaResumo() {
    if (!isMeaningfulSignatureDataUrl(melosaAssinaturaOperadorDataUrl)) {
      Alert.alert("Assinatura obrigatória", "Peça ao operador da melosa para assinar.");
      return;
    }
    if (!isMeaningfulSignatureDataUrl(melosaAssinaturaMotoristaDataUrl)) {
      Alert.alert("Assinatura obrigatória", "Peça ao motorista do equipamento para assinar.");
      return;
    }
    setMessage(null);
    void submitMelosaWithdraw();
  }

  const toggleTheme = () => setThemeMode((m) => (m === "dark" ? "light" : "dark"));

  const themeToggleOverlay = (
    <DraggableThemeToggle
      isDarkMode={isDarkMode}
      onToggleTheme={toggleTheme}
      cardBounds={cardBounds}
      layout={layout}
      position={themeTogglePosition}
      onPositionChange={handleThemeTogglePositionChange}
    />
  );

  if (!authReady) {
    return (
      <View style={[styles.authRoot, !isDarkMode ? styles.authRootLight : null, { justifyContent: "center", alignItems: "center" }]}>
        <StatusBar style={barStyle} />
        <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>
          Restaurando sessão…
        </Text>
      </View>
    );
  }

  if (screen.name === "login") {
    return (
      <View style={[styles.authRoot, !isDarkMode ? styles.authRootLight : null]}>
        <StatusBar style={barStyle} />
        <View style={[styles.authBg, !isDarkMode ? styles.authBgLight : null]}>
          <View style={[styles.orb1, !isDarkMode ? styles.orb1Light : null]} />
          <View style={[styles.orb2, !isDarkMode ? styles.orb2Light : null]} />
        </View>

        <SafeAreaView style={styles.screenSafeArea}>
          <View style={styles.screenShell}>
            <FormScreenScroll
              ref={loginScrollRef}
              contentContainerStyle={styles.authScrollLogin}
              layoutKey="login"
              preferCenter
              keyboardDismissMode="on-drag"
            >
              <CardMeasuredWrap
                layout={layout}
                isDarkMode={isDarkMode}
                onBoundsChange={setCardBounds}
                innerStyle={layout.authCardInnerStyle}
              >
                <View style={{ flexDirection: "column" }}>
                  <View style={[styles.brandWrap, layout.isCompactScreen ? styles.brandWrapCompact : null]}>
                  <Image
                    source={require("./assets/logo_compacto.png")}
                    style={[styles.brandLogo, layout.brandLogoSize]}
                    resizeMode="contain"
                  />
                    </View>

                <Text
                  style={[
                    styles.authTitle,
                    { fontSize: layout.authTitleFontSize },
                    !isDarkMode ? styles.authTitleLight : null,
                  ]}
                >
                  Entrar
                </Text>

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Email</Text>
                    <TextInput
                      ref={(r) => {
                        loginEmailRef.current = r;
                      }}
                      value={email}
                      onChangeText={setEmail}
                      style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                      placeholder="seuemail@exemplo.com"
                      placeholderTextColor={inputPlaceholderColor}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      returnKeyType="next"
                      onFocus={() => scrollLoginForInput("email")}
                      onSubmitEditing={() => {
                        loginPasswordRef.current?.focus();
                      }}
                      blurOnSubmit={false}
                    />

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Senha</Text>
                <View style={[styles.authPasswordRow, !isDarkMode ? styles.authPasswordRowLight : null]}>
                      <TextInput
                        ref={(r) => {
                          loginPasswordRef.current = r;
                        }}
                        value={password}
                        onChangeText={setPassword}
                        style={[styles.authPasswordInput, !isDarkMode ? styles.authPasswordInputLight : null]}
                        placeholder="Sua senha"
                        placeholderTextColor={inputPlaceholderColor}
                        secureTextEntry={!loginPasswordVisible}
                        autoCapitalize="none"
                        autoCorrect={false}
                        underlineColorAndroid="transparent"
                        returnKeyType="done"
                        onFocus={() => scrollLoginForInput("password")}
                        onSubmitEditing={onLogin}
                      />
                  <TouchableOpacity
                    style={styles.authPasswordToggle}
                    onPress={() => setLoginPasswordVisible((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={loginPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <Text style={[styles.authPasswordToggleText, !isDarkMode ? styles.authPasswordToggleTextLight : null]}>
                      {loginPasswordVisible ? "Ocultar" : "Mostrar"}
                    </Text>
                  </TouchableOpacity>
                    </View>

                    {message ? (
                      <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>
                        {message}
                      </Text>
                    ) : null}

                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        !isDarkMode ? styles.primaryButtonLight : null,
                        busy ? { opacity: 0.7 } : null,
                      ]}
                      disabled={busy}
                      onPress={onLogin}
                    >
                      <Text style={styles.primaryButtonText}>{busy ? "Entrando..." : "Entrar"}</Text>
                    </TouchableOpacity>
                </View>
              </CardMeasuredWrap>
            </FormScreenScroll>
            {themeToggleOverlay}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (screen.name === "registro") {
    return (
      <View style={[styles.authRoot, !isDarkMode ? styles.authRootLight : null]}>
        <StatusBar style={barStyle} />
        <View style={[styles.authBg, !isDarkMode ? styles.authBgLight : null]}>
          <View style={[styles.orb1, !isDarkMode ? styles.orb1Light : null]} />
          <View style={[styles.orb2, !isDarkMode ? styles.orb2Light : null]} />
        </View>

        <SafeAreaView style={styles.screenSafeArea}>
          <View style={styles.screenShell}>
            <KeyboardAvoidingView
              style={styles.authKeyboardFlex}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
            >
              <CenteredScrollView contentContainerStyle={styles.authScrollRegister}>
                <CardMeasuredWrap layout={layout} isDarkMode={isDarkMode} onBoundsChange={setCardBounds}>
                <View style={styles.brandWrap}>
                  <Image
                    source={require("./assets/logo_compacto.png")}
                    style={[styles.brandLogo, layout.brandLogoSize]}
                    resizeMode="contain"
                  />
                </View>

                <Text style={[styles.authTitle, !isDarkMode ? styles.authTitleLight : null]}>Registro</Text>

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Nome completo</Text>
                <TextInput
                  value={regFullName}
                  onChangeText={setRegFullName}
                  style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                  placeholder="Seu nome"
                  placeholderTextColor={inputPlaceholderColor}
                />

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>CPF</Text>
                <TextInput
                  value={regCpf}
                  onChangeText={setRegCpf}
                  style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                  placeholder="000.000.000-00"
                  placeholderTextColor={inputPlaceholderColor}
                  keyboardType="number-pad"
                />

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Endereço</Text>
                <TextInput
                  value={regAddress}
                  onChangeText={setRegAddress}
                  style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                  placeholder="Rua, número, bairro, cidade"
                  placeholderTextColor={inputPlaceholderColor}
                />

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Telefone</Text>
                <TextInput
                  value={regPhone}
                  onChangeText={setRegPhone}
                  style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                  placeholder="(DDD) 9XXXX-XXXX"
                  placeholderTextColor={inputPlaceholderColor}
                  keyboardType="phone-pad"
                />

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Email</Text>
                <TextInput
                  value={regEmail}
                  onChangeText={setRegEmail}
                  style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                  placeholder="seuemail@exemplo.com"
                  placeholderTextColor={inputPlaceholderColor}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Confirmação email</Text>
                <TextInput
                  value={regConfirmEmail}
                  onChangeText={setRegConfirmEmail}
                  style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                  placeholder="repita seu email"
                  placeholderTextColor={inputPlaceholderColor}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Senha</Text>
                <View style={[styles.authPasswordRow, !isDarkMode ? styles.authPasswordRowLight : null]}>
                  <TextInput
                    value={regPassword}
                    onChangeText={setRegPassword}
                    style={[styles.authPasswordInput, !isDarkMode ? styles.authPasswordInputLight : null]}
                    placeholder="Crie uma senha"
                    placeholderTextColor={inputPlaceholderColor}
                    secureTextEntry={!regPasswordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    underlineColorAndroid="transparent"
                  />
                  <TouchableOpacity
                    style={styles.authPasswordToggle}
                    onPress={() => setRegPasswordVisible((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={regPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <Text style={[styles.authPasswordToggleText, !isDarkMode ? styles.authPasswordToggleTextLight : null]}>
                      {regPasswordVisible ? "Ocultar" : "Mostrar"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>Foto da CNH</Text>
                <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                  {cnhPhotoUri ? (
                    <>
                      <Image source={{ uri: cnhPhotoUri }} style={styles.photoPreview} />
                      <TouchableOpacity style={styles.photoRemove} onPress={() => setCnhPhotoUri(null)} disabled={busy}>
                        <Text style={styles.photoRemoveText}>Remover</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>Selecione uma foto da CNH</Text>
                  )}
                </View>

                <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                  <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickCnhPhotoFromLibrary} disabled={busy}>
                    <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickCnhPhotoFromCamera} disabled={busy}>
                    <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                  </TouchableOpacity>
                </View>

                {message ? <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>{message}</Text> : null}

                <TouchableOpacity
                  style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, busy ? { opacity: 0.7 } : null]}
                  disabled={busy}
                  onPress={onRegister}
                >
                  <Text style={styles.primaryButtonText}>{busy ? "Criando..." : "Criar conta"}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryLink} onPress={() => setScreen({ name: "login" })} disabled={busy}>
                  <Text style={[styles.secondaryLinkText, !isDarkMode ? styles.secondaryLinkTextLight : null]}>Voltar ao login</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryLink} onPress={testApiConnection} disabled={busy}>
                  <Text style={[styles.secondaryLinkText, !isDarkMode ? styles.secondaryLinkTextLight : null]}>
                    Testar conexão API
                  </Text>
                </TouchableOpacity>
                </CardMeasuredWrap>
              </CenteredScrollView>
            </KeyboardAvoidingView>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (screen.name === "home") {
    return (
      <SafeAreaView style={[styles.homeRoot, !isDarkMode ? styles.homeRootLight : null]}>
        <StatusBar style={barStyle} />
        <View style={styles.screenShell}>
          <CenteredScrollView>
            <CardMeasuredWrap
              layout={layout}
              isDarkMode={isDarkMode}
              onBoundsChange={setCardBounds}
              innerStyle={styles.homeGlassInner}
            >
              <View style={styles.homeHeroWrap}>
                <View style={[styles.homeHeroPlate, !isDarkMode ? styles.homeHeroPlateLight : null]}>
                  <Image
                    source={require("./assets/home_carbono.png")}
                    style={[styles.homeHeroImage, { height: layout.heroImageHeight }]}
                    resizeMode="contain"
                  />
                </View>
              </View>
              <Text
                style={[
                  styles.homeSub,
                  !isDarkMode ? styles.homeSubLight : null,
                  { fontSize: layout.statusFontSize },
                ]}
                adjustsFontSizeToFit
                numberOfLines={1}
                minimumFontScale={0.75}
              >
                Status: {isOnline ? "Online" : "Offline"} | Pendentes: {pending} | v{APP_VERSION}
              </Text>

              <View style={{ height: 14 }} />

              <TouchableOpacity
                style={[styles.homeActionCard, !isDarkMode ? styles.homeActionCardLight : null]}
                onPress={() => {
                  resetMelosaFlow();
                  setMelosaObraCodigo(obraCodigo);
                  setScreen({ name: "melosa", step: "register" });
                }}
              >
                <AdaptiveCardText
                  style={[styles.homeActionTitle, { fontSize: layout.actionTitleFontSize }]}
                  lightStyle={styles.homeActionTitleLight}
                  isDarkMode={isDarkMode}
                >
                  Registrar retirada da melosa
                </AdaptiveCardText>
              </TouchableOpacity>

              {!isMelosaUser ? (
                <TouchableOpacity
                  style={[styles.homeActionCard, !isDarkMode ? styles.homeActionCardLight : null]}
                  onPress={() => {
                    resetForm();
                    setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "dados" });
                  }}
                >
                  <AdaptiveCardText
                    style={[styles.homeActionTitle, { fontSize: layout.actionTitleFontSize }]}
                    lightStyle={styles.homeActionTitleLight}
                    isDarkMode={isDarkMode}
                  >
                    Registrar retirada do tanque
                  </AdaptiveCardText>
                </TouchableOpacity>
              ) : null}

              {!isMelosaUser ? (
                <TouchableOpacity
                  style={[styles.homeActionCard, !isDarkMode ? styles.homeActionCardLight : null]}
                  onPress={() => {
                    resetForm();
                    setScreen({ name: "form", tipo: "ENTRADA_TANQUE_OBRA", entradaStep: "dados" });
                  }}
                >
                  <AdaptiveCardText
                    style={[styles.homeActionTitle, { fontSize: layout.actionTitleFontSize }]}
                    lightStyle={styles.homeActionTitleLight}
                    isDarkMode={isDarkMode}
                  >
                    Registrar entrada no tanque da obra
                  </AdaptiveCardText>
                </TouchableOpacity>
              ) : null}

              <View style={{ height: 18 }} />

              <TouchableOpacity
                style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null]}
                disabled={!session?.access_token || busy}
                onPress={() => {
                  if (!session?.access_token) return;
                  setBusy(true);
                  syncOutboxWithTokenRetry()
                    .then((r) => {
                      if (r.synced > 0) {
                        setMessage(`Sincronizado: ${r.synced} registro(s).`);
                      } else if (pending === 0) {
                        setMessage("Nenhum registro pendente.");
                      }
                    })
                    .catch((e: unknown) => {
                      setMessage(`Falha ao sincronizar: ${String(e instanceof Error ? e.message : e)}`);
                    })
                    .finally(() => {
                      setPending(outboxCount());
                      setBusy(false);
                    });
                }}
              >
                <Text style={styles.primaryButtonText}>Atualizar sincronização</Text>
              </TouchableOpacity>

              {pending > 0 ? (
                <>
                  <View style={{ height: 10 }} />
                  <TouchableOpacity
                    style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null]}
                    disabled={busy}
                    onPress={() => {
                      Alert.alert(
                        "Limpar fila pendente",
                        "Remove registros que ficaram na fila sem fotos no Storage (após erro antigo). Depois faça um registro novo.",
                        [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Limpar",
                            style: "destructive",
                            onPress: () => {
                              clearOutbox();
                              setPending(0);
                              setMessage("Fila pendente limpa. Faça um novo registro da melosa.");
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>
                      Limpar fila pendente ({pending})
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <View style={{ height: 10 }} />

              <TouchableOpacity
                style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null, busy ? { opacity: 0.7 } : null]}
                disabled={busy}
                onPress={onLogout}
              >
                <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>Sair</Text>
              </TouchableOpacity>

              {message ? <Text style={[styles.homeMessage, !isDarkMode ? styles.homeMessageLight : null]}>{message}</Text> : null}
            </CardMeasuredWrap>
          </CenteredScrollView>
        </View>

        <Modal
          visible={Boolean(saveAck)}
          transparent
          animationType="fade"
          onRequestClose={() => setSaveAck(null)}
        >
          <View style={styles.saveAckOverlay}>
            <View style={[styles.saveAckCard, !isDarkMode ? styles.saveAckCardLight : null]}>
              <Text style={[styles.saveAckTitle, !isDarkMode ? styles.saveAckTitleLight : null]}>
                {saveAck?.titulo ?? "Registro"}
              </Text>
              <Text style={[styles.saveAckLine, !isDarkMode ? styles.saveAckLineLight : null]}>
                Ativo: {saveAck?.ativo ?? "—"}
              </Text>
              <Text style={[styles.saveAckLine, !isDarkMode ? styles.saveAckLineLight : null]}>
                Litros: {saveAck?.litros ?? "—"}
              </Text>
              <Text
                style={[
                  styles.saveAckStatus,
                  saveAck?.status === "synced"
                    ? styles.saveAckStatusOk
                    : saveAck?.status === "error"
                      ? styles.saveAckStatusError
                      : styles.saveAckStatusPending,
                ]}
              >
                {saveAck?.status === "synced"
                  ? "Enviado com sucesso para o servidor."
                  : saveAck?.status === "error"
                    ? "Salvo no celular, mas não enviou para o servidor."
                    : "Salvo no celular. Será enviado quando houver internet."}
              </Text>
              {saveAck?.status === "error" && saveAck.erro ? (
                <Text style={[styles.saveAckErrorDetail, !isDarkMode ? styles.saveAckErrorDetailLight : null]}>
                  Erro: {saveAck.erro}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, { marginTop: 18 }]}
                onPress={() => setSaveAck(null)}
              >
                <Text style={styles.primaryButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (screen.name === "melosa") {
    const melosaStep = screen.step;
    const isRegister = melosaStep === "register";
    const isQuantidadeAbastecida = melosaStep === "quantidade_abastecida";
    const isHorimetro = melosaStep === "horimetro";
    const isResumo = melosaStep === "resumo";
    const obraResumo = obrasDisponiveis.find((o) => o.codigo === melosaObraCodigo);
    const obraResumoLabel = obraResumo ? `${obraResumo.codigo} - ${obraResumo.nome}` : String(melosaObraCodigo);
    const equipamentoDescricaoResumo = melosaEquipamentoNomeTexto.trim() || "—";
    const horimetroResumoLabel = melosaNaoTenhoHorimetro
      ? melosaHorimetroMotivo === "QUEBRADO"
        ? "Quebrado"
        : melosaHorimetroMotivo === "INEXISTENTE"
          ? "Inexistente"
          : "—"
      : melosaHorimetroEquipamentoNumero.trim() || "—";
    const quantidadeResumoValor = melosaQuantidadeAbastecidaTexto.trim() || "—";
    const insumoResumoLabel = labelInsumo(melosaWdrCombustivelTipo);
    const patrimonioPreenchido = melosaFornecedorTexto.trim().length > 0;
    const equipamentoDadosVisiveis =
      isRegister &&
      patrimonioPreenchido &&
      !melosaEquipamentoQrLoading &&
      !melosaEquipamentoAtivoLookupLoading;
    const melosaSubtitle = isRegister
      ? melosaIsTransbordo
        ? "Dados iniciais do transbordo"
        : "Dados iniciais da retirada"
      : isQuantidadeAbastecida
        ? "Quantidade abastecida"
        : isHorimetro
          ? "Horímetro, hodômetro e motorista"
          : isResumo
            ? "Resumo e assinaturas"
            : "Retirada melosa";

    const melosaPrimaryAction = isRegister
      ? () => void continueMelosaRegister()
      : isQuantidadeAbastecida
        ? continueMelosaQuantidadeAbastecida
        : isHorimetro
          ? continueMelosaHorimetro
          : isResumo
            ? continueMelosaResumo
            : continueMelosaRegister;
    const melosaPrimaryLabel = isResumo ? (busy ? "Salvando..." : "Salvar") : "Próximo";

    function melosaVoltar() {
      setMessage(null);
      if (isQuantidadeAbastecida) setScreen({ name: "melosa", step: "register" });
      else if (isHorimetro) setScreen({ name: "melosa", step: "quantidade_abastecida" });
      else if (isResumo) setScreen({ name: "melosa", step: "horimetro" });
    }

    const melosaActionFooter = (
      <FormActionFooter isDarkMode={isDarkMode}>
        <View style={styles.formActionRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null, { flex: 1 }]}
            onPress={() => {
              setBusy(false);
              setMessage(null);
              resetMelosaFlow();
              setScreen({ name: "home" });
            }}
          >
            <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>Cancelar</Text>
          </TouchableOpacity>

          {!isRegister ? (
            <TouchableOpacity
              style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null, { flex: 1 }]}
              onPress={melosaVoltar}
              disabled={busy}
            >
              <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>Voltar</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
            disabled={busy}
            onPress={melosaPrimaryAction}
          >
            <Text style={styles.primaryButtonText}>{melosaPrimaryLabel}</Text>
          </TouchableOpacity>
        </View>
      </FormActionFooter>
    );

    return (
      <View style={[styles.formRoot, !isDarkMode ? styles.formRootLight : null]}>
        <StatusBar style={barStyle} />
        <SafeAreaView style={styles.screenSafeArea}>
          <View style={styles.screenShell}>
            <FormScreenScroll
              layoutKey={melosaStep}
              scrollEnabled={!signatureScrollLocked}
              nestedScrollEnabled={isResumo}
              preferCenter={!isResumo}
              keyboardDismissMode={isResumo ? "none" : "on-drag"}
              contentContainerStyle={isResumo ? styles.resumoScrollContent : undefined}
            >
              <CardMeasuredWrap
                layout={layout}
                isDarkMode={isDarkMode}
                onBoundsChange={setCardBounds}
                innerStyle={isQuantidadeAbastecida || isHorimetro || isResumo ? styles.glassInnerCompact : undefined}
              >
              <Text style={[styles.formTitle, !isDarkMode ? styles.formTitleLight : null]}>
                {melosaIsTransbordo ? "Transbordo entre melosas" : "Retirada tanque melosa"}
              </Text>

              {isRegister ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Obra</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={melosaObraCodigo}
                      onValueChange={(v) => {
                        const codigo = Number(v);
                        setMelosaObraCodigo(codigo);
                        if (codigo !== OBRA_USINA_CODIGO) {
                          setMelosaEncerranteInicialTexto("");
                          setMelosaEncerranteFinalTexto("");
                        }
                      }}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      {obrasDisponiveis.map((o) => (
                        <Picker.Item key={o.codigo} label={`${o.codigo} - ${o.nome}`} value={o.codigo} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Ativo Melosa</Text>
                  {melosasCadastradas.length > 0 ? (
                    <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                      <Picker
                        selectedValue={melosaPlacaTexto}
                        onValueChange={(v) => {
                          const origem = String(v);
                          setMelosaPlacaTexto(origem);
                          if (
                            melosaIsTransbordo &&
                            melosaFornecedorTexto.trim() &&
                            melosaFornecedorTexto.trim().toUpperCase() === origem.trim().toUpperCase()
                          ) {
                            setMelosaFornecedorTexto("");
                            setMelosaEquipamentoNomeTexto("");
                          }
                        }}
                        style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                      >
                        <Picker.Item label="Selecione o ativo da melosa" value="" />
                        {melosasCadastradas.map((m) => (
                          <Picker.Item
                            key={m.ativo}
                            label={m.nome && m.nome !== m.ativo ? `${m.ativo} - ${m.nome}` : m.ativo}
                            value={m.ativo}
                          />
                        ))}
                      </Picker>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        value={melosaPlacaTexto}
                        onChangeText={setMelosaPlacaTexto}
                        style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                        placeholder="Ex.: ABC1D23"
                        placeholderTextColor={inputPlaceholderColor}
                        autoCapitalize="characters"
                      />
                      <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                        Nenhuma melosa cadastrada na web. Peça ao administrador para cadastrar em Equipamentos.
                      </Text>
                    </>
                  )}

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                    Tipo de retirada
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 4 }}>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        !melosaIsTransbordo
                          ? { backgroundColor: "#c00", borderColor: "#c00" }
                          : !isDarkMode
                            ? { backgroundColor: "#fff", borderColor: "#ccc" }
                            : { backgroundColor: "#222", borderColor: "#444" },
                        { flex: 1, alignItems: "center", justifyContent: "center" },
                      ]}
                      onPress={() => {
                        if (!melosaIsTransbordo) return;
                        setMelosaIsTransbordo(false);
                        setMelosaFornecedorTexto("");
                        setMelosaEquipamentoNomeTexto("");
                        setMelosaEquipamentoEmpresa("");
                        setMelosaEquipamentoPlacaTexto("");
                      }}
                      disabled={busy}
                    >
                      <Text style={{ color: !melosaIsTransbordo ? "#fff" : !isDarkMode ? "#333" : "#ddd", fontWeight: "700" }}>
                        Equipamento
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        melosaIsTransbordo
                          ? { backgroundColor: "#c00", borderColor: "#c00" }
                          : !isDarkMode
                            ? { backgroundColor: "#fff", borderColor: "#ccc" }
                            : { backgroundColor: "#222", borderColor: "#444" },
                        { flex: 1, alignItems: "center", justifyContent: "center" },
                      ]}
                      onPress={() => {
                        if (melosaIsTransbordo) return;
                        setMelosaIsTransbordo(true);
                        setMelosaFornecedorTexto("");
                        setMelosaEquipamentoNomeTexto("");
                        setMelosaEquipamentoEmpresa("");
                        setMelosaEquipamentoPlacaTexto("");
                        setMelosaEquipamentoQrOpen(false);
                      }}
                      disabled={busy}
                    >
                      <Text style={{ color: melosaIsTransbordo ? "#fff" : !isDarkMode ? "#333" : "#ddd", fontWeight: "700" }}>
                        Transbordo
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 4 }]}>
                    {melosaIsTransbordo
                      ? "Passar combustível de uma melosa para outra (ex.: 1563 → 1399)."
                      : "Abastecer um equipamento (QR ou patrimônio)."}
                  </Text>

                  {melosaIsTransbordo ? (
                    <>
                      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                        Melosa destino
                      </Text>
                      {melosasCadastradas.length > 0 ? (
                        <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                          <Picker
                            selectedValue={melosaFornecedorTexto}
                            onValueChange={(v) => {
                              const destino = String(v);
                              setMelosaFornecedorTexto(destino);
                              const melosa = melosasCadastradas.find(
                                (m) => m.ativo.toUpperCase() === destino.trim().toUpperCase(),
                              );
                              setMelosaEquipamentoNomeTexto(
                                melosa?.nome && melosa.nome !== melosa.ativo ? melosa.nome : destino,
                              );
                              setMelosaEquipamentoEmpresa("");
                              setMelosaEquipamentoPlacaTexto("");
                            }}
                            style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                          >
                            <Picker.Item label="Selecione a melosa de destino" value="" />
                            {melosasCadastradas
                              .filter(
                                (m) =>
                                  !melosaPlacaTexto.trim() ||
                                  m.ativo.toUpperCase() !== melosaPlacaTexto.trim().toUpperCase(),
                              )
                              .map((m) => (
                                <Picker.Item
                                  key={m.ativo}
                                  label={m.nome && m.nome !== m.ativo ? `${m.ativo} - ${m.nome}` : m.ativo}
                                  value={m.ativo}
                                />
                              ))}
                          </Picker>
                        </View>
                      ) : (
                        <TextInput
                          value={melosaFornecedorTexto}
                          onChangeText={(t) => {
                            setMelosaFornecedorTexto(t);
                            setMelosaEquipamentoNomeTexto(t.trim().toUpperCase());
                          }}
                          style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                          placeholder="Ex.: CCL1399"
                          placeholderTextColor={inputPlaceholderColor}
                          autoCapitalize="characters"
                        />
                      )}
                      <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                        A melosa de cima cede combustível para esta melosa.
                      </Text>
                    </>
                  ) : (
                    <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                    Patrimônio Equipamento
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      !isDarkMode ? styles.secondaryButtonLight : null,
                      { marginBottom: 8 },
                      melosaEquipamentoQrLoading ? { opacity: 0.6 } : null,
                    ]}
                    onPress={() => setMelosaEquipamentoQrOpen(true)}
                    disabled={busy || melosaEquipamentoQrLoading}
                  >
                    <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>
                      {melosaEquipamentoQrLoading ? "A identificar equipamento…" : "Ler QR code do equipamento"}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    value={melosaFornecedorTexto}
                    onChangeText={setMelosaFornecedorTexto}
                    onEndEditing={() => void lookupMelosaEquipamentoPatrimonio(melosaFornecedorTexto)}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: REVTR02"
                    placeholderTextColor={inputPlaceholderColor}
                    autoCapitalize="characters"
                  />
                  <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                    Informe o patrimônio do equipamento ou use o QR code.
                  </Text>
                  {melosaEquipamentoQrLoading || melosaEquipamentoAtivoLookupLoading ? (
                    <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                      Buscando dados do equipamento…
                    </Text>
                  ) : null}
                  {equipamentoDadosVisiveis && melosaEquipamentoNomeTexto.trim() ? (
                    <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                      Descrição: {melosaEquipamentoNomeTexto.trim()}
                    </Text>
                  ) : null}
                  {equipamentoDadosVisiveis && melosaEquipamentoEmpresa.trim() ? (
                    <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 4 }]}>
                      Empresa: {labelEquipamentoEmpresa(melosaEquipamentoEmpresa)}
                    </Text>
                  ) : null}
                  {equipamentoDadosVisiveis &&
                  isOnline &&
                  !melosaEquipamentoNomeTexto.trim() &&
                  !melosaEquipamentoEmpresa.trim() &&
                  melosaFornecedorTexto.trim() ? (
                    <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                      Equipamento não encontrado no cadastro. Confira o patrimônio ou use o QR code.
                    </Text>
                  ) : null}
                  {equipamentoDadosVisiveis && !isOnline ? (
                    <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                      {melosaEquipamentoEmpresa.trim()
                        ? "Sem internet — empresa carregada da cópia do celular. O lançamento sobe quando houver conexão."
                        : "Sem internet — o lançamento fica no celular. A empresa do cadastro entra na hora de enviar, se o equipamento estiver cadastrado."}
                    </Text>
                  ) : null}
                    </>
                  )}
                </>
              ) : null}

              {isQuantidadeAbastecida ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Insumo</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={melosaWdrCombustivelTipo}
                      onValueChange={(v) => setMelosaWdrCombustivelTipo(String(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      {INSUMOS_MELOSA.map((item) => (
                        <Picker.Item key={item.value} label={item.label} value={item.value} />
                      ))}
                    </Picker>
                  </View>

                  {isMelosaObraUsina() ? (
                    <>
                      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                        Encerrante Inicial
                      </Text>
                      <TextInput
                        value={melosaEncerranteInicialTexto}
                        onChangeText={onMelosaEncerranteInicialChange}
                        style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                        placeholder="Ex.: 1000"
                        placeholderTextColor={inputPlaceholderColor}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                        Encerrante Final
                      </Text>
                      <TextInput
                        value={melosaEncerranteFinalTexto}
                        onChangeText={onMelosaEncerranteFinalChange}
                        style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                        placeholder="Ex.: 1100"
                        placeholderTextColor={inputPlaceholderColor}
                        keyboardType="decimal-pad"
                      />
                    </>
                  ) : null}

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                    Quantidade Abastecida
                  </Text>
                  <TextInput
                    value={melosaQuantidadeAbastecidaTexto}
                    onChangeText={setMelosaQuantidadeAbastecidaTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 100"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>
                    Foto Quantidade Abastecida
                  </Text>
                  <View style={[styles.photoBox, styles.photoBoxCompact, !isDarkMode ? styles.photoBoxLight : null]}>
                    {melosaQuantidadeAbastecidaFotoUri ? (
                      <>
                        <Image
                          source={{ uri: melosaQuantidadeAbastecidaFotoUri }}
                          style={[styles.photoPreview, styles.photoPreviewCompact]}
                        />
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => setMelosaQuantidadeAbastecidaFotoUri(null)}
                          disabled={busy}
                        >
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text
                        style={[styles.photoPlaceholder, styles.photoPlaceholderCompact, !isDarkMode ? styles.photoPlaceholderLight : null]}
                      >
                        Selecione a foto da quantidade abastecida
                      </Text>
                    )}
                  </View>
                  <View style={styles.photoActionRow}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaQuantidadeAbastecidaFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaQuantidadeAbastecidaFromCamera}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isHorimetro ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>
                    Horímetro / hodômetro (opcional)
                  </Text>
                  <View style={{ alignItems: "center", marginTop: 6, marginBottom: 6 }}>
                    <TouchableOpacity
                      accessibilityRole="switch"
                      accessibilityLabel="Registrar horímetro ou hodômetro"
                      accessibilityState={{ checked: !melosaNaoTenhoHorimetro }}
                      disabled={busy}
                      activeOpacity={0.85}
                      onPress={() => {
                        const semHorimetro = !melosaNaoTenhoHorimetro;
                        setMelosaNaoTenhoHorimetro(semHorimetro);
                        if (semHorimetro) {
                          setMelosaHorimetroEquipamentoNumero("");
                          setMelosaHorimetroEquipamentoFotoUri(null);
                        } else {
                          setMelosaHorimetroMotivo("");
                        }
                      }}
                      style={[
                        styles.toggleSwitchTrack,
                        !melosaNaoTenhoHorimetro ? styles.toggleSwitchTrackOn : styles.toggleSwitchTrackOff,
                        !isDarkMode && melosaNaoTenhoHorimetro ? styles.toggleSwitchTrackLightOff : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleSwitchKnob,
                          { transform: [{ translateX: melosaNaoTenhoHorimetro ? 0 : 22 }] },
                        ]}
                      />
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>
                    Número do Horímetro/Hodômetro
                  </Text>

                  {!melosaNaoTenhoHorimetro ? (
                    <>
                      <TextInput
                        value={melosaHorimetroEquipamentoNumero}
                        onChangeText={setMelosaHorimetroEquipamentoNumero}
                        style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                        placeholder="Ex.: 12540"
                        placeholderTextColor={inputPlaceholderColor}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>
                        Foto do Hodômetro do Equipamento Abastecido
                      </Text>
                      <View style={[styles.photoBox, styles.photoBoxCompact, !isDarkMode ? styles.photoBoxLight : null]}>
                        {melosaHorimetroEquipamentoFotoUri ? (
                          <>
                            <Image
                              source={{ uri: melosaHorimetroEquipamentoFotoUri }}
                              style={[styles.photoPreview, styles.photoPreviewCompact]}
                            />
                            <TouchableOpacity
                              style={styles.photoRemove}
                              onPress={() => setMelosaHorimetroEquipamentoFotoUri(null)}
                              disabled={busy}
                            >
                              <Text style={styles.photoRemoveText}>Remover</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <Text
                            style={[
                              styles.photoPlaceholder,
                              styles.photoPlaceholderCompact,
                              !isDarkMode ? styles.photoPlaceholderLight : null,
                            ]}
                          >
                            Selecione a foto do hodômetro do equipamento abastecido
                          </Text>
                        )}
                      </View>
                      <View style={styles.photoActionRow}>
                        <TouchableOpacity
                          style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                          onPress={pickMelosaHorimetroEquipamentoFromLibrary}
                          disabled={busy}
                        >
                          <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                          onPress={pickMelosaHorimetroEquipamentoFromCamera}
                          disabled={busy}
                        >
                          <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>
                        Motivo (obrigatório)
                      </Text>
                      <View style={styles.horimetroMotivoRow}>
                        <TouchableOpacity
                          style={[
                            styles.horimetroMotivoChip,
                            !isDarkMode ? styles.horimetroMotivoChipLight : styles.horimetroMotivoChipDark,
                            melosaHorimetroMotivo === "QUEBRADO" ? styles.horimetroMotivoChipSelected : null,
                          ]}
                          onPress={() => setMelosaHorimetroMotivo("QUEBRADO")}
                          disabled={busy}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: melosaHorimetroMotivo === "QUEBRADO" }}
                        >
                          <Text
                            style={[
                              styles.horimetroMotivoChipText,
                              !isDarkMode ? styles.horimetroMotivoChipTextLight : null,
                              melosaHorimetroMotivo === "QUEBRADO" ? styles.horimetroMotivoChipTextSelected : null,
                            ]}
                          >
                            Quebrado
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.horimetroMotivoChip,
                            !isDarkMode ? styles.horimetroMotivoChipLight : styles.horimetroMotivoChipDark,
                            melosaHorimetroMotivo === "INEXISTENTE" ? styles.horimetroMotivoChipSelected : null,
                          ]}
                          onPress={() => setMelosaHorimetroMotivo("INEXISTENTE")}
                          disabled={busy}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: melosaHorimetroMotivo === "INEXISTENTE" }}
                        >
                          <Text
                            style={[
                              styles.horimetroMotivoChipText,
                              !isDarkMode ? styles.horimetroMotivoChipTextLight : null,
                              melosaHorimetroMotivo === "INEXISTENTE" ? styles.horimetroMotivoChipTextSelected : null,
                            ]}
                          >
                            Inexistente
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>
                    Motorista do equipamento abastecido
                  </Text>
                  <TextInput
                    value={melosaMotoristaEquipamentoTexto}
                    onChangeText={setMelosaMotoristaEquipamentoTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Nome do motorista"
                    placeholderTextColor={inputPlaceholderColor}
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>
                    Foto do equipamento junto com o Operador/Motorista
                  </Text>
                  <View style={[styles.photoBox, styles.photoBoxCompact, !isDarkMode ? styles.photoBoxLight : null]}>
                    {melosaEquipamentoOperadorFotoUri ? (
                      <>
                        <Image
                          source={{ uri: melosaEquipamentoOperadorFotoUri }}
                          style={[styles.photoPreview, styles.photoPreviewCompact]}
                        />
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => setMelosaEquipamentoOperadorFotoUri(null)}
                          disabled={busy}
                        >
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text
                        style={[styles.photoPlaceholder, styles.photoPlaceholderCompact, !isDarkMode ? styles.photoPlaceholderLight : null]}
                      >
                        Selecione a foto do equipamento com o operador/motorista
                      </Text>
                    )}
                  </View>
                  <View style={styles.photoActionRow}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaEquipamentoOperadorFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaEquipamentoOperadorFromCamera}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isResumo ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>
                    Confira os dados antes de salvar
                  </Text>

                  <View
                    style={[
                      styles.melosaResumoQuantidadeHero,
                      !isDarkMode ? styles.melosaResumoQuantidadeHeroLight : styles.melosaResumoQuantidadeHeroDark,
                    ]}
                  >
                    <Text
                      style={[
                        styles.melosaResumoQuantidadeLabel,
                        !isDarkMode ? styles.melosaResumoQuantidadeLabelLight : styles.melosaResumoQuantidadeLabelDark,
                      ]}
                    >
                      Quantidade abastecida
                    </Text>
                    <View style={styles.melosaResumoQuantidadeValueRow}>
                      <Text
                        style={[
                          styles.melosaResumoQuantidadeValue,
                          !isDarkMode ? styles.melosaResumoQuantidadeValueLight : styles.melosaResumoQuantidadeValueDark,
                        ]}
                      >
                        {quantidadeResumoValor}
                      </Text>
                      <Text
                        style={[
                          styles.melosaResumoQuantidadeUnit,
                          !isDarkMode ? styles.melosaResumoQuantidadeUnitLight : styles.melosaResumoQuantidadeUnitDark,
                        ]}
                      >
                        L
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.melosaResumoQuantidadeInsumo,
                        !isDarkMode ? styles.melosaResumoQuantidadeInsumoLight : styles.melosaResumoQuantidadeInsumoDark,
                      ]}
                    >
                      {insumoResumoLabel}
                    </Text>
                  </View>

                  <View style={[styles.melosaResumoBox, !isDarkMode ? styles.melosaResumoBoxLight : styles.melosaResumoBoxDark]}>
                    <ScrollView
                      style={styles.melosaResumoSummaryScroll}
                      contentContainerStyle={styles.melosaResumoSummaryScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                    <View style={styles.melosaResumoRow}>
                      <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                        Obra
                      </Text>
                      <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                        {obraResumoLabel}
                      </Text>
                    </View>
                    {isMelosaObraUsina() ? (
                      <>
                        <View style={styles.melosaResumoRow}>
                          <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                            Encerrante Inicial
                          </Text>
                          <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                            {melosaEncerranteInicialTexto.trim() || "—"}
                          </Text>
                        </View>
                        <View style={styles.melosaResumoRow}>
                          <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                            Encerrante Final
                          </Text>
                          <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                            {melosaEncerranteFinalTexto.trim() || "—"}
                          </Text>
                        </View>
                      </>
                    ) : null}
                    <View style={styles.melosaResumoRow}>
                      <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                        {melosaIsTransbordo ? "Melosa origem" : "Ativo Melosa"}
                      </Text>
                      <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                        {melosaPlacaTexto.trim() || "—"}
                      </Text>
                    </View>
                    <View style={styles.melosaResumoRow}>
                      <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                        {melosaIsTransbordo ? "Melosa destino" : "Patrimônio Equipamento"}
                      </Text>
                      <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                        {melosaFornecedorTexto.trim() || "—"}
                      </Text>
                    </View>
                    {!melosaIsTransbordo ? (
                    <View style={styles.melosaResumoRow}>
                      <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                        Descrição do equipamento
                      </Text>
                      <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                        {equipamentoDescricaoResumo}
                      </Text>
                    </View>
                    ) : null}
                    {!melosaIsTransbordo ? (
                    <View style={styles.melosaResumoRow}>
                      <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                        Empresa do equipamento
                      </Text>
                      <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                        {labelEquipamentoEmpresa(melosaEquipamentoEmpresa)}
                      </Text>
                    </View>
                    ) : null}
                    <View style={styles.melosaResumoRow}>
                      <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                        Motorista do equipamento
                      </Text>
                      <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                        {melosaMotoristaEquipamentoTexto.trim() || "—"}
                      </Text>
                    </View>
                    <View style={styles.melosaResumoRow}>
                      <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                        Horímetro do equipamento
                      </Text>
                      <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                        {horimetroResumoLabel}
                      </Text>
                    </View>
                    </ScrollView>
                  </View>

                  <TouchableOpacity
                    style={styles.lubrificadoRow}
                    onPress={() => setMelosaLubrificado((v) => !v)}
                    disabled={busy}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: melosaLubrificado }}
                    accessibilityLabel="Lubrificado"
                  >
                    <View
                      style={[
                        styles.lubrificadoBox,
                        !isDarkMode ? styles.lubrificadoBoxLight : styles.lubrificadoBoxDark,
                        melosaLubrificado ? styles.lubrificadoBoxChecked : null,
                      ]}
                    >
                      {melosaLubrificado ? (
                        <Text style={styles.lubrificadoBoxMark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.lubrificadoLabel, !isDarkMode ? styles.labelLight : null]}>Lubrificado</Text>
                  </TouchableOpacity>

                  <View style={styles.melosaResumoSignatures} collapsable={false}>
                  <MelosaSignaturePad
                    label={`Operador da melosa (${driverFullName.trim() || "—"})`}
                    isDarkMode={isDarkMode}
                    onSigned={setMelosaAssinaturaOperadorDataUrl}
                    onClear={() => setMelosaAssinaturaOperadorDataUrl(null)}
                    onScrollLockChange={setSignatureScrollLocked}
                  />
                  <MelosaSignaturePad
                    label={`Motorista do equipamento (${melosaMotoristaEquipamentoTexto.trim() || "—"})`}
                    isDarkMode={isDarkMode}
                    onSigned={setMelosaAssinaturaMotoristaDataUrl}
                    onClear={() => setMelosaAssinaturaMotoristaDataUrl(null)}
                    onScrollLockChange={setSignatureScrollLocked}
                  />
                  </View>
                </>
              ) : null}

              {message ? <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>{message}</Text> : null}
              </CardMeasuredWrap>
            </FormScreenScroll>
            {melosaActionFooter}
          </View>
        </SafeAreaView>
        <EquipamentoQrScanner
          visible={melosaEquipamentoQrOpen}
          isDarkMode={isDarkMode}
          onClose={() => setMelosaEquipamentoQrOpen(false)}
          onScanned={(data) => void handleMelosaEquipamentoQrScanned(data)}
        />
      </View>
    );
  }

  const isTanqueObra = tipoAtual === "ENTRADA_TANQUE_OBRA" || tipoAtual === "RETIRADA_TANQUE";
  if (isTanqueObra) {
    const isEntradaTanqueObra = tipoAtual === "ENTRADA_TANQUE_OBRA";
    const isRetiradaTanque = tipoAtual === "RETIRADA_TANQUE";
    const entradaStep =
      screen.name === "form" && screen.tipo === "ENTRADA_TANQUE_OBRA" ? (screen.entradaStep ?? "dados") : "dados";
    const isEntradaDados = isEntradaTanqueObra && entradaStep === "dados";
    const isEntradaDetalhes = isEntradaTanqueObra && entradaStep === "detalhes";
    const isEntradaResumo = isEntradaTanqueObra && entradaStep === "resumo";
    const retiradaStep =
      screen.name === "form" && screen.tipo === "RETIRADA_TANQUE" ? (screen.retiradaStep ?? "dados") : "dados";
    const isRetiradaDados = isRetiradaTanque && retiradaStep === "dados";
    const isRetiradaDetalhes = isRetiradaTanque && retiradaStep === "detalhes";
    const isRetiradaQuantidadeAbastecida = isRetiradaTanque && retiradaStep === "quantidade_abastecida";
    const isRetiradaResumo = isRetiradaTanque && retiradaStep === "resumo";
    const obraTanqueResumo = obrasDisponiveis.find((o) => o.codigo === obraCodigo);
    const obraTanqueResumoLabel = obraTanqueResumo ? `${obraTanqueResumo.codigo} - ${obraTanqueResumo.nome}` : String(obraCodigo);
    const insumoTanqueResumoLabel = labelInsumo(obraCombustivelTipo);
    const title = isEntradaTanqueObra
      ? "Entrada no tanque da obra"
      : retiradaDestino === "EQUIPAMENTO"
        ? "Retirada do tanque para equipamento"
        : "Retirada do tanque";
    const subtitle = isRetiradaDados
      ? retiradaDestino === "EQUIPAMENTO"
        ? "Tanque direto para o equipamento"
        : "Dados da retirada"
      : isRetiradaDetalhes
        ? retiradaDestino === "EQUIPAMENTO"
          ? "Lacre do tanque"
          : "Lacres"
        : isRetiradaQuantidadeAbastecida
          ? "Quantidade abastecida"
          : isRetiradaResumo
            ? "Resumo e assinaturas"
            : isEntradaDados
              ? "Dados da entrada"
              : isEntradaDetalhes
                ? "Nota fiscal e quantidade"
                : isEntradaResumo
                  ? "Resumo e assinaturas"
        : title;

    const tanqueActionFooter = (
      <FormActionFooter isDarkMode={isDarkMode}>
        <View style={styles.formActionRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null, { flex: 1 }]}
            onPress={() => {
              setBusy(false);
              setMessage(null);
              if (isEntradaResumo) {
                setScreen({ name: "form", tipo: "ENTRADA_TANQUE_OBRA", entradaStep: "detalhes" });
                return;
              }
              if (isEntradaDetalhes) {
                setScreen({ name: "form", tipo: "ENTRADA_TANQUE_OBRA", entradaStep: "dados" });
                return;
              }
              if (isRetiradaQuantidadeAbastecida) {
                setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "detalhes" });
                return;
              }
              if (isRetiradaResumo) {
                setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "quantidade_abastecida" });
                return;
              }
              if (isRetiradaDetalhes) {
                setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "dados" });
                return;
              }
              resetForm();
              setScreen({ name: "home" });
            }}
          >
            <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>
              {isRetiradaDetalhes || isRetiradaQuantidadeAbastecida || isRetiradaResumo || isEntradaDetalhes || isEntradaResumo
                ? "Voltar"
                : "Cancelar"}
            </Text>
          </TouchableOpacity>
          {isRetiradaDados ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueRetiradaTanqueDados}
            >
              <Text style={styles.primaryButtonText}>Próximo</Text>
            </TouchableOpacity>
          ) : isRetiradaDetalhes ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueRetiradaTanqueDetalhes}
            >
              <Text style={styles.primaryButtonText}>Próximo</Text>
            </TouchableOpacity>
          ) : isRetiradaQuantidadeAbastecida ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueRetiradaTanqueQuantidadeAbastecida}
            >
              <Text style={styles.primaryButtonText}>Próximo</Text>
            </TouchableOpacity>
          ) : isRetiradaResumo ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueRetiradaTanqueResumo}
            >
              <Text style={styles.primaryButtonText}>{busy ? "Salvando..." : "Salvar"}</Text>
            </TouchableOpacity>
          ) : isEntradaDados ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueEntradaTanqueDados}
            >
              <Text style={styles.primaryButtonText}>Próximo</Text>
            </TouchableOpacity>
          ) : isEntradaDetalhes ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueEntradaTanqueDetalhes}
            >
              <Text style={styles.primaryButtonText}>Próximo</Text>
            </TouchableOpacity>
          ) : isEntradaResumo ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueEntradaTanqueResumo}
            >
              <Text style={styles.primaryButtonText}>{busy ? "Salvando..." : "Salvar"}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={submitMovement}
            >
              <Text style={styles.primaryButtonText}>{busy ? "Salvando..." : "Salvar"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </FormActionFooter>
    );

    return (
      <View style={[styles.formRoot, !isDarkMode ? styles.formRootLight : null]}>
        <StatusBar style={barStyle} />
        <SafeAreaView style={styles.screenSafeArea}>
          <View style={styles.screenShell}>
            <FormScreenScroll
              layoutKey={isRetiradaTanque ? retiradaStep : isEntradaTanqueObra ? entradaStep : tipoAtual ?? "form"}
              scrollEnabled={!signatureScrollLocked}
              nestedScrollEnabled={isRetiradaResumo || isEntradaResumo}
              preferCenter={!isRetiradaResumo && !isEntradaResumo}
              keyboardDismissMode={isRetiradaResumo || isEntradaResumo ? "none" : "on-drag"}
              contentContainerStyle={isRetiradaResumo || isEntradaResumo ? styles.resumoScrollContent : undefined}
            >
              <CardMeasuredWrap
                layout={layout}
                isDarkMode={isDarkMode}
                onBoundsChange={setCardBounds}
                innerStyle={isRetiradaResumo || isEntradaResumo ? styles.glassInnerCompact : undefined}
              >
              <Text style={[styles.formTitle, !isDarkMode ? styles.formTitleLight : null]}>Registrar</Text>
              <Text
                style={[styles.formSubtitle, !isDarkMode ? styles.formSubtitleLight : null]}
                adjustsFontSizeToFit
                numberOfLines={2}
                minimumFontScale={0.8}
              >
                {subtitle}
              </Text>

              {isRetiradaDados ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Obra</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={obraCodigo}
                      onValueChange={(v) => setObraCodigo(Number(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      {obrasDisponiveis.map((o) => (
                        <Picker.Item key={o.codigo} label={`${o.codigo} - ${o.nome}`} value={o.codigo} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Tanque</Text>
                  {tanquesDisponiveis.length > 0 ? (
                    <SeletorTanquesDropdown
                      tanques={tanquesDisponiveis}
                      obrasPorCodigo={obrasPorCodigo}
                      tanqueAtivo={tanqueAtivo}
                      onSelect={selecionarTanque}
                      isDarkMode={isDarkMode}
                    />
                  ) : (
                    <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 4 }]}>
                      Nenhum tanque cadastrado. Peça ao administrador cadastrar em Tanques na web.
                    </Text>
                  )}

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Insumo</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={obraCombustivelTipo}
                      onValueChange={(v) => selecionarInsumoTanque(String(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      {INSUMOS_TANQUE.map((item) => (
                        <Picker.Item key={item.value} label={item.label} value={item.value} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Destino</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        retiradaDestino === "MELOSA"
                          ? { backgroundColor: "#c00", borderColor: "#c00" }
                          : !isDarkMode
                            ? { backgroundColor: "#fff", borderColor: "#ccc" }
                            : { backgroundColor: "#222", borderColor: "#444" },
                        { flex: 1, alignItems: "center", justifyContent: "center" },
                      ]}
                      onPress={() => {
                        if (retiradaDestino === "MELOSA") return;
                        setRetiradaDestino("MELOSA");
                        setPlacaTexto("");
                        setTanqueEquipamentoNome("");
                        setTanqueEquipamentoEmpresa("");
                      }}
                      disabled={busy}
                    >
                      <Text style={{ color: retiradaDestino === "MELOSA" ? "#fff" : !isDarkMode ? "#333" : "#ddd", fontWeight: "700" }}>
                        Melosa
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        retiradaDestino === "EQUIPAMENTO"
                          ? { backgroundColor: "#c00", borderColor: "#c00" }
                          : !isDarkMode
                            ? { backgroundColor: "#fff", borderColor: "#ccc" }
                            : { backgroundColor: "#222", borderColor: "#444" },
                        { flex: 1, alignItems: "center", justifyContent: "center" },
                      ]}
                      onPress={() => {
                        if (retiradaDestino === "EQUIPAMENTO") return;
                        setRetiradaDestino("EQUIPAMENTO");
                        setPlacaTexto("");
                        setTanqueEquipamentoNome("");
                        setTanqueEquipamentoEmpresa("");
                      }}
                      disabled={busy}
                    >
                      <Text style={{ color: retiradaDestino === "EQUIPAMENTO" ? "#fff" : !isDarkMode ? "#333" : "#ddd", fontWeight: "700" }}>
                        Equipamento
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {retiradaDestino === "EQUIPAMENTO" ? (
                    <>
                      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                        Patrimônio do equipamento
                      </Text>
                      <TouchableOpacity
                        style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null, { marginTop: 6 }]}
                        onPress={() => setTanqueEquipamentoQrOpen(true)}
                        disabled={busy}
                      >
                        <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>
                          Ler QR code do equipamento
                        </Text>
                      </TouchableOpacity>
                      <TextInput
                        value={placaTexto}
                        onChangeText={(value) => {
                          setPlacaTexto(value);
                          setTanqueEquipamentoNome("");
                          setTanqueEquipamentoEmpresa("");
                        }}
                        onEndEditing={() => {
                          const found = findCachedEquipamento(equipamentoCatalogRef.current, placaTexto);
                          if (!found?.ativo) return;
                          aplicarEquipamentoNoTanque(found);
                        }}
                        style={[styles.authInput, !isDarkMode ? styles.authInputLight : null, { marginTop: 8 }]}
                        placeholder="Ex.: REVTR02"
                        placeholderTextColor={inputPlaceholderColor}
                        autoCapitalize="characters"
                      />
                      {tanqueEquipamentoNome.trim() ? (
                        <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                          Descrição: {tanqueEquipamentoNome.trim()}
                        </Text>
                      ) : null}
                      {tanqueEquipamentoEmpresa.trim() ? (
                        <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 4 }]}>
                          Empresa: {labelEquipamentoEmpresa(tanqueEquipamentoEmpresa)}
                        </Text>
                      ) : null}
                      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                        Operador do equipamento
                      </Text>
                      <TextInput
                        value={retiradaMotoristaMelosaTexto}
                        onChangeText={setRetiradaMotoristaMelosaTexto}
                        style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                        placeholder="Ex.: João Silva"
                        placeholderTextColor={inputPlaceholderColor}
                        autoCapitalize="words"
                      />
                    </>
                  ) : (
                    <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Patrimônio (Placa/Ativo)</Text>
                  {melosasCadastradas.length > 0 ? (
                    <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                      <Picker
                        selectedValue={placaTexto}
                        onValueChange={(v) => setPlacaTexto(String(v))}
                        style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                      >
                        <Picker.Item label="Selecione o patrimônio (melosa)" value="" />
                        {melosasCadastradas.map((m) => (
                          <Picker.Item
                            key={m.ativo}
                            label={m.nome && m.nome !== m.ativo ? `${m.ativo} - ${m.nome}` : m.ativo}
                            value={m.ativo}
                          />
                        ))}
                      </Picker>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        value={placaTexto}
                        onChangeText={setPlacaTexto}
                        style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                        placeholder="Ex.: CCL1999"
                        placeholderTextColor={inputPlaceholderColor}
                        autoCapitalize="characters"
                      />
                      <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6 }]}>
                        Nenhuma melosa cadastrada. Peça ao administrador para cadastrar em Equipamentos na web.
                      </Text>
                    </>
                  )}

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                    Nome do Motorista Melosa
                  </Text>
                  <TextInput
                    value={retiradaMotoristaMelosaTexto}
                    onChangeText={setRetiradaMotoristaMelosaTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: João Silva"
                    placeholderTextColor={inputPlaceholderColor}
                    autoCapitalize="words"
                  />
                    </>
                  )}
                </>
              ) : null}

              {isEntradaDados ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Motorista (usuário)</Text>
                  <TextInput
                    value={pickOperadorNome(driverFullName) || "—"}
                    editable={false}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null, { opacity: 0.88 }]}
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Obra</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={obraCodigo}
                      onValueChange={(v) => setObraCodigo(Number(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      {obrasDisponiveis.map((o) => (
                        <Picker.Item key={o.codigo} label={`${o.codigo} - ${o.nome}`} value={o.codigo} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Placa</Text>
                  <TextInput
                    value={placaTexto}
                    onChangeText={setPlacaTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: ABC1D23"
                    placeholderTextColor={inputPlaceholderColor}
                    autoCapitalize="characters"
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Fornecedor</Text>
                  <TextInput
                    value={fornecedorTexto}
                    onChangeText={setFornecedorTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Nome do fornecedor"
                    placeholderTextColor={inputPlaceholderColor}
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Tanque</Text>
                  {tanquesDisponiveis.length > 0 ? (
                    <SeletorTanquesDropdown
                      tanques={tanquesDisponiveis}
                      obrasPorCodigo={obrasPorCodigo}
                      tanqueAtivo={tanqueAtivo}
                      onSelect={selecionarTanque}
                      isDarkMode={isDarkMode}
                    />
                  ) : (
                    <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 4 }]}>
                      Nenhum tanque cadastrado. Peça ao administrador cadastrar em Tanques na web.
                    </Text>
                  )}

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Insumo</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={obraCombustivelTipo}
                      onValueChange={(v) => selecionarInsumoTanque(String(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      {INSUMOS_TANQUE.map((item) => (
                        <Picker.Item key={item.value} label={item.label} value={item.value} />
                      ))}
                    </Picker>
                  </View>
                </>
              ) : null}

              {isRetiradaDetalhes ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>Número do Lacre do Tanque</Text>
                  <TextInput
                    value={numeroLacreTanque}
                    onChangeText={setNumeroLacreTanque}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Informe o número do lacre do tanque"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="number-pad"
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>Foto do Lacre do Tanque</Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {lacreTanqueFotoUri ? (
                      <>
                        <Image source={{ uri: lacreTanqueFotoUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setLacreTanqueFotoUri(null)} disabled={busy}>
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione a foto do lacre do tanque
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickLacreTanqueFotoFromLibrary} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickLacreTanqueFotoFromCamera} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>

                  {retiradaDestino === "MELOSA" ? (
                    <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Número do Lacre da Melosa</Text>
                  <TextInput
                    value={numeroLacreMelosa}
                    onChangeText={setNumeroLacreMelosa}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Informe o número do lacre da melosa"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="number-pad"
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>Foto do Lacre da Melosa</Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {lacreMelosaFotoUri ? (
                      <>
                        <Image source={{ uri: lacreMelosaFotoUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setLacreMelosaFotoUri(null)} disabled={busy}>
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione a foto do lacre da melosa
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickLacreMelosaFotoFromLibrary} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickLacreMelosaFotoFromCamera} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                    </>
                  ) : null}
                </>
              ) : null}

              {isRetiradaQuantidadeAbastecida ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>
                    Quantidade Abastecida
                  </Text>
                  <TextInput
                    value={tanqueQuantidadeAbastecidaTexto}
                    onChangeText={setTanqueQuantidadeAbastecidaTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 100"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>
                    Foto Medidor Abastecimento
                  </Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {tanqueQuantidadeAbastecidaFotoUri ? (
                      <>
                        <Image source={{ uri: tanqueQuantidadeAbastecidaFotoUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => setTanqueQuantidadeAbastecidaFotoUri(null)}
                          disabled={busy}
                        >
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione a foto do medidor de abastecimento
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickTanqueQuantidadeAbastecidaFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickTanqueQuantidadeAbastecidaFromCamera}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isRetiradaResumo ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>
                    Confira os dados antes de salvar
                  </Text>

                  <View
                    style={[
                      styles.melosaResumoQuantidadeHero,
                      !isDarkMode ? styles.melosaResumoQuantidadeHeroLight : styles.melosaResumoQuantidadeHeroDark,
                    ]}
                  >
                    <Text
                      style={[
                        styles.melosaResumoQuantidadeLabel,
                        !isDarkMode ? styles.melosaResumoQuantidadeLabelLight : styles.melosaResumoQuantidadeLabelDark,
                      ]}
                    >
                      Quantidade abastecida
                    </Text>
                    <View style={styles.melosaResumoQuantidadeValueRow}>
                      <Text
                        style={[
                          styles.melosaResumoQuantidadeValue,
                          !isDarkMode ? styles.melosaResumoQuantidadeValueLight : styles.melosaResumoQuantidadeValueDark,
                        ]}
                      >
                        {tanqueQuantidadeAbastecidaTexto.trim() || "—"}
                      </Text>
                      <Text
                        style={[
                          styles.melosaResumoQuantidadeUnit,
                          !isDarkMode ? styles.melosaResumoQuantidadeUnitLight : styles.melosaResumoQuantidadeUnitDark,
                        ]}
                      >
                        L
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.melosaResumoQuantidadeInsumo,
                        !isDarkMode ? styles.melosaResumoQuantidadeInsumoLight : styles.melosaResumoQuantidadeInsumoDark,
                      ]}
                    >
                      {insumoTanqueResumoLabel}
                    </Text>
                  </View>

                  <View style={[styles.melosaResumoBox, !isDarkMode ? styles.melosaResumoBoxLight : styles.melosaResumoBoxDark]}>
                    <ScrollView
                      style={styles.melosaResumoSummaryScroll}
                      contentContainerStyle={styles.melosaResumoSummaryScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Obra
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {obraTanqueResumoLabel}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Tanque
                        </Text>
                        <View style={{ flex: 1, alignItems: "flex-end" }}>
                          {tanqueSelecionado ? (
                            <>
                              <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                                {tanqueSelecionado.tanque_numero != null
                                  ? `Tanque ${tanqueSelecionado.tanque_numero}`
                                  : "Tanque"}
                              </Text>
                              <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                                ({tanqueSelecionado.obra_codigo ?? "—"}
                                {obrasPorCodigo.get(tanqueSelecionado.obra_codigo ?? 0)
                                  ? ` - ${obrasPorCodigo.get(tanqueSelecionado.obra_codigo ?? 0)}`
                                  : ""}
                                )
                              </Text>
                              <Text
                                style={[
                                  styles.melosaResumoValue,
                                  !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark,
                                  { textAlign: "right" },
                                ]}
                              >
                                {tanqueSelecionado.nome?.trim() || "—"}
                              </Text>
                            </>
                          ) : (
                            <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                              —
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          {retiradaDestino === "EQUIPAMENTO" ? "Equipamento" : "Patrimônio (melosa)"}
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {placaTexto.trim() || "—"}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          {retiradaDestino === "EQUIPAMENTO" ? "Operador" : "Motorista melosa"}
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {retiradaMotoristaMelosaTexto.trim() || "—"}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Lacre tanque
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {numeroLacreTanque.trim() || "—"}
                        </Text>
                      </View>
                      {retiradaDestino === "MELOSA" ? (
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Lacre melosa
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {numeroLacreMelosa.trim() || "—"}
                        </Text>
                      </View>
                      ) : null}
                    </ScrollView>
                  </View>

                  <View style={styles.melosaResumoSignatures} collapsable={false}>
                    <MelosaSignaturePad
                      label={`Operador do tanque (${pickOperadorNome(driverFullName) || "—"})`}
                      isDarkMode={isDarkMode}
                      onSigned={setTanqueAssinaturaOperadorDataUrl}
                      onClear={() => setTanqueAssinaturaOperadorDataUrl(null)}
                      onScrollLockChange={setSignatureScrollLocked}
                    />
                    <MelosaSignaturePad
                      label={
                        retiradaDestino === "EQUIPAMENTO"
                          ? `Operador do equipamento (${retiradaMotoristaMelosaTexto.trim() || "—"})`
                          : `Motorista melosa (${retiradaMotoristaMelosaTexto.trim() || "—"})`
                      }
                      isDarkMode={isDarkMode}
                      onSigned={setTanqueAssinaturaMelosaDataUrl}
                      onClear={() => setTanqueAssinaturaMelosaDataUrl(null)}
                      onScrollLockChange={setSignatureScrollLocked}
                    />
                  </View>
                </>
              ) : null}

              {isEntradaDetalhes ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Quantidade (L)</Text>
                  <TextInput
                    value={litrosText}
                    onChangeText={setLitrosText}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 1500"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />
                </>
              ) : null}

              {isEntradaDetalhes ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Valor Unitário Insumo</Text>
                  <TextInput
                    value={valorUnitarioText}
                    onChangeText={setValorUnitarioText}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 4,99"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Número da nota</Text>
                  <TextInput
                    value={notaNumero}
                    onChangeText={setNotaNumero}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 12345"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="number-pad"
                  />
                </>
              ) : null}

              {isEntradaDetalhes ? (
                <GpsLocationBlock
                  isDarkMode={isDarkMode}
                  label="Local (GPS)"
                  localLatitude={localLatitude}
                  localLongitude={localLongitude}
                  localAddress={localAddress}
                  onCapture={safeCaptureLocationAndAddress}
                />
              ) : null}

              {isEntradaDetalhes ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>Foto da nota</Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {notaFotoUri ? (
                      <>
                        <Image source={{ uri: notaFotoUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setNotaFotoUri(null)} disabled={busy}>
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione uma foto da nota
                      </Text>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickNotaFotoFromLibrary} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickNotaFotoFromCamera} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isEntradaDetalhes ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>OBS</Text>
                  <TextInput
                    value={obs}
                    onChangeText={setObs}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null, { minHeight: 80, textAlignVertical: "top" }]}
                    placeholder="Detalhes adicionais..."
                    placeholderTextColor={inputPlaceholderColor}
                    multiline
                    scrollEnabled={false}
                  />
                </>
              ) : null}

              {isEntradaResumo ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>
                    Confira os dados antes de salvar
                  </Text>

                  <View
                    style={[
                      styles.melosaResumoQuantidadeHero,
                      !isDarkMode ? styles.melosaResumoQuantidadeHeroLight : styles.melosaResumoQuantidadeHeroDark,
                    ]}
                  >
                    <Text
                      style={[
                        styles.melosaResumoQuantidadeLabel,
                        !isDarkMode ? styles.melosaResumoQuantidadeLabelLight : styles.melosaResumoQuantidadeLabelDark,
                      ]}
                    >
                      Quantidade recebida
                    </Text>
                    <View style={styles.melosaResumoQuantidadeValueRow}>
                      <Text
                        style={[
                          styles.melosaResumoQuantidadeValue,
                          !isDarkMode ? styles.melosaResumoQuantidadeValueLight : styles.melosaResumoQuantidadeValueDark,
                        ]}
                      >
                        {litrosText.trim() || "—"}
                      </Text>
                      <Text
                        style={[
                          styles.melosaResumoQuantidadeUnit,
                          !isDarkMode ? styles.melosaResumoQuantidadeUnitLight : styles.melosaResumoQuantidadeUnitDark,
                        ]}
                      >
                        L
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.melosaResumoQuantidadeInsumo,
                        !isDarkMode ? styles.melosaResumoQuantidadeInsumoLight : styles.melosaResumoQuantidadeInsumoDark,
                      ]}
                    >
                      {insumoTanqueResumoLabel}
                    </Text>
                  </View>

                  <View style={[styles.melosaResumoBox, !isDarkMode ? styles.melosaResumoBoxLight : styles.melosaResumoBoxDark]}>
                    <ScrollView
                      style={styles.melosaResumoSummaryScroll}
                      contentContainerStyle={styles.melosaResumoSummaryScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Obra
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {obraTanqueResumoLabel}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Tanque
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {tanqueSelecionado
                            ? tanqueSelecionado.nome?.trim()
                              ? `Tanque ${tanqueSelecionado.tanque_numero} — ${tanqueSelecionado.nome}`
                              : `Tanque ${tanqueSelecionado.tanque_numero}`
                            : "—"}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Placa
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {placaTexto.trim() || "—"}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Fornecedor
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {fornecedorTexto.trim() || "—"}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Motorista (operador)
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {pickOperadorNome(driverFullName) || "—"}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Nº da nota
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {notaNumero.trim() || "—"}
                        </Text>
                      </View>
                      <View style={styles.melosaResumoRow}>
                        <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                          Valor unitário
                        </Text>
                        <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                          {valorUnitarioText.trim() ? `R$ ${valorUnitarioText.trim()}` : "—"}
                        </Text>
                      </View>
                      {obs.trim() ? (
                        <View style={styles.melosaResumoRow}>
                          <Text style={[styles.melosaResumoLabel, !isDarkMode ? styles.melosaResumoLabelLight : styles.melosaResumoLabelDark]}>
                            OBS
                          </Text>
                          <Text style={[styles.melosaResumoValue, !isDarkMode ? styles.melosaResumoValueLight : styles.melosaResumoValueDark]}>
                            {obs.trim()}
                          </Text>
                        </View>
                      ) : null}
                    </ScrollView>
                  </View>

                  <View style={styles.melosaResumoSignatures} collapsable={false}>
                    <MelosaSignaturePad
                      label={`Operador do tanque (${pickOperadorNome(driverFullName) || "—"})`}
                      isDarkMode={isDarkMode}
                      onSigned={setTanqueAssinaturaOperadorDataUrl}
                      onClear={() => setTanqueAssinaturaOperadorDataUrl(null)}
                      onScrollLockChange={setSignatureScrollLocked}
                    />
                    <MelosaSignaturePad
                      label={`Responsável pela entrega (${fornecedorTexto.trim() || "—"})`}
                      isDarkMode={isDarkMode}
                      onSigned={setTanqueAssinaturaMelosaDataUrl}
                      onClear={() => setTanqueAssinaturaMelosaDataUrl(null)}
                      onScrollLockChange={setSignatureScrollLocked}
                    />
                  </View>
                </>
              ) : null}

              {message ? <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>{message}</Text> : null}
              </CardMeasuredWrap>
            </FormScreenScroll>
            {tanqueActionFooter}
          </View>
        </SafeAreaView>
        <EquipamentoQrScanner
          visible={tanqueEquipamentoQrOpen}
          isDarkMode={isDarkMode}
          onClose={() => setTanqueEquipamentoQrOpen(false)}
          onScanned={(data) => void handleTanqueEquipamentoQrScanned(data)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.formRoot, !isDarkMode ? styles.formRootLight : null]}>
      <StatusBar style={barStyle} />
      <SafeAreaView style={styles.screenSafeArea}>
        <View style={styles.screenShell}>
          <FormScreenScroll>
            <CardMeasuredWrap layout={layout} isDarkMode={isDarkMode} onBoundsChange={setCardBounds}>
          <Text style={[styles.formTitle, !isDarkMode ? styles.formTitleLight : null]}>Registrar</Text>
          <Text
            style={[styles.formSubtitle, !isDarkMode ? styles.formSubtitleLight : null]}
            adjustsFontSizeToFit
            numberOfLines={2}
            minimumFontScale={0.8}
          >
            {tipoAtual === "RETIRADA_MELOSA" ? "Retirada da melosa" : "Registrar"}
          </Text>

        <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Obra</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled style={{ marginTop: 6 }}>
          {obrasDisponiveis.map((o) => {
            const selected = o.codigo === obraCodigo;
            return (
              <TouchableOpacity
                key={o.codigo}
                onPress={() => setObraCodigo(o.codigo)}
                style={[
                  styles.chip,
                  selected ? { backgroundColor: "#c00", borderColor: "#c00" } : { backgroundColor: "#fff" },
                ]}
              >
                <Text style={{ color: selected ? "#fff" : "#333" }}>
                  {o.codigo} - {o.nome}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ height: 12 }} />

        <Text>Litros</Text>
        <TextInput value={litrosText} onChangeText={setLitrosText} style={styles.input} placeholder="Ex.: 1500" keyboardType="decimal-pad" />
        <View style={{ height: 12 }} />

        {tipoAtual === "RETIRADA_MELOSA" ? (
          <>
            <Text>Placa</Text>
            <TextInput
              value={placaTexto}
              onChangeText={setPlacaTexto}
              style={styles.input}
              placeholder="Ex.: ABC1D23"
              autoCapitalize="characters"
            />
            <View style={{ height: 12 }} />

            <Text>Fornecedor</Text>
            <TextInput value={fornecedorTexto} onChangeText={setFornecedorTexto} style={styles.input} placeholder="Fornecedor" />
            <View style={{ height: 12 }} />

            <Text>Tanque</Text>
            <View style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, marginTop: 6 }}>
              <Picker selectedValue={tanqueNumero} onValueChange={(v) => setTanqueNumero(Number(v) === 2 ? 2 : 1)}>
                <Picker.Item label="Tanque 1" value={1} />
                <Picker.Item label="Tanque 2" value={2} />
              </Picker>
            </View>
            <View style={{ height: 12 }} />

            <GpsLocationBlock
              isDarkMode={isDarkMode}
              label="Local (GPS)"
              localLatitude={localLatitude}
              localLongitude={localLongitude}
              localAddress={localAddress}
              onCapture={safeCaptureLocationAndAddress}
            />
            <View style={{ height: 12 }} />
          </>
        ) : null}

        <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 0 }]}>Observação (opcional)</Text>
        <TextInput
          value={obs}
          onChangeText={setObs}
          style={[styles.authInput, !isDarkMode ? styles.authInputLight : null, { minHeight: 80, textAlignVertical: "top" }]}
          placeholder="Detalhes..."
          placeholderTextColor={inputPlaceholderColor}
          multiline
          scrollEnabled={false}
        />

        {message ? <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 12 }]}>{message}</Text> : null}
            </CardMeasuredWrap>
          </FormScreenScroll>
          <FormActionFooter isDarkMode={isDarkMode}>
          <View style={styles.formActionRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null, { flex: 1 }]}
              onPress={() => setScreen({ name: "home" })}
            >
              <Text style={[styles.secondaryButtonText, !isDarkMode ? styles.secondaryButtonTextLight : null]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              onPress={submitMovement}
              disabled={busy}
            >
              <Text style={styles.primaryButtonText}>Salvar</Text>
            </TouchableOpacity>
          </View>
          </FormActionFooter>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
  form: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#c00",
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    marginRight: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  authRoot: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  authRootLight: {
    backgroundColor: lightTheme.canvas,
  },
  authBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B1020",
  },
  authBgLight: {
    backgroundColor: lightTheme.canvas,
  },
  orb1: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(239,68,68,0.42)",
    top: -160,
    left: -120,
  },
  orb1Light: {
    backgroundColor: lightTheme.accentOrb,
    opacity: 0.95,
  },
  orb2: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: "rgba(56,189,248,0.30)",
    bottom: -220,
    right: -180,
  },
  orb2Light: {
    backgroundColor: lightTheme.accentOrbSoft,
    opacity: 1,
  },
  screenSafeArea: {
    flex: 1,
    width: "100%",
  },
  screenShell: {
    flex: 1,
    width: "100%",
    position: "relative",
    flexDirection: "column",
  },
  centeredScreenScroll: {
    flexGrow: 1,
    width: "100%",
    alignItems: "center",
    paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
  },
  centeredScrollInner: {
    width: "100%",
    alignItems: "center",
  },
  screenScrollFill: {
    flex: 1,
    width: "100%",
  },
  glassCard: {
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.07)",
    shadowColor: "#020617",
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  glassCardLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: "rgba(255,255,255,0.97)",
    shadowColor: lightTheme.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  glassCardFullWidth: {
    width: "100%",
    alignSelf: "stretch",
  },
  glassBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  glassInner: {
    width: "100%",
    alignSelf: "stretch",
    padding: 18,
  },
  glassInnerCompact: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  themeToggleFloating: {
    position: "absolute",
    zIndex: 40,
    width: THEME_TOGGLE_WIDTH,
    height: THEME_TOGGLE_HEIGHT,
  },
  themeToggle: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(8,12,20,0.45)",
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#020617",
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  themeToggleLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surface,
    shadowColor: lightTheme.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  themeToggleText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  themeToggleTextLight: {
    color: lightTheme.textSecondary,
  },
  authScroll: {
    flexGrow: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 240,
  },
  authScrollLogin: {
    paddingBottom: 24,
  },
  authScrollRegister: {
    paddingBottom: 48,
  },
  authKeyboardFlex: {
    flex: 1,
    width: "100%",
  },
  authScrollFlex: {
    flex: 1,
    width: "100%",
  },
  brandWrap: {
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 18,
  },
  brandWrapCompact: {
    marginBottom: 10,
  },
  brandLogo: {
    alignSelf: "center",
  },
  authTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 16,
  },
  authTitleLight: {
    color: lightTheme.textPrimary,
  },
  label: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
  },
  labelLight: {
    color: lightTheme.textSecondary,
  },
  authInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    color: "#fff",
    fontSize: 16,
  },
  authInputLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surface,
    color: lightTheme.textPrimary,
  },
  authPasswordRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    minHeight: 48,
    paddingRight: 4,
  },
  authPasswordRowLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surface,
  },
  authPasswordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 16,
    backgroundColor: "transparent",
  },
  authPasswordInputLight: {
    color: lightTheme.textPrimary,
  },
  authPasswordToggle: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  authPasswordToggleText: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "800",
    fontSize: 14,
  },
  authPasswordToggleTextLight: {
    color: lightTheme.accent,
    fontWeight: "800",
  },
  authMessage: {
    marginTop: 12,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    fontWeight: "600",
  },
  authMessageLight: {
    color: lightTheme.textMuted,
  },
  primaryButton: {
    marginTop: 18,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#c00",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B10000",
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#8B0000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  primaryButtonLight: {
    backgroundColor: lightTheme.accent,
    borderColor: lightTheme.accentDark,
    shadowColor: lightTheme.accentDark,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  secondaryLink: {
    marginTop: 12,
    alignSelf: "center",
  },
  secondaryLinkText: {
    color: "rgba(255,255,255,0.95)",
    textDecorationLine: "underline",
    fontWeight: "800",
  },
  secondaryLinkTextLight: {
    color: lightTheme.accent,
  },
  photoBox: {
    width: "100%",
    alignSelf: "stretch",
    marginTop: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 10,
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  photoBoxCompact: {
    minHeight: 92,
    padding: 8,
    marginTop: 4,
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  photoBoxLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surfaceMuted,
  },
  photoPreview: {
    width: "100%",
    height: 140,
    borderRadius: 12,
  },
  photoPreviewCompact: {
    height: 88,
  },
  photoPlaceholderCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  photoPreviewFull: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    resizeMode: "contain",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  photoPlaceholder: {
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    fontWeight: "700",
  },
  photoPlaceholderLight: {
    color: lightTheme.textMuted,
  },
  photoRemove: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoRemoveText: {
    color: "#fff",
    fontWeight: "900",
  },
  ghostButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostButtonLight: {
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    shadowColor: lightTheme.textPrimary,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  ghostButtonText: {
    color: "#fff",
    fontWeight: "900",
  },
  ghostButtonTextLight: {
    color: lightTheme.textSecondary,
  },

  toggleSideLabel: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "800",
    fontSize: 13,
    marginRight: 10,
  },
  toggleSideLabelLight: {
    color: lightTheme.textSecondary,
  },
  toggleSwitchTrack: {
    width: 56,
    height: 32,
    borderRadius: 999,
    padding: 0,
    position: "relative",
    justifyContent: "center",
  },
  toggleSwitchTrackOn: {
    backgroundColor: "#22c55e",
  },
  toggleSwitchTrackOff: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  toggleSwitchTrackLightOff: {
    backgroundColor: "#e5e7eb",
  },
  toggleSwitchKnob: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "#fff",
  },

  melosaHorimetroToggleButton: {
    flex: 0,
    width: "auto",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  melosaHorimetroToggleButtonLight: {
    borderColor: lightTheme.border,
    backgroundColor: lightTheme.surface,
    shadowColor: lightTheme.textPrimary,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  melosaHorimetroToggleButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
  },
  melosaHorimetroToggleButtonTextLight: {
    color: lightTheme.textSecondary,
  },

  horimetroMotivoRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  horimetroMotivoChip: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  horimetroMotivoChipLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surfaceMuted,
  },
  horimetroMotivoChipDark: {
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  horimetroMotivoChipSelected: {
    borderColor: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.15)",
  },
  horimetroMotivoChipText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f8fafc",
    textAlign: "center",
  },
  horimetroMotivoChipTextLight: {
    color: lightTheme.textPrimary,
  },
  horimetroMotivoChipTextSelected: {
    color: "#2563eb",
  },

  melosaResumoBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  melosaResumoBoxLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surfaceMuted,
  },
  melosaResumoBoxDark: {
    borderColor: "rgba(148,163,184,0.25)",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  melosaResumoQuantidadeHero: {
    marginTop: 10,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    gap: 2,
  },
  melosaResumoQuantidadeHeroLight: {
    borderColor: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.08)",
  },
  melosaResumoQuantidadeHeroDark: {
    borderColor: "#60a5fa",
    backgroundColor: "rgba(96,165,250,0.12)",
  },
  melosaResumoQuantidadeLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  melosaResumoQuantidadeLabelLight: { color: "#1d4ed8" },
  melosaResumoQuantidadeLabelDark: { color: "#93c5fd" },
  melosaResumoQuantidadeValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    marginTop: 2,
  },
  melosaResumoQuantidadeValue: {
    fontSize: 48,
    fontWeight: "900",
    lineHeight: 52,
    letterSpacing: -1,
  },
  melosaResumoQuantidadeValueLight: { color: "#0f172a" },
  melosaResumoQuantidadeValueDark: { color: "#f8fafc" },
  melosaResumoQuantidadeUnit: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 40,
    marginBottom: 4,
  },
  melosaResumoQuantidadeUnitLight: { color: "#334155" },
  melosaResumoQuantidadeUnitDark: { color: "#cbd5e1" },
  melosaResumoQuantidadeInsumo: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
  },
  melosaResumoQuantidadeInsumoLight: { color: "#475569" },
  melosaResumoQuantidadeInsumoDark: { color: "#94a3b8" },
  melosaResumoSummaryScroll: {
    maxHeight: 240,
  },
  melosaResumoSummaryScrollContent: {
    gap: 8,
  },
  lubrificadoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  lubrificadoBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  lubrificadoBoxLight: {
    borderColor: "#64748b",
    backgroundColor: "#ffffff",
  },
  lubrificadoBoxDark: {
    borderColor: "#94a3b8",
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  lubrificadoBoxChecked: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },
  lubrificadoBoxMark: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 18,
  },
  lubrificadoLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#f8fafc",
  },
  melosaResumoSignatures: {
    marginTop: 4,
  },
  resumoScrollContent: {
    paddingBottom: 48,
    flexGrow: 1,
  },
  melosaResumoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  melosaResumoLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  melosaResumoLabelLight: { color: "#64748b" },
  melosaResumoLabelDark: { color: "#94a3b8" },
  melosaResumoValue: {
    flex: 1.2,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  melosaResumoValueLight: { color: "#0f172a" },
  melosaResumoValueDark: { color: "#f8fafc" },

  homeRoot: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  homeRootLight: {
    backgroundColor: lightTheme.canvas,
  },
  homeGlassInner: {
    width: "100%",
    alignItems: "center",
  },
  homeHeroWrap: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 10,
  },
  homeHeroPlate: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.88)",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  homeHeroPlateLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surface,
  },
  homeHeroImage: {
    width: "100%",
    height: 110,
    opacity: 1,
    alignSelf: "stretch",
  },
  homeTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  homeTitleLight: {
    color: lightTheme.textPrimary,
  },
  homeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 0,
  },
  homeTitleLogoWrap: {
    width: 74,
    height: 42,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  homeTitleLogo: {
    width: "100%",
    height: "100%",
    opacity: 0.98,
  },
  homeSub: {
    width: "100%",
    color: "rgba(255,255,255,0.75)",
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  homeSubLight: {
    color: lightTheme.textMuted,
  },
  homeActionCard: {
    marginTop: 12,
    width: "100%",
    alignSelf: "stretch",
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(30,41,59,0.86)",
    paddingVertical: 14,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  homeActionCardLight: {
    borderColor: lightTheme.borderSubtle,
    borderLeftWidth: 4,
    borderLeftColor: lightTheme.accent,
    backgroundColor: lightTheme.surface,
  },
  homeActionCardDisabled: {
    opacity: 0.42,
  },
  homeActionCardDisabledLight: {
    borderLeftColor: lightTheme.borderSubtle,
  },
  homeActionTitle: {
    width: "100%",
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    textAlign: "center",
  },
  homeActionTitleLight: {
    color: lightTheme.textPrimary,
  },
  homeActionTitleDisabled: {
    color: "rgba(255,255,255,0.55)",
  },
  homeActionTitleDisabledLight: {
    color: lightTheme.textMuted,
  },
  secondaryButton: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonLight: {
    borderColor: lightTheme.border,
    borderWidth: 1,
    backgroundColor: lightTheme.surface,
    borderRadius: 16,
    shadowColor: lightTheme.textPrimary,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  secondaryButtonTextLight: {
    color: lightTheme.textSecondary,
  },
  homeMessage: {
    marginTop: 12,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    fontWeight: "700",
  },
  homeMessageLight: {
    color: lightTheme.textMuted,
  },
  saveAckOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  saveAckCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 22,
    backgroundColor: "rgba(20,28,40,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  saveAckCardLight: {
    backgroundColor: "#fff",
    borderColor: lightTheme.border,
  },
  saveAckTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
    textAlign: "center",
  },
  saveAckTitleLight: {
    color: lightTheme.textPrimary,
  },
  saveAckLine: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  saveAckLineLight: {
    color: lightTheme.textPrimary,
  },
  saveAckStatus: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 20,
  },
  saveAckStatusOk: {
    color: "#22c55e",
  },
  saveAckStatusPending: {
    color: "#f59e0b",
  },
  saveAckStatusError: {
    color: "#ef4444",
  },
  saveAckErrorDetail: {
    marginTop: 10,
    color: "rgba(255,180,180,0.95)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  saveAckErrorDetailLight: {
    color: "#b91c1c",
  },
  homeFooterLogoWrap: {
    marginTop: 18,
    alignItems: "center",
  },
  homeFooterLogo: {
    width: 130,
    height: 70,
    opacity: 0.95,
  },

  formRoot: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  formRootLight: {
    backgroundColor: lightTheme.canvas,
  },
  formScrollView: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },
  formFooter: {
    width: "100%",
    flexShrink: 0,
    alignItems: "center",
    paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#0B1020",
  },
  formFooterLight: {
    borderTopColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.canvas,
  },
  formActionRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  formFooterPrimary: {
    flex: 1,
    marginTop: 0,
    width: undefined,
  },
  locationButtonWrap: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  ghostButtonLocation: {
    alignSelf: "center",
    minWidth: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  ghostButtonLocationCompact: {
    minWidth: 200,
    paddingVertical: 10,
  },
  formTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 4,
  },
  formTitleLight: {
    color: lightTheme.textPrimary,
  },
  formSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
  },
  formSubtitleLight: {
    color: lightTheme.textMuted,
  },
  pickerShell: {
    width: "100%",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  pickerShellLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surfaceMuted,
  },
  picker: {
    color: "#fff",
  },
  pickerLight: {
    color: lightTheme.textPrimary,
  },
  tanqueListaShell: {
    width: "100%",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    maxHeight: 280,
  },
  tanqueListaShellLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surfaceMuted,
  },
  tanqueDropdownTrigger: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    minHeight: 52,
  },
  tanqueDropdownTriggerLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surfaceMuted,
  },
  tanqueDropdownTriggerBody: {
    flex: 1,
    paddingRight: 8,
  },
  tanqueDropdownResumo: {
    gap: 2,
  },
  tanqueDropdownPlaceholder: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 15,
  },
  tanqueDropdownPlaceholderLight: {
    color: lightTheme.textMuted,
  },
  tanqueDropdownChevron: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  tanqueDropdownChevronLight: {
    color: lightTheme.textMuted,
  },
  tanqueDropdownBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  tanqueDropdownModal: {
    maxHeight: "72%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "#1e293b",
    overflow: "hidden",
  },
  tanqueDropdownModalLight: {
    borderColor: lightTheme.borderSubtle,
    backgroundColor: lightTheme.surface,
  },
  tanqueDropdownModalTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  tanqueDropdownModalTitleLight: {
    color: lightTheme.textPrimary,
  },
  tanqueDropdownFechar: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingVertical: 14,
    alignItems: "center",
  },
  tanqueDropdownFecharLight: {
    borderTopColor: lightTheme.borderSubtle,
  },
  tanqueDropdownFecharText: {
    color: "#93c5fd",
    fontSize: 15,
    fontWeight: "700",
  },
  tanqueDropdownFecharTextLight: {
    color: "#2563eb",
  },
  tanqueListaScroll: {
    maxHeight: 280,
  },
  tanqueListaSeparador: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 11,
    lineHeight: 14,
    textAlign: "center",
    marginVertical: 2,
    letterSpacing: -0.5,
  },
  tanqueListaSeparadorLight: {
    color: lightTheme.borderSubtle,
  },
  tanqueListaItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  tanqueListaItemLight: {},
  tanqueListaItemSelected: {
    backgroundColor: "rgba(59,130,246,0.22)",
  },
  tanqueListaItemSelectedLight: {
    backgroundColor: "rgba(37,99,235,0.12)",
  },
  tanqueListaNumero: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  tanqueListaNumeroLight: {
    color: lightTheme.textPrimary,
  },
  tanqueListaObra: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "600",
  },
  tanqueListaObraLight: {
    color: lightTheme.textMuted,
  },
  tanqueListaDescricao: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    lineHeight: 20,
    flexWrap: "wrap",
  },
  tanqueListaDescricaoLight: {
    color: lightTheme.textPrimary,
  },
});
