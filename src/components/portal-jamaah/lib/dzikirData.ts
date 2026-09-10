// Dzikir pagi–petang dan dzikir setelah shalat — konten statis (offline),
// bentuknya sama dengan doaData.ts supaya bisa dirender oleh halaman yang sama.
//
// CATATAN: Teks Arab, latin, dan terjemahan di bawah WAJIB ditinjau pembimbing
// ibadah sebelum dibagikan ke jamaah. Disusun dari bacaan masyhur; `sumber`
// dicantumkan (QS = ayat Al-Quran, HR = hadis). Judul memakai bahasa awam;
// jumlah bacaan ada di field `ulang`, bukan di judul.

import type { DoaCategory } from './doaData.ts';

const AYAT_KURSI =
  'اَللّٰهُ لَآ اِلٰهَ اِلَّا هُوَۚ اَلْحَيُّ الْقَيُّوْمُ ەۚ لَا تَأْخُذُهٗ سِنَةٌ وَّلَا نَوْمٌۗ لَهٗ مَا فِى السَّمٰوٰتِ وَمَا فِى الْاَرْضِۗ مَنْ ذَا الَّذِيْ يَشْفَعُ عِنْدَهٗٓ اِلَّا بِاِذْنِهٖۗ يَعْلَمُ مَا بَيْنَ اَيْدِيْهِمْ وَمَا خَلْفَهُمْۚ وَلَا يُحِيْطُوْنَ بِشَيْءٍ مِّنْ عِلْمِهٖٓ اِلَّا بِمَا شَاۤءَۚ وَسِعَ كُرْسِيُّهُ السَّمٰوٰتِ وَالْاَرْضَۚ وَلَا يَـُٔوْدُهٗ حِفْظُهُمَاۚ وَهُوَ الْعَلِيُّ الْعَظِيْمُ';
const AYAT_KURSI_LATIN =
  'Allāhu lā ilāha illā huwal-hayyul-qayyūm, lā ta’khudzuhū sinatuw wa lā naūm, lahū mā fis-samāwāti wa mā fil-ardh, man dzalladzī yasyfa‘u ‘indahū illā bi’idznih, ya‘lamu mā baina aidīhim wa mā khalfahum, wa lā yuhīthūna bisyai’im min ‘ilmihī illā bimā syā’, wasi‘a kursiyyuhus-samāwāti wal-ardh, wa lā ya’ūduhū hifzhuhumā, wa huwal-‘aliyyul-‘azhīm.';
const AYAT_KURSI_TERJEMAHAN =
  'Allah, tidak ada tuhan selain Dia, Yang Mahahidup, Yang terus-menerus mengurus (makhluk-Nya), tidak mengantuk dan tidak tidur. Milik-Nya apa yang ada di langit dan di bumi. Tidak ada yang dapat memberi syafaat di sisi-Nya tanpa izin-Nya. Dia mengetahui apa yang di hadapan mereka dan apa yang di belakang mereka, dan mereka tidak mengetahui sesuatu apa pun dari ilmu-Nya kecuali apa yang Dia kehendaki. Kursi-Nya meliputi langit dan bumi, dan Dia tidak merasa berat memelihara keduanya. Dia Mahatinggi, Mahabesar.';

const TAHLIL_PENUTUP =
  'لَا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهٗ لَا شَرِيْكَ لَهٗ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلٰى كُلِّ شَيْءٍ قَدِيْرٌ';
const TAHLIL_PENUTUP_LATIN =
  'Lā ilāha illallāhu wahdahū lā syarīka lah, lahul-mulku wa lahul-hamdu wa huwa ‘alā kulli syai’in qadīr.';
const TAHLIL_PENUTUP_TERJEMAHAN =
  'Tidak ada tuhan selain Allah semata, tidak ada sekutu bagi-Nya. Milik-Nya kerajaan dan bagi-Nya segala puji, dan Dia Mahakuasa atas segala sesuatu.';

