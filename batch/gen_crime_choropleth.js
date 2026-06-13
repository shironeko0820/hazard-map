/**
 * crime_japan.geojson の点データを市区町村ポリゴンに集計し
 * crime_choropleth.geojson を生成する
 *
 * 入力: public/crime_japan.geojson, public/choropleth.geojson
 * 出力: public/crime_choropleth.geojson
 */

const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

// ---- 1. 点データを prefecture+city で集計 ----
const crimeGeo = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'crime_japan.geojson'), 'utf8'));
const cityTotals = {};
for (const f of crimeGeo.features) {
  const { prefecture, city, crime_count } = f.properties ?? {};
  if (!prefecture || !city) continue;
  const key = `${prefecture}|${city}`;
  cityTotals[key] = (cityTotals[key] || 0) + (Number(crime_count) || 1);
}
console.log(`集計済み都市数: ${Object.keys(cityTotals).length}`);

// ---- 2. choropleth ポリゴンに crime_count を付与 ----
const choropleth = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'choropleth.geojson'), 'utf8'));

// まず前方一致グループを作る (city → [polygon indices])
// 例: "北海道|札幌市" → [idx1, idx2, ...]
const prefixGroups = {}; // cityKey → polygon indices
choropleth.features.forEach((f, i) => {
  const pref = f.properties.prefecture;
  const muni = f.properties.municipality;
  // どの city に対してこのポリゴンが前方一致するか探す
  for (const cityKey of Object.keys(cityTotals)) {
    const [cp, cc] = cityKey.split('|');
    if (cp === pref && muni.startsWith(cc)) {
      if (!prefixGroups[cityKey]) prefixGroups[cityKey] = [];
      prefixGroups[cityKey].push(i);
      break;
    }
  }
});

// 各ポリゴンに crime_count を付与
// 按分せず、マッチした都市の合計をそのまま使う（色・ランキング統一）
const muniCrimeCounts = new Array(choropleth.features.length).fill(0);
const muniDisplayName = new Array(choropleth.features.length).fill(null); // ポップアップ表示名
const muniIsGroup = new Array(choropleth.features.length).fill(false);    // 市→区の按分フラグ

for (const [cityKey, indices] of Object.entries(prefixGroups)) {
  const total = cityTotals[cityKey] || 0;
  const cityName = cityKey.split('|')[1];
  for (const i of indices) {
    muniCrimeCounts[i] = total; // 按分しない：全ワード同じ値
    const muni = choropleth.features[i].properties.municipality;
    // 完全一致なら municipality 名そのまま、前方一致なら市名を表示
    muniDisplayName[i] = (muni === cityName) ? muni : cityName;
    muniIsGroup[i] = (muni !== cityName);
  }
}

// exactMatch はすでに prefixGroups に含まれる（完全一致も startsWith でヒットする）

// ---- 3. 全国ランキング付与（都市単位で重複除去してランキング）----
// 同じ都市名が複数区に紐づく場合は同一順位を付与
const cityRankMap = {}; // displayName → rank
const uniqueCities = [...new Set(
  muniDisplayName.filter((n, i) => n && muniCrimeCounts[i] > 0)
    .map((n, idx) => {
      // prefecture + displayName でユニーク化
      const pref = choropleth.features[muniDisplayName.indexOf(n)]?.properties?.prefecture ?? '';
      return pref + '|' + n;
    })
)];
// prefecture+displayName → max crime_count で並び替え
const cityCountMap = {};
muniDisplayName.forEach((name, i) => {
  if (!name || muniCrimeCounts[i] === 0) return;
  const pref = choropleth.features[i].properties.prefecture;
  const key = pref + '|' + name;
  cityCountMap[key] = Math.max(cityCountMap[key] || 0, muniCrimeCounts[i]);
});
const sortedCities = Object.entries(cityCountMap).sort((a, b) => b[1] - a[1]);
sortedCities.forEach(([key], rank) => { cityRankMap[key] = rank + 1; });

const totalRanked = sortedCities.length;
console.log(`ランキング対象: ${totalRanked} 市区（都市単位）`);

// ---- 4. GeoJSON 生成 ----
const features = choropleth.features.map((f, i) => {
  const count = muniCrimeCounts[i];
  const displayName = muniDisplayName[i];
  const pref = f.properties.prefecture;
  const rank = displayName ? (cityRankMap[pref + '|' + displayName] ?? null) : null;
  return {
    ...f,
    properties: {
      ...f.properties,
      crime_count: count,
      crime_display_name: displayName,   // ポップアップ表示用（市名 or 区名）
      crime_is_group: muniIsGroup[i] || null, // trueなら市単位のグループ表示
      crime_rank: rank,
      crime_total_ranked: totalRanked,
    },
  };
});

const out = {
  type: 'FeatureCollection',
  features,
  metadata: {
    source: '警察庁統計（R5年）＋警視庁統計（2025年）',
    generated_at: new Date().toISOString(),
    total_municipalities: features.length,
    municipalities_with_data: totalRanked,
  },
};

const outPath = path.join(PUBLIC, 'crime_choropleth.geojson');
fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);

// 上位10件を表示
console.log('\n犯罪件数 TOP10（都市単位）:');
sortedCities.slice(0, 10).forEach(([key, count], rank) => {
  console.log(`  ${rank + 1}. ${key.replace('|', ' ')}: ${count.toLocaleString()}件`);
});
console.log(`\n出力: ${outPath} (${sizeKB} KB)`);
