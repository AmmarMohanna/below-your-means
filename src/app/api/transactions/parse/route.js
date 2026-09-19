import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isAuthenticated } from '@/lib/auth';
import { createVoiceHandlers } from '@/lib/voice-server';

export const runtime = 'nodejs';

const handlers = createVoiceHandlers({
  isAuthenticated,
  getEnvironment: () => {
    const { env } = getCloudflareContext();
    return {
      OPENAI_API_KEY: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      OPENAI_PARSE_MODEL: env.OPENAI_PARSE_MODEL || process.env.OPENAI_PARSE_MODEL,
      VOICE_RATE_LIMITER: env.VOICE_RATE_LIMITER,
    };
  },
});

export const POST = handlers.parse;
