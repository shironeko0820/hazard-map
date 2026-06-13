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
const muniCrimeCounts = new Array(choropleth.features.length).fill(0);
// source_city: マッチした元の都市名（市区町村名と異なる場合は按分推計）
const muniSourceCity = new Array(choropleth.features.length).fill(null);
const muniCityTotal = new Array(choropleth.features.length).fill(0);
const muniCityDivision = new Array(choropleth.features.length).fill(1);

for (const [cityKey, indices] of Object.entries(prefixGroups)) {
  const total = cityTotals[cityKey] || 0;
  const cityName = cityKey.split('|')[1];
  const share = Math.round(total / indices.length);
  for (const i of indices) {
    muniCrimeCounts[i] = share;
    muniSourceCity[i] = cityName;
    muniCityTotal[i] = total;
    muniCityDivision[i] = indices.length;
  }
}

// exactMatch はすでに prefixGroups に含まれる（完全一致も startsWith でヒットする）

// ---- 3. 全国ランキング付与 ----
// crime_count > 0 のものだけランキング
const ranked = choropleth.features
  .map((f, i) => ({ i, count: muniCrimeCounts[i] }))
  .filter(x => x.count > 0)
  .sort((a, b) => b.count - a.count);

const rankMap = {};
ranked.forEach(({ i }, rank) => { rankMap[i] = rank + 1; });

const totalRanked = ranked.length;
console.log(`ランキング対象: ${totalRanked} 市区町村`);

// ---- 4. GeoJSON 生成 ----
const features = choropleth.features.map((f, i) => {
  const count = muniCrimeCounts[i];
  const rank = rankMap[i] ?? null;
  const muni = f.properties.municipality;
  const sourceCity = muniSourceCity[i];
  // 完全一致（区・市単体）か按分推計かを判定
  const isEstimate = sourceCity && sourceCity !== muni;
  return {
    ...f,
    properties: {
      ...f.properties,
      crime_count: count,
      crime_rank: rank,
      crime_total_ranked: totalRanked,
      crime_source_city: sourceCity,
      crime_city_total: isEstimate ? muniCityTotal[i] : null,
      crime_city_division: isEstimate ? muniCityDivision[i] : null,
      crime_is_estimate: isEstimate ? true : null,
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
console.log('\n犯罪件数 TOP10:');
ranked.slice(0, 10).forEach(({ i, count }, rank) => {
  const p = choropleth.features[i].properties;
  console.log(`  ${rank + 1}. ${p.prefecture} ${p.municipality}: ${count.toLocaleString()}件`);
});
console.log(`\n出力: ${outPath} (${sizeKB} KB)`);
