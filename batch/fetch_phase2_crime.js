/**
 * Phase 2: 警察庁犯罪オープンデータ CSVから実犯罪データを生成
 * 対象: 大阪府・神奈川県・愛知県・千葉県・埼玉県・兵庫県・福岡県・静岡県
 *
 * 入力: public/choropleth.geojson (市区町村ポリゴン、重心座標算出用)
 *       public/crime_mock.geojson (既存モックデータ、Phase 2は上書き)
 * 出力: public/crime_mock.geojson (Phase 2実データに更新)
 *
 * CSV形式 (警察庁標準):
 *   罪名,手口,管轄警察署,管轄交番・駐在所,市区町村コード,都道府県,市区町村,町丁目,...
 *   各行 = 1件の犯罪発生記録
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const zlib  = require('zlib');

// ---- 対象府県の定義 ----
const CRIME_TYPES = [
  'hittakuri', 'syazyounerai', 'buhinnerai', 'zidouhanbaikinerai',
  'zidousyatou', 'ootobaitou', 'zitensyatou',
];

const PREFECTURES = [
  {
    name: '大阪府',
    urlFn: (type) => `https://www.police.pref.osaka.lg.jp/material/files/group/2/osaka_2024${type}.csv`,
  },
  {
    name: '神奈川県',
    urlFn: (type) => `https://www.police.pref.kanagawa.jp/assets/entry/kanagawa_2024${type}.csv`,
  },
  {
    name: '愛知県',
    urlFn: (type) => `https://www.pref.aichi.jp/police/anzen/toukei/opendata/seian-s/images/aichi-2024${type}.csv`,
  },
  {
    name: '千葉県',
    urlFn: (type) => {
      const IDS = {
        hittakuri:            '000066997',
        syazyounerai:         '000066998',
        buhinnerai:           '000066999',
        zidouhanbaikinerai:   '000067000',
        zidousyatou:          '000067001',
        ootobaitou:           '000067002',
        zitensyatou:          '000067003',
      };
      return `https://www.police.pref.chiba.jp/content/common/${IDS[type]}.csv`;
    },
  },
  {
    name: '埼玉県',
    urlFn: (type) => `https://www.police.pref.saitama.lg.jp/documents/33251/saitama_2024${type}.csv`,
  },
  {
    name: '兵庫県',
    urlFn: (type) => {
      // buhinnerai のみファイル名にタイポ（hyogp）
      const prefix = type === 'buhinnerai' ? 'hyogp' : 'hyogo';
      return `https://web.pref.hyogo.lg.jp/kk26/johoseisaku/documents/${prefix}_2024${type}.csv`;
    },
  },
  {
    name: '福岡県',
    urlFn: (type) => {
      // BODIK プラットフォーム経由（リソースIDが型ごとに異なる）
      const RESOURCE_IDS = {
        hittakuri:            'a3922e4a-5fd1-428d-bbb4-1ebe1a2c85f8',
        syazyounerai:         '905967a8-6908-4bce-b1f9-c73dc7b6ce7d',
        buhinnerai:           '0b7da485-d31c-4b40-8cb4-924a5017cb10',
        zidouhanbaikinerai:   'd547241c-f81b-49a3-9363-df4d7452b852',
        zidousyatou:          'c6efe39e-4d3d-42f7-9bb9-b37462142edb',
        ootobaitou:           'b92c2b2f-502e-4618-999a-c5704768ad4e',
        zitensyatou:          '3357a675-7deb-4955-9840-13a57d4b7c9d',
      };
      const rid = RESOURCE_IDS[type];
      return `https://data.bodik.jp/dataset/c86326fe-655b-4eb0-a0fe-e29f163f31aa/resource/${rid}/download/fukuoka_2024${type}.csv`;
    },
  },
  {
    name: '静岡県',
    urlFn: (type) => {
      // 静岡はアンダースコア区切り＋syazyounerai→syazyonerai（uなし）
      // 2024年ファイルが404の場合は2023年にフォールバック（呼び出し側で処理）
      const typeMap = { syazyounerai: 'syazyonerai' };
      const t = typeMap[type] ?? type;
      return `https://www.pref.shizuoka.jp/_res/projects/project_police/_page_/002/001/145/shizuoka_2024_${t}.csv`;
    },
    fallbackUrlFn: (type) => {
      // 2023年URL（アンダースコアなし・syazyounerai表記）
      return `https://www.pref.shizuoka.jp/_res/projects/project_police/_page_/002/001/145/shizuoka_2023${type}.csv`;
    },
  },
];

// ---- ユーティリティ ----
let seed = 42;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; }
function randn() { return Math.sqrt(-2 * Math.log(rand() + 1e-10)) * Math.cos(2 * Math.PI * rand()); }
function randomDate() {
  const d = new Date('2024-01-01');
  d.setDate(d.getDate() + Math.floor(rand() * 365));
  return d.toISOString().slice(0, 10);
}

const CRIME_LABELS = ['自転車盗', '車上ねらい', '部品ねらい', '自動販売機ねらい', '自動車盗', 'オートバイ盗', 'ひったくり'];

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'MachiScore/1.0 (crime data research)',
        'Accept-Encoding': 'gzip, deflate',
        'Accept': 'text/csv,*/*',
      },
      timeout: 30000,
    };
    const req = https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchCSV(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip()) : res;
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const buf = Buffer.concat(chunks);
        // HTMLが返ってきた場合はCSVではないためエラー
        const head = buf.slice(0, 15).toString('ascii').toLowerCase();
        if (head.startsWith('<!doc') || head.startsWith('<html')) {
          return reject(new Error(`HTMLが返却されました（CSVではない）: ${url}`));
        }
        resolve(buf);
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`タイムアウト: ${url}`)); });
  });
}

