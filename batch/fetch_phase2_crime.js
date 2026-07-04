/**
 * Phase 2: 警察庁犯罪オープンデータ CSVから実犯罪データを生成
 * 対象: 大阪府・神奈川県・愛知県・千葉県・埼玉県・兵庫県・福岡県・静岡県
 *
 * 入力: public/choropleth.geojson (市区町村ポリゴン、重心座標算出用)
 *       public/crime_mock.geojson (既存モックデータ、Phase 2は上書き)
 * 出力: public/crime_mock.geojson (Phase 2実データに更新)
 *
 * CSV形式 (警察庁標準):
 *   罪名,手口,管轄警察署,管轄交番・駐在所,市区町村コード,都道府県,市区町村,町丁目,...
 *   各行 = 1件の犯罪発生記録
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const zlib  = require('zlib');
const XLSX  = require('xlsx');

// ---- 対象府県の定義 ----
const CRIME_TYPES = [
  'hittakuri', 'syazyounerai', 'buhinnerai', 'zidouhanbaikinerai',
  'zidousyatou', 'ootobaitou', 'zitensyatou',
];

const PREFECTURES = [
  {
    name: '大阪府',
    urlFn: (type) => `https://www.police.pref.osaka.lg.jp/material/files/group/2/osaka_2024${type}.csv`,
  },
  {
    name: '神奈川県',
    urlFn: (type) => `https://www.police.pref.kanagawa.jp/assets/entry/kanagawa_2024${type}.csv`,
  },
  {
    name: '愛知県',
    urlFn: (type) => `https://www.pref.aichi.jp/police/anzen/toukei/opendata/seian-s/images/aichi-2024${type}.csv`,
  },
  {
    name: '千葉県',
    urlFn: (type) => {
      const IDS = {
        hittakuri:            '000066997',
        syazyounerai:         '000066998',
        buhinnerai:           '000066999',
        zidouhanbaikinerai:   '000067000',
        zidousyatou:          '000067001',
        ootobaitou:           '000067002',
        zitensyatou:          '000067003',
      };
      return `https://www.police.pref.chiba.jp/content/common/${IDS[type]}.csv`;
    },
  },
  {
    name: '埼玉県',
    urlFn: (type) => `https://www.police.pref.saitama.lg.jp/documents/33251/saitama_2024${type}.csv`,
  },
  {
    name: '兵庫県',
    urlFn: (type) => {
      // buhinnerai のみファイル名にタイポ（hyogp）
      const prefix = type === 'buhinnerai' ? 'hyogp' : 'hyogo';
      return `https://web.pref.hyogo.lg.jp/kk26/johoseisaku/documents/${prefix}_2024${type}.csv`;
    },
  },
  {
    name: '福岡県',
    urlFn: (type) => {
      // BODIK プラットフォーム経由（リソースIDが型ごとに異なる）
      const RESOURCE_IDS = {
        hittakuri:            'a3922e4a-5fd1-428d-bbb4-1ebe1a2c85f8',
        syazyounerai:         '905967a8-6908-4bce-b1f9-c73dc7b6ce7d',
        buhinnerai:           '0b7da485-d31c-4b40-8cb4-924a5017cb10',
        zidouhanbaikinerai:   'd547241c-f81b-49a3-9363-df4d7452b852',
        zidousyatou:          'c6efe39e-4d3d-42f7-9bb9-b37462142edb',
        ootobaitou:           'b92c2b2f-502e-4618-999a-c5704768ad4e',
        zitensyatou:          '3357a675-7deb-4955-9840-13a57d4b7c9d',
      };
      const rid = RESOURCE_IDS[type];
      return `https://data.bodik.jp/dataset/c86326fe-655b-4eb0-a0fe-e29f163f31aa/resource/${rid}/download/fukuoka_2024${type}.csv`;
    },
  },
  {
    name: '静岡県',
    urlFn: (type) => {
      // 静岡はアンダースコア区切り＋syazyounerai→syazyonerai（uなし）
      // 2024年ファイルが404の場合は2023年にフォールバック（呼び出し側で処理）
      const typeMap = { syazyounerai: 'syazyonerai' };
      const t = typeMap[type] ?? type;
      return `https://www.pref.shizuoka.jp/_res/projects/project_police/_page_/002/001/145/shizuoka_2024_${t}.csv`;
    },
    fallbackUrlFn: (type) => {
      // 2023年URL（アンダースコアなし・syazyounerai表記）
      return `https://www.pref.shizuoka.jp/_res/projects/project_police/_page_/002/001/145/shizuoka_2023${type}.csv`;
    },
  },

  // ---- Phase 3: URL確認済み11県 ----
  {
    name: '青森県',
    urlFn: (type) => {
      // 車上ねらいのみ syajyounerai（jが余分）
      const typeMap = { syazyounerai: 'syajyounerai' };
      const t = typeMap[type] ?? type;
      return `https://www.police.pref.aomori.jp/seianbu/seian_kikaku/hanyoku/csv/2024/aomori_2024${t}.csv`;
    },
  },
  {
    name: '岩手県',
    urlFn: (type) =>
      `https://www.pref.iwate.jp/_res/projects/project_kenkei/_page_/003/000/711/s_opendata_2024/iwate_2024${type}.csv`,
  },
  {
    name: '宮城県',
    urlFn: (type) => `https://www.police.pref.miyagi.jp/seian/csv/miyagi_2024${type}.csv`,
  },
  {
    name: '山形県',
    urlFn: (type) => `https://www.pref.yamagata.jp/documents/1566/yamagata_2024${type}.csv`,
  },
  {
    name: '山梨県',
    urlFn: (type) => {
      // オートバイ盗のみ ootobaiou（tが欠落）
      const typeMap = { ootobaitou: 'ootobaiou' };
      const t = typeMap[type] ?? type;
      return `https://www.pref.yamanashi.jp/documents/94920/yamanashi_2024${t}.csv`;
    },
  },
  {
    name: '長野県',
    urlFn: (type) => {
      // 車上ねらいのみ 20224（2が重複）
      const typeMap = { syazyounerai: '20224syazyounerai' };
      const t = typeMap[type] ?? `2024${type}`;
      return `https://www.pref.nagano.lg.jp/police/toukei/hanzai/documents/nagano_${t}.csv`;
    },
  },
  {
    name: '奈良県',
    urlFn: (type) =>
      `https://www.police.pref.nara.jp/cmsfiles/contents/0000007/7168/nara_2024${type}.csv`,
  },
  {
    name: '和歌山県',
    urlFn: (type) =>
      `https://www.police.pref.wakayama.lg.jp/04_toukei/hanzai/documents/r6/wakayama_2024${type}.csv`,
  },
  {
    name: '徳島県',
    urlFn: (type) =>
      `https://www.police.pref.tokushima.jp/file/excel/28opendata/tokushima_2024${type}.csv`,
  },
  {
    name: '長崎県',
    urlFn: (type) =>
      `https://www.police.pref.nagasaki.jp/police/wp-content/uploads/2025/06/nagasaki_2024${type}.csv`,
  },
  {
    name: '沖縄県',
    urlFn: (type) => {
      // URLに手口番号プレフィックスが必要（R7_01_〜R7_07_）
      const PREFIX = {
        hittakuri: '01', syazyounerai: '02', buhinnerai: '03',
        zidouhanbaikinerai: '04', zidousyatou: '05', ootobaitou: '06', zitensyatou: '07',
      };
      const n = PREFIX[type] ?? '01';
      return `https://www.police.pref.okinawa.jp/docs/2025062400016/file_contents/R7_${n}_okinawa_2024${type}.csv`;
    },
  },

  // ---- Phase 4: 群馬・新潟（連番ID方式） + BODIK 6県 ----
  {
    name: '栃木県',
    urlFn: (type) => {
      // 犯罪種別ごとに別データセット（dataset UUID が異なる）
      const URLS = {
        hittakuri:          'https://data.bodik.jp/dataset/2bbcd73a-ac37-4a26-9a23-fcc72a5cfdd4/resource/73c74380-78c7-4ca6-a68c-2d0a0022dbee/download/d0110_2024_tochigi_2024hittakuri_07001.csv',
        syazyounerai:       'https://data.bodik.jp/dataset/4467d71d-90dd-40d1-968b-589c019aa3a6/resource/0bbb38bb-223d-453e-b999-4e542b7c3fa1/download/d0110_2024_tochigi_2024syazyounerai_07002.csv',
        buhinnerai:         'https://data.bodik.jp/dataset/4ae3fac3-e563-4680-b108-ca85040cf4dc/resource/acb39200-3a1d-433a-9e86-bba3d04cb1fe/download/d0110_2024_tochigi_2024buhinnerai_07003.csv',
        zidouhanbaikinerai: 'https://data.bodik.jp/dataset/c4a01778-5bdd-4914-819a-7a38a9b6ed2c/resource/e5dfc6c5-c63a-4909-9753-cc957fc7abdd/download/d0110_2024_tochigi_2024zidouhanbaikinerai_07004.csv',
        zidousyatou:        'https://data.bodik.jp/dataset/d54a0f04-4734-41a1-a4fe-23519b434340/resource/9de3c2f1-fa0a-4c7f-8bbe-3563128afb89/download/d0110_2024_tochigi_2024zidousyatou_07005.csv',
        ootobaitou:         'https://data.bodik.jp/dataset/f62f46eb-9809-4611-ad37-9f05569f1264/resource/e9bc2467-69d9-43ac-9ff7-922b2d8863d4/download/d0110_2024_tochigi_2024ootobaitou_07006.csv',
        zitensyatou:        'https://data.bodik.jp/dataset/93627019-71d4-4ce9-9473-342e6faa7ac3/resource/716a26c5-551b-415d-be85-643e83d71e32/download/d0110_2024_tochigi_2024zitensyatou_07007.csv',
      };
      return URLS[type];
    },
  },
  {
    name: '京都府',
    urlFn: (type) => {
      const RIDS = {
        hittakuri:          'a0827686-62e9-4d24-be45-aab159fb78f6',
        syazyounerai:       '34da31da-0b46-4c60-b65d-c04582a04533',
        buhinnerai:         '0e48cfca-20bc-4816-a986-5a20e49725d9',
        zidouhanbaikinerai: '88a0cfe0-3305-4ccb-8171-e945378ccbe3',
        zidousyatou:        'ae6d0336-504c-48ce-a3ed-aeed03bb3623',
        ootobaitou:         'f8e91ffc-d2ea-4c95-ae0e-e6e5e2b886b3',
        zitensyatou:        '625c707a-e776-4911-9d84-89f6f68c5415',
      };
      return `https://data.bodik.jp/dataset/6a5f0b5c-667e-4a06-bbb8-6d191a5b1179/resource/${RIDS[type]}/download/kyoto_2024${type}.csv`;
    },
  },
  {
    name: '佐賀県',
    urlFn: (type) => {
      const RIDS = {
        hittakuri:          '61de0a68-0f01-4841-8473-7bdbb1ac5a2e',
        syazyounerai:       'cd1e7224-4c28-49a2-9e69-5d9cbdfab8dd',
        buhinnerai:         '22bcdfdb-0918-4464-b28a-1df7508808a0',
        zidouhanbaikinerai: '3cab17f2-137f-4f6f-8511-48fb67f0fa18',
        zidousyatou:        'e2f955d1-181c-44ee-bf7b-392a0738b0b7',
        ootobaitou:         '48283b13-e4d7-427c-b2be-a792e671be3f',
        zitensyatou:        '966353ea-79e2-4485-9643-cbb16c08835a',
      };
      return `https://data.bodik.jp/dataset/cec6d1da-8160-4967-bb9a-98092aa827e6/resource/${RIDS[type]}/download/saga_2024${type}.csv`;
    },
  },
  {
    name: '熊本県',
    urlFn: (type) => {
      const RIDS = {
        hittakuri:          '1de69f45-3e5e-40e7-b5c1-bf0c8851f0a4',
        syazyounerai:       '724a858b-2696-419a-985a-3632ffda4c05',
        buhinnerai:         '0846d1c2-62cb-44c6-bbfe-19fac64f40dd',
        zidouhanbaikinerai: '6071b306-9118-414c-a991-b788b4ab673e',
        zidousyatou:        'b982cde2-bc22-4b20-9985-cd688475fc72',
        ootobaitou:         '42bb5ed4-ea4a-4678-afeb-3226ac7b4e6f',
        zitensyatou:        '13aa1bf5-2737-4e37-8b39-22ab6ce2302e',
      };
      return `https://data.bodik.jp/dataset/a08a0692-1d8d-4de2-ae92-3a12caf53ba6/resource/${RIDS[type]}/download/kumamoto_2024${type}.csv`;
    },
  },
  {
    name: '宮崎県',
    urlFn: (type) => {
      const RIDS = {
        hittakuri:          '01a13084-2ebc-4874-b736-0d1cacd27fa0',
        syazyounerai:       'f867417a-e6af-4f36-8140-474c68f9cc15',
        buhinnerai:         '38d10bd0-802c-4145-a470-d4c82204189a',
        zidouhanbaikinerai: 'da76ffb8-f4c1-40ff-aa97-52b5dbe981f3',
        zidousyatou:        'b7736020-6f5e-49d9-8625-1bf0be2d8fa7',
        ootobaitou:         'dbc8dd3e-0220-4708-85b2-472818005b17',
        zitensyatou:        '93f92c26-7d12-4e86-989b-77b73cfcbd94',
      };
      return `https://data.bodik.jp/dataset/a7c23d02-7ba8-4685-a09f-576a6cc7054f/resource/${RIDS[type]}/download/miyazaki_2024${type}.csv`;
    },
  },
  {
    name: '鹿児島県',
    urlFn: (type) => {
      // ファイル名が非標準（県名プレフィックスなし・異なるローマ字表記）
      const FILES = {
        hittakuri:          'hittakuri.csv',
        syazyounerai:       'syajounerai.csv',
        buhinnerai:         'buhinnnerai.csv',
        zidouhanbaikinerai: 'jidouhannbaikinerai.csv',
        zidousyatou:        'jidousyatou.csv',
        ootobaitou:         'o-tobaitou.csv',
        zitensyatou:        'jitennsyatou.csv',
      };
      const RIDS = {
        hittakuri:          '4dc2ad6f-87d9-4462-8351-aed7ef7ce87d',
        syazyounerai:       'd1595af4-045c-4f30-a3b9-9cf5208f3c92',
        buhinnerai:         '31ed0893-0188-4b3a-8382-4f096d2904e2',
        zidouhanbaikinerai: '80962404-8898-48e7-a8db-2a32f8bc02a8',
        zidousyatou:        'a7aad9d9-aa71-43f1-8011-be85dba97063',
        ootobaitou:         '08ed7034-db06-4690-9402-2e49df7d845d',
        zitensyatou:        'da75606e-cf9c-42dc-9519-63cf08c06d18',
      };
      return `https://data.bodik.jp/dataset/d7bc06be-ac8b-4d4a-8108-9f25544276c0/resource/${RIDS[type]}/download/${FILES[type]}`;
    },
  },

  // ---- Phase 6: 調査中だった11県 ----
  {
    name: '北海道',
    urlFn: (type) => {
      const IDS = {
        buhinnerai:         '8316',
        hittakuri:          '8317',
        ootobaitou:         '8318',
        syazyounerai:       '8319',
        zidouhanbaikinerai: '8320',
        zidousyatou:        '8321',
        zitensyatou:        '8322',
      };
      return `https://www.harp.lg.jp/opendata/dataset/2239/resource/${IDS[type]}/hokkaido_2024${type}.csv`;
    },
  },
  {
    name: '福島県',
    urlFn: (type) =>
      `https://www.police.pref.fukushima.jp/seianki/homepage/top_page/fukushima_2024${type}.csv`,
  },
  {
    name: '石川県',
    urlFn: (type) =>
      `https://www.police.pref.ishikawa.jp/security/upload/seian/ishikawa_2024${type}.csv`,
  },
  {
    name: '福井県',
    urlFn: (type) => {
      // zidouhanbaikinerai のみファイル名にプレフィックスなし
      const file = type === 'zidouhanbaikinerai' ? `2024${type}.csv` : `fukui_2024${type}.csv`;
      return `https://www.pref.fukui.lg.jp/kenkei/doc/kenkei/naka2-naka1600_d/fil/${file}`;
    },
  },
  {
    name: '三重県',
    urlFn: (type) =>
      `http://www.police.pref.mie.jp/safety_info/op_data/mie_2024${type}.csv`,
  },
  {
    name: '滋賀県',
    urlFn: (type) => {
      // ファイルIDが連番（hittakuri=5548750〜zitensyatou=5548756）
      const N = { hittakuri: 0, syazyounerai: 1, buhinnerai: 2, zidouhanbaikinerai: 3, zidousyatou: 4, ootobaitou: 5, zitensyatou: 6 };
      return `https://www.police.pref.shiga.jp/file/attachment/${5548750 + N[type]}.csv`;
    },
  },
  {
    name: '鳥取県',
    urlFn: (type) => {
      // ローマ字表記が標準と異なる
      const typeMap = {
        syazyounerai:       'syajounerai',
        zidouhanbaikinerai: 'jidouhannbaikinerai',
        zidousyatou:        'jidousyatou',
        ootobaitou:         'o-tobaitou',
        zitensyatou:        'jitensyatou',
      };
      const t = typeMap[type] ?? type;
      return `http://www.pref.tottori.lg.jp/secure/1180850/tottori_24${t}.csv`;
    },
  },
  {
    name: '島根県',
    urlFn: (type) => {
      // ひったくりデータなし（6種類のみ）
      const IDS = {
        hittakuri:          null,
        syazyounerai:       '74822',
        buhinnerai:         '74821',
        zidouhanbaikinerai: '74820',
        zidousyatou:        '74819',
        ootobaitou:         '74818',
        zitensyatou:        '74817',
      };
      return IDS[type] ? `https://shimane-opendata.jp/resource_download/${IDS[type]}` : null;
    },
  },
  {
    name: '岡山県',
    urlFn: (type) => {
      const IDS = {
        zitensyatou:        '16225',
        hittakuri:          '16226',
        ootobaitou:         '16227',
        syazyounerai:       '16228',
        zidouhanbaikinerai: '16229',
        zidousyatou:        '16230',
        buhinnerai:         '16231',
      };
      return `https://okayama-pref.dataeye.jp/resource_download/${IDS[type]}`;
    },
  },
  {
    name: '山口県',
    urlFn: (type) => {
      // buhinnerai のみファイル名にtypo（yamagutchi）
      const RIDS = {
        hittakuri:          'c21302ba-69d9-4067-a2d8-e60bfb826be7',
        syazyounerai:       'ac1bdcab-c655-44f1-b091-d62d7f9ba332',
        buhinnerai:         '68699be0-4a93-41af-b3d4-6a35af3377bf',
        zidouhanbaikinerai: '594c4ef6-0828-430c-9d5a-ad70305b4c57',
        zidousyatou:        'd0035db1-179d-4781-af08-6af864a1e37f',
        ootobaitou:         '9db1fdff-7457-4998-a938-f8d2d2d70c14',
        zitensyatou:        '9634da58-64a2-4a7b-96c3-fed51c04d110',
      };
      const files = {
        buhinnerai: 'yamagutchi_2024buhinnerai.csv', // typo in original filename
      };
      const fname = files[type] ?? `yamaguchi_2024${type}.csv`;
      return `https://yamaguchi-opendata.jp/ckan/dataset/cc59d3cd-5153-428e-9ea9-3cc04511e565/resource/${RIDS[type]}/download/${fname}`;
    },
  },
  {
    name: '高知県',
    urlFn: (type) => {
      // 各犯罪種別で別々のdocsページID
      const DOC_IDS = {
        hittakuri:          '2025061200020',
        syazyounerai:       '2025061200082',
        buhinnerai:         '2025061200037',
        zidouhanbaikinerai: '2025061200075',
        zidousyatou:        '2025061200068',
        ootobaitou:         '2025061200044',
        zitensyatou:        '2025061200051',
      };
      return `https://www.police.pref.kochi.lg.jp/docs/${DOC_IDS[type]}/file_contents/kochi_2024${type}.csv`;
    },
  },

  // ---- Phase 7: 岐阜 ----
  {
    name: '岐阜県',
    urlFn: (type) => {
      // zitensyatou のみファイル名が zidensyatou（異なるローマ字）
      const RIDS = {
        hittakuri:          '0a6da554-8812-4da8-8fac-c95151ab741d',
        syazyounerai:       'db3e7dae-1e20-462f-9a66-8b5992d1792b',
        buhinnerai:         'eaacc9c0-22eb-40c8-b778-3b173c401c15',
        zidouhanbaikinerai: '10200b9e-e263-42c0-afd5-9b9b065ef411',
        zidousyatou:        'ad28ac6a-4c4b-45de-8e4b-18a82ef07ddb',
        ootobaitou:         '20068f2f-4c66-4c0c-9582-a8c56aaf3563',
        zitensyatou:        '7c8c1e64-270b-4888-b474-083f442d596f',
      };
      const files = {
        zitensyatou: 'gifu_2024zidensyatou.csv', // typo in original filename
      };
      const fname = files[type] ?? `gifu_2024${type}.csv`;
      return `https://gifu-opendata.pref.gifu.lg.jp/dataset/35db33b9-7e77-499e-b90d-f302fafb7aaa/resource/${RIDS[type]}/download/${fname}`;
    },
  },

  // ---- Phase 8: 大分県 ----
  {
    name: '大分県',
    urlFn: (type) => {
      const IDS = {
        ootobaitou:         '2243325',
        hittakuri:          '2243326',
        zitensyatou:        '2243327',
        zidousyatou:        '2243328',
        zidouhanbaikinerai: '2243329',
        syazyounerai:       '2243330',
        buhinnerai:         '2243331',
      };
      return `https://www.pref.oita.jp/uploaded/attachment/${IDS[type]}.csv`;
    },
  },

  // ---- Phase 8: 秋田県（xlsx形式）----
  {
    name: '秋田県',
    isXlsx: true,
    urlFn: (type) => {
      const FILES = {
        hittakuri:          '%E3%81%B2%E3%81%A3%E3%81%9F%E3%81%8F%E3%82%8A.xlsx',
        syazyounerai:       '%E8%BB%8A%E4%B8%8A%E3%81%AD%E3%82%89%E3%81%84.xlsx',
        buhinnerai:         '%E9%83%A8%E5%93%81%E3%81%AD%E3%82%89%E3%81%84.xlsx',
        zidouhanbaikinerai: '%E8%87%AA%E5%8B%95%E8%B2%A9%E5%A3%B2%E6%A9%9F%E3%81%AD%E3%82%89%E3%81%84.xlsx',
        zidousyatou:        '%E8%87%AA%E5%8B%95%E8%BB%8A%E7%9B%97.xlsx',
        ootobaitou:         '%E3%82%AA%E3%83%BC%E3%83%88%E3%83%90%E3%82%A4%E7%9B%97.xlsx',
        zitensyatou:        '%E8%87%AA%E8%BB%A2%E8%BB%8A%E7%9B%97.xlsx',
      };
      const file = FILES[type];
      return file
        ? `https://www.police.pref.akita.lg.jp/uploads/contents/pages_0000000000_305/${file}`
        : null;
    },
  },

  // ---- Phase 4（続き）: 群馬・新潟（連番ID方式） ----
  {
    name: '群馬県',
    urlFn: (type) => {
      const IDS = {
        hittakuri:          '667807',
        syazyounerai:       '667793',
        buhinnerai:         '667506',
        zidouhanbaikinerai: '667504',
        zidousyatou:        '667503',
        ootobaitou:         '667502',
        zitensyatou:        '667501',
      };
      return `https://www.pref.gunma.jp/uploaded/attachment/${IDS[type]}.csv`;
    },
  },
  {
    name: '新潟県',
    urlFn: (type) => {
      const IDS = {
        hittakuri:          '455862',
        syazyounerai:       '455863',
        buhinnerai:         '455864',
        zidouhanbaikinerai: '455865',
        zidousyatou:        '455866',
        ootobaitou:         '455867',
        zitensyatou:        '455868',
      };
      return `https://www.pref.niigata.lg.jp/uploaded/attachment/${IDS[type]}.csv`;
    },
  },
];

// ---- ユーティリティ ----
let seed = 42;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; }
function randn() { return Math.sqrt(-2 * Math.log(rand() + 1e-10)) * Math.cos(2 * Math.PI * rand()); }
function randomDate() {
  const d = new Date('2024-01-01');
  d.setDate(d.getDate() + Math.floor(rand() * 365));
  return d.toISOString().slice(0, 10);
}

const CRIME_LABELS = ['自転車盗', '車上ねらい', '部品ねらい', '自動販売機ねらい', '自動車盗', 'オートバイ盗', 'ひったくり'];

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'MachiScore/1.0 (crime data research)',
        'Accept-Encoding': 'gzip, deflate',
        'Accept': 'text/csv,*/*',
      },
      timeout: 30000,
    };
    const req = https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchCSV(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip()) : res;
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const buf = Buffer.concat(chunks);
        // HTMLが返ってきた場合はCSVではないためエラー
        const head = buf.slice(0, 15).toString('ascii').toLowerCase();
        if (head.startsWith('<!doc') || head.startsWith('<html')) {
          return reject(new Error(`HTMLが返却されました（CSVではない）: ${url}`));
        }
        resolve(buf);
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`タイムアウト: ${url}`)); });
  });
}

