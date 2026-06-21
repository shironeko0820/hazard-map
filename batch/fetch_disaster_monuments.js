/**
 * 自然災害伝承碑データ 後処理スクリプト
 * - ZIPの展開はワークフロー側（curl + unzip）で行う
 * - このスクリプトは展開済みGeoJSONのバリデーション・件数確認・出力のみ
 * 入力: /tmp/monuments_extracted/ 内の .geojson ファイル
 * 出力: public/disaster_monuments.geojson
 *
 * 出典: 国土地理院 自然災害伝承碑
 * https://www.gsi.go.jp/bousaichiri/denshouhi.html
 */
const fs = require('fs');
const path = require('path');

const TMP_DIR = process.env.MONUMENTS_TMP_DIR || '/tmp/monuments_extracted';
const OUT_PATH = path.join(__dirname, '..', 'public', 'disaster_monuments.geojson');

function main() {
  console.log('=== 自然災害伝承碑データ 後処理 ===');

  // 展開ディレクトリからGeoJSONを探す
  if (!fs.existsSync(TMP_DIR)) {
    throw new Error(`展開ディレクトリが見つかりません: ${TMP_DIR}`);
  }

  // サブフォルダも再帰的に検索
  function findGeojson(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = findGeojson(path.join(dir, entry.name));
        if (found) return found;
      } else if (entry.name.endsWith('.geojson')) {
        return path.join(dir, entry.name);
      }
    }
    return null;
  }
  const srcPath = findGeojson(TMP_DIR);
  if (!srcPath) {
    throw new Error(`GeoJSONファイルが見つかりません: ${TMP_DIR}`);
  }
  console.log(`入力ファイル: ${srcPath}`);

  const geojson = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  const features = geojson.features ?? [];
  console.log(`件数: ${features.length.toLocaleString()}件`);

  if (features.length === 0) throw new Error('フィーチャーが0件です');

  // プロパティキー確認
  const sample = features[0].properties ?? {};
  console.log('プロパティキー:', Object.keys(sample));
  console.log('サンプル:', JSON.stringify(sample, null, 2));

  // 都道府県別集計（上位10）
  const prefKey = Object.keys(sample).find(k =>
    k.includes('pref') || k.includes('P0001') || k.includes('都道府県')
  );
  if (prefKey) {
    const counts = {};
    for (const f of features) {
      const p = f.properties[prefKey] ?? '不明';
      counts[p] = (counts[p] || 0) + 1;
    }
    console.log('都道府県TOP10:');
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .forEach(([p, c]) => console.log(`  ${p}: ${c}件`));
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(geojson), 'utf8');
  const stat = fs.statSync(OUT_PATH);
  console.log(`\n出力: ${OUT_PATH} (${(stat.size / 1024).toFixed(1)} KB)`);
}

try {
  main();
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
