export interface AgentData {
  name: string;
  website: string;
  phone: string; // Format: 628...
  photo: string; // Path ke folder public
}

// Key object adalah "Slug" URL (misal: /bagas)
export const AGENTS_DATA: Record<string, AgentData> = {
  'nikita': {
    name: 'Nikita',
    website: 'alhijazindonesia.com',
    phone: '62822900020',
    photo: '/agents/nikita.jpg',
  },
  'nila': {
    name: 'Nila',
    website: 'alhijaztourtravels.com',
    phone: '6285211209049',
    photo: '/agents/nila.jpg',
  },
  'andra': {
    name: 'Andra',
    website: 'travelalhijazwisata.com',
    phone: '628129909795',
    photo: '/agents/andra.jpg',
  },
  'dyah': {
    name: 'Dyah',
    website: 'alhijaztraveltours.com',
    phone: '6281385975678',
    photo: '/agents/dyah.jpg',
  },
  'widi': {
    name: 'Widi',
    website: 'alhijaz-hajiumroh.com',
    phone: '6287820813228',
    photo: '/agents/widi.jpg',
  },
  'aulia': {
    name: 'Aulia',
    website: 'alhijazumrohtravel.com',
    phone: '6282110407229',
    photo: '/agents/aulia.jpg',
  },
  'selfiah': {
    name: 'Selfiah',
    website: 'alhijaztourtravel.co.id',
    phone: '6281410478212',
    photo: '/agents/selfiah.jpg',
  },
  'zakia': {
    name: 'Zakia',
    website: 'alhijazbirowisata.com',
    phone: '6285158005623',
    photo: '/agents/zakia.jpg',
  },
  'dianwahyuni': {
    name: 'Dian',
    website: 'alhijazindowisatatours.com',
    phone: '6283197968407',
    photo: '/agents/dianwahyuni.jpg',
  },
  'anne': {
    name: 'Anne',
    website: 'hajialhijaz.com',
    phone: '628129953424',
    photo: '/agents/anne.jpg',
  },
  'evi': {
    name: 'Evi',
    website: 'alhijazbirohajiumroh.com',
    phone: '6281806742789',
    photo: '/agents/evi.jpg',
  },
  'yenita': {
    name: 'Yenita',
    website: 'alhijazumrahtravel.com',
    phone: '6281316803128',
    photo: '/agents/yenita.jpg',
  },
  'indah': {
    name: 'Indah',
    website: 'alhijaztraveltour.com',
    phone: '6281943631008',
    photo: '/agents/indah.jpg',
  },
  'aisyah': {
    name: 'Aisyah',
    website: 'travelalhijazumrah.com',
    phone: '6281225600900',
    photo: '/agents/aisyah.jpg',
  },
  'siska': {
    name: 'Siska',
    website: 'alhijazumroh.com',
    phone: '6281188885291',
    photo: '/agents/siska.jpg',
  },
  'linda': {
    name: 'Linda',
    website: 'alhijazcallcenter.com',
    phone: '6282112094089',
    photo: '/agents/linda.jpg',
  },
  'nina': {
    name: 'Nina',
    website: 'alhijazumrahtours.com',
    phone: '6285943191075',
    photo: '/agents/nina.jpg',
  },
  'sari': {
    name: 'Sari',
    website: 'alhijaz.co/sari',
    phone: '6281907018220',
    photo: '/agents/sari.jpg',
  },
  'isti': {
    name: 'Isti',
    website: 'al-hijaztravelumroh.com',
    phone: '6281315002460',
    photo: '/agents/isti.jpg',
  },
  'ferra': {
    name: 'Ferra',
    website: 'alhijaztourtravel.id',
    phone: '62811802789',
    photo: '/agents/ferra.jpg',
  },
  'jan-praba': {
    name: 'Jan Praba',
    website: 'alhijaz.co/jan-praba',
    phone: '62816728940',
    photo: '/agents/jan-praba.jpg',
  },
  'ekawati': {
    name: 'Ekawati',
    website: 'alhijaz.co/ekawati',
    phone: '62816728904',
    photo: '/agents/ekawati.jpg',
  },
};
