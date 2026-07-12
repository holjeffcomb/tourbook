// parse-tour: turns a pasted block of text (tour poster, listing, email, etc.)
// into a structured tour + stops using an LLM with a strict JSON schema.
//
// This runs server-side so the OpenAI API key never ships in the app bundle.
// It only extracts and returns structured data — it never writes to the
// database. The client shows the result for review before anything is created.
//
// Secrets (set via `supabase secrets set` or supabase/functions/.env locally):
//   OPENAI_API_KEY  (required)
//   OPENAI_MODEL    (optional, defaults below)

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_INPUT_CHARS = 12_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Strict JSON schema the model must conform to. Every property is required and
// additionalProperties is false (required for OpenAI strict mode); optional
// values are expressed as nullable types instead.
const tourSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    actName: {
      type: 'string',
      description: 'The performing act / band / artist name. Empty string if not found.',
    },
    tourTitle: {
      type: ['string', 'null'],
      description: 'The tour name if present, otherwise null.',
    },
    stops: {
      type: 'array',
      description: 'One entry per show/date found in the text.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: {
            type: ['string', 'null'],
            description:
              'Show date as YYYY-MM-DD. Prefer an explicit year; otherwise assume the soonest occurrence on or after today (do not default to a past year). Null only if the month/day cannot be determined.',
          },
          venueName: {
            type: 'string',
            description: 'Venue name. Empty string if only a city is given.',
          },
          city: {
            type: 'string',
            description: 'City (and region/country if available), e.g. "Morrison, CO".',
          },
        },
        required: ['date', 'venueName', 'city'],
      },
    },
  },
  required: ['actName', 'tourTitle', 'stops'],
} as const;

// Built per-request so the model knows the current date. LLMs have no inherent
// sense of "today", so without this an undated month/day defaults to a year from
// the model's training era (often in the past) rather than the upcoming tour.
function buildSystemPrompt(today: string): string {
  return [
    'You extract structured tour data from free-form text such as concert posters,',
    'listings, itineraries, or emails.',
    'Return the performing act, the tour title (if any), and every show as a stop',
    'with its date, venue, and city.',
    `Today's date is ${today}.`,
    'Dates must be YYYY-MM-DD. Determine each year in this priority order:',
    '(1) an explicit year in the text (a heading, tour name, or the date itself);',
    '(2) if a weekday is given but no year, pick the soonest year on or after today',
    'whose calendar puts that month/day on that weekday;',
    '(3) otherwise assume the soonest occurrence on or after today, since tours are',
    'normally upcoming — do NOT default to a past year.',
    'Keep a multi-month tour contiguous (e.g. a Dec date followed by a Jan date rolls',
    'into the next year). Use null for a date only when the month/day cannot be found.',
    'Do not invent shows, venues, or dates that are not supported by the text.',
    'Ignore ticket prices, ages, promoters, and other non-show text.',
  ].join(' ');
}

// Verify the caller against the auth server directly. We don't use the
// platform's verify_jwt because it only validates the legacy symmetric secret,
// while user sessions are signed with asymmetric keys. Hitting /auth/v1/user
// validates any signing algorithm and works identically locally and hosted.
async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!res.ok) return null;

  const user = (await res.json()) as { id?: string };
  return user.id ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Not authenticated' }, 401);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_API_KEY is not configured' }, 500);
  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL;

  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return json({ error: 'Provide non-empty "text" to parse.' }, 400);
  }

  const input = text.slice(0, MAX_INPUT_CHARS);
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = buildSystemPrompt(today);

  let openaiRes: Response;
  try {
    openaiRes = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'tour', schema: tourSchema, strict: true },
        },
      }),
    });
  } catch (err) {
    return json({ error: `Failed to reach the model: ${String(err)}` }, 502);
  }

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    return json({ error: `Model request failed (${openaiRes.status})`, detail }, 502);
  }

  const completion = await openaiRes.json();
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return json({ error: 'Model returned no content' }, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return json({ error: 'Model returned malformed JSON' }, 502);
  }

  return json(parsed, 200);
});
