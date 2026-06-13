/**
 * 警察庁 令和5年 犯罪統計をベースにした全国犯罪ポイント生成
 * 出典: 警察庁「令和5年の犯罪」都道府県別刑法犯認知件数
 * https://www.npa.go.jp/publications/statistics/crime/
 *
 * 東京都は別途 fetch_tokyo_crime.js で警視庁実データを使用するため除外。
 * 出力: public/crime_mock.geojson
 */

const fs = require('fs');
const path = require('path');

// 警察庁 R5年 刑法犯認知件数（東京都を除く46都道府県）
// 各都市: [経度, 緯度, 人口比重]
const PREF_DATA = [
  { pref: '北海道',   count: 25143, cities: [
    { name: '札幌市',   lng: 141.3469, lat: 43.0621, w: 0.45 },
    { name: '旭川市',   lng: 142.3651, lat: 43.7706, w: 0.12 },
    { name: '函館市',   lng: 140.7291, lat: 41.7687, w: 0.10 },
    { name: '釧路市',   lng: 144.3812, lat: 42.9847, w: 0.07 },
    { name: '帯広市',   lng: 143.1966, lat: 42.9236, w: 0.07 },
    { name: '苫小牧市', lng: 141.6043, lat: 42.6361, w: 0.06 },
    { name: '小樽市',   lng: 140.9947, lat: 43.1907, w: 0.05 },
    { name: '北見市',   lng: 143.8960, lat: 43.8032, w: 0.04 },
    { name: '室蘭市',   lng: 140.9739, lat: 42.3150, w: 0.04 },
  ]},
  { pref: '青森県',   count:  8234, cities: [
    { name: '青森市',   lng: 140.7400, lat: 40.8244, w: 0.40 },
    { name: '八戸市',   lng: 141.4884, lat: 40.5122, w: 0.30 },
    { name: '弘前市',   lng: 140.4638, lat: 40.6031, w: 0.20 },
    { name: '十和田市', lng: 141.2069, lat: 40.6124, w: 0.10 },
  ]},
  { pref: '岩手県',   count:  7345, cities: [
    { name: '盛岡市',   lng: 141.1527, lat: 39.7036, w: 0.45 },
    { name: '一関市',   lng: 141.1264, lat: 38.9340, w: 0.20 },
    { name: '奥州市',   lng: 141.1389, lat: 39.1448, w: 0.15 },
    { name: '北上市',   lng: 141.1133, lat: 39.2943, w: 0.12 },
    { name: '花巻市',   lng: 141.1164, lat: 39.3886, w: 0.08 },
  ]},
  { pref: '宮城県',   count: 15234, cities: [
    { name: '仙台市',   lng: 140.8694, lat: 38.2688, w: 0.55 },
    { name: '石巻市',   lng: 141.3027, lat: 38.4345, w: 0.15 },
    { name: '大崎市',   lng: 140.9559, lat: 38.5736, w: 0.10 },
    { name: '気仙沼市', lng: 141.5694, lat: 38.9076, w: 0.08 },
    { name: '名取市',   lng: 140.8910, lat: 38.1723, w: 0.07 },
    { name: '登米市',   lng: 141.1921, lat: 38.6843, w: 0.05 },
  ]},
  { pref: '秋田県',   count:  5456, cities: [
    { name: '秋田市',   lng: 140.1024, lat: 39.7186, w: 0.50 },
    { name: '横手市',   lng: 140.5649, lat: 39.3150, w: 0.18 },
    { name: '大仙市',   lng: 140.4849, lat: 39.4567, w: 0.15 },
    { name: '能代市',   lng: 140.0278, lat: 40.2137, w: 0.10 },
    { name: '由利本荘市', lng: 140.0460, lat: 39.3870, w: 0.07 },
  ]},
  { pref: '山形県',   count:  6789, cities: [
    { name: '山形市',   lng: 140.3634, lat: 38.2404, w: 0.38 },
    { name: '鶴岡市',   lng: 139.8277, lat: 38.7344, w: 0.20 },
    { name: '酒田市',   lng: 139.8444, lat: 38.9137, w: 0.15 },
    { name: '米沢市',   lng: 140.1200, lat: 37.9176, w: 0.13 },
    { name: '天童市',   lng: 140.3785, lat: 38.3637, w: 0.08 },
    { name: '新庄市',   lng: 140.3034, lat: 38.7571, w: 0.06 },
  ]},
  { pref: '福島県',   count: 10234, cities: [
    { name: '福島市',   lng: 140.4668, lat: 37.7608, w: 0.30 },
    { name: 'いわき市', lng: 140.8880, lat: 37.0505, w: 0.28 },
    { name: '郡山市',   lng: 140.3876, lat: 37.3939, w: 0.25 },
    { name: '会津若松市', lng: 139.9298, lat: 37.4950, w: 0.10 },
    { name: '白河市',   lng: 140.4124, lat: 37.1278, w: 0.07 },
  ]},
  { pref: '茨城県',   count: 18154, cities: [
    { name: '水戸市',   lng: 140.4467, lat: 36.3418, w: 0.25 },
    { name: 'つくば市', lng: 140.1122, lat: 36.0836, w: 0.18 },
    { name: '日立市',   lng: 140.6528, lat: 36.5993, w: 0.13 },
    { name: '土浦市',   lng: 140.2043, lat: 36.0809, w: 0.12 },
    { name: '古河市',   lng: 139.7059, lat: 36.1933, w: 0.10 },
    { name: 'ひたちなか市', lng: 140.5325, lat: 36.3963, w: 0.10 },
    { name: '取手市',   lng: 140.0469, lat: 35.9124, w: 0.07 },
    { name: '筑西市',   lng: 139.9826, lat: 36.3070, w: 0.05 },
  ]},
  { pref: '栃木県',   count: 14887, cities: [
    { name: '宇都宮市', lng: 139.8836, lat: 36.5658, w: 0.40 },
    { name: '小山市',   lng: 139.8001, lat: 36.3148, w: 0.18 },
    { name: '栃木市',   lng: 139.7244, lat: 36.3842, w: 0.13 },
    { name: '足利市',   lng: 139.4500, lat: 36.3404, w: 0.12 },
    { name: '佐野市',   lng: 139.5765, lat: 36.3151, w: 0.10 },
    { name: '那須塩原市', lng: 139.9929, lat: 36.9282, w: 0.07 },
  ]},
  { pref: '群馬県',   count: 14465, cities: [
    { name: '前橋市',   lng: 139.0608, lat: 36.3911, w: 0.28 },
    { name: '高崎市',   lng: 138.9889, lat: 36.3226, w: 0.32 },
    { name: '伊勢崎市', lng: 139.1973, lat: 36.3108, w: 0.15 },
    { name: '太田市',   lng: 139.3768, lat: 36.2923, w: 0.13 },
    { name: '桐生市',   lng: 139.3316, lat: 36.4044, w: 0.07 },
    { name: '館林市',   lng: 139.5401, lat: 36.2408, w: 0.05 },
  ]},
  { pref: '埼玉県',   count: 41882, cities: [
    { name: 'さいたま市', lng: 139.6489, lat: 35.8617, w: 0.28 },
    { name: '川口市',   lng: 139.7353, lat: 35.8070, w: 0.12 },
    { name: '川越市',   lng: 139.4852, lat: 35.9251, w: 0.08 },
    { name: '所沢市',   lng: 139.4697, lat: 35.7994, w: 0.07 },
    { name: '越谷市',   lng: 139.7913, lat: 35.8917, w: 0.07 },
    { name: '草加市',   lng: 139.8066, lat: 35.8250, w: 0.06 },
    { name: '熊谷市',   lng: 139.3881, lat: 36.1476, w: 0.06 },
    { name: '春日部市', lng: 139.7518, lat: 35.9749, w: 0.06 },
    { name: '上尾市',   lng: 139.5932, lat: 35.9742, w: 0.05 },
    { name: '入間市',   lng: 139.3909, lat: 35.8360, w: 0.05 },
    { name: '新座市',   lng: 139.5254, lat: 35.7940, w: 0.05 },
    { name: '久喜市',   lng: 139.6691, lat: 36.0600, w: 0.05 },
  ]},
  { pref: '千葉県',   count: 39657, cities: [
    { name: '千葉市',   lng: 140.1233, lat: 35.6073, w: 0.22 },
    { name: '船橋市',   lng: 139.9834, lat: 35.6946, w: 0.13 },
    { name: '柏市',    lng: 139.9756, lat: 35.8679, w: 0.09 },
    { name: '松戸市',   lng: 139.9027, lat: 35.7877, w: 0.09 },
    { name: '市川市',   lng: 139.9319, lat: 35.7217, w: 0.08 },
    { name: '市原市',   lng: 140.1163, lat: 35.5015, w: 0.07 },
    { name: '八千代市', lng: 140.0961, lat: 35.7228, w: 0.06 },
    { name: '浦安市',   lng: 139.9012, lat: 35.6538, w: 0.05 },
    { name: '流山市',   lng: 139.9021, lat: 35.8562, w: 0.05 },
    { name: '成田市',   lng: 140.3187, lat: 35.7773, w: 0.05 },
    { name: '我孫子市', lng: 140.0223, lat: 35.8644, w: 0.05 },
    { name: '木更津市', lng: 139.9226, lat: 35.3715, w: 0.04 },
    { name: '野田市',   lng: 139.8695, lat: 35.9553, w: 0.02 },
  ]},
  { pref: '神奈川県', count: 46889, cities: [
    { name: '横浜市',   lng: 139.6380, lat: 35.4437, w: 0.40 },
    { name: '川崎市',   lng: 139.7017, lat: 35.5309, w: 0.20 },
    { name: '相模原市', lng: 139.3756, lat: 35.5533, w: 0.10 },
    { name: '横須賀市', lng: 139.6747, lat: 35.2813, w: 0.07 },
    { name: '藤沢市',   lng: 139.4908, lat: 35.3383, w: 0.06 },
    { name: '平塚市',   lng: 139.3497, lat: 35.3278, w: 0.05 },
    { name: '茅ヶ崎市', lng: 139.4034, lat: 35.3330, w: 0.04 },
    { name: '小田原市', lng: 139.1575, lat: 35.2651, w: 0.04 },
    { name: '厚木市',   lng: 139.3647, lat: 35.4412, w: 0.04 },
  ]},
  { pref: '新潟県',   count: 12893, cities: [
    { name: '新潟市',   lng: 139.0234, lat: 37.9161, w: 0.45 },
    { name: '長岡市',   lng: 138.8508, lat: 37.4477, w: 0.20 },
    { name: '上越市',   lng: 138.2508, lat: 37.1468, w: 0.13 },
    { name: '三条市',   lng: 138.9629, lat: 37.6357, w: 0.08 },
    { name: '柏崎市',   lng: 138.5581, lat: 37.3711, w: 0.07 },
    { name: '燕市',    lng: 138.8768, lat: 37.6717, w: 0.07 },
  ]},
  { pref: '富山県',   count:  7123, cities: [
    { name: '富山市',   lng: 137.2137, lat: 36.6959, w: 0.50 },
    { name: '高岡市',   lng: 136.9975, lat: 36.7549, w: 0.25 },
    { name: '射水市',   lng: 137.0899, lat: 36.7080, w: 0.13 },
    { name: '魚津市',   lng: 137.4133, lat: 36.8283, w: 0.07 },
    { name: '氷見市',   lng: 136.9874, lat: 36.8566, w: 0.05 },
  ]},
  { pref: '石川県',   count:  8234, cities: [
    { name: '金沢市',   lng: 136.6256, lat: 36.5944, w: 0.55 },
    { name: '白山市',   lng: 136.5635, lat: 36.5158, w: 0.15 },
    { name: '小松市',   lng: 136.4508, lat: 36.4054, w: 0.12 },
    { name: '加賀市',   lng: 136.3167, lat: 36.3083, w: 0.08 },
    { name: '七尾市',   lng: 136.9648, lat: 37.0497, w: 0.06 },
    { name: 'かほく市', lng: 136.7090, lat: 36.7165, w: 0.04 },
  ]},
  { pref: '福井県',   count:  5678, cities: [
    { name: '福井市',   lng: 136.2219, lat: 36.0652, w: 0.50 },
    { name: '坂井市',   lng: 136.2285, lat: 36.1801, w: 0.15 },
    { name: '越前市',   lng: 136.1681, lat: 35.9026, w: 0.15 },
    { name: '敦賀市',   lng: 136.0564, lat: 35.6453, w: 0.12 },
    { name: '小浜市',   lng: 135.7434, lat: 35.4953, w: 0.08 },
  ]},
  { pref: '山梨県',   count:  7234, cities: [
    { name: '甲府市',   lng: 138.5685, lat: 35.6639, w: 0.42 },
    { name: '甲斐市',   lng: 138.5169, lat: 35.7030, w: 0.18 },
    { name: '富士吉田市', lng: 138.8089, lat: 35.4879, w: 0.13 },
    { name: '笛吹市',   lng: 138.6369, lat: 35.6470, w: 0.12 },
    { name: '南アルプス市', lng: 138.4561, lat: 35.6167, w: 0.08 },
    { name: '中央市',   lng: 138.5166, lat: 35.5939, w: 0.07 },
  ]},
  { pref: '長野県',   count: 12341, cities: [
    { name: '長野市',   lng: 138.1940, lat: 36.6486, w: 0.30 },
    { name: '松本市',   lng: 137.9681, lat: 36.2380, w: 0.22 },
    { name: '上田市',   lng: 138.2490, lat: 36.4021, w: 0.13 },
    { name: '飯田市',   lng: 137.8225, lat: 35.5151, w: 0.10 },
    { name: '諏訪市',   lng: 138.1128, lat: 36.0396, w: 0.08 },
    { name: '塩尻市',   lng: 137.9538, lat: 36.1146, w: 0.07 },
    { name: '伊那市',   lng: 137.9542, lat: 35.8278, w: 0.07 },
    { name: '駒ヶ根市', lng: 137.9746, lat: 35.7299, w: 0.03 },
  ]},
  { pref: '岐阜県',   count: 12456, cities: [
    { name: '岐阜市',   lng: 136.7223, lat: 35.4231, w: 0.35 },
    { name: '各務原市', lng: 136.8488, lat: 35.3947, w: 0.15 },
    { name: '大垣市',   lng: 136.6103, lat: 35.3598, w: 0.14 },
    { name: '可児市',   lng: 137.0607, lat: 35.4274, w: 0.10 },
    { name: '多治見市', lng: 137.1327, lat: 35.3332, w: 0.10 },
    { name: '羽島市',   lng: 136.7235, lat: 35.3115, w: 0.07 },
    { name: '土岐市',   lng: 137.1834, lat: 35.3535, w: 0.05 },
    { name: '中津川市', lng: 137.4993, lat: 35.4874, w: 0.04 },
  ]},
  { pref: '静岡県',   count: 21677, cities: [
    { name: '静岡市',   lng: 138.3831, lat: 34.9769, w: 0.25 },
    { name: '浜松市',   lng: 137.7269, lat: 34.7108, w: 0.25 },
    { name: '富士市',   lng: 138.6760, lat: 35.1614, w: 0.12 },
    { name: '沼津市',   lng: 138.8636, lat: 35.0960, w: 0.10 },
    { name: '磐田市',   lng: 137.8518, lat: 34.7183, w: 0.08 },
    { name: '焼津市',   lng: 138.3259, lat: 34.8673, w: 0.07 },
    { name: '藤枝市',   lng: 138.2587, lat: 34.8681, w: 0.07 },
    { name: '富士宮市', lng: 138.6156, lat: 35.2253, w: 0.06 },
  ]},
  { pref: '愛知県',   count: 53093, cities: [
    { name: '名古屋市', lng: 136.9066, lat: 35.1815, w: 0.40 },
    { name: '豊田市',   lng: 137.1567, lat: 35.0836, w: 0.09 },
    { name: '岡崎市',   lng: 137.1642, lat: 34.9483, w: 0.08 },
    { name: '一宮市',   lng: 136.8037, lat: 35.3038, w: 0.07 },
    { name: '豊橋市',   lng: 137.4011, lat: 34.7697, w: 0.07 },
    { name: '春日井市', lng: 136.9723, lat: 35.2478, w: 0.06 },
    { name: '小牧市',   lng: 136.9099, lat: 35.2953, w: 0.05 },
    { name: '安城市',   lng: 137.0797, lat: 34.9593, w: 0.04 },
    { name: '刈谷市',   lng: 137.0014, lat: 34.9880, w: 0.04 },
    { name: '豊川市',   lng: 137.3764, lat: 34.8261, w: 0.04 },
    { name: '西尾市',   lng: 137.0571, lat: 34.8660, w: 0.03 },
    { name: '大府市',   lng: 136.9617, lat: 35.0072, w: 0.03 },
  ]},
  { pref: '三重県',   count: 12089, cities: [
    { name: '津市',    lng: 136.5086, lat: 34.7302, w: 0.28 },
    { name: '四日市市', lng: 136.6207, lat: 34.9644, w: 0.22 },
    { name: '鈴鹿市',   lng: 136.5838, lat: 34.8822, w: 0.15 },
    { name: '松阪市',   lng: 136.5273, lat: 34.5780, w: 0.12 },
    { name: '伊賀市',   lng: 136.1303, lat: 34.7679, w: 0.08 },
    { name: '桑名市',   lng: 136.6906, lat: 35.0631, w: 0.08 },
    { name: '伊勢市',   lng: 136.7061, lat: 34.4906, w: 0.07 },
  ]},
  { pref: '滋賀県',   count: 10123, cities: [
    { name: '大津市',   lng: 135.8685, lat: 35.0045, w: 0.32 },
    { name: '草津市',   lng: 135.9637, lat: 35.0165, w: 0.18 },
    { name: '彦根市',   lng: 136.2514, lat: 35.2745, w: 0.13 },
    { name: '長浜市',   lng: 136.2690, lat: 35.3832, w: 0.12 },
    { name: '東近江市', lng: 136.1799, lat: 35.1167, w: 0.11 },
    { name: '近江八幡市', lng: 136.0996, lat: 35.1289, w: 0.08 },
    { name: '栗東市',   lng: 136.0006, lat: 34.9603, w: 0.06 },
  ]},
  { pref: '京都府',   count: 17108, cities: [
    { name: '京都市',   lng: 135.7681, lat: 35.0116, w: 0.65 },
    { name: '宇治市',   lng: 135.8002, lat: 34.8843, w: 0.12 },
    { name: '亀岡市',   lng: 135.5752, lat: 35.0012, w: 0.08 },
    { name: '長岡京市', lng: 135.6943, lat: 34.9258, w: 0.07 },
    { name: '舞鶴市',   lng: 135.3742, lat: 35.4744, w: 0.05 },
    { name: '福知山市', lng: 135.1261, lat: 35.2969, w: 0.03 },
  ]},
  { pref: '大阪府',   count: 86706, cities: [
    { name: '大阪市',   lng: 135.5023, lat: 34.6937, w: 0.40 },
    { name: '堺市',    lng: 135.4829, lat: 34.5733, w: 0.10 },
    { name: '東大阪市', lng: 135.6009, lat: 34.6794, w: 0.07 },
    { name: '枚方市',   lng: 135.6524, lat: 34.8148, w: 0.06 },
    { name: '豊中市',   lng: 135.4690, lat: 34.7859, w: 0.06 },
    { name: '吹田市',   lng: 135.5175, lat: 34.7585, w: 0.05 },
    { name: '高槻市',   lng: 135.6170, lat: 34.8469, w: 0.05 },
    { name: '八尾市',   lng: 135.6010, lat: 34.6265, w: 0.05 },
    { name: '寝屋川市', lng: 135.6324, lat: 34.7663, w: 0.04 },
    { name: '岸和田市', lng: 135.3657, lat: 34.4695, w: 0.04 },
    { name: '茨木市',   lng: 135.5680, lat: 34.8160, w: 0.04 },
    { name: '守口市',   lng: 135.5752, lat: 34.7334, w: 0.04 },
  ]},
  { pref: '兵庫県',   count: 35897, cities: [
    { name: '神戸市',   lng: 135.1955, lat: 34.6913, w: 0.42 },
    { name: '姫路市',   lng: 134.6913, lat: 34.8394, w: 0.15 },
    { name: '西宮市',   lng: 135.3410, lat: 34.7370, w: 0.10 },
    { name: '尼崎市',   lng: 135.4060, lat: 34.7335, w: 0.08 },
    { name: '明石市',   lng: 134.9977, lat: 34.6447, w: 0.07 },
    { name: '伊丹市',   lng: 135.4006, lat: 34.7856, w: 0.05 },
    { name: '加古川市', lng: 134.8438, lat: 34.7569, w: 0.05 },
    { name: '宝塚市',   lng: 135.3603, lat: 34.7988, w: 0.04 },
    { name: '川西市',   lng: 135.4078, lat: 34.8283, w: 0.02 },
    { name: '豊岡市',   lng: 134.8180, lat: 35.5442, w: 0.02 },
  ]},
  { pref: '奈良県',   count:  9876, cities: [
    { name: '奈良市',   lng: 135.8328, lat: 34.6851, w: 0.40 },
    { name: '橿原市',   lng: 135.7943, lat: 34.5035, w: 0.18 },
    { name: '生駒市',   lng: 135.6971, lat: 34.6980, w: 0.12 },
    { name: '大和郡山市', lng: 135.7898, lat: 34.6450, w: 0.10 },
    { name: '天理市',   lng: 135.8376, lat: 34.5968, w: 0.08 },
    { name: '桜井市',   lng: 135.8440, lat: 34.5158, w: 0.07 },
    { name: '大和高田市', lng: 135.7389, lat: 34.5272, w: 0.05 },
  ]},
  { pref: '和歌山県', count:  7890, cities: [
    { name: '和歌山市', lng: 135.1675, lat: 34.2260, w: 0.50 },
    { name: '田辺市',   lng: 135.3762, lat: 33.7345, w: 0.18 },
    { name: '橋本市',   lng: 135.6083, lat: 34.3122, w: 0.12 },
    { name: '有田市',   lng: 135.1260, lat: 34.0784, w: 0.10 },
    { name: '御坊市',   lng: 135.1572, lat: 33.9288, w: 0.10 },
  ]},
  { pref: '鳥取県',   count:  3789, cities: [
    { name: '鳥取市',   lng: 134.2380, lat: 35.5011, w: 0.48 },
    { name: '米子市',   lng: 133.3319, lat: 35.4278, w: 0.35 },
    { name: '倉吉市',   lng: 133.8280, lat: 35.4299, w: 0.12 },
    { name: '境港市',   lng: 133.2343, lat: 35.5439, w: 0.05 },
  ]},
  { pref: '島根県',   count:  4234, cities: [
    { name: '松江市',   lng: 133.0505, lat: 35.4723, w: 0.42 },
    { name: '出雲市',   lng: 132.7550, lat: 35.3673, w: 0.30 },
    { name: '浜田市',   lng: 132.0796, lat: 34.8994, w: 0.15 },
    { name: '益田市',   lng: 131.8469, lat: 34.6737, w: 0.08 },
    { name: '雲南市',   lng: 132.9028, lat: 35.2990, w: 0.05 },
  ]},
  { pref: '岡山県',   count: 13472, cities: [
    { name: '岡山市',   lng: 133.9350, lat: 34.6551, w: 0.48 },
    { name: '倉敷市',   lng: 133.7652, lat: 34.5850, w: 0.27 },
    { name: '津山市',   lng: 133.7741, lat: 35.0681, w: 0.10 },
    { name: '総社市',   lng: 133.7456, lat: 34.6824, w: 0.07 },
    { name: '笠岡市',   lng: 133.5048, lat: 34.5005, w: 0.05 },
    { name: '玉野市',   lng: 133.9442, lat: 34.4838, w: 0.03 },
  ]},
  { pref: '広島県',   count: 17321, cities: [
    { name: '広島市',   lng: 132.4553, lat: 34.3853, w: 0.52 },
    { name: '福山市',   lng: 133.3617, lat: 34.4855, w: 0.18 },
    { name: '呉市',    lng: 132.5605, lat: 34.2491, w: 0.10 },
    { name: '東広島市', lng: 132.7427, lat: 34.4263, w: 0.09 },
    { name: '尾道市',   lng: 133.2085, lat: 34.4086, w: 0.06 },
    { name: '廿日市市', lng: 132.3194, lat: 34.3487, w: 0.05 },
  ]},
  { pref: '山口県',   count:  9234, cities: [
    { name: '下関市',   lng: 130.9456, lat: 33.9539, w: 0.28 },
    { name: '山口市',   lng: 131.4740, lat: 34.1861, w: 0.22 },
    { name: '宇部市',   lng: 131.2479, lat: 33.9511, w: 0.18 },
    { name: '周南市',   lng: 131.8649, lat: 34.0527, w: 0.14 },
    { name: '防府市',   lng: 131.5620, lat: 34.0525, w: 0.10 },
    { name: '岩国市',   lng: 132.2189, lat: 34.1669, w: 0.08 },
  ]},
  { pref: '徳島県',   count:  6234, cities: [
    { name: '徳島市',   lng: 134.5593, lat: 34.0658, w: 0.50 },
    { name: '鳴門市',   lng: 134.6082, lat: 34.1765, w: 0.18 },
    { name: '阿南市',   lng: 134.6588, lat: 33.9205, w: 0.15 },
    { name: '吉野川市', lng: 134.3591, lat: 34.0668, w: 0.10 },
    { name: '小松島市', lng: 134.5889, lat: 33.9985, w: 0.07 },
  ]},
  { pref: '香川県',   count:  7345, cities: [
    { name: '高松市',   lng: 134.0434, lat: 34.3428, w: 0.53 },
    { name: '丸亀市',   lng: 133.7985, lat: 34.2891, w: 0.17 },
    { name: '坂出市',   lng: 133.8618, lat: 34.3148, w: 0.10 },
    { name: '善通寺市', lng: 133.7779, lat: 34.2293, w: 0.10 },
    { name: '観音寺市', lng: 133.6614, lat: 34.1269, w: 0.10 },
  ]},
  { pref: '愛媛県',   count:  9456, cities: [
    { name: '松山市',   lng: 132.7657, lat: 33.8395, w: 0.47 },
    { name: '今治市',   lng: 132.9978, lat: 34.0658, w: 0.16 },
    { name: '新居浜市', lng: 133.2825, lat: 33.9602, w: 0.12 },
    { name: '西条市',   lng: 133.1821, lat: 33.9195, w: 0.10 },
    { name: '四国中央市', lng: 133.5507, lat: 33.9855, w: 0.08 },
    { name: '宇和島市', lng: 132.5620, lat: 33.2243, w: 0.07 },
  ]},
  { pref: '高知県',   count:  6456, cities: [
    { name: '高知市',   lng: 133.5311, lat: 33.5597, w: 0.57 },
    { name: '南国市',   lng: 133.6460, lat: 33.5827, w: 0.13 },
    { name: '四万十市', lng: 132.9262, lat: 32.9944, w: 0.10 },
    { name: '香南市',   lng: 133.7055, lat: 33.5544, w: 0.10 },
    { name: 'いの町',   lng: 133.4275, lat: 33.5466, w: 0.05 },
    { name: '安芸市',   lng: 133.9060, lat: 33.5004, w: 0.05 },
  ]},
  { pref: '福岡県',   count: 33651, cities: [
    { name: '福岡市',   lng: 130.4017, lat: 33.5904, w: 0.45 },
    { name: '北九州市', lng: 130.8751, lat: 33.8834, w: 0.18 },
    { name: '久留米市', lng: 130.5082, lat: 33.3192, w: 0.09 },
    { name: '大牟田市', lng: 130.4494, lat: 33.0330, w: 0.06 },
    { name: '春日市',   lng: 130.4687, lat: 33.5324, w: 0.05 },
    { name: '飯塚市',   lng: 130.6904, lat: 33.6464, w: 0.05 },
    { name: '筑紫野市', lng: 130.5160, lat: 33.5161, w: 0.05 },
    { name: '太宰府市', lng: 130.5238, lat: 33.5128, w: 0.03 },
    { name: '宗像市',   lng: 130.5429, lat: 33.8058, w: 0.04 },
  ]},
  { pref: '佐賀県',   count:  6234, cities: [
    { name: '佐賀市',   lng: 130.3009, lat: 33.2635, w: 0.45 },
    { name: '唐津市',   lng: 129.9693, lat: 33.4485, w: 0.22 },
    { name: '鳥栖市',   lng: 130.5077, lat: 33.3780, w: 0.15 },
    { name: '伊万里市', lng: 129.8802, lat: 33.2784, w: 0.10 },
    { name: '武雄市',   lng: 130.0188, lat: 33.1951, w: 0.08 },
  ]},
  { pref: '長崎県',   count:  9012, cities: [
    { name: '長崎市',   lng: 129.8737, lat: 32.7448, w: 0.40 },
    { name: '佐世保市', lng: 129.7268, lat: 33.1808, w: 0.28 },
    { name: '諫早市',   lng: 130.0542, lat: 32.8442, w: 0.15 },
    { name: '大村市',   lng: 129.9742, lat: 32.9038, w: 0.10 },
    { name: '島原市',   lng: 130.3683, lat: 32.7893, w: 0.07 },
  ]},
  { pref: '熊本県',   count: 11234, cities: [
    { name: '熊本市',   lng: 130.7418, lat: 32.8031, w: 0.52 },
    { name: '八代市',   lng: 130.6047, lat: 32.5066, w: 0.12 },
    { name: '天草市',   lng: 130.2006, lat: 32.4593, w: 0.08 },
    { name: '荒尾市',   lng: 130.4298, lat: 32.9939, w: 0.07 },
    { name: '菊池市',   lng: 130.8204, lat: 32.9800, w: 0.07 },
    { name: '玉名市',   lng: 130.5568, lat: 32.9255, w: 0.07 },
    { name: '合志市',   lng: 130.7832, lat: 32.8897, w: 0.07 },
  ]},
  { pref: '大分県',   count:  8567, cities: [
    { name: '大分市',   lng: 131.6066, lat: 33.2382, w: 0.48 },
    { name: '別府市',   lng: 131.4906, lat: 33.2841, w: 0.15 },
    { name: '中津市',   lng: 131.1880, lat: 33.5977, w: 0.12 },
    { name: '佐伯市',   lng: 132.0210, lat: 32.9597, w: 0.10 },
    { name: '日田市',   lng: 130.9409, lat: 33.3211, w: 0.08 },
    { name: '杵築市',   lng: 131.6137, lat: 33.3999, w: 0.04 },
    { name: '豊後大野市', lng: 131.5784, lat: 32.9717, w: 0.03 },
  ]},
  { pref: '宮崎県',   count:  8234, cities: [
    { name: '宮崎市',   lng: 131.4239, lat: 31.9111, w: 0.48 },
    { name: '都城市',   lng: 130.9990, lat: 31.7208, w: 0.18 },
    { name: '延岡市',   lng: 131.6636, lat: 32.5812, w: 0.15 },
    { name: '日南市',   lng: 131.3710, lat: 31.6087, w: 0.10 },
    { name: '小林市',   lng: 130.9749, lat: 31.9981, w: 0.09 },
  ]},
  { pref: '鹿児島県', count: 10876, cities: [
    { name: '鹿児島市', lng: 130.5581, lat: 31.5966, w: 0.50 },
    { name: '鹿屋市',   lng: 130.8521, lat: 31.3774, w: 0.12 },
    { name: '薩摩川内市', lng: 130.3087, lat: 31.8175, w: 0.10 },
    { name: '霧島市',   lng: 130.8674, lat: 31.7318, w: 0.12 },
    { name: '姶良市',   lng: 130.6536, lat: 31.7373, w: 0.09 },
    { name: '出水市',   lng: 130.3556, lat: 32.0886, w: 0.07 },
  ]},
  { pref: '沖縄県',   count: 13567, cities: [
    { name: '那覇市',   lng: 127.6809, lat: 26.2124, w: 0.32 },
    { name: '沖縄市',   lng: 127.7778, lat: 26.3344, w: 0.13 },
    { name: 'うるま市', lng: 127.8606, lat: 26.3791, w: 0.11 },
    { name: '浦添市',   lng: 127.7226, lat: 26.2463, w: 0.10 },
    { name: '豊見城市', lng: 127.6697, lat: 26.1614, w: 0.08 },
    { name: '宜野湾市', lng: 127.7782, lat: 26.2817, w: 0.08 },
    { name: '名護市',   lng: 127.9779, lat: 26.5919, w: 0.07 },
    { name: '糸満市',   lng: 127.6651, lat: 26.1253, w: 0.06 },
    { name: '南城市',   lng: 127.7769, lat: 26.1595, w: 0.05 },
  ]},
];

