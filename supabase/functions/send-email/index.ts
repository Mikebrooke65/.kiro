// Edge Function: send-email
//
// Generic transactional email sender, used for invite links and (later)
// RSVP reminders and announcements. Templates are built server-side —
// the client sends a `type` plus data, never raw HTML, so a compromised
// client can't send arbitrary content through the club's email domain.
//
// Requires this secret (set via `supabase secrets set`):
//   RESEND_API_KEY
//
// Optional secrets — all have fallbacks, and all exist to keep this
// function CLUB-AGNOSTIC so another club can deploy it unchanged:
//   EMAIL_FROM     e.g. "Club Football <noreply@yourclub.co.nz>"
//   CLUB_NAME      e.g. "West Coast Rangers"   (email header + copy)
//   CLUB_COLOR     e.g. "#0091f3"              (email header background)
//   EMAIL_REPLY_TO e.g. "admin@yourclub.co.nz" (see note below)
//   APP_URL        e.g. "https://clubfootball.app"
//
// SEND-ONLY BY DESIGN: this function never receives mail, so the sending
// domain needs no mailbox — "noreply@" is fine. But note that send-only
// still requires SPF/DKIM DNS records on whatever domain you send from,
// or messages will land in spam. Set EMAIL_REPLY_TO to a real monitored
// address if you want replies to reach a human; otherwise recipients
// replying will get a bounce.
//
// NOTE: Resend's test sender (onboarding@resend.dev) can ONLY deliver to
// the address the Resend account was registered with. Real recipients
// require a verified sending domain.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resend's shared test sender — works with no domain setup, but only
// delivers to the Resend account owner's own email address.
const DEFAULT_FROM = 'Club Football <onboarding@resend.dev>';
const DEFAULT_CLUB_NAME = 'Club Football';
const DEFAULT_CLUB_COLOR = '#0091f3';
// The product domain, deliberately not a club-specific one - this is the
// right default for any club deploying this unchanged. Override with the
// APP_URL secret if a club serves the app from their own domain.
const DEFAULT_APP_URL = 'https://clubfootball.app';

interface TeamInviteData {
  recipientName?: string;
  teamName: string;
  competitionName?: string;
  inviteCode: string;
}

interface EmailRequest {
  type: 'team_invite';
  to: string;
  data: TeamInviteData;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Branding {
  clubName: string;
  clubColor: string;
  appUrl: string;
}

function buildTeamInvite(
  data: TeamInviteData,
  branding: Branding
): { subject: string; html: string; text: string } {
  // Raw values are used for the subject line and the plain-text part.
  // Neither is HTML, so escaping there would leak entities into what the
  // recipient actually reads - a team called "Mike's Team" would arrive
  // as "Mike&#39;s Team".
  const rawTeam = data.teamName;
  const rawCompetition = data.competitionName || null;
  const rawGreeting = data.recipientName || null;
  const inviteUrl = `${branding.appUrl}/invite/${encodeURIComponent(data.inviteCode)}`;

  const teamName = escapeHtml(rawTeam);
  const competitionName = rawCompetition ? escapeHtml(rawCompetition) : null;
  const greetingName = rawGreeting ? escapeHtml(rawGreeting) : null;
  const clubName = escapeHtml(branding.clubName);
  const clubColor = escapeHtml(branding.clubColor);

  const subject = rawCompetition
    ? `You're invited to join ${rawTeam} for ${rawCompetition}`
    : `You're invited to join ${rawTeam}`;

  // A plain-text alternative alongside the HTML. Sending HTML only is a
  // recognised spam signal, and some clients render the text part anyway.
  const text = [
    rawGreeting ? `Hi ${rawGreeting},` : 'Hi,',
    '',
    rawCompetition
      ? `You've been invited to join ${rawTeam} for ${rawCompetition}.`
      : `You've been invited to join ${rawTeam}.`,
    '',
    'Set up your account here:',
    inviteUrl,
    '',
    "Once you're in, you'll be able to see your schedule, get team messages,",
    "and add your own players if you're managing the team.",
    '',
    "If you weren't expecting this invitation, you can safely ignore this email.",
    '',
    branding.clubName,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${clubColor};padding:20px 24px;">
                <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${clubName}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 16px;font-size:16px;color:#111827;">
                  ${greetingName ? `Hi ${greetingName},` : 'Hi,'}
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#374151;">
                  You've been invited to join <strong>${teamName}</strong>${
                    competitionName ? ` for <strong>${competitionName}</strong>` : ''
                  }.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#374151;">
                  Tap the button below to set up your account. Once you're in, you'll be
                  able to see your schedule, get team messages, and add your own players
                  if you're managing the team.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td style="background:${clubColor};border-radius:8px;">
                      <a href="${inviteUrl}"
                         style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">
                        Join ${teamName}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                  Or paste this link into your browser:
                </p>
                <p style="margin:0 0 20px;font-size:13px;word-break:break-all;">
                  <a href="${inviteUrl}" style="color:${clubColor};">${inviteUrl}</a>
                </p>
                <p style="margin:0;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">
                  If you weren't expecting this invitation, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY secret is not set');
    }
    const from = Deno.env.get('EMAIL_FROM') || DEFAULT_FROM;
    const replyTo = Deno.env.get('EMAIL_REPLY_TO') || undefined;
    const branding: Branding = {
      clubName: Deno.env.get('CLUB_NAME') || DEFAULT_CLUB_NAME,
      clubColor: Deno.env.get('CLUB_COLOR') || DEFAULT_CLUB_COLOR,
      appUrl: Deno.env.get('APP_URL') || DEFAULT_APP_URL,
    };

    // Require a caller to be authenticated — this function sends mail on
    // behalf of the club, so it shouldn't be open to anonymous callers.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: EmailRequest = await req.json();

    if (!body?.to || !body?.type) {
      return new Response(JSON.stringify({ error: '`to` and `type` are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let subject: string;
    let html: string;
    let text: string;

    switch (body.type) {
      case 'team_invite': {
        if (!body.data?.teamName || !body.data?.inviteCode) {
          return new Response(
            JSON.stringify({ error: 'team_invite requires data.teamName and data.inviteCode' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        ({ subject, html, text } = buildTeamInvite(body.data, branding));
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown email type: ${body.type}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [body.to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const result = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend send failed:', result);
      return new Response(
        JSON.stringify({ error: result?.message || 'Failed to send email', detail: result }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true, id: result?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('send-email error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