/** UTF-8を先に試し、失敗したらShift-JISで読む */
function detectAndDecode(buf) {
  // UTF-8 BOMチェック
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  // UTF-8として有効か試みる（fatalモード: 不正バイト列でThrow）
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // UTF-8無効 → Shift-JIS
    try {
      return new TextDecoder('shift-jis').decode(buf);
    } catch {
      return buf.toString('latin1');
    }
  }
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  // 1行目でタブ/カンマを自動判定
  const delimiter = (lines[0] || '').includes('\t') ? '\t' : ',';
  return lines.map(line => line.split(delimiter).map(v => v.trim().replace(/^"(.*)"$/, '$1')));
}

/**
 * CSVを解析し、市区町村ごとの件数を返す
 * 列: 罪名(0), 手口(1), 管轄警察署(2), 管轄交番(3), 市区町村コード(4),
 *     都道府県(5), 市区町村(6), 町丁目(7), ...
 */
function aggregateByMunicipality(rows) {
  const counts = {};
  let header = true;
  for (const row of rows) {
    if (!row || row.length < 7) continue;
    // ヘッダー行をスキップ（市区町村コードが数字でない行）
    if (header) {
      if (!/^\d/.test((row[4] || '').trim())) continue;
      header = false;
    }
    const muni = (row[6] || '').trim();
    if (!muni || muni === '市区町村') continue;
    counts[muni] = (counts[muni] || 0) + 1;
  }
  return counts;
}

// ---- ポリゴン重心算出 ----
function computeCentroid(geometry) {
  let rings;
  if (geometry.type === 'Polygon') {
    rings = [geometry.coordinates[0]];
  } else if (geometry.type === 'MultiPolygon') {
    // 最大リングを使用
    let maxLen = 0, largest = null;
    for (const poly of geometry.coordinates) {
      if (poly[0].length > maxLen) { maxLen = poly[0].length; largest = poly[0]; }
    }
    rings = [largest];
  } else {
    return null;
  }
  const ring = rings[0];
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; }
  return [sumLng / ring.length, sumLat / ring.length];
}

