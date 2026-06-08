"""
全国モック犯罪データ生成スクリプト
出力: public/crime_mock.geojson

各都道府県庁所在地・主要都市の周辺にランダムな犯罪発生点を生成する。
実際の犯罪統計（警察庁）に基づく都市ごとの件数重み付けを適用。
"""

import json
import random
import math
import os
from datetime import datetime, timedelta

random.seed(42)  # 再現性のため固定シード

# 都道府県・主要都市の中心座標と相対的な犯罪件数ウェイト
# (lng, lat, weight, city_name, pref_name)
CITIES = [
    # 北海道・東北
    (141.3544, 43.0618, 80, "札幌市", "北海道"),
    (141.7527, 43.7703, 10, "旭川市", "北海道"),
    (140.7400, 40.8244, 15, "青森市", "青森県"),
    (141.1527, 39.7036, 15, "盛岡市", "岩手県"),
    (140.8719, 38.2688, 40, "仙台市", "宮城県"),
    (140.1023, 39.7186, 12, "秋田市", "秋田県"),
    (140.3636, 38.2404, 12, "山形市", "山形県"),
    (140.4748, 37.7500, 20, "福島市", "福島県"),
    # 関東
    (140.4468, 36.3418, 25, "水戸市", "茨城県"),
    (139.8836, 36.5657, 20, "宇都宮市", "栃木県"),
    (139.0608, 36.3912, 20, "前橋市", "群馬県"),
    (139.6489, 35.8617, 60, "さいたま市", "埼玉県"),
    (140.1233, 35.6050, 50, "千葉市", "千葉県"),
    (139.6917, 35.6895, 200, "東京都区部", "東京都"),
    (139.6380, 35.4436, 90, "横浜市", "神奈川県"),
    (139.7031, 35.5309, 50, "川崎市", "神奈川県"),
    # 中部
    (138.8681, 37.9161, 25, "新潟市", "新潟県"),
    (137.2137, 36.6953, 15, "富山市", "富山県"),
    (136.6256, 36.5944, 15, "金沢市", "石川県"),
    (136.2219, 36.0652, 10, "福井市", "福井県"),
    (138.5686, 35.6642, 15, "甲府市", "山梨県"),
    (138.1811, 36.6513, 20, "長野市", "長野県"),
    (136.7223, 35.3912, 25, "岐阜市", "岐阜県"),
    (138.3831, 34.9756, 30, "静岡市", "静岡県"),
    (137.3830, 34.7303, 25, "浜松市", "静岡県"),
    (136.9066, 35.1802, 70, "名古屋市", "愛知県"),
    (136.5086, 34.7303, 15, "津市", "三重県"),
    # 近畿
    (135.8686, 35.0045, 20, "大津市", "滋賀県"),
    (135.7681, 35.0116, 45, "京都市", "京都府"),
    (135.5023, 34.6937, 100, "大阪市", "大阪府"),
    (135.1955, 34.6913, 50, "神戸市", "兵庫県"),
    (135.8048, 34.6851, 20, "奈良市", "奈良県"),
    (135.1675, 34.2260, 15, "和歌山市", "和歌山県"),
    # 中国・四国
    (134.2383, 35.5011, 12, "鳥取市", "鳥取県"),
    (132.7571, 35.4723, 12, "松江市", "島根県"),
    (133.9344, 34.6618, 25, "岡山市", "岡山県"),
    (132.4596, 34.3963, 40, "広島市", "広島県"),
    (131.4714, 34.1861, 15, "山口市", "山口県"),
    (134.5594, 34.0658, 12, "徳島市", "徳島県"),
    (134.0434, 34.3401, 15, "高松市", "香川県"),
    (132.7657, 33.8417, 18, "松山市", "愛媛県"),
    (133.5311, 33.5597, 10, "高知市", "高知県"),
    # 九州・沖縄
    (130.4017, 33.5904, 70, "福岡市", "福岡県"),
    (130.2987, 33.2494, 20, "北九州市", "福岡県"),
    (130.2988, 33.2494, 12, "佐賀市", "佐賀県"),
    (129.8737, 32.7448, 18, "長崎市", "長崎県"),
    (130.7417, 32.7898, 25, "熊本市", "熊本県"),
    (131.6126, 33.2382, 15, "大分市", "大分県"),
    (131.4239, 31.9077, 15, "宮崎市", "宮崎県"),
    (130.5581, 31.5602, 18, "鹿児島市", "鹿児島県"),
    (127.6791, 26.2124, 30, "那覇市", "沖縄県"),
]

CRIME_TYPES = [
    "自転車盗", "自動車盗", "オートバイ盗",
    "ひったくり", "すり", "万引き",
    "住宅侵入盗", "車上ねらい", "部品ねらい",
    "暴行", "傷害", "詐欺",
]

CRIME_WEIGHTS = [25, 8, 10, 5, 8, 20, 10, 12, 8, 6, 5, 3]

def random_date(days_back: int = 365) -> str:
    base = datetime(2024, 1, 1)
    delta = timedelta(days=random.randint(0, days_back))
    return (base + delta).strftime("%Y-%m-%d")

def generate_points_for_city(
    lng: float, lat: float, count: int,
    radius_deg: float = 0.08
) -> list[tuple[float, float]]:
    """都市中心から正規分布で点を散布"""
    points = []
    for _ in range(count):
        # 正規分布で散布（郊外ほど密度低下）
        angle = random.uniform(0, 2 * math.pi)
        r = abs(random.gauss(0, radius_deg / 2))
        r = min(r, radius_deg)
        plng = lng + r * math.cos(angle)
        plat = lat + r * math.sin(angle)
        points.append((plng, plat))
    return points


def main():
    print("=== 全国モック犯罪データ生成 ===")

    features = []
    total_per_city = []

    for lng, lat, weight, city, pref in CITIES:
        # ウェイトをポイント数に変換（スケール調整）
        count = max(5, int(weight * 1.5))
        total_per_city.append((city, count))

        pts = generate_points_for_city(lng, lat, count)
        for plng, plat in pts:
            crime_type = random.choices(CRIME_TYPES, weights=CRIME_WEIGHTS)[0]
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(plng, 5), round(plat, 5)]},
                "properties": {
                    "crime_type": crime_type,
                    "occurred_date": random_date(),
                    "prefecture": pref,
                    "city": city,
                },
            })

    # シャッフルしてランダム順に
    random.shuffle(features)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "note": "このデータはデモ用モックデータです。実際の犯罪統計ではありません。",
            "source": "SmileMap デモデータ",
            "generated_at": datetime.now().isoformat(),
            "total_points": len(features),
        },
    }

    out_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "crime_mock.geojson")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"生成完了: {len(features):,}件")
    print(f"出力: {out_path}")
    size_kb = os.path.getsize(out_path) / 1024
    print(f"ファイルサイズ: {size_kb:.1f} KB")
    print("\n主要都市別件数:")
    for city, count in sorted(total_per_city, key=lambda x: -x[1])[:10]:
        print(f"  {city}: {count}件")


if __name__ == "__main__":
    main()
