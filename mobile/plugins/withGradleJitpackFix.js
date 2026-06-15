const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const MARKER = "includeGroupByRegex \"com\\\\.github.*\"";

const JITPACK_BLOCK = `maven {
      url 'https://jitpack.io'
      content {
        includeGroupByRegex "com\\\\.github.*"
      }
    }`;

const RESOLUTION_PATCH = `

// Evita resolver org.bouncycastle via JitPack (expo-updates); usa Maven Central.
subprojects { sub ->
  sub.configurations.configureEach {
    resolutionStrategy {
      force 'org.bouncycastle:bcprov-jdk15to18:1.81'
      force 'org.bouncycastle:bcutil-jdk15to18:1.81'
    }
  }
}
`;

function withGradleJitpackFix(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const buildGradle = path.join(cfg.modRequest.platformProjectRoot, "build.gradle");
      if (!fs.existsSync(buildGradle)) {
        return cfg;
      }

      let contents = fs.readFileSync(buildGradle, "utf8");

      if (!contents.includes(MARKER)) {
        contents = contents.replace(
          /maven\s*\{\s*url\s*['"]https?:\/\/(www\.)?jitpack\.io['"]\s*\}/g,
          JITPACK_BLOCK,
        );
      }

      if (!contents.includes("bcprov-jdk15to18:1.81")) {
        contents += RESOLUTION_PATCH;
      }

      fs.writeFileSync(buildGradle, contents, { encoding: "utf8" });
      return cfg;
    },
  ]);
}

module.exports = withGradleJitpackFix;
