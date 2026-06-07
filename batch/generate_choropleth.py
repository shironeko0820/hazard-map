"""
区・市ごとの平均不動産価格をコロプレスマップ用GeoJSONとして生成

処理フロー:
1. 行政区域境界GeoJSON（dataofjapan/land GitHub）を取得
2. estate_all.geojsonから市区町村ごとの平均価格を集計
3. 境界ポリゴンに価格データをマージして choropleth.geojson を出力
"""

import json
import os
import requests
from collections import defaultdict
from datetime import datetime

# 行政区域境界データ（dataofjapan/land: GitHub rawコンテンツ）
BOUNDARY_URLS = {
    "東京都": [
        "https://raw.githubusercontent.com/dataofjapan/land/master/tokyo.geojson",
        "https://geoshape.ex.nii.ac.jp/city/geojson/2020/13.geojson",
    ],
    "神奈川県": [
        "https://raw.githubusercontent.com/dataofjapan/land/master/kanagawa.geojson",
        "https://geoshape.ex.nii.ac.jp/city/geojson/2020/14.geojson",
    ],
}

BASE_DIR = os.path.dirname(__file__)
ESTATE_PATH = os.path.join(BASE_DIR, "..", "public", "estate_all.geojson")
OUTPUT_PATH = os.path.join(BASE_DIR, "..", "public", "choropleth.geojson")


def download_boundaries(pref_name: str) -> list[dict]:
    """行政区域境界GeoJSONを取得（複数URLをフォールバック）"""
    urls = BOUNDARY_URLS.get(pref_name, [])
    for url in urls:
        print(f"  境界データ取得中: {url}")
        try:
            resp = requests.get(url, timeout=60, headers={"User-Agent": "SmileMap/1.0"})
            print(f"  HTTP {resp.status_code}")
            if resp.status_code != 200:
                continue
            data = resp.json()
            features = data.get("features", [])
            if not features:
                print("  フィーチャ数0 → 次のURLを試します")
                continue
            print(f"  → {len(features)}ポリゴン取得成功")
            # プロパティキーを確認
            if features:
                sample_props = features[0].get("properties", {})
                print(f"  プロパティキー: {list(sample_props.keys())[:8]}")
                print(f"  サンプル値: {list(sample_props.values())[:8]}")
            return features
        except Exception as e:
            print(f"  ✗ エラー: {e}")
    print(f"  ✗ {pref_name}の境界データ取得失敗（全URLを試行済み）")
    return []


def detect_muni_field(features: list[dict]) -> str:
    """市区町村名フィールドを自動検出"""
    if not features:
        return ""
    props = features[0].get("properties", {})
    # 既知フィールド名の候補
    candidates = ["N03_004", "nam_ja", "name_ja", "city", "city_ja", "name", "市区町村名"]
    for key in candidates:
        if key in props:
            print(f"  市区町村フィールド自動検出: {key} = {props[key]}")
            return key
    # 日本語値を持つフィールドを探す
    for key, val in props.items():
        if isinstance(val, str) and any('　' <= c <= '鿿' for c in val):
            print(f"  日本語フィールドを使用: {key} = {val}")
            return key
    print(f"  ✗ 市区町村フィールドが見つかりません。利用可能なキー: {list(props.keys())}")
    return ""


def detect_pref_field(features: list[dict]) -> str:
    """都道府県名フィールドを自動検出"""
    if not features:
        return ""
    props = features[0].get("properties", {})
    candidates = ["N03_001", "pref_ja", "prefecture", "pref"]
    for key in candidates:
        if key in props:
            return key
    return ""


def aggregate_prices(estate_path: str) -> dict[str, dict]:
    """estate_all.geojsonから市区町村ごとの価格統計を集計"""
    print("\n価格データ集計中...")
    stats: dict[str, list] = defaultdict(list)
    meta: dict[str, dict] = {}

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
            key = f"{pref}|{muni}"
            stats[key].append(price_per_sqm)
            meta[key] = {"prefecture": pref, "municipality": muni}

    result = {}
    for key, prices in stats.items():
        m = meta[key]
        sorted_prices = sorted(prices)
        result[key] = {
            "prefecture": m["prefecture"],
            "municipality": m["municipality"],
            "avg_price_per_sqm": int(sum(prices) / len(prices)),
            "median_price_per_sqm": int(sorted_prices[len(prices) // 2]),
            "max_price_per_sqm": max(prices),
            "min_price_per_sqm": min(prices),
            "transaction_count": len(prices),
            "avg_price_per_tsubo": int(sum(prices) / len(prices) * 3.30579),
        }

    print(f"  → {len(result)}市区町村の価格データを集計")

    # サンプル表示
    top5 = sorted(result.values(), key=lambda x: -x["avg_price_per_sqm"])[:5]
    print("  高価格TOP5:")
    for r in top5:
        print(f"    {r['prefecture']}{r['municipality']}: {r['avg_price_per_sqm']:,}円/㎡ ({r['transaction_count']:,}件)")

    return result


def build_choropleth(
    boundary_features: list[dict],
    price_stats: dict[str, dict],
    pref_name: str,
    muni_field: str,
    pref_field: str,
) -> list[dict]:
    """境界ポリゴンに価格データをマージ"""
    output_features = []
    matched = 0
    unmatched_names = []

    for feat in boundary_features:
        props = feat.get("properties", {})
        muni_name = props.get(muni_field, "")
        feat_pref = props.get(pref_field, pref_name) if pref_field else pref_name

        if not muni_name:
            continue

        # マッチングキー（都道府県|市区町村）
        key = f"{pref_name}|{muni_name}"
        price_data = price_stats.get(key)

        if price_data:
            matched += 1
            new_props = {
                "prefecture": pref_name,
                "municipality": muni_name,
                **price_data,
            }
        else:
            unmatched_names.append(muni_name)
            new_props = {
                "prefecture": pref_name,
                "municipality": muni_name,
                "avg_price_per_sqm": 0,
                "transaction_count": 0,
            }

        output_features.append({
            "type": "Feature",
            "geometry": feat.get("geometry"),
            "properties": new_props,
        })

    print(f"  マッチ: {matched}件 / 未マッチ: {len(unmatched_names)}件")
    if unmatched_names[:5]:
        print(f"  未マッチ例: {unmatched_names[:5]}")
    return output_features


def main():
    print("=== コロプレスマップGeoJSON生成 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    price_stats = aggregate_prices(ESTATE_PATH)
    if not price_stats:
        print("価格データがありません。estate_all.geojsonを先に生成してください。")
        return

    all_features = []
    summary = {}

    for pref_name in ["東京都", "神奈川県"]:
        print(f"\n=== {pref_name} ===")
        boundaries = download_boundaries(pref_name)
        if not boundaries:
            summary[pref_name] = {"total": 0, "matched": 0}
            continue

        muni_field = detect_muni_field(boundaries)
        pref_field = detect_pref_field(boundaries)

        if not muni_field:
            print(f"  ✗ 市区町村フィールドが特定できないためスキップ")
            summary[pref_name] = {"total": 0, "matched": 0}
            continue

        features = build_choropleth(boundaries, price_stats, pref_name, muni_field, pref_field)
        all_features.extend(features)
        matched = sum(1 for f in features if f["properties"].get("transaction_count", 0) > 0)
        summary[pref_name] = {"total": len(features), "matched": matched}

    # 価格範囲
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

    geojson = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "行政区域境界: dataofjapan/land / 価格: 国土交通省",
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
    if price_range["max"] > 0:
        print(f"  価格範囲: {price_range['min']:,} ~ {price_range['max']:,} 円/㎡")
    print(f"  出力: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