/** xlsx Buffer をCSVと同形式の行配列に変換する */
function parseXlsx(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

/** UTF-8を先に試し、失敗したらShift-JISで読む */
function detectAndDecode(buf) {
  // UTF-8 BOMチェック
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  // UTF-8として有効か試みる（fatalモード: 不正バイト列でThrow）
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // UTF-8無効 → Shift-JIS
    try {
      return new TextDecoder('shift-jis').decode(buf);
    } catch {
      return buf.toString('latin1');
    }
  }
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  // 1行目でタブ/カンマを自動判定
  const delimiter = (lines[0] || '').includes('\t') ? '\t' : ',';
  return lines.map(line => line.split(delimiter).map(v => v.trim().replace(/^"(.*)"$/, '$1')));
}

/**
 * CSVを解析し、市区町村ごとの件数を返す
 * 列: 罪名(0), 手口(1), 管轄警察署(2), 管轄交番(3), 市区町村コード(4),
 *     都道府県(5), 市区町村(6), 町丁目(7), ...
 */
function aggregateByMunicipality(rows) {
  const counts = {};
  let header = true;
  for (const row of rows) {
    if (!row || row.length < 7) continue;
    // ヘッダー行をスキップ（市区町村コードが数字でない行）
    if (header) {
      if (!/^\d/.test((row[4] || '').trim())) continue;
      header = false;
    }
    const muni = (row[6] || '').trim();
    if (!muni || muni === '市区町村') continue;
    counts[muni] = (counts[muni] || 0) + 1;
  }
  return counts;
}

