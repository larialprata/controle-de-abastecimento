const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const apiRoot = path.join(__dirname, "..");
const marker = path.join(apiRoot, "node_modules", "source-map-support", "source-map-support.js");

if (!fs.existsSync(marker)) {
  console.log("[api] Instalando dependências locais (source-map-support / ts-node-dev)...");
  execSync("npm install --no-workspaces", {
    cwd: apiRoot,
    stdio: "inherit",
  });
}
