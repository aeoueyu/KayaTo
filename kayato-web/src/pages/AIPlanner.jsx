import { ArrowRight, Check, FileText, NotebookPen, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import KayaMascot from '../components/KayaMascot';
import { api, errorMessage } from '../lib/api';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_BRIEF_CHARACTERS = 5_000;
const MAX_SOURCE_CHARACTERS = 60_000;
const formatFileSize = (bytes) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const isPdfFile = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
const cleanImportedText = (value) => value
  .replace(/\0/g, '')
  .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/[^\S\r\n]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

async function extractPdfText(file) {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await loadingTask.promise;
    const pages = [];
    let extractedCharacters = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => {
        if (!('str' in item)) return '';
        return `${item.str}${item.hasEOL ? '\n' : ' '}`;
      }).join('');
      pages.push(pageText);
      extractedCharacters += pageText.length;
      page.cleanup();
      if (extractedCharacters >= MAX_SOURCE_CHARACTERS) break;
    }

    return cleanImportedText(pages.join('\n\n'));
  } finally {
    await loadingTask.destroy();
  }
}

export default function AIPlanner() {
  const [brief, setBrief] = useState('');
  const [file, setFile] = useState(null);
  const [plan, setPlan] = useState([]);
  const [error, setError] = useState('');
  const [fileNotice, setFileNotice] = useState('');
  const [fileProcessing, setFileProcessing] = useState(false);
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

    setFile(picked);
    setFileProcessing(true);
    try {
      const readableText = isPdfFile(picked)
        ? await extractPdfText(picked)
        : cleanImportedText(await picked.text());
      const readableCharacters = readableText.match(/[\p{L}\p{N}]/gu)?.length || 0;
      if (readableCharacters < 20) {
        setFile(null);
        event.target.value = '';
        setError(isPdfFile(picked)
          ? 'This PDF has no selectable text. If it is a scanned document, paste its text or use an OCR-readable copy.'
          : 'This file does not contain enough readable text. Choose another file or paste the project brief below.');
        return;
      }

      const sourceText = readableText.slice(0, MAX_SOURCE_CHARACTERS);
      const { data } = await api.post('/planner/summarize', { text: sourceText });
      if (typeof data.summary !== 'string' || data.summary.trim().length < 20) {
        throw new Error('The document summary was empty.');
      }
      setBrief(data.summary.trim().slice(0, MAX_BRIEF_CHARACTERS));
      setPlan([]);
      setSaved(false);
      setFileNotice(data.mode === 'gemini'
        ? `${isPdfFile(picked) ? 'PDF' : 'Document'} summarized into an editable brief.`
        : `A local summary was created. Review it before generating the plan.`);
    } catch (requestError) {
      setFile(null);
      event.target.value = '';
      setError(requestError?.isAxiosError
        ? errorMessage(requestError)
        : isPdfFile(picked)
          ? 'This PDF could not be read. It may be encrypted, damaged, or use an unsupported format.'
          : 'This file could not be read. Choose another file or paste the project brief below.');
    } finally {
      setFileProcessing(false);
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
          <label className={`upload-zone ${file ? 'has-file' : ''}`} aria-busy={fileProcessing}>
            <input
              type="file"
              accept=".pdf,.txt,.md,.markdown,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
              onChange={selectFile}
              aria-describedby="planner-file-help"
              disabled={fileProcessing}
            />
            {fileProcessing ? (
              <>
                <FileText size={22} />
                <div><b>Summarizing {file?.name || 'document'}...</b><small>Extracting the document and preparing a concise project brief.</small></div>
              </>
            ) : file ? (
              <>
                <FileText size={22} />
                <div><b>{file.name}</b><small>{formatFileSize(file.size)}, {fileNotice}</small></div>
                <Check size={19} />
              </>
            ) : (
              <>
                <Upload size={24} />
                <b>Choose a PDF or text file up to {MAX_FILE_SIZE_MB} MB</b>
                <small id="planner-file-help">PDF, TXT, Markdown, CSV, and JSON text can be imported.</small>
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
          <button className="button button-primary button-full" disabled={busy || fileProcessing || brief.trim().length < 20} onClick={generate}>
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
