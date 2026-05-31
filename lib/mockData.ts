import type { AreaScore } from "@/types";
import type { FeatureCollection, Point, Polygon } from "geojson";

// 東京主要区のモックデータ
export const MOCK_AREA_SCORES: Record<string, AreaScore> = {
  "13101": {
    cityCode: "13101",
    cityName: "千代田区",
    overallScore: 72,
    priceData: { avgPricePerSqm: 1200000, medianPricePerSqm: 980000, transactionCount: 234, trend: "+3.2%" },
    safetyData: { crimeCount: 1823, crimeRatePer10k: 45.2, score: 65, rankInPrefecture: "23区中18位" },
    disasterData: { floodRiskLevel: 2, landslideRisk: false, tsunamiRisk: false, earthquakeProb30y: 48.0, score: 55 },
    nearbyAreas: [{ cityCode: "13102", cityName: "中央区", overallScore: 68 }, { cityCode: "13103", cityName: "港区", overallScore: 74 }],
  },
  "13102": {
    cityCode: "13102",
    cityName: "中央区",
    overallScore: 68,
    priceData: { avgPricePerSqm: 1050000, medianPricePerSqm: 890000, transactionCount: 189, trend: "+2.1%" },
    safetyData: { crimeCount: 2100, crimeRatePer10k: 52.3, score: 58, rankInPrefecture: "23区中20位" },
    disasterData: { floodRiskLevel: 3, landslideRisk: false, tsunamiRisk: true, earthquakeProb30y: 55.0, score: 48 },
    nearbyAreas: [{ cityCode: "13101", cityName: "千代田区", overallScore: 72 }, { cityCode: "13103", cityName: "港区", overallScore: 74 }],
  },
  "13103": {
    cityCode: "13103",
    cityName: "港区",
    overallScore: 74,
    priceData: { avgPricePerSqm: 1380000, medianPricePerSqm: 1150000, transactionCount: 412, trend: "+4.5%" },
    safetyData: { crimeCount: 3200, crimeRatePer10k: 38.9, score: 70, rankInPrefecture: "23区中12位" },
    disasterData: { floodRiskLevel: 1, landslideRisk: false, tsunamiRisk: false, earthquakeProb30y: 42.0, score: 65 },
    nearbyAreas: [{ cityCode: "13101", cityName: "千代田区", overallScore: 72 }, { cityCode: "13113", cityName: "渋谷区", overallScore: 76 }],
  },
  "13104": {
    cityCode: "13104",
    cityName: "新宿区",
    overallScore: 62,
    priceData: { avgPricePerSqm: 920000, medianPricePerSqm: 780000, transactionCount: 567, trend: "+1.8%" },
    safetyData: { crimeCount: 8900, crimeRatePer10k: 95.3, score: 32, rankInPrefecture: "23区中22位" },
    disasterData: { floodRiskLevel: 1, landslideRisk: false, tsunamiRisk: false, earthquakeProb30y: 44.0, score: 63 },
    nearbyAreas: [{ cityCode: "13103", cityName: "港区", overallScore: 74 }, { cityCode: "13113", cityName: "渋谷区", overallScore: 76 }],
  },
  "13113": {
    cityCode: "13113",
    cityName: "渋谷区",
    overallScore: 76,
    priceData: { avgPricePerSqm: 1100000, medianPricePerSqm: 920000, transactionCount: 345, trend: "+3.8%" },
    safetyData: { crimeCount: 4200, crimeRatePer10k: 42.1, score: 68, rankInPrefecture: "23区中14位" },
    disasterData: { floodRiskLevel: 1, landslideRisk: true, tsunamiRisk: false, earthquakeProb30y: 40.0, score: 68 },
    nearbyAreas: [{ cityCode: "13103", cityName: "港区", overallScore: 74 }, { cityCode: "13104", cityName: "新宿区", overallScore: 62 }],
  },
  "13111": {
    cityCode: "13111",
    cityName: "品川区",
    overallScore: 70,
    priceData: { avgPricePerSqm: 780000, medianPricePerSqm: 650000, transactionCount: 623, trend: "+2.9%" },
    safetyData: { crimeCount: 5100, crimeRatePer10k: 44.5, score: 67, rankInPrefecture: "23区中15位" },
    disasterData: { floodRiskLevel: 2, landslideRisk: false, tsunamiRisk: false, earthquakeProb30y: 46.0, score: 60 },
    nearbyAreas: [{ cityCode: "13103", cityName: "港区", overallScore: 74 }, { cityCode: "13112", cityName: "目黒区", overallScore: 78 }],
  },
  "13112": {
    cityCode: "13112",
    cityName: "目黒区",
    overallScore: 78,
    priceData: { avgPricePerSqm: 890000, medianPricePerSqm: 760000, transactionCount: 289, trend: "+3.1%" },
    safetyData: { crimeCount: 2800, crimeRatePer10k: 31.2, score: 75, rankInPrefecture: "23区中8位" },
    disasterData: { floodRiskLevel: 1, landslideRisk: false, tsunamiRisk: false, earthquakeProb30y: 41.0, score: 66 },
    nearbyAreas: [{ cityCode: "13113", cityName: "渋谷区", overallScore: 76 }, { cityCode: "13111", cityName: "品川区", overallScore: 70 }],
  },
  "13115": {
    cityCode: "13115",
    cityName: "江東区",
    overallScore: 54,
    priceData: { avgPricePerSqm: 520000, medianPricePerSqm: 440000, transactionCount: 891, trend: "+1.2%" },
    safetyData: { crimeCount: 6700, crimeRatePer10k: 49.8, score: 62, rankInPrefecture: "23区中19位" },
    disasterData: { floodRiskLevel: 5, landslideRisk: false, tsunamiRisk: true, earthquakeProb30y: 72.0, score: 22 },
    nearbyAreas: [{ cityCode: "13102", cityName: "中央区", overallScore: 68 }, { cityCode: "13121", cityName: "足立区", overallScore: 45 }],
  },
  "13121": {
    cityCode: "13121",
    cityName: "足立区",
    overallScore: 45,
    priceData: { avgPricePerSqm: 340000, medianPricePerSqm: 290000, transactionCount: 1203, trend: "+0.8%" },
    safetyData: { crimeCount: 12400, crimeRatePer10k: 89.7, score: 38, rankInPrefecture: "23区中23位" },
    disasterData: { floodRiskLevel: 4, landslideRisk: false, tsunamiRisk: false, earthquakeProb30y: 65.0, score: 32 },
    nearbyAreas: [{ cityCode: "13115", cityName: "江東区", overallScore: 54 }],
  },
};

