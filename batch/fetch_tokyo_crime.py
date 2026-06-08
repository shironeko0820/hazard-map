"""
警視庁 区市町村・町丁別犯罪認知件数CSVから東京都の実犯罪データを生成
出力: public/crime_tokyo.geojson

データソース:
  警視庁「区市町村の町丁別、罪種別及び手口別認知件数」
  https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/ninchikensu.html

処理フロー:
  1. CSVダウンロード（Shift-JIS）
  2. 行名から区名を抽出して区別に認知件数を集計
  3. 件数に比例したポイントを区内にランダム散布
  4. GeoJSON出力（他県のモックデータとマージ可能な形式）
"""

import csv
import io
import json
import math
import os
import random
import time
import requests
from datetime import datetime, timedelta

# 令和7年（2025年）年間データ
CSV_URL = "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/ninchikensu.files/R7.csv"

# 東京23区の代表座標（中心点）と散布半径
WARD_COORDS: dict[str, tuple[float, float, float]] = {
    "千代田区": (139.7536, 35.6940, 0.020),
    "中央区":   (139.7740, 35.6706, 0.018),
    "港区":     (139.7514, 35.6581, 0.028),
    "新宿区":   (139.7036, 35.6938, 0.022),
    "文京区":   (139.7519, 35.7080, 0.020),
    "台東区":   (139.7796, 35.7089, 0.020),
    "墨田区":   (139.8017, 35.7101, 0.022),
    "江東区":   (139.8172, 35.6728, 0.030),
    "品川区":   (139.7300, 35.6094, 0.028),
    "目黒区":   (139.6983, 35.6339, 0.022),
    "大田区":   (139.7161, 35.5617, 0.040),
    "世田谷区": (139.6531, 35.6464, 0.038),
    "渋谷区":   (139.7019, 35.6639, 0.022),
    "中野区":   (139.6641, 35.7075, 0.018),
    "杉並区":   (139.6360, 35.6994, 0.030),
    "豊島区":   (139.7197, 35.7294, 0.018),
    "北区":     (139.7336, 35.7528, 0.026),
    "荒川区":   (139.7836, 35.7358, 0.018),
    "板橋区":   (139.7094, 35.7750, 0.030),
    "練馬区":   (139.6519, 35.7356, 0.038),
    "足立区":   (139.7847, 35.7753, 0.040),
    "葛飾区":   (139.8442, 35.7444, 0.032),
    "江戸川区": (139.8686, 35.7067, 0.036),
    # 市部（東京市部の主要市）
    "八王子市": (139.3267, 35.6661, 0.050),
    "立川市":   (139.4136, 35.6980, 0.030),
    "武蔵野市": (139.5656, 35.7074, 0.020),
    "三鷹市":   (139.5614, 35.6834, 0.020),
    "青梅市":   (139.2756, 35.7879, 0.040),
    "府中市":   (139.4773, 35.6699, 0.025),
    "昭島市":   (139.3536, 35.7058, 0.022),
    "調布市":   (139.5491, 35.6519, 0.022),
    "町田市":   (139.4461, 35.5487, 0.040),
    "小金井市": (139.5072, 35.7001, 0.018),
    "小平市":   (139.4758, 35.7282, 0.022),
    "日野市":   (139.3966, 35.6719, 0.025),
    "東村山市": (139.4675, 35.7544, 0.022),
    "国分寺市": (139.4633, 35.7037, 0.018),
    "国立市":   (139.4410, 35.6855, 0.015),
    "福生市":   (139.3289, 35.7382, 0.018),
    "狛江市":   (139.5791, 35.6342, 0.012),
    "東大和市": (139.4273, 35.7444, 0.018),
    "清瀬市":   (139.5267, 35.7853, 0.018),
    "東久留米市":(139.5256, 35.7619, 0.018),
    "武蔵村山市":(139.3880, 35.7547, 0.020),
    "多摩市":   (139.4444, 35.6366, 0.025),
    "稲城市":   (139.5058, 35.6380, 0.020),
    "羽村市":   (139.3111, 35.7675, 0.018),
    "あきる野市":(139.2939, 35.7286, 0.030),
    "西東京市": (139.5382, 35.7257, 0.022),
}

CRIME_TYPES = [
    "自転車盗", "自動車盗", "オートバイ盗", "ひったくり",
    "すり", "万引き", "住宅侵入盗", "車上ねらい",
    "暴行", "傷害", "詐欺", "その他窃盗",
]

def download_csv() -> list[list[str]]:
    """警視庁CSVをダウンロードしてShift-JISでデコード"""
    print(f"CSVダウンロード: {CSV_URL}")
    resp = requests.get(CSV_URL, headers={"User-Agent": "SmileMap/1.0"}, timeout=60)
    resp.raise_for_status()

    # Shift-JISでデコード（errors='replace'でフォールバック）
    content = resp.content.decode("shift-jis", errors="replace")
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    print(f"  → {len(rows)}行読込")
    return rows


def extract_ward_name(location: str) -> str:
    """行名から区市町村名を抽出（例: '千代田区千代田一丁目' → '千代田区'）"""
    location = location.strip()
    # 区・市・郡・島 で終わる部分を探す
    for suffix in ["区", "市", "郡", "町", "村"]:
        idx = location.find(suffix)
        if idx > 0:
            candidate = location[:idx + 1]
            # 2〜6文字が適切な区市町村名長
            if 2 <= len(candidate) <= 8:
                return candidate
    return ""


