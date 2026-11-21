import fs from "fs/promises";
import path from "path";

const EXTENSION_ID = "Urin.vscode-web-visual-editor";
const MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${EXTENSION_ID}`;
const CACHE_PATH = "stats/web-visual-editor/marketplace.json";
const BADGE_PATH = "badges/web-visual-editor-installs.json";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJSON(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

async function writeJSON(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

function formatCompact(n) {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "k";
  }
  return String(n);
}

async function fetchInstallCount() {
  const previous = (await exists(CACHE_PATH)) ? await readJSON(CACHE_PATH) : null;

  try {
    const res = await fetch(MARKETPLACE_URL);
    if (!res.ok) {
      throw new Error(`marketplace ${res.status}`);
    }

    const html = await res.text();
    const match = html.match(/([\d,]+)\s+installs/i);

    if (!match) {
      throw new Error("install count not found");
    }

    const installs = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(installs)) {
      throw new Error("invalid install count");
    }

    await writeJSON(CACHE_PATH, {
      extensionId: EXTENSION_ID,
      installs,
      source: MARKETPLACE_URL,
      updatedAt: new Date().toISOString(),
    });

    return installs;
  } catch (err) {
    console.warn("Marketplace fallback");
    if (previous?.installs != null) {
      return previous.installs;
    }
    throw err;
  }
}

async function main() {
  const installs = await fetchInstallCount();

  await writeJSON(BADGE_PATH, {
    schemaVersion: 1,
    label: "installs",
    message: formatCompact(installs),
    color: "cornflowerblue",
  });

  console.log("Web Visual Editor installs:", installs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
