"""
国土交通省 不動産情報ライブラリAPI から取引価格データを取得してGeoJSONに変換
対象: 東京都（13）・神奈川県（14）
出力: public/estate_all.geojson

API仕様: https://www.reinfolib.mlit.go.jp/help/apiManual/
ヘッダー: Ocp-Apim-Subscription-Key
APIレスポンスにPoint(緯度経度)が含まれるためジオコーディング不要
"""

import json
import os
import time
import requests
from datetime import datetime

# 国交省 不動産情報ライブラリAPI
MLIT_API_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001"
MLIT_API_KEY = os.environ.get("MLIT_API_KEY", "")

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
    # 正しいヘッダー名: Ocp-Apim-Subscription-Key
    headers = {"Ocp-Apim-Subscription-Key": MLIT_API_KEY}

    try:
        resp = requests.get(MLIT_API_URL, params=params, headers=headers, timeout=60)
        print(f"    HTTP {resp.status_code}")
        resp.raise_for_status()
        data = resp.json()
        items = data.get("data", [])
        print(f"    取得: {len(items)}件")
        # デバッグ: 最初の1件のフィールドを表示
        if items:
            print(f"    フィールド例: {list(items[0].keys())[:10]}")
        return items
    except requests.HTTPError as e:
        print(f"    ✗ HTTP {e.response.status_code}: {e.response.text[:200]}")
        return []
    except Exception as e:
        print(f"    ✗ エラー: {e}")
        return []


def item_to_feature(item: dict, pref_name: str) -> dict | None:
    """APIレスポンスのアイテムをGeoJSONフィーチャに変換

    APIレスポンスのPoint列: "35.123456 139.123456" 形式（緯度 経度）
    または個別の列 Latitude / Longitude
    """
    # 座標取得: Pointフィールド優先
    lat, lng = None, None

    point_str = item.get("Point", "")
    if point_str and point_str.strip():
        parts = point_str.strip().split()
        if len(parts) == 2:
            try:
                lat = float(parts[0])
                lng = float(parts[1])
            except (ValueError, TypeError):
                pass

    # フォールバック: 個別フィールド
    if lat is None:
        try:
            lat = float(item.get("Latitude") or item.get("latitude") or 0)
            lng = float(item.get("Longitude") or item.get("longitude") or 0)
        except (ValueError, TypeError):
            pass

    # 座標が無効な場合はスキップ
    if not lat or not lng or lat == 0 or lng == 0:
        return None
    # 日本国外の座標はスキップ
    if not (20 <= lat <= 50 and 120 <= lng <= 150):
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

    municipality = item.get("Municipality", "")
    district = item.get("DistrictName", "")

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
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
    print(f"対象: {', '.join(p['name'] for p in PREFECTURES)}")
    print(f"APIキー設定: {'あり' if MLIT_API_KEY else 'なし'}\n")

    all_features = []
    summary = {}
    coords_found = 0
    coords_missing = 0

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
                    coords_found += 1
                else:
                    coords_missing += 1

            time.sleep(0.5)

        all_features.extend(pref_features)
        summary[pref_name] = len(pref_features)
        print(f"  → {pref_name} 小計: {len(pref_features):,}件")

    print(f"\n座標あり: {coords_found:,}件 / 座標なし(除外): {coords_missing:,}件")

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