// ---- ポリゴン重心算出 ----
function computeCentroid(geometry) {
  let rings;
  if (geometry.type === 'Polygon') {
    rings = [geometry.coordinates[0]];
  } else if (geometry.type === 'MultiPolygon') {
    // 最大リングを使用
    let maxLen = 0, largest = null;
    for (const poly of geometry.coordinates) {
      if (poly[0].length > maxLen) { maxLen = poly[0].length; largest = poly[0]; }
    }
    rings = [largest];
  } else {
    return null;
  }
  const ring = rings[0];
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; }
  return [sumLng / ring.length, sumLat / ring.length];
}

/** choropleth.geojson から 都道府県+市区町村 → 重心座標 を生成 */
function buildMuniCentroids(choropleth) {
  const centroids = {}; // `${pref}|${muni}` → [lng, lat, radius]
  for (const f of choropleth.features) {
    const pref = f.properties.prefecture;
    const muni = f.properties.municipality;
    if (!pref || !muni) continue;
    const key = `${pref}|${muni}`;
    if (centroids[key]) continue; // 重複は最初のポリゴンを使用
    const c = computeCentroid(f.geometry);
    if (!c) continue;
    // 散布半径: ポリゴンの対角線の1/4 程度
    const coords = f.geometry.type === 'Polygon'
      ? f.geometry.coordinates[0]
      : f.geometry.coordinates[0][0];
    let minLng=Infinity, maxLng=-Infinity, minLat=Infinity, maxLat=-Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    const radius = Math.min((maxLng - minLng) * 0.4, (maxLat - minLat) * 0.4, 0.06);
    centroids[key] = [c[0], c[1], Math.max(radius, 0.01)];
  }
  return centroids;
}

