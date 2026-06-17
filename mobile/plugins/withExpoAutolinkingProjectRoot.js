const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const SNIPPET = `

expoAutolinking {
  projectRoot = settings.rootDir.parentFile
  searchPaths = ["../node_modules"]
}
`;

function withExpoAutolinkingProjectRoot(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const settingsPath = path.join(
        cfg.modRequest.platformProjectRoot,
        "settings.gradle"
      );
      if (!fs.existsSync(settingsPath)) {
        return cfg;
      }
      let contents = fs.readFileSync(settingsPath, "utf8");
      if (contents.includes("projectRoot = settings.rootDir.parentFile")) {
        return cfg;
      }
      const anchor = /id\("expo-autolinking-settings"\)\s*\n\}/;
      if (!anchor.test(contents)) {
        return cfg;
      }
      contents = contents.replace(anchor, (m) => `${m}${SNIPPET}`);
      fs.writeFileSync(settingsPath, contents, { encoding: "utf8" });
      return cfg;
    },
  ]);
}

module.exports = withExpoAutolinkingProjectRoot;