export const DZIKIR_CATEGORIES: DoaCategory[] = [
  {
    id: 'dzikir-pagi-petang',
    title: 'Dzikir Pagi & Petang',
    entries: [
      {
        id: 'ayat-kursi-pagi-petang',
        title: 'Ayat Kursi',
        ulang: '1 kali',
        arab: AYAT_KURSI,
        latin: AYAT_KURSI_LATIN,
        terjemahan: AYAT_KURSI_TERJEMAHAN,
        sumber: 'QS. Al-Baqarah: 255',
      },
      {
        id: 'al-ikhlas',
        title: 'Surah Al-Ikhlas',
        ulang: '3 kali',
        arab: 'قُلْ هُوَ اللّٰهُ اَحَدٌۚ اَللّٰهُ الصَّمَدُۚ لَمْ يَلِدْ وَلَمْ يُوْلَدْۙ وَلَمْ يَكُنْ لَّهٗ كُفُوًا اَحَدٌ',
        latin: 'Qul huwallāhu ahad. Allāhush-shamad. Lam yalid wa lam yūlad. Wa lam yakul lahū kufuwan ahad.',
        terjemahan:
          'Katakanlah (Muhammad), “Dialah Allah, Yang Maha Esa. Allah tempat meminta segala sesuatu. (Allah) tidak beranak dan tidak pula diperanakkan. Dan tidak ada sesuatu yang setara dengan Dia.”',
        sumber: 'QS. Al-Ikhlas: 1–4',
      },
      {
        id: 'al-falaq',
        title: 'Surah Al-Falaq',
        ulang: '3 kali',
        arab: 'قُلْ اَعُوْذُ بِرَبِّ الْفَلَقِۙ مِنْ شَرِّ مَا خَلَقَۙ وَمِنْ شَرِّ غَاسِقٍ اِذَا وَقَبَۙ وَمِنْ شَرِّ النَّفّٰثٰتِ فِى الْعُقَدِۙ وَمِنْ شَرِّ حَاسِدٍ اِذَا حَسَدَ',
        latin:
          'Qul a‘ūdzu birabbil-falaq. Min syarri mā khalaq. Wa min syarri ghāsiqin idzā waqab. Wa min syarrin-naffātsāti fil-‘uqad. Wa min syarri hāsidin idzā hasad.',
        terjemahan:
          'Katakanlah, “Aku berlindung kepada Tuhan yang menguasai subuh (fajar), dari kejahatan (makhluk yang) Dia ciptakan, dan dari kejahatan malam apabila telah gelap gulita, dan dari kejahatan (perempuan-perempuan) penyihir yang meniup pada buhul-buhul (talinya), dan dari kejahatan orang yang dengki apabila dia dengki.”',
        sumber: 'QS. Al-Falaq: 1–5',
      },
      {
        id: 'an-nas',
        title: 'Surah An-Nas',
        ulang: '3 kali',
        arab: 'قُلْ اَعُوْذُ بِرَبِّ النَّاسِۙ مَلِكِ النَّاسِۙ اِلٰهِ النَّاسِۙ مِنْ شَرِّ الْوَسْوَاسِ ەۙ الْخَنَّاسِۖ الَّذِيْ يُوَسْوِسُ فِيْ صُدُوْرِ النَّاسِۙ مِنَ الْجِنَّةِ وَالنَّاسِ',
        latin:
          'Qul a‘ūdzu birabbin-nās. Malikin-nās. Ilāhin-nās. Min syarril-waswāsil-khannās. Alladzī yuwaswisu fī shudūrin-nās. Minal-jinnati wan-nās.',
        terjemahan:
          'Katakanlah, “Aku berlindung kepada Tuhannya manusia, Raja manusia, sembahan manusia, dari kejahatan (bisikan) setan yang bersembunyi, yang membisikkan (kejahatan) ke dalam dada manusia, dari (golongan) jin dan manusia.”',
        sumber: 'QS. An-Nas: 1–6',
      },
      {
        id: 'sayyidul-istighfar',
        title: 'Doa Memohon Ampun Terbaik (Sayyidul Istighfar)',
        ulang: '1 kali',
        arab: 'اَللّٰهُمَّ اَنْتَ رَبِّيْ لَا اِلٰهَ اِلَّا اَنْتَ، خَلَقْتَنِيْ وَاَنَا عَبْدُكَ، وَاَنَا عَلٰى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، اَعُوْذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، اَبُوْءُ لَكَ بِنِعْمَتِكَ عَلَيَّ وَاَبُوْءُ بِذَنْبِيْ فَاغْفِرْ لِيْ فَاِنَّهٗ لَا يَغْفِرُ الذُّنُوْبَ اِلَّا اَنْتَ',
        latin:
          'Allāhumma anta rabbī lā ilāha illā anta, khalaqtanī wa ana ‘abduka, wa ana ‘alā ‘ahdika wa wa‘dika mastatha‘tu, a‘ūdzu bika min syarri mā shana‘tu, abū’u laka bini‘matika ‘alayya wa abū’u bidzanbī faghfir lī fa innahū lā yaghfirudz-dzunūba illā anta.',
        terjemahan:
          'Ya Allah, Engkau Tuhanku, tidak ada tuhan selain Engkau. Engkau menciptakanku dan aku hamba-Mu. Aku berada di atas janji dan ikrar-Mu semampuku. Aku berlindung kepada-Mu dari keburukan perbuatanku. Aku mengakui nikmat-Mu atasku dan aku mengakui dosaku, maka ampunilah aku, karena tidak ada yang mengampuni dosa selain Engkau.',
        sumber: 'HR. Bukhari',
      },
      {
        id: 'ashbahna',
        title: 'Dzikir Pembuka Pagi & Petang',
        ulang: '1 kali',
        arab: 'اَصْبَحْنَا وَاَصْبَحَ الْمُلْكُ لِلّٰهِ، وَالْحَمْدُ لِلّٰهِ، لَا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهٗ لَا شَرِيْكَ لَهٗ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلٰى كُلِّ شَيْءٍ قَدِيْرٌ',
        latin:
          'Ashbahnā wa ashbahal-mulku lillāh, wal-hamdu lillāh, lā ilāha illallāhu wahdahū lā syarīka lah, lahul-mulku wa lahul-hamdu wa huwa ‘alā kulli syai’in qadīr. (Petang: Amsainā wa amsal-mulku lillāh …)',
        terjemahan:
          'Kami memasuki waktu pagi dan kerajaan (alam ini) menjadi milik Allah. Segala puji bagi Allah. Tidak ada tuhan selain Allah semata, tidak ada sekutu bagi-Nya. Milik-Nya kerajaan dan bagi-Nya segala puji, dan Dia Mahakuasa atas segala sesuatu. (Petang: “Kami memasuki waktu petang …”)',
        sumber: 'HR. Muslim',
      },
      {
        id: 'allahumma-bika-ashbahna',
        title: 'Doa Pagi Hari',
        ulang: '1 kali',
        arab: 'اَللّٰهُمَّ بِكَ اَصْبَحْنَا وَبِكَ اَمْسَيْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوْتُ وَاِلَيْكَ النُّشُوْرُ',
        latin: 'Allāhumma bika ashbahnā wa bika amsainā wa bika nahyā wa bika namūtu wa ilaikan-nusyūr.',
        terjemahan:
          'Ya Allah, dengan-Mu kami memasuki waktu pagi dan dengan-Mu kami memasuki waktu petang, dengan-Mu kami hidup dan dengan-Mu kami mati, dan kepada-Mu tempat kembali (dibangkitkan).',
        sumber: 'HR. Tirmidzi',
      },
      {
        id: 'allahumma-bika-amsaina',
        title: 'Doa Petang Hari',
        ulang: '1 kali',
        arab: 'اَللّٰهُمَّ بِكَ اَمْسَيْنَا وَبِكَ اَصْبَحْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوْتُ وَاِلَيْكَ الْمَصِيْرُ',
        latin: 'Allāhumma bika amsainā wa bika ashbahnā wa bika nahyā wa bika namūtu wa ilaikal-mashīr.',
        terjemahan:
          'Ya Allah, dengan-Mu kami memasuki waktu petang dan dengan-Mu kami memasuki waktu pagi, dengan-Mu kami hidup dan dengan-Mu kami mati, dan kepada-Mu tempat kembali.',
        sumber: 'HR. Tirmidzi',
      },
      {
        id: 'radhitu-billah',
        title: 'Ikrar Ridha kepada Allah, Islam, dan Rasul',
        ulang: '3 kali',
        arab: 'رَضِيْتُ بِاللّٰهِ رَبًّا، وَبِالْاِسْلَامِ دِيْنًا، وَبِمُحَمَّدٍ صَلَّى اللّٰهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا',
        latin: 'Radhītu billāhi rabbā, wa bil-islāmi dīnā, wa bimuhammadin shallallāhu ‘alaihi wa sallama nabiyyā.',
        terjemahan: 'Aku ridha Allah sebagai Tuhanku, Islam sebagai agamaku, dan Muhammad ﷺ sebagai nabiku.',
        sumber: 'HR. Abu Dawud & Tirmidzi',
      },
      {
        id: 'hasbiyallah',
        title: 'Cukuplah Allah Bagiku',
        ulang: '7 kali',
        arab: 'حَسْبِيَ اللّٰهُ لَآ اِلٰهَ اِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيْمِ',
        latin: 'Hasbiyallāhu lā ilāha illā huwa ‘alaihi tawakkaltu wa huwa rabbul-‘arsyil-‘azhīm.',
        terjemahan:
          'Cukuplah Allah bagiku, tidak ada tuhan selain Dia. Hanya kepada-Nya aku bertawakal, dan Dia adalah Tuhan yang memiliki ‘Arsy yang agung.',
        sumber: 'QS. At-Taubah: 129; HR. Abu Dawud',
      },
      {
        id: 'bismillahilladzi',
        title: 'Doa Perlindungan dari Segala Bahaya',
        ulang: '3 kali',
        arab: 'بِسْمِ اللّٰهِ الَّذِيْ لَا يَضُرُّ مَعَ اسْمِهٖ شَيْءٌ فِى الْاَرْضِ وَلَا فِى السَّمَاۤءِ وَهُوَ السَّمِيْعُ الْعَلِيْمُ',
        latin: 'Bismillāhilladzī lā yadhurru ma‘asmihī syai’un fil-ardhi wa lā fis-samā’i wa huwas-samī‘ul-‘alīm.',
        terjemahan:
          'Dengan nama Allah yang dengan nama-Nya tidak ada sesuatu pun yang membahayakan, baik di bumi maupun di langit, dan Dia Maha Mendengar lagi Maha Mengetahui.',
        sumber: 'HR. Abu Dawud & Tirmidzi',
      },
      {
        id: 'audzu-bikalimatillah',
        title: 'Doa Perlindungan dari Kejahatan Makhluk (Petang)',
        ulang: '3 kali',
        arab: 'اَعُوْذُ بِكَلِمَاتِ اللّٰهِ التَّاۤمَّاتِ مِنْ شَرِّ مَا خَلَقَ',
        latin: 'A‘ūdzu bikalimātillāhit-tāmmāti min syarri mā khalaq.',
        terjemahan: 'Aku berlindung dengan kalimat-kalimat Allah yang sempurna dari keburukan apa yang Dia ciptakan.',
        sumber: 'HR. Muslim',
      },
      {
        id: 'subhanallah-wa-bihamdih-100',
        title: 'Tasbih Seratus Kali',
        ulang: '100 kali',
        arab: 'سُبْحَانَ اللّٰهِ وَبِحَمْدِهٖ',
        latin: 'Subhānallāhi wa bihamdih.',
        terjemahan: 'Mahasuci Allah dan segala puji bagi-Nya.',
        sumber: 'HR. Muslim',
      },
    ],
  },
  {
    id: 'dzikir-setelah-shalat',
    title: 'Dzikir Setelah Shalat',
    entries: [
      {
        id: 'istighfar-antas-salam',
        title: 'Istighfar & Doa Keselamatan',
        ulang: '3 kali',
        arab: 'اَسْتَغْفِرُ اللّٰهَ (٣×)، اَللّٰهُمَّ اَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْاِكْرَامِ',
        latin: 'Astaghfirullāh (3×). Allāhumma antas-salām wa minkas-salām, tabārakta yā dzal-jalāli wal-ikrām.',
        terjemahan:
          'Aku memohon ampun kepada Allah (3×). Ya Allah, Engkau Maha Pemberi keselamatan dan dari-Mu keselamatan. Mahaberkah Engkau, wahai Pemilik keagungan dan kemuliaan.',
        sumber: 'HR. Muslim',
      },
      {
        id: 'la-ilaha-illallah-la-mania',
        title: 'Tahlil Setelah Shalat',
        ulang: '1 kali',
        arab: `${TAHLIL_PENUTUP}، اَللّٰهُمَّ لَا مَانِعَ لِمَا اَعْطَيْتَ وَلَا مُعْطِيَ لِمَا مَنَعْتَ وَلَا يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ`,
        latin: `${TAHLIL_PENUTUP_LATIN} Allāhumma lā māni‘a limā a‘thaita wa lā mu‘thiya limā mana‘ta wa lā yanfa‘u dzal-jaddi minkal-jadd.`,
        terjemahan: `${TAHLIL_PENUTUP_TERJEMAHAN} Ya Allah, tidak ada yang dapat menghalangi apa yang Engkau beri dan tidak ada yang dapat memberi apa yang Engkau halangi, dan tidak berguna kekayaan seseorang di hadapan-Mu.`,
        sumber: 'HR. Bukhari & Muslim',
      },
      {
        id: 'tasbih-tahmid-takbir-33',
        title: 'Tasbih, Tahmid, Takbir',
        ulang: '33 kali',
        arab: `سُبْحَانَ اللّٰهِ (٣٣×)، اَلْحَمْدُ لِلّٰهِ (٣٣×)، اَللّٰهُ اَكْبَرُ (٣٣×)، ${TAHLIL_PENUTUP}`,
        latin: `Subhānallāh (33×), alhamdulillāh (33×), Allāhu akbar (33×), ${TAHLIL_PENUTUP_LATIN}`,
        terjemahan: `Mahasuci Allah (33×), segala puji bagi Allah (33×), Allah Mahabesar (33×). ${TAHLIL_PENUTUP_TERJEMAHAN}`,
        sumber: 'HR. Muslim',
      },
      {
        id: 'ayat-kursi-setelah-shalat',
        title: 'Ayat Kursi',
        ulang: '1 kali',
        arab: AYAT_KURSI,
        latin: AYAT_KURSI_LATIN,
        terjemahan: AYAT_KURSI_TERJEMAHAN,
        sumber: 'QS. Al-Baqarah: 255; HR. An-Nasa’i',
      },
      {
        id: 'allahumma-ainni',
        title: 'Doa Mohon Kekuatan Beribadah',
        ulang: '1 kali',
        arab: 'اَللّٰهُمَّ اَعِنِّيْ عَلٰى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
        latin: 'Allāhumma a‘innī ‘alā dzikrika wa syukrika wa husni ‘ibādatik.',
        terjemahan: 'Ya Allah, tolonglah aku untuk selalu mengingat-Mu, bersyukur kepada-Mu, dan beribadah kepada-Mu dengan baik.',
        sumber: 'HR. Abu Dawud & An-Nasa’i',
      },
    ],
  },
];
