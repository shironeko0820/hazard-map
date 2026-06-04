"""
犯罪オープンデータを取得してGeoJSONに変換するスクリプト（複数都道府県対応）
出力: public/crime_all.geojson
"""

import json
import csv
import io
import os
import time
import random
import requests
from datetime import datetime

# ---- 都道府県設定 ----
PREFECTURES = {
    "tokyo": {
        "name": "東京都",
        "base_url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/hanzaihasseijyouhou.files",
        "files": [
            ("tokyo_2024hittakuri.csv",         "ひったくり"),
            ("tokyo_2024syazyounerai.csv",       "車上ねらい"),
            ("tokyo_2024buhinnerai.csv",          "部品ねらい"),
            ("tokyo_2024zidouhanbaikinerai.csv",  "自販機ねらい"),
            ("tokyo_2024zidousyatou.csv",         "自動車盗"),
            ("tokyo_2024ootobaitou.csv",          "オートバイ盗"),
            ("tokyo_2024zitensyatou.csv",         "自転車盗"),
        ],
    },
    "kanagawa": {
        "name": "神奈川県",
        "base_url": "https://www.police.pref.kanagawa.jp/assets/entry",
        "files": [
            ("kanagawa_2024hittakuri.csv",        "ひったくり"),
            ("kanagawa_2024syazyounerai.csv",     "車上ねらい"),
            ("kanagawa_2024buhinnerai.csv",        "部品ねらい"),
            ("kanagawa_2024zidouhanbaikinerai.csv","自販機ねらい"),
            ("kanagawa_2024zidousyatou.csv",      "自動車盗"),
            ("kanagawa_2024ootobaitou.csv",       "オートバイ盗"),
            ("kanagawa_2024zitensyatou.csv",      "自転車盗"),
        ],
    },
}

# 国土地理院 ジオコーディングAPI
GSI_GEOCODE_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch"

# 市区町村セントロイド（ジオコーディング失敗時のフォールバック）
CITY_CENTROIDS = {
    # 東京都
    "千代田区": (139.7535, 35.6940), "中央区":   (139.7720, 35.6709),
    "港区":     (139.7514, 35.6581), "新宿区":   (139.7036, 35.6938),
    "文京区":   (139.7522, 35.7081), "台東区":   (139.7822, 35.7126),
    "墨田区":   (139.8013, 35.7101), "江東区":   (139.8171, 35.6722),
    "品川区":   (139.7296, 35.6090), "目黒区":   (139.6982, 35.6318),
    "大田区":   (139.7160, 35.5615), "世田谷区": (139.6532, 35.6464),
    "渋谷区":   (139.7016, 35.6580), "中野区":   (139.6650, 35.7078),
    "杉並区":   (139.6365, 35.6993), "豊島区":   (139.7161, 35.7275),
    "北区":     (139.7337, 35.7528), "荒川区":   (139.7837, 35.7361),
    "板橋区":   (139.7105, 35.7507), "練馬区":   (139.6517, 35.7356),
    "足立区":   (139.8045, 35.7759), "葛飾区":   (139.8468, 35.7345),
    "江戸川区": (139.8687, 35.7065),
    # 神奈川県
    "横浜市":   (139.6380, 35.4437), "川崎市":   (139.7017, 35.5309),
    "相模原市": (139.3756, 35.5533), "横須賀市": (139.6747, 35.2813),
    "平塚市":   (139.3497, 35.3278), "鎌倉市":   (139.5467, 35.3197),
    "藤沢市":   (139.4908, 35.3383), "小田原市": (139.1575, 35.2651),
    "茅ヶ崎市": (139.4034, 35.3330), "逗子市":   (139.5769, 35.2950),
    "三浦市":   (139.6233, 35.2139), "秦野市":   (139.2207, 35.3735),
    "厚木市":   (139.3647, 35.4412), "大和市":   (139.4628, 35.4888),
    "伊勢原市": (139.3137, 35.4022), "海老名市": (139.3911, 35.4468),
    "座間市":   (139.4078, 35.4878), "南足柄市": (139.1030, 35.3225),
    "綾瀬市":   (139.4267, 35.4348),
}


