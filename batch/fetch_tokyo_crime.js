/**
 * 警視庁CSVから東京都の実犯罪データを生成 (Node.js版)
 * 出力: public/crime_japan.geojson (東京実データ + 他都道府県モック)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const CSV_URL = 'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/ninchikensu.files/R7.csv';

// 東京区市の代表座標と散布半径
const WARD_COORDS = {
  '千代田区':[139.7536,35.6940,0.020], '中央区':[139.7740,35.6706,0.018],
  '港区':[139.7514,35.6581,0.028],     '新宿区':[139.7036,35.6938,0.022],
  '文京区':[139.7519,35.7080,0.020],   '台東区':[139.7796,35.7089,0.020],
  '墨田区':[139.8017,35.7101,0.022],   '江東区':[139.8172,35.6728,0.030],
  '品川区':[139.7300,35.6094,0.028],   '目黒区':[139.6983,35.6339,0.022],
  '大田区':[139.7161,35.5617,0.040],   '世田谷区':[139.6531,35.6464,0.038],
  '渋谷区':[139.7019,35.6639,0.022],   '中野区':[139.6641,35.7075,0.018],
  '杉並区':[139.6360,35.6994,0.030],   '豊島区':[139.7197,35.7294,0.018],
  '北区':[139.7336,35.7528,0.026],     '荒川区':[139.7836,35.7358,0.018],
  '板橋区':[139.7094,35.7750,0.030],   '練馬区':[139.6519,35.7356,0.038],
  '足立区':[139.7847,35.7753,0.040],   '葛飾区':[139.8442,35.7444,0.032],
  '江戸川区':[139.8686,35.7067,0.036],
  '八王子市':[139.3267,35.6661,0.050], '立川市':[139.4136,35.6980,0.030],
  '武蔵野市':[139.5656,35.7074,0.020], '三鷹市':[139.5614,35.6834,0.020],
  '府中市':[139.4773,35.6699,0.025],   '調布市':[139.5491,35.6519,0.022],
  '町田市':[139.4461,35.5487,0.040],   '小平市':[139.4758,35.7282,0.022],
  '日野市':[139.3966,35.6719,0.025],   '西東京市':[139.5382,35.7257,0.022],
};

const CRIMES = ['自転車盗','自動車盗','オートバイ盗','ひったくり','すり','万引き','住宅侵入盗','車上ねらい','暴行','傷害'];

let seed = 42;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; }
function randn() { return Math.sqrt(-2*Math.log(rand()+1e-10))*Math.cos(2*Math.PI*rand()); }

function randomDate() {
  const d = new Date('2025-01-01');
  d.setDate(d.getDate() + Math.floor(rand()*365));
  return d.toISOString().slice(0,10);
}

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'SmileMap/1.0', 'Accept-Encoding': 'gzip, deflate' }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchCSV(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip()) : res;
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
    req.on('error', reject);
  });
}

function decodeShiftJIS(buf) {
  try {
    return new TextDecoder('shift-jis').decode(buf);
  } catch(e) {
    // Fallback: iconv-lite 的処理なし → latin1 でデコードして後処理
    console.warn('  TextDecoder shift-jis 失敗。latin1フォールバック');
    return buf.toString('latin1');
  }
}

function parseCSV(text) {
  return text.split(/\r?\n/).map(line => line.split(','));
}

// 地区プレフィックス（区市町村ではない地域区分）をスキップ
const REGION_PREFIXES = ['多摩地区', '島しょ地区', '２３区', '23区'];

function extractWardName(location) {
  location = location.trim();
  // 既知の地区プレフィックスを除去
  for (const prefix of REGION_PREFIXES) {
    if (location.startsWith(prefix)) {
      location = location.slice(prefix.length).trim();
      break;
    }
  }
  if (!location) return '';

  for (const suffix of ['区', '市', '郡', '町', '村']) {
    const idx = location.indexOf(suffix);
    if (idx > 0) {
      const candidate = location.slice(0, idx + 1);
      if (candidate.length >= 2 && candidate.length <= 8) return candidate;
    }
  }
  return '';
}

function aggregateByWard(rows) {
  const counts = {};
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const location = (row[0] || '').trim();
    if (!location) continue;
    const ward = extractWardName(location);
    if (!ward) continue;

    // 区・市単位の合計行はスキップ（location == ward の場合）
    // 例: "新宿区" → スキップ、"新宿区新宿一丁目" → 採用
    if (location === ward || location.length <= ward.length + 1) {
      skipped++;
      continue;
    }

    const total = parseInt((row[1] || '0').replace(/,/g, ''), 10);
    if (total > 0) counts[ward] = (counts[ward] || 0) + total;
  }
  if (skipped > 0) console.log(`  合計行スキップ: ${skipped}行`);
  return counts;
}

function generatePoints(ward, count, lng, lat, radius) {
  const nPoints = Math.min(Math.floor(count / 5) + 1, 200);
  const scaleFactor = count / Math.max(nPoints, 1);
  const features = [];
  for (let i = 0; i < nPoints; i++) {
    const angle = rand() * 2 * Math.PI;
    const r = Math.min(Math.abs(randn()) * radius / 2, radius);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [
        +((lng + r * Math.cos(angle)).toFixed(5)),
        +((lat + r * Math.sin(angle)).toFixed(5))
      ]},
      properties: {
        crime_type: CRIMES[Math.floor(rand() * CRIMES.length)],
        occurred_date: randomDate(),
        prefecture: '東京都',
        city: ward,
        crime_count: Math.round(scaleFactor),
        data_source: '警視庁統計（2025年）',
      }
    });
  }
  return features;
}

async function main() {
  console.log('=== 東京都犯罪データ生成（警視庁実データ） ===');
  const publicDir = path.join(__dirname, '..', 'public');

  // CSVダウンロード
  let wardCounts = {};
  try {
    console.log('CSV ダウンロード中...');
    const buf = await fetchCSV(CSV_URL);
    const text = decodeShiftJIS(buf);
    const rows = parseCSV(text);
    console.log(`  → ${rows.length}行`);
    wardCounts = aggregateByWard(rows);
    const top5 = Object.entries(wardCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    console.log('  認知件数TOP5:');
    top5.forEach(([w,c]) => console.log(`    ${w}: ${c.toLocaleString()}件`));
  } catch(e) {
    console.error('CSVダウンロード/解析エラー:', e.message);
    console.log('警視庁データなし → モックのみで続行');
  }

  // 東京ポイント生成
  const tokyoFeatures = [];
  let totalCrimes = 0;
  for (const [ward, count] of Object.entries(wardCounts)) {
    if (!WARD_COORDS[ward]) continue;
    const [lng, lat, radius] = WARD_COORDS[ward];
    tokyoFeatures.push(...generatePoints(ward, count, lng, lat, radius));
    totalCrimes += count;
  }
  console.log(`東京ポイント: ${tokyoFeatures.length}件（実認知件数: ${totalCrimes.toLocaleString()}件）`);

  // モックデータ（東京除く）読込
  const mockPath = path.join(publicDir, 'crime_mock.geojson');
  let otherFeatures = [];
  if (fs.existsSync(mockPath)) {
    const mock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
    otherFeatures = mock.features.filter(f => f.properties?.prefecture !== '東京都');
    console.log(`モックデータ（東京除く）: ${otherFeatures.length}件`);
  }

  // シャッフルしてマージ
  const all = [...tokyoFeatures, ...otherFeatures];
  for (let i = all.length-1; i > 0; i--) {
    const j = Math.floor(rand()*(i+1));
    [all[i],all[j]] = [all[j],all[i]];
  }

  const geojson = {
    type: 'FeatureCollection',
    features: all,
    metadata: {
      tokyo_source: '警視庁「区市町村の町丁別、罪種別及び手口別認知件数」令和7年',
      other_source: 'SmileMap デモデータ（モック）',
      note: '東京都は実統計値に基づく区内分散ポイント。他都道府県はデモ用モックデータ。',
      generated_at: new Date().toISOString(),
      tokyo_crimes_recognized: totalCrimes,
      total_points: all.length,
    }
  };

  const outPath = path.join(publicDir, 'crime_japan.geojson');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(geojson), 'utf8');
  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n出力: ${outPath} (${sizeKB} KB)`);
  console.log(`合計: ${all.length}ポイント`);
}

main().catch(e => { console.error(e); process.exit(1); });
