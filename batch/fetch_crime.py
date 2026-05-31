"""
警視庁（東京都）犯罪オープンデータを取得してGeoJSONに変換するスクリプト
出力: frontend/public/crime_tokyo.geojson
"""

import json
import csv
import io
import os
import requests
from datetime import datetime

# 警視庁 犯罪オープンデータ URL（令和5年・2023年）
# 参考: https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/
CRIME_CSV_URLS = [
    {
        "type": "ひったくり",
        "url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/hanzaiopendata/hittakuri.csv",
    },
    {
        "type": "車上ねらい",
        "url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/hanzaiopendata/syajyo_nerai.csv",
    },
    {
        "type": "部品ねらい",
        "url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/hanzaiopendata/buhin_nerai.csv",
    },
    {
        "type": "自販機ねらい",
        "url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/hanzaiopendata/jihan_nerai.csv",
    },
    {
        "type": "自動車盗",
        "url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/hanzaiopendata/jidosha_to.csv",
    },
    {
        "type": "オートバイ盗",
        "url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/hanzaiopendata/ootobai_to.csv",
    },
    {
        "type": "自転車盗",
        "url": "https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/hanzaiopendata/jitensha_to.csv",
    },
]

# 緯度・経度の列名候補（CSVによって異なる場合があるため複数用意）
LAT_COLS = ["緯度", "lat", "latitude", "Latitude", "Y座標"]
LNG_COLS = ["経度", "lng", "longitude", "Longitude", "X座標"]
DATE_COLS = ["発生年月日", "年月日", "date"]
TYPE_COLS = ["手口", "罪種", "crime_type"]


def find_col(headers: list[str], candidates: list[str]) -> str | None:
    """列名候補から実際の列名を見つける"""
    for c in candidates:
        if c in headers:
            return c
    return None


def fetch_csv(url: str, crime_type: str) -> list[dict]:
    """CSVをダウンロードしてフィーチャリストを返す"""
    features = []
    try:
        print(f"  Fetching: {url}")
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()

        # エンコーディング判定（Shift-JIS / UTF-8）
        for encoding in ["utf-8-sig", "shift_jis", "cp932", "utf-8"]:
            try:
                content = resp.content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            print(f"  ⚠ エンコーディング判定失敗: {url}")
            return []

        reader = csv.DictReader(io.StringIO(content))
        headers = reader.fieldnames or []

        lat_col = find_col(list(headers), LAT_COLS)
        lng_col = find_col(list(headers), LNG_COLS)
        date_col = find_col(list(headers), DATE_COLS)

        if not lat_col or not lng_col:
            print(f"  ⚠ 座標列が見つかりません（列: {list(headers)[:10]}）")
            return []

        count = 0
        skip = 0
        for row in reader:
            try:
                lat = float(row[lat_col])
                lng = float(row[lng_col])
                # 東京都の範囲チェック（離島含む）
                if not (24.0 <= lat <= 36.0 and 136.0 <= lng <= 142.0):
                    skip += 1
                    continue

                props = {
                    "crime_type": crime_type,
                    "date": row.get(date_col, "") if date_col else "",
                }
                # 区市町村名があれば追加
                for col in ["区市町村名", "市区町村名", "市区町村"]:
                    if col in row and row[col]:
                        props["city"] = row[col]
                        break

                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "properties": props,
                })
                count += 1
            except (ValueError, KeyError):
                skip += 1
                continue

        print(f"  ✓ {crime_type}: {count}件取得, {skip}件スキップ")

    except requests.HTTPError as e:
        print(f"  ✗ HTTP エラー ({e.response.status_code}): {url}")
    except requests.RequestException as e:
        print(f"  ✗ 接続エラー: {e}")

    return features


def main():
    print("=== 警視庁 犯罪オープンデータ取得開始 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    all_features = []
    success_count = 0

    for item in CRIME_CSV_URLS:
        features = fetch_csv(item["url"], item["type"])
        all_features.extend(features)
        if features:
            success_count += 1

    geojson = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "警視庁 犯罪オープンデータ",
            "generated_at": datetime.now().isoformat(),
            "total_features": len(all_features),
        },
    }

    # 出力先
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "crime_tokyo.geojson")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n=== 完了 ===")
    print(f"成功: {success_count}/{len(CRIME_CSV_URLS)} 手口")
    print(f"総件数: {len(all_features):,} 件")
    print(f"出力: {out_path}")

    if len(all_features) == 0:
        print("\n⚠ データが0件です。URLが変更された可能性があります。")
        print("以下のページから最新URLを確認してください:")
        print("https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/")
        # URLが取得できなかった場合でもファイルは作成（空のGeoJSON）
        exit(0)


if __name__ == "__main__":
    main()