def decode_csv(content_bytes: bytes) -> str | None:
    for enc in ["utf-8-sig", "shift_jis", "cp932", "utf-8"]:
        try:
            return content_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    return None


def geocode_address(address: str, cache: dict) -> tuple[float, float] | None:
    if address in cache:
        return cache[address]
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
                cache[address] = result
                time.sleep(0.15)
                return result
    except Exception:
        pass
    cache[address] = None
    return None


def city_fallback(city: str) -> tuple[float, float] | None:
    coords = CITY_CENTROIDS.get(city)
    if coords:
        lng, lat = coords
        lng += random.uniform(-0.01, 0.01)
        lat += random.uniform(-0.01, 0.01)
        return (lng, lat)
    return None


def process_csv(base_url: str, filename: str, crime_type: str, pref_name: str, geocache: dict) -> list[dict]:
    url = f"{base_url}/{filename}"
    print(f"  [{crime_type}] {filename}")

    try:
        resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    ✗ 取得失敗: {e}")
        return []

    content = decode_csv(resp.content)
    if not content:
        print("    ✗ デコード失敗")
        return []

    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    print(f"    読込: {len(rows)}行")

    # ユニーク住所をジオコーディング
    unique_addresses = {}
    for row in rows:
        pref  = row.get("都道府県（発生地）", pref_name).strip()
        city  = row.get("市区町村（発生地）", "").strip()
        town  = row.get("町丁目（発生地）", "").strip()
        if city:
            unique_addresses[f"{pref}{city}{town}"] = city

    new_addrs = [a for a in unique_addresses if a not in geocache]
    if new_addrs:
        print(f"    ジオコーディング: {len(new_addrs)}件")
        for addr in new_addrs:
            geocode_address(addr, geocache)

    features = []
    geocode_count = fallback_count = skip_count = 0

    for row in rows:
        pref  = row.get("都道府県（発生地）", pref_name).strip()
        city  = row.get("市区町村（発生地）", "").strip()
        town  = row.get("町丁目（発生地）", "").strip()
        if not city:
            skip_count += 1
            continue

        addr   = f"{pref}{city}{town}"
        coords = geocache.get(addr)

        if coords:
            geocode_count += 1
        else:
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
                "prefecture": pref_name,
                "city": city,
                "town": town,
                "crime_name": row.get("罪名", "").strip(),
            },
        })

    print(f"    ✓ 生成: {len(features)}件 (GEO:{geocode_count} FB:{fallback_count} SKIP:{skip_count})")
    return features


def main():
    print("=== 犯罪オープンデータ取得開始 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"対象: {', '.join(v['name'] for v in PREFECTURES.values())}\n")

    geocache: dict = {}
    all_features = []
    summary = {}

    for pref_key, pref_conf in PREFECTURES.items():
        pref_name = pref_conf["name"]
        print(f"\n=== {pref_name} ===")
        pref_features = []

        for filename, crime_type in pref_conf["files"]:
            features = process_csv(
                pref_conf["base_url"], filename, crime_type, pref_name, geocache
            )
            pref_features.extend(features)

        all_features.extend(pref_features)
        summary[pref_name] = len(pref_features)
        print(f"  → {pref_name} 小計: {len(pref_features):,}件")

    # GeoJSON出力
    geojson = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "各都道府県警察 犯罪オープンデータ",
            "generated_at": datetime.now().isoformat(),
            "total_features": len(all_features),
            "by_prefecture": summary,
        },
    }

    out_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "crime_all.geojson")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n=== 完了 ===")
    for pref, count in summary.items():
        print(f"  {pref}: {count:,}件")
    print(f"  合計: {len(all_features):,}件")
    print(f"  出力: {out_path}")


if __name__ == "__main__":
    main()
