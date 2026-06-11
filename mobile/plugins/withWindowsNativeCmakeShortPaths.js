const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const MARKER = "CMAKE_OBJECT_PATH_MAX=128";

const PATCH = `

// Windows: CMake usa nomes de objeto curtos (hash) — evita MAX_PATH / Ninja com pastas profundas.
if (org.gradle.internal.os.OperatingSystem.current().isWindows()) {
  def patchWindowsCmake = { Project sub ->
    try {
      if (!sub.plugins.hasPlugin("com.android.library") && !sub.plugins.hasPlugin("com.android.application")) {
        return
      }
      def android = sub.extensions.findByName("android")
      if (android == null) return
      def cmake = android.defaultConfig.externalNativeBuild.cmake
      if (cmake == null) return
      if (cmake.arguments.any { it != null && it.toString().contains("CMAKE_OBJECT_PATH_MAX") }) return
      cmake.arguments.add("-DCMAKE_OBJECT_PATH_MAX=128")
    } catch (Throwable ignored) {
    }
  }
  gradle.afterProject { Project sub ->
    if (sub == sub.rootProject) return
    patchWindowsCmake(sub)
  }
}
`;

function withWindowsNativeCmakeShortPaths(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const buildGradle = path.join(
        cfg.modRequest.platformProjectRoot,
        "build.gradle"
      );
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

module.exports = withWindowsNativeCmakeShortPaths;
