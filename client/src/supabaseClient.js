import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ralxyszdkjhdlvfmqhzk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhbHh5c3pka2poZGx2Zm1xaHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzU4NjgsImV4cCI6MjEwMjgxMTg2OH0.PgQS4MM7CcFaq5EIVrNCdqiZ14bViC50TjvlydleGE0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
