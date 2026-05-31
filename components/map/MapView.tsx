"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl, { type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapStore } from "@/lib/store";
import { MOCK_PRICE_GEOJSON, MOCK_CRIME_GEOJSON, MOCK_HAZARD_GEOJSON, MOCK_AREA_SCORES } from "@/lib/mockData";
import type { MapFeatureProperties } from "@/types";

const PRICE_COLORS: ExpressionSpecification = [
  "interpolate", ["linear"], ["get", "price_per_sqm"],
  300000, "#313695",
  600000, "#4575b4",
  800000, "#74add1",
  900000, "#abd9e9",
  1000000, "#fee090",
  1100000, "#fdae61",
  1200000, "#f46d43",
  1400000, "#d73027",
  1600000, "#a50026",
];

const CRIME_COLORS: ExpressionSpecification = [
  "interpolate", ["linear"], ["heatmap-density"],
  0, "rgba(0,255,0,0)",
  0.2, "#7fff00",
  0.5, "#ffff00",
  0.8, "#ff7f00",
  1, "#ff0000",
];

const FLOOD_FILL_COLOR: ExpressionSpecification = [
  "interpolate", ["linear"], ["get", "flood_risk_level"],
  0, "#ffffff",
  1, "#aed6f1",
  2, "#5dade2",
  3, "#3498db",
  4, "#1a5276",
  5, "#0d2b4e",
];

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const { activeLayer, setSelectedArea } = useMapStore();

  const updateLayerVisibility = useCallback((layer: string) => {
    if (!map.current) return;
    const m = map.current;

    const allLayers = [
      "price-heatmap", "price-circle",
      "crime-heatmap", "crime-circle",
      "hazard-fill", "hazard-stroke",
    ];

    const visibleByLayer: Record<string, string[]> = {
      price: ["price-heatmap", "price-circle"],
      crime: ["crime-heatmap", "crime-circle"],
      hazard: ["hazard-fill", "hazard-stroke"],
    };

    allLayers.forEach((id) => {
      if (m.getLayer(id)) {
        m.setLayoutProperty(
          id,
          "visibility",
          visibleByLayer[layer]?.includes(id) ? "visible" : "none"
        );
      }
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
      // ---- 価格レイヤー ----
      m.addSource("price-source", { type: "geojson", data: MOCK_PRICE_GEOJSON });
      m.addLayer({
        id: "price-heatmap",
        type: "heatmap",
        source: "price-source",
        maxzoom: 14,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "price_per_sqm"], 300000, 0, 1600000, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 3],
          "heatmap-color": CRIME_COLORS,
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 30, 14, 50],
          "heatmap-opacity": 0.7,
        },
      });
      m.addLayer({
        id: "price-circle",
        type: "circle",
        source: "price-source",
        minzoom: 14,
        paint: {
          "circle-radius": 8,
          "circle-color": PRICE_COLORS,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.9,
        },
      });

      // ---- 犯罪レイヤー ----
      m.addSource("crime-source", { type: "geojson", data: MOCK_CRIME_GEOJSON });
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

      // ---- ハザードレイヤー ----
      m.addSource("hazard-source", { type: "geojson", data: MOCK_HAZARD_GEOJSON });
      m.addLayer({
        id: "hazard-fill",
        type: "fill",
        source: "hazard-source",
        paint: {
          "fill-color": FLOOD_FILL_COLOR,
          "fill-opacity": 0.55,
        },
        layout: { visibility: "none" },
      });
      m.addLayer({
        id: "hazard-stroke",
        type: "line",
        source: "hazard-source",
        paint: { "line-color": "#1a5276", "line-width": 1, "line-opacity": 0.6 },
        layout: { visibility: "none" },
      });

      updateLayerVisibility("price");

      // ---- インタラクション: 価格サークル ----
      m.on("mouseenter", "price-circle", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const props = e.features?.[0]?.properties as MapFeatureProperties;
        if (!props || !e.lngLat) return;
        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-sm">
              <p class="font-bold">${props.property_type ?? ""}</p>
              <p>㎡単価: <strong>${Number(props.price_per_sqm ?? 0).toLocaleString()}円</strong></p>
              <p>最寄り: ${props.nearest_station ?? ""}駅 徒歩${props.walk_minutes ?? "?"}分</p>
            </div>
          `)
          .addTo(m);
      });
      m.on("mouseleave", "price-circle", () => {
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

      // ---- インタラクション: ハザードポリゴンクリック ----
      m.on("click", "hazard-fill", (e) => {
        const props = e.features?.[0]?.properties as MapFeatureProperties;
        if (!props?.city_code) return;
        const area = MOCK_AREA_SCORES[props.city_code];
        if (area) setSelectedArea(area);
      });
      m.on("mouseenter", "hazard-fill", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const props = e.features?.[0]?.properties as MapFeatureProperties;
        if (!props || !e.lngLat) return;
        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-sm">
              <p class="font-bold">${props.city_name ?? ""}</p>
              <p>洪水リスク: Lv.${props.flood_risk_level ?? 0}</p>
              <p>総合スコア: ${props.overall_score ?? "?"}</p>
            </div>
          `)
          .addTo(m);
      });
      m.on("mouseleave", "hazard-fill", () => {
        m.getCanvas().style.cursor = "";
        popup.current!.remove();
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (map.current?.isStyleLoaded()) {
      updateLayerVisibility(activeLayer);
    }
  }, [activeLayer, updateLayerVisibility]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
