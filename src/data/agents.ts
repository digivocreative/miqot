export interface AgentData {
  name: string;
  website: string;
  phone: string; // Format: 628...
  photo: string; // Path ke folder public
  capiPassword: string; // Password untuk login ke halaman CAPI settings
}

// Key object adalah "Slug" URL (misal: /bagas)
export const AGENTS_DATA: Record<string, AgentData> = {
  'nikita': {
    name: 'Nikita',
    website: 'alhijazindonesia.com',
    phone: '62822900020',
    photo: '/agents/nikita.jpg',
    capiPassword: 'elanggagah',
  },
  'nila': {
    name: 'Nila',
    website: 'alhijaztourtravels.com',
    phone: '6285211209049',
    photo: '/agents/nila.jpg',
    capiPassword: 'kucingberani',
  },
  'andra': {
    name: 'Andra',
    website: 'travelalhijazwisata.com',
    phone: '628129909795',
    photo: '/agents/andra.jpg',
    capiPassword: 'rubahsetia',
  },
  'dyah': {
    name: 'Dyah',
    website: 'alhijaztraveltours.com',
    phone: '6281385975678',
    photo: '/agents/dyah.jpg',
    capiPassword: 'sapiganteng',
  },
  'widi': {
    name: 'Widi',
    website: 'alhijaz-hajiumroh.com',
    phone: '6287820813228',
    photo: '/agents/widi.jpg',
    capiPassword: 'kudagigih',
  },
  'aulia': {
    name: 'Aulia',
    website: 'alhijazumrohtravel.com',
    phone: '6282110407229',
    photo: '/agents/aulia.jpg',
    capiPassword: 'rusaanggun',
  },
  'selfiah': {
    name: 'Selfiah',
    website: 'alhijaztourtravel.co.id',
    phone: '6281410478212',
    photo: '/agents/selfiah.jpg',
    capiPassword: 'merakgemilang',
  },
  'zakia': {
    name: 'Zakia',
    website: 'alhijazbirowisata.com',
    phone: '6285158005623',
    photo: '/agents/zakia.jpg',
    capiPassword: 'dombaramai',
  },
  'dianwahyuni': {
    name: 'Dian',
    website: 'alhijazindowisatatours.com',
    phone: '6283197968407',
    photo: '/agents/dianwahyuni.jpg',
    capiPassword: 'rajawaliperkasa',
  },
  'anne': {
    name: 'Anne',
    website: 'hajialhijaz.com',
    phone: '628129953424',
    photo: '/agents/anne.jpg',
    capiPassword: 'lumbalincah',
  },
  'evi': {
    name: 'Evi',
    website: 'alhijazbirohajiumroh.com',
    phone: '6281806742789',
    photo: '/agents/evi.jpg',
    capiPassword: 'pandaemas',
  },
  'yenita': {
    name: 'Yenita',
    website: 'alhijazumrahtravel.com',
    phone: '6281316803128',
    photo: '/agents/yenita.jpg',
    capiPassword: 'bangausakti',
  },
  'indah': {
    name: 'Indah',
    website: 'alhijaztraveltour.com',
    phone: '6281943631008',
    photo: '/agents/indah.jpg',
    capiPassword: 'kelincipintar',
  },
  'aisyah': {
    name: 'Aisyah',
    website: 'travelalhijazumrah.com',
    phone: '6281225600900',
    photo: '/agents/aisyah.jpg',
    capiPassword: 'angsagemari',
  },
  'siska': {
    name: 'Siska',
    website: 'alhijazumroh.com',
    phone: '6281188885291',
    photo: '/agents/siska.jpg',
    capiPassword: 'harimauberkah',
  },
  'linda': {
    name: 'Linda',
    website: 'alhijazcallcenter.com',
    phone: '6282112094089',
    photo: '/agents/linda.jpg',
    capiPassword: 'falconcemerlang',
  },
  'nina': {
    name: 'Nina',
    website: 'alhijazumrahtours.com',
    phone: '6285943191075',
    photo: '/agents/nina.jpg',
    capiPassword: 'burungjelita',
  },
  'sari': {
    name: 'Sari',
    website: 'alhijaz.co/sari',
    phone: '6281907018220',
    photo: '/agents/sari.jpg',
    capiPassword: 'merpatiluhur',
  },
  'isti': {
    name: 'Isti',
    website: 'al-hijaztravelumroh.com',
    phone: '6281315002460',
    photo: '/agents/isti.jpg',
    capiPassword: 'gajahpandai',
  },
  'ferra': {
    name: 'Ferra',
    website: 'alhijaztourtravel.id',
    phone: '62811802789',
    photo: '/agents/ferra.jpg',
    capiPassword: 'singasejati',
  },
  'jan-praba': {
    name: 'Jan Praba',
    website: 'alhijaz.co/jan-praba',
    phone: '62816728940',
    photo: '/agents/jan-praba.jpg',
    capiPassword: 'garudaberani',
  },
  'ekawati': {
    name: 'Ekawati',
    website: 'alhijaz.co/ekawati',
    phone: '62816728904',
    photo: '/agents/ekawati.jpg',
    capiPassword: 'kancilcemerlang',
  },
};