// モック地図データ（GeoJSON）- 不動産取引価格点群
export const MOCK_PRICE_GEOJSON: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [
    // 千代田区周辺
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7532, 35.6940] }, properties: { price_per_sqm: 1250000, property_type: "中古マンション等", nearest_station: "大手町", walk_minutes: 3 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7580, 35.6910] }, properties: { price_per_sqm: 980000, property_type: "宅地(土地)", nearest_station: "東京", walk_minutes: 5 } },
    // 港区周辺
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7454, 35.6585] }, properties: { price_per_sqm: 1480000, property_type: "中古マンション等", nearest_station: "六本木", walk_minutes: 4 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7320, 35.6650] }, properties: { price_per_sqm: 1320000, property_type: "中古マンション等", nearest_station: "赤坂", walk_minutes: 6 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7400, 35.6720] }, properties: { price_per_sqm: 1150000, property_type: "宅地(土地)", nearest_station: "虎ノ門", walk_minutes: 8 } },
    // 渋谷区周辺
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7016, 35.6580] }, properties: { price_per_sqm: 1100000, property_type: "中古マンション等", nearest_station: "渋谷", walk_minutes: 5 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7100, 35.6640] }, properties: { price_per_sqm: 890000, property_type: "戸建等", nearest_station: "恵比寿", walk_minutes: 7 } },
    // 新宿区周辺
    { type: "Feature", geometry: { type: "Point", coordinates: [139.6980, 35.6938] }, properties: { price_per_sqm: 920000, property_type: "中古マンション等", nearest_station: "新宿", walk_minutes: 5 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7080, 35.7010] }, properties: { price_per_sqm: 750000, property_type: "宅地(土地)", nearest_station: "四谷", walk_minutes: 6 } },
    // 足立区周辺（安価）
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7956, 35.7776] }, properties: { price_per_sqm: 340000, property_type: "中古マンション等", nearest_station: "西新井", walk_minutes: 8 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.8050, 35.7650] }, properties: { price_per_sqm: 280000, property_type: "戸建等", nearest_station: "竹ノ塚", walk_minutes: 10 } },
    // 目黒区周辺
    { type: "Feature", geometry: { type: "Point", coordinates: [139.6980, 35.6400] }, properties: { price_per_sqm: 890000, property_type: "中古マンション等", nearest_station: "目黒", walk_minutes: 5 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7050, 35.6320] }, properties: { price_per_sqm: 760000, property_type: "戸建等", nearest_station: "学芸大学", walk_minutes: 7 } },
    // 江東区周辺
    { type: "Feature", geometry: { type: "Point", coordinates: [139.8130, 35.6650] }, properties: { price_per_sqm: 520000, property_type: "中古マンション等", nearest_station: "東陽町", walk_minutes: 6 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.8280, 35.6520] }, properties: { price_per_sqm: 450000, property_type: "宅地(土地)", nearest_station: "木場", walk_minutes: 9 } },
  ],
};

