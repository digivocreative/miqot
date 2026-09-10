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
  /** Jumlah bacaan yang dianjurkan, selalu berbentuk 'N kali' (mis. '3 kali'). */
  ulang?: string;
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
        id: 'berangkat-dari-rumah',
        title: 'Doa Berangkat dari Rumah',
        arab: 'بِسْمِ اللّٰهِ تَوَكَّلْتُ عَلَى اللّٰهِ، لَا حَوْلَ وَلَا قُوَّةَ اِلَّا بِاللّٰهِ',
        latin: 'Bismillāhi tawakkaltu ‘alallāh, lā haula wa lā quwwata illā billāh.',
        terjemahan: 'Dengan nama Allah, aku bertawakal kepada Allah. Tiada daya dan kekuatan kecuali dengan pertolongan Allah.',
        sumber: 'HR. Abu Dawud & Tirmidzi',
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
        id: 'setelah-berihram',
        title: 'Doa Setelah Berihram',
        arab: 'اَللّٰهُمَّ اِنِّيْ اُرِيْدُ الْعُمْرَةَ فَيَسِّرْهَا لِيْ وَتَقَبَّلْهَا مِنِّيْ',
        latin: 'Allāhumma innī urīdul-‘umrata fayassirhā lī wa taqabbalhā minnī.',
        terjemahan: 'Ya Allah, aku hendak melaksanakan umroh, maka mudahkanlah ia bagiku dan terimalah ia dariku.',
        sumber: 'Doa masyhur manasik',
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
      {
        id: 'doa-tawaf',
        title: 'Doa Tawaf',
        arab: 'سُبْحَانَ اللّٰهِ وَالْحَمْدُ لِلّٰهِ وَلَا اِلٰهَ اِلَّا اللّٰهُ وَاللّٰهُ اَكْبَرُ، وَلَا حَوْلَ وَلَا قُوَّةَ اِلَّا بِاللّٰهِ',
        latin: 'Subhānallāh, wal-hamdu lillāh, wa lā ilāha illallāh, wallāhu akbar, wa lā haula wa lā quwwata illā billāh.',
        terjemahan: 'Mahasuci Allah, segala puji bagi Allah, tidak ada tuhan selain Allah, Allah Mahabesar, dan tiada daya serta kekuatan kecuali dengan pertolongan Allah.',
        sumber: 'HR. Ibnu Majah',
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
    id: 'tahalul',
    title: 'Tahalul',
    entries: [
      {
        id: 'tahalul',
        title: 'Doa Tahalul',
        arab: 'اَللّٰهُمَّ اجْعَلْ لِكُلِّ شَعْرَةٍ نُوْرًا يَوْمَ الْقِيَامَةِ',
        latin: 'Allāhummaj‘al likulli sya‘ratin nūran yaumal-qiyāmah.',
        terjemahan: 'Ya Allah, jadikanlah untuk setiap helai rambut (yang dipotong ini) cahaya pada hari kiamat.',
        sumber: 'Doa masyhur manasik',
      },
    ],
  },
  {
    id: 'harian',
    title: 'Doa Harian',
    entries: [
      {
        id: 'sebelum-tidur',
        title: 'Doa sebelum tidur',
        arab: 'بِاسْمِكَ اللّٰهُمَّ اَحْيَا وَاَمُوْتُ',
        latin: 'Bismikallāhumma ahyā wa amūt.',
        terjemahan: 'Dengan nama-Mu ya Allah aku hidup dan aku mati.',
        sumber: 'HR. Bukhari',
      },
      {
        id: 'bangun-tidur',
        title: 'Doa bangun tidur',
        arab: 'اَلْحَمْدُ لِلّٰهِ الَّذِيْ اَحْيَانَا بَعْدَ مَا اَمَاتَنَا وَاِلَيْهِ النُّشُوْرُ',
        latin: 'Alhamdulillāhilladzī ahyānā ba‘da mā amātanā wa ilaihin-nusyūr.',
        terjemahan: 'Segala puji bagi Allah yang menghidupkan kami setelah mematikan kami, dan kepada-Nya kami dibangkitkan.',
        sumber: 'HR. Bukhari',
      },
      {
        id: 'masuk-kamar-mandi',
        title: 'Doa masuk kamar mandi',
        arab: 'اَللّٰهُمَّ اِنِّيْ اَعُوْذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَاۤئِثِ',
        latin: 'Allāhumma innī a‘ūdzu bika minal-khubutsi wal-khabā’its.',
        terjemahan: 'Ya Allah, aku berlindung kepada-Mu dari setan laki-laki dan setan perempuan.',
        sumber: 'HR. Bukhari & Muslim',
      },
      {
        id: 'bercermin',
        title: 'Doa ketika bercermin',
        arab: 'اَللّٰهُمَّ كَمَا حَسَّنْتَ خَلْقِيْ فَحَسِّنْ خُلُقِيْ',
        latin: 'Allāhumma kamā hassanta khalqī fahassin khuluqī.',
        terjemahan: 'Ya Allah, sebagaimana Engkau telah membaguskan rupaku, maka baguskanlah pula akhlakku.',
        sumber: 'HR. Ahmad',
      },
      {
        id: 'keluar-rumah',
        title: 'Doa keluar rumah',
        arab: 'بِسْمِ اللّٰهِ تَوَكَّلْتُ عَلَى اللّٰهِ، لَا حَوْلَ وَلَا قُوَّةَ اِلَّا بِاللّٰهِ',
        latin: 'Bismillāhi tawakkaltu ‘alallāh, lā haula wa lā quwwata illā billāh.',
        terjemahan: 'Dengan nama Allah, aku bertawakal kepada Allah. Tiada daya dan kekuatan kecuali dengan pertolongan Allah.',
        sumber: 'HR. Abu Dawud & Tirmidzi',
      },
      {
        id: 'masuk-rumah',
        title: 'Doa masuk rumah',
        arab: 'بِسْمِ اللّٰهِ وَلَجْنَا وَبِسْمِ اللّٰهِ خَرَجْنَا وَعَلَى اللّٰهِ رَبِّنَا تَوَكَّلْنَا',
        latin: 'Bismillāhi walajnā wa bismillāhi kharajnā wa ‘alallāhi rabbinā tawakkalnā.',
        terjemahan: 'Dengan nama Allah kami masuk, dengan nama Allah kami keluar, dan kepada Allah Tuhan kami, kami bertawakal.',
        sumber: 'HR. Abu Dawud',
      },
      {
        id: 'ilmu-bermanfaat',
        title: 'Doa memohon ilmu yang bermanfaat',
        arab: 'اَللّٰهُمَّ اِنِّيْ اَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا',
        latin: 'Allāhumma innī as’aluka ‘ilman nāfi‘ā, wa rizqan thayyibā, wa ‘amalan mutaqabbalā.',
        terjemahan: 'Ya Allah, aku memohon kepada-Mu ilmu yang bermanfaat, rezeki yang baik, dan amal yang diterima.',
        sumber: 'HR. Ibnu Majah',
      },
      {
        id: 'sebelum-belajar',
        title: 'Doa sebelum belajar',
        arab: 'رَبِّ زِدْنِيْ عِلْمًا',
        latin: 'Rabbi zidnī ‘ilmā.',
        terjemahan: 'Ya Tuhanku, tambahkanlah ilmu kepadaku.',
        sumber: 'QS. Thaha: 114',
      },
      {
        id: 'sesudah-belajar',
        title: 'Doa sesudah belajar',
        arab: 'اَللّٰهُمَّ اَرِنَا الْحَقَّ حَقًّا وَارْزُقْنَا اتِّبَاعَهُ، وَاَرِنَا الْبَاطِلَ بَاطِلًا وَارْزُقْنَا اجْتِنَابَهُ',
        latin: 'Allāhumma arinal-haqqa haqqan warzuqnattibā‘ah, wa arinal-bāthila bāthilan warzuqnajtinābah.',
        terjemahan: 'Ya Allah, tunjukkanlah kepada kami kebenaran sebagai kebenaran dan berilah kami kemampuan mengikutinya, dan tunjukkanlah kepada kami kebatilan sebagai kebatilan dan berilah kami kemampuan menjauhinya.',
        sumber: 'Doa masyhur',
      },
      {
        id: 'sebelum-wudhu',
        title: 'Doa sebelum wudhu',
        arab: 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ',
        latin: 'Bismillāhir-rahmānir-rahīm.',
        terjemahan: 'Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.',
        sumber: 'HR. Abu Dawud',
      },
      {
        id: 'setelah-wudhu',
        title: 'Doa setelah wudhu',
        arab: 'اَشْهَدُ اَنْ لَّا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهٗ لَا شَرِيْكَ لَهٗ، وَاَشْهَدُ اَنَّ مُحَمَّدًا عَبْدُهٗ وَرَسُوْلُهٗ، اَللّٰهُمَّ اجْعَلْنِيْ مِنَ التَّوَّابِيْنَ وَاجْعَلْنِيْ مِنَ الْمُتَطَهِّرِيْنَ',
        latin: 'Asyhadu allā ilāha illallāhu wahdahū lā syarīka lah, wa asyhadu anna muhammadan ‘abduhū wa rasūluh. Allāhummaj‘alnī minat-tawwābīna waj‘alnī minal-mutathahhirīn.',
        terjemahan: 'Aku bersaksi tidak ada tuhan selain Allah semata, tidak ada sekutu bagi-Nya, dan aku bersaksi bahwa Muhammad adalah hamba dan utusan-Nya. Ya Allah, jadikanlah aku termasuk orang yang bertobat dan jadikanlah aku termasuk orang yang menyucikan diri.',
        sumber: 'HR. Muslim & Tirmidzi',
      },
      {
        id: 'sebelum-baca-quran',
        title: 'Doa sebelum membaca Al-Qur’an',
        arab: 'اَعُوْذُ بِاللّٰهِ مِنَ الشَّيْطَانِ الرَّجِيْمِ، بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ',
        latin: 'A‘ūdzu billāhi minasy-syaithānir-rajīm. Bismillāhir-rahmānir-rahīm.',
        terjemahan: 'Aku berlindung kepada Allah dari setan yang terkutuk. Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.',
        sumber: 'QS. An-Nahl: 98',
      },
      {
        id: 'setelah-baca-quran',
        title: 'Doa setelah membaca Al-Qur’an',
        arab: 'اَللّٰهُمَّ ارْحَمْنِيْ بِالْقُرْاٰنِ وَاجْعَلْهُ لِيْ اِمَامًا وَنُوْرًا وَهُدًى وَرَحْمَةً',
        latin: 'Allāhummarhamnī bil-qur’ān, waj‘alhu lī imāman wa nūran wa hudan wa rahmah.',
        terjemahan: 'Ya Allah, rahmatilah aku dengan Al-Qur’an, dan jadikanlah ia bagiku pemimpin, cahaya, petunjuk, dan rahmat.',
        sumber: 'Doa masyhur',
      },
      {
        id: 'sebelum-mandi',
        title: 'Doa sebelum mandi',
        arab: 'اَللّٰهُمَّ اغْفِرْ لِيْ ذَنْبِيْ وَوَسِّعْ لِيْ فِيْ دَارِيْ وَبَارِكْ لِيْ فِيْ رِزْقِيْ',
        latin: 'Allāhummaghfir lī dzanbī wa wassi‘ lī fī dārī wa bārik lī fī rizqī.',
        terjemahan: 'Ya Allah, ampunilah dosaku, lapangkanlah rumahku, dan berkahilah rezekiku.',
        sumber: 'HR. Tirmidzi',
      },
      {
        id: 'sebelum-makan',
        title: 'Doa sebelum makan',
        arab: 'اَللّٰهُمَّ بَارِكْ لَنَا فِيْمَا رَزَقْتَنَا وَقِنَا عَذَابَ النَّارِ',
        latin: 'Allāhumma bārik lanā fīmā razaqtanā wa qinā ‘adzāban-nār.',
        terjemahan: 'Ya Allah, berkahilah kami pada apa yang telah Engkau rezekikan kepada kami, dan peliharalah kami dari siksa neraka.',
        sumber: 'HR. Ibnu Sunni',
      },
      {
        id: 'sesudah-makan',
        title: 'Doa sesudah makan',
        arab: 'اَلْحَمْدُ لِلّٰهِ الَّذِيْ اَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِيْنَ',
        latin: 'Alhamdulillāhilladzī ath‘amanā wa saqānā wa ja‘alanā muslimīn.',
        terjemahan: 'Segala puji bagi Allah yang telah memberi kami makan dan minum serta menjadikan kami orang-orang muslim.',
        sumber: 'HR. Abu Dawud & Tirmidzi',
      },
      {
        id: 'keluar-masjid',
        title: 'Doa keluar masjid',
        arab: 'اَللّٰهُمَّ اِنِّيْ اَسْأَلُكَ مِنْ فَضْلِكَ',
        latin: 'Allāhumma innī as’aluka min fadhlik.',
        terjemahan: 'Ya Allah, aku memohon kepada-Mu sebagian dari karunia-Mu.',
        sumber: 'HR. Muslim',
      },
    ],
  },
  {
    id: 'dzikir-harian',
    title: 'Dzikir Harian',
    entries: [
      {
        id: 'istighfar',
        title: 'Istighfar — Memohon Ampun',
        arab: 'أَسْتَغْفِرُ اللّٰهَ الْعَظِيْمَ',
        latin: 'Astaghfirullāhal-‘azhīm.',
        terjemahan: 'Aku memohon ampun kepada Allah Yang Mahaagung.',
      },
      {
        id: 'tasbih',
        title: 'Tasbih — Menyucikan Allah',
        arab: 'سُبْحَانَ اللّٰهِ وَبِحَمْدِهٖ، سُبْحَانَ اللّٰهِ الْعَظِيْمِ',
        latin: 'Subhānallāhi wa bihamdih, subhānallāhil-‘azhīm.',
        terjemahan: 'Mahasuci Allah dan segala puji bagi-Nya, Mahasuci Allah Yang Mahaagung.',
        sumber: 'HR. Bukhari & Muslim',
      },
      {
        id: 'hauqalah',
        title: 'Hauqalah — Tiada Daya Selain dari Allah',
        arab: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللّٰهِ',
        latin: 'Lā haula wa lā quwwata illā billāh.',
        terjemahan: 'Tiada daya dan kekuatan kecuali dengan pertolongan Allah.',
        sumber: 'HR. Bukhari & Muslim',
      },
    ],
  },
];
