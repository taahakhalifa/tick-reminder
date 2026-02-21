'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================
// CONSTANTS
// ============================================
const CIRCUMFERENCE = 2 * Math.PI * 88;
const STORAGE_KEY = 'tickreminder_v4';

const MODES = {
  normal: {
    pages: 2,
    deadlineHour: 0,
    deadlineMin: 0,
    label: 'Normal Mode',
    deadlineStr: '12:00 AM',
  },
  ramadan: {
    pages: 5,
    deadlineHour: 5,
    deadlineMin: 0,
    label: 'Ramadan Mode',
    deadlineStr: '5:00 AM',
  },
};

// ============================================
// HELPERS
// ============================================
function getCycleDate(mode) {
  const now = new Date();
  const dh = MODES[mode].deadlineHour;
  if (dh > 0 && now.getHours() < dh) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return y.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

function getDeadline(mode) {
  const m = MODES[mode];
  const now = new Date();
  const dl = new Date(now);
  if (m.deadlineHour === 0) {
    dl.setHours(24, 0, 0, 0);
  } else {
    if (now.getHours() < m.deadlineHour) {
      dl.setHours(m.deadlineHour, m.deadlineMin, 0, 0);
    } else {
      dl.setDate(dl.getDate() + 1);
      dl.setHours(m.deadlineHour, m.deadlineMin, 0, 0);
    }
  }
  return dl;
}

function getMsUntilDeadline(mode) {
  return getDeadline(mode) - new Date();
}

function getMinutesSinceMidnight() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00';
  const ts = Math.floor(ms / 1000);
  const h = Math.floor(ts / 3600);
  const m = Math.floor((ts % 3600) / 60);
  const s = ts % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function loadState() {
  const def = {
    mode: 'ramadan',
    history: [],
    todayTicked: false,
    todayTickedAt: null,
    todayDate: getCycleDate('ramadan'),
  };
  if (typeof window === 'undefined') return def;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      const cd = getCycleDate(p.mode);
      if (p.todayDate !== cd) {
        if (p.todayDate) {
          p.history.push({
            date: p.todayDate,
            tickedAt: p.todayTickedAt,
            missed: !p.todayTicked,
          });
        }
        if (p.history.length > 30) p.history = p.history.slice(-30);
        p.todayTicked = false;
        p.todayTickedAt = null;
        p.todayDate = cd;
      }
      return p;
    }
  } catch (e) {}
  return def;
}