/** 市区町村の重心を前方一致で探す（"大阪市北区" → "大阪市"） */
function findCentroid(centroids, prefName, muniName) {
  const exactKey = `${prefName}|${muniName}`;
  if (centroids[exactKey]) return { key: exactKey, centroid: centroids[exactKey] };

  // 前方一致: 大阪市北区 → 大阪市, 横浜市鶴見区 → 横浜市
  for (const [key, val] of Object.entries(centroids)) {
    const [kPref, kMuni] = key.split('|');
    if (kPref === prefName && muniName.startsWith(kMuni)) {
      return { key, centroid: val };
    }
  }
  return null;
}

function generatePoints(prefecture, city, count, lng, lat, radius) {
  const nPoints = Math.min(Math.floor(count / 5) + 1, 200);
  const scaleFactor = count / Math.max(nPoints, 1);
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
        crime_type: CRIME_LABELS[Math.floor(rand() * CRIME_LABELS.length)],
        occurred_date: randomDate(),
        prefecture,
        city,
        crime_count: Math.round(scaleFactor),
        data_source: '警察庁犯罪オープンデータ（R6年）',
      },
    });
  }
  return features;
}

// ---- メイン処理 ----
async function processPrefecture(prefDef, centroids) {
  const { name, urlFn } = prefDef;
  console.log(`\n=== ${name} ===`);
  const muniCounts = {};
  let totalRows = 0;
  let successCount = 0;

  for (const crimeType of CRIME_TYPES) {
    const url = urlFn(crimeType);
    if (!url) {
      console.log(`  ${crimeType} ... スキップ（URLなし）`);
      continue;
    }
    try {
      process.stdout.write(`  ${crimeType} ... `);
      let buf;
      try {
        buf = await fetchCSV(url);
      } catch (e) {
        // フォールバックURLがあれば試みる（静岡2024→2023など）
        if (prefDef.fallbackUrlFn) {
          const fallbackUrl = prefDef.fallbackUrlFn(crimeType);
          process.stdout.write(`[→フォールバック] `);
          buf = await fetchCSV(fallbackUrl);
        } else {
          throw e;
        }
      }
      const rows = prefDef.isXlsx
        ? parseXlsx(buf)
        : parseCSV(detectAndDecode(buf));
      const counts = aggregateByMunicipality(rows);
      const typeTotal = Object.values(counts).reduce((a, b) => a + b, 0);
      for (const [muni, cnt] of Object.entries(counts)) {
        muniCounts[muni] = (muniCounts[muni] || 0) + cnt;
      }
      totalRows += typeTotal;
      successCount++;
      console.log(`${typeTotal}件`);
    } catch (e) {
      console.log(`失敗 (${e.message})`);
    }
  }

  if (successCount === 0) {
    console.log(`  → ${name}: 全CSVダウンロード失敗。モックデータを維持。`);
    return null;
  }

  // 市区町村の重心を使ってポイント生成
  const features = [];
  let matched = 0, unmatched = 0;
  const sortedMunis = Object.entries(muniCounts).sort((a, b) => b[1] - a[1]);

  for (const [muniName, count] of sortedMunis) {
    const found = findCentroid(centroids, name, muniName);
    if (!found) {
      unmatched++;
      continue;
    }
    const [lng, lat, radius] = found.centroid;
    features.push(...generatePoints(name, muniName, count, lng, lat, radius));
    matched++;
  }

  const prefTotal = Object.values(muniCounts).reduce((a, b) => a + b, 0);
  console.log(`  合計: ${prefTotal.toLocaleString()}件, 市区町村: ${matched}マッチ/${matched + unmatched}件`);
  console.log(`  ポイント生成: ${features.length}`);

  // 上位5市区町村を表示
  console.log(`  TOP5:`);
  sortedMunis.slice(0, 5).forEach(([m, c]) => console.log(`    ${m}: ${c.toLocaleString()}件`));

  return features;
}

