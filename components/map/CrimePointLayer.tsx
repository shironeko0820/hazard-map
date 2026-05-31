"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

interface Props {
  map: maplibregl.Map;
  visible: boolean;
}

const SOURCE_ID = "crime-points-source";
const LAYERS = ["crime-clusters", "crime-cluster-count", "crime-unclustered"];

export default function CrimePointLayer({ map, visible }: Props) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!map.isStyleLoaded()) return;

    if (!initialized.current) {
      // クラスタリング付きソース追加
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

      initialized.current = true;
    } else {
      // 表示切替
      const v = visible ? "visible" : "none";
      LAYERS.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
      });
    }
  }, [map, visible]);

  // アンマウント時にレイヤー・ソースを削除
  useEffect(() => {
    return () => {
      LAYERS.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
