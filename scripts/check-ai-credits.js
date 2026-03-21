import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function run() {
  // Check if table exists
  const { error } = await supabase.from('ai_credits').select('agent_slug').limit(1);

  if (error && error.code === 'PGRST205') {
    console.log('⚠️  Table ai_credits DOES NOT exist.');
    console.log('\nPlease run this SQL in Supabase Dashboard → SQL Editor:\n');
    console.log(`CREATE TABLE IF NOT EXISTS public.ai_credits (
  agent_slug TEXT PRIMARY KEY REFERENCES public.agents(slug),
  chars_used INTEGER NOT NULL DEFAULT 0,
  first_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON public.ai_credits
  FOR ALL USING (true) WITH CHECK (true);`);
  } else if (!error) {
    console.log('✅ Table ai_credits already exists!');
    const { data } = await supabase.from('ai_credits').select('*');
    console.log('Current rows:', data);
  } else {
    console.log('Other error:', error);
  }
}

run();
