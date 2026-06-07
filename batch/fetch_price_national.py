"""
全国47都道府県の不動産価格データを市区町村別に集計（ジオコーディングなし）
コロプレスマップ専用の軽量スクリプト
出力: public/price_by_municipality.json
"""

import json
import os
import time
import requests
from collections import defaultdict
from datetime import datetime

MLIT_API_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001"
MLIT_API_KEY = os.environ.get("MLIT_API_KEY", "")

PREFECTURES = [
    ("01", "北海道"), ("02", "青森県"), ("03", "岩手県"), ("04", "宮城県"),
    ("05", "秋田県"), ("06", "山形県"), ("07", "福島県"), ("08", "茨城県"),
    ("09", "栃木県"), ("10", "群馬県"), ("11", "埼玉県"), ("12", "千葉県"),
    ("13", "東京都"), ("14", "神奈川県"), ("15", "新潟県"), ("16", "富山県"),
    ("17", "石川県"), ("18", "福井県"), ("19", "山梨県"), ("20", "長野県"),
    ("21", "岐阜県"), ("22", "静岡県"), ("23", "愛知県"), ("24", "三重県"),
    ("25", "滋賀県"), ("26", "京都府"), ("27", "大阪府"), ("28", "兵庫県"),
    ("29", "奈良県"), ("30", "和歌山県"), ("31", "鳥取県"), ("32", "島根県"),
    ("33", "岡山県"), ("34", "広島県"), ("35", "山口県"), ("36", "徳島県"),
    ("37", "香川県"), ("38", "愛媛県"), ("39", "高知県"), ("40", "福岡県"),
    ("41", "佐賀県"), ("42", "長崎県"), ("43", "熊本県"), ("44", "大分県"),
    ("45", "宮崎県"), ("46", "鹿児島県"), ("47", "沖縄県"),
]

PERIODS = [
    {"year": 2024, "quarter": 4},
    {"year": 2024, "quarter": 3},
    {"year": 2024, "quarter": 2},
    {"year": 2024, "quarter": 1},
]

SQM_TO_TSUBO = 3.30579


def fetch_transactions(pref_code: str, year: int, quarter: int) -> list[dict]:
    if not MLIT_API_KEY:
        print("  ✗ MLIT_API_KEY が設定されていません")
        return []
    params = {"year": year, "quarter": quarter, "area": pref_code}
    headers = {"Ocp-Apim-Subscription-Key": MLIT_API_KEY}
    try:
        resp = requests.get(MLIT_API_URL, params=params, headers=headers, timeout=60)
        resp.raise_for_status()
        items = resp.json().get("data", [])
        print(f"    {year}Q{quarter}: {len(items):,}件")
        return items
    except Exception as e:
        print(f"    ✗ エラー: {e}")
        return []


def main():
    print("=== 全国価格データ取得開始 ===")
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"対象: 全47都道府県（ジオコーディングなし）\n")

    # {pref_name}|{muni_name} → list of price_per_sqm
    price_lists: dict[str, list[int]] = defaultdict(list)
    pref_summary: dict[str, int] = {}

    for pref_code, pref_name in PREFECTURES:
        print(f"\n[{pref_code}] {pref_name}")
        all_items: list[dict] = []

        for period in PERIODS:
            items = fetch_transactions(pref_code, period["year"], period["quarter"])
            all_items.extend(items)
            time.sleep(0.3)  # API負荷対策

        for item in all_items:
            muni = item.get("Municipality", "")
            try:
                trade_price = int(item.get("TradePrice", 0) or 0)
                area = float(item.get("Area", 0) or 0)
            except (ValueError, TypeError):
                continue
            if not muni or trade_price == 0 or area == 0:
                continue
            price_per_sqm = int(trade_price / area)
            if price_per_sqm <= 0:
                continue
            key = f"{pref_name}|{muni}"
            price_lists[key].append(price_per_sqm)

        pref_keys = [k for k in price_lists if k.startswith(pref_name + "|")]
        pref_summary[pref_name] = len(pref_keys)
        print(f"  → {len(pref_keys)}市区町村, 元データ{len(all_items):,}件")

    # 集計
    result: dict[str, dict] = {}
    for key, prices in price_lists.items():
        pref_name, muni_name = key.split("|", 1)
        sorted_p = sorted(prices)
        result[key] = {
            "prefecture": pref_name,
            "municipality": muni_name,
            "avg_price_per_sqm": int(sum(prices) / len(prices)),
            "median_price_per_sqm": sorted_p[len(prices) // 2],
            "transaction_count": len(prices),
            "avg_price_per_tsubo": int(sum(prices) / len(prices) * SQM_TO_TSUBO),
        }

    # 出力
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "price_by_municipality.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n=== 完了 ===")
    print(f"合計: {len(result):,}市区町村")
    for pref, count in pref_summary.items():
        if count > 0:
            print(f"  {pref}: {count}市区町村")
    print(f"出力: {out_path}")


if __name__ == "__main__":
    main()
