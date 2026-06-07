"""
全国コロプレスマップGeoJSON生成

処理フロー:
1. price_by_municipality.json から市区町村別価格データを読込
   （なければ estate_all.geojson から集計）
2. dataofjapan/land の japan.geojson（全国境界）を取得
3. 境界ポリゴンに価格データをマージして choropleth.geojson を出力

マッチング戦略（N03_004: 市区町村名, N03_003: 郡・政令市名）:
  1. pref|N03_004                  → 通常市区町村（例: 千代田区）
  2. pref|N03_003+N03_004          → 政令市の区（例: 横浜市鶴見区）
  3. pref|N03_003                  → 政令市全体フォールバック
"""

import json
import os
import requests
from collections import defaultdict
from datetime import datetime

JAPAN_GEOJSON_URL = "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson"
# ワークフローからローカルパスを指定できる（大容量ファイル対策）
JAPAN_GEOJSON_LOCAL = os.environ.get("JAPAN_GEOJSON_LOCAL", "")

BASE_DIR = os.path.dirname(__file__)
PRICE_JSON_PATH  = os.path.join(BASE_DIR, "..", "public", "price_by_municipality.json")
ESTATE_PATH      = os.path.join(BASE_DIR, "..", "public", "estate_all.geojson")
OUTPUT_PATH      = os.path.join(BASE_DIR, "..", "public", "choropleth.geojson")


# ── 価格データ読込 ──────────────────────────────────────────────────────────

def load_price_stats() -> dict[str, dict]:
    """price_by_municipality.json または estate_all.geojson から価格統計を取得"""

    # 優先: price_by_municipality.json（全国対応）
    if os.path.exists(PRICE_JSON_PATH):
        print(f"価格データ読込: {PRICE_JSON_PATH}")
        with open(PRICE_JSON_PATH, encoding="utf-8") as f:
            data = json.load(f)
        print(f"  → {len(data):,}市区町村")
        return data

    # フォールバック: estate_all.geojson から集計
    print(f"estate_all.geojson から集計: {ESTATE_PATH}")
    stats: dict[str, list] = defaultdict(list)
    meta: dict[str, dict] = {}

    try:
        with open(ESTATE_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"  ✗ {ESTATE_PATH} が見つかりません")
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
            "median_price_per_sqm": sorted_prices[len(prices) // 2],
            "transaction_count": len(prices),
            "avg_price_per_tsubo": int(sum(prices) / len(prices) * 3.30579),
        }

    print(f"  → {len(result):,}市区町村")
    return result


# ── 境界データ取得 ──────────────────────────────────────────────────────────

def download_japan_geojson() -> list[dict]:
    """全国行政区域GeoJSONを取得（ローカルファイル優先）"""
    # ローカルファイル優先（ワークフローで事前にダウンロード済みの場合）
    if JAPAN_GEOJSON_LOCAL and os.path.exists(JAPAN_GEOJSON_LOCAL):
        print(f"\nローカルファイルから読込: {JAPAN_GEOJSON_LOCAL}")
        try:
            with open(JAPAN_GEOJSON_LOCAL, encoding="utf-8") as f:
                data = json.load(f)
            features = data.get("features", [])
            print(f"  → {len(features):,}ポリゴン読込成功")
            if features:
                sample = features[0].get("properties", {})
                print(f"  プロパティキー: {list(sample.keys())[:10]}")
            return features
        except Exception as e:
            print(f"  ローカル読込失敗、URLからダウンロード: {e}")

    # URLからダウンロード（フォールバック）
    print(f"\n全国境界データ取得中: {JAPAN_GEOJSON_URL}")
    try:
        resp = requests.get(JAPAN_GEOJSON_URL, timeout=300, headers={"User-Agent": "SmileMap/1.0"})
        resp.raise_for_status()
        features = resp.json().get("features", [])
        print(f"  → {len(features):,}ポリゴン取得成功")
        if features:
            sample = features[0].get("properties", {})
            print(f"  プロパティキー: {list(sample.keys())[:10]}")
        return features
    except Exception as e:
        print(f"  ✗ 取得失敗: {e}")
        return []


# ── マッチング ──────────────────────────────────────────────────────────────