def aggregate_by_ward(rows: list[list[str]]) -> dict[str, int]:
    """CSVを区別に犯罪件数を集計

    CSVの構造:
      列0: 区市町村・町丁名
      列1: 総計（全罪種合計）
      列2以降: 罪種別件数
    """
    ward_counts: dict[str, int] = {}

    if not rows:
        return ward_counts

    # ヘッダー行をスキップ（最初の行）
    data_rows = rows[1:] if rows[0] and not rows[0][0].strip().lstrip("﻿").replace("　", "").replace(" ", "").isdigit() else rows

    for row in data_rows:
        if len(row) < 2:
            continue
        location = row[0].strip()
        if not location:
            continue

        # 合計行（区名のみの行）はスキップ
        ward = extract_ward_name(location)
        if not ward:
            continue

        # 総計列（列1）を取得
        try:
            total = int(row[1].replace(",", "").strip() or "0")
        except (ValueError, IndexError):
            continue

        if total > 0:
            ward_counts[ward] = ward_counts.get(ward, 0) + total

    return ward_counts


def random_date(days_back: int = 365) -> str:
    base = datetime(2025, 1, 1)
    delta = timedelta(days=random.randint(0, days_back - 1))
    return (base + delta).strftime("%Y-%m-%d")


def generate_points_for_ward(
    ward: str,
    count: int,
    lng: float,
    lat: float,
    radius: float,
) -> list[dict]:
    """区内にランダムな犯罪ポイントを生成（件数比例）"""
    features = []
    # 件数をポイント数にスケール（最大200点/区）
    n_points = min(count // 5 + 1, 200)
    scale_factor = count / max(n_points, 1)

    for _ in range(n_points):
        angle = random.uniform(0, 2 * math.pi)
        r = abs(random.gauss(0, radius / 2))
        r = min(r, radius)
        plng = round(lng + r * math.cos(angle), 5)
        plat = round(lat + r * math.sin(angle), 5)

        crime_type = random.choice(CRIME_TYPES)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [plng, plat]},
            "properties": {
                "crime_type": crime_type,
                "occurred_date": random_date(),
                "prefecture": "東京都",
                "city": ward,
                "crime_count": round(scale_factor),
                "data_source": "警視庁統計（2025年）",
            },
        })
    return features


def load_mock_excluding_tokyo(mock_path: str) -> list[dict]:
    """crime_mock.geojson から東京都以外のポイントを返す"""
    if not os.path.exists(mock_path):
        print(f"  モックファイルなし: {mock_path}")
        return []
    with open(mock_path, encoding="utf-8") as f:
        data = json.load(f)
    features = [
        feat for feat in data.get("features", [])
        if feat.get("properties", {}).get("prefecture") != "東京都"
    ]
    print(f"  モックデータ（東京除く）: {len(features):,}件")
    return features


def main():
    random.seed(42)
    print("=== 東京都犯罪データ生成（警視庁実データ） ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    base_dir = os.path.join(os.path.dirname(__file__), "..", "public")

    # CSVダウンロード
    try:
        rows = download_csv()
    except Exception as e:
        print(f"CSVダウンロード失敗: {e}")
        return

    # 区別集計
    ward_counts = aggregate_by_ward(rows)
    print(f"\n区別集計結果: {len(ward_counts)}区市")

    matched = {w: c for w, c in ward_counts.items() if w in WARD_COORDS}
    unmatched = {w: c for w, c in ward_counts.items() if w not in WARD_COORDS}

    top10 = sorted(matched.items(), key=lambda x: -x[1])[:10]
    print("  認知件数TOP10:")
    for ward, cnt in top10:
        print(f"    {ward}: {cnt:,}件")
    if unmatched:
        print(f"  座標未登録（スキップ）: {list(unmatched.keys())[:5]}")

    # 東京ポイント生成
    tokyo_features = []
    for ward, count in matched.items():
        lng, lat, radius = WARD_COORDS[ward]
        pts = generate_points_for_ward(ward, count, lng, lat, radius)
        tokyo_features.extend(pts)
    random.shuffle(tokyo_features)
    print(f"\n東京ポイント: {len(tokyo_features):,}件")

    total_crimes = sum(matched.values())

    # 全国モックデータ（東京除く）とマージ
    mock_path = os.path.join(base_dir, "crime_mock.geojson")
    other_features = load_mock_excluding_tokyo(mock_path)

    all_features = tokyo_features + other_features
    random.shuffle(all_features)
    print(f"合計ポイント: {len(all_features):,}件（東京実データ + 他都道府県モック）")

    # crime_japan.geojson として出力
    os.makedirs(base_dir, exist_ok=True)
    geojson = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "tokyo_source": "警視庁「区市町村の町丁別、罪種別及び手口別認知件数」令和7年",
            "other_source": "SmileMap デモデータ（モック）",
            "note": "東京都は実統計値に基づく区内分散ポイント。他都道府県はデモ用モックデータ。",
            "generated_at": datetime.now().isoformat(),
            "tokyo_crimes_recognized": total_crimes,
            "tokyo_wards_covered": len(matched),
            "total_points": len(all_features),
        },
    }

    out_path = os.path.join(base_dir, "crime_japan.geojson")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\n出力: {out_path} ({size_kb:.1f} KB)")
    print(f"東京総認知件数: {total_crimes:,}件 → {len(tokyo_features):,}ポイント")


if __name__ == "__main__":
    main()
