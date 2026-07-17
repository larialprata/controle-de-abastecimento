import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { persistCapturedPhoto } from "../sync/offlineMedia";

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: false,
  // Qualidade menor reduz memória e a chance do Android matar o app na câmera
  quality: 0.55,
  exif: false,
};

async function ensureCameraPermission(deniedMessage: string): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;

  const asked = await ImagePicker.requestCameraPermissionsAsync();
  if (asked.granted) return true;

  Alert.alert("Permissão negada", deniedMessage);
  return false;
}

async function ensureLibraryPermission(deniedMessage: string): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;

  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (asked.granted) return true;

  Alert.alert("Permissão negada", deniedMessage);
  return false;
}

async function hardenPickedUri(uri: string | null | undefined): Promise<string | null> {
  if (!uri) return null;
  try {
    return await persistCapturedPhoto(uri);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    Alert.alert(
      "Foto",
      `A foto foi tirada, mas não deu para guardar no celular. Tente de novo.\n\n${msg}`,
    );
    return null;
  }
}

/**
 * Abre a câmera com opções mais leves e tratamento de erro.
 * Em alguns Androids a permissão “já concedida” trava; um pequeno delay ajuda.
 * A foto é copiada para o armazenamento interno do app (funciona offline).
 */
export async function pickImageFromCamera(deniedMessage: string): Promise<string | null> {
  try {
    const ok = await ensureCameraPermission(deniedMessage);
    if (!ok) return null;

    if (Platform.OS === "android") {
      await new Promise((r) => setTimeout(r, 250));
    }

    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (result.canceled) return null;
    return hardenPickedUri(result.assets?.[0]?.uri);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    Alert.alert(
      "Câmera",
      `Não foi possível abrir a câmera. Tente de novo ou use a galeria.\n\n${msg}`,
    );
    return null;
  }
}

export async function pickImageFromLibrary(deniedMessage: string): Promise<string | null> {
  try {
    const ok = await ensureLibraryPermission(deniedMessage);
    if (!ok) return null;

    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (result.canceled) return null;
    return hardenPickedUri(result.assets?.[0]?.uri);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    Alert.alert("Galeria", `Não foi possível abrir a galeria.\n\n${msg}`);
    return null;
  }
}
