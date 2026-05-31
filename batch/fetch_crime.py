"""
警視庁（東京都）犯罪オープンデータを取得してGeoJSONに変換するスクリプト
出力: public/crime_tokyo.geojson

URL取得方法:
  1. 警察庁オープンデータリンク集ページから警視庁のCSVリンクを動的に抽出
  2. 失敗した場合は既知のURLパターンにフォールバック
"""

import json
import csv
import io
import os
import re
import requests
from datetime import datetime
from html.parser import HTMLParser

# 警察庁 オープンデータリンク集ページ
NPA_LINK_PAGE = "https://www.npa.go.jp/toukei/seianki/hanzaiopendatalink.html"

# 警視庁サイトのベースURL
KEISHICHO_BASE = "https://www.keishicho.metro.tokyo.lg.jp"

# フォールバック用の既知URLパターン（年度ごとに変わる場合あり）
FALLBACK_URLS = [
    f"{KEISHICHO_BASE}/about_mpd/stats/data/hanzaiopendata/hittakuri.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/hanzaiopendata/syajyo_nerai.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/hanzaiopendata/buhin_nerai.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/hanzaiopendata/jihan_nerai.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/hanzaiopendata/jidosha_to.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/hanzaiopendata/ootobai_to.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/hanzaiopendata/jitensha_to.csv",
    # 別パターン
    f"{KEISHICHO_BASE}/about_mpd/stats/data/himanzai/hittakuri.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/himanzai/syajyo_nerai.csv",
    f"{KEISHICHO_BASE}/about_mpd/stats/data/himanzai/jitensha_to.csv",
]

# 手口キーワードからラベルへのマッピング
TYPE_MAP = {
    "hittakuri": "ひったくり",
    "syajyo": "車上ねらい",
    "buhin": "部品ねらい",
    "jihan": "自販機ねらい",
    "jidosha": "自動車盗",
    "ootobai": "オートバイ盗",
    "jitensha": "自転車盗",
    "himanzai": "非侵入窃盗",
}

LAT_COLS = ["緯度", "lat", "latitude", "Latitude", "Y", "Y座標", "緯度（世界測地系）"]
LNG_COLS = ["経度", "lng", "longitude", "Longitude", "X", "X座標", "経度（世界測地系）"]
DATE_COLS = ["発生年月日", "年月日", "date", "発生日"]


class LinkExtractor(HTMLParser):
    """HTMLからCSVリンクを抽出"""
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href", "")
            if href.endswith(".csv") and ("keishicho" in href or "tokyo" in href.lower()):
                self.links.append(href)


def find_col(headers, candidates):
    for c in candidates:
        if c in headers:
            return c
    # 部分一致も試みる
    for c in candidates:
        for h in headers:
            if c in h or h in c:
                return h
    return None


def guess_crime_type(url):
    url_lower = url.lower()
    for key, label in TYPE_MAP.items():
        if key in url_lower:
            return label
    return "窃盗"


def try_fetch_url(url):
    """URLからCSVを取得。失敗したらNoneを返す"""
    try:
        resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code != 200:
            return None, None
        # エンコーディング判定
        for enc in ["utf-8-sig", "shift_jis", "cp932", "utf-8"]:
            try:
                return resp.content.decode(enc), enc
            except UnicodeDecodeError:
                continue
        return None, None
    except requests.RequestException:
        return None, None


def parse_csv_to_features(content, crime_type):
    """CSVコンテンツをGeoJSONフィーチャリストに変換"""
    features = []
    try:
        reader = csv.DictReader(io.StringIO(content))
        headers = list(reader.fieldnames or [])

        lat_col = find_col(headers, LAT_COLS)
        lng_col = find_col(headers, LNG_COLS)
        date_col = find_col(headers, DATE_COLS)

        if not lat_col or not lng_col:
            print(f"    ⚠ 座標列なし (列: {headers[:8]})")
            return []

        count = skip = 0
        for row in reader:
            try:
                lat_str = row[lat_col].strip()
                lng_str = row[lng_col].strip()
                if not lat_str or not lng_str:
                    skip += 1
                    continue
                lat = float(lat_str)
                lng = float(lng_str)
                # 東京都の緯度経度範囲チェック（小笠原・伊豆諸島含む）
                if not (20.0 <= lat <= 36.5 and 136.0 <= lng <= 143.0):
                    skip += 1
                    continue

                props = {"crime_type": crime_type}
                if date_col and row.get(date_col):
                    props["date"] = row[date_col].strip()
                for col in ["区市町村名", "市区町村名", "市区町村", "区市町村"]:
                    if col in row and row[col].strip():
                        props["city"] = row[col].strip()
                        break

                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "properties": props,
                })
                count += 1
            except (ValueError, KeyError):
                skip += 1

        print(f"    ✓ {count}件取得, {skip}件スキップ")
    except Exception as e:
        print(f"    ✗ パースエラー: {e}")
    return features


def fetch_from_npa_page():
    """警察庁リンク集ページから警視庁のCSV URLを動的取得"""
    print("警察庁リンク集ページからURL取得中...")
    try:
        resp = requests.get(NPA_LINK_PAGE, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        for enc in ["utf-8", "shift_jis", "cp932"]:
            try:
                html = resp.content.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            return []

        # 警視庁のCSVリンクを正規表現で抽出
        pattern = r'https?://(?:www\.)?keishicho\.metro\.tokyo\.lg\.jp[^\s"\'<>]*\.csv'
        urls = re.findall(pattern, html)
        if not urls:
            # 相対URLも試みる
            parser = LinkExtractor()
            parser.feed(html)
            urls = [
                (u if u.startswith("http") else KEISHICHO_BASE + u)
                for u in parser.links
            ]

        print(f"  → {len(urls)}件のURLを発見")
        return urls
    except Exception as e:
        print(f"  ✗ リンク集ページ取得失敗: {e}")
        return []


def main():
    print("=== 警視庁 犯罪オープンデータ取得開始 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Step 1: 警察庁リンク集ページからURL取得
    csv_urls = fetch_from_npa_page()

    # Step 2: フォールバックURLも追加
    if not csv_urls:
        print("フォールバックURLを使用します")
        csv_urls = FALLBACK_URLS
    else:
        # フォールバックURLも追加して試行数を増やす
        csv_urls = list(set(csv_urls + FALLBACK_URLS))

    print(f"\n{len(csv_urls)}件のURLを試行します\n")

    all_features = []
    tried = success = 0

    for url in csv_urls:
        tried += 1
        crime_type = guess_crime_type(url)
        print(f"[{tried}/{len(csv_urls)}] {crime_type}: {url}")

        content, enc = try_fetch_url(url)
        if content is None:
            print(f"    ✗ 取得失敗")
            continue

        print(f"    エンコード: {enc}")
        features = parse_csv_to_features(content, crime_type)
        all_features.extend(features)
        if features:
            success += 1

    # GeoJSON出力
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
    print(f"試行: {tried}件 / 成功: {success}件")
    print(f"総取得件数: {len(all_features):,} 件")
    print(f"出力: {out_path}")

    if len(all_features) == 0:
        print("\n⚠ データが0件でした。")
        print("警視庁の最新データURLを確認してください:")
        print("https://www.keishicho.metro.tokyo.lg.jp/about_mpd/stats/data/")


if __name__ == "__main__":
    main()
