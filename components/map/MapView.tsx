"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapStore } from "@/lib/store";
import type { MapFeatureProperties, MonumentProperties } from "@/types";
import type { HazardType } from "@/lib/store";

// コロプレス（区ごと平均㎡単価）の色スケール: 青(低価格) → 赤(高価格)
const CHOROPLETH_COLORS: ExpressionSpecification = [
  "interpolate", ["linear"],
  ["get", "avg_price_per_sqm"],
  0,       "#f0f0f0",
  100000,  "#313695",
  300000,  "#4575b4",
  500000,  "#74add1",
  700000,  "#abd9e9",
  900000,  "#fee090",
  1100000, "#fdae61",
  1300000, "#f46d43",
  1500000, "#d73027",
  2000000, "#a50026",
];


export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { activeLayer, showCrimeChoropleth, activeHazards, showHistory, setSelectedMonument, mapCenter } = useMapStore();
  const activeLayerRef = useRef(activeLayer);
  const activeHazardsRef = useRef(activeHazards);
  const showHistoryRef = useRef(showHistory);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { activeHazardsRef.current = activeHazards; }, [activeHazards]);
  useEffect(() => { showHistoryRef.current = showHistory; }, [showHistory]);

  const updateLayerVisibility = useCallback((
    layer: string,
    hazards: Set<string> = new Set(["flood"]),
    _crimeHeatmap: boolean = false,
    crimeChoropleth: boolean = true,
  ) => {
    if (!map.current) return;
    const m = map.current;

    const allLayers = [
      "price-heatmap", "price-circle",
      "crime-choropleth-fill", "crime-choropleth-line",
      "hazard-flood",
      "hazard-landslide", "hazard-landslide-steep", "hazard-landslide-slide",
      "hazard-tsunami",
      "hazard-earthquake",
      "history-flood",
      "monuments-circle", "monuments-label",
      "akiya-fill", "akiya-line",
    ];

    allLayers.forEach((id) => {
      if (!m.getLayer(id)) return;
      let visible = false;
      if (layer === "price" && (id === "price-heatmap" || id === "price-circle")) visible = true;
      if (layer === "crime") {
        if ((id === "crime-choropleth-fill" || id === "crime-choropleth-line") && crimeChoropleth) visible = true;
      }
      if (layer === "akiya" && (id === "akiya-fill" || id === "akiya-line")) visible = true;
      if (layer === "hazard") {
        const hist = showHistoryRef.current;
        if (!hist) {
          if (id === "hazard-flood" && hazards.has("flood")) visible = true;
          if (
            (id === "hazard-landslide" || id === "hazard-landslide-steep" || id === "hazard-landslide-slide")
            && hazards.has("landslide")
          ) visible = true;
          if (id === "hazard-tsunami" && hazards.has("tsunami")) visible = true;
          if (id === "hazard-earthquake" && hazards.has("earthquake")) visible = true;
        } else {
          if (id === "history-flood" || id === "monuments-circle" || id === "monuments-label") visible = true;
        }
      }
      m.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    });
  }, []);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tile.openstreetmap.jp/styles/maptiler-basic-ja/style.json",
      center: [139.6917, 35.6895],
      zoom: 11,
    });

    const m = map.current;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    m.on("load", () => {
      // ---- 価格レイヤー（コロプレス: 区ごとの平均㎡単価で色分け）----
      m.addSource("price-source", { type: "geojson", data: "/choropleth.geojson" });
      m.addLayer({
        id: "price-heatmap",  // レイヤーIDはそのまま維持（visibility切り替えのため）
        type: "fill",
        source: "price-source",
        paint: {
          "fill-color": CHOROPLETH_COLORS,
          "fill-opacity": 0.7,
        },
      });
      m.addLayer({
        id: "price-circle",  // 区境界の輪郭線
        type: "line",
        source: "price-source",
        paint: {
          "line-color": "#ffffff",
          "line-width": 0.8,
          "line-opacity": 0.6,
        },
      });

      // ---- 犯罪コロプレス（市区町村ごとの認知件数）----
      m.addSource("crime-choropleth-source", { type: "geojson", data: "/crime_choropleth.geojson" });
      m.addLayer({
        id: "crime-choropleth-fill",
        type: "fill",
        source: "crime-choropleth-source",
        paint: {
          "fill-color": [
            "interpolate", ["linear"], ["get", "crime_count"],
            0,    "#f0f0f0",
            500,  "#fde68a",
            1000, "#fca5a5",
            2000, "#f87171",
            3500, "#ef4444",
            5000, "#b91c1c",
            7000, "#7f1d1d",
          ],
          "fill-opacity": ["case", [">", ["get", "crime_count"], 0], 0.7, 0.1],
        },
        layout: { visibility: "none" },
      });
      m.addLayer({
        id: "crime-choropleth-line",
        type: "line",
        source: "crime-choropleth-source",
        paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.5 },
        layout: { visibility: "none" },
      });


      // ---- ハザードレイヤー（国土地理院 重ねるハザードマップ タイル）----
      // 洪水浸水想定区域（想定最大規模）
      m.addSource("hazard-flood-source", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "国土交通省 ハザードマップポータルサイト",
        minzoom: 2, maxzoom: 17,
      });
      m.addLayer({
        id: "hazard-flood",
        type: "raster",
        source: "hazard-flood-source",
        paint: { "raster-opacity": 0.7 },
        layout: { visibility: "none" },
      });

      // 土砂災害警戒区域（土石流）
      m.addSource("hazard-landslide-source", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "国土交通省 ハザードマップポータルサイト",
        minzoom: 2, maxzoom: 17,
      });
      m.addLayer({
        id: "hazard-landslide",
        type: "raster",
        source: "hazard-landslide-source",
        paint: { "raster-opacity": 0.7 },
        layout: { visibility: "none" },
      });

      // 土砂災害警戒区域（急傾斜地の崩壊）
      m.addSource("hazard-landslide-steep-source", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "国土交通省 ハザードマップポータルサイト",
        minzoom: 2, maxzoom: 17,
      });
      m.addLayer({
        id: "hazard-landslide-steep",
        type: "raster",
        source: "hazard-landslide-steep-source",
        paint: { "raster-opacity": 0.7 },
        layout: { visibility: "none" },
      });

      // 土砂災害警戒区域（地すべり）
      m.addSource("hazard-landslide-slide-source", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "国土交通省 ハザードマップポータルサイト",
        minzoom: 2, maxzoom: 17,
      });
      m.addLayer({
        id: "hazard-landslide-slide",
        type: "raster",
        source: "hazard-landslide-slide-source",
        paint: { "raster-opacity": 0.7 },
        layout: { visibility: "none" },
      });

      // 津波浸水想定区域
      m.addSource("hazard-tsunami-source", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "国土交通省 ハザードマップポータルサイト",
        minzoom: 2, maxzoom: 17,
      });
      m.addLayer({
        id: "hazard-tsunami",
        type: "raster",
        source: "hazard-tsunami-source",
        paint: { "raster-opacity": 0.7 },
        layout: { visibility: "none" },
      });

      // 地震動予測地図（J-SHIS WMS プロキシ: 30年以内に震度6弱以上となる確率）
      // CORS回避のためNext.js APIルート経由でタイルを取得
      m.addSource("hazard-earthquake-source", {
        type: "raster",
        tiles: ["/api/earthquake-tile?z={z}&x={x}&y={y}"],
        tileSize: 512,  // 256の4倍面積 → リクエスト数1/4
        minzoom: 4,
        maxzoom: 8,     // zoom8以上は同タイルを拡大表示（地震リスクは街区レベル不変）
        attribution: "防災科学技術研究所 J-SHIS 全国地震動予測地図 2024年版",
      });
      m.addLayer({
        id: "hazard-earthquake",
        type: "raster",
        source: "hazard-earthquake-source",
        paint: { "raster-opacity": 0.7 },
        layout: { visibility: "none" },
      });

      // ---- 過去の被害レイヤー ----
      // 浸水実績図（計画規模 L1 — 複数年実績の重ね合わせ、年代非表示）
      m.addSource("history-flood-source", {
        type: "raster",
        tiles: ["https://disaportaldata.gsi.go.jp/raster/01_flood_l1_shinsuishin_data/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "国土交通省 ハザードマップポータルサイト",
        minzoom: 2, maxzoom: 17,
      });
      m.addLayer({
        id: "history-flood",
        type: "raster",
        source: "history-flood-source",
        paint: { "raster-opacity": 0.65 },
        layout: { visibility: "none" },
      });

      // 自然災害伝承碑（国土地理院）
      m.addSource("monuments-source", {
        type: "geojson",
        data: "/disaster_monuments.geojson",
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40,
      });
      m.addLayer({
        id: "monuments-circle",
        type: "circle",
        source: "monuments-source",
        paint: {
          "circle-radius": ["case", ["has", "point_count"], ["interpolate", ["linear"], ["get", "point_count"], 1, 14, 50, 22], 10],
          "circle-color": "#d97706",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.9,
        },
        layout: { visibility: "none" },
      });
      m.addLayer({
        id: "monuments-label",
        type: "symbol",
        source: "monuments-source",
        layout: {
          "text-field": ["case", ["has", "point_count"], ["to-string", ["get", "point_count"]], "📜"],
          "text-size": 11,
          "text-font": ["NotoSansJP-Regular"],
          visibility: "none",
        },
        paint: { "text-color": "#fff" },
      });

      // ---- 空き家率コロプレス（令和5年住宅・土地統計調査）----
      m.addSource("akiya-source", { type: "geojson", data: "/akiya_choropleth.geojson" });
      m.addLayer({
        id: "akiya-fill",
        type: "fill",
        source: "akiya-source",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "akiya_rate"], null], "#e0e0e0",
            [
              "interpolate", ["linear"], ["get", "akiya_rate"],
              0,   "#f0f9e8",
              5,   "#bae4bc",
              10,  "#7bccc4",
              15,  "#43a2ca",
              20,  "#0868ac",
              25,  "#fcbf49",
              30,  "#f77f00",
              40,  "#d62828",
            ],
          ],
          "fill-opacity": ["case", ["==", ["get", "akiya_rate"], null], 0.05, 0.75],
        },
        layout: { visibility: "none" },
      });
      m.addLayer({
        id: "akiya-line",
        type: "line",
        source: "akiya-source",
        paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.5 },
        layout: { visibility: "none" },
      });

      // ---- インタラクション: 空き家率ホバー ----
      m.on("mousemove", "akiya-fill", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const props = e.features?.[0]?.properties as MapFeatureProperties;
        if (!props || !e.lngLat) return;
        const rate = props.akiya_rate != null ? Number(props.akiya_rate) : null;
        const total = props.total_housing != null ? Number(props.total_housing) : null;
        const vacant = props.vacant_housing != null ? Number(props.vacant_housing) : null;
        const pref = props.prefecture ?? "";
        const muni = props.municipality ?? "";
        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-size:13px;line-height:1.7">
              <p style="font-weight:bold;margin:0 0 4px">${pref}${muni}</p>
              ${rate != null
                ? `<p style="margin:0">空き家率: <strong>${rate.toFixed(1)}%</strong></p>`
                : `<p style="margin:0;color:#888">データなし</p>`
              }
              ${vacant != null ? `<p style="margin:0;color:#666">空き家数: ${vacant.toLocaleString()}戸</p>` : ""}
              ${total != null ? `<p style="margin:0;color:#666">総住宅数: ${total.toLocaleString()}戸</p>` : ""}
              <p style="margin:4px 0 0;color:#aaa;font-size:10px">令和5年（2023年）住宅・土地統計調査</p>
            </div>
          `)
          .addTo(m);
      });
      m.on("mouseleave", "akiya-fill", () => {
        m.getCanvas().style.cursor = "";
        popup.current!.remove();
      });

      // mapLoaded を true にすることで上の useEffect が activeLayer で正しく実行される
      setMapLoaded(true);

      // ---- インタラクション: 価格コロプレス（区ホバー）----
      m.on("mousemove", "price-heatmap", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const props = e.features?.[0]?.properties as MapFeatureProperties;
        if (!props || !e.lngLat) return;
        const avgPrice = Number(props.avg_price_per_sqm ?? 0);
        const tsubo = Math.round(avgPrice * 3.30579);
        const pref = props.prefecture ?? "";
        const muni = (props.municipality && props.municipality !== props.prefecture) ? props.municipality : "";
        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-size:13px;line-height:1.6">
              <p style="font-weight:bold;margin:0 0 4px">${pref}${muni}</p>
              <p style="margin:0">平均㎡単価: <strong>${avgPrice > 0 ? avgPrice.toLocaleString() + "円" : "データなし"}</strong></p>
              ${avgPrice > 0 ? `<p style="margin:0">平均坪単価: <strong>${tsubo.toLocaleString()}円</strong></p>` : ""}
              ${props.transaction_count ? `<p style="margin:0;color:#666">取引件数: ${Number(props.transaction_count).toLocaleString()}件</p>` : ""}
            </div>
          `)
          .addTo(m);
      });
      m.on("mouseleave", "price-heatmap", () => {
        m.getCanvas().style.cursor = "";
        popup.current!.remove();
      });

      // ---- インタラクション: 犯罪コロプレス（市区町村ホバー）----
      m.on("mousemove", "crime-choropleth-fill", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const props = e.features?.[0]?.properties as MapFeatureProperties;
        if (!props || !e.lngLat) return;
        const pref = props.prefecture ?? "";
        const displayName = props.crime_display_name ?? props.municipality ?? "";
        const count = Number(props.crime_count ?? 0);
        const rank = props.crime_rank ? Number(props.crime_rank) : null;
        const total = Number(props.crime_total_ranked ?? 0);
        const isGroup = props.crime_is_group;
        const year = props.crime_year ?? "";
        const isEstimate = count > 0 && !["東京都","大阪府","神奈川県","愛知県","千葉県","埼玉県","兵庫県","福岡県","静岡県",
              "青森県","岩手県","宮城県","山形県","山梨県","長野県","奈良県","和歌山県","徳島県","長崎県","沖縄県",
              "群馬県","新潟県",
              "栃木県","京都府","佐賀県","熊本県","宮崎県","鹿児島県",
              "北海道","福島県","石川県","福井県","三重県","滋賀県","鳥取県","島根県","岡山県","山口県","高知県",
              "岐阜県"].includes(pref);

        // 犯罪種別内訳（上位4件）
        let typeRows = "";
        try {
          const types = props.crime_types ? JSON.parse(props.crime_types as string) : {};
          const sorted = Object.entries(types as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
          if (sorted.length > 0) {
            typeRows = sorted
              .map(([t, c]) => `<p style="margin:0;color:#555;font-size:12px">${t}: ${(c as number).toLocaleString()}件</p>`)
              .join("");
          }
        } catch { /* ignore */ }

        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-size:13px;line-height:1.7">
              <p style="font-weight:bold;margin:0 0 4px">${pref}${displayName}</p>
              ${count > 0
                ? `<p style="margin:0">認知件数合計: <strong>${count.toLocaleString()}件</strong>${year ? `<span style="color:#888;font-size:11px"> (${year})</span>` : ""}</p>`
                : `<p style="margin:0;color:#888">データなし</p>`
              }
              ${typeRows ? `<div style="margin:4px 0 2px;border-top:1px solid #eee;padding-top:4px">${typeRows}</div>` : ""}
              ${rank ? `<p style="margin:2px 0 0;color:#666">治安ワースト: <strong>${rank}位</strong> / ${total}市区中</p>` : ""}
              ${isGroup ? `<p style="margin:0;color:#aaa;font-size:11px">※市全体の数値</p>` : ""}
              ${isEstimate ? `<p style="margin:0;color:#aaa;font-size:11px">※警察庁都道府県統計からの推計値</p>` : ""}
            </div>
          `)
          .addTo(m);
      });
      m.on("mouseleave", "crime-choropleth-fill", () => {
        m.getCanvas().style.cursor = "";
        popup.current!.remove();
      });

      // ---- インタラクション: 伝承碑クリック ----
      m.on("click", "monuments-circle", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        // クラスター展開
        if (feature.properties?.cluster) {
          const clusterId = feature.properties.cluster_id as number;
          const src = m.getSource("monuments-source") as maplibregl.GeoJSONSource;
          src.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom == null) return;
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
            m.easeTo({ center: coords, zoom });
          });
          return;
        }
        const props = feature.properties as MonumentProperties;
        setSelectedMonument(props);
      });
      m.on("mouseenter", "monuments-circle", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "monuments-circle", () => { m.getCanvas().style.cursor = ""; });

      // ---- インタラクション: ハザードレイヤー ホバー（デバウンス200ms）----
      let hazardDebounce: ReturnType<typeof setTimeout> | null = null;
      m.on("mousemove", async (e) => {
        if (activeLayerRef.current !== "hazard") return;
        if (showHistoryRef.current) return;
        if (hazardDebounce) clearTimeout(hazardDebounce);
        hazardDebounce = setTimeout(async () => {
        if (!activeLayerRef.current || activeLayerRef.current !== "hazard") return;
        if (showHistoryRef.current) return;
        const { lng, lat } = e.lngLat;
        const activeHaz = activeHazardsRef.current;
        const types: string[] = [];
        if (activeHaz.has("flood")) types.push("flood");
        if (activeHaz.has("landslide")) types.push("landslide", "landslide-steep", "landslide-slide");
        if (activeHaz.has("tsunami")) types.push("tsunami");
        if (activeHaz.has("earthquake")) types.push("earthquake");
        if (types.length === 0) return;

        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-size:13px;padding:4px 2px">🔍 データ取得中...</div>`)
          .addTo(m);

        try {
          const params = new URLSearchParams({ lat: String(lat), lng: String(lng), types: types.join(",") });
          const res = await fetch(`/api/hazard-pixel?${params}`);
          const data: Record<string, string | null> = await res.json();

          const LABELS: Record<string, string> = {
            flood: "🌊 洪水浸水深（想定最大規模）",
            landslide: "⛰️ 土石流警戒区域",
            "landslide-steep": "⛰️ 急傾斜地崩壊警戒区域",
            "landslide-slide": "⛰️ 地すべり警戒区域",
            tsunami: "🌊 津波浸水深",
            earthquake: "🔴 地震確率（30年以内・震度6弱以上）",
          };

          const entries = Object.entries(data).filter(([, v]) => v !== null);
          const validRows = entries
            .map(([k, v]) => `<p style="margin:2px 0">${LABELS[k] ?? k}: <strong>${v}</strong></p>`)
            .join("");

          // 出典を種別ごとに出し分け（年度付き）
          const hitKeys = entries.map(([k]) => k);
          const attributions: string[] = [];
          if (hitKeys.some(k => k !== "earthquake")) attributions.push("国土交通省 ハザードマップポータル（2021年度）");
          if (hitKeys.includes("earthquake"))        attributions.push("防災科研 J-SHIS 全国地震動予測地図（2024年版）");
          const attributionHtml = attributions.map(a => `<p style="margin:1px 0">${a}</p>`).join("");

          popup.current!
            .setLngLat(e.lngLat)
            .setHTML(
              validRows
                ? `<div style="font-size:13px;line-height:1.7">${validRows}<div style="margin-top:5px;padding-top:4px;border-top:1px solid #eee;color:#888;font-size:10px;line-height:1.6">${attributionHtml}</div></div>`
                : `<div style="font-size:13px;color:#666">この地点はハザードエリア外です</div>`
            )
            .addTo(m);
        } catch {
          popup.current!.remove();
        }
        }, 200);
      });
      m.on("mouseleave", () => {
        if (hazardDebounce) clearTimeout(hazardDebounce);
        if (activeLayerRef.current === "hazard") popup.current!.remove();
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // mapLoaded を依存配列に追加：地図ロード完了後に必ず実行させる
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    updateLayerVisibility(activeLayer, activeHazards, false, showCrimeChoropleth);
  }, [mapLoaded, activeLayer, activeHazards, showCrimeChoropleth, showHistory, updateLayerVisibility]);

  // 検索結果の座標へ地図を移動
  useEffect(() => {
    if (!mapCenter || !map.current) return;
    map.current.flyTo({
      center: [mapCenter.lng, mapCenter.lat],
      zoom: mapCenter.zoom ?? 13,
      duration: 1200,
    });
  }, [mapCenter]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
