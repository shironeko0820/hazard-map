import type { AreaScore } from "@/types";
import { MOCK_AREA_SCORES, MOCK_PRICE_GEOJSON, MOCK_CRIME_GEOJSON, MOCK_HAZARD_GEOJSON } from "./mockData";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// 本番APIが設定されていればそちらを使用、なければモックを返す
async function fetchOrMock<T>(url: string, mock: T): Promise<T> {
  if (!API_BASE) return mock;
  try {
    const res = await fetch(url);
    if (!res.ok) return mock;
    return res.json();
  } catch {
    return mock;
  }
}

export async function fetchAreaScore(cityCode: string): Promise<AreaScore | null> {
  return fetchOrMock(
    `${API_BASE}/api/area-score/${cityCode}`,
    MOCK_AREA_SCORES[cityCode] ?? null
  );
}

export async function fetchMapData(layer: "price" | "crime" | "hazard") {
  const mocks = { price: MOCK_PRICE_GEOJSON, crime: MOCK_CRIME_GEOJSON, hazard: MOCK_HAZARD_GEOJSON };
  return fetchOrMock(`${API_BASE}/api/map-data?layer=${layer}`, mocks[layer]);
}

export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; cityCode: string } | null> {
  try {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`
    );
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const [lng, lat] = data[0].geometry.coordinates;
    // 簡易的な市区町村コード判定（本番はPostGISで特定）
    const cityCode = guessCityCodeFromCoords(lat, lng);
    return { lat, lng, cityCode };
  } catch {
    return null;
  }
}

function guessCityCodeFromCoords(lat: number, lng: number): string {
  // 簡易的な座標→市区町村コード変換（モック用）
  if (lat > 35.74 && lng > 139.78) return "13121"; // 足立区
  if (lat > 35.64 && lng > 139.78) return "13115"; // 江東区
  if (lat > 35.68 && lng > 139.73 && lat < 35.71) return "13101"; // 千代田区
  if (lat > 35.66 && lng > 139.76 && lat < 35.69) return "13102"; // 中央区
  if (lat > 35.63 && lng > 139.72 && lat < 35.67) return "13103"; // 港区
  if (lat > 35.64 && lng > 139.68 && lat < 35.67) return "13113"; // 渋谷区
  if (lat > 35.68 && lng > 139.68 && lat < 35.72) return "13104"; // 新宿区
  if (lat > 35.63 && lng > 139.69 && lat < 35.65) return "13112"; // 目黒区
  return "13101";
}