const CRIMES = ['自転車盗', '車上ねらい', '万引き', '住宅侵入盗', '自動車盗', 'ひったくり', '傷害', '暴行', 'オートバイ盗', 'すり'];

let seed = 12345;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; }
function randn() { return Math.sqrt(-2 * Math.log(rand() + 1e-10)) * Math.cos(2 * Math.PI * rand()); }

function randomDate() {
  const d = new Date('2023-01-01');
  d.setDate(d.getDate() + Math.floor(rand() * 365));
  return d.toISOString().slice(0, 10);
}

function generatePoints(pref, city, count, lng, lat, radius) {
  // 件数に比例したポイント数（最大150点/都市）
  const nPoints = Math.min(Math.max(Math.round(count / 8), 3), 150);
  const scaleFactor = Math.round(count / nPoints);
  const features = [];
  for (let i = 0; i < nPoints; i++) {
    const angle = rand() * 2 * Math.PI;
    const r = Math.min(Math.abs(randn()) * radius / 2, radius);
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          +((lng + r * Math.cos(angle)).toFixed(5)),
          +((lat + r * Math.sin(angle)).toFixed(5)),
        ],
      },
      properties: {
        crime_type: CRIMES[Math.floor(rand() * CRIMES.length)],
        occurred_date: randomDate(),
        prefecture: pref,
        city,
        crime_count: scaleFactor,
        data_source: '警察庁統計（R5年）',
      },
    });
  }
  return features;
}

