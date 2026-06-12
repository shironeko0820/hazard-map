"use client";

import { useEffect, useState } from "react";
import { useMapStore } from "@/lib/store";
import ScoreCard from "@/components/ui/ScoreCard";
import AffiliateLinks from "@/components/ui/AffiliateLinks";
import AdUnit from "@/components/ui/AdUnit";

function SidebarContent({
  onClose,
}: {
  onClose: () => void;
}) {
  const { selectedArea } = useMapStore();

  if (!selectedArea) {
    return (
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
    );
  }

  return (
    <>
      <ScoreCard area={selectedArea} onClose={onClose} />
      <hr className="border-gray-200" />
      <AffiliateLinks cityName={selectedArea.cityName} cityCode={selectedArea.cityCode} />
      <hr className="border-gray-200" />
      <div className="hidden md:flex justify-center">
        <AdUnit
          width={300}
          height={250}
          slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR}
        />
      </div>
    </>
  );
}

export default function Sidebar() {
  const { selectedArea, setSelectedArea } = useMapStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  // エリア選択時にモバイルシートを自動オープン
  useEffect(() => {
    if (selectedArea) setMobileOpen(true);
  }, [selectedArea]);

  function handleClose() {
    setSelectedArea(null);
    setMobileOpen(false);
  }

  return (
    <>
      {/* ── デスクトップ: 右サイドバー ── */}
      <aside className="hidden md:flex w-80 shrink-0 bg-white border-l border-gray-200 flex-col overflow-y-auto">
        <div className="p-4 flex flex-col gap-4 flex-1">
          <SidebarContent onClose={handleClose} />
        </div>
      </aside>

      {/* ── モバイル: 底部シート ── */}
      {selectedArea && (
        <>
          {/* 背景オーバーレイ */}
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-20"
            onClick={() => setMobileOpen(false)}
          />

          {/* シート本体 */}
          <div
            className={`md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 z-30 transition-transform duration-300 ${
              mobileOpen ? "translate-y-0" : "translate-y-full"
            }`}
          >
            {/* ドラッグハンドル */}
            <button
              className="w-full flex justify-center pt-3 pb-1"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "パネルを閉じる" : "パネルを開く"}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </button>

            {/* コンテンツ */}
            <div className="max-h-[60vh] overflow-y-auto px-4 pb-6 pt-2 flex flex-col gap-4">
              <SidebarContent onClose={handleClose} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