// モック犯罪データ（GeoJSON）
export const MOCK_CRIME_GEOJSON: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [
    // 新宿（高密度）
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7005, 35.6938] }, properties: { crime_type: "自転車盗", occurred_date: "2024-10-15" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.6990, 35.6920] }, properties: { crime_type: "ひったくり", occurred_date: "2024-10-18" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7020, 35.6955] }, properties: { crime_type: "車上ねらい", occurred_date: "2024-10-22" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7015, 35.6945] }, properties: { crime_type: "自転車盗", occurred_date: "2024-11-01" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.6975, 35.6930] }, properties: { crime_type: "自販機ねらい", occurred_date: "2024-11-05" } },
    // 足立区（高密度）
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7940, 35.7760] }, properties: { crime_type: "自転車盗", occurred_date: "2024-10-10" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7980, 35.7790] }, properties: { crime_type: "車上ねらい", occurred_date: "2024-10-14" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.8020, 35.7740] }, properties: { crime_type: "自転車盗", occurred_date: "2024-10-20" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7960, 35.7810] }, properties: { crime_type: "オートバイ盗", occurred_date: "2024-11-03" } },
    // 港区（低密度）
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7454, 35.6600] }, properties: { crime_type: "自転車盗", occurred_date: "2024-10-25" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7380, 35.6680] }, properties: { crime_type: "車上ねらい", occurred_date: "2024-11-10" } },
    // 目黒区（低密度）
    { type: "Feature", geometry: { type: "Point", coordinates: [139.6990, 35.6410] }, properties: { crime_type: "自転車盗", occurred_date: "2024-10-28" } },
    // 渋谷区
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7016, 35.6590] }, properties: { crime_type: "ひったくり", occurred_date: "2024-10-30" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.7050, 35.6560] }, properties: { crime_type: "自転車盗", occurred_date: "2024-11-02" } },
    // 江東区
    { type: "Feature", geometry: { type: "Point", coordinates: [139.8150, 35.6680] }, properties: { crime_type: "自転車盗", occurred_date: "2024-10-17" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.8200, 35.6630] }, properties: { crime_type: "部品ねらい", occurred_date: "2024-10-21" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [139.8250, 35.6700] }, properties: { crime_type: "自転車盗", occurred_date: "2024-11-08" } },
  ],
};

// モックハザードデータ（GeoJSON ポリゴン - 簡略化）
export const MOCK_HAZARD_GEOJSON: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [
    // 江東区（高リスク - 濃青）
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[139.78, 35.64], [139.85, 35.64], [139.85, 35.70], [139.78, 35.70], [139.78, 35.64]]],
      },
      properties: { city_code: "13115", city_name: "江東区", flood_risk_level: 5, landslide_risk: false, overall_score: 54 },
    },
    // 足立区（高リスク）
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[139.76, 35.75], [139.83, 35.75], [139.83, 35.80], [139.76, 35.80], [139.76, 35.75]]],
      },
      properties: { city_code: "13121", city_name: "足立区", flood_risk_level: 4, landslide_risk: false, overall_score: 45 },
    },
    // 中央区（中リスク）
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[139.76, 35.66], [139.79, 35.66], [139.79, 35.69], [139.76, 35.69], [139.76, 35.66]]],
      },
      properties: { city_code: "13102", city_name: "中央区", flood_risk_level: 3, landslide_risk: false, overall_score: 68 },
    },
    // 千代田区（低リスク）
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[139.73, 35.68], [139.77, 35.68], [139.77, 35.71], [139.73, 35.71], [139.73, 35.68]]],
      },
      properties: { city_code: "13101", city_name: "千代田区", flood_risk_level: 2, landslide_risk: false, overall_score: 72 },
    },
    // 港区（低リスク）
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[139.72, 35.63], [139.77, 35.63], [139.77, 35.67], [139.72, 35.67], [139.72, 35.63]]],
      },
      properties: { city_code: "13103", city_name: "港区", flood_risk_level: 1, landslide_risk: false, overall_score: 74 },
    },
    // 渋谷区（低リスク・土砂あり）
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[139.68, 35.64], [139.72, 35.64], [139.72, 35.67], [139.68, 35.67], [139.68, 35.64]]],
      },
      properties: { city_code: "13113", city_name: "渋谷区", flood_risk_level: 1, landslide_risk: true, overall_score: 76 },
    },
    // 新宿区（低リスク）
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[139.68, 35.68], [139.72, 35.68], [139.72, 35.72], [139.68, 35.72], [139.68, 35.68]]],
      },
      properties: { city_code: "13104", city_name: "新宿区", flood_risk_level: 1, landslide_risk: false, overall_score: 62 },
    },
  ],
};