/** choropleth.geojson から 都道府県+市区町村 → 重心座標 を生成 */
function buildMuniCentroids(choropleth) {
  const centroids = {}; // `${pref}|${muni}` → [lng, lat, radius]
  for (const f of choropleth.features) {
    const pref = f.properties.prefecture;
    const muni = f.properties.municipality;
    if (!pref || !muni) continue;
    const key = `${pref}|${muni}`;
    if (centroids[key]) continue; // 重複は最初のポリゴンを使用
    const c = computeCentroid(f.geometry);
    if (!c) continue;
    // 散布半径: ポリゴンの対角線の1/4 程度
    const coords = f.geometry.type === 'Polygon'
      ? f.geometry.coordinates[0]
      : f.geometry.coordinates[0][0];
    let minLng=Infinity, maxLng=-Infinity, minLat=Infinity, maxLat=-Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    const radius = Math.min((maxLng - minLng) * 0.4, (maxLat - minLat) * 0.4, 0.06);
    centroids[key] = [c[0], c[1], Math.max(radius, 0.01)];
  }
  return centroids;
}

/** 市区町村の重心を前方一致で探す（"大阪市北区" → "大阪市"） */
function findCentroid(centroids, prefName, muniName) {
  const exactKey = `${prefName}|${muniName}`;
  if (centroids[exactKey]) return { key: exactKey, centroid: centroids[exactKey] };

  // 前方一致: 大阪市北区 → 大阪市, 横浜市鶴見区 → 横浜市
  for (const [key, val] of Object.entries(centroids)) {
    const [kPref, kMuni] = key.split('|');
    if (kPref === prefName && muniName.startsWith(kMuni)) {
      return { key, centroid: val };
    }
  }
  return null;
}

function generatePoints(prefecture, city, count, lng, lat, radius) {
  const nPoints = Math.min(Math.floor(count / 5) + 1, 200);
  const scaleFactor = count / Math.max(nPoints, 1);
  const features = [];
  for (let i = 0; i < nPoints; i++) {
    const angle = rand() * 2 * Math.PI;
    const r = Math.min(Math.abs(randn()) * radius / 2, radius);
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          +((lng + r * Math.cos(angle)).toFixed(5)),
          +((lat + r * Math.sin(angle)).toFixed(5)),
        ],
      },
      properties: {
        crime_type: CRIME_LABELS[Math.floor(rand() * CRIME_LABELS.length)],
        occurred_date: randomDate(),
        prefecture,
        city,
        crime_count: Math.round(scaleFactor),
        data_source: '警察庁犯罪オープンデータ（R6年）',
      },
    });
  }
  return features;
}

// ---- メイン処理 ----
async function processPrefecture(prefDef, centroids) {
  const { name, urlFn } = prefDef;
  console.log(`\n=== ${name} ===`);
  const muniCounts = {};
  let totalRows = 0;
  let successCount = 0;

  for (const crimeType of CRIME_TYPES) {
    const url = urlFn(crimeType);
    try {
      process.stdout.write(`  ${crimeType} ... `);
      let buf;
      try {
        buf = await fetchCSV(url);
      } catch (e) {
        // フォールバックURLがあれば試みる（静岡2024→2023など）
        if (prefDef.fallbackUrlFn) {
          const fallbackUrl = prefDef.fallbackUrlFn(crimeType);
          process.stdout.write(`[→フォールバック] `);
          buf = await fetchCSV(fallbackUrl);
        } else {
          throw e;
        }
      }
      const text = detectAndDecode(buf);
      const rows = parseCSV(text);
      const counts = aggregateByMunicipality(rows);
      const typeTotal = Object.values(counts).reduce((a, b) => a + b, 0);
      for (const [muni, cnt] of Object.entries(counts)) {
        muniCounts[muni] = (muniCounts[muni] || 0) + cnt;
      }
      totalRows += typeTotal;
      successCount++;
      console.log(`${typeTotal}件`);
    } catch (e) {
      console.log(`失敗 (${e.message})`);
    }
  }

  if (successCount === 0) {
    console.log(`  → ${name}: 全CSVダウンロード失敗。モックデータを維持。`);
    return null;
  }

  // 市区町村の重心を使ってポイント生成
  const features = [];
  let matched = 0, unmatched = 0;
  const sortedMunis = Object.entries(muniCounts).sort((a, b) => b[1] - a[1]);

  for (const [muniName, count] of sortedMunis) {
    const found = findCentroid(centroids, name, muniName);
    if (!found) {
      unmatched++;
      continue;
    }
    const [lng, lat, radius] = found.centroid;
    features.push(...generatePoints(name, muniName, count, lng, lat, radius));
    matched++;
  }

  const prefTotal = Object.values(muniCounts).reduce((a, b) => a + b, 0);
  console.log(`  合計: ${prefTotal.toLocaleString()}件, 市区町村: ${matched}マッチ/${matched + unmatched}件`);
  console.log(`  ポイント生成: ${features.length}`);

  // 上位5市区町村を表示
  console.log(`  TOP5:`);
  sortedMunis.slice(0, 5).forEach(([m, c]) => console.log(`    ${m}: ${c.toLocaleString()}件`));

  return features;
}

