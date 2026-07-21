import { useCallback, useEffect, useState } from 'react';

/** /admin — live PostHog analytics behind a passphrase. The key is checked
 * by the serverless function; here it's only remembered in localStorage. */

type Rows = (string | number | null)[][];
interface Stats {
  generated_at: string;
  now_active: Rows;
  today: Rows;
  daily: Rows;
  top_bots: Rows;
  fights: Rows;
  searches: Rows;
  countries: Rows;
  devices: Rows;
  referrers: Rows;
  live: Rows;
}

const KEY_STORE = 'bb-admin-key';
const DAYS_STORE = 'bb-admin-days';
const REFRESH_MS = 120_000;

/** whitelisted on the server too — anything else falls back to 7 */
const RANGES: { days: number; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7d' },
  { days: 14, label: '14d' },
  { days: 30, label: '30d' },
  { days: 365, label: 'All' },
];
const rangeLabel = (d: number) => (d === 1 ? 'today' : d === 365 ? 'all time' : `${d}d`);

function Table({ title, rows, cols }: { title: string; rows: Rows; cols: [string, string] }) {
  return (
    <section className="adm-card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="adm-empty">no data yet</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{cols[0]}</th>
              <th className="adm-num">{cols[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{String(r[0] ?? '—')}</td>
                <td className="adm-num">{String(r[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function Admin() {
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORE) ?? '');
  const [days, setDays] = useState(() => {
    const d = Number(localStorage.getItem(DAYS_STORE));
    return RANGES.some((r) => r.days === d) ? d : 7;
  });
  const [draft, setDraft] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (k: string, d: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin-stats?days=${d}`, { headers: { 'x-admin-key': k } });
      if (r.status === 401) {
        localStorage.removeItem(KEY_STORE);
        setKey('');
        setDraft('');
        setError('Wrong key.');
        return;
      }
      if (!r.ok) {
        setError(`Backend error: ${(await r.json()).error ?? r.status}`);
        return;
      }
      setStats(await r.json());
      setError(null);
      localStorage.setItem(KEY_STORE, k);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    load(key, days);
    const t = setInterval(() => load(key, days), REFRESH_MS);
    return () => clearInterval(t);
  }, [key, days, load]);

  if (!key) {
    return (
      <div className="adm-login">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setKey(draft.trim());
          }}
        >
          <h1>
            BattleBots <span className="adm-accent">Globe</span> admin
          </h1>
          <input
            type="password"
            placeholder="Admin key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <button type="submit">Enter</button>
          {error && <p className="adm-error">{error}</p>}
        </form>
      </div>
    );
  }

  const active = Number(stats?.now_active?.[0]?.[0] ?? 0);
  const [visitorsToday, viewsToday] = (stats?.today?.[0] ?? [0, 0]).map(Number);
  const [fightsN, fightersN] = (stats?.fights?.[0] ?? [0, 0]).map(Number);
  const rl = rangeLabel(days);
  const daily = stats?.daily ?? [];
  const maxDaily = Math.max(1, ...daily.map((d) => Number(d[1])));

  return (
    <div className="adm">
      <header className="adm-head">
        <h1>
          BattleBots <span className="adm-accent">Globe</span> admin
        </h1>
        <span className="adm-updated">
          {loading ? 'refreshing…' : stats ? `updated ${new Date(stats.generated_at).toLocaleTimeString()}` : ''}
        </span>
        <nav className="adm-ranges" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={`adm-range${days === r.days ? ' is-on' : ''}`}
              onClick={() => {
                localStorage.setItem(DAYS_STORE, String(r.days));
                setDays(r.days);
              }}
            >
              {r.label}
            </button>
          ))}
        </nav>
        <button className="adm-refresh" onClick={() => load(key, days)} disabled={loading}>
          ↻ Refresh
        </button>
        <a className="adm-back" href="/">
          ← to the globe
        </a>
      </header>
      {error && <p className="adm-error">{error}</p>}

      <div className="adm-cards">
        <section className="adm-stat">
          <span className="adm-stat-value adm-live">
            <i aria-hidden="true" /> {active}
          </span>
          <span className="adm-stat-label">active last 15 min</span>
        </section>
        <section className="adm-stat">
          <span className="adm-stat-value">{visitorsToday}</span>
          <span className="adm-stat-label">visitors today</span>
        </section>
        <section className="adm-stat">
          <span className="adm-stat-value">{viewsToday}</span>
          <span className="adm-stat-label">pageviews today</span>
        </section>
        <section className="adm-stat">
          <span className="adm-stat-value">{fightsN}</span>
          <span className="adm-stat-label">fights staged ({rl}, {fightersN} visitors)</span>
        </section>
      </div>

      <section className="adm-card adm-chart-card">
        <h2>Visitors — {rl}</h2>
        <div className="adm-chart">
          {daily.map((d, i) => (
            <div key={i} className="adm-bar-wrap" title={`${d[0]}: ${d[1]} visitors, ${d[2]} views`}>
              <div className="adm-bar" style={{ height: `${(Number(d[1]) / maxDaily) * 100}%` }} />
              <span className="adm-bar-label">{String(d[0]).slice(5)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="adm-grid">
        <Table title={`Top robots (${rl})`} rows={stats?.top_bots ?? []} cols={['bot', 'views']} />
        <Table title={`Searches (${rl})`} rows={stats?.searches ?? []} cols={['query', 'picks']} />
        <Table title={`Visitor countries (${rl})`} rows={stats?.countries ?? []} cols={['country', 'visitors']} />
        <Table title={`Devices (${rl})`} rows={stats?.devices ?? []} cols={['device', 'visitors']} />
        <Table title={`Referrers (${rl})`} rows={stats?.referrers ?? []} cols={['domain', 'visitors']} />
        <section className="adm-card">
          <h2>Live events (2h)</h2>
          {(stats?.live ?? []).length === 0 ? (
            <p className="adm-empty">quiet…</p>
          ) : (
            <table>
              <tbody>
                {(stats?.live ?? []).map((r, i) => (
                  <tr key={i}>
                    <td className="adm-time">
                      {new Date(String(r[0])).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>{String(r[1]).replace('$', '')}</td>
                    <td className="adm-detail">{String(r[2] ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
