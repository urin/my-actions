import fs from "fs/promises";
import path from "path";

const NPM_PACKAGE = "qrono";
const GH_OWNER = "urin";
const GH_REPO = "qrono";
const NPM_API_START = "2015-01-10";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

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

async function fetchNpmYear(year) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const cachePath = `stats/npm/${year}.json`;

  if (year !== currentYear && (await exists(cachePath))) {
    return (await readJSON(cachePath)).downloads;
  }

  const start = year === 2015 ? NPM_API_START : `${year}-01-01`;

  const end =
    year === currentYear ? now.toISOString().split("T")[0] : `${year}-12-31`;

  try {
    const url = `https://api.npmjs.org/downloads/point/${start}:${end}/${NPM_PACKAGE}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`npm ${res.status}`);

    const data = await res.json();
    const downloads = data.downloads || 0;

    await writeJSON(cachePath, {
      year,
      downloads,
      updatedAt: new Date().toISOString(),
    });

    return downloads;
  } catch (err) {
    console.warn(`npm ${year} fallback`);
    if (await exists(cachePath)) {
      return (await readJSON(cachePath)).downloads;
    }
    throw err;
  }
}

async function getNpmTotal() {
  const now = new Date();
  const currentYear = now.getFullYear();

  let total = 0;
  for (let year = 2015; year <= currentYear; year++) {
    total += await fetchNpmYear(year);
  }
  return total;
}

async function getGitHubTotal() {
  const cachePath = "stats/github.json";
  let previous = null;

  if (await exists(cachePath)) {
    previous = await readJSON(cachePath);
  }

  const headers = {
    Accept: "application/vnd.github+json",
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  if (previous?.etag) {
    headers["If-None-Match"] = previous.etag;
  }

  try {
    let url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases?per_page=100`;

    let total = 0;
    let etag = null;

    while (url) {
      const res = await fetch(url, { headers });

      if (res.status === 304 && previous) {
        return previous.downloads;
      }

      if (!res.ok) throw new Error(`gh ${res.status}`);

      etag = res.headers.get("etag");
      const releases = await res.json();

      for (const release of releases) {
        for (const asset of release.assets || []) {
          total += asset.download_count || 0;
        }
      }

      const link = res.headers.get("link");
      const match = link?.match(/<([^>]+)>;\s*rel="next"/);
      url = match ? match[1] : null;
    }

    await writeJSON(cachePath, {
      downloads: total,
      etag,
      updatedAt: new Date().toISOString(),
    });

    return total;
  } catch (err) {
    console.warn("GitHub fallback");
    if (previous) return previous.downloads;
    throw err;
  }
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

/* =========================
   Main
========================= */

async function main() {
  const npmTotal = await getNpmTotal();
  const ghTotal = await getGitHubTotal();

  const total = npmTotal + ghTotal;

  const badge = {
    schemaVersion: 1,
    label: "downloads",
    message: formatCompact(total),
    color: "cornflowerblue",
  };

  await writeJSON("badges/downloads.json", badge);

  console.log("Total:", total);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
