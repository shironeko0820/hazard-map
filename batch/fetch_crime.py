"""
警視庁（東京都）犯罪オープンデータを取得してGeoJSONに変換するスクリプト
座標なしデータは国土地理院APIでジオコーディング
出力: public/crime_tokyo.geojson
"""

import json
import csv
import io
import os
import time
import random
import requests
from datetime import datetime

KEISHICHO_BASE = "https://www.keishicho.metro.tokyo.lg.jp"
KEISHICHO_DATA_BASE = f"{KEISHICHO_BASE}/about_mpd/jokyo_tokei/jokyo/hanzaihasseijyouhou.files"

# 取得対象CSVと手口ラベル
CRIME_FILES = [
    ("tokyo_2024hittakuri.csv",          "ひったくり"),
    ("tokyo_2024syazyounerai.csv",        "車上ねらい"),
    ("tokyo_2024buhinnerai.csv",          "部品ねらい"),
    ("tokyo_2024zidouhanbaikinerai.csv",  "自販機ねらい"),
    ("tokyo_2024zidousyatou.csv",         "自動車盗"),
    ("tokyo_2024ootobaitou.csv",          "オートバイ盗"),
    ("tokyo_2024zitensyatou.csv",         "自転車盗"),
]

# 国土地理院 ジオコーディングAPI
GSI_GEOCODE_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch"

# 東京都主要区のセントロイド（ジオコーディング失敗時のフォールバック）
CITY_CENTROIDS = {
    "千代田区": (139.7535, 35.6940), "中央区": (139.7720, 35.6709),
    "港区":     (139.7514, 35.6581), "新宿区": (139.7036, 35.6938),
    "文京区":   (139.7522, 35.7081), "台東区": (139.7822, 35.7126),
    "墨田区":   (139.8013, 35.7101), "江東区": (139.8171, 35.6722),
    "品川区":   (139.7296, 35.6090), "目黒区": (139.6982, 35.6318),
    "大田区":   (139.7160, 35.5615), "世田谷区":(139.6532, 35.6464),
    "渋谷区":   (139.7016, 35.6580), "中野区": (139.6650, 35.7078),
    "杉並区":   (139.6365, 35.6993), "豊島区": (139.7161, 35.7275),
    "北区":     (139.7337, 35.7528), "荒川区": (139.7837, 35.7361),
    "板橋区":   (139.7105, 35.7507), "練馬区": (139.6517, 35.7356),
    "足立区":   (139.8045, 35.7759), "葛飾区": (139.8468, 35.7345),
    "江戸川区": (139.8687, 35.7065),
}


def decode_csv(content_bytes):
    for enc in ["utf-8-sig", "shift_jis", "cp932", "utf-8"]:
        try:
            return content_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    return None


def geocode_address(address: str, cache: dict) -> tuple[float, float] | None:
    """国土地理院APIでジオコーディング（キャッシュ付き）"""
    if address in cache:
        return cache[address]

    try:
        resp = requests.get(
            GSI_GEOCODE_URL,
            params={"q": address},
            timeout=10,
            headers={"User-Agent": "SmileMap/1.0"}
        )
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) > 0:
                coords = data[0]["geometry"]["coordinates"]
                result = (float(coords[0]), float(coords[1]))  # (lng, lat)
                cache[address] = result
                time.sleep(0.15)  # APIに優しくする
                return result
    except Exception:
        pass

    cache[address] = None
    return None


def city_fallback(city: str) -> tuple[float, float] | None:
    """市区町村セントロイドにわずかなジッターを加えて返す"""
    coords = CITY_CENTROIDS.get(city)
    if coords:
        lng, lat = coords
        # ±0.01度（約1km）のランダムジッター
        lng += random.uniform(-0.01, 0.01)
        lat += random.uniform(-0.01, 0.01)
        return (lng, lat)
    return None


def process_csv(filename: str, crime_type: str, geocache: dict) -> list[dict]:
    url = f"{KEISHICHO_DATA_BASE}/{filename}"
    print(f"\n--- {crime_type}: {filename} ---")

    try:
        resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  ✗ 取得失敗: {e}")
        return []

    content = decode_csv(resp.content)
    if not content:
        print("  ✗ デコード失敗")
        return []

    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    print(f"  読込: {len(rows)}行")

    features = []
    geocode_count = fallback_count = skip_count = 0

    # ユニークな住所を先にジオコーディング（高速化）
    unique_addresses = {}
    for row in rows:
        pref = row.get("都道府県（発生地）", "東京都").strip()
        city = row.get("市区町村（発生地）", "").strip()
        town = row.get("町丁目（発生地）", "").strip()
        if city:
            addr = f"{pref}{city}{town}"
            unique_addresses[addr] = city

    print(f"  ユニーク住所: {len(unique_addresses)}件をジオコーディング中...")
    for addr in unique_addresses:
        if addr not in geocache:
            geocode_address(addr, geocache)

    # フィーチャ生成
    for row in rows:
        pref = row.get("都道府県（発生地）", "東京都").strip()
        city = row.get("市区町村（発生地）", "").strip()
        town = row.get("町丁目（発生地）", "").strip()

        if not city:
            skip_count += 1
            continue

        addr = f"{pref}{city}{town}"
        coords = geocache.get(addr)

        if coords:
            geocode_count += 1
        else:
            # 市区町村セントロイドにフォールバック
            coords = city_fallback(city)
            if coords:
                fallback_count += 1
            else:
                skip_count += 1
                continue

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [coords[0], coords[1]]},
            "properties": {
                "crime_type": crime_type,
                "city": city,
                "town": town,
                "crime_name": row.get("罪名", "").strip(),
            },
        })

    print(f"  ✓ ジオコーディング:{geocode_count} フォールバック:{fallback_count} スキップ:{skip_count}")
    print(f"  → フィーチャ生成: {len(features)}件")
    return features


def main():
    print("=== 警視庁 犯罪オープンデータ取得開始 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    geocache: dict = {}
    all_features = []

    for filename, crime_type in CRIME_FILES:
        features = process_csv(filename, crime_type, geocache)
        all_features.extend(features)

    geojson = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "警視庁 犯罪オープンデータ",
            "generated_at": datetime.now().isoformat(),
            "total_features": len(all_features),
        },
    }

    out_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "crime_tokyo.geojson")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n=== 完了 ===")
    print(f"総取得件数: {len(all_features):,} 件")
    print(f"出力: {out_path}")


if __name__ == "__main__":
    main()
