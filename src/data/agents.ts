export interface AgentData {
  name: string;
  website: string;
  phone: string; // Format: 628...
  photo: string; // Path ke folder public
}

// Key object adalah "Slug" URL (misal: /bagas)
export const AGENTS_DATA: Record<string, AgentData> = {
  'bagas': {
    name: 'Bagas Pramudita',
    website: 'alhijazindonesia.com',
    phone: '6287878573311',
    photo: '/agents/bagas.jpg',
  },
  'nikita': {
    name: 'Nikita',
    website: 'alhijazindonesia.com',
    phone: '62822900020',
    photo: '/agents/nikita.jpg',
  },
  'nila': {
    name: 'Nila Novita Sari ',
    website: 'alhijaztourtravels.com',
    phone: '6285211209049',
    photo: '/agents/nila.jpg',
  },
  'andra': {
    name: 'Andra Olivia',
    website: 'travelalhijazwisata.com',
    phone: '628129909795',
    photo: '/agents/andra.jpg',
  },
  'dyah': {
    name: 'Dyah Ratna Witri',
    website: 'alhijaztraveltours.com',
    phone: '6281385975678',
    photo: '/agents/dyah.jpg',
  },
  'widi': {
    name: 'Widi Purwanti',
    website: 'alhijaz-hajiumroh.com',
    phone: '6287820813228',
    photo: '/agents/widi.jpg',
  },
  'aulia': {
    name: 'Leni Aulianingsih',
    website: 'alhijazumrohtravel.com',
    phone: '6282110407229',
    photo: '/agents/aulia.jpg',
  },
  'selfiah': {
    name: 'Selfiah Handayani',
    website: 'alhijaztourtravel.co.id',
    phone: '6281410478212',
    photo: '/agents/selfiah.jpg',
  },
  'zakia': {
    name: 'Rahima Zakia',
    website: 'alhijazbirowisata.com',
    phone: '6285158005623',
    photo: '/agents/zakia.jpg',
  },
  'dianwahyuni': {
    name: 'Dian Wahyuni',
    website: 'alhijazindowisatatours.com',
    phone: '6283197968407',
    photo: '/agents/dianwahyuni.jpg',
  },
  'anne': {
    name: 'Anne Suryani',
    website: 'hajialhijaz.com',
    phone: '628129953424',
    photo: '/agents/anne.jpg',
  },
  'evi': {
    name: 'Evi Chaniago',
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
    name: 'Indah Permata',
    website: 'alhijaztraveltour.com',
    phone: '6281943631008',
    photo: '/agents/indah.jpg',
  },
  'aisyah': {
    name: 'Siti Aisyah',
    website: 'travelalhijazumrah.com',
    phone: '6281225600900',
    photo: '/agents/aisyah.jpg',
  },
  'siska': {
    name: 'Siska Fadia',
    website: 'alhijazumroh.com',
    phone: '6281188885291',
    photo: '/agents/siska.jpg',
  },
  'linda': {
    name: 'Nurlinda Dewi',
    website: 'alhijazcallcenter.com',
    phone: '6282112094089',
    photo: '/agents/linda.jpg',
  },
  'nina': {
    name: 'Nina Nasution',
    website: 'alhijazumrahtours.com',
    phone: '6285943191075',
    photo: '/agents/nina.jpg',
  },
  'sari': {
    name: 'Sari Rohayati',
    website: 'miqot.com/sari',
    phone: '6281907018220',
    photo: '/agents/sari.jpg',
  },
};
