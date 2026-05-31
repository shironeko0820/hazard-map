interface Props {
  cityName: string;
  cityCode: string;
}

export default function AffiliateLinks({ cityName, cityCode }: Props) {
  const suumoUrl = `https://suumo.jp/jj/bukken/ichiran/JJ010FJ001/?ar=030&bs=011&ta=13&city=${encodeURIComponent(cityName)}`;
  const homesUrl = `https://www.homes.co.jp/kodate/list/?pref=13&city=${cityCode}`;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500 font-medium">このエリアの物件を探す</p>
      <a
        href={suumoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between bg-green-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-green-700 transition-colors"
      >
        <span>SUUMOで物件を探す</span>
        <span>→</span>
      </a>
      <a
        href={homesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <span>HOME&apos;Sで物件を探す</span>
        <span>→</span>
      </a>
    </div>
  );
}
