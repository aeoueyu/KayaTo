import { ArrowRight, Check, FileText, NotebookPen, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';
import KayaMascot from '../components/KayaMascot';
import { api, errorMessage } from '../lib/api';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_BRIEF_CHARACTERS = 5_000;
const formatFileSize = (bytes) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function AIPlanner() {
  const [brief, setBrief] = useState('');
  const [file, setFile] = useState(null);
  const [plan, setPlan] = useState([]);
  const [error, setError] = useState('');
  const [fileNotice, setFileNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectFile = async (event) => {
    const picked = event.target.files[0];
    setError('');
    setFileNotice('');
    if (!picked) return;
    if (picked.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      event.target.value = '';
      setError(`Choose a file smaller than ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    try {
      const rawText = await picked.text();
      const readableText = rawText
        .replace(/\0/g, '')
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
        .replace(/\r/g, '')
        .trim();
      const readableCharacters = readableText.match(/[\p{L}\p{N}]/gu)?.length || 0;
      if (readableCharacters < 20) {
        setFile(null);
        event.target.value = '';
        setError('This file does not contain enough readable text. Choose another file or paste the project brief below.');
        return;
      }

      const importedText = readableText.slice(0, MAX_BRIEF_CHARACTERS);
      setFile(picked);
      setBrief(importedText);
      setFileNotice(readableText.length > MAX_BRIEF_CHARACTERS
        ? `Imported the first ${MAX_BRIEF_CHARACTERS.toLocaleString()} characters.`
        : 'Readable text imported into your brief.');
    } catch {
      setFile(null);
      event.target.value = '';
      setError('This file could not be read. Choose another file or paste the project brief below.');
    }
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const { data } = await api.post('/planner/generate', { text: brief });
      setPlan(data.tasks);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await Promise.all(plan.map((task) => api.post('/tasks', {
        ...task,
        project: 'AI Planner',
        taskType: 'personal',
        aiGenerated: true,
      })));
      setSaved(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-block">
      <div className="page-heading">
        <div>
          <h1>Project planner</h1>
          <p>Turn a brief into a reviewable task breakdown. Nothing is saved until you confirm it.</p>
        </div>
      </div>

      <div className="planner-layout">
        <section className="panel planner-form">
          <label className={`upload-zone ${file ? 'has-file' : ''}`}>
            <input type="file" onChange={selectFile} aria-describedby="planner-file-help" />
            {file ? (
              <>
                <FileText size={22} />
                <div><b>{file.name}</b><small>{formatFileSize(file.size)}, {fileNotice}</small></div>
                <Check size={19} />
              </>
            ) : (
              <>
                <Upload size={24} />
                <b>Choose any file up to {MAX_FILE_SIZE_MB} MB</b>
                <small id="planner-file-help">Readable text will be imported into your project brief.</small>
              </>
            )}
          </label>

          <label className="field-label">
            Project brief
            <textarea
              rows="12"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Describe the project requirements, outputs, deadlines, and constraints."
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" disabled={busy || brief.trim().length < 20} onClick={generate}>
            {busy ? 'Preparing plan...' : <>Generate plan <ArrowRight size={17} /></>}
          </button>
        </section>

        <aside className={`panel plan-preview ${plan.length ? 'generated' : ''}`}>
          <header className="planner-sheet-header">
            <span className="planner-sheet-icon" aria-hidden="true"><NotebookPen size={19} /></span>
            <div>
              <h2>Draft plan</h2>
              <p>{plan.length ? `${plan.length} tasks ready to review` : 'Your generated tasks will be organized here'}</p>
            </div>
          </header>

          <div className="preview-empty">
            <KayaMascot size={58} className="planner-kaya-mascot" decorative />
            <h2>{plan.length ? 'Review your draft' : 'Start with your project brief'}</h2>
            <p>{plan.length ? 'Edit any task title before adding the plan to your workspace.' : 'Add enough detail about the goal, deadline, and expected output, then generate your plan.'}</p>
          </div>

          {plan.length > 0 && (
            <div className="ai-task-list">
              {plan.map((task, index) => (
                <article key={index}>
                  <span>{index + 1}</span>
                  <div>
                    <input
                      aria-label={`Task ${index + 1} title`}
                      value={task.title}
                      onChange={(event) => setPlan((current) => current.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, title: event.target.value } : item
                      )))}
                    />
                    <small>{task.estimatedHours} estimated hours, {task.priority} priority</small>
                  </div>
                  <i aria-hidden="true"><Sparkles size={14} /></i>
                </article>
              ))}
              <button className="button button-primary button-full" onClick={create} disabled={busy || saved}>
                {saved ? 'Tasks created' : 'Create tasks'}
              </button>
              {saved && <p className="form-message">Your generated tasks are now in My tasks.</p>}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
