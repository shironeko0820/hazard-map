"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

interface Props {
  map: maplibregl.Map;
  visible: boolean;
}

const SOURCE_ID = "crime-points-source";
const LAYERS = ["crime-clusters", "crime-cluster-count", "crime-unclustered"];

// 手口ごとのアイコン
const CRIME_ICONS: Record<string, string> = {
  "ひったくり":   "🏃",
  "車上ねらい":   "🚗",
  "部品ねらい":   "🔧",
  "自販機ねらい": "🥤",
  "自動車盗":     "🚘",
  "オートバイ盗": "🛵",
  "自転車盗":     "🚲",
};

export default function CrimePointLayer({ map, visible }: Props) {
  const initialized = useRef(false);
  const popup = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!map.isStyleLoaded()) return;

    // ポップアップ初期化
    if (!popup.current) {
      popup.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
      });
    }

    if (!initialized.current) {
      // クラスタリング付きソース
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: "/crime_tokyo.geojson",
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // クラスター円
      map.addLayer({
        id: "crime-clusters",
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step", ["get", "point_count"],
            "#ff9999", 10,
            "#ff4444", 100,
            "#cc0000",
          ],
          "circle-radius": [
            "step", ["get", "point_count"],
            18, 10,
            24, 100,
            32,
          ],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
        layout: { visibility: visible ? "visible" : "none" },
      });

      // クラスター件数テキスト
      map.addLayer({
        id: "crime-cluster-count",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
          visibility: visible ? "visible" : "none",
        },
        paint: { "text-color": "#fff" },
      });

      // 個別点（ズームイン時）
      map.addLayer({
        id: "crime-unclustered",
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": "#ff2222",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.8,
        },
        layout: { visibility: visible ? "visible" : "none" },
      });

      // ---- 個別点ホバー: ポップアップ表示 ----
      map.on("mouseenter", "crime-unclustered", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature || !e.lngLat) return;

        const props = feature.properties as {
          crime_type?: string;
          city?: string;
          town?: string;
          crime_name?: string;
        };

        const icon = CRIME_ICONS[props.crime_type ?? ""] ?? "🚨";
        const location = [props.city, props.town].filter(Boolean).join(" ");

        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-size:13px;line-height:1.6;min-width:120px;">
              <div style="font-weight:bold;margin-bottom:2px;">${icon} ${props.crime_type ?? "不明"}</div>
              ${props.crime_name ? `<div style="color:#666;font-size:11px;">${props.crime_name}</div>` : ""}
              ${location ? `<div style="color:#555;font-size:11px;">📍 ${location}</div>` : ""}
            </div>
          `)
          .addTo(map);
      });

      map.on("mouseleave", "crime-unclustered", () => {
        map.getCanvas().style.cursor = "";
        popup.current?.remove();
      });

      // ---- クラスタークリック: ズームイン ----
      map.on("click", "crime-clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["crime-clusters"] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          const geometry = features[0].geometry as GeoJSON.Point;
          map.easeTo({ center: geometry.coordinates as [number, number], zoom });
        });
      });

      map.on("mouseenter", "crime-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "crime-clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      initialized.current = true;
    } else {
      // 表示切替
      const v = visible ? "visible" : "none";
      LAYERS.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
      });
    }
  }, [map, visible]);

  // アンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      popup.current?.remove();
      LAYERS.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
