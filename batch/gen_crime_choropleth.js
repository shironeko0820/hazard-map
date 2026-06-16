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

// data_source 文字列から年次を判定
function yearFromSource(src) {
  if (!src) return null;
  if (src.includes('2025年') || src.includes('警視庁')) return '2025年';
  if (src.includes('R6年') || src.includes('2024')) return '2024年';
  return '2023年（推計）';
}

// ---- 1. 点データを prefecture+city で集計 ----
const crimeGeo = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'crime_japan.geojson'), 'utf8'));

const cityTotals = {};      // key → total count
const cityTypeTotals = {};  // key → { crimeType: count }
const cityYears = {};       // key → year string (最も新しい年次)

for (const f of crimeGeo.features) {
  const { prefecture, city, crime_count, crime_type, data_source } = f.properties ?? {};
  if (!prefecture || !city) continue;

  const key = `${prefecture}|${city}`;
  const count = Number(crime_count) || 1;

  cityTotals[key] = (cityTotals[key] || 0) + count;

  // 犯罪種別内訳
  if (crime_type) {
    if (!cityTypeTotals[key]) cityTypeTotals[key] = {};
    cityTypeTotals[key][crime_type] = (cityTypeTotals[key][crime_type] || 0) + count;
  }

  // 年次（より新しい年次で上書き）
  const year = yearFromSource(data_source);
  if (year && (!cityYears[key] || year > cityYears[key])) {
    cityYears[key] = year;
  }
}
console.log(`集計済み都市数: ${Object.keys(cityTotals).length}`);

// ---- 2. choropleth ポリゴンに crime_count を付与 ----
const choropleth = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'choropleth.geojson'), 'utf8'));

// 前方一致グループを作る (city → [polygon indices])
const prefixGroups = {};
choropleth.features.forEach((f, i) => {
  const pref = f.properties.prefecture;
  const muni = f.properties.municipality;
  for (const cityKey of Object.keys(cityTotals)) {
    const [cp, cc] = cityKey.split('|');
    if (cp === pref && muni.startsWith(cc)) {
      if (!prefixGroups[cityKey]) prefixGroups[cityKey] = [];
      prefixGroups[cityKey].push(i);
      break;
    }
  }
});

const muniCrimeCounts   = new Array(choropleth.features.length).fill(0);
const muniDisplayName   = new Array(choropleth.features.length).fill(null);
const muniIsGroup       = new Array(choropleth.features.length).fill(false);
const muniTypeCountsArr = new Array(choropleth.features.length).fill(null);
const muniYearArr       = new Array(choropleth.features.length).fill(null);

for (const [cityKey, indices] of Object.entries(prefixGroups)) {
  const total     = cityTotals[cityKey] || 0;
  const cityName  = cityKey.split('|')[1];
  const typeCounts = cityTypeTotals[cityKey] || {};
  const year      = cityYears[cityKey] || null;

  for (const i of indices) {
    muniCrimeCounts[i]   = total;
    const muni           = choropleth.features[i].properties.municipality;
    muniDisplayName[i]   = (muni === cityName) ? muni : cityName;
    muniIsGroup[i]       = (muni !== cityName);
    muniTypeCountsArr[i] = typeCounts;
    muniYearArr[i]       = year;
  }
}

// ---- 3. 全国ランキング付与 ----
const cityCountMap = {};
muniDisplayName.forEach((name, i) => {
  if (!name || muniCrimeCounts[i] === 0) return;
  const pref = choropleth.features[i].properties.prefecture;
  const key = pref + '|' + name;
  cityCountMap[key] = Math.max(cityCountMap[key] || 0, muniCrimeCounts[i]);
});
const sortedCities = Object.entries(cityCountMap).sort((a, b) => b[1] - a[1]);
const cityRankMap = {};
sortedCities.forEach(([key], rank) => { cityRankMap[key] = rank + 1; });

const totalRanked = sortedCities.length;
console.log(`ランキング対象: ${totalRanked} 市区（都市単位）`);

// ---- 4. GeoJSON 生成 ----
const features = choropleth.features.map((f, i) => {
  const count       = muniCrimeCounts[i];
  const displayName = muniDisplayName[i];
  const pref        = f.properties.prefecture;
  const rank        = displayName ? (cityRankMap[pref + '|' + displayName] ?? null) : null;
  const typeCounts  = muniTypeCountsArr[i];
  const year        = muniYearArr[i];

  // 犯罪種別を件数降順に並べてJSON文字列化
  const crimeTypesJson = typeCounts
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
        )
      )
    : null;

  return {
    ...f,
    properties: {
      ...f.properties,
      crime_count:        count,
      crime_display_name: displayName,
      crime_is_group:     muniIsGroup[i] || null,
      crime_rank:         rank,
      crime_total_ranked: totalRanked,
      crime_types:        crimeTypesJson,
      crime_year:         year,
    },
  };
});

const out = {
  type: 'FeatureCollection',
  features,
  metadata: {
    source: '警察庁統計（R5年）＋警視庁統計（2025年）＋警察庁犯罪オープンデータ（R6年）',
    generated_at: new Date().toISOString(),
    total_municipalities: features.length,
    municipalities_with_data: totalRanked,
  },
};

const outPath = path.join(PUBLIC, 'crime_choropleth.geojson');
fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);

console.log('\n犯罪件数 TOP10（都市単位）:');
sortedCities.slice(0, 10).forEach(([key, count], rank) => {
  console.log(`  ${rank + 1}. ${key.replace('|', ' ')}: ${count.toLocaleString()}件`);
});
console.log(`\n出力: ${outPath} (${sizeKB} KB)`);
