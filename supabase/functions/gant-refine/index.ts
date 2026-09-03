// Edge Function: gant-refine
//
// Progress Notes (internal name "Gant") — the AI coaching feedback refinement
// call. Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 2).
//
// Two modes:
//   - mode: 'review'    — turn a coach's accumulated raw input (original
//                          capture + any "Work on" rounds) into either a
//                          refined, club-standard piece of feedback, or a
//                          clarifying question when Gant can't confidently
//                          produce one (design.md Section 4.3, requirements.md
//                          Section 4).
//   - mode: 'summarize'  — synthesise a player's last ~10 approved notes into
//                          a short overview for the top of their Progress
//                          Notes feed (Requirement 7, cached-on-approval —
//                          this function does not decide caching, the caller
//                          does, by only invoking this at Tick-time).
//
// GUARDRAILS: read fresh from `gant_guardrails` (migration 071) on every
// request — never hardcoded, never baked into this file — so editing that
// row changes behaviour immediately with no redeploy (Requirement 9.2). This
// is the placeholder draft (docs/project/GANT-PLACEHOLDER-GUARDRAILS.md) until
// real coach input replaces it; this function has no opinion on that content.
//
// PRIVACY (Requirement 8.1, 8.4): only a `subjectUserId` and note text/tags/
// dates ever reach Anthropic. No name, email, phone, or DOB is accepted by
// this function's request shape at all — there is nothing to strip because
// the client-side callers (Task 5's capture sheet, Task 3's review screen)
// never collect or send those fields in the first place. `recentHistory` for
// progression awareness (Requirement 4.9) is the same shape — text/tags/dates
// only, User-ID-keyed upstream by the caller.
//
// DISCLOSURE (Requirement 6.4/6.4b): this function is reachable only by an
// authenticated coach/manager-with-coach-authority/admin (checked below,
// mirroring the write-access rule for game_feedback and the Coaching tab). A
// coach/admin may see "Gant" named in their own UI — that's a client-side
// copy decision, irrelevant to this function. What this function enforces is
// narrower and non-negotiable: it is simply never reachable by an ordinary
// player/caregiver, since Gant is never disclosed to them at all.
//
// Requires (set via `supabase secrets set`): ANTHROPIC_API_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge
// Function automatically.
//
// DEPLOYMENT: Edge Functions do NOT ship with `git push`. This call fails
// until `supabase functions deploy gant-refine` has been run.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Overridable via the CLAUDE_MODEL secret without a code change if Anthropic
// renames/deprecates a model — avoids a redeploy just to bump a model string.
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Same lightweight JWT-sub extraction used by remove-team-member /
// link-player-caregiver — the real authorization gate is the DB role check
// below, not the token's signature (Supabase's gateway already verified it
// before this function runs).
function extractCallerId(authHeader: string): string | null {
  const token = authHeader.replace('Bearer ', '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

interface RecentHistoryItem {
  text: string;
  phaseTags: string[];
  date: string;
}

interface ReviewRequest {
  mode: 'review';
  scope: 'team' | 'player';
  subjectUserId?: string; // required when scope === 'player'; never a name (Req 8.1)
  eventType?: 'game' | 'training' | 'video_review';
  rounds: string[]; // accumulated raw input, oldest first — never empty
  recentHistory?: RecentHistoryItem[]; // Req 4.9, player scope only
}

interface SummarizeRequest {
  mode: 'summarize';
  subjectUserId: string;
  notes: RecentHistoryItem[]; // the player's last ~10 approved notes
}

type GantRequest = ReviewRequest | SummarizeRequest;

interface ReviewResponse {
  kind: 'refined' | 'question';
  text: string;
  phaseTags?: string[];
}

interface PhaseOfPlay {
  name: string;
  definition: string;
}
interface PhaseBand {
  band: string;
  phases: PhaseOfPlay[];
}
interface Guardrails {
  phases_of_play: PhaseBand[];
  feedback_model: string;
  tone_guide: string;
  continuity_language: string;
  system_prompt_override: string | null;
}

async function fetchGuardrails(supabaseUrl: string, serviceKey: string): Promise<Guardrails> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/gant_guardrails?id=eq.true&select=phases_of_play,feedback_model,tone_guide,continuity_language,system_prompt_override`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
  );
  const rows = await resp.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    // Defensive fallback if the guardrails row was ever deleted — Gant should
    // degrade to generic behaviour, not crash, but this should never happen
    // in practice since migration 071 seeds the row and it is never deleted
    // by any code path in this build.
    return {
      phases_of_play: [],
      feedback_model: 'Give clear, specific, development-focused feedback.',
      tone_guide: 'Be encouraging and specific. Avoid vague or generic phrasing.',
      continuity_language: '',
      system_prompt_override: null,
    };
  }
  return row as Guardrails;
}

function buildSystemPrompt(guardrails: Guardrails): string {
  if (guardrails.system_prompt_override) {
    return guardrails.system_prompt_override;
  }

  const phasesText = guardrails.phases_of_play
    .map(
      (band) =>
        `${band.band}:\n` +
        band.phases.map((p) => `  - ${p.name}: ${p.definition}`).join('\n')
    )
    .join('\n\n');

  return [
    'You are a backstage assistant that helps a football (soccer) coach refine',
    "their raw, dictated or typed observations into clear, club-standard coaching",
    'feedback about a player or a team. You never post feedback yourself — the',
    'coach always reviews and approves your output before it is saved.',
    '',
    '## Phases of play (use these to tag and structure feedback where relevant)',
    phasesText || '(none defined yet)',
    '',
    '## Feedback model',
    guardrails.feedback_model,
    '',
    '## Tone and phrasing guide',
    guardrails.tone_guide,
    '',
    '## Referencing a player\'s recent history',
    guardrails.continuity_language ||
      'Only reference past feedback when genuinely relevant; do not force it.',
    '',
    '## Your task',
    'Given the coach\'s raw input (and, for an individual player, their recent',
    'note history), respond with EXACTLY ONE of the following, as raw JSON with',
    'no surrounding markdown or commentary:',
    '',
    '{"kind": "refined", "text": "<refined feedback>", "phaseTags": ["<phase name>", ...]}',
    '',
    'OR, only when the raw input is genuinely too ambiguous to refine confidently',
    '(e.g. it does not make clear which phase of play or what specific observation',
    'is meant):',
    '',
    '{"kind": "question", "text": "<one short clarifying question for the coach>"}',
    '',
    'Rules:',
    '- Prefer "refined" whenever you can produce a reasonable, specific piece of',
    '  feedback. Only ask a question when you genuinely cannot.',
    '- All-positive feedback is allowed and expected when that is the honest',
    '  observation — never invent a "work on" to force a balanced structure.',
    '- Clean up filler, false starts, and repeated words from dictation, but keep',
    '  the coach\'s own voice and meaning.',
    '- Never mention that you are an AI, a model, or named "Gant" inside the',
    '  refined text itself — the coach may know Gant\'s name in their own UI, but',
    '  the feedback text itself is written as if by the coach.',
    '- phaseTags should be phase names drawn from the list above where they',
    '  genuinely apply; it is fine for this to be an empty array.',
  ].join('\n');
}

function buildReviewUserMessage(req: ReviewRequest): string {
  const lines: string[] = [];
  lines.push(`Scope: ${req.scope}${req.eventType ? ` (${req.eventType})` : ''}`);
  lines.push('');
  lines.push('Coach\'s input so far (in order, earliest first):');
  req.rounds.forEach((round, i) => {
    lines.push(`${i + 1}. ${round}`);
  });

  if (req.scope === 'player' && req.recentHistory && req.recentHistory.length > 0) {
    lines.push('');
    lines.push("This player's recent approved notes (most recent last):");
    req.recentHistory.forEach((h) => {
      lines.push(`- [${h.date}]${h.phaseTags.length ? ` (${h.phaseTags.join(', ')})` : ''} ${h.text}`);
    });
  }

  return lines.join('\n');
}

function buildSummarizeSystemPrompt(guardrails: Guardrails): string {
  return [
    'You are a backstage assistant that writes a short, warm, plain-language',
    'summary of a football player\'s recent coaching feedback, for their own',
    'Progress Notes feed (read by the player and/or their caregiver).',
    '',
    guardrails.tone_guide,
    '',
    'Respond with EXACTLY the following JSON, no surrounding markdown:',
    '{"summaryText": "<2-4 sentence summary>"}',
    '',
    'Rules:',
    '- Write it as an overview a parent or the player themselves could read and',
    '  understand immediately — no jargon, no phase-of-play codes.',
    '- Never mention that you are an AI or named "Gant".',
    '- If the notes are mostly positive, say so plainly; do not invent concerns.',
  ].join('\n');
}

function buildSummarizeUserMessage(req: SummarizeRequest): string {
  const lines: string[] = ["Player's recent approved notes (most recent last):"];
  req.notes.forEach((n) => {
    lines.push(`- [${n.date}]${n.phaseTags.length ? ` (${n.phaseTags.join(', ')})` : ''} ${n.text}`);
  });
  return lines.join('\n');
}

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  userMessage: string
): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: system,
          // Prompt caching (Req 10.3/9.3 in the original Gant docs) — the
          // guardrails-derived system prompt is large and reused on every
          // request, so mark it cacheable to reduce latency/cost.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const result = await resp.json();

  if (!resp.ok) {
    console.error('Anthropic API error:', result);
    throw new Error(result?.error?.message || 'Anthropic API request failed');
  }

  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected Anthropic response shape');
  }
  return text;
}

// Claude is asked for raw JSON but may still wrap it in ```json fences or add
// stray whitespace — strip defensively before parsing rather than trusting
// the model's formatting perfectly every time.
function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(cleaned) as T;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const model = Deno.env.get('CLAUDE_MODEL') || DEFAULT_MODEL;

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY secret is not set');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'No authorization header' }, 401);
    }

    const callerId = extractCallerId(authHeader);
    if (!callerId) {
      return json({ error: 'Could not extract user ID from token' }, 401);
    }

    const svHeaders = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

    // Disclosure/write-authority gate (Requirement 6.2/6.4): only an admin,
    // a coach, or a manager holding coach authority on some team may reach
    // Gant at all — the same rule as the Coaching tab and game_feedback's
    // write access. An ordinary player/caregiver's token is rejected here,
    // before any guardrails or Anthropic call happens.
    const roleResp = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${callerId}&select=role`,
      { headers: svHeaders }
    );
    const roleRows = await roleResp.json();
    const globalRole = Array.isArray(roleRows) ? roleRows[0]?.role : null;
    let authorized = globalRole === 'admin' || globalRole === 'coach';

    if (!authorized) {
      const coachAuthorityResp = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${callerId}&or=(role.eq.coach,role.eq.manager,is_coach.eq.true)&select=id&limit=1`,
        { headers: svHeaders }
      );
      const coachAuthorityRows = await coachAuthorityResp.json();
      authorized = Array.isArray(coachAuthorityRows) && coachAuthorityRows.length > 0;
    }

    if (!authorized) {
      return json({ error: 'Coach, Manager, or Admin access required' }, 403);
    }

    const body = (await req.json()) as GantRequest;
    if (!body?.mode) {
      return json({ error: '`mode` is required' }, 400);
    }

    const guardrails = await fetchGuardrails(SUPABASE_URL, SERVICE_KEY);

    if (body.mode === 'review') {
      if (!Array.isArray(body.rounds) || body.rounds.length === 0) {
        return json({ error: 'review requires a non-empty `rounds` array' }, 400);
      }
      if (body.scope === 'player' && !body.subjectUserId) {
        return json({ error: 'review with scope "player" requires `subjectUserId`' }, 400);
      }

      const system = buildSystemPrompt(guardrails);
      const userMessage = buildReviewUserMessage(body);
      const raw = await callAnthropic(ANTHROPIC_API_KEY, model, system, userMessage);

      let parsed: ReviewResponse;
      try {
        parsed = parseJsonResponse<ReviewResponse>(raw);
      } catch (parseError) {
        console.error('Failed to parse Gant review response:', raw, parseError);
        throw new Error('Gant returned an unexpected response — please try again');
      }

      if (parsed.kind !== 'refined' && parsed.kind !== 'question') {
        throw new Error('Gant returned an invalid response shape — please try again');
      }

      return json(parsed);
    }

    if (body.mode === 'summarize') {
      if (!body.subjectUserId) {
        return json({ error: 'summarize requires `subjectUserId`' }, 400);
      }
      if (!Array.isArray(body.notes) || body.notes.length === 0) {
        return json({ error: 'summarize requires a non-empty `notes` array' }, 400);
      }

      const system = buildSummarizeSystemPrompt(guardrails);
      const userMessage = buildSummarizeUserMessage(body);
      const raw = await callAnthropic(ANTHROPIC_API_KEY, model, system, userMessage);

      let parsed: { summaryText: string };
      try {
        parsed = parseJsonResponse<{ summaryText: string }>(raw);
      } catch (parseError) {
        console.error('Failed to parse Gant summarize response:', raw, parseError);
        throw new Error('Gant returned an unexpected response — please try again');
      }

      if (typeof parsed.summaryText !== 'string') {
        throw new Error('Gant returned an invalid response shape — please try again');
      }

      return json(parsed);
    }

    return json({ error: `Unknown mode: ${(body as { mode: string }).mode}` }, 400);
  } catch (error) {
    console.error('gant-refine error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});