function saveState(state) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// ============================================
// COMPONENT
// ============================================
export default function TickReminder() {
  const [state, setState] = useState(null);
  const [msLeft, setMsLeft] = useState(0);
  const [ishaTime, setIshaTime] = useState(null);
  const [view, setView] = useState('main');
  const [notifPerm, setNotifPerm] = useState('default');
  const [mounted, setMounted] = useState(false);
  const lastNotifRef = useRef(0);

  // Init on mount (client only)
  useEffect(() => {
    const s = loadState();
    setState(s);
    setMsLeft(getMsUntilDeadline(s.mode));
    setMounted(true);
    if (typeof Notification !== 'undefined') {
      setNotifPerm(Notification.permission);
    }
  }, []);

  // Save on state change
  useEffect(() => {
    if (state && mounted) saveState(state);
  }, [state, mounted]);

  // Fetch Isha time
  useEffect(() => {
    async function fetchIsha() {
      try {
        const t = new Date();
        const dd = String(t.getDate()).padStart(2, '0');
        const mm = String(t.getMonth() + 1).padStart(2, '0');
        const yyyy = t.getFullYear();
        const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=53.4808&longitude=-2.2426&method=15`;
        const r = await fetch(url);
        const d = await r.json();
        const is = d.data.timings.Isha;
        const [h, m] = is.split(':').map(Number);
        setIshaTime({ minutes: h * 60 + m, str: is });
      } catch (e) {
        setIshaTime({ minutes: 20 * 60 + 30, str: '~8:30 PM (fallback)' });
      }
    }
    fetchIsha();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!state) return;
    const iv = setInterval(() => {
      setMsLeft(getMsUntilDeadline(state.mode));
      // Cycle rollover
      const cd = getCycleDate(state.mode);
      if (state.todayDate !== cd) {
        setState(loadState());
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [state?.mode, state?.todayDate]);

  // Notification checker
  useEffect(() => {
    if (!state || !mounted) return;
    const iv = setInterval(() => {
      if (state.todayTicked || notifPerm !== 'granted') return;
      const ishaMin = ishaTime?.minutes || 1230;
      const nowMin = getMinutesSinceMidnight();
      const m = MODES[state.mode];
      let nowTotalMin = nowMin;
      if (m.deadlineHour > 0 && nowMin < m.deadlineHour * 60)
        nowTotalMin = 1440 + nowMin;
      if (nowTotalMin < ishaMin) return;

      const ms = getMsUntilDeadline(state.mode);
      const minsLeft = ms / 60000;
      let interval;
      if (minsLeft <= 15) interval = 2 * 60 * 1000;
      else if (minsLeft <= 45) interval = 5 * 60 * 1000;
      else if (minsLeft <= 90) interval = 10 * 60 * 1000;
      else interval = 30 * 60 * 1000;

      const now = Date.now();
      if (now - lastNotifRef.current >= interval) {
        const mLeft = Math.floor(minsLeft);
        const h = Math.floor(mLeft / 60);
        const rm = mLeft % 60;
        const timeStr = h > 0 ? `${h}h ${rm}m` : `${mLeft} mins`;
        let title, body;
        if (mLeft <= 15) {
          title = '🚨 TICK NOW!';
          body = `Only ${timeStr} left before ${m.deadlineStr}!`;
        } else if (mLeft <= 45) {
          title = '⚠️ Time running out';
          body = `${timeStr} until ${m.deadlineStr}. Tick now!`;
        } else if (mLeft <= 90) {
          title = "⏳ Don't forget";
          body = `${timeStr} left until ${m.deadlineStr}.`;
        } else {
          title = '📖 Tick Reminder';
          body = `⏳ ${timeStr} left. Remember to tick!`;
        }
        try {
          new Notification(title, { body, tag: 'tick-' + now, renotify: true });
        } catch (e) {}
        lastNotifRef.current = now;
      }
    }, 30000);
    return () => clearInterval(iv);
  }, [state?.todayTicked, state?.mode, notifPerm, ishaTime, mounted]);

  // Loading state
  if (!mounted || !state) {
    return (
      <div style={{ background: '#1a1610', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#c5a97a', fontSize: 16, letterSpacing: 3 }}>Loading...</div>
      </div>
    );
  }

  // ---- COMPUTED VALUES ----
  const m = MODES[state.mode];
  const hoursLeft = msLeft / (1000 * 60 * 60);
  const ishaMin = ishaTime?.minutes || 1230;
  const nowMin = getMinutesSinceMidnight();

  let deadlineTotalMin = m.deadlineHour === 0 ? 1440 : 1440 + m.deadlineHour * 60;
  let nowTotalMin = nowMin;
  if (m.deadlineHour > 0 && nowMin < m.deadlineHour * 60)
    nowTotalMin = 1440 + nowMin;

  const totalWindow = deadlineTotalMin - ishaMin;
  const elapsed = Math.max(0, nowTotalMin - ishaMin);
  const fraction = totalWindow > 0 ? Math.min(1, elapsed / totalWindow) : 0;
  const ringOffset = state.todayTicked ? 0 : fraction * CIRCUMFERENCE;

  const isUrgent = !state.todayTicked && hoursLeft <= 1;
  const isCritical = !state.todayTicked && hoursLeft <= 0.25;
  const isActive = !state.todayTicked && nowTotalMin >= ishaMin;

  const ringColor = state.todayTicked ? 'var(--green)' : isUrgent ? 'var(--red)' : 'var(--gold)';
  const timeColor = state.todayTicked ? 'var(--green-glow)' : isCritical ? 'var(--red-glow)' : isUrgent ? 'var(--red-glow)' : 'var(--cream)';

  let statusText = '';
  let statusColor = 'var(--gold-dim)';
  if (state.todayTicked) { statusText = 'All done — rest easy tonight'; statusColor = 'var(--green)'; }
  else if (isCritical) { statusText = '🚨 TICK NOW — almost out of time!'; statusColor = 'var(--red-glow)'; }
  else if (isUrgent) { statusText = 'Running low — go tick in the GC'; statusColor = 'var(--red)'; }
  else if (isActive) { statusText = 'Have you read & ticked today?'; statusColor = 'var(--gold-dim)'; }

  // Streak
  function getStreak() {
    let streak = state.todayTicked ? 1 : 0;
    const hist = [...state.history].reverse();
    for (const d of hist) {
      if (d.missed) break;
      streak++;
    }
    return streak;
  }
  const streak = getStreak();
  const streakDays = [
    ...state.history.slice(-13),
    { date: state.todayDate, tickedAt: state.todayTickedAt, missed: false },
  ];

  // ---- ACTIONS ----
  function confirmTick() {
    const now = Date.now();
    setState((prev) => ({ ...prev, todayTicked: true, todayTickedAt: now }));
    setView('main');
    if (notifPerm === 'granted') {
      try {
        new Notification('✅ Tick recorded!', { body: 'Well done — your streak continues.', tag: 'tick-confirmed' });
      } catch (e) {}
    }
  }

  function switchMode(mode) {
    setState((prev) => {
      const newHist = [...prev.history];
      if (prev.todayDate) {
        newHist.push({ date: prev.todayDate, tickedAt: prev.todayTickedAt, missed: !prev.todayTicked });
      }
      return {
        ...prev,
        mode,
        history: newHist.slice(-30),
        todayTicked: false,
        todayTickedAt: null,
        todayDate: getCycleDate(mode),
      };
    });
  }

  async function requestNotifs() {
    if (typeof Notification === 'undefined') {
      alert('Add this site to your Home Screen first (Safari → Share → Add to Home Screen), then notifications will work.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPerm(result);
      if (result === 'granted') {
        new Notification('✅ Notifications enabled', { body: "You'll be reminded before every deadline." });
      } else {
        alert('Notifications blocked. Enable in phone settings.');
      }
    } catch (e) {
      alert('Could not enable notifications. Try adding to Home Screen first.');
    }
  }

  function resetAll() {
    if (confirm('Reset your entire streak and history?')) {
      const fresh = {
        mode: 'ramadan',
        history: [],
        todayTicked: false,
        todayTickedAt: null,
        todayDate: getCycleDate('ramadan'),
      };
      setState(fresh);
      setView('main');
    }
  }

  // ============================================
  // SETTINGS VIEW
  // ============================================
  if (view === 'settings') {
    return (
      <div className="app-container">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={() => setView('main')}>✕</button>
        </div>

        <div className="section">
          <div className="section-label">Reading Mode</div>
          {['normal', 'ramadan'].map((mode) => (
            <button
              key={mode}
              className={`mode-option ${state.mode === mode ? 'active' : ''}`}
              onClick={() => switchMode(mode)}
            >
              <div className="mode-option-title">
                {MODES[mode].label} {mode === 'ramadan' ? '🌙' : ''}
              </div>
              <div className="mode-option-desc">
                {mode === 'normal' ? 'Standard daily reading outside Ramadan' : 'Increased reading during the blessed month'}
              </div>
              <div className="mode-option-details">
                <span><strong>{MODES[mode].pages}</strong> pages</span>
                <span>Deadline: <strong>{MODES[mode].deadlineStr}</strong></span>
              </div>
            </button>
          ))}
        </div>

        <div className="section">
          <div className="section-label">Notifications</div>
          <div className="info-box">
            {notifPerm === 'granted' ? (
              '✅ Notifications enabled. Escalating reminders from Isha until you tick.'
            ) : notifPerm === 'denied' ? (
              '❌ Notifications blocked. Enable in phone settings.'
            ) : (
              <span>
                Not enabled yet.{' '}
                <span className="link-text" onClick={requestNotifs}>Tap to enable</span>
              </span>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-label">How it works</div>
          <div className="info-box">
            Reminders escalate as the deadline approaches — every 30 mins after Isha,
            every 10 mins with 90 mins left, every 5 mins with 45 mins left, and
            every 2 mins in the final 15 minutes. All stop once you confirm your tick.
          </div>
        </div>

        <div className="danger-section">
          <button className="danger-btn" onClick={resetAll}>
            Reset All Data & Streak
          </button>
        </div>

        <style jsx>{`
          .app-container {
            max-width: 420px;
            margin: 0 auto;
            padding: 20px;
            min-height: 100vh;
          }
          .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-top: 10px;
          }
          .settings-header h2 {
            font-family: 'Playfair Display', serif;
            font-size: 20px;
            color: var(--gold);
            letter-spacing: 3px;
            text-transform: uppercase;
          }
          .icon-btn {
            width: 36px;
            height: 36px;
            background: none;
            border: 1px solid var(--gold-dim);
            color: var(--gold-dim);
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .section { margin-bottom: 28px; }
          .section-label {
            font-size: 11px;
            color: var(--text-dim);
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-bottom: 12px;
          }
          .mode-option {
            width: 100%;
            padding: 18px;
            background: var(--bg-card);
            border: 2px solid transparent;
            margin-bottom: 10px;
            cursor: pointer;
            text-align: left;
            display: block;
            color: var(--text);
            font-family: inherit;
          }
          .mode-option.active { border-color: var(--gold); }
          .mode-option-title {
            font-family: 'Playfair Display', serif;
            font-size: 18px;
            font-weight: 700;
            color: var(--cream);
            margin-bottom: 4px;
          }
          .mode-option-desc {
            font-size: 14px;
            color: var(--text-dim);
            font-style: italic;
          }
          .mode-option-details {
            display: flex;
            gap: 20px;
            margin-top: 8px;
            font-size: 13px;
            color: var(--gold-dim);
          }
          .mode-option-details strong { color: var(--gold); }
          .info-box {
            font-size: 14px;
            color: var(--text-dim);
            font-style: italic;
            line-height: 1.5;
            padding: 16px;
            border: 1px solid #ffffff08;
            background: var(--bg-card);
          }
          .link-text {
            color: var(--gold);
            cursor: pointer;
            text-decoration: underline;
          }
          .danger-section {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ffffff10;
          }
          .danger-btn {
            width: 100%;
            padding: 14px;
            border: 1px solid var(--red);
            background: transparent;
            color: var(--red);
            font-family: 'Cormorant Garamond', serif;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  // ============================================
  // CONFIRM VIEW
  // ============================================
  if (view === 'confirm') {
    return (
      <div className="confirm-wrapper">
        <div className="confirm-modal">
          <h3>Confirm your tick ✅</h3>
          <p>Have you read your {m.pages} pages and sent your tick in the WhatsApp GC?</p>
          <div className="confirm-btns">
            <button className="btn-cancel" onClick={() => setView('main')}>Not yet</button>
            <button className="btn-confirm" onClick={confirmTick}>Yes, I&apos;ve ticked</button>
          </div>
        </div>

        <style jsx>{`
          .confirm-wrapper {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 30px;
          }
          .confirm-modal {
            background: var(--bg-card);
            border: 1px solid var(--gold-dim);
            padding: 28px;
            text-align: center;
            max-width: 340px;
            width: 100%;
          }
          .confirm-modal h3 {
            font-family: 'Playfair Display', serif;
            font-size: 20px;
            color: var(--cream);
            margin-bottom: 8px;
          }
          .confirm-modal p {
            font-size: 15px;
            color: var(--text-dim);
            margin-bottom: 20px;
            font-style: italic;
            line-height: 1.4;
          }
          .confirm-btns { display: flex; gap: 10px; }
          .confirm-btns button {
            flex: 1;
            padding: 14px;
            background: transparent;
            font-family: 'Cormorant Garamond', serif;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          }
          .btn-cancel { border: 1px solid var(--text-dim); color: var(--text-dim); }
          .btn-confirm { border: 1px solid var(--green); color: var(--green); }
        `}</style>
      </div>
    );
  }

  // ============================================
  // MAIN VIEW
  // ============================================
  return (
    <div className="app-container">
      {/* Notification banner */}
      {notifPerm !== 'granted' && (
        <button className="notif-banner" onClick={requestNotifs}>
          ⚠ Tap to enable notifications
        </button>
      )}

      {/* Header */}
      <div className="header">
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" style={{ opacity: 0.5, marginBottom: 8 }}>
          <g transform="translate(20,20)">
            <polygon points="0,-14 4,-4 14,0 4,4 0,14 -4,4 -14,0 -4,-4" fill="none" stroke="#c5a97a" strokeWidth="0.8" />
            <polygon points="0,-10 10,0 0,10 -10,0" fill="none" stroke="#c5a97a" strokeWidth="0.6" />
            <circle r="5" fill="none" stroke="#c5a97a" strokeWidth="0.5" />
          </g>
        </svg>
        <h1>Tick Reminder</h1>
        <div className="header-sub">Quran Reading Tracker</div>
        <button className="settings-btn" onClick={() => setView('settings')}>⚙</button>
      </div>

      {/* Mode badge */}
      <div className={`mode-badge ${state.mode === 'ramadan' ? 'ramadan' : ''}`}>
        <div className="mode-dot" />
        <span>{m.label} {state.mode === 'ramadan' ? '🌙' : ''}</span>
      </div>

      {/* Pages info */}
      <div className="pages-info">
        <strong>{m.pages} pages</strong> · deadline {m.deadlineStr}
      </div>

      {/* Countdown ring */}
      <div className="countdown-section">
        <div className="ring-container">
          <svg width="230" height="230" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="100" cy="100" r="88" fill="none" stroke="var(--bg-card)" strokeWidth="6" />
            <circle
              cx="100" cy="100" r="88" fill="none"
              stroke={ringColor} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={ringOffset}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
            />
          </svg>
          <div className="ring-center">
            <div
              className={`time-left ${isCritical ? 'pulse' : ''}`}
              style={{ color: timeColor, fontSize: state.todayTicked ? 36 : 46 }}
            >
              {state.todayTicked ? '✅' : formatCountdown(msLeft)}
            </div>
            <div className="time-label" style={{ color: isUrgent && !state.todayTicked ? 'var(--red)' : 'var(--text-dim)' }}>
              {state.todayTicked ? 'ticked today' : 'until deadline'}
            </div>
            {!state.todayTicked && (
              <div className="deadline-label">deadline: {m.deadlineStr}</div>
            )}
          </div>
        </div>
        <div className="status-msg" style={{ color: statusColor }}>
          {statusText}
        </div>
      </div>

      {/* Tick button */}
      <button
        className={`tick-btn ${state.todayTicked ? 'done' : ''}`}
        onClick={() => !state.todayTicked && setView('confirm')}
        disabled={state.todayTicked}
      >
        {state.todayTicked ? 'Ticked ✅' : "I've put my tick in ✅"}
      </button>

      {/* Streak card */}
      <div className="card">
        <div className="card-label">Current Streak</div>
        <div className="card-row">
          <div className="card-value">{streak}</div>
          <div className="card-detail">{streak === 1 ? 'day' : 'days in a row'}</div>
        </div>
        <div className="streak-dots">
          {streakDays.map((d, i) => {
            const isHit = d.tickedAt || (d.date === state.todayDate && state.todayTicked);
            const isMiss = d.missed;
            return (
              <div
                key={i}
                className={`streak-dot ${isHit ? 'hit' : ''} ${isMiss ? 'miss' : ''}`}
                title={d.date}
              />
            );
          })}
        </div>
      </div>

      {/* Today card */}
      <div className="card">
        <div className="card-label">Today</div>
        <div className="card-row">
          <div className="card-detail" style={{ color: state.todayTicked ? 'var(--green)' : 'var(--text-dim)' }}>
            {state.todayTicked ? 'Ticked ✅' : 'Waiting for your tick...'}
          </div>
          <div className="card-detail">
            {state.todayTicked && state.todayTickedAt
              ? `at ${new Date(state.todayTickedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </div>
        </div>
      </div>

      {/* Isha footer */}
      <div className="isha-footer">
        {ishaTime ? `Isha today: ${ishaTime.str} · Manchester` : 'Fetching Isha time...'}
      </div>

      <style jsx>{`
        .app-container {
          max-width: 420px;
          margin: 0 auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 100vh;
          min-height: 100dvh;
        }
        .notif-banner {
          width: 100%;
          background: var(--gold);
          color: var(--bg);
          padding: 12px 20px;
          text-align: center;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 16px;
          border: none;
          font-family: inherit;
        }
        .header {
          text-align: center;
          margin-top: 16px;
          margin-bottom: 24px;
          width: 100%;
          position: relative;
        }
        .header h1 {
          font-family: 'Playfair Display', serif;
          font-size: 14px;
          font-weight: 700;
          color: var(--gold);
          letter-spacing: 5px;
          text-transform: uppercase;
        }
        .header-sub {
          font-size: 12px;
          color: var(--text-dim);
          letter-spacing: 2px;
          margin-top: 2px;
        }
        .settings-btn {
          position: absolute;
          top: 6px;
          right: 0;
          width: 36px;
          height: 36px;
          background: none;
          border: 1px solid var(--gold-dim);
          color: var(--gold-dim);
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mode-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border: 1px solid var(--gold-dim);
          margin-bottom: 24px;
          font-size: 13px;
          color: var(--gold);
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .mode-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--gold);
        }
        .mode-badge.ramadan .mode-dot {
          background: var(--green);
        }
        .pages-info {
          font-size: 15px;
          color: var(--text-dim);
          text-align: center;
          margin-bottom: 20px;
          letter-spacing: 1px;
        }
        .pages-info strong {
          color: var(--gold);
        }
        .countdown-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 24px;
        }
        .ring-container {
          position: relative;
          width: 230px;
          height: 230px;
        }
        .ring-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        .time-left {
          font-family: 'Playfair Display', serif;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 2px;
        }
        .time-label {
          font-size: 12px;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .deadline-label {
          font-size: 13px;
          color: var(--gold-dim);
          letter-spacing: 1px;
          margin-top: 2px;
        }
        .status-msg {
          font-size: 17px;
          font-style: italic;
          text-align: center;
          margin-top: 12px;
          min-height: 24px;
        }
        .tick-btn {
          width: 100%;
          padding: 18px;
          border: 2px solid var(--gold);
          background: transparent;
          color: var(--gold);
          font-family: 'Playfair Display', serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          cursor: pointer;
          margin-bottom: 24px;
          position: relative;
          overflow: hidden;
        }
        .tick-btn.done {
          border-color: var(--green);
          color: var(--green);
          cursor: default;
          opacity: 0.8;
        }
        .card {
          width: 100%;
          background: var(--bg-card);
          border: 1px solid #ffffff08;
          padding: 18px;
          margin-bottom: 10px;
        }
        .card-label {
          font-size: 11px;
          color: var(--text-dim);
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .card-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .card-value {
          font-family: 'Playfair Display', serif;
          font-size: 28px;
          font-weight: 700;
          color: var(--gold-bright);
        }
        .card-detail {
          font-size: 15px;
          color: var(--text-dim);
          font-style: italic;
        }
        .streak-dots {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .streak-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--bg);
          border: 1px solid var(--gold-dim);
        }
        .streak-dot.hit {
          background: var(--green);
          border-color: var(--green);
        }
        .streak-dot.miss {
          background: var(--red);
          border-color: var(--red);
        }
        .isha-footer {
          width: 100%;
          text-align: center;
          padding: 12px;
          border-top: 1px solid #ffffff08;
          margin-top: auto;
          margin-bottom: 12px;
          font-size: 13px;
          color: var(--text-dim);
          letter-spacing: 1px;
        }
      `}</style>
    </div>
  );
}
