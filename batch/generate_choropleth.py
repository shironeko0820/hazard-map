"""
区・市ごとの平均不動産価格をコロプレスマップ用GeoJSONとして生成

処理フロー:
1. 行政区域境界GeoJSON（geoshape.ex.nii.ac.jp）を取得
2. estate_all.geojsonから市区町村ごとの平均価格を集計
3. 境界ポリゴンに価格データをマージして choropleth.geojson を出力
"""

import json
import os
import requests
from collections import defaultdict
from datetime import datetime

# 行政区域境界データ（国土数値情報 N03 形式）
# geoshape.ex.nii.ac.jp: 国立情報学研究所が提供する行政区域GeoJSON
BOUNDARY_URLS = {
    "東京都": "https://geoshape.ex.nii.ac.jp/city/geojson/2020/13.geojson",
    "神奈川県": "https://geoshape.ex.nii.ac.jp/city/geojson/2020/14.geojson",
}

# N03プロパティの市区町村名フィールド
MUNI_FIELD = "N03_004"  # 市区町村名（区名/市名）
PREF_FIELD = "N03_001"  # 都道府県名
CODE_FIELD = "N03_007"  # 行政区域コード

# ファイルパス
BASE_DIR = os.path.dirname(__file__)
ESTATE_PATH = os.path.join(BASE_DIR, "..", "public", "estate_all.geojson")
OUTPUT_PATH = os.path.join(BASE_DIR, "..", "public", "choropleth.geojson")


def download_boundaries(url: str, pref_name: str) -> list[dict]:
    """行政区域境界GeoJSONを取得"""
    print(f"  境界データ取得: {url}")
    try:
        resp = requests.get(url, timeout=60, headers={"User-Agent": "SmileMap/1.0"})
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        print(f"  → {len(features)}ポリゴン取得")
        return features
    except Exception as e:
        print(f"  ✗ エラー: {e}")
        return []


def aggregate_prices(estate_path: str) -> dict[str, dict]:
    """estate_all.geojsonから市区町村ごとの価格統計を集計"""
    print("\n価格データ集計中...")
    stats: dict[str, dict] = defaultdict(lambda: {
        "prices": [], "prefecture": ""
    })

    try:
        with open(estate_path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"  ✗ {estate_path} が見つかりません")
        return {}

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        pref = props.get("prefecture", "")
        muni = props.get("municipality", "")
        price_per_sqm = props.get("price_per_sqm", 0)

        if muni and price_per_sqm > 0:
            key = f"{pref}{muni}"
            stats[key]["prices"].append(price_per_sqm)
            stats[key]["prefecture"] = pref
            stats[key]["municipality"] = muni

    # 統計値を計算
    result = {}
    for key, s in stats.items():
        prices = s["prices"]
        if prices:
            result[key] = {
                "prefecture": s["prefecture"],
                "municipality": s["municipality"],
                "avg_price_per_sqm": int(sum(prices) / len(prices)),
                "median_price_per_sqm": int(sorted(prices)[len(prices) // 2]),
                "max_price_per_sqm": max(prices),
                "min_price_per_sqm": min(prices),
                "transaction_count": len(prices),
                "avg_price_per_tsubo": int(sum(prices) / len(prices) * 3.30579),
            }

    print(f"  → {len(result)}市区町村の価格データを集計")
    return result


def build_choropleth(boundary_features: list[dict], price_stats: dict[str, dict]) -> list[dict]:
    """境界ポリゴンに価格データをマージしてフィーチャリスト生成"""
    output_features = []
    matched = 0
    unmatched = 0

    for feat in boundary_features:
        props = feat.get("properties", {})
        pref_name = props.get(PREF_FIELD, "")
        muni_name = props.get(MUNI_FIELD, "")

        if not muni_name:
            # 政令市（区のない市）など: N03_003を使う
            muni_name = props.get("N03_003", "")
        if not muni_name:
            unmatched += 1
            continue

        key = f"{pref_name}{muni_name}"
        price_data = price_stats.get(key)

        if price_data:
            matched += 1
            new_props = {
                "prefecture": pref_name,
                "municipality": muni_name,
                "city_code": props.get(CODE_FIELD, ""),
                **price_data,
            }
        else:
            # 価格データなし（農村地域など）
            unmatched += 1
            new_props = {
                "prefecture": pref_name,
                "municipality": muni_name,
                "city_code": props.get(CODE_FIELD, ""),
                "avg_price_per_sqm": 0,
                "transaction_count": 0,
            }

        output_features.append({
            "type": "Feature",
            "geometry": feat.get("geometry"),
            "properties": new_props,
        })

    print(f"  マッチ: {matched}件 / 未マッチ: {unmatched}件")
    return output_features


def main():
    print("=== コロプレスマップGeoJSON生成 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 価格統計を集計
    price_stats = aggregate_prices(ESTATE_PATH)
    if not price_stats:
        print("価格データがありません。estate_all.geojsonを先に生成してください。")
        return

    # 境界データ取得＆マージ
    all_features = []
    summary = {}

    for pref_name, url in BOUNDARY_URLS.items():
        print(f"\n=== {pref_name} ===")
        boundaries = download_boundaries(url, pref_name)
        features = build_choropleth(boundaries, price_stats)
        all_features.extend(features)
        matched = sum(1 for f in features if f["properties"].get("transaction_count", 0) > 0)
        summary[pref_name] = {"total": len(features), "matched": matched}

    # 価格範囲を計算（凡例用）
    prices = [
        f["properties"]["avg_price_per_sqm"]
        for f in all_features
        if f["properties"].get("avg_price_per_sqm", 0) > 0
    ]
    price_range = {
        "min": min(prices) if prices else 0,
        "max": max(prices) if prices else 0,
        "p25": sorted(prices)[len(prices) // 4] if prices else 0,
        "p75": sorted(prices)[3 * len(prices) // 4] if prices else 0,
    }
    print(f"\n価格範囲: {price_range['min']:,} ~ {price_range['max']:,} 円/㎡")
    print(f"25%ile: {price_range['p25']:,} / 75%ile: {price_range['p75']:,}")

    # GeoJSON出力
    geojson = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "行政区域境界: geoshape.ex.nii.ac.jp / 価格: 国土交通省",
            "generated_at": datetime.now().isoformat(),
            "price_range": price_range,
            "by_prefecture": summary,
        },
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n=== 完了 ===")
    for pref, s in summary.items():
        print(f"  {pref}: 境界{s['total']}件, 価格マッチ{s['matched']}件")
    print(f"  出力: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
