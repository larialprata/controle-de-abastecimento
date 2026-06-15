const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const MARKER = "REACT_NATIVE_NODE_MODULES_DIR";

const PATCH = `

// Monorepo (npm workspaces): react-native pode estar em ../../node_modules
def resolveReactNativeNodeModulesDir = {
  def candidates = [
    new File(rootDir, "../node_modules/react-native"),
    new File(rootDir, "../../node_modules/react-native"),
  ]
  for (def dir : candidates) {
    if (dir.exists()) {
      return dir.absolutePath
    }
  }
  return null
}
def reactNativeNodeModulesDir = resolveReactNativeNodeModulesDir()
if (reactNativeNodeModulesDir != null) {
  ext.REACT_NATIVE_NODE_MODULES_DIR = reactNativeNodeModulesDir
}
`;

function withReactNativeMonorepoGradle(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const buildGradle = path.join(cfg.modRequest.platformProjectRoot, "build.gradle");
      if (!fs.existsSync(buildGradle)) {
        return cfg;
      }
      let contents = fs.readFileSync(buildGradle, "utf8");
      if (contents.includes(MARKER)) {
        return cfg;
      }
      const anchor = 'apply plugin: "com.facebook.react.rootproject"';
      if (!contents.includes(anchor)) {
        return cfg;
      }
      contents = contents.replace(anchor, anchor + PATCH);
      fs.writeFileSync(buildGradle, contents, { encoding: "utf8" });
      return cfg;
    },
  ]);
}

module.exports = withReactNativeMonorepoGradle;
