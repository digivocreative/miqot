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
};
