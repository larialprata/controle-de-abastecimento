import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import * as Location from "expo-location";
import NetInfo from "@react-native-community/netinfo";
import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { env } from "./src/lib/env";
import { clearOutbox, enqueueOutbox, initDb, outboxCount } from "./src/db/sqlite";
import { syncOutbox } from "./src/sync/syncOutbox";
import { OBRAS } from "./src/constants/obras";
import type { MovimentoTipo, MovimentacaoPayload } from "./src/types/movimentacao";
import { v4 as uuidv4 } from "uuid";
import { apiGet, apiPost, registerCredentials } from "./src/lib/api";
import { readImageUriAsArrayBuffer } from "./src/lib/readImageUri";
import { lightTheme } from "./src/theme/light";

type Screen =
  | { name: "login" }
  | { name: "registro" }
  | { name: "home" }
  | { name: "form"; tipo: MovimentoTipo; retiradaStep?: "dados" | "detalhes" | "medidor" | "confirmacao" }
  | { name: "melosa"; step: "register" | "medidor_acumulado" | "horimetro" | "lacre_medidor" };

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
  const { width: screenWidth } = useWindowDimensions();
  return useMemo(() => {
    const contentWidth = Math.min(screenWidth - SCREEN_HORIZONTAL_PADDING * 2, SCREEN_CARD_MAX_WIDTH);
    const cardShellStyle = {
      width: contentWidth,
      maxWidth: SCREEN_CARD_MAX_WIDTH,
      alignSelf: "center" as const,
    };
    return {
      screenWidth,
      contentWidth,
      cardShellStyle,
      brandLogoSize: {
        width: Math.min(240, Math.max(150, Math.round(contentWidth * 0.82))),
        height: Math.min(120, Math.max(68, Math.round(contentWidth * 0.36))),
      },
      heroImageHeight: Math.min(120, Math.max(76, Math.round(contentWidth * 0.28))),
      statusFontSize: scaleFontSize(14, screenWidth),
      actionTitleFontSize: scaleFontSize(16, screenWidth),
    };
  }, [screenWidth]);
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