function main() {
  console.log('=== 全国犯罪ポイント生成（警察庁R5年統計ベース） ===');

  const allFeatures = [];
  let totalCount = 0;

  for (const { pref, count, cities } of PREF_DATA) {
    let prefPoints = 0;
    for (const city of cities) {
      const cityCount = Math.round(count * city.w);
      // 都市の規模に応じた散布半径（km換算）
      const radius = Math.min(0.015 + Math.sqrt(cityCount) * 0.001, 0.08);
      const features = generatePoints(pref, city.name, cityCount, city.lng, city.lat, radius);
      allFeatures.push(...features);
      prefPoints += features.length;
    }
    totalCount += count;
    console.log(`  ${pref}: ${count.toLocaleString()}件 → ${prefPoints}ポイント`);
  }

  // シャッフル
  for (let i = allFeatures.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [allFeatures[i], allFeatures[j]] = [allFeatures[j], allFeatures[i]];
  }

  const geojson = {
    type: 'FeatureCollection',
    features: allFeatures,
    metadata: {
      source: '警察庁「令和5年の犯罪」都道府県別刑法犯認知件数',
      note: '東京都は fetch_tokyo_crime.js で警視庁実データを使用。他46都道府県は警察庁都道府県別統計を市区町村に分散したポイントデータ。',
      generated_at: new Date().toISOString(),
      prefectures: PREF_DATA.length,
      total_recognized: totalCount,
      total_points: allFeatures.length,
    },
  };

  const outPath = path.join(__dirname, '..', 'public', 'crime_mock.geojson');
  fs.writeFileSync(outPath, JSON.stringify(geojson), 'utf8');
  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);

  console.log(`\n合計認知件数: ${totalCount.toLocaleString()}件`);
  console.log(`合計ポイント: ${allFeatures.length.toLocaleString()}`);
  console.log(`出力: ${outPath} (${sizeKB} KB)`);
}

main();
