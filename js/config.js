window.APP_CONFIG = {
  SUPABASE_URL: "https://supabase.com/dashboard/project/funxzeajcezhosnbpefc",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1bnh6ZWFqY2V6aG9zbmJwZWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NjEyMjEsImV4cCI6MjEwNTUzNzIyMX0.2q05UhgeEMQJoWNsCOEOsfdMjf407sb-BVb-xIyqz9I"
};

// Initialize Supabase client
window.sb = supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);