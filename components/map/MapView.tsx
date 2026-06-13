"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl, { type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapStore } from "@/lib/store";
import type { MapFeatureProperties } from "@/types";
import type { HazardType } from "@/lib/store";
import CrimePointLayer from "./CrimePointLayer";

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

const CRIME_COLORS: ExpressionSpecification = [
  "interpolate", ["linear"], ["heatmap-density"],
  0, "rgba(0,255,0,0)",
  0.2, "#7fff00",
  0.5, "#ffff00",
  0.8, "#ff7f00",
  1, "#ff0000",
];


export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { activeLayer, showCrimePoints, showCrimeHeatmap, showCrimeChoropleth, activeHazards, mapCenter } = useMapStore();

  const updateLayerVisibility = useCallback((
    layer: string,
    hazards: Set<string> = new Set(["flood"]),
    crimeHeatmap: boolean = true,
    crimeChoropleth: boolean = true,
  ) => {
    if (!map.current) return;
    const m = map.current;

    const allLayers = [
      "price-heatmap", "price-circle",
      "crime-choropleth-fill", "crime-choropleth-line",
      "crime-heatmap", "crime-circle",
      "hazard-flood",
      "hazard-landslide", "hazard-landslide-steep", "hazard-landslide-slide",
      "hazard-tsunami",
    ];

    allLayers.forEach((id) => {
      if (!m.getLayer(id)) return;
      let visible = false;
      if (layer === "price" && (id === "price-heatmap" || id === "price-circle")) visible = true;
      if (layer === "crime") {
        if ((id === "crime-choropleth-fill" || id === "crime-choropleth-line") && crimeChoropleth) visible = true;
        if (id === "crime-heatmap" && crimeHeatmap) visible = true;
        if (id === "crime-circle") visible = true;
      }
      if (layer === "hazard") {
        if (id === "hazard-flood" && hazards.has("flood")) visible = true;
        if (
          (id === "hazard-landslide" || id === "hazard-landslide-steep" || id === "hazard-landslide-slide")
          && hazards.has("landslide")
        ) visible = true;
        if (id === "hazard-tsunami" && hazards.has("tsunami")) visible = true;
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

      // ---- 犯罪レイヤー（東京: 警視庁実データ / 他: モック）----
      m.addSource("crime-source", { type: "geojson", data: "/crime_japan.geojson" });
      m.addLayer({
        id: "crime-heatmap",
        type: "heatmap",
        source: "crime-source",
        maxzoom: 14,
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 3],
          "heatmap-color": CRIME_COLORS,
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 40, 14, 60],
          "heatmap-opacity": 0.75,
        },
        layout: { visibility: "none" },
      });
      m.addLayer({
        id: "crime-circle",
        type: "circle",
        source: "crime-source",
        minzoom: 14,
        paint: {
          "circle-radius": 7,
          "circle-color": "#ff4444",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.85,
        },
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
        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-size:13px;line-height:1.7">
              <p style="font-weight:bold;margin:0 0 4px">${pref}${displayName}</p>
              ${count > 0
                ? `<p style="margin:0">認知件数: <strong>${count.toLocaleString()}件</strong></p>`
                : `<p style="margin:0;color:#888">データなし</p>`
              }
              ${rank ? `<p style="margin:0;color:#666">治安ワースト: <strong>${rank}位</strong> / ${total}市区中</p>` : ""}
              ${isGroup ? `<p style="margin:0;color:#aaa;font-size:11px">※市全体の数値</p>` : ""}
              ${count > 0 && pref !== "東京都" ? `<p style="margin:0;color:#aaa;font-size:11px">※警察庁都道府県統計からの推計値</p>` : ""}
            </div>
          `)
          .addTo(m);
      });
      m.on("mouseleave", "crime-choropleth-fill", () => {
        m.getCanvas().style.cursor = "";
        popup.current!.remove();
      });

      // ---- インタラクション: 犯罪サークル ----
      m.on("mouseenter", "crime-circle", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const props = e.features?.[0]?.properties as MapFeatureProperties;
        if (!props || !e.lngLat) return;
        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-sm">
              <p class="font-bold">🚨 ${props.crime_type ?? ""}</p>
              <p class="text-gray-600">${props.occurred_date ?? ""}</p>
            </div>
          `)
          .addTo(m);
      });
      m.on("mouseleave", "crime-circle", () => {
        m.getCanvas().style.cursor = "";
        popup.current!.remove();
      });

      // ハザードレイヤーはラスタータイルのため個別クリックなし
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // mapLoaded を依存配列に追加：地図ロード完了後に必ず実行させる
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    updateLayerVisibility(activeLayer, activeHazards, showCrimeHeatmap, showCrimeChoropleth);
  }, [mapLoaded, activeLayer, activeHazards, showCrimeHeatmap, showCrimeChoropleth, updateLayerVisibility]);

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
      {mapLoaded && map.current && (
        <CrimePointLayer map={map.current} visible={showCrimePoints} />
      )}
    </div>
  );
}
