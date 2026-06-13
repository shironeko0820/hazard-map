"use client";

import { useState } from "react";
import { useMapStore } from "@/lib/store";
import { geocodeAddress, fetchAreaScore } from "@/lib/api";

export default function Header() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const { setSelectedArea, setSearchQuery, setMapCenter } = useMapStore();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearchQuery(query);
    try {
      const result = await geocodeAddress(query);
      if (result) {
        // 地図を該当座標へ移動
        setMapCenter({ lat: result.lat, lng: result.lng, zoom: 13 });
        const area = await fetchAreaScore(result.cityCode);
        setSelectedArea(area);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <header className="bg-white shadow-sm z-10 relative">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🗾</span>
          <span className="font-bold text-lg text-blue-700">まちスコア</span>
        </div>

        <form onSubmit={handleSearch} className="flex-1 max-w-xl flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="住所を入力（例: 東京都渋谷区）"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "検索中..." : "検索"}
          </button>
        </form>

        <nav className="hidden md:flex items-center gap-4 text-sm text-gray-600 shrink-0">
          <a href="/about" className="hover:text-blue-600 transition-colors">使い方</a>
        </nav>
      </div>

    </header>
  );
}
