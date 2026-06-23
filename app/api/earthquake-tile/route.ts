import { NextRequest, NextResponse } from "next/server";

// XYZタイル座標 → EPSG:4326 BBOX
function tileToBbox(z: number, x: number, y: number) {
  const n = 2 ** z;
  const west  = (x / n) * 360 - 180;
  const east  = ((x + 1) / n) * 360 - 180;
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  const north = (northRad * 180) / Math.PI;
  const south = (southRad * 180) / Math.PI;
  return `${west},${south},${east},${north}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const z = parseInt(searchParams.get("z") ?? "");
  const x = parseInt(searchParams.get("x") ?? "");
  const y = parseInt(searchParams.get("y") ?? "");

  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return new NextResponse(null, { status: 400 });
  }

  const bbox = tileToBbox(z, x, y);
  // 512×512で取得 → 同じ画面カバレッジをリクエスト数1/4で実現
  const wmsUrl =
    "https://www.j-shis.bosai.go.jp/map/wms/jmw" +
    "?map=P-Y2024-MAP-AVR-TTL_MTTL&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap" +
    "&LAYERS=P-Y2024-MAP-AVR-TTL_MTTL-T30_I60_PD2&FORMAT=image/png" +
    `&TRANSPARENT=true&SRS=EPSG:4326&WIDTH=512&HEIGHT=512&BBOX=${bbox}`;

  try {
    const res = await fetch(wmsUrl, {
      headers: { "User-Agent": "MachiScore/1.0" },
      next: { revalidate: 604800 }, // 7日間サーバーキャッシュ
    });
    if (!res.ok) return new NextResponse(null, { status: res.status });

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        // public: ブラウザ・CDN両方でキャッシュ
        // s-maxage: Vercel Edge CDNに7日キャッシュ（地震データはほぼ不変）
        // stale-while-revalidate: 期限切れ後も古いキャッシュを即返しつつバックグラウンド更新
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
