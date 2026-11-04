import { useState, type FormEvent } from 'react';
import { IconPencil, IconTrash } from '../icons';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { ApiError } from '../../lib/api';
import { addAutoReplyRule, removeAutoReplyRule, updateConfig } from '../../lib/sessions';
import type { AutoReplyRule, BotConfig, MatchType } from '../../lib/types';

interface AutoReplyEditorProps {
  sessionId: string;
  config: BotConfig;
  onChange: (config: BotConfig) => void;
}

const MATCH_OPTIONS: { value: MatchType; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'exact', label: 'exact' },
  { value: 'startswith', label: 'startswith' },
  { value: 'regex', label: 'regex' },
];

interface RuleDraft {
  trigger: string;
  response: string;
  match: MatchType;
}

const EMPTY_DRAFT: RuleDraft = { trigger: '', response: '', match: 'contains' };

export default function AutoReplyEditor({ sessionId, config, onChange }: AutoReplyEditorProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AutoReplyRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rules = config.autoReply;

  function validate(value: RuleDraft): string | null {
    if (!value.trigger.trim()) return 'Trigger wajib diisi';
    if (!value.response.trim()) return 'Balasan wajib diisi';
    if (value.match === 'regex') {
      try {
        new RegExp(value.trigger.trim());
      } catch {
        return 'Trigger bukan regex yang valid';
      }
    }
    return null;
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validate(draft);
    if (problem) {
      showToast(problem, 'error');
      return;
    }

    setAdding(true);
    try {
      const result = await addAutoReplyRule(sessionId, {
        trigger: draft.trigger.trim(),
        response: draft.response,
        match: draft.match,
        enabled: true,
      });
      onChange(result.config);
      setDraft(EMPTY_DRAFT);
      showToast('Rule ditambahkan', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menambah rule', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function saveRules(nextRules: AutoReplyRule[], id: string, successMessage: string) {
    setBusyId(id);
    try {
      const updated = await updateConfig(sessionId, { autoReply: nextRules });
      onChange(updated);
      showToast(successMessage, 'success');
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menyimpan config', 'error');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(rule: AutoReplyRule) {
    setEditingId(rule.id);
    setEditDraft({ trigger: rule.trigger, response: rule.response, match: rule.match });
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;

    const problem = validate(editDraft);
    if (problem) {
      showToast(problem, 'error');
      return;
    }

    const nextRules = rules.map((rule) =>
      rule.id === editingId
        ? {
            ...rule,
            trigger: editDraft.trigger.trim(),
            response: editDraft.response,
            match: editDraft.match,
          }
        : rule,
    );

    setSavingEdit(true);
    const ok = await saveRules(nextRules, editingId, 'Rule disimpan');
    setSavingEdit(false);
    if (ok) setEditingId(null);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const updated = await removeAutoReplyRule(sessionId, pendingDelete.id);
      onChange(updated);
      setPendingDelete(null);
      showToast('Rule dihapus', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Gagal menghapus rule', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="auto-reply">
      <form className="rule-form" onSubmit={handleAdd}>
        <div className="rule-form__grid">
          <div className="field">
            <label className="field__label" htmlFor="rule-trigger">
              Trigger
            </label>
            <input
              id="rule-trigger"
              className="input"
              placeholder="Contoh: halo"
              value={draft.trigger}
              onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}
              maxLength={120}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="rule-match">
              Tipe match
            </label>
            <select
              id="rule-match"
              className="select"
              value={draft.match}
              onChange={(event) =>
                setDraft({ ...draft, match: event.target.value as MatchType })
              }
            >
              {MATCH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="rule-response">
            Balasan
          </label>
          <textarea
            id="rule-response"
            className="textarea"
            placeholder="Pesan yang dikirim bot"
            value={draft.response}
            onChange={(event) => setDraft({ ...draft, response: event.target.value })}
            maxLength={1000}
          />
        </div>

        <div className="rule-form__actions">
          <Button type="submit" size="sm" loading={adding}>
            Tambah rule
          </Button>
        </div>
      </form>

      {rules.length === 0 ? (
        <p className="caption">Belum ada rule. Bot tidak akan membalas pesan otomatis.</p>
      ) : (
        <ul className="rule-list">
          {rules.map((rule) => {
            const busy = busyId === rule.id;

            if (editingId === rule.id) {
              return (
                <li key={rule.id} className="rule-item rule-item--editing">
                  <form className="rule-form" onSubmit={handleSaveEdit}>
                    <div className="rule-form__grid">
                      <div className="field">
                        <label className="field__label" htmlFor={`edit-trigger-${rule.id}`}>
                          Trigger
                        </label>
                        <input
                          id={`edit-trigger-${rule.id}`}
                          className="input"
                          value={editDraft.trigger}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, trigger: event.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label className="field__label" htmlFor={`edit-match-${rule.id}`}>
                          Tipe match
                        </label>
                        <select
                          id={`edit-match-${rule.id}`}
                          className="select"
                          value={editDraft.match}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, match: event.target.value as MatchType })
                          }
                        >
                          {MATCH_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label className="field__label" htmlFor={`edit-response-${rule.id}`}>
                        Balasan
                      </label>
                      <textarea
                        id={`edit-response-${rule.id}`}
                        className="textarea"
                        value={editDraft.response}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, response: event.target.value })
                        }
                      />
                    </div>

                    <div className="rule-form__actions">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Batal
                      </Button>
                      <Button type="submit" size="sm" loading={savingEdit}>
                        Simpan
                      </Button>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li key={rule.id} className="rule-item">
                <div className="rule-item__main">
                  <span className="rule-item__trigger mono">{rule.trigger}</span>
                  <span className="rule-badge mono">{rule.match}</span>
                  <span className="rule-item__response" title={rule.response}>
                    {rule.response}
                  </span>
                </div>

                <div className="rule-item__actions">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={rule.enabled ? 'Nonaktifkan rule' : 'Aktifkan rule'}
                    className={rule.enabled ? 'toggle toggle--on' : 'toggle'}
                    disabled={busy}
                    onClick={() =>
                      void saveRules(
                        rules.map((item) =>
                          item.id === rule.id ? { ...item, enabled: !item.enabled } : item,
                        ),
                        rule.id,
                        rule.enabled ? 'Rule dinonaktifkan' : 'Rule diaktifkan',
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => startEdit(rule)}
                    aria-label={`Edit rule ${rule.trigger}`}
                  >
                    <IconPencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    onClick={() => setPendingDelete(rule)}
                    aria-label={`Hapus rule ${rule.trigger}`}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Hapus rule?"
        description={
          <>
            Rule <span className="mono">{pendingDelete?.trigger}</span> akan dihapus dari config
            bot.
          </>
        }
        confirmLabel="Hapus"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}