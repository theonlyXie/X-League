/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard talks to Supabase from the browser with the publishable key,
  // exactly as the app does. There is no server-side secret here and no
  // service-role key anywhere in this project.
  reactStrictMode: true,

  // Next writes AGENTS.md and CLAUDE.md into the project on every dev run.
  // This repository already documents itself in its own files, and generated
  // ones checked in alongside them are noise nobody maintains.
  agentRules: false,
};

export default nextConfig;
