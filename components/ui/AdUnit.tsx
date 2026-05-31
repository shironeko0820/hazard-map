interface Props {
  width: number;
  height: number;
  slot?: string;
}

export default function AdUnit({ width, height, slot }: Props) {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  if (clientId && slot) {
    return (
      <div style={{ width, height }}>
        <ins
          className="adsbygoogle"
          style={{ display: "block", width, height }}
          data-ad-client={clientId}
          data-ad-slot={slot}
        />
      </div>
    );
  }

  // プレースホルダー
  return (
    <div
      className="flex items-center justify-center bg-gray-100 border border-dashed border-gray-300 text-xs text-gray-400 rounded"
      style={{ width, height }}
    >
      広告 {width}×{height}
    </div>
  );
}
