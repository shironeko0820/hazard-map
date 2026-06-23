import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const TILE_URLS: Record<string, string> = {
  flood: "https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png",
  landslide: "https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png",
  "landslide-steep": "https://disaportaldata.gsi.go.jp/raster/05_kyukeishakeikaikuiki/{z}/{x}/{y}.png",
  "landslide-slide": "https://disaportaldata.gsi.go.jp/raster/05_jisuberikeikaikuiki/{z}/{x}/{y}.png",
  tsunami: "https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png",
};

// J-SHIS 地震動予測地図: 30年以内に震度6弱以上となる確率
const EARTHQUAKE_LEGEND: Array<{ rgb: [number, number, number]; label: string }> = [
  { rgb: [196,   0,   0], label: "60%以上（極めて高い）" },
  { rgb: [220,  48,   0], label: "40〜60%（非常に高い）" },
  { rgb: [220, 124,   0], label: "26〜40%（高い）" },
  { rgb: [220, 220,   0], label: "6〜26%（やや高い）" },
  { rgb: [160, 220,   0], label: "3〜6%（低い）" },
  { rgb: [  0, 160,   0], label: "3%未満（非常に低い）" },
];

// 洪水浸水深の凡例色 (想定最大規模 L2)
const FLOOD_LEGEND: Array<{ rgb: [number, number, number]; label: string }> = [
  { rgb: [255, 247, 196], label: "0.5m未満" },
  { rgb: [250, 213, 99],  label: "0.5〜1.0m未満" },
  { rgb: [247, 171, 42],  label: "1.0〜2.0m未満" },
  { rgb: [240, 107, 45],  label: "2.0〜3.0m未満" },
  { rgb: [215, 66, 33],   label: "3.0〜4.0m未満" },
  { rgb: [187, 37, 23],   label: "4.0〜5.0m未満" },
  { rgb: [153, 0, 81],    label: "5.0〜10.0m未満" },
  { rgb: [99, 0, 70],     label: "10.0〜20.0m未満" },
  { rgb: [37, 0, 68],     label: "20.0m以上" },
];

// 津波浸水深の凡例色
const TSUNAMI_LEGEND: Array<{ rgb: [number, number, number]; label: string }> = [
  { rgb: [255, 247, 196], label: "0.5m未満" },
  { rgb: [250, 213, 99],  label: "0.5〜1.0m未満" },
  { rgb: [247, 171, 42],  label: "1.0〜2.0m未満" },
  { rgb: [240, 107, 45],  label: "2.0〜3.0m未満" },
  { rgb: [215, 66, 33],   label: "3.0〜4.0m未満" },
  { rgb: [187, 37, 23],   label: "4.0〜5.0m未満" },
  { rgb: [153, 0, 81],    label: "5.0〜10.0m未満" },
  { rgb: [99, 0, 70],     label: "10.0〜20.0m未満" },
  { rgb: [37, 0, 68],     label: "20.0m以上" },
];

// 土砂災害の凡例色
const LANDSLIDE_LEGEND: Array<{ rgb: [number, number, number]; label: string }> = [
  { rgb: [255, 217, 0],  label: "警戒区域" },
  { rgb: [255, 0, 0],    label: "特別警戒区域" },
];

function getLegend(type: string) {
  if (type === "flood") return FLOOD_LEGEND;
  if (type === "tsunami") return TSUNAMI_LEGEND;
  if (type === "earthquake") return EARTHQUAKE_LEGEND;
  return LANDSLIDE_LEGEND;
}

function colorDist(a: [number, number, number], b: [number, number, number]) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function matchEarthquake(r: number, g: number, b: number, a: number): string | null {
  if (a < 20) return null;
  // J-SHIS V3 タイルは赤(高リスク)→黄(中)→緑(低リスク)のグラデーション
  // 赤成分と緑成分の比率で確率帯を判定
  if (r > 200 && g < 80)  return "60%以上（極めて高い）";
  if (r > 180 && g < 140) return "40〜60%（非常に高い）";
  if (r > 150 && g < 180) return "26〜40%（高い）";
  if (r > 120 && g > 150) return "6〜26%（やや高い）";
  if (g > 150 && r < 140) return "3〜6%（低い）";
  if (g > 100 && r < 120) return "3%未満（非常に低い）";
  return "3%未満（非常に低い）";
}

function matchLegend(r: number, g: number, b: number, a: number, type: string): string | null {
  if (type === "earthquake") return matchEarthquake(r, g, b, a);
  if (a < 30) return null; // 透明 = ハザードなし
  const legend = getLegend(type);
  let best = legend[0];
  let bestDist = Infinity;
  for (const entry of legend) {
    const d = colorDist([r, g, b], entry.rgb);
    if (d < bestDist) { bestDist = d; best = entry; }
  }
  // 最近傍色が遠すぎる場合はハザードなしと判定
  if (bestDist > 20000) return null;
  return best.label;
}

function lngLatToTile(lng: number, lat: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

function pixelInTile(lng: number, lat: number, zoom: number, tx: number, ty: number) {
  const n = 2 ** zoom;
  const px = Math.floor(((lng + 180) / 360) * n * 256 - tx * 256);
  const latRad = (lat * Math.PI) / 180;
  const py = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256 - ty * 256
  );
  return {
    px: Math.max(0, Math.min(255, px)),
    py: Math.max(0, Math.min(255, py)),
  };
}

// J-SHIS WMS: 256x256画像を取得し中心ピクセルの色で確率帯を判定
async function queryEarthquake(lng: number, lat: number): Promise<string | null> {
  const d = 0.003;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const url = "https://www.j-shis.bosai.go.jp/map/wms/jmw"
    + "?map=P-Y2024-MAP-AVR-TTL_MTTL&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
    + "&LAYERS=P-Y2024-MAP-AVR-TTL_MTTL-T30_I60_PD2&FORMAT=image/png"
    + `&TRANSPARENT=true&SRS=EPSG:4326&WIDTH=256&HEIGHT=256&BBOX=${bbox}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MachiScore/1.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { data } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const cx = 128, cy = 128;
    const idx = (cy * 256 + cx) * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
    return matchEarthquake(r, g, b, a);
  } catch {
    return null;
  }
}

async function queryTile(type: string, lng: number, lat: number, zoom = 14): Promise<string | null> {
  const urlTemplate = TILE_URLS[type];
  if (!urlTemplate) return null;

  const { x, y } = lngLatToTile(lng, lat, zoom);
  const { px, py } = pixelInTile(lng, lat, zoom, x, y);
  const url = urlTemplate.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y));

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MachiScore/1.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    const { data } = await sharp(buf)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const idx = (py * 256 + px) * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];

    return matchLegend(r, g, b, a, type);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const types = (searchParams.get("types") ?? "").split(",").filter(Boolean);

  if (isNaN(lat) || isNaN(lng) || types.length === 0) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const results = await Promise.all(
    types.map(async (type) => {
      const label = type === "earthquake"
        ? await queryEarthquake(lng, lat)
        : await queryTile(type, lng, lat);
      return { type, label };
    })
  );

  return NextResponse.json(
    Object.fromEntries(results.map(({ type, label }) => [type, label]))
  );
}
