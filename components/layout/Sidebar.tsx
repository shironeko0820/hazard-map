"use client";

import { useMapStore } from "@/lib/store";
import ScoreCard from "@/components/ui/ScoreCard";
import AffiliateLinks from "@/components/ui/AffiliateLinks";
import AdUnit from "@/components/ui/AdUnit";

export default function Sidebar() {
  const { selectedArea, setSelectedArea } = useMapStore();

  return (
    <aside className="w-80 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
      <div className="p-4 flex flex-col gap-4 flex-1">
        {selectedArea ? (
          <>
            <ScoreCard area={selectedArea} onClose={() => setSelectedArea(null)} />

            <hr className="border-gray-200" />

            <AffiliateLinks cityName={selectedArea.cityName} cityCode={selectedArea.cityCode} />

            <hr className="border-gray-200" />

            <div className="flex justify-center">
              <AdUnit
                width={300}
                height={250}
                slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center text-gray-400 gap-3 py-12">
            <span className="text-5xl">🗾</span>
            <p className="font-medium text-gray-600">エリアを選択してください</p>
            <p className="text-sm">
              地図上のハザードエリアをクリック、または上部の検索ボックスから住所を入力すると、そのエリアのリスク情報を表示します。
            </p>
            <div className="mt-4 text-xs text-left bg-gray-50 rounded-lg p-3 w-full">
              <p className="font-medium text-gray-600 mb-1">レイヤーの切替方法</p>
              <ul className="space-y-1 text-gray-500">
                <li>💴 <strong>価格</strong> — 不動産取引価格</li>
                <li>🚨 <strong>治安</strong> — 犯罪発生状況</li>
                <li>🌊 <strong>災害</strong> — ハザードマップ</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
