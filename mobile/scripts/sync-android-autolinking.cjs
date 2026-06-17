/**
 * Gera android/build/generated/autolinking/autolinking.json com o comando Expo
 * (necessário no monorepo npm workspaces — o @react-native-community/cli config
 * não enxerga os pacotes nativos hoisted na raiz).
 */
const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const mobileRoot = path.join(__dirname, "..");
const androidDir = path.join(mobileRoot, "android");
const outDir = path.join(androidDir, "build", "generated", "autolinking");
const outFile = path.join(outDir, "autolinking.json");

const cmd = [
  "node",
  "--no-warnings",
  "--eval",
  "require('expo/bin/autolinking')",
  "expo-modules-autolinking",
  "react-native-config",
  "--platform",
  "android",
  "--json",
  "--project-root",
  mobileRoot,
  "--source-dir",
  androidDir,
];

const raw = execSync(cmd.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(" "), {
  cwd: mobileRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

const jsonLine = raw.split(/\r?\n/).filter((line) => line.startsWith("{")).pop();
if (!jsonLine) {
  throw new Error("Falha ao gerar autolinking.json: saída vazia.");
}

const config = JSON.parse(jsonLine);
if (!config.project?.android?.packageName) {
  throw new Error("autolinking.json sem project.android.packageName.");
}
if (!config.dependencies?.["@react-native-community/netinfo"]) {
  throw new Error("@react-native-community/netinfo não encontrado no autolinking.");
}
if (!config.dependencies?.["react-native-webview"]) {
  throw new Error("react-native-webview não encontrado no autolinking.");
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(config));

const lockFiles = ["package.json", "package-lock.json", "react-native.config.js"];
for (const name of lockFiles) {
  const file = path.join(mobileRoot, name);
  if (!fs.existsSync(file)) continue;
  const sha = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  fs.writeFileSync(path.join(outDir, `${name}.sha`), sha);
}

console.log(
  "autolinking.json OK:",
  Object.keys(config.dependencies).join(", "),
);
