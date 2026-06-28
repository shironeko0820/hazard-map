"""
茨城県警察 令和6年 市町村別犯罪統計 PDF → JSON 変換

データソース: 茨城県警察「市町村別の認知件数・犯罪率」(令和6年12月末確定値)
URL: https://www.pref.ibaraki.jp/kenkei/a01_safety/statistics/documents/r6ninti.pdf

取得犯罪種別:
  ページ2 (乗り物盗): 自動車盗, オートバイ盗, 自転車盗
  ページ3 (住宅侵入窃盗): 空き巣, 忍込み, 居空き

出力: public/ibaraki_crime.json
  {市区町村名: {犯罪種別: 件数, ...}, ...}
"""

import json
import os
import io
import requests
import pdfplumber

PDF_URL = "https://www.pref.ibaraki.jp/kenkei/a01_safety/statistics/documents/r6ninti.pdf"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "ibaraki_crime.json")

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MachiScore/1.0)"}

# 各ページの犯罪種別 → 列インデックス（令和6年12月末の値列）
PAGE_COL_MAP = {
    1: {  # ページ2: 乗り物盗
        "自動車盗":    9,
        "オートバイ盗": 14,
        "自転車盗":   19,
    },
    2: {  # ページ3: 住宅侵入窃盗
        "空き巣":  9,
        "忍込み": 14,
        "居空き": 19,
    },
}


def to_int(val) -> int | None:
    s = str(val or "").strip().replace(",", "").replace(" ", "")
    if s.lstrip("-").isdigit():
        v = int(s)
        return v if v > 0 else None
    return None


def parse_page(pdf: pdfplumber.PDF, page_idx: int, col_map: dict[str, int]) -> dict[str, dict[str, int]]:
    table = pdf.pages[page_idx].extract_tables()[0]
    result: dict[str, dict[str, int]] = {}
    for row in table[4:]:  # 最初の4行はヘッダー
        city = str(row[2] or "").strip().replace(" ", "")
        if not city:
            continue
        for crime_type, col in col_map.items():
            v = to_int(row[col]) if col < len(row) else None
            if v is not None:
                result.setdefault(city, {})[crime_type] = v
    return result


def main():
    print("=== 茨城県 犯罪統計PDF取得 ===")
    print(f"  URL: {PDF_URL}")

    resp = requests.get(PDF_URL, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    print(f"  ダウンロード完了: {len(resp.content):,} bytes")

    result: dict[str, dict[str, int]] = {}

    with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
        for page_idx, col_map in PAGE_COL_MAP.items():
            page_data = parse_page(pdf, page_idx, col_map)
            for city, types in page_data.items():
                result.setdefault(city, {}).update(types)
            print(f"  ページ{page_idx + 1}: {list(col_map.keys())} → {len(page_data)}市区町村")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(sum(v.values()) for v in result.values())
    print(f"\n集計: {len(result)}市区町村, 合計{total:,}件")
    print(f"出力: {OUTPUT_PATH}")
    print("=== 完了 ===")


if __name__ == "__main__":
    main()
