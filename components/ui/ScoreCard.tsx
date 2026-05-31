"use client";

import type { AreaScore } from "@/types";

function scoreColor(score: number): string {
  if (score >= 80) return "#27ae60";
  if (score >= 60) return "#f39c12";
  if (score >= 40) return "#e67e22";
  return "#e74c3c";
}

function floodLabel(level: number): string {
  const labels = ["なし", "低", "やや低", "中", "高", "非常に高"];
  return labels[level] ?? "不明";
}

interface Props {
  area: AreaScore;
  onClose: () => void;
}

export default function ScoreCard({ area, onClose }: Props) {
  const color = scoreColor(area.overallScore);

  return (
    <div className="flex flex-col gap-4">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-bold text-xl">{area.cityName}</h2>
          <p className="text-xs text-gray-500">市区町村コード: {area.cityCode}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1">✕</button>
      </div>

      {/* 総合スコア */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
          style={{ background: color }}
        >
          {area.overallScore}
        </div>
        <div>
          <p className="text-xs text-gray-500">総合スコア</p>
          <p className="font-bold text-lg" style={{ color }}>
            {area.overallScore} / 100
          </p>
          <p className="text-xs text-gray-500">
            {area.overallScore >= 80 ? "安心して住めるエリア" : area.overallScore >= 60 ? "概ね良好なエリア" : area.overallScore >= 40 ? "リスクがあるエリア" : "注意が必要なエリア"}
          </p>
        </div>
      </div>

      {/* 不動産価格 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">💴 不動産価格</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">平均坪単価</p>
            <p className="font-bold">{Math.round(area.priceData.avgPricePerSqm / 10000 * 3.3057).toLocaleString()}万円/坪</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">前年比</p>
            <p className={`font-bold ${area.priceData.trend.startsWith("+") ? "text-red-600" : "text-blue-600"}`}>
              {area.priceData.trend}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2 col-span-2">
            <p className="text-xs text-gray-500">㎡単価（中央値）</p>
            <p className="font-bold">{area.priceData.medianPricePerSqm.toLocaleString()}円/㎡</p>
            <p className="text-xs text-gray-500">取引件数: {area.priceData.transactionCount}件</p>
          </div>
        </div>
      </section>

      {/* 治安 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">🚨 治安</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">治安スコア</p>
            <p className="font-bold" style={{ color: scoreColor(area.safetyData.score) }}>
              {area.safetyData.score} / 100
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">都内順位</p>
            <p className="font-bold">{area.safetyData.rankInPrefecture}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2 col-span-2">
            <p className="text-xs text-gray-500">犯罪件数（直近1年）</p>
            <p className="font-bold">{area.safetyData.crimeCount.toLocaleString()}件</p>
            <p className="text-xs text-gray-500">人口1万人あたり {area.safetyData.crimeRatePer10k}件</p>
          </div>
        </div>
      </section>

      {/* 災害リスク */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">🌊 災害リスク</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-cyan-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">洪水リスク</p>
            <p className="font-bold">{floodLabel(area.disasterData.floodRiskLevel)}</p>
          </div>
          <div className="bg-cyan-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">地震確率（30年）</p>
            <p className="font-bold">{area.disasterData.earthquakeProb30y}%</p>
          </div>
          <div className="bg-cyan-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">土砂災害</p>
            <p className={`font-bold ${area.disasterData.landslideRisk ? "text-red-600" : "text-green-600"}`}>
              {area.disasterData.landslideRisk ? "警戒区域あり" : "なし"}
            </p>
          </div>
          <div className="bg-cyan-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">津波リスク</p>
            <p className={`font-bold ${area.disasterData.tsunamiRisk ? "text-red-600" : "text-green-600"}`}>
              {area.disasterData.tsunamiRisk ? "浸水想定あり" : "なし"}
            </p>
          </div>
        </div>
      </section>

      {/* 近隣エリア */}
      {area.nearbyAreas && area.nearbyAreas.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">近隣エリア</h3>
          <div className="flex gap-2 flex-wrap">
            {area.nearbyAreas.map((a) => (
              <span key={a.cityCode} className="text-xs bg-gray-100 rounded-full px-3 py-1">
                {a.cityName}
                <span className="ml-1 font-bold" style={{ color: scoreColor(a.overallScore) }}>{a.overallScore}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
