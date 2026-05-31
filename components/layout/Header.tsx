"use client";

import { useState } from "react";
import { useMapStore } from "@/lib/store";
import { geocodeAddress, fetchAreaScore } from "@/lib/api";

export default function Header() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const { setSelectedArea, setSearchQuery } = useMapStore();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearchQuery(query);
    try {
      const result = await geocodeAddress(query);
      if (result) {
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
          <span className="font-bold text-lg text-blue-700">SmileMap</span>
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

      {/* ヘッダー下 AdSense プレースホルダー */}
      <div className="bg-gray-100 border-t border-gray-200 flex items-center justify-center h-12 text-xs text-gray-400">
        広告 728×90
      </div>
    </header>
  );
}