async function main() {
  console.log('=== Phase 2: 実犯罪データ取得（大阪・神奈川・愛知・千葉） ===\n');

  const publicDir = path.join(__dirname, '..', 'public');

  // choropleth.geojson から重心を構築
  const choroplethPath = path.join(publicDir, 'choropleth.geojson');
  if (!fs.existsSync(choroplethPath)) {
    console.error('choropleth.geojson が見つかりません。先に fetch_price_national を実行してください。');
    process.exit(1);
  }
  console.log('choropleth.geojson から市区町村重心を構築中...');
  const choropleth = JSON.parse(fs.readFileSync(choroplethPath, 'utf8'));
  const centroids = buildMuniCentroids(choropleth);
  console.log(`  重心: ${Object.keys(centroids).length}市区町村`);

  // 既存モックデータを読込
  const mockPath = path.join(publicDir, 'crime_mock.geojson');
  let existingMock = { type: 'FeatureCollection', features: [] };
  if (fs.existsSync(mockPath)) {
    existingMock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
    console.log(`既存モック: ${existingMock.features.length}ポイント`);
  }

  // Phase 2 対象府県の名前セット
  const phase2Prefs = new Set(PREFECTURES.map(p => p.name));

  // Phase 2以外の既存モックデータを保持
  const otherFeatures = existingMock.features.filter(
    f => !phase2Prefs.has(f.properties?.prefecture)
  );
  console.log(`Phase 2以外のモックデータ: ${otherFeatures.length}ポイント`);

  // 各府県の実データ取得
  const phase2Features = [];
  for (const prefDef of PREFECTURES) {
    const features = await processPrefecture(prefDef, centroids);
    if (features) {
      phase2Features.push(...features);
    } else {
      // 取得失敗時は既存モックデータを維持
      const fallback = existingMock.features.filter(
        f => f.properties?.prefecture === prefDef.name
      );
      phase2Features.push(...fallback);
      console.log(`  ${prefDef.name}: モックデータ ${fallback.length}ポイントを維持`);
    }
  }

  // シャッフルして統合
  const all = [...otherFeatures, ...phase2Features];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  const out = {
    type: 'FeatureCollection',
    features: all,
    metadata: {
      source_tokyo: '警視庁「区市町村の町丁別、罪種別及び手口別認知件数」令和7年',
      source_phase2: '警察庁犯罪オープンデータ（令和6年）- 大阪・神奈川・愛知・千葉',
      source_other: '警察庁都道府県統計（R5年）からの推計値',
      generated_at: new Date().toISOString(),
      total_points: all.length,
      phase2_points: phase2Features.length,
    },
  };

  fs.writeFileSync(mockPath, JSON.stringify(out), 'utf8');
  const sizeKB = (fs.statSync(mockPath).size / 1024).toFixed(1);
  console.log(`\n出力: ${mockPath} (${sizeKB} KB)`);
  console.log(`合計: ${all.length}ポイント (Phase2実データ: ${phase2Features.length})`);
}

main().catch(e => { console.error(e); process.exit(1); });