/** 広島県: fetch_hiroshima_crime.py が生成した JSON から点データを生成 */
function processHiroshima(centroids, publicDir) {
  const jsonPath = path.join(publicDir, 'hiroshima_crime.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('  hiroshima_crime.json が見つかりません。スキップ。');
    return null;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const features = [];
  let matched = 0, unmatched = 0;

  for (const [muniName, typeCounts] of Object.entries(data)) {
    const found = findCentroid(centroids, '広島県', muniName);
    if (!found) { unmatched++; continue; }
    const [lng, lat, radius] = found.centroid;
    matched++;

    for (const [crimeType, count] of Object.entries(typeCounts)) {
      if (!count || count <= 0) continue;
      const nPoints = Math.min(Math.floor(count / 5) + 1, 50);
      const scaleFactor = count / Math.max(nPoints, 1);
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
            crime_type: crimeType,
            occurred_date: randomDate(),
            prefecture: '広島県',
            city: muniName,
            crime_count: Math.round(scaleFactor),
            data_source: '広島県警察統計（R6年）',
          },
        });
      }
    }
  }

  const total = Object.values(data).reduce((s, t) => s + Object.values(t).reduce((a, b) => a + b, 0), 0);
  console.log(`  広島県: ${total.toLocaleString()}件, ${matched}市区町村マッチ/${matched + unmatched}件, ${features.length}ポイント生成`);
  return features;
}

