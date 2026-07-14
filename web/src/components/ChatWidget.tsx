import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '../analytics';

export type ChatAction =
  | { type: 'bot'; id: string }
  | { type: 'vs'; a: string; b: string }
  | { type: 'country'; name: string };

interface ChatWidgetProps {
  hidden: boolean;
  onAction: (action: ChatAction) => void;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  "Name's Pit Boss. 135 bots out there and I watched every one of 'em fight. Whaddya wanna know, rookie?";

const CHIPS = [
  '🏆 Best rivalry to watch',
  '💥 Who has the most KOs?',
  '🌍 Which countries compete?',
  '⚔ Pick me a fight to watch',
];

const OFF_DUTY = "Pits are closed right now, rookie — comms are down. Swing by later.";

/** Parse trailing [[bot:x]] / [[vs:a|b]] / [[country:X]] tags out of a reply. */
function extractAction(text: string): { clean: string; action: ChatAction | null; error: boolean } {
  let action: ChatAction | null = null;
  let error = false;
  const clean = text
    .replace(/\[\[(bot|vs|country|error):?([^\]]*)\]\]/g, (_, kind, arg) => {
      if (kind === 'error') error = true;
      else if (kind === 'bot' && arg) action = { type: 'bot', id: arg.trim() };
      else if (kind === 'vs' && arg.includes('|')) {
        const [a, b] = arg.split('|').map((s: string) => s.trim());
        if (a && b) action = { type: 'vs', a, b };
      } else if (kind === 'country' && arg) action = { type: 'country', name: arg.trim() };
      return '';
    })
    .trim();
  return { clean, action, error };
}

export default function ChatWidget({ hidden, onAction }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(() => !localStorage.getItem('pb-teaser-seen'));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Esc closes the chat before anything else (capture phase, like the modals)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [turns, open]);

  const openChat = () => {
    setOpen(true);
    if (teaser) {
      setTeaser(false);
      localStorage.setItem('pb-teaser-seen', '1');
    }
    trackEvent('chat_open');
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    trackEvent('chat_message');
    const history: Turn[] = [...turns, { role: 'user', content: msg }];
    setTurns([...history, { role: 'assistant', content: '' }]);
    setDraft('');
    setBusy(true);

    const setLast = (content: string) =>
      setTurns((t) => [...t.slice(0, -1), { role: 'assistant', content }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        setLast(res.status === 429 ? 'Easy on the throttle, rookie. Gimme a minute.' : OFF_DUTY);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        // hide any partially-streamed action tag from display
        setLast(full.replace(/\[\[[^\]]*\]?\]?\s*$/, '').trimEnd());
      }
      const { clean, action, error } = extractAction(full);
      setLast(clean || (error ? OFF_DUTY : clean));
      if (action) {
        // collapse so the visitor watches the globe do the thing
        setTimeout(() => {
          setOpen(false);
          onAction(action);
        }, 650);
      }
    } catch {
      setLast(OFF_DUTY);
    } finally {
      setBusy(false);
    }
  };

  if (hidden) return null;

  return (
    <>
      {!open && (
        <>
          {teaser && (
            <button className="pb-teaser" onClick={openChat}>
              Need a guide, rookie? 🔧
            </button>
          )}
          <button className="pb-fab" onClick={openChat} aria-label="Chat with Pit Boss">
            <img src="/pit-boss-avatar.webp" alt="" />
          </button>
        </>
      )}
      {open && (
        <section className="pb-panel" role="dialog" aria-label="Pit Boss — arena guide">
          <header className="pb-head">
            <img src="/pit-boss-avatar.webp" alt="" />
            <div>
              <div className="pb-name">Pit Boss</div>
              <div className="pb-sub">Pit crew chief · arena guide</div>
            </div>
            <span className="pb-duty">
              <i aria-hidden="true" /> On duty
            </span>
            <button className="pb-x" onClick={() => setOpen(false)} aria-label="Close chat">
              ×
            </button>
          </header>
          <div className={`pb-body${turns.length === 0 ? ' is-empty' : ''}`} ref={bodyRef}>
            {turns.length === 0 && (
              <>
                <div className="pb-hero">
                  <img src="/pit-boss.webp" alt="Pit Boss" />
                </div>
                <p className="pb-greeting">{GREETING}</p>
                <div className="pb-rule" aria-hidden="true" />
                <div className="pb-chips">
                  {CHIPS.map((c) => (
                    <button key={c} className="pb-chip" onClick={() => send(c.replace(/^\S+\s/, ''))}>
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`pb-row ${t.role === 'user' ? 'is-user' : 'is-bot'}`}>
                {t.role === 'assistant' && <img className="pb-mini" src="/pit-boss-avatar.webp" alt="" />}
                <div className={`pb-msg ${t.role === 'user' ? 'is-user' : 'is-bot'}`}>
                  {t.content ||
                    (t.role === 'assistant' && busy && i === turns.length - 1 ? (
                      <span className="pb-thinking">hammering on it…</span>
                    ) : (
                      t.content
                    ))}
                </div>
              </div>
            ))}
          </div>
          <form
            className="pb-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Pit Boss anything…"
              maxLength={500}
              aria-label="Message Pit Boss"
            />
            <button type="submit" className="pb-send" disabled={busy || !draft.trim()}>
              ➤
            </button>
          </form>
          <div className="pb-fine">AI pit crew — may fumble a fact. Wrench responsibly.</div>
        </section>
      )}
    </>
  );
}
