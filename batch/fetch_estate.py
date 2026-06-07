"""
国土交通省 不動産情報ライブラリAPI から取引価格データを取得してGeoJSONに変換
対象: 東京都（13）・神奈川県（14）
出力: public/estate_all.geojson
"""

import json
import os
import time
import requests
from datetime import datetime

# 国交省 不動産情報ライブラリAPI
MLIT_API_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001"
MLIT_API_KEY = os.environ.get("MLIT_API_KEY", "")

# 国土地理院 ジオコーディングAPI
GSI_GEOCODE_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch"

# 取得対象都道府県
PREFECTURES = [
    {"code": "13", "name": "東京都"},
    {"code": "14", "name": "神奈川県"},
]

# 取得対象年・四半期（直近1年分）
PERIODS = [
    {"year": 2024, "quarter": 4},
    {"year": 2024, "quarter": 3},
    {"year": 2024, "quarter": 2},
    {"year": 2024, "quarter": 1},
]

# 物件種別フィルタ（空リストで全種別取得）
PROPERTY_TYPES = []  # 例: ["中古マンション等", "宅地(土地)"]

# 坪単価変換係数
SQM_TO_TSUBO = 3.30579


def fetch_transactions(pref_code: str, year: int, quarter: int) -> list[dict]:
    """APIから取引データを取得"""
    if not MLIT_API_KEY:
        print("  ✗ MLIT_API_KEY が設定されていません")
        return []

    params = {
        "year": year,
        "quarter": quarter,
        "area": pref_code,
    }
    headers = {"apikey": MLIT_API_KEY}

    try:
        resp = requests.get(MLIT_API_URL, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("data", [])
        print(f"    取得: {len(items)}件")
        return items
    except requests.HTTPError as e:
        print(f"    ✗ HTTP {e.response.status_code}: {e}")
        return []
    except Exception as e:
        print(f"    ✗ エラー: {e}")
        return []


geocache: dict = {}


def geocode(address: str) -> tuple[float, float] | None:
    """国土地理院APIでジオコーディング（キャッシュ付き）"""
    if address in geocache:
        return geocache[address]
    try:
        resp = requests.get(
            GSI_GEOCODE_URL,
            params={"q": address},
            timeout=10,
            headers={"User-Agent": "SmileMap/1.0"},
        )
        if resp.status_code == 200:
            data = resp.json()
            if data:
                coords = data[0]["geometry"]["coordinates"]
                result = (float(coords[0]), float(coords[1]))
                geocache[address] = result
                time.sleep(0.1)
                return result
    except Exception:
        pass
    geocache[address] = None
    return None


def item_to_feature(item: dict, pref_name: str) -> dict | None:
    """APIレスポンスのアイテムをGeoJSONフィーチャに変換"""
    # 住所を組み立てる
    municipality = item.get("Municipality", "")
    district = item.get("DistrictName", "")
    address = f"{pref_name}{municipality}{district}"

    coords = geocode(address)
    if not coords:
        # 市区町村レベルでリトライ
        address_city = f"{pref_name}{municipality}"
        coords = geocode(address_city)
    if not coords:
        return None

    # 価格情報
    try:
        trade_price = int(item.get("TradePrice", 0) or 0)
    except (ValueError, TypeError):
        trade_price = 0

    try:
        area = float(item.get("Area", 0) or 0)
    except (ValueError, TypeError):
        area = 0

    price_per_sqm = int(trade_price / area) if area > 0 else 0
    price_per_tsubo = int(price_per_sqm * SQM_TO_TSUBO)

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [coords[0], coords[1]]},
        "properties": {
            "price": trade_price,
            "price_per_sqm": price_per_sqm,
            "price_per_tsubo": price_per_tsubo,
            "property_type": item.get("Type", ""),
            "municipality": municipality,
            "district": district,
            "nearest_station": item.get("NearestStation", ""),
            "walk_minutes": item.get("TimeToNearestStation", ""),
            "area_sqm": area,
            "building_year": item.get("BuildingYear", ""),
            "period": item.get("Period", ""),
            "prefecture": pref_name,
        },
    }


def main():
    print("=== 国交省 不動産取引価格データ取得開始 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"対象: {', '.join(p['name'] for p in PREFECTURES)}\n")

    all_features = []
    summary = {}

    for pref in PREFECTURES:
        pref_code = pref["code"]
        pref_name = pref["name"]
        print(f"\n=== {pref_name}（code={pref_code}）===")
        pref_features = []

        for period in PERIODS:
            year, quarter = period["year"], period["quarter"]
            print(f"  {year}年 第{quarter}四半期")
            items = fetch_transactions(pref_code, year, quarter)

            for item in items:
                feature = item_to_feature(item, pref_name)
                if feature:
                    pref_features.append(feature)

            time.sleep(1)  # APIに優しくする

        all_features.extend(pref_features)
        summary[pref_name] = len(pref_features)
        print(f"  → {pref_name} 小計: {len(pref_features):,}件")

    # GeoJSON出力
    geojson = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "国土交通省 不動産情報ライブラリAPI",
            "generated_at": datetime.now().isoformat(),
            "total_features": len(all_features),
            "by_prefecture": summary,
        },
    }

    out_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "estate_all.geojson")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n=== 完了 ===")
    for pref, count in summary.items():
        print(f"  {pref}: {count:,}件")
    print(f"  合計: {len(all_features):,}件")
    print(f"  出力: {out_path}")


if __name__ == "__main__":
    main()