function CenteredScrollView({
  children,
  contentContainerStyle,
  style,
  keyboardPadding = 0,
  preferCenter = true,
  viewportHeightOverride,
  keyboardDismissMode = "on-drag",
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardPadding?: number;
  preferCenter?: boolean;
  viewportHeightOverride?: number;
  keyboardDismissMode?: "none" | "on-drag" | "interactive";
}) {
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const viewportHeight = viewportHeightOverride && viewportHeightOverride > 0 ? viewportHeightOverride : scrollViewportHeight;
  const scrollTopInset = SCREEN_TOP_INSET;
  const availableHeight = Math.max(0, viewportHeight - scrollTopInset - 12);
  const shouldCenter =
    preferCenter && viewportHeight > 0 && contentHeight > 0 && contentHeight <= availableHeight;
  const freeSpace = shouldCenter ? Math.max(0, availableHeight - contentHeight) : 0;
  const paddingTop = shouldCenter ? scrollTopInset + freeSpace / 2 : scrollTopInset;
  const paddingBottom = shouldCenter ? Math.max(16, freeSpace / 2) : 16;

  return (
    <ScrollView
      style={[styles.screenScrollFill, style]}
      onLayout={(event) => setScrollViewportHeight(event.nativeEvent.layout.height)}
      contentContainerStyle={[
        styles.centeredScreenScroll,
        { paddingTop, paddingBottom },
        viewportHeight > 0 && !shouldCenter ? { minHeight: viewportHeight } : null,
        contentContainerStyle,
        keyboardPadding > 0 ? { paddingBottom: keyboardPadding + paddingBottom } : null,
      ]}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode={keyboardDismissMode}
      nestedScrollEnabled
      showsVerticalScrollIndicator
      automaticallyAdjustKeyboardInsets
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

function FormScreenScroll({
  children,
  contentContainerStyle,
  preferCenter = true,
  layoutKey,
  keyboardDismissMode = "on-drag",
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  preferCenter?: boolean;
  layoutKey?: string;
  keyboardDismissMode?: "none" | "on-drag" | "interactive";
}) {
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

  return (
    <KeyboardAvoidingView
      key={layoutKey}
      style={styles.formScrollView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      onLayout={(event) => setScrollAreaHeight(event.nativeEvent.layout.height)}
    >
      <CenteredScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardPadding={keyboardHeight}
        preferCenter={preferCenter && keyboardHeight === 0}
        viewportHeightOverride={scrollAreaHeight}
        keyboardDismissMode={keyboardDismissMode}
      >
        {children}
      </CenteredScrollView>
    </KeyboardAvoidingView>
  );
}

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
  busy,
  label,
  localLatitude,
  localLongitude,
  localAddress,
  onCapture,
  showDetails = true,
}: {
  isDarkMode: boolean;
  busy: boolean;
  label: string;
  localLatitude: number | null;
  localLongitude: number | null;
  localAddress: string | null;
  onCapture: () => void;
  showDetails?: boolean;
}) {
  return (
    <>
      <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8, textAlign: "center" }]}>
        {label}
      </Text>
      <View style={[styles.locationButtonWrap, { marginTop: 2, marginBottom: 0 }]}>
        <TouchableOpacity
          style={[styles.ghostButtonLocation, styles.ghostButtonLocationCompact, !isDarkMode ? styles.ghostButtonLight : null]}
          onPress={onCapture}
          disabled={busy}
        >
          <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Obter localização</Text>
        </TouchableOpacity>
      </View>
      {showDetails ? (
        <>
          {localLatitude != null && localLongitude != null ? (
            <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6, textAlign: "center" }]}>
              Coordenadas: {localLatitude.toFixed(5)}, {localLongitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 6, textAlign: "center" }]}>
              Aguardando GPS… toque em “Obter localização” se não atualizar.
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

  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const isDarkMode = themeMode === "dark";
  const barStyle = isDarkMode ? "light" : "dark";
  const inputPlaceholderColor = isDarkMode ? "rgba(255,255,255,0.65)" : lightTheme.placeholder;

  const [screen, setScreen] = useState<Screen>({ name: "login" });
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const loginEmailRef = useRef<TextInput | null>(null);
  const loginPasswordRef = useRef<TextInput | null>(null);
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
  const [melosaObraCodigo, setMelosaObraCodigo] = useState<number>(OBRAS[0]?.codigo ?? 229);
  const [melosaPlacaTexto, setMelosaPlacaTexto] = useState("");
  const [melosaFornecedorTexto, setMelosaFornecedorTexto] = useState("");
  const [melosaTanqueNumero, setMelosaTanqueNumero] = useState<1 | 2>(1);
  const [melosaRegKmText, setMelosaRegKmText] = useState("");
  const [melosaRegLitrosText, setMelosaRegLitrosText] = useState("");
  const [melosaRegCombustivelTipo, setMelosaRegCombustivelTipo] = useState("DIESEL_S10");
  const [melosaComprovanteFotoUri, setMelosaComprovanteFotoUri] = useState<string | null>(null);
  const [melosaMedidorAcumuladoInicialNumero, setMelosaMedidorAcumuladoInicialNumero] = useState("");
  const [melosaMedidorAcumuladoInicialFotoUri, setMelosaMedidorAcumuladoInicialFotoUri] = useState<string | null>(null);
  const [melosaHorimetroEquipamentoNumero, setMelosaHorimetroEquipamentoNumero] = useState("");
  const [melosaHorimetroEquipamentoFotoUri, setMelosaHorimetroEquipamentoFotoUri] = useState<string | null>(null);
  const [melosaNaoTenhoHorimetro, setMelosaNaoTenhoHorimetro] = useState(true);
  const [melosaMotoristaEquipamentoTexto, setMelosaMotoristaEquipamentoTexto] = useState("");
  const [melosaEquipamentoOperadorFotoUri, setMelosaEquipamentoOperadorFotoUri] = useState<string | null>(null);
  const [melosaMedidorAcumuladoFinalNumero, setMelosaMedidorAcumuladoFinalNumero] = useState("");
  const [melosaMedidorAcumuladoFinalFotoUri, setMelosaMedidorAcumuladoFinalFotoUri] = useState<string | null>(null);

  const [melosaWdrKmText, setMelosaWdrKmText] = useState("");
  const [melosaWdrLitrosText, setMelosaWdrLitrosText] = useState("");
  const [melosaWdrCombustivelTipo, setMelosaWdrCombustivelTipo] = useState("DIESEL");
  const [melosaTanqueFotoUri, setMelosaTanqueFotoUri] = useState<string | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [pending, setPending] = useState(0);

  const [obraCodigo, setObraCodigo] = useState<number>(OBRAS[0]?.codigo ?? 229);
  const [tanqueTexto, setTanqueTexto] = useState("");
  const [litrosText, setLitrosText] = useState("");

  const [obraCombustivelTipo, setObraCombustivelTipo] = useState<string>("DIESEL_S10");
  const [notaNumero, setNotaNumero] = useState<string>("");
  const [placaTexto, setPlacaTexto] = useState("");
  const [fornecedorTexto, setFornecedorTexto] = useState("");
  const [equipamentoTexto, setEquipamentoTexto] = useState("");
  const [horimetroHodometroTexto, setHorimetroHodometroTexto] = useState("");
  const [horimetroFotoUri, setHorimetroFotoUri] = useState<string | null>(null);
  const [numeroLacreTanque, setNumeroLacreTanque] = useState("");
  const [numeroLacreMelosa, setNumeroLacreMelosa] = useState("");
  const [lacreTanqueFotoUri, setLacreTanqueFotoUri] = useState<string | null>(null);
  const [lacreMelosaFotoUri, setLacreMelosaFotoUri] = useState<string | null>(null);
  const [numeroInicialMedidorTanque, setNumeroInicialMedidorTanque] = useState("");
  const [numeroFinalMedidorTanque, setNumeroFinalMedidorTanque] = useState("");
  const [medidorTanqueFotoInicialUri, setMedidorTanqueFotoInicialUri] = useState<string | null>(null);
  const [medidorTanqueFotoFinalUri, setMedidorTanqueFotoFinalUri] = useState<string | null>(null);
  const [confirmacaoAbastecimentoFotoUri, setConfirmacaoAbastecimentoFotoUri] = useState<string | null>(null);
  const [tanqueNumero, setTanqueNumero] = useState<1 | 2>(1);
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
      return;
    }
    if (screen.name === "melosa" && screen.step === "lacre_medidor") {
      safeCaptureLocationAndAddress();
    }
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
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) setScreen({ name: "home" });
    })();
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setAuthUserId(uid);
      const email = userData.user?.email ?? "";
      let fullName = "";
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, is_melosa")
          .eq("user_id", uid)
          .maybeSingle();
        if (prof?.full_name && String(prof.full_name).trim()) fullName = String(prof.full_name).trim();
        setIsMelosaUser(Boolean((prof as any)?.is_melosa));
      }
      if (!fullName) {
        const meta = userData.user?.user_metadata as Record<string, unknown> | undefined;
        if (typeof meta?.full_name === "string" && meta.full_name.trim()) fullName = meta.full_name.trim();
      }
      setDriverFullName(fullName || email);
    })().catch(() => {
      setDriverFullName("");
      setAuthUserId(null);
      setIsMelosaUser(false);
    });
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setMelosasCadastradas([]);
      return;
    }
    apiGet<{ equipamentos: { ativo: string; nome: string | null }[] }>(
      "/v1/equipamentos?tipo=MELOSA",
      session.access_token
    )
      .then((json) => setMelosasCadastradas(json.equipamentos ?? []))
      .catch(() => setMelosasCadastradas([]));
  }, [session?.access_token]);

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
    setFornecedorTexto("");
    setEquipamentoTexto("");
    setHorimetroHodometroTexto("");
    setHorimetroFotoUri(null);
    setNumeroLacreTanque("");
    setNumeroLacreMelosa("");
    setLacreTanqueFotoUri(null);
    setLacreMelosaFotoUri(null);
    setNumeroInicialMedidorTanque("");
    setNumeroFinalMedidorTanque("");
    setMedidorTanqueFotoInicialUri(null);
    setMedidorTanqueFotoFinalUri(null);
    setConfirmacaoAbastecimentoFotoUri(null);
    setTanqueNumero(1);
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
    setMelosaObraCodigo(OBRAS[0]?.codigo ?? 229);
    setMelosaPlacaTexto("");
    setMelosaFornecedorTexto("");
    setMelosaTanqueNumero(1);
    setMelosaRegKmText("");
    setMelosaRegLitrosText("");
    setMelosaRegCombustivelTipo("DIESEL_S10");
    setMelosaComprovanteFotoUri(null);
    setMelosaMedidorAcumuladoInicialNumero("");
    setMelosaMedidorAcumuladoInicialFotoUri(null);
    setMelosaNaoTenhoHorimetro(true);
    setMelosaHorimetroEquipamentoNumero("");
    setMelosaHorimetroEquipamentoFotoUri(null);
    setMelosaMotoristaEquipamentoTexto("");
    setMelosaEquipamentoOperadorFotoUri(null);
    setMelosaMedidorAcumuladoFinalNumero("");
    setMelosaMedidorAcumuladoFinalFotoUri(null);

    setMelosaWdrKmText("");
    setMelosaWdrLitrosText("");
    setMelosaWdrCombustivelTipo("DIESEL");
    setMelosaTanqueFotoUri(null);
    setLocalLatitude(null);
    setLocalLongitude(null);
    setLocalAddress(null);
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
    return m.includes("network request failed") || m.includes("failed to fetch") || m.includes("network error");
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto da CNH.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setCnhPhotoUri(asset.uri);
  }

  async function pickCnhPhotoFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto da CNH.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setCnhPhotoUri(asset.uri);
  }

  async function pickNotaFotoFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto da nota.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setNotaFotoUri(asset.uri);
  }

  async function pickNotaFotoFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto da nota.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setNotaFotoUri(asset.uri);
  }

  async function pickLacreTanqueFotoFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto do lacre do tanque.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setLacreTanqueFotoUri(asset.uri);
  }

  async function pickLacreTanqueFotoFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto do lacre do tanque.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setLacreTanqueFotoUri(asset.uri);
  }

  async function pickLacreMelosaFotoFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto do lacre da melosa.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setLacreMelosaFotoUri(asset.uri);
  }

  async function pickLacreMelosaFotoFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto do lacre da melosa.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setLacreMelosaFotoUri(asset.uri);
  }

  async function pickHorimetroFotoFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto do horímetro.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setHorimetroFotoUri(asset.uri);
  }

  async function pickHorimetroFotoFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto do horímetro.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setHorimetroFotoUri(asset.uri);
  }

  async function pickMedidorTanqueFotoInicialFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto inicial do medidor do tanque.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMedidorTanqueFotoInicialUri(asset.uri);
  }

  async function pickMedidorTanqueFotoInicialFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto inicial do medidor do tanque.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMedidorTanqueFotoInicialUri(asset.uri);
  }

  async function pickMedidorTanqueFotoFinalFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto final do medidor do tanque.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMedidorTanqueFotoFinalUri(asset.uri);
  }

  async function pickMedidorTanqueFotoFinalFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto final do medidor do tanque.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMedidorTanqueFotoFinalUri(asset.uri);
  }

  async function pickConfirmacaoAbastecimentoFotoFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto de confirmação do abastecimento.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setConfirmacaoAbastecimentoFotoUri(asset.uri);
  }

  async function pickConfirmacaoAbastecimentoFotoFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto de confirmação do abastecimento.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setConfirmacaoAbastecimentoFotoUri(asset.uri);
  }

  async function pickMelosaComprovanteFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto do comprovante.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaComprovanteFotoUri(asset.uri);
  }

  async function pickMelosaComprovanteFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto do comprovante.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaComprovanteFotoUri(asset.uri);
  }

  async function pickMelosaMedidorAcumuladoInicialFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto inicial acumulada do medidor da melosa.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaMedidorAcumuladoInicialFotoUri(asset.uri);
  }

  async function pickMelosaHorimetroEquipamentoFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto do horímetro do equipamento abastecido.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaHorimetroEquipamentoFotoUri(asset.uri);
  }

  async function pickMelosaHorimetroEquipamentoFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto do horímetro do equipamento abastecido.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaHorimetroEquipamentoFotoUri(asset.uri);
  }

  async function pickMelosaEquipamentoOperadorFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto do equipamento com o operador/motorista.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaEquipamentoOperadorFotoUri(asset.uri);
  }

  async function pickMelosaEquipamentoOperadorFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto do equipamento com o operador/motorista.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaEquipamentoOperadorFotoUri(asset.uri);
  }

  async function pickMelosaMedidorAcumuladoFinalFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto final acumulada do medidor da melosa.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaMedidorAcumuladoFinalFotoUri(asset.uri);
  }

  async function pickMelosaMedidorAcumuladoFinalFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto final acumulada do medidor da melosa.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaMedidorAcumuladoFinalFotoUri(asset.uri);
  }

  async function pickMelosaMedidorAcumuladoInicialFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto inicial acumulada do medidor da melosa.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaMedidorAcumuladoInicialFotoUri(asset.uri);
  }

  async function pickMelosaTanqueFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à galeria para enviar a foto do tanque.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaTanqueFotoUri(asset.uri);
  }

  async function pickMelosaTanqueFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão negada", "Habilite o acesso à câmera para tirar a foto do tanque.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setMelosaTanqueFotoUri(asset.uri);
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

      setMessage("Enviando foto da CNH...");
      const { error: uploadError } = await withTimeout(
        supabase.storage.from(CNH_BUCKET).upload(filePath, cnhBytes, {
          contentType: cnhContentType,
          upsert: false,
        }),
        30000,
        "Tempo limite no upload da foto da CNH."
      );
      if (uploadError && !String(uploadError.message ?? "").toLowerCase().includes("already exists")) {
        throw new Error(`Falha ao enviar foto da CNH: ${uploadError.message}`);
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
            `Falha de rede ao chamar /v1/auth/ensure-role na API (${env.API_URL?.trim() ?? "API_URL não configurada"}).`
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
      try {
        await supabase.auth.signOut();
      } catch (e: any) {
        Alert.alert("Sair", String(e?.message ?? e));
      }
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

  function continueRetiradaTanqueDados() {
    if (!placaTexto.trim()) {
      Alert.alert("Patrimônio obrigatório", "Selecione o patrimônio (melosa).");
      return;
    }
    if (!obraCombustivelTipo.trim()) {
      Alert.alert("Insumo obrigatório", "Selecione o tipo de insumo.");
      return;
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "detalhes" });
  }

  function continueRetiradaTanqueDetalhes() {
    if (!numeroLacreTanque.trim()) {
      Alert.alert("Lacre obrigatório", "Informe o número do lacre do tanque.");
      return;
    }
    if (!lacreTanqueFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto do lacre do tanque.");
      return;
    }
    if (!numeroLacreMelosa.trim()) {
      Alert.alert("Lacre obrigatório", "Informe o número do lacre da melosa.");
      return;
    }
    if (!lacreMelosaFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto do lacre da melosa.");
      return;
    }
    if (!isOnline) {
      Alert.alert("Requer internet", "Para enviar as fotos, você precisa estar online.");
      return;
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "medidor" });
  }

  function continueRetiradaTanqueMedidor() {
    if (!numeroInicialMedidorTanque.trim()) {
      Alert.alert("Medidor obrigatório", "Informe o número inicial do medidor do tanque.");
      return;
    }
    if (!medidorTanqueFotoInicialUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto inicial do medidor do tanque.");
      return;
    }
    setMessage(null);
    setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "confirmacao" });
  }

  function continueRetiradaTanqueConfirmacao() {
    if (!numeroFinalMedidorTanque.trim()) {
      Alert.alert("Medidor obrigatório", "Informe o número final do medidor do tanque.");
      return;
    }
    if (!medidorTanqueFotoFinalUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto final do medidor do tanque.");
      return;
    }
    if (!confirmacaoAbastecimentoFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto junto ao tanque.");
      return;
    }
    if (!isOnline) {
      Alert.alert("Requer internet", "Para enviar as fotos, você precisa estar online.");
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

      if (!isOnline) {
        Alert.alert("Requer internet", "Para enviar a foto da nota, você precisa estar online.");
        return;
      }
    }
    if (isRetiradaTanque) {
      if (!placaTexto.trim()) {
        Alert.alert("Patrimônio obrigatório", "Selecione o patrimônio (melosa).");
        return;
      }
      if (!obraCombustivelTipo.trim()) {
        Alert.alert("Insumo obrigatório", "Selecione o tipo de insumo.");
        return;
      }
      if (!numeroLacreTanque.trim() || !lacreTanqueFotoUri || !numeroLacreMelosa.trim() || !lacreMelosaFotoUri) {
        Alert.alert("Lacres obrigatórios", "Preencha os dados e fotos dos lacres para continuar.");
        return;
      }
      if (!numeroInicialMedidorTanque.trim()) {
        Alert.alert("Medidor obrigatório", "Informe o número inicial do medidor do tanque.");
        return;
      }
      if (!medidorTanqueFotoInicialUri) {
        Alert.alert("Foto obrigatória", "Selecione a foto inicial do medidor do tanque.");
        return;
      }
      if (!confirmacaoAbastecimentoFotoUri) {
        Alert.alert("Foto obrigatória", "Selecione a foto junto ao tanque.");
        return;
      }
      if (!numeroFinalMedidorTanque.trim()) {
        Alert.alert("Medidor obrigatório", "Informe o número final do medidor do tanque.");
        return;
      }
      if (!medidorTanqueFotoFinalUri) {
        Alert.alert("Foto obrigatória", "Selecione a foto final do medidor do tanque.");
        return;
      }
      const medidorInicialTanque = parseMelosaMedidorNumero(numeroInicialMedidorTanque);
      const medidorFinalTanque = parseMelosaMedidorNumero(numeroFinalMedidorTanque);
      if (medidorInicialTanque == null || medidorFinalTanque == null) {
        Alert.alert("Medidor inválido", "Informe números válidos no medidor inicial e final do tanque.");
        setBusy(false);
        return;
      }
      if (medidorFinalTanque <= medidorInicialTanque) {
        Alert.alert(
          "Medidor inválido",
          "O número final do medidor deve ser maior que o inicial (litros retirados = final − inicial)."
        );
        setBusy(false);
        return;
      }
      litros = medidorFinalTanque - medidorInicialTanque;
      if (!isOnline) {
        Alert.alert("Requer internet", "Para enviar fotos, você precisa estar online.");
        return;
      }
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
        Alert.alert("Local obrigatório", "Use “Obter localização”.");
        return;
      }
    }

    const operationId = uuidv4();

    let notaStoragePath: string | null = null;
    let lacreTanqueStoragePath: string | null = null;
    let lacreMelosaStoragePath: string | null = null;
    let medidorTanqueFotoInicialStoragePath: string | null = null;
    let medidorTanqueFotoFinalStoragePath: string | null = null;
    let confirmacaoAbastecimentoFotoStoragePath: string | null = null;
    let retiradaHorimetroFotoStoragePath: string | null = null;

    if (isEntradaTanqueObra) {
      const NOTA_BUCKET = "notas";
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Usuário não encontrado para upload da nota.");

      const { arrayBuffer: notaBytes, contentType: notaContentType } = await readImageUriAsArrayBuffer(notaFotoUri as string);
      const extMatch = String(notaFotoUri).match(/\.(\w+)(?:\?|#|$)/);
      const ext = (extMatch?.[1] ?? "jpg").toLowerCase();
      const safeExt = ext === "png" ? "png" : "jpg";
      const filePath = `${userId}/notas/${operationId}.${safeExt}`;

      await supabase.storage.from(NOTA_BUCKET).upload(filePath, notaBytes, {
        contentType: notaContentType,
        upsert: false,
      });

      notaStoragePath = filePath;
    }

    if (isRetiradaTanque) {
      const LACRE_TANQUE_BUCKET = "lacre_tanque";
      const LACRE_MELOSA_BUCKET = "lacre_melosa";
      const MEDIDOR_TANQUE_BUCKET = "medidor_tanque";
      const CONFIRMACAO_ABASTECIMENTO_BUCKET = "confirmacao_abastecimento";
      const RETIRADA_HORIMETRO_BUCKET = "retirada_horimetro";
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Usuário não encontrado para upload das fotos dos lacres.");

      function extFromUri(uri: string) {
        const extMatch = String(uri).match(/\.(\w+)(?:\?|#|$)/);
        const ext = (extMatch?.[1] ?? "jpg").toLowerCase();
        return ext === "png" ? "png" : "jpg";
      }

      const tanqueExt = extFromUri(lacreTanqueFotoUri as string);
      const melosaExt = extFromUri(lacreMelosaFotoUri as string);
      const medidorInicialExt = extFromUri(medidorTanqueFotoInicialUri as string);
      const medidorFinalExt = extFromUri(medidorTanqueFotoFinalUri as string);
      const confirmacaoExt = extFromUri(confirmacaoAbastecimentoFotoUri as string);
      const tanquePath = `${userId}/lacres/tanque/${operationId}.${tanqueExt}`;
      const melosaPath = `${userId}/lacres/melosa/${operationId}.${melosaExt}`;
      const medidorInicialPath = `${userId}/medidor/inicial/${operationId}.${medidorInicialExt}`;
      const medidorFinalPath = `${userId}/medidor/final/${operationId}.${medidorFinalExt}`;
      const confirmacaoPath = `${userId}/junto_tanque/${operationId}.${confirmacaoExt}`;

      const hasHorimetroFoto = !!horimetroFotoUri;
      let horimetroPath: string | null = null;
      let horimetroBytes: ArrayBuffer | null = null;
      let horimetroContentType: string | null = null;
      if (hasHorimetroFoto) {
        const horimetroExt = extFromUri(horimetroFotoUri as string);
        horimetroPath = `${userId}/horimetro/${operationId}.${horimetroExt}`;
        const tmp = await readImageUriAsArrayBuffer(horimetroFotoUri as string);
        horimetroBytes = tmp.arrayBuffer;
        horimetroContentType = tmp.contentType;
      }

      const { arrayBuffer: tanqueBytes, contentType: tanqueContentType } = await readImageUriAsArrayBuffer(lacreTanqueFotoUri as string);
      const { arrayBuffer: melosaBytes, contentType: melosaContentType } = await readImageUriAsArrayBuffer(lacreMelosaFotoUri as string);
      const { arrayBuffer: medidorInicialBytes, contentType: medidorInicialContentType } = await readImageUriAsArrayBuffer(
        medidorTanqueFotoInicialUri as string
      );
      const { arrayBuffer: medidorFinalBytes, contentType: medidorFinalContentType } = await readImageUriAsArrayBuffer(
        medidorTanqueFotoFinalUri as string
      );
      const { arrayBuffer: confirmacaoBytes, contentType: confirmacaoContentType } = await readImageUriAsArrayBuffer(
        confirmacaoAbastecimentoFotoUri as string
      );

      const uploads = [
        supabase.storage.from(LACRE_TANQUE_BUCKET).upload(tanquePath, tanqueBytes, {
          contentType: tanqueContentType,
          upsert: false,
        }),
        supabase.storage.from(LACRE_MELOSA_BUCKET).upload(melosaPath, melosaBytes, {
          contentType: melosaContentType,
          upsert: false,
        }),
        supabase.storage.from(MEDIDOR_TANQUE_BUCKET).upload(medidorInicialPath, medidorInicialBytes, {
          contentType: medidorInicialContentType,
          upsert: false,
        }),
        supabase.storage.from(MEDIDOR_TANQUE_BUCKET).upload(medidorFinalPath, medidorFinalBytes, {
          contentType: medidorFinalContentType,
          upsert: false,
        }),
        supabase.storage.from(CONFIRMACAO_ABASTECIMENTO_BUCKET).upload(confirmacaoPath, confirmacaoBytes, {
          contentType: confirmacaoContentType,
          upsert: false,
        }),
      ];

      if (hasHorimetroFoto && horimetroPath && horimetroBytes && horimetroContentType) {
        uploads.unshift(
          supabase.storage.from(RETIRADA_HORIMETRO_BUCKET).upload(horimetroPath, horimetroBytes, {
            contentType: horimetroContentType,
            upsert: false,
          }),
        );
      }

      await Promise.all(uploads);

      if (hasHorimetroFoto && horimetroPath) {
        retiradaHorimetroFotoStoragePath = horimetroPath;
      }
      lacreTanqueStoragePath = tanquePath;
      lacreMelosaStoragePath = melosaPath;
      medidorTanqueFotoInicialStoragePath = medidorInicialPath;
      medidorTanqueFotoFinalStoragePath = medidorFinalPath;
      confirmacaoAbastecimentoFotoStoragePath = confirmacaoPath;
    }

    const payload: MovimentacaoPayload = {
      operation_id: operationId,
      tipo: tipoAtual,
      obra_codigo: obraCodigo,
      data_hora: new Date().toISOString(),
      litros,
      tanque_texto: isRetiradaTanque
        ? horimetroHodometroTexto.trim() || null
        : tanqueTexto.trim()
          ? tanqueTexto.trim()
          : null,
      placa_texto: placaTexto.trim(),
      fornecedor_texto: isRetiradaTanque ? null : fornecedorTexto.trim(),
      tanque_numero: tanqueNumero,

      combustivel_tipo: isTanqueObra ? obraCombustivelTipo.trim() : null,
      nota_numero: isEntradaTanqueObra ? notaNumero.trim() : null,
      placa_caminhao: isEntradaTanqueObra ? placaTexto.trim() : null,
      valor_unitario: isEntradaTanqueObra ? parseDecimal(valorUnitarioText) : null,
      nota_storage_path: isEntradaTanqueObra ? notaStoragePath : null,
      lacre_tanque_numero: isRetiradaTanque ? numeroLacreTanque.trim() : null,
      lacre_tanque_storage_path: isRetiradaTanque ? lacreTanqueStoragePath : null,
      lacre_melosa_numero: isRetiradaTanque ? numeroLacreMelosa.trim() : null,
      lacre_melosa_storage_path: isRetiradaTanque ? lacreMelosaStoragePath : null,
      medidor_tanque_numero_inicial: isRetiradaTanque ? numeroInicialMedidorTanque.trim() : null,
      medidor_tanque_foto_inicial_storage_path: isRetiradaTanque ? medidorTanqueFotoInicialStoragePath : null,
      medidor_tanque_numero_final: isRetiradaTanque ? numeroFinalMedidorTanque.trim() : null,
      medidor_tanque_foto_final_storage_path: isRetiradaTanque ? medidorTanqueFotoFinalStoragePath : null,
      confirmacao_abastecimento_foto_storage_path: isRetiradaTanque ? confirmacaoAbastecimentoFotoStoragePath : null,
      retirada_horimetro_foto_storage_path: isRetiradaTanque ? retiradaHorimetroFotoStoragePath : null,

      local_latitude: localLatitude,
      local_longitude: localLongitude,
      local_address: localAddress,
      obs: obs.trim() ? obs.trim() : null,
    };

    enqueueOutbox(operationId, payload);
    setPending(outboxCount());
    setMessage("Registro salvo offline. Sincronizando se estiver online...");

    if (isOnline) {
      // Não bloqueia a UI no clique de salvar.
      void syncOutboxWithTokenRetry()
        .then((r) => {
          if (r.synced > 0) setMessage(`Sincronizado: ${r.synced} registro(s).`);
        })
        .catch((e: any) => {
          setMessage(`Registro salvo offline. Falha ao sincronizar: ${String(e?.message ?? e)}`);
        })
        .finally(() => {
          setPending(outboxCount());
        });
    }

      resetForm();
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
      Alert.alert("Ativo do Equipamento obrigatório", "Informe o Ativo do Equipamento.");
      return;
    }
    if (!melosaWdrCombustivelTipo.trim()) {
      Alert.alert("Insumo obrigatório", "Selecione o insumo (Diesel ou Gasolina).");
      return;
    }
    if (!melosaMedidorAcumuladoInicialNumero.trim()) {
      Alert.alert("Medidor obrigatório", "Informe o número inicial acumulado do medidor da melosa.");
      return;
    }
    if (!melosaMedidorAcumuladoInicialFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto inicial acumulada do medidor da melosa.");
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
    if (!melosaMedidorAcumuladoFinalNumero.trim()) {
      Alert.alert("Medidor obrigatório", "Informe o número final acumulado do medidor da melosa.");
      return;
    }
    if (!melosaMedidorAcumuladoFinalFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto final acumulada do medidor da melosa.");
      return;
    }
    const medidorInicial = parseMelosaMedidorNumero(melosaMedidorAcumuladoInicialNumero);
    const medidorFinal = parseMelosaMedidorNumero(melosaMedidorAcumuladoFinalNumero);
    if (medidorInicial == null || medidorFinal == null) {
      Alert.alert("Medidor inválido", "Informe números válidos no medidor inicial e final.");
      return;
    }
    if (medidorFinal <= medidorInicial) {
      Alert.alert(
        "Medidor inválido",
        "O número final deve ser maior que o inicial (litros abastecidos = final − inicial)."
      );
      return;
    }
    const litrosMelosa = medidorFinal - medidorInicial;
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

    if (!isOnline) {
      Alert.alert("Requer internet", "Para enviar as fotos, você precisa estar online.");
      return;
    }

    setBusy(true);
    try {
    const operationId = uuidv4();
    let userId: string | null = null;
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData.user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) throw new Error("Usuário não encontrado para upload das fotos.");

    const MELOSA_MEDIDOR_BUCKET = "melosa_medidor_acumulado";
    const MELOSA_HORIMETRO_BUCKET = "melosa_horimetro_equipamento_abastecido";
    const MELOSA_EQUIPAMENTO_OPERADOR_BUCKET = "melosa_equipamento_operador";
    function extFromUri(uri: string) {
      const extMatch = uri.match(/\.(\w+)(?:\?|#|$)/);
      const ext = (extMatch?.[1] ?? "jpg").toLowerCase();
      return ext === "png" ? "png" : "jpg";
    }

    async function uploadToBucket(bucket: string, path: string, uri: string, label: string) {
      const { arrayBuffer, contentType } = await readImageUriAsArrayBuffer(uri);
      const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
        contentType,
        upsert: true,
      });
      if (error) {
        const msg = String(error.message ?? error);
        const alreadyExists =
          msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("duplicate");
        if (!alreadyExists) {
          throw new Error(`Falha ao enviar ${label}: ${msg}`);
        }
      }
    }

    const extMedidor = extFromUri(melosaMedidorAcumuladoInicialFotoUri as string);
    const extOperador = extFromUri(melosaEquipamentoOperadorFotoUri as string);
    const extMedidorFinal = extFromUri(melosaMedidorAcumuladoFinalFotoUri as string);

    const medidorInicialPath = `${userId}/melosa/medidor/inicial/${operationId}.${extMedidor}`;
    const medidorFinalPath = `${userId}/melosa/medidor/final/${operationId}.${extMedidorFinal}`;
    const operadorPath = `${userId}/melosa/equipamento-operador/${operationId}.${extOperador}`;

    const incluirHorimetro = !melosaNaoTenhoHorimetro;
    const hasMelosaHorimetroFoto = incluirHorimetro && !!melosaHorimetroEquipamentoFotoUri;
    let horimetroPath: string | null = null;
    if (hasMelosaHorimetroFoto) {
      const extHorimetro = extFromUri(melosaHorimetroEquipamentoFotoUri as string);
      horimetroPath = `${userId}/melosa/horimetro/${operationId}.${extHorimetro}`;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      throw new Error("Sessão expirada. Faça login novamente antes de enviar as fotos.");
    }

    const uploads = [
      uploadToBucket(
        MELOSA_MEDIDOR_BUCKET,
        medidorInicialPath,
        melosaMedidorAcumuladoInicialFotoUri as string,
        "foto inicial do medidor da melosa"
      ),
      uploadToBucket(
        MELOSA_MEDIDOR_BUCKET,
        medidorFinalPath,
        melosaMedidorAcumuladoFinalFotoUri as string,
        "foto final do medidor da melosa"
      ),
      ...(hasMelosaHorimetroFoto && horimetroPath
        ? [
            uploadToBucket(
              MELOSA_HORIMETRO_BUCKET,
              horimetroPath,
              melosaHorimetroEquipamentoFotoUri as string,
              "foto do hodômetro"
            ),
          ]
        : []),
      uploadToBucket(
        MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
        operadorPath,
        melosaEquipamentoOperadorFotoUri as string,
        "foto do equipamento com operador/motorista"
      ),
    ];

    await Promise.all(uploads);

    const payload: MovimentacaoPayload = {
      operation_id: operationId,
      tipo: "RETIRADA_MELOSA",
      obra_codigo: melosaObraCodigo,
      data_hora: new Date().toISOString(),
      litros: litrosMelosa,
      placa_texto: melosaPlacaTexto.trim(),
      fornecedor_texto: melosaFornecedorTexto.trim(),
      melosa_categoria: null,
      tanque_numero: melosaTanqueNumero,

      melosa_km_registro: null,
      melosa_litros_registro: null,
      melosa_combustivel_tipo_registro: null,
      melosa_comprovante_storage_path: null,
      melosa_medidor_acumulado_inicial_numero: melosaMedidorAcumuladoInicialNumero.trim(),
      melosa_medidor_acumulado_inicial_storage_path: medidorInicialPath,
      melosa_horimetro_equipamento_abastecido_numero:
        incluirHorimetro && melosaHorimetroEquipamentoNumero.trim()
          ? melosaHorimetroEquipamentoNumero.trim()
          : null,
      melosa_horimetro_equipamento_abastecido_storage_path: incluirHorimetro ? horimetroPath ?? null : null,
      melosa_motorista_equipamento_abastecido: melosaMotoristaEquipamentoTexto.trim(),
      melosa_equipamento_operador_storage_path: operadorPath,
      melosa_lacre_numero: null,
      melosa_lacre_storage_path: null,
      melosa_medidor_acumulado_final_numero: melosaMedidorAcumuladoFinalNumero.trim(),
      melosa_medidor_acumulado_final_storage_path: medidorFinalPath,

      melosa_km_retirada: null,
      melosa_combustivel_tipo_retirada: melosaWdrCombustivelTipo.trim(),
      melosa_tanque_storage_path: null,

      local_latitude: gpsLatitude,
      local_longitude: gpsLongitude,
      local_address: gpsAddress,
      obs: null,
    };

    enqueueOutbox(operationId, payload);
    setPending(outboxCount());
    setMessage("Registro (melosa) salvo localmente. Sincronizando...");

    let syncedOk = false;
    try {
      const r = await syncOutboxWithTokenRetry();
      syncedOk = r.synced > 0;
      if (syncedOk) {
        setMessage(`Sincronizado: ${r.synced} registro(s).`);
      } else {
        throw new Error("O servidor não confirmou o registro. Tente sincronizar novamente na tela inicial.");
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setMessage(`Falha ao sincronizar: ${msg}`);
      Alert.alert(
        "Sincronização pendente",
        `As fotos foram enviadas, mas o servidor não gravou o registro completo.\n\n${msg}\n\nO registro ficou na fila local — use "Sincronizar pendentes" na tela inicial após atualizar a API.`
      );
      return;
    } finally {
      setPending(outboxCount());
    }

    resetMelosaFlow();
    setScreen({ name: "home" });
    } catch (e: any) {
      Alert.alert("Salvar falhou", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function continueMelosaRegister() {
    if (!melosaPlacaTexto.trim()) {
      Alert.alert("Ativo Melosa obrigatório", "Informe o Ativo Melosa.");
      return;
    }
    if (!melosaFornecedorTexto.trim()) {
      Alert.alert("Ativo do Equipamento obrigatório", "Informe o Ativo do Equipamento.");
      return;
    }

    setMessage(null);
    setScreen({ name: "melosa", step: "medidor_acumulado" });
  }

  function continueMelosaMedidorAcumulado() {
    if (!melosaWdrCombustivelTipo.trim()) {
      Alert.alert("Insumo obrigatório", "Selecione o insumo (Diesel ou Gasolina).");
      return;
    }
    if (!melosaMedidorAcumuladoInicialNumero.trim()) {
      Alert.alert("Medidor obrigatório", "Informe o número inicial acumulado do medidor da melosa.");
      return;
    }
    if (!melosaMedidorAcumuladoInicialFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto inicial acumulada do medidor da melosa.");
      return;
    }
    setMessage(null);
    setMelosaNaoTenhoHorimetro(true);
    setScreen({ name: "melosa", step: "horimetro" });
  }

  function continueMelosaHorimetro() {
    if (!melosaMotoristaEquipamentoTexto.trim()) {
      Alert.alert("Motorista obrigatório", "Informe o motorista do equipamento abastecido.");
      return;
    }
    if (!melosaEquipamentoOperadorFotoUri) {
      Alert.alert("Foto obrigatória", "Selecione a foto do equipamento junto com o operador/motorista.");
      return;
    }
    setMessage(null);
    setScreen({ name: "melosa", step: "lacre_medidor" });
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
              contentContainerStyle={styles.authScrollLogin}
              layoutKey="login"
              keyboardDismissMode="none"
            >
              <CardMeasuredWrap layout={layout} isDarkMode={isDarkMode} onBoundsChange={setCardBounds}>
                <View style={{ flexDirection: "column" }}>
                  <View style={styles.brandWrap}>
                  <Image
                    source={require("./assets/logo_compacto.png")}
                    style={[styles.brandLogo, layout.brandLogoSize]}
                    resizeMode="contain"
                  />
                    </View>

                <Text style={[styles.authTitle, !isDarkMode ? styles.authTitleLight : null]}>Entrar</Text>

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
            {themeToggleOverlay}
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
                Status: {isOnline ? "Online" : "Offline"} | Pendentes: {pending}
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
                  style={[
                    styles.homeActionCard,
                    styles.homeActionCardDisabled,
                    !isDarkMode ? styles.homeActionCardLight : null,
                    !isDarkMode ? styles.homeActionCardDisabledLight : null,
                  ]}
                  disabled
                  activeOpacity={1}
                >
                  <AdaptiveCardText
                    style={[styles.homeActionTitle, styles.homeActionTitleDisabled, { fontSize: layout.actionTitleFontSize }]}
                    lightStyle={styles.homeActionTitleDisabledLight}
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
          {themeToggleOverlay}
        </View>
      </SafeAreaView>
    );
  }

  if (screen.name === "melosa") {
    const melosaStep = screen.step;
    const isRegister = melosaStep === "register";
    const isMedidorAcumulado = melosaStep === "medidor_acumulado";
    const isHorimetro = melosaStep === "horimetro";
    const isLacreMedidor = melosaStep === "lacre_medidor";
    const melosaSubtitle = isRegister
      ? "Dados iniciais da retirada"
      : isMedidorAcumulado
        ? "Medidor da melosa"
        : isHorimetro
          ? "Horímetro, hodômetro e motorista"
          : "Dados finais da melosa";

    const melosaPrimaryAction = isRegister
      ? continueMelosaRegister
      : isMedidorAcumulado
        ? continueMelosaMedidorAcumulado
        : isHorimetro
          ? continueMelosaHorimetro
          : submitMelosaWithdraw;
    const melosaPrimaryLabel = isLacreMedidor ? (busy ? "Salvando..." : "Salvar") : "Próximo";

    function melosaVoltar() {
      setMessage(null);
      if (isMedidorAcumulado) setScreen({ name: "melosa", step: "register" });
      else if (isHorimetro) setScreen({ name: "melosa", step: "medidor_acumulado" });
      else if (isLacreMedidor) setScreen({ name: "melosa", step: "horimetro" });
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
            <FormScreenScroll layoutKey={melosaStep}>
              <CardMeasuredWrap
                layout={layout}
                isDarkMode={isDarkMode}
                onBoundsChange={setCardBounds}
                innerStyle={isLacreMedidor || isMedidorAcumulado || isHorimetro ? styles.glassInnerCompact : undefined}
              >
              <Text style={[styles.formTitle, !isDarkMode ? styles.formTitleLight : null]}>
                Retirada tanque melosa
              </Text>

              {isRegister ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Obra</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={melosaObraCodigo}
                      onValueChange={(v) => setMelosaObraCodigo(Number(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      {OBRAS.map((o) => (
                        <Picker.Item key={o.codigo} label={`${o.codigo} - ${o.nome}`} value={o.codigo} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Ativo Melosa</Text>
                  {melosasCadastradas.length > 0 ? (
                    <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                      <Picker
                        selectedValue={melosaPlacaTexto}
                        onValueChange={(v) => setMelosaPlacaTexto(String(v))}
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

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Ativo do Equipamento</Text>
                  <TextInput
                    value={melosaFornecedorTexto}
                    onChangeText={setMelosaFornecedorTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Patrimônio / identificação do equipamento"
                    placeholderTextColor={inputPlaceholderColor}
                    autoCapitalize="characters"
                  />
                </>
              ) : null}

              {isMedidorAcumulado ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Insumo</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={melosaWdrCombustivelTipo}
                      onValueChange={(v) => setMelosaWdrCombustivelTipo(String(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      <Picker.Item label="Diesel" value="DIESEL" />
                      <Picker.Item label="Gasolina" value="GASOLINA" />
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                    Número Inicial Acumulado do Medidor da Melosa
                  </Text>
                  <TextInput
                    value={melosaMedidorAcumuladoInicialNumero}
                    onChangeText={setMelosaMedidorAcumuladoInicialNumero}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 1542,3"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>
                    Foto Inicial Acumulado do Medidor da Melosa
                  </Text>
                  <View style={[styles.photoBox, styles.photoBoxCompact, !isDarkMode ? styles.photoBoxLight : null]}>
                    {melosaMedidorAcumuladoInicialFotoUri ? (
                      <>
                        <Image
                          source={{ uri: melosaMedidorAcumuladoInicialFotoUri }}
                          style={[styles.photoPreview, styles.photoPreviewCompact]}
                        />
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => setMelosaMedidorAcumuladoInicialFotoUri(null)}
                          disabled={busy}
                        >
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text
                        style={[styles.photoPlaceholder, styles.photoPlaceholderCompact, !isDarkMode ? styles.photoPlaceholderLight : null]}
                      >
                        Selecione a foto inicial acumulada do medidor da melosa
                      </Text>
                    )}
                  </View>
                  <View style={styles.photoActionRow}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaMedidorAcumuladoInicialFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaMedidorAcumuladoInicialFromCamera}
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
                  ) : null}

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

              {isLacreMedidor ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>
                    Número final do acumulado do medidor da melosa
                  </Text>
                  <TextInput
                    value={melosaMedidorAcumuladoFinalNumero}
                    onChangeText={setMelosaMedidorAcumuladoFinalNumero}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 5100"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />
                  <Text
                    style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}
                    adjustsFontSizeToFit
                    numberOfLines={2}
                    minimumFontScale={0.85}
                  >
                    Foto final acumulado do medidor da melosa
                  </Text>
                  <View style={[styles.photoBox, styles.photoBoxCompact, !isDarkMode ? styles.photoBoxLight : null]}>
                    {melosaMedidorAcumuladoFinalFotoUri ? (
                      <>
                        <Image
                          source={{ uri: melosaMedidorAcumuladoFinalFotoUri }}
                          style={[styles.photoPreview, styles.photoPreviewCompact]}
                        />
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => setMelosaMedidorAcumuladoFinalFotoUri(null)}
                          disabled={busy}
                        >
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text
                        style={[styles.photoPlaceholder, styles.photoPlaceholderCompact, !isDarkMode ? styles.photoPlaceholderLight : null]}
                      >
                        Selecione a foto final acumulada do medidor da melosa
                      </Text>
                    )}
                  </View>
                  <View style={styles.photoActionRow}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaMedidorAcumuladoFinalFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMelosaMedidorAcumuladoFinalFromCamera}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isLacreMedidor && !isOnline ? (
                <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null, { marginTop: 10 }]}>
                  Você está offline. Para enviar fotos, precisa estar online.
                </Text>
              ) : null}

              {message ? <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>{message}</Text> : null}
              </CardMeasuredWrap>
            </FormScreenScroll>
            {melosaActionFooter}
            {themeToggleOverlay}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isTanqueObra = tipoAtual === "ENTRADA_TANQUE_OBRA" || tipoAtual === "RETIRADA_TANQUE";
  if (isTanqueObra) {
    const isEntradaTanqueObra = tipoAtual === "ENTRADA_TANQUE_OBRA";
    const isRetiradaTanque = tipoAtual === "RETIRADA_TANQUE";
    const retiradaStep =
      screen.name === "form" && screen.tipo === "RETIRADA_TANQUE" ? (screen.retiradaStep ?? "dados") : "dados";
    const isRetiradaDados = isRetiradaTanque && retiradaStep === "dados";
    const isRetiradaDetalhes = isRetiradaTanque && retiradaStep === "detalhes";
    const isRetiradaMedidor = isRetiradaTanque && retiradaStep === "medidor";
    const isRetiradaConfirmacao = isRetiradaTanque && retiradaStep === "confirmacao";
    const title = isEntradaTanqueObra ? "Entrada no tanque da obra" : "Retirada do tanque";
    const subtitle = isRetiradaDados
      ? "Dados da retirada"
      : isRetiradaDetalhes
        ? "Lacres"
        : isRetiradaMedidor
          ? "Medidor do tanque"
          : isRetiradaConfirmacao
            ? "Medidor final e foto"
        : title;

    const tanqueActionFooter = (
      <FormActionFooter isDarkMode={isDarkMode}>
        <View style={styles.formActionRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, !isDarkMode ? styles.secondaryButtonLight : null, { flex: 1 }]}
            onPress={() => {
              setBusy(false);
              setMessage(null);
              if (isRetiradaConfirmacao) {
                setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "medidor" });
                return;
              }
              if (isRetiradaMedidor) {
                setScreen({ name: "form", tipo: "RETIRADA_TANQUE", retiradaStep: "detalhes" });
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
              {isRetiradaDetalhes || isRetiradaMedidor || isRetiradaConfirmacao ? "Voltar" : "Cancelar"}
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
          ) : isRetiradaMedidor ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueRetiradaTanqueMedidor}
            >
              <Text style={styles.primaryButtonText}>Próximo</Text>
            </TouchableOpacity>
          ) : isRetiradaConfirmacao ? (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              onPress={continueRetiradaTanqueConfirmacao}
            >
              <Text style={styles.primaryButtonText}>{busy ? "Salvando..." : "Salvar"}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, !isDarkMode ? styles.primaryButtonLight : null, styles.formFooterPrimary, busy || (isEntradaTanqueObra && !isOnline) ? { opacity: 0.7 } : null]}
              disabled={busy || (isEntradaTanqueObra && !isOnline)}
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
            <FormScreenScroll>
              <CardMeasuredWrap layout={layout} isDarkMode={isDarkMode} onBoundsChange={setCardBounds}>
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
                      {OBRAS.map((o) => (
                        <Picker.Item key={o.codigo} label={`${o.codigo} - ${o.nome}`} value={o.codigo} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Tanque</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={tanqueNumero}
                      onValueChange={(v) => setTanqueNumero(Number(v) === 2 ? 2 : 1)}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      <Picker.Item label="Tanque 1" value={1} />
                      <Picker.Item label="Tanque 2" value={2} />
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Insumo</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={obraCombustivelTipo}
                      onValueChange={(v) => setObraCombustivelTipo(String(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      <Picker.Item label="Diesel/S10 Aditivado" value="DIESEL_S10" />
                      <Picker.Item label="Gasolina" value="GASOLINA" />
                      <Picker.Item label="Álcool" value="ALCOOL" />
                    </Picker>
                  </View>

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

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Horímetro</Text>
                  <TextInput
                    value={horimetroHodometroTexto}
                    onChangeText={setHorimetroHodometroTexto}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Ex.: 1542,3 h"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>Foto do horímetro</Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {horimetroFotoUri ? (
                      <>
                        <Image source={{ uri: horimetroFotoUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setHorimetroFotoUri(null)} disabled={busy}>
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione a foto do horímetro
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickHorimetroFotoFromLibrary} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]} onPress={pickHorimetroFotoFromCamera} disabled={busy}>
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isEntradaTanqueObra ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Motorista (usuário)</Text>
                  <TextInput
                    value={driverFullName || "—"}
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
                      {OBRAS.map((o) => (
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
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={tanqueNumero}
                      onValueChange={(v) => setTanqueNumero(Number(v) === 2 ? 2 : 1)}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      <Picker.Item label="Tanque 1" value={1} />
                      <Picker.Item label="Tanque 2" value={2} />
                    </Picker>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null]}>Insumo</Text>
                  <View style={[styles.pickerShell, !isDarkMode ? styles.pickerShellLight : null]}>
                    <Picker
                      selectedValue={obraCombustivelTipo}
                      onValueChange={(v) => setObraCombustivelTipo(String(v))}
                      style={[styles.picker, !isDarkMode ? styles.pickerLight : null]}
                    >
                      <Picker.Item label="Diesel/S10 Aditivado" value="DIESEL_S10" />
                      <Picker.Item label="Gasolina" value="GASOLINA" />
                      <Picker.Item label="Álcool" value="ALCOOL" />
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

              {isRetiradaMedidor ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>Número Inicial do Medidor do Tanque</Text>
                  <TextInput
                    value={numeroInicialMedidorTanque}
                    onChangeText={setNumeroInicialMedidorTanque}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Informe o número inicial do medidor"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>Foto Inicial do Medidor do Tanque</Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {medidorTanqueFotoInicialUri ? (
                      <>
                        <Image source={{ uri: medidorTanqueFotoInicialUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setMedidorTanqueFotoInicialUri(null)} disabled={busy}>
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione a foto inicial do medidor do tanque
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMedidorTanqueFotoInicialFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMedidorTanqueFotoInicialFromCamera}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isRetiradaConfirmacao ? (
                <>
                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 4 }]}>Número Final do Medidor do Tanque</Text>
                  <TextInput
                    value={numeroFinalMedidorTanque}
                    onChangeText={setNumeroFinalMedidorTanque}
                    style={[styles.authInput, !isDarkMode ? styles.authInputLight : null]}
                    placeholder="Informe o número final do medidor"
                    placeholderTextColor={inputPlaceholderColor}
                    keyboardType="decimal-pad"
                  />

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 8 }]}>Foto Final do Medidor do Tanque</Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {medidorTanqueFotoFinalUri ? (
                      <>
                        <Image source={{ uri: medidorTanqueFotoFinalUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setMedidorTanqueFotoFinalUri(null)} disabled={busy}>
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione a foto final do medidor do tanque
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMedidorTanqueFotoFinalFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickMedidorTanqueFotoFinalFromCamera}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.label, !isDarkMode ? styles.labelLight : null, { marginTop: 10 }]}>Foto junto ao tanque</Text>
                  <View style={[styles.photoBox, !isDarkMode ? styles.photoBoxLight : null]}>
                    {confirmacaoAbastecimentoFotoUri ? (
                      <>
                        <Image source={{ uri: confirmacaoAbastecimentoFotoUri }} style={styles.photoPreviewFull} />
                        <TouchableOpacity style={styles.photoRemove} onPress={() => setConfirmacaoAbastecimentoFotoUri(null)} disabled={busy}>
                          <Text style={styles.photoRemoveText}>Remover</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <Text style={[styles.photoPlaceholder, !isDarkMode ? styles.photoPlaceholderLight : null]}>
                        Selecione a foto junto ao tanque
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickConfirmacaoAbastecimentoFotoFromLibrary}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Galeria</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ghostButton, !isDarkMode ? styles.ghostButtonLight : null]}
                      onPress={pickConfirmacaoAbastecimentoFotoFromCamera}
                      disabled={busy}
                    >
                      <Text style={[styles.ghostButtonText, !isDarkMode ? styles.ghostButtonTextLight : null]}>Câmera</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {isEntradaTanqueObra ? (
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

              {isEntradaTanqueObra ? (
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

              {isEntradaTanqueObra ? (
                <GpsLocationBlock
                  isDarkMode={isDarkMode}
                  busy={busy}
                  label="Local (GPS)"
                  localLatitude={localLatitude}
                  localLongitude={localLongitude}
                  localAddress={localAddress}
                  onCapture={safeCaptureLocationAndAddress}
                />
              ) : null}

              {isEntradaTanqueObra ? (
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

              {isEntradaTanqueObra ? (
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

              {isEntradaTanqueObra && !isOnline ? (
                <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>
                  Você está offline. Para enviar foto da nota, precisa estar online.
                </Text>
              ) : null}

              {message ? <Text style={[styles.authMessage, !isDarkMode ? styles.authMessageLight : null]}>{message}</Text> : null}
              </CardMeasuredWrap>
            </FormScreenScroll>
            {tanqueActionFooter}
            {themeToggleOverlay}
          </View>
        </SafeAreaView>
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
          {OBRAS.map((o) => {
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
              busy={busy}
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
          {themeToggleOverlay}
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
    paddingBottom: 16,
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
    paddingBottom: 120,
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
});