/** 茨城県: fetch_ibaraki_crime.py が生成した JSON から点データを生成 */
function processIbaraki(centroids, publicDir) {
  const jsonPath = path.join(publicDir, 'ibaraki_crime.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('  ibaraki_crime.json が見つかりません。スキップ。');
    return null;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const features = [];
  let matched = 0, unmatched = 0;

  for (const [muniName, typeCounts] of Object.entries(data)) {
    const found = findCentroid(centroids, '茨城県', muniName);
    if (!found) { unmatched++; continue; }
    const [lng, lat, radius] = found.centroid;
    matched++;

    for (const [crimeType, count] of Object.entries(typeCounts)) {
      if (!count || count <= 0) continue;
      const nPoints = Math.min(Math.floor(count / 5) + 1, 50);
      const scaleFactor = count / Math.max(nPoints, 1);
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
            crime_type: crimeType,
            occurred_date: randomDate(),
            prefecture: '茨城県',
            city: muniName,
            crime_count: Math.round(scaleFactor),
            data_source: '茨城県警察統計（R6年）',
          },
        });
      }
    }
  }

  const total = Object.values(data).reduce((s, t) => s + Object.values(t).reduce((a, b) => a + b, 0), 0);
  console.log(`  茨城県: ${total.toLocaleString()}件, ${matched}市区町村マッチ/${matched + unmatched}件, ${features.length}ポイント生成`);
  return features;
}

