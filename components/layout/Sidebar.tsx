"use client";

import { useEffect, useState } from "react";
import { useMapStore } from "@/lib/store";
import ScoreCard from "@/components/ui/ScoreCard";
import AffiliateLinks from "@/components/ui/AffiliateLinks";
import AdUnit from "@/components/ui/AdUnit";
import type { MonumentProperties } from "@/types";

/** 伝承碑プロパティから表示用の値を取り出す（キー名が不確定なためフォールバック付き） */
function getMonumentField(props: MonumentProperties, ...keys: string[]): string {
  for (const k of keys) {
    const v = props[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function MonumentCard({ monument, onClose }: { monument: MonumentProperties; onClose: () => void }) {
  const name        = getMonumentField(monument, "碑名", "name", "P0003", "stoneName");
  const disaster    = getMonumentField(monument, "災害種別", "disasterType", "P0004", "disaster");
  const year        = getMonumentField(monument, "建立年", "year", "P0005", "disasterYear");
  const description = getMonumentField(monument, "伝承内容", "description", "P0006", "explanation", "content");
  const address     = getMonumentField(monument, "所在地", "address", "P0007", "location");
  const disasterName = getMonumentField(monument, "災害名", "disasterName");
  const pref        = getMonumentField(monument, "pref", "prefecture", "P0001");
  const city        = getMonumentField(monument, "city", "municipality", "P0002");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-amber-600 font-medium">📜 自然災害伝承碑</p>
          <h2 className="text-base font-bold text-gray-800 mt-0.5">{name || "（碑名不明）"}</h2>
          {(pref || city) && <p className="text-xs text-gray-500">{pref}{city}</p>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5">×</button>
      </div>

      <div className="bg-amber-50 rounded-lg p-3 flex flex-col gap-1.5 text-sm">
        {disasterName && (
          <div className="flex gap-2">
            <span className="text-gray-500 shrink-0">災害名</span>
            <span className="font-medium text-gray-800">{disasterName}</span>
          </div>
        )}
        {disaster && (
          <div className="flex gap-2">
            <span className="text-gray-500 shrink-0">種別</span>
            <span className="font-medium text-gray-800">{disaster}</span>
          </div>
        )}
        {year && (
          <div className="flex gap-2">
            <span className="text-gray-500 shrink-0">建立年</span>
            <span className="font-medium text-gray-800">{year}年</span>
          </div>
        )}
        {address && (
          <div className="flex gap-2">
            <span className="text-gray-500 shrink-0">所在地</span>
            <span className="text-gray-700">{address}</span>
          </div>
        )}
      </div>

      {description && (
        <div className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">
          {description}
        </div>
      )}

      <p className="text-xs text-gray-400">出典: 国土地理院 自然災害伝承碑</p>
    </div>
  );
}

function SidebarContent({
  onClose,
}: {
  onClose: () => void;
}) {
  const { selectedArea, selectedMonument, setSelectedMonument, showHistory, activeLayer } = useMapStore();

  // 過去の被害モード: 伝承碑選択時
  if (activeLayer === "hazard" && showHistory) {
    if (selectedMonument) {
      return <MonumentCard monument={selectedMonument} onClose={() => setSelectedMonument(null)} />;
    }
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center text-gray-400 gap-3 py-12">
        <span className="text-5xl">📜</span>
        <p className="font-medium text-gray-600">伝承碑をクリックしてください</p>
        <p className="text-sm">地図上のオレンジ色のアイコンをクリックすると、過去の災害記録を表示します。</p>
        <div className="mt-2 text-xs text-left bg-amber-50 rounded-lg p-3 w-full">
          <p className="font-medium text-amber-700 mb-1">表示内容</p>
          <ul className="space-y-1 text-amber-600">
            <li>📜 <strong>自然災害伝承碑</strong> — 過去の災害を記録した石碑</li>
            <li>🌊 <strong>浸水実績図</strong> — 過去に浸水した区域（年代不明・複数年の重ね合わせ）</li>
          </ul>
        </div>
      </div>
    );
  }

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
