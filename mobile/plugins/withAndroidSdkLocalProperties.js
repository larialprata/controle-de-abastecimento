const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

function defaultAndroidSdkDir() {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT;
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "Android", "Sdk");
  }
  if (process.platform === "darwin" && process.env.HOME) {
    return path.join(process.env.HOME, "Library", "Android", "sdk");
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, "Android", "Sdk");
  }
  return "";
}

function withAndroidSdkLocalProperties(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const sdkDir = path.normalize(defaultAndroidSdkDir());
      if (!sdkDir) {
        return cfg;
      }
      const line = `sdk.dir=${sdkDir.split(path.sep).join("/")}\n`;
      fs.writeFileSync(path.join(projectRoot, "local.properties"), line, {
        encoding: "utf8",
      });
      return cfg;
    },
  ]);
}

module.exports = withAndroidSdkLocalProperties;