async function main() {
  console.log('=== Phase 2: 実犯罪データ取得（大阪・神奈川・愛知・千葉） ===\n');

  const publicDir = path.join(__dirname, '..', 'public');

  // choropleth.geojson から重心を構築
  const choroplethPath = path.join(publicDir, 'choropleth.geojson');
  if (!fs.existsSync(choroplethPath)) {
    console.error('choropleth.geojson が見つかりません。先に fetch_price_national を実行してください。');
    process.exit(1);
  }
  console.log('choropleth.geojson から市区町村重心を構築中...');
  const choropleth = JSON.parse(fs.readFileSync(choroplethPath, 'utf8'));
  const centroids = buildMuniCentroids(choropleth);
  console.log(`  重心: ${Object.keys(centroids).length}市区町村`);

  // 既存モックデータを読込
  const mockPath = path.join(publicDir, 'crime_mock.geojson');
  let existingMock = { type: 'FeatureCollection', features: [] };
  if (fs.existsSync(mockPath)) {
    existingMock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
    console.log(`既存モック: ${existingMock.features.length}ポイント`);
  }

  // Phase 2 対象府県の名前セット（茨城・広島はPDF処理のため別途追加）
  const phase2Prefs = new Set([...PREFECTURES.map(p => p.name), '茨城県', '広島県']);

  // Phase 2以外の既存モックデータを保持
  const otherFeatures = existingMock.features.filter(
    f => !phase2Prefs.has(f.properties?.prefecture)
  );
  console.log(`Phase 2以外のモックデータ: ${otherFeatures.length}ポイント`);

  // 各府県の実データ取得
  const phase2Features = [];
  for (const prefDef of PREFECTURES) {
    const features = await processPrefecture(prefDef, centroids);
    if (features) {
      phase2Features.push(...features);
    } else {
      // 取得失敗時は既存モックデータを維持
      const fallback = existingMock.features.filter(
        f => f.properties?.prefecture === prefDef.name
      );
      phase2Features.push(...fallback);
      console.log(`  ${prefDef.name}: モックデータ ${fallback.length}ポイントを維持`);
    }
  }

  // 茨城県: PDFから生成済みJSONを読み込んでポイント生成
  console.log('\n=== 茨城県（PDF実データ） ===');
  const ibarakiFeatures = processIbaraki(centroids, publicDir);
  if (ibarakiFeatures) {
    phase2Features.push(...ibarakiFeatures);
  } else {
    const fallback = existingMock.features.filter(f => f.properties?.prefecture === '茨城県');
    phase2Features.push(...fallback);
    console.log(`  茨城県: モックデータ ${fallback.length}ポイントを維持`);
  }

  // 広島県: PDFから生成済みJSONを読み込んでポイント生成
  console.log('\n=== 広島県（PDF実データ） ===');
  const hiroshimaFeatures = processHiroshima(centroids, publicDir);
  if (hiroshimaFeatures) {
    phase2Features.push(...hiroshimaFeatures);
  } else {
    const fallback = existingMock.features.filter(f => f.properties?.prefecture === '広島県');
    phase2Features.push(...fallback);
    console.log(`  広島県: モックデータ ${fallback.length}ポイントを維持`);
  }

  // シャッフルして統合
  const all = [...otherFeatures, ...phase2Features];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  const out = {
    type: 'FeatureCollection',
    features: all,
    metadata: {
      source_tokyo: '警視庁「区市町村の町丁別、罪種別及び手口別認知件数」令和7年',
      source_phase2: '警察庁犯罪オープンデータ（令和6年）- 大阪・神奈川・愛知・千葉',
      source_other: '警察庁都道府県統計（R5年）からの推計値',
      generated_at: new Date().toISOString(),
      total_points: all.length,
      phase2_points: phase2Features.length,
    },
  };

  fs.writeFileSync(mockPath, JSON.stringify(out), 'utf8');
  const sizeKB = (fs.statSync(mockPath).size / 1024).toFixed(1);
  console.log(`\n出力: ${mockPath} (${sizeKB} KB)`);
  console.log(`合計: ${all.length}ポイント (Phase2実データ: ${phase2Features.length})`);
}

main().catch(e => { console.error(e); process.exit(1); });
