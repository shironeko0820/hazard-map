"""
広島県警察 令和6年 市区町村別犯罪統計 PDF → JSON 変換

データソース: 広島県警「市区町村別 不安に感じる犯罪 認知状況」(R6年1〜12月確定値)
URL: https://www.pref.hiroshima.lg.jp/soshiki_file/police/sichousonr7.pdf

取得対象 (ページ2 R6 1〜12月):
  自転車盗 (col 8), 車上ねらい (col 12), 器物損壊等 (col 16),
  侵入強盗 (col 20), 侵入窃盗 (col 24), 住居侵入 (col 28)

市区町村構造:
  14市: 広島市(8区)・呉市・竹原市・三原市・尾道市・福山市・府中市・三次市・庄原市・大竹市・東広島市・廿日市市・安芸高田市・江田島市
  9町: 府中町・海田町・熊野町・坂町 (安芸郡)、安芸太田町・北広島町 (山県郡)、大崎上島町 (豊田郡)、世羅町 (世羅郡)、神石高原町 (神石郡)

出力: public/hiroshima_crime.json
  {市区町村名: {犯罪種別: 件数, ...}, ...}
  ※ 広島市の区は '広島市中区' 形式で出力
"""

import json
import os
import io
import requests
import pdfplumber

PDF_URL = "https://www.pref.hiroshima.lg.jp/soshiki_file/police/sichousonr7.pdf"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "hiroshima_crime.json")

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MachiScore/1.0)"}

# ページ2 (index 1): 不安に感じる犯罪 の犯罪種別→列インデックス（R6年1〜12月）
PAGE2_COL_MAP = {
    "自転車盗":   8,
    "車上ねらい": 12,
    "器物損壊等": 16,
    "侵入強盗":   20,
    "侵入窃盗":   24,
    "住居侵入":   28,
}


def to_int(val):
    s = str(val or "").strip().replace(",", "").replace(" ", "")
    if s.lstrip("-").isdigit():
        v = int(s)
        return v if v > 0 else None
    return None


def extract_crimes(row):
    result = {}
    for crime_type, col in PAGE2_COL_MAP.items():
        if col < len(row):
            v = to_int(row[col])
            if v is not None:
                result[crime_type] = v
    return result


def main():
    print("=== 広島県 犯罪統計PDF取得 ===")
    print(f"  URL: {PDF_URL}")

    resp = requests.get(PDF_URL, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    print(f"  ダウンロード完了: {len(resp.content):,} bytes")

    result = {}

    with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
        page = pdf.pages[1]  # ページ2: 不安に感じる犯罪
        tables = page.extract_tables()
        t = tables[0]

        in_gun = False
        current_gun = ""
        in_hiroshima_city = False

        for row in t[3:]:  # 最初の3行はヘッダー
            c0 = str(row[0] or "").strip().replace(" ", "")
            c1 = str(row[1] or "").strip().replace(" ", "")
            c2 = str(row[2] or "").strip().replace(" ", "")

            # 集計行（c0に値あり）はスキップ
            if c0:
                in_gun = False
                current_gun = ""
                in_hiroshima_city = False
                continue

            if c1:
                in_gun = c1.endswith("郡")
                current_gun = c1 if in_gun else ""
                in_hiroshima_city = (c1 == "広島市")

                if not in_gun:
                    # 市レベルのデータ（広島市含む）
                    crimes = extract_crimes(row)
                    if crimes:
                        result[c1] = crimes
                # else: 郡ヘッダー行は集計値。個別町データ(c2)を使用するためスキップ

            elif c2:
                if in_hiroshima_city:
                    # 広島市の区: choropleth上の '広島市中区' 形式で出力
                    crimes = extract_crimes(row)
                    if crimes:
                        result[f"広島市{c2}"] = crimes
                elif in_gun:
                    # 郡内の個別の町: choropleth上の '安芸郡府中町' 形式で出力
                    crimes = extract_crimes(row)
                    if crimes:
                        result[f"{current_gun}{c2}"] = crimes

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(sum(v.values()) for v in result.values())
    print(f"\n集計: {len(result)}市区町村/区/町, 合計{total:,}件")
    for name, crimes in list(result.items())[:5]:
        print(f"  {name}: {crimes}")
    print(f"出力: {OUTPUT_PATH}")
    print("=== 完了 ===")


if __name__ == "__main__":
    main()
