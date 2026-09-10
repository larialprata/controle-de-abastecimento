/**
 * Gradle 9 removeu JvmVendorSpec.IBM_SEMERU.
 * O @react-native/gradle-plugin ainda pinava foojay-resolver 0.5.0 (incompatível).
 * Garante 1.0.0 antes do build Android no Windows.
 */
const fs = require("fs");
const path = require("path");

const settings = path.join(
  __dirname,
  "..",
  "node_modules",
  "@react-native",
  "gradle-plugin",
  "settings.gradle.kts",
);

if (!fs.existsSync(settings)) {
  process.exit(0);
}

const src = fs.readFileSync(settings, "utf8");
const next = src.replace(
  /id\("org\.gradle\.toolchains\.foojay-resolver-convention"\)\.version\("0\.5\.0"\)/,
  'id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")',
);

if (next !== src) {
  fs.writeFileSync(settings, next);
  console.log("foojay-resolver-convention: 0.5.0 -> 1.0.0");
}