def build_lookup_keys(props: dict, pref_name: str) -> list[str]:
    """GeoJSONフィーチャから可能なマッチングキーを生成（優先順）

    japan.geojson のフィールド:
      N03_001: 都道府県名
      N03_003: 郡名 or 政令市名（例: 横浜市, 津久井郡）
      N03_004: 市区町村名（例: 鶴見区, 相模原市）
    """
    n03_003 = (props.get("N03_003") or "").strip()
    n03_004 = (props.get("N03_004") or "").strip()

    keys = []
    # 1. 区名のみ（東京23区・政令市の区）
    if n03_004:
        keys.append(f"{pref_name}|{n03_004}")
    # 2. 政令市名+区名（例: 横浜市鶴見区）
    if n03_003 and n03_004:
        keys.append(f"{pref_name}|{n03_003}{n03_004}")
    # 3. 政令市全体（区データがない場合のフォールバック）
    if n03_003 and not n03_004:
        keys.append(f"{pref_name}|{n03_003}")
    return keys


# ── コロプレス生成 ──────────────────────────────────────────────────────────

def build_choropleth(
    all_features: list[dict],
    price_stats: dict[str, dict],
) -> list[dict]:
    """全国境界ポリゴンに価格データをマージ"""
    output_features = []
    matched = 0
    no_geom = 0
    no_name = 0
    unmatched_sample: list[str] = []

    # 都道府県名フィールドの候補を自動検出
    pref_field = None
    if all_features:
        sample_props = all_features[0].get("properties", {})
        for candidate in ["N03_001", "pref_ja", "prefecture", "pref"]:
            if candidate in sample_props:
                pref_field = candidate
                print(f"  都道府県フィールド: {pref_field}")
                break

    for feat in all_features:
        geom = feat.get("geometry")
        if not geom:
            no_geom += 1
            continue

        props = feat.get("properties", {})
        pref_name = (props.get(pref_field, "") if pref_field else "").strip()
        n03_004 = (props.get("N03_004") or "").strip()
        n03_003 = (props.get("N03_003") or "").strip()

        if not pref_name:
            no_name += 1
            continue

        # マッチング
        price_data = None
        matched_key = None
        for key in build_lookup_keys(props, pref_name):
            if key in price_stats:
                price_data = price_stats[key]
                matched_key = key
                break

        # 表示用市区町村名（N03_003 + N03_004 or どちらか）
        display_muni = (n03_003 + n03_004) if (n03_003 and n03_004) else (n03_004 or n03_003)

        if price_data:
            matched += 1
            new_props = {
                "prefecture": pref_name,
                "municipality": display_muni,
                **price_data,
            }
        else:
            if len(unmatched_sample) < 10:
                unmatched_sample.append(f"{pref_name}|{display_muni}")
            new_props = {
                "prefecture": pref_name,
                "municipality": display_muni,
                "avg_price_per_sqm": 0,
                "transaction_count": 0,
            }

        output_features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": new_props,
        })

    total = len(output_features)
    print(f"  総ポリゴン: {total:,}, 価格マッチ: {matched:,}, ジオメトリなし: {no_geom}, 都道府県名なし: {no_name}")
    print(f"  マッチ率: {matched/total*100:.1f}%" if total > 0 else "")
    if unmatched_sample:
        print(f"  未マッチ例: {unmatched_sample[:5]}")

    return output_features


# ── メイン ──────────────────────────────────────────────────────────────────

def main():
    print("=== 全国コロプレスマップGeoJSON生成 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 価格データ読込
    price_stats = load_price_stats()
    if not price_stats:
        print("価格データがありません。fetch_price_national.py を先に実行してください。")
        return

    # サンプル表示
    top5 = sorted(price_stats.values(), key=lambda x: -x.get("avg_price_per_sqm", 0))[:5]
    print("  高価格TOP5:")
    for r in top5:
        print(f"    {r['prefecture']}{r['municipality']}: {r['avg_price_per_sqm']:,}円/㎡ ({r['transaction_count']:,}件)")

    # 全国境界ダウンロード
    all_features = download_japan_geojson()
    if not all_features:
        print("境界データの取得に失敗しました。")
        return

    # コロプレス生成
    print("\nコロプレス生成中...")
    output_features = build_choropleth(all_features, price_stats)

    # 価格範囲
    prices = [
        f["properties"]["avg_price_per_sqm"]
        for f in output_features
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
        "features": output_features,
        "metadata": {
            "source": "行政区域境界: dataofjapan/land / 価格: 国土交通省不動産情報ライブラリ",
            "generated_at": datetime.now().isoformat(),
            "total_polygons": len(output_features),
            "matched_polygons": sum(1 for f in output_features if f["properties"].get("transaction_count", 0) > 0),
            "price_range": price_range,
        },
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n=== 完了 ===")
    print(f"  総ポリゴン: {len(output_features):,}")
    matched = geojson["metadata"]["matched_polygons"]
    print(f"  価格マッチ: {matched:,}")
    if price_range["max"] > 0:
        print(f"  価格範囲: {price_range['min']:,} ~ {price_range['max']:,} 円/㎡")
    print(f"  出力: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
