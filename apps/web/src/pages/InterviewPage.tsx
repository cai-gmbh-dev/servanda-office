/**
 * Interview Page — Sprint 9 (Team 04)
 *
 * Guided contract creation flow:
 * - Loads template version + interview flow questions
 * - Question panel with form controls per question type (incl. multiple_choice)
 * - Progress sidebar showing completion
 * - Live-Preview panel showing contract outline
 * - Conditional logic: show/hide/skip questions based on answers
 * - Auto-save (2s debounce) via PATCH /contracts/:id
 * - Validation display (warnings/conflicts)
 * - Keyboard navigation: Enter (next), Shift+Enter (prev), Ctrl+S (save)
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { QuestionInput, evaluateConditions } from '../components/QuestionInput';
import { LivePreviewPanel } from '../components/LivePreviewPanel';
import { useNotifications } from '../hooks/useNotifications';
import type { Question } from '../components/QuestionInput';

interface ContractDetail {
  id: string;
  title: string;
  status: string;
  answers: Record<string, unknown>;
  selectedSlots: Record<string, string>;
  clauseVersionIds?: string[];
  validationState: string;
  validationMessages: Array<{ severity: string; message: string }> | null;
  templateVersionId: string;
}

interface Section {
  title: string;
  slots: Array<{
    clauseId: string;
    type: 'required' | 'optional' | 'alternative';
    alternativeClauseIds?: string[];
  }>;
}

interface TemplateVersionDetail {
  id: string;
  interviewFlowId: string | null;
  structure: Section[];
}

interface InterviewFlowDetail {
  id: string;
  title: string;
  questions: Question[];
}

interface ClausePreview {
  id: string;
  title: string;
  content: string;
}

const AUTO_SAVE_DELAY = 2000;

export function InterviewPage() {
  const { templateId, id } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotifications();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [selectedSlots, setSelectedSlots] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<Section[]>([]);
  const [clausePreviews, setClausePreviews] = useState<Record<string, ClausePreview>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionInputRef = useRef<HTMLDivElement>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const slotsRef = useRef(selectedSlots);
  slotsRef.current = selectedSlots;

  // --- Visible questions (conditional logic) ---
  const visibleQuestions = useMemo(() => {
    return questions.filter((q) => evaluateConditions(q.conditions, answers));
  }, [questions, answers]);

  // --- Initialize ---
  useEffect(() => {
    async function init() {
      try {
        let c: ContractDetail;
        let tvId: string;

        if (id) {
          c = await api.get<ContractDetail>(`/contracts/${id}`);
          tvId = c.templateVersionId;
        } else if (templateId) {
          c = await api.post<ContractDetail>('/contracts', {
            title: 'Neuer Vertrag',
            templateVersionId: templateId,
          });
          tvId = templateId;
        } else {
          setError('Keine Vorlage oder Vertrag angegeben.');
          setLoading(false);
          return;
        }

        setContract(c);
        setAnswers(c.answers ?? {});
        setSelectedSlots((c.selectedSlots as Record<string, string>) ?? {});

        // Load template structure for preview
        try {
          const tv = await api.get<TemplateVersionDetail>(`/content/templates/${tvId}`);
          if (tv?.structure) {
            setSections(tv.structure);
          }

          // Load interview flow
          if (tv?.interviewFlowId) {
            const flow = await api
              .get<InterviewFlowDetail>(`/content/interview-flows/${tv.interviewFlowId}`)
              .catch(() => null);
            if (flow?.questions) {
              setQuestions(flow.questions);
            }
          }
        } catch {
          // Template/flow not available — continue without questions/preview
        }

        // Build clause previews for live preview
        const clauseIds = c.clauseVersionIds;
        if (clauseIds && clauseIds.length > 0) {
          const previews: Record<string, ClausePreview> = {};
          clauseIds.forEach((cvId, idx) => {
            previews[cvId] = { id: cvId, title: `Klausel ${idx + 1}`, content: '' };
          });
          setClausePreviews(previews);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [id, templateId]);

  // --- Auto-Save ---
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!contract) return;
      setSaving(true);
      try {
        await api.patch<ContractDetail>(`/contracts/${contract.id}`, {
          answers: answersRef.current,
          selectedSlots: slotsRef.current,
        });
        notify('success', 'Fortschritt gespeichert', { duration: 3000 });
      } catch {
        // Silent fail — will retry on next change
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY);
  }, [contract, notify]);

  function handleAnswerChange(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    scheduleAutoSave();
  }

  // --- Navigation (respects conditional visibility) ---
  function handleNext() {
    if (currentStep < visibleQuestions.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }

  function handlePrev() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  async function handleComplete() {
    if (!contract) return;
    try {
      await api.patch(`/contracts/${contract.id}`, { answers, selectedSlots });
      const validation = await api.post<{
        validationState: string;
        messages: Array<{ severity: string; message: string }>;
      }>(`/contracts/${contract.id}/validate`, {});
      if (validation.validationState === 'has_conflicts') {
        setError(
          'Vertrag enthält ungelöste Konflikte. Bitte beheben Sie diese vor dem Abschluss.',
        );
        return;
      }
      await api.post(`/contracts/${contract.id}/complete`, {});
      navigate('/contracts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Abschließen');
    }
  }

  // --- Manual save (Ctrl+S) ---
  const handleManualSave = useCallback(async () => {
    if (!contract) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaving(true);
    try {
      await api.patch<ContractDetail>(`/contracts/${contract.id}`, {
        answers: answersRef.current,
        selectedSlots: slotsRef.current,
      });
      setSavedFeedback(true);
      if (savedFeedbackTimerRef.current) clearTimeout(savedFeedbackTimerRef.current);
      savedFeedbackTimerRef.current = setTimeout(() => setSavedFeedback(false), 2000);
      notify('success', 'Fortschritt gespeichert', { duration: 3000 });
    } catch {
      // Silent fail
    } finally {
      setSaving(false);
    }
  }, [contract, notify]);

  // --- Keyboard navigation ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+S: Manual save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }

      // Do not intercept Enter/Shift+Enter inside textareas or select elements
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === 'textarea') return;

      // Enter: Next visible question
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only advance if the current question has been answered
        const currentQ = visibleQuestions[currentStep];
        if (!currentQ) return;
        const currentAnswer = answersRef.current[currentQ.key];
        const isAnswered = currentAnswer !== undefined && currentAnswer !== '' && currentAnswer !== null;
        if (!isAnswered) return;

        e.preventDefault();
        if (currentStep < visibleQuestions.length - 1) {
          setCurrentStep((s) => s + 1);
        }
        return;
      }

      // Shift+Enter: Previous visible question
      if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (currentStep > 0) {
          setCurrentStep((s) => s - 1);
        }
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, visibleQuestions, handleManualSave]);

  // --- Focus management: auto-focus input when question changes ---
  useEffect(() => {
    if (!questionInputRef.current) return;
    // Find the first focusable element inside the question container
    const focusable = questionInputRef.current.querySelector<HTMLElement>(
      'input, select, textarea, [tabindex]',
    );
    if (focusable) {
      // Small delay to let React render the new question
      requestAnimationFrame(() => focusable.focus());
    }
  }, [currentStep]);

  // --- Render ---
  if (loading) return <p aria-live="polite">Vertrag wird geladen...</p>;
  if (error) return <p role="alert" className="error">{error}</p>;

  const currentQuestion = visibleQuestions[currentStep];
  const answeredCount = visibleQuestions.filter(
    (q) => answers[q.key] !== undefined && answers[q.key] !== '',
  ).length;
  const progress =
    visibleQuestions.length > 0
      ? Math.round((answeredCount / visibleQuestions.length) * 100)
      : 0;

  return (
    <div className="interview-layout">
      {/* Progress Sidebar */}
      <aside className="interview-sidebar" aria-label="Fortschritt">
        <h2>Fortschritt</h2>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress}% beantwortet`}
        >
          <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
        </div>
        <p>
          {answeredCount} von {visibleQuestions.length} Fragen beantwortet
        </p>

        {questions.length !== visibleQuestions.length && (
          <p className="conditional-hint">
            {questions.length - visibleQuestions.length} Frage(n) bedingt ausgeblendet
          </p>
        )}

        {saving && (
          <p className="save-indicator" aria-live="polite">
            Wird gespeichert...
          </p>
        )}

        {savedFeedback && !saving && (
          <p className="save-indicator save-indicator--done" aria-live="polite">
            Gespeichert &#10003;
          </p>
        )}

        <nav aria-label="Fragen-Navigation">
          <ol>
            {visibleQuestions.map((q, i) => (
              <li key={q.key}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(i)}
                  className={i === currentStep ? 'active' : ''}
                  aria-current={i === currentStep ? 'step' : undefined}
                >
                  {q.label}
                  {answers[q.key] !== undefined && answers[q.key] !== '' ? ' \u2713' : ''}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      {/* Question Panel */}
      <main
        className="interview-main"
        aria-keyshortcuts="Enter Shift+Enter Control+s"
      >
        <h1>{contract?.title ?? 'Neuer Vertrag'}</h1>

        {visibleQuestions.length === 0 ? (
          <p>Keine Interview-Fragen für diese Vorlage konfiguriert.</p>
        ) : currentQuestion ? (
          <section aria-label={`Frage ${currentStep + 1} von ${visibleQuestions.length}`}>
            <h2>{currentQuestion.label}</h2>
            {currentQuestion.helpText && (
              <p className="help-text">{currentQuestion.helpText}</p>
            )}

            <div ref={questionInputRef}>
              <QuestionInput
                question={currentQuestion}
                value={answers[currentQuestion.key]}
                onChange={(val) => handleAnswerChange(currentQuestion.key, val)}
              />
            </div>

            <div className="interview-actions">
              <button type="button" onClick={handlePrev} disabled={currentStep === 0}>
                Zurueck
              </button>
              {currentStep < visibleQuestions.length - 1 ? (
                <button type="button" onClick={handleNext}>
                  Weiter
                </button>
              ) : (
                <button type="button" onClick={handleComplete} className="primary">
                  Vertrag abschliessen
                </button>
              )}
            </div>

            <p className="keyboard-hints" aria-hidden="true">
              <kbd>Enter</kbd> Weiter &middot; <kbd>Shift+Enter</kbd> Zurueck &middot; <kbd>Ctrl+S</kbd> Speichern
            </p>
          </section>
        ) : null}

        {/* Validation Messages */}
        {contract?.validationMessages && contract.validationMessages.length > 0 && (
          <section aria-label="Validierungsmeldungen" className="validation-panel">
            <h3>Hinweise</h3>
            <ul>
              {contract.validationMessages.map((msg, i) => (
                <li key={i} className={`validation-msg validation-msg--${msg.severity}`}>
                  {msg.severity === 'hard' ? 'Konflikt: ' : 'Warnung: '}
                  {msg.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Live Preview Panel */}
      <LivePreviewPanel
        contractTitle={contract?.title ?? 'Neuer Vertrag'}
        sections={sections}
        answers={answers}
        selectedSlots={selectedSlots}
        clausePreviews={clausePreviews}
      />
    </div>
  );
}
