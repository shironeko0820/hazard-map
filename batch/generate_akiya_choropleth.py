"""
空き家率コロプレスGeoJSON生成

public/akiya.json（市区町村コード→空き家率）と
全国市区町村境界GeoJSONをマージして
public/akiya_choropleth.geojson を出力する。
"""

import json
import os
import requests

BASE_DIR = os.path.dirname(__file__)
AKIYA_JSON = os.path.join(BASE_DIR, "..", "public", "akiya.json")
OUTPUT_PATH = os.path.join(BASE_DIR, "..", "public", "akiya_choropleth.geojson")

JAPAN_GEOJSON_URL = (
    "https://raw.githubusercontent.com/smartnews-smri/japan-topography"
    "/main/data/municipality/geojson/s0001/N03-21_210101.json"
)
JAPAN_GEOJSON_LOCAL = os.environ.get("JAPAN_GEOJSON_LOCAL", "")


def load_boundary() -> dict:
    if JAPAN_GEOJSON_LOCAL and os.path.exists(JAPAN_GEOJSON_LOCAL):
        print(f"境界GeoJSON読込: {JAPAN_GEOJSON_LOCAL}")
        with open(JAPAN_GEOJSON_LOCAL, encoding="utf-8") as f:
            return json.load(f)
    print(f"境界GeoJSON取得: {JAPAN_GEOJSON_URL}")
    resp = requests.get(JAPAN_GEOJSON_URL, timeout=120)
    resp.raise_for_status()
    return resp.json()


# N03形式の都道府県コード（N03_001の先頭2文字相当）
PREF_CODES = {
    "北海道": "01", "青森県": "02", "岩手県": "03", "宮城県": "04", "秋田県": "05",
    "山形県": "06", "福島県": "07", "茨城県": "08", "栃木県": "09", "群馬県": "10",
    "埼玉県": "11", "千葉県": "12", "東京都": "13", "神奈川県": "14", "新潟県": "15",
    "富山県": "16", "石川県": "17", "福井県": "18", "山梨県": "19", "長野県": "20",
    "岐阜県": "21", "静岡県": "22", "愛知県": "23", "三重県": "24", "滋賀県": "25",
    "京都府": "26", "大阪府": "27", "兵庫県": "28", "奈良県": "29", "和歌山県": "30",
    "鳥取県": "31", "島根県": "32", "岡山県": "33", "広島県": "34", "山口県": "35",
    "徳島県": "36", "香川県": "37", "愛媛県": "38", "高知県": "39", "福岡県": "40",
    "佐賀県": "41", "長崎県": "42", "熊本県": "43", "大分県": "44", "宮崎県": "45",
    "鹿児島県": "46", "沖縄県": "47",
}


def build_code_from_feature(props: dict) -> str | None:
    """境界GeoJSONのプロパティから5桁市区町村コードを推定"""
    pref = str(props.get("N03_001") or "").strip()
    city = str(props.get("N03_004") or "").strip()
    ward = str(props.get("N03_003") or "").strip()

    pref_code = PREF_CODES.get(pref)
    if not pref_code:
        return None

    # N03_007が存在すれば直接利用（市区町村コード）
    n03_007 = str(props.get("N03_007") or "").strip()
    if n03_007 and n03_007.isdigit() and len(n03_007) == 5:
        return n03_007

    return None


def main():
    print("=== 空き家率コロプレスGeoJSON生成 ===")

    with open(AKIYA_JSON, encoding="utf-8") as f:
        akiya = json.load(f)
    print(f"空き家率データ: {len(akiya):,}市区町村")

    boundary = load_boundary()
    features = boundary.get("features", [])
    print(f"境界ポリゴン: {len(features):,}件")

    matched = 0
    out_features = []
    seen_codes: set[str] = set()

    for feat in features:
        props = feat.get("properties") or {}
        code = build_code_from_feature(props)

        data = akiya.get(code) if code else None
        if data and code not in seen_codes:
            seen_codes.add(code)
            matched += 1

        out_feat = {
            "type": "Feature",
            "geometry": feat["geometry"],
            "properties": {
                "city_code": code or "",
                "prefecture": str(props.get("N03_001") or ""),
                "municipality": str(props.get("N03_004") or props.get("N03_003") or ""),
                "akiya_rate": data["akiya_rate"] if data else None,
                "total_housing": data["total_housing"] if data else None,
                "vacant_housing": data["vacant_housing"] if data else None,
            },
        }
        out_features.append(out_feat)

    geojson = {"type": "FeatureCollection", "features": out_features}

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"\n出力: {OUTPUT_PATH} ({size_kb:.0f} KB)")
    print(f"マッチ: {matched:,} / {len(features):,}ポリゴン")
    print("=== 完了 ===")


if __name__ == "__main__":
    main()
