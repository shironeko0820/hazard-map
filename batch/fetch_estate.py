"""
国土交通省 不動産情報ライブラリAPI から取引価格データを取得してGeoJSONに変換
対象: 東京都（13）・神奈川県（14）
出力: public/estate_all.geojson

APIレスポンスに座標フィールドなし → 国土地理院APIでジオコーディング
ユニーク住所のみAPIコールしてキャッシュ利用で効率化
"""

import json
import os
import time
import random
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

# 坪単価変換係数
SQM_TO_TSUBO = 3.30579

# 市区町村の代表座標（ジオコーディング失敗時フォールバック）
CITY_CENTROIDS: dict[str, tuple[float, float]] = {
    "千代田区": (139.7536, 35.6940), "中央区": (139.7740, 35.6706),
    "港区": (139.7514, 35.6581), "新宿区": (139.7036, 35.6938),
    "文京区": (139.7519, 35.7080), "台東区": (139.7796, 35.7089),
    "墨田区": (139.8017, 35.7101), "江東区": (139.8172, 35.6728),
    "品川区": (139.7300, 35.6094), "目黒区": (139.6983, 35.6339),
    "大田区": (139.7161, 35.5617), "世田谷区": (139.6531, 35.6464),
    "渋谷区": (139.7019, 35.6639), "中野区": (139.6641, 35.7075),
    "杉並区": (139.6360, 35.6994), "豊島区": (139.7197, 35.7294),
    "北区": (139.7336, 35.7528), "荒川区": (139.7836, 35.7358),
    "板橋区": (139.7094, 35.7750), "練馬区": (139.6519, 35.7356),
    "足立区": (139.7847, 35.7753), "葛飾区": (139.8442, 35.7444),
    "江戸川区": (139.8686, 35.7067),
    "横浜市": (139.6380, 35.4436), "川崎市": (139.7031, 35.5309),
    "相模原市": (139.3756, 35.5694), "横須賀市": (139.6747, 35.2814),
    "平塚市": (139.3167, 35.3286), "鎌倉市": (139.5467, 35.3197),
    "藤沢市": (139.4908, 35.3381), "小田原市": (139.1572, 35.2656),
    "茅ヶ崎市": (139.4081, 35.3331), "厚木市": (139.3636, 35.4428),
    "大和市": (139.4619, 35.4572),
}


def fetch_transactions(pref_code: str, year: int, quarter: int) -> list[dict]:
    """APIから取引データを取得"""
    if not MLIT_API_KEY:
        print("  ✗ MLIT_API_KEY が設定されていません")
        return []

    params = {"year": year, "quarter": quarter, "area": pref_code}
    headers = {"Ocp-Apim-Subscription-Key": MLIT_API_KEY}

    try:
        resp = requests.get(MLIT_API_URL, params=params, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("data", [])
        print(f"    取得: {len(items):,}件")
        return items
    except requests.HTTPError as e:
        print(f"    ✗ HTTP {e.response.status_code}: {e.response.text[:200]}")
        return []
    except Exception as e:
        print(f"    ✗ エラー: {e}")
        return []


# ジオコーディングキャッシュ（ユニーク住所のみAPI呼び出し）
geocache: dict[str, tuple[float, float] | None] = {}


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
                lng, lat = float(coords[0]), float(coords[1])
                if 20 <= lat <= 50 and 120 <= lng <= 150:
                    geocache[address] = (lng, lat)
                    time.sleep(0.1)
                    return (lng, lat)
    except Exception:
        pass
    geocache[address] = None
    return None


def get_coords(pref_name: str, municipality: str, district: str) -> tuple[float, float] | None:
    """住所から座標を取得（詳細→市区町村→代表座標の順でフォールバック）"""
    # 1. 都道府県+市区町村+地区名
    if district:
        coords = geocode(f"{pref_name}{municipality}{district}")
        if coords:
            return coords

    # 2. 都道府県+市区町村
    coords = geocode(f"{pref_name}{municipality}")
    if coords:
        # 同一市区町村内でランダムジッター（±0.008度 ≒ ±700m）
        jitter = lambda: random.uniform(-0.008, 0.008)
        return (coords[0] + jitter(), coords[1] + jitter())

    # 3. 代表座標辞書から検索
    for key, centroid in CITY_CENTROIDS.items():
        if key in municipality:
            jitter = lambda: random.uniform(-0.01, 0.01)
            return (centroid[0] + jitter(), centroid[1] + jitter())

    return None


def build_unique_addresses(items: list[dict], pref_name: str) -> set[str]:
    """ユニーク住所セットを返す（事前にキャッシュ構築用）"""
    addresses = set()
    for item in items:
        municipality = item.get("Municipality", "")
        district = item.get("DistrictName", "")
        if district:
            addresses.add(f"{pref_name}{municipality}{district}")
        addresses.add(f"{pref_name}{municipality}")
    return addresses


def item_to_feature(item: dict, pref_name: str) -> dict | None:
    """APIレスポンスのアイテムをGeoJSONフィーチャに変換"""
    municipality = item.get("Municipality", "")
    district = item.get("DistrictName", "")

    coords = get_coords(pref_name, municipality, district)
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

    # 価格0円 or 面積0㎡はスキップ
    if trade_price == 0 or price_per_sqm == 0:
        return None

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
    print(f"対象: {', '.join(p['name'] for p in PREFECTURES)}")
    print(f"APIキー設定: {'あり' if MLIT_API_KEY else 'なし'}\n")

    all_features = []
    summary = {}

    for pref in PREFECTURES:
        pref_code = pref["code"]
        pref_name = pref["name"]
        print(f"\n=== {pref_name}（code={pref_code}）===")

        # Step1: 全件取得
        all_items: list[dict] = []
        for period in PERIODS:
            year, quarter = period["year"], period["quarter"]
            print(f"  {year}年 第{quarter}四半期")
            items = fetch_transactions(pref_code, year, quarter)
            all_items.extend(items)
            time.sleep(0.5)

        print(f"  → {pref_name} 合計取得: {len(all_items):,}件")

        # Step2: ユニーク住所を事前ジオコーディング
        unique_addresses = build_unique_addresses(all_items, pref_name)
        print(f"  ユニーク住所: {len(unique_addresses):,}件 → ジオコーディング開始...")
        for i, addr in enumerate(unique_addresses):
            if addr not in geocache:
                geocode(addr)
            if (i + 1) % 100 == 0:
                print(f"    {i+1}/{len(unique_addresses)}件処理中...")

        # Step3: フィーチャ変換
        pref_features = []
        for item in all_items:
            feature = item_to_feature(item, pref_name)
            if feature:
                pref_features.append(feature)

        all_features.extend(pref_features)
        summary[pref_name] = len(pref_features)
        geocode_rate = len(pref_features) / len(all_items) * 100 if all_items else 0
        print(f"  → {pref_name} フィーチャ: {len(pref_features):,}件（ジオコード率 {geocode_rate:.1f}%）")

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
