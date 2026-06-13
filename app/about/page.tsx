import Link from "next/link";

export const metadata = {
  title: "使い方 | SmileMap",
  description: "SmileMapの使い方ガイド",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/" className="text-blue-600 text-sm hover:underline">← 地図に戻る</Link>

      <h1 className="text-2xl font-bold text-gray-800 mt-4 mb-8">SmileMap 使い方ガイド</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">SmileMapとは</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          SmileMapは、不動産価格・治安・ハザードリスクを地図上で一覧できる情報サービスです。
          住まい探しや引越し先の比較検討にご活用ください。
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">レイヤーの切り替え</h2>
        <ul className="space-y-3 text-sm text-gray-600">
          <li className="flex gap-3">
            <span className="text-xl">💴</span>
            <div>
              <p className="font-medium text-gray-700">価格レイヤー</p>
              <p>市区町村ごとの不動産取引価格をヒートマップで表示します。赤いほど高価格、青いほど低価格です。国土交通省「不動産情報ライブラリ」のデータを使用しています。</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-xl">🚨</span>
            <div>
              <p className="font-medium text-gray-700">治安レイヤー</p>
              <p>犯罪発生地点を地図上にプロットします。東京都は警視庁の統計データを使用しています。「📍 地点」ボタンで個別ポイントの表示・非表示を切り替えられます。</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-xl">🌊</span>
            <div>
              <p className="font-medium text-gray-700">災害レイヤー</p>
              <p>国土交通省のハザードマップポータルから取得した洪水・土砂災害・津波のリスクエリアを表示します。ボタンで種類ごとに表示・非表示を切り替えられます。</p>
            </div>
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">住所検索</h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          上部の検索ボックスに住所を入力して「検索」を押すと、該当エリアに地図が移動し、スコアカードが表示されます。
          例：「東京都渋谷区」「大阪府大阪市北区」
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">データの出典</h2>
        <ul className="space-y-1 text-sm text-gray-600 list-disc list-inside">
          <li>不動産取引価格: 国土交通省 不動産情報ライブラリ</li>
          <li>東京都犯罪統計: 警視庁 犯罪認知件数統計</li>
          <li>ハザードマップ: 国土交通省 ハザードマップポータルサイト</li>
          <li>市区町村境界: 国土数値情報（行政区域）</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">免責事項</h2>
        <p className="text-gray-500 text-xs leading-relaxed">
          本サービスの情報は参考目的のみです。不動産の購入・賃貸などの意思決定には、必ず公的機関や専門家にご確認ください。
          データの正確性・完全性について保証するものではありません。
        </p>
      </section>
    </div>
  );
}
