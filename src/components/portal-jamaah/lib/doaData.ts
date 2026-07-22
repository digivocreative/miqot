// Kumpulan doa & dzikir perjalanan ibadah umroh/haji — konten statis (offline).
//
// CATATAN: Teks Arab, latin, dan terjemahan di bawah perlu ditinjau ulang oleh tim
// (mis. pembimbing ibadah) sebelum dianggap final. Disusun dari doa masyhur/otentik;
// `sumber` dicantumkan bila memungkinkan (QS = ayat Al-Quran, HR = hadis).

export interface DoaEntry {
  id: string;
  title: string;
  arab: string;
  latin: string;
  terjemahan: string;
  sumber?: string;
}

export interface DoaCategory {
  id: string;
  title: string;
  entries: DoaEntry[];
}

export const DOA_CATEGORIES: DoaCategory[] = [
  {
    id: 'safar',
    title: 'Doa Perjalanan (Safar)',
    entries: [
      {
        id: 'naik-kendaraan',
        title: 'Doa Naik Kendaraan',
        arab: 'سُبْحَانَ الَّذِيْ سَخَّرَ لَنَا هٰذَا وَمَا كُنَّا لَهٗ مُقْرِنِيْنَ ۙ وَاِنَّآ اِلٰى رَبِّنَا لَمُنْقَلِبُوْنَ',
        latin: 'Subhānalladzī sakhkhara lanā hādzā wa mā kunnā lahū muqrinīn, wa innā ilā rabbinā lamunqalibūn.',
        terjemahan:
          'Mahasuci (Allah) yang telah menundukkan semua ini bagi kami, padahal kami sebelumnya tidak mampu menguasainya, dan sesungguhnya kami akan kembali kepada Tuhan kami.',
        sumber: 'QS. Az-Zukhruf: 13–14',
      },
      {
        id: 'doa-safar',
        title: 'Doa Bepergian',
        arab: 'اللّٰهُمَّ إِنَّا نَسْأَلُكَ فِيْ سَفَرِنَا هٰذَا الْبِرَّ وَالتَّقْوٰى، وَمِنَ الْعَمَلِ مَا تَرْضٰى، اللّٰهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هٰذَا وَاطْوِ عَنَّا بُعْدَهُ',
        latin:
          'Allāhumma innā nas’aluka fī safarinā hādzal-birra wat-taqwā, wa minal-‘amali mā tardhā. Allāhumma hawwin ‘alainā safaranā hādzā watwi ‘annā bu‘dah.',
        terjemahan:
          'Ya Allah, kami memohon kepada-Mu dalam perjalanan ini kebaikan dan ketakwaan, serta amal yang Engkau ridhai. Ya Allah, mudahkanlah perjalanan kami ini dan dekatkanlah jaraknya bagi kami.',
        sumber: 'HR. Muslim',
      },
      {
        id: 'masuk-kota',
        title: 'Doa Memasuki Suatu Negeri/Kota',
        arab: 'اللّٰهُمَّ رَبَّ السَّمٰوَاتِ السَّبْعِ وَمَا أَظْلَلْنَ، وَرَبَّ الْأَرَضِيْنَ وَمَا أَقْلَلْنَ، أَسْأَلُكَ خَيْرَ هٰذِهِ الْقَرْيَةِ وَخَيْرَ أَهْلِهَا',
        latin:
          'Allāhumma rabbas-samāwātis-sab‘i wa mā azhlaln, wa rabbal-aradhīna wa mā aqlaln, as’aluka khaira hādzihil-qaryati wa khaira ahlihā.',
        terjemahan:
          'Ya Allah, Tuhan tujuh langit dan apa yang dinaunginya, Tuhan bumi dan apa yang dikandungnya, aku memohon kepada-Mu kebaikan negeri ini dan kebaikan penduduknya.',
        sumber: 'HR. An-Nasa’i & Al-Hakim',
      },
    ],
  },
  {
    id: 'niat-ihram',
    title: 'Niat & Ihram',
    entries: [
      {
        id: 'niat-umroh',
        title: 'Niat Umroh',
        arab: 'لَبَّيْكَ اللّٰهُمَّ عُمْرَةً',
        latin: 'Labbaikallāhumma ‘umratan.',
        terjemahan: 'Aku penuhi panggilan-Mu ya Allah untuk berumroh.',
      },
      {
        id: 'niat-haji',
        title: 'Niat Haji',
        arab: 'لَبَّيْكَ اللّٰهُمَّ حَجًّا',
        latin: 'Labbaikallāhumma hajjan.',
        terjemahan: 'Aku penuhi panggilan-Mu ya Allah untuk berhaji.',
      },
    ],
  },
  {
    id: 'talbiyah',
    title: 'Talbiyah',
    entries: [
      {
        id: 'talbiyah',
        title: 'Bacaan Talbiyah',
        arab: 'لَبَّيْكَ اللّٰهُمَّ لَبَّيْكَ، لَبَّيْكَ لَا شَرِيْكَ لَكَ لَبَّيْكَ، إِنَّ الْحَمْدَ وَالنِّعْمَةَ لَكَ وَالْمُلْكَ، لَا شَرِيْكَ لَكَ',
        latin:
          'Labbaikallāhumma labbaik, labbaika lā syarīka laka labbaik, innal-hamda wan-ni‘mata laka wal-mulk, lā syarīka lak.',
        terjemahan:
          'Aku penuhi panggilan-Mu ya Allah, aku penuhi panggilan-Mu. Aku penuhi panggilan-Mu, tiada sekutu bagi-Mu, aku penuhi panggilan-Mu. Sesungguhnya segala pujian, kenikmatan, dan kekuasaan adalah milik-Mu, tiada sekutu bagi-Mu.',
        sumber: 'HR. Bukhari & Muslim',
      },
    ],
  },
  {
    id: 'masjidil-haram',
    title: 'Masjidil Haram & Melihat Ka’bah',
    entries: [
      {
        id: 'masuk-masjid',
        title: 'Doa Masuk Masjid',
        arab: 'اللّٰهُمَّ افْتَحْ لِيْ أَبْوَابَ رَحْمَتِكَ',
        latin: 'Allāhummaftah lī abwāba rahmatik.',
        terjemahan: 'Ya Allah, bukakanlah untukku pintu-pintu rahmat-Mu.',
        sumber: 'HR. Muslim',
      },
      {
        id: 'melihat-kabah',
        title: 'Doa Melihat Ka’bah',
        arab: 'اللّٰهُمَّ زِدْ هٰذَا الْبَيْتَ تَشْرِيْفًا وَتَعْظِيْمًا وَتَكْرِيْمًا وَمَهَابَةً',
        latin: 'Allāhumma zid hādzal-baita tasyrīfan wa ta‘zhīman wa takrīman wa mahābah.',
        terjemahan:
          'Ya Allah, tambahkanlah kemuliaan, keagungan, kehormatan, dan kewibawaan pada Baitullah ini.',
      },
    ],
  },
  {
    id: 'thawaf',
    title: 'Thawaf',
    entries: [
      {
        id: 'istilam',
        title: 'Saat Istilam Hajar Aswad',
        arab: 'بِسْمِ اللّٰهِ وَاللّٰهُ أَكْبَرُ',
        latin: 'Bismillāhi wallāhu akbar.',
        terjemahan: 'Dengan nama Allah, dan Allah Mahabesar.',
        sumber: 'HR. Al-Baihaqi',
      },
      {
        id: 'rukun-yamani',
        title: 'Antara Rukun Yamani dan Hajar Aswad',
        arab: 'رَبَّنَآ اٰتِنَا فِى الدُّنْيَا حَسَنَةً وَّفِى الْاٰخِرَةِ حَسَنَةً وَّقِنَا عَذَابَ النَّارِ',
        latin: 'Rabbanā ātinā fid-dunyā hasanah, wa fil-ākhirati hasanah, wa qinā ‘adzāban-nār.',
        terjemahan:
          'Ya Tuhan kami, berilah kami kebaikan di dunia dan kebaikan di akhirat, dan lindungilah kami dari azab neraka.',
        sumber: 'QS. Al-Baqarah: 201',
      },
    ],
  },
  {
    id: 'sai',
    title: 'Sa’i (Shafa & Marwah)',
    entries: [
      {
        id: 'awal-sai',
        title: 'Doa Mendaki Shafa & Marwah',
        arab: 'اِنَّ الصَّفَا وَالْمَرْوَةَ مِنْ شَعَاۤىِٕرِ اللّٰهِ ۚ ۖ أَبْدَأُ بِمَا بَدَأَ اللّٰهُ بِهِ',
        latin: 'Innas-safā wal-marwata min sya‘ā’irillāh. Abda’u bimā bada’allāhu bih.',
        terjemahan:
          'Sesungguhnya Shafa dan Marwah adalah sebagian dari syiar (agama) Allah. Aku memulai dengan apa yang Allah memulainya.',
        sumber: 'QS. Al-Baqarah: 158 & HR. Muslim',
      },
      {
        id: 'di-atas-bukit',
        title: 'Dzikir di Atas Shafa/Marwah',
        arab: 'اللّٰهُ أَكْبَرُ، لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهٗ لَا شَرِيْكَ لَهٗ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلٰى كُلِّ شَيْءٍ قَدِيْرٌ',
        latin:
          'Allāhu akbar, lā ilāha illallāhu wahdahū lā syarīka lah, lahul-mulku wa lahul-hamdu wa huwa ‘alā kulli syai’in qadīr.',
        terjemahan:
          'Allah Mahabesar. Tiada tuhan selain Allah semata, tiada sekutu bagi-Nya. Milik-Nya kerajaan dan segala pujian, dan Dia Mahakuasa atas segala sesuatu.',
        sumber: 'HR. Muslim',
      },
    ],
  },
  {
    id: 'arafah',
    title: 'Arafah, Muzdalifah & Mina',
    entries: [
      {
        id: 'doa-arafah',
        title: 'Doa Terbaik di Arafah',
        arab: 'لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهٗ لَا شَرِيْكَ لَهٗ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلٰى كُلِّ شَيْءٍ قَدِيْرٌ',
        latin:
          'Lā ilāha illallāhu wahdahū lā syarīka lah, lahul-mulku wa lahul-hamdu wa huwa ‘alā kulli syai’in qadīr.',
        terjemahan:
          'Tiada tuhan selain Allah semata, tiada sekutu bagi-Nya. Milik-Nya kerajaan dan segala pujian, dan Dia Mahakuasa atas segala sesuatu.',
        sumber: 'HR. At-Tirmidzi',
      },
    ],
  },
  {
    id: 'madinah',
    title: 'Madinah & Raudhah',
    entries: [
      {
        id: 'salam-nabi',
        title: 'Salam kepada Rasulullah ﷺ',
        arab: 'اَلسَّلَامُ عَلَيْكَ يَا رَسُوْلَ اللّٰهِ وَرَحْمَةُ اللّٰهِ وَبَرَكَاتُهُ',
        latin: 'Assalāmu ‘alaika yā rasūlallāh wa rahmatullāhi wa barakātuh.',
        terjemahan: 'Salam sejahtera atasmu wahai Rasulullah, beserta rahmat Allah dan keberkahan-Nya.',
      },
    ],
  },
  {
    id: 'dzikir-harian',
    title: 'Dzikir Harian',
    entries: [
      {
        id: 'istighfar',
        title: 'Istighfar',
        arab: 'أَسْتَغْفِرُ اللّٰهَ الْعَظِيْمَ',
        latin: 'Astaghfirullāhal-‘azhīm.',
        terjemahan: 'Aku memohon ampun kepada Allah Yang Mahaagung.',
      },
      {
        id: 'tasbih',
        title: 'Tasbih',
        arab: 'سُبْحَانَ اللّٰهِ وَبِحَمْدِهٖ، سُبْحَانَ اللّٰهِ الْعَظِيْمِ',
        latin: 'Subhānallāhi wa bihamdih, subhānallāhil-‘azhīm.',
        terjemahan: 'Mahasuci Allah dan segala puji bagi-Nya, Mahasuci Allah Yang Mahaagung.',
        sumber: 'HR. Bukhari & Muslim',
      },
      {
        id: 'hauqalah',
        title: 'Hauqalah',
        arab: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللّٰهِ',
        latin: 'Lā haula wa lā quwwata illā billāh.',
        terjemahan: 'Tiada daya dan kekuatan kecuali dengan pertolongan Allah.',
        sumber: 'HR. Bukhari & Muslim',
      },
    ],
  },
];
