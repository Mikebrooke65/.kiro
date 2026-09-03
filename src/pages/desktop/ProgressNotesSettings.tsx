import { useEffect, useState } from 'react';
import { gantApi, type GantOutcomeExportRow } from '../../lib/gant-api';
import type { GantGuardrails, GantPhaseBand } from '../../types/database';
import { ExportButton } from '../../components/reporting/ExportButton';

// Progress Notes accent (matches the mobile-side Gant/Progress Notes branding).
const ACCENT = '#d97706';

/**
 * Admin-only desktop page for the Progress Notes (internal name "Gant")
 * guardrails and usage data. Spec: .kiro/specs/gant-ai-feedback-assistant/
 * (Task 8). Admin gating is inherited from the `/desktop` route guard plus
 * the RLS on gant_guardrails (admin write) and gant_outcomes (admin read) —
 * this page adds no guard of its own.
 *
 * Workflow (decided with the repo owner, external-Claude approach):
 *  - Edit the guardrails inline and Save (takes effect on Gant's next call,
 *    no redeploy).
 *  - Copy sections (or everything, with a ready-made prompt) out to Claude,
 *    refine there, paste each refined section back into its labelled box.
 *  - Export the usage CSV to feed Claude the "how is it being used" signal.
 */
export function ProgressNotesSettings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable guardrails state.
  const [feedbackModel, setFeedbackModel] = useState('');
  const [toneGuide, setToneGuide] = useState('');
  const [continuityLanguage, setContinuityLanguage] = useState('');
  const [phases, setPhases] = useState<GantPhaseBand[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Save state.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Usage-data export.
  const [outcomes, setOutcomes] = useState<GantOutcomeExportRow[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(true);

  // Transient "Copied!" feedback, keyed by which button was clicked.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const g = await gantApi.getGuardrails();
        if (cancelled) return;
        if (g) applyGuardrails(g);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the guardrails.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadOutcomes() {
      setOutcomesLoading(true);
      try {
        const rows = await gantApi.getOutcomesForExport();
        if (!cancelled) setOutcomes(rows);
      } catch {
        // Non-fatal — the export button simply stays disabled (no rows).
        if (!cancelled) setOutcomes([]);
      } finally {
        if (!cancelled) setOutcomesLoading(false);
      }
    }

    load();
    loadOutcomes();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyGuardrails(g: GantGuardrails) {
    setFeedbackModel(g.feedback_model ?? '');
    setToneGuide(g.tone_guide ?? '');
    setContinuityLanguage(g.continuity_language ?? '');
    setPhases(Array.isArray(g.phases_of_play) ? g.phases_of_play : []);
    setUpdatedAt(g.updated_at ?? null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await gantApi.updateGuardrails({
        feedback_model: feedbackModel,
        tone_guide: toneGuide,
        continuity_language: continuityLanguage,
        phases_of_play: phases,
      });
      applyGuardrails(updated);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
    } catch {
      setSaveError('Could not copy to the clipboard — your browser may have blocked it.');
    }
  }

  // -- Phase editor helpers --------------------------------------------------

  function updateBandLabel(bandIdx: number, label: string) {
    setPhases((prev) => prev.map((b, i) => (i === bandIdx ? { ...b, band: label } : b)));
  }
  function updatePhase(bandIdx: number, phaseIdx: number, field: 'name' | 'definition', value: string) {
    setPhases((prev) =>
      prev.map((b, i) =>
        i === bandIdx
          ? { ...b, phases: b.phases.map((p, j) => (j === phaseIdx ? { ...p, [field]: value } : p)) }
          : b
      )
    );
  }
  function addPhase(bandIdx: number) {
    setPhases((prev) =>
      prev.map((b, i) => (i === bandIdx ? { ...b, phases: [...b.phases, { name: '', definition: '' }] } : b))
    );
  }
  function removePhase(bandIdx: number, phaseIdx: number) {
    setPhases((prev) =>
      prev.map((b, i) => (i === bandIdx ? { ...b, phases: b.phases.filter((_, j) => j !== phaseIdx) } : b))
    );
  }
  function addBand() {
    setPhases((prev) => [...prev, { band: '', phases: [] }]);
  }
  function removeBand(bandIdx: number) {
    setPhases((prev) => prev.filter((_, i) => i !== bandIdx));
  }

  // -- Copy text builders ----------------------------------------------------

  function guardrailsAsText(): string {
    const phaseText = phases
      .map((b) => {
        const rows = b.phases.map((p) => `  - ${p.name}: ${p.definition}`).join('\n');
        return `${b.band}:\n${rows}`;
      })
      .join('\n\n');

    return [
      '=== FEEDBACK MODEL ===',
      feedbackModel.trim(),
      '',
      '=== TONE GUIDE ===',
      toneGuide.trim(),
      '',
      '=== CONTINUITY LANGUAGE ===',
      continuityLanguage.trim(),
      '',
      '=== PHASES OF PLAY ===',
      phaseText,
    ].join('\n');
  }

  function claudePrompt(): string {
    return [
      'The text below is the guardrails for our club\'s AI coaching-feedback assistant. It defines how the assistant turns a coach\'s rough note about a youth football player (or team) into clear, encouraging written feedback for players and parents.',
      '',
      'Please review it and suggest refinements to the wording — clearer, warmer, more practical for youth coaches — WITHOUT changing the underlying philosophy unless you spot a genuine problem. Keep the exact section headings ("=== ... ===") and the overall structure, so I can paste each refined section straight back into our editor. For PHASES OF PLAY, keep the "band:" then "- name: definition" shape.',
      '',
      'I can also give you a CSV of how coaches have actually been using it (how many refinement rounds each note took, and whether the coach accepted or rejected the result) — tell me if that would help you spot what is or isn\'t landing.',
      '',
      '--- CURRENT GUARDRAILS ---',
      '',
      guardrailsAsText(),
    ].join('\n');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
      </div>
    );
  }

  const outcomeColumns = [
    { key: 'date', label: 'Date (UTC)' },
    { key: 'team', label: 'Team' },
    { key: 'player', label: 'Player' },
    { key: 'scope', label: 'Scope' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'rounds', label: 'Rounds' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-l-4 pl-4" style={{ borderColor: ACCENT }}>
        <h1 className="text-2xl font-bold text-gray-900">Progress Notes</h1>
        <p className="text-sm text-gray-600 mt-1">
          The guardrails that shape how the AI coaching helper (internally, "Gant") writes feedback, plus
          the usage data behind it. Editing the guardrails takes effect immediately — no app update needed.
        </p>
        {updatedAt && (
          <p className="text-xs text-gray-500 mt-1">
            Guardrails last updated {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {loadError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{loadError}</div>
      )}

      {/* Panel 1 — Guardrails editor */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Guardrails</h2>
          <SecondaryCopyButton
            label={copiedKey === 'all' ? 'Copied!' : 'Copy all'}
            onClick={() => copy('all', guardrailsAsText())}
          />
        </div>

        <EditableSection
          title="Feedback model"
          hint="What every note should do — name the strength/work-on, tie it to a phase, give a next step where there's a genuine one."
          value={feedbackModel}
          onChange={setFeedbackModel}
          onCopy={() => copy('fm', `=== FEEDBACK MODEL ===\n${feedbackModel.trim()}`)}
          copied={copiedKey === 'fm'}
        />

        <EditableSection
          title="Tone guide"
          hint="The language Gant leans into and avoids, and how directness scales with age."
          value={toneGuide}
          onChange={setToneGuide}
          onCopy={() => copy('tg', `=== TONE GUIDE ===\n${toneGuide.trim()}`)}
          copied={copiedKey === 'tg'}
        />

        <EditableSection
          title="Continuity language"
          hint="How Gant references a player's recent history — only when genuinely relevant."
          value={continuityLanguage}
          onChange={setContinuityLanguage}
          onCopy={() => copy('cl', `=== CONTINUITY LANGUAGE ===\n${continuityLanguage.trim()}`)}
          copied={copiedKey === 'cl'}
        />

        {/* Phases of play — structured editor */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Phases of play</h3>
            <p className="text-xs text-gray-500">
              The age-banded "where it happened" tags Gant assigns. Edited here directly (this framework
              changes rarely).
            </p>
          </div>

          {phases.map((band, bandIdx) => (
            <div key={bandIdx} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={band.band}
                  onChange={(e) => updateBandLabel(bandIdx, e.target.value)}
                  placeholder="Age band label (e.g. Younger (U7–U10))"
                  className="flex-1 text-sm font-medium border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2"
                  style={{ ['--tw-ring-color' as string]: ACCENT }}
                />
                <button
                  onClick={() => removeBand(bandIdx)}
                  className="text-xs text-red-600 hover:text-red-700 px-2 py-1"
                >
                  Remove band
                </button>
              </div>

              <div className="space-y-2 pl-2">
                {band.phases.map((phase, phaseIdx) => (
                  <div key={phaseIdx} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={phase.name}
                      onChange={(e) => updatePhase(bandIdx, phaseIdx, 'name', e.target.value)}
                      placeholder="Phase name"
                      className="w-48 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2"
                      style={{ ['--tw-ring-color' as string]: ACCENT }}
                    />
                    <input
                      type="text"
                      value={phase.definition}
                      onChange={(e) => updatePhase(bandIdx, phaseIdx, 'definition', e.target.value)}
                      placeholder="Definition"
                      className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2"
                      style={{ ['--tw-ring-color' as string]: ACCENT }}
                    />
                    <button
                      onClick={() => removePhase(bandIdx, phaseIdx)}
                      className="text-gray-400 hover:text-red-600 px-1 py-1.5"
                      title="Remove phase"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addPhase(bandIdx)}
                  className="text-xs font-medium hover:underline"
                  style={{ color: ACCENT }}
                >
                  + Add phase
                </button>
              </div>
            </div>
          ))}

          <button onClick={addBand} className="text-sm font-medium hover:underline" style={{ color: ACCENT }}>
            + Add age band
          </button>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {saving ? 'Saving…' : 'Save guardrails'}
          </button>
          {savedAt && !saveError && <span className="text-sm text-green-700">Saved — live on Gant's next note.</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      </section>

      {/* Panel 2 — Refine with Claude */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Refine the guardrails with Claude</h2>
        <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
          <li>Copy the guardrails and a ready-made prompt below, and paste it into Claude.</li>
          <li>Optionally download the usage CSV and share it with Claude as a signal of what's landing.</li>
          <li>Discuss and refine, then paste each refined section back into its box above and Save.</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => copy('prompt', claudePrompt())}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: ACCENT }}
          >
            {copiedKey === 'prompt' ? 'Copied prompt!' : 'Copy guardrails + prompt for Claude'}
          </button>
        </div>
      </section>

      {/* Panel 3 — Usage data */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Usage data</h2>
        <p className="text-sm text-gray-600">
          Every time a coach accepts (✓) or discards (✗) a Gant draft, it's logged — with how many refinement
          rounds it took, the team, and (for individual notes) the player. Export it to review how Gant is being
          used or to hand to Claude alongside the prompt above. No names of the feedback itself are included —
          only the outcome, counts, and dates.
        </p>
        <div className="flex items-center gap-4">
          <ExportButton
            format="csv"
            data={outcomes}
            columns={outcomeColumns}
            filename={`progress-notes-usage-${new Date().toISOString().slice(0, 10)}`}
          />
          <span className="text-sm text-gray-500">
            {outcomesLoading ? 'Loading…' : `${outcomes.length} recorded ${outcomes.length === 1 ? 'outcome' : 'outcomes'}`}
          </span>
        </div>
      </section>
    </div>
  );
}

// -- Small building blocks ---------------------------------------------------

function EditableSection({
  title,
  hint,
  value,
  onChange,
  onCopy,
  copied,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{hint}</p>
        </div>
        <SecondaryCopyButton label={copied ? 'Copied!' : 'Copy'} onClick={onCopy} />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
        style={{ ['--tw-ring-color' as string]: ACCENT }}
      />
    </div>
  );
}

function SecondaryCopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium px-2.5 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
    >
      {label}
    </button>
  );
}
