import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Delete FK refs for nikitaaa
await sb.from('capi_configs').delete().eq('slug', 'nikitaaa');
await sb.from('jamaah').delete().eq('agent_slug', 'nikitaaa');

// 2. Rename slug back to nikita
const { error } = await sb.from('agents').update({ slug: 'nikita' }).eq('slug', 'nikitaaa');
console.log('Rename nikitaaa → nikita:', error || 'OK');

// 3. Fix photo: copy nikitaaa.jpg → nikita.jpg
const { data: dl } = await sb.storage.from('agent-photos').download('nikitaaa.jpg');
if (dl) {
  const buf = Buffer.from(await dl.arrayBuffer());
  await sb.storage.from('agent-photos').upload('nikita.jpg', buf, { contentType: 'image/jpeg', upsert: true });
  await sb.storage.from('agent-photos').remove(['nikitaaa.jpg']);
  const { data: url } = sb.storage.from('agent-photos').getPublicUrl('nikita.jpg');
  await sb.from('agents').update({ photo: url.publicUrl + '?v=' + Date.now() }).eq('slug', 'nikita');
  console.log('Photo restored to nikita.jpg');
}

console.log('Done!');
