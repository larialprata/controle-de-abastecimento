# Build Android no Windows

Guia para compilar o app mobile (`mobile/`) em máquinas Windows com caminhos longos ou pouca memória no Gradle.

## Caminho longo

O CMake usa o caminho **real** (`C:\Users\...\Desktop\...`), mesmo com `subst Z:`. Copie o repositório para um caminho curto:

```powershell
cd mobile
npm run android:setup-win
cd C:\abast\controle-abast\mobile
npx expo run:android -- -PreactNativeArchitectures=arm64-v8a
```

Ou: `npm run android:win` (depois do `android:setup-win`).

Copie também os `.env` para `C:\abast\controle-abast\...` (api, web, mobile).

## Memória (`OutOfMemoryError: Metaspace`)

`android/gradle.properties` já aumenta heap/metaspace. Se ainda falhar, feche o Android Studio e rode:

```powershell
cd C:\abast\controle-abast\mobile\android
.\gradlew.bat --stop
```

## Emulador x86

Use `-PreactNativeArchitectures=x86_64` em vez de `arm64-v8a`.
