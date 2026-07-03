import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm, showPrompt } from '../../components/Toast.jsx';
import Select from '../../components/Select.jsx';
import '../../styles/pages/server/Players.css';

export default function Players() {
  const { serverId, status, hasPerm } = useOutletContext();
  const [activeTab, setActiveTab] = useState('players');

  const tabs = [
    { id: 'players',        label: 'All Players' },
    { id: 'whitelist',      label: 'Whitelist' },
    { id: 'ops',            label: 'OPs' },
    { id: 'banned-players', label: 'Banned Players' },
    { id: 'banned-ips',     label: 'Banned IPs' },
  ];

  return (
    <div>
      <div className="sub-nav" id="players-sub-nav" style={{ marginBottom: '1rem' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`sub-nav-item${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >{t.label}</button>
        ))}
      </div>
      <div id="players-content">
        {activeTab === 'players'        && <PlayersTab        serverId={serverId} status={status} hasPerm={hasPerm} />}
        {activeTab === 'whitelist'      && <WhitelistTab      serverId={serverId} />}
        {activeTab === 'ops'            && <OpsTab            serverId={serverId} />}
        {activeTab === 'banned-players' && <BannedPlayersTab  serverId={serverId} />}
        {activeTab === 'banned-ips'     && <BannedIpsTab      serverId={serverId} />}
      </div>
    </div>
  );
}

/* ── All Players ─────────────────────────────────────────────────────────── */
function PlayersTab({ serverId, status, hasPerm }) {
  const [players, setPlayers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const vitalsIntervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}/players/list`);
      setPlayers(data || []);
    } catch { setPlayers([]); }
    finally { setLoading(false); }
  }, [serverId]);

  useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [load]);

  const loadDetail = async (p) => {
    setDetailLoading(true);
    const name = p.username || p.name || p.uuid;
    setSelected(s => s ? { ...s, data: s.data } : { uuid: p.uuid, name, data: null });
    if (!selected) setSelected({ uuid: p.uuid, name, data: null });
    try {
      const d = await api(`/api/servers/${serverId}/players/${encodeURIComponent(p.uuid)}`);
      setSelected({ uuid: p.uuid, name, data: d });
    } catch { setSelected(s => s ? { ...s } : null); }
    finally { setDetailLoading(false); }
  };

  // Poll vitals every 500ms while modal is open
  const startVitalsPoll = useCallback((uuid, name) => {
    stopVitalsPoll();
    vitalsIntervalRef.current = setInterval(async () => {
      try {
        const d = await api(`/api/servers/${serverId}/players/${encodeURIComponent(uuid)}`);
        setSelected(s => s ? { ...s, data: d } : null);
      } catch { /* ignore poll errors */ }
    }, 500);
  }, [serverId]);

  const stopVitalsPoll = () => {
    if (vitalsIntervalRef.current) {
      clearInterval(vitalsIntervalRef.current);
      vitalsIntervalRef.current = null;
    }
  };

  const openModal = async (p) => {
    setDetailLoading(true);
    const name = p.username || p.name || p.uuid;
    setSelected({ uuid: p.uuid, name, data: null });
    try {
      const d = await api(`/api/servers/${serverId}/players/${encodeURIComponent(p.uuid)}`);
      setSelected({ uuid: p.uuid, name, data: d });
      startVitalsPoll(p.uuid, name);
    } catch { setSelected(s => ({ ...s, data: null })); }
    finally { setDetailLoading(false); }
  };

  const closeModal = () => {
    stopVitalsPoll();
    setSelected(null);
  };

  // Stop polling when unmounted
  useEffect(() => () => stopVitalsPoll(), []);

  const sendCmd = async (uuid, action, value) => {
    try {
      const r = await api(`/api/servers/${serverId}/players/${uuid}/command`, {
        method: 'POST', body: { action, value }
      });
      toast(r.message || 'Command sent.', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="card">
      <div className="list-header">
        <div className="col col-wide">Player</div>
        <div className="col">UUID</div>
        <div className="col actions">Actions</div>
      </div>
      <div className="list-body">
        {loading ? (
          <p className="text-muted" style={{ padding: '1rem' }}>Loading players…</p>
        ) : !players.length ? (
          <div className="list-item"><p className="text-muted">No player data found.</p></div>
        ) : players.map(p => (
          <div key={p.uuid} className="list-item">
            <div className="col col-wide text-mono" data-label="Player">{p.username || p.uuid}</div>
            <div className="col text-muted text-mono" style={{ fontSize: '0.8rem' }} data-label="UUID">{p.uuid}</div>
            <div className="col actions" data-label="Actions">
              <button className="btn outline small" onClick={() => openModal(p)}>Manage</button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <PlayerDetailModal
          player={selected}
          loading={detailLoading}
          serverId={serverId}
          hasPerm={hasPerm}
          onClose={closeModal}
          sendCmd={sendCmd}
          onRefresh={() => openModal({ uuid: selected.uuid, username: selected.name })}
          onOptimisticVitals={(health, food) =>
            setSelected(s => s ? { ...s, data: { ...s.data, health, food } } : null)
          }
        />
      )}
    </div>
  );
}

/* ── Player Detail Modal ─────────────────────────────────────────────────── */
function PlayerDetailModal({ player, loading, serverId, hasPerm, onClose, sendCmd, onRefresh, onOptimisticVitals }) {
  const d = player.data;

  const [gmValue,       setGmValue]       = useState('survival');
  const [effectValue,   setEffectValue]   = useState('minecraft:speed 30 1');
  const [giveValue,     setGiveValue]     = useState('minecraft:apple 1');
  const [xpValue,       setXpValue]       = useState('100');
  const [tpValue,       setTpValue]       = useState('');
  const [kickReason,    setKickReason]    = useState('');
  const [banReason,     setBanReason]     = useState('');
  const [muteReason,    setMuteReason]    = useState('');
  const [activeSection, setActiveSection] = useState('stats');

  const cmd = (action, value) => sendCmd(player.uuid, action, value || undefined);

  /* ── live health / hunger from API response ─────────────────────────── */
  const health    = d?.health    ?? null;   // 0–20
  const food      = d?.food      ?? null;   // 0–20
  const maxHealth = 20;
  const maxFood   = 20;

  const sections = [
    { id: 'stats',      label: 'Stats' },
    { id: 'vitals',     label: 'Vitals' },
    { id: 'moderation', label: 'Moderation' },
    { id: 'status',     label: 'Status' },
    { id: 'world',      label: 'World' },
  ];

  /* ── stat helpers ─────────────────────────────────────────────────────── */
  const getStat = (category, key) => d?.stats?.stats?.[category]?.[key] ?? null;

  const ticks               = getStat('minecraft:custom', 'minecraft:play_time');
  const timeSinceDeathTicks = getStat('minecraft:custom', 'minecraft:time_since_death');
  const playTimeHours       = ticks != null ? (ticks / 72000).toFixed(1) : null;
  const deaths              = getStat('minecraft:custom', 'minecraft:deaths');
  const mobKills            = getStat('minecraft:custom', 'minecraft:mob_kills');
  const playerKills         = getStat('minecraft:custom', 'minecraft:player_kills');
  const jumps               = getStat('minecraft:custom', 'minecraft:jump');
  const cmWalked            = getStat('minecraft:custom', 'minecraft:walk_one_cm');
  const cmSwum              = getStat('minecraft:custom', 'minecraft:swim_one_cm');
  const cmFlown             = getStat('minecraft:custom', 'minecraft:fly_one_cm');
  const cmFallen            = getStat('minecraft:custom', 'minecraft:fall_one_cm');
  const kmWalked            = cmWalked != null ? (cmWalked  / 100000).toFixed(2) : null;
  const kmSwum              = cmSwum   != null ? (cmSwum    / 100000).toFixed(2) : null;
  const kmFlown             = cmFlown  != null ? (cmFlown   / 100000).toFixed(2) : null;
  const kmFallen            = cmFallen != null ? (cmFallen  / 100000).toFixed(2) : null;
  const itemsDropped        = getStat('minecraft:custom', 'minecraft:drop');
  const damageTakenRaw      = getStat('minecraft:custom', 'minecraft:damage_taken');
  const damageDealtRaw      = getStat('minecraft:custom', 'minecraft:damage_dealt');
  const damageTaken         = damageTakenRaw != null ? (damageTakenRaw / 10).toFixed(1) : null;
  const damageDealt         = damageDealtRaw != null ? (damageDealtRaw / 10).toFixed(1) : null;
  const sleepBed            = getStat('minecraft:custom', 'minecraft:sleep_in_bed');
  const leavesGame          = getStat('minecraft:custom', 'minecraft:leave_game');
  const tradedCount         = getStat('minecraft:custom', 'minecraft:traded_with_villager');
  const craftedItems        = d?.stats?.stats?.['minecraft:crafted']
    ? Object.values(d.stats.stats['minecraft:crafted']).reduce((a, b) => a + b, 0)
    : null;
  const minedBlocks         = d?.stats?.stats?.['minecraft:mined']
    ? Object.values(d.stats.stats['minecraft:mined']).reduce((a, b) => a + b, 0)
    : null;
  const killedByMob         = d?.stats?.stats?.['minecraft:killed_by']
    ? Object.entries(d.stats.stats['minecraft:killed_by'])
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ mob: k.replace('minecraft:', ''), count: v }))
    : [];
  const topKilledBy         = killedByMob[0];

  /* Player deaths = times killed by another player specifically */
  const playerDeaths        = d?.stats?.stats?.['minecraft:killed_by']?.['minecraft:player'] ?? null;
  const advDone             = d?.advancements
    ? Object.values(d.advancements).filter(v => typeof v === 'object' && v.done === true).length
    : null;
  const advTotal            = d?.advancements ? Object.keys(d.advancements).length : null;

  const secSinceDeath = timeSinceDeathTicks != null ? Math.floor(timeSinceDeathTicks / 20) : null;
  const formatSince   = (s) => {
    if (s == null) return null;
    if (s < 60)   return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  /* K/D ratio – player kills divided by player deaths only */
  const kd = (() => {
    if (playerKills == null || playerDeaths == null) return null;
    if (playerDeaths === 0) return playerKills > 0 ? 'inf' : '0.00';
    return (playerKills / playerDeaths).toFixed(2);
  })();

  const hasStats = d?.stats?.stats != null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        width: 900, maxWidth: '100%',
        maxHeight: 'calc(100vh - 2rem)',
        overflowY: 'auto',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>

        {/* ══ MODAL HEADER ═══════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1.25rem',
          padding: '1.5rem 2rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-input)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          flexShrink: 0,
        }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={`https://mc-heads.net/avatar/${player.name}/72`}
              alt={player.name}
              width={72} height={72}
              style={{
                borderRadius: 10,
                imageRendering: 'pixelated',
                border: '2px solid var(--accent)',
                boxShadow: '0 0 16px var(--accent-glow)',
                display: 'block',
              }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          </div>

          {/* Name + UUID */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {player.name}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 6, wordBreak: 'break-all' }}>
              {player.uuid}
            </div>
            {loading && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite' }} />
                Loading data…
              </div>
            )}
          </div>

          {/* Quick stat pills */}
          {hasStats && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
              {playTimeHours != null && (
                <QuickPill label="Playtime" val={`${playTimeHours}h`} />
              )}
              {playerKills != null && (
                <QuickPill label="Player Kills" val={playerKills.toLocaleString()} color="var(--red)" />
              )}
              {kd != null && (
                <QuickPill label="K/D" val={kd} color="var(--orange)" />
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: 'auto' }}>
            <button className="btn outline small" onClick={onRefresh}>Refresh</button>
            <button className="btn outline small" onClick={onClose} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>Close</button>
          </div>
        </div>

        {/* ══ SECTION TABS ═══════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 2, padding: '0.6rem 1.25rem',
          background: 'var(--bg-base)',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          flexShrink: 0,
        }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                background: activeSection === s.id ? 'var(--accent-subtle)' : 'none',
                border: activeSection === s.id ? '1px solid var(--accent-glow)' : '1px solid transparent',
                color: activeSection === s.id ? 'var(--accent)' : 'var(--text-secondary)',
                padding: '6px 14px',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                transition: 'var(--transition)',
              }}
            >{s.label}</button>
          ))}
        </div>

        {/* ══ SECTION BODY ═══════════════════════════════════════════════════ */}
        <div style={{ padding: '1.75rem 2rem', overflowY: 'auto', flex: 1 }}>

          {/* ── STATS ─────────────────────────────────────────────────────── */}
          {activeSection === 'stats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {!hasStats ? (
                <div style={{
                  padding: '2rem', textAlign: 'center',
                  background: 'var(--bg-input)', borderRadius: 'var(--radius)',
                  border: '1px dashed var(--border)',
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}></div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                    No server stats found for this player.<br />
                    Stats are stored in <code>world/stats/&lt;uuid&gt;.json</code> on your server.
                  </p>
                </div>
              ) : (
                <>
                  {/* General */}
                  <RpgStatSection title="General" color="#00f076">
                    {playTimeHours != null && <RpgStatBox label="Play Time" val={`${playTimeHours} h`} />}
                    {leavesGame   != null && <RpgStatBox label="Sessions" val={leavesGame.toLocaleString()} tip="Times disconnected from server" />}
                    {secSinceDeath != null && <RpgStatBox label="Alive Since" val={formatSince(secSinceDeath)} tip="Time since last death" />}
                    {sleepBed     != null && <RpgStatBox label="Slept in Bed" val={sleepBed.toLocaleString()} />}
                    {tradedCount  != null && <RpgStatBox label="Villager Trades" val={tradedCount.toLocaleString()} />}
                    {advDone      != null && <RpgStatBox label="Advancements" val={advTotal ? `${advDone} / ${advTotal}` : advDone} accent />}
                  </RpgStatSection>

                  {/* Combat */}
                  <RpgStatSection title="Combat" color="#ef4444">
                    {playerKills  != null && <RpgStatBox label="Player Kills"   val={playerKills.toLocaleString()} color="var(--red)" />}
                    {playerDeaths != null && <RpgStatBox label="Player Deaths"  val={playerDeaths.toLocaleString()} color="var(--red)" />}
                    {kd           != null && <RpgStatBox label="K/D Ratio"      val={kd} tip="Player kills divided by player deaths" accent />}
                    {mobKills     != null && <RpgStatBox label="Mob Kills"      val={mobKills.toLocaleString()} />}
                    {deaths       != null && <RpgStatBox label="Total Deaths"   val={deaths.toLocaleString()} />}
                    {damageDealt  != null && <RpgStatBox label="Damage Dealt"   val={`${damageDealt} HP`} tip="Raw value divided by 10" />}
                    {damageTaken  != null && <RpgStatBox label="Damage Taken"   val={`${damageTaken} HP`} tip="Raw value divided by 10" />}
                    {topKilledBy  != null && <RpgStatBox label="Top Killer"     val={`${topKilledBy.mob} x${topKilledBy.count}`} />}
                  </RpgStatSection>

                  {/* Movement */}
                  <RpgStatSection title="Movement" color="#f59e0b">
                    {jumps    != null && <RpgStatBox label="Jumps"    val={jumps.toLocaleString()} />}
                    {kmWalked != null && <RpgStatBox label="Walked"   val={`${kmWalked} km`} accent />}
                    {kmSwum   != null && <RpgStatBox label="Swum"     val={`${kmSwum} km`} />}
                    {kmFlown  != null && <RpgStatBox label="Flown"    val={`${kmFlown} km`} />}
                    {kmFallen != null && <RpgStatBox label="Fallen"   val={`${kmFallen} km`} />}
                  </RpgStatSection>

                  {/* Interaction */}
                  <RpgStatSection title="Interaction" color="#8b5cf6">
                    {minedBlocks  != null && <RpgStatBox label="Blocks Mined"   val={minedBlocks.toLocaleString()} accent />}
                    {craftedItems != null && <RpgStatBox label="Items Crafted"  val={craftedItems.toLocaleString()} />}
                    {itemsDropped != null && <RpgStatBox label="Items Dropped"  val={itemsDropped.toLocaleString()} />}
                  </RpgStatSection>

                  <details style={{ marginTop: '0.25rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', userSelect: 'none', padding: '0.4rem 0' }}>
                      Raw stats JSON
                    </summary>
                    <pre style={{
                      fontSize: '0.67rem', maxHeight: 260, overflowY: 'auto',
                      background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)', padding: '0.75rem',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '0.5rem',
                    }}>
                      {JSON.stringify(d.stats, null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </div>
          )}

          {/* ── VITALS (HP + Hunger HUD) ───────────────────────────────────── */}
          {activeSection === 'vitals' && hasPerm('server.players.manage') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              {/* HP Bar */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--red)' }}>
                    Health
                  </span>
                  {health != null && (
                    <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {health} / {maxHealth} HP
                    </span>
                  )}
                </div>

                {/* Kill [left] | Hearts [center] | Heal [right] */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn danger small"
                      onClick={async () => {
                        if (await showConfirm(`Kill ${player.name} in-game?`)) cmd('kill');
                      }}
                    >Kill Player</button>
                  </div>

                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const filled = health != null ? Math.min(Math.max(health - i * 2, 0), 2) : 2;
                      return <Heart key={i} fill={filled} idx={i} />;
                    })}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                    <button
                      className="btn success small"
                      onClick={() => {
                        onOptimisticVitals(maxHealth, food);
                        cmd('heal');
                      }}
                    >Heal to Full</button>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)' }} />

              {/* Hunger Bar */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--orange)' }}>
                    Hunger
                  </span>
                  {food != null && (
                    <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {food} / {maxFood}
                    </span>
                  )}
                </div>

                {/* Starve [left] | Drumsticks [center] | Feed [right] */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn danger small"
                      onClick={async () => {
                        if (await showConfirm(`Set ${player.name}'s hunger to 0?`)) {
                          onOptimisticVitals(health, 0);
                          cmd('starve');
                        }
                      }}
                    >Starve</button>
                  </div>

                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const filled = food != null ? Math.min(Math.max(food - i * 2, 0), 2) : 2;
                      return <Drumstick key={i} fill={filled} idx={i} />;
                    })}
                  </div>

                  <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                    <button
                      className="btn success small"
                      onClick={() => {
                        onOptimisticVitals(health, maxFood);
                        cmd('feed');
                      }}
                    >Restore Hunger</button>
                  </div>
                </div>
              </div>

              {(health == null && food == null) && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', margin: 0 }}>
                  No playerdata file found. Stats appear once the player has logged in at least once.
                </p>
              )}
              {(health != null || food != null) && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', margin: 0 }}>
                  Values are read from the saved playerdata file. They update after the server auto-saves or the player logs out.
                </p>
              )}
            </div>
          )}

          {/* ── MODERATION ────────────────────────────────────────────────── */}
          {activeSection === 'moderation' && hasPerm('server.players.manage') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              <ActionGroup title="Kick">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Kick reason (optional)" value={kickReason}
                    onChange={e => setKickReason(e.target.value)} style={{ flex: '1 1 200px' }} />
                  <button className="btn danger small" onClick={async () => {
                    if (await showConfirm(`Kick ${player.name}?`)) cmd('kick', kickReason || undefined);
                  }}>Kick Player</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Ban / Unban">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Ban reason (optional)" value={banReason}
                    onChange={e => setBanReason(e.target.value)} style={{ flex: '1 1 200px' }} />
                  <button className="btn danger small" onClick={async () => {
                    if (await showConfirm(`Ban ${player.name}?`)) cmd('ban', banReason || undefined);
                  }}>Ban</button>
                  <button className="btn success small" onClick={async () => {
                    if (await showConfirm(`Pardon / unban ${player.name}?`)) cmd('pardon');
                  }}>Unban</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Mute / Unmute" hint="Requires a mute plugin on the server.">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Reason or duration (optional)" value={muteReason}
                    onChange={e => setMuteReason(e.target.value)} style={{ flex: '1 1 200px' }} />
                  <button className="btn outline small" onClick={() => cmd('mute', muteReason || undefined)}>Mute</button>
                  <button className="btn outline small" onClick={() => cmd('unmute')}>Unmute</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Operator">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn outline small" onClick={() => cmd('op')}>Give OP</button>
                  <button className="btn outline small" onClick={() => cmd('deop')}>Remove OP</button>
                </div>
              </ActionGroup>

            </div>
          )}

          {/* ── STATUS ────────────────────────────────────────────────────── */}
          {activeSection === 'status' && hasPerm('server.players.manage') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              <ActionGroup title="Gamemode">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <Select value={gmValue} onChange={e => setGmValue(e.target.value)}>
                      <option value="survival">Survival</option>
                      <option value="creative">Creative</option>
                      <option value="adventure">Adventure</option>
                      <option value="spectator">Spectator</option>
                    </Select>
                  </div>
                  <button className="btn primary small" onClick={() => cmd('gamemode', gmValue)}>Set Gamemode</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Apply Effect" hint="Format: minecraft:effect_id duration_seconds amplifier">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="minecraft:speed 30 1" value={effectValue}
                    onChange={e => setEffectValue(e.target.value)} style={{ flex: '1 1 220px' }} />
                  <button className="btn primary small" onClick={() => {
                    if (!effectValue.trim()) return toast('Enter an effect', 'error');
                    cmd('effect', effectValue.trim());
                  }}>Apply Effect</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Clear Inventory">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn outline small" onClick={() => cmd('clear')}>Clear Inventory</button>
                </div>
              </ActionGroup>

            </div>
          )}

          {/* ── WORLD ─────────────────────────────────────────────────────── */}
          {activeSection === 'world' && hasPerm('server.players.manage') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              <ActionGroup title="Teleport" hint="Enter X Y Z coordinates or a target player name.">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="100 64 -200  or  PlayerName" value={tpValue}
                    onChange={e => setTpValue(e.target.value)} style={{ flex: '1 1 220px' }} />
                  <button className="btn primary small" onClick={() => {
                    if (!tpValue.trim()) return toast('Enter a destination', 'error');
                    cmd('teleport', tpValue.trim());
                  }}>Teleport</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Give Item" hint="Format: minecraft:item_id amount (e.g. minecraft:diamond_sword 1)">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="minecraft:apple 1" value={giveValue}
                    onChange={e => setGiveValue(e.target.value)} style={{ flex: '1 1 220px' }} />
                  <button className="btn primary small" onClick={() => {
                    if (!giveValue.trim()) return toast('Enter an item', 'error');
                    cmd('give', giveValue.trim());
                  }}>Give Item</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Add XP">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="number" value={xpValue} onChange={e => setXpValue(e.target.value)}
                    style={{ width: 120 }} min={1} placeholder="100" />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>points</span>
                  <button className="btn primary small" onClick={() => {
                    if (!xpValue) return toast('Enter XP amount', 'error');
                    cmd('xp', xpValue);
                  }}>Add XP</button>
                </div>
              </ActionGroup>

              <ActionGroup title="Wipe Player Data" hint="Permanently deletes playerdata .dat, stats JSON and advancements JSON. Server must be stopped first.">
                <button className="btn danger small" onClick={async () => {
                  if (await showConfirm(`PERMANENTLY wipe all saved data for ${player.name}? This cannot be undone.`)) cmd('wipe');
                }}>Wipe All Data</button>
              </ActionGroup>

            </div>
          )}

        </div>{/* end body */}
      </div>
    </div>
  );
}

/* ── Reusable visual components ──────────────────────────────────────────── */

/** Small header pill with label and value */
function QuickPill({ label, val, color }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '6px 12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minWidth: 70,
    }}>
      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: color || 'var(--text-primary)', marginTop: 2 }}>{val}</span>
    </div>
  );
}

/** A stat section with colored accent and section header */
function RpgStatSection({ title, color, children }) {
  const kids = Array.isArray(children) ? children.filter(Boolean) : (children ? [children] : []);
  if (!kids.length) return null;
  return (
    <div>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        marginBottom: '0.85rem',
        paddingBottom: '0.5rem',
        borderBottom: `2px solid ${color}33`,
      }}>
        <span style={{
          fontSize: '0.72rem', fontWeight: 800,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: color || 'var(--text-muted)',
        }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: `${color}22` }} />
      </div>

      {/* Stat grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
        gap: '0.65rem',
      }}>
        {kids}
      </div>
    </div>
  );
}

/** Individual RPG-style stat card */
function RpgStatBox({ label, val, tip, color, accent }) {
  return (
    <div
      title={tip || ''}
      style={{
        background: accent ? 'var(--accent-subtle)' : 'var(--bg-input)',
        border: `1px solid ${accent ? 'var(--accent-glow)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '0.85rem 1rem',
        cursor: tip ? 'help' : 'default',
        display: 'flex', flexDirection: 'column', gap: '0.3rem',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
      </div>
      <div style={{
        fontSize: '1.15rem', fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: color || (accent ? 'var(--accent)' : 'var(--text-primary)'),
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{val}</div>
    </div>
  );
}

/** HUD bar (health / hunger style) */
function HudBar({ value, max, color, glowColor, bg }) {
  const pct = Math.min(Math.max(value / max, 0), 1) * 100;
  return (
    <div style={{
      height: 12, borderRadius: 6,
      background: bg || 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.07)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: color,
        boxShadow: `0 0 8px ${glowColor}`,
        borderRadius: 6,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

/** Minecraft-style heart icon — distinct SVG per state, unique clipPath IDs */
function Heart({ fill, idx }) {
  const id = `hh-${idx}`;
  if (fill >= 2) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
        <path
          d="M10 17 C10 17 2 11.5 2 6 C2 3.5 4 2 6.5 2 C8 2 9.2 2.9 10 3.8 C10.8 2.9 12 2 13.5 2 C16 2 18 3.5 18 6 C18 11.5 10 17 10 17Z"
          fill="#ef4444" stroke="#991b1b" strokeWidth="1" strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (fill >= 1) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
        <defs>
          <clipPath id={`${id}-l`}><rect x="0" y="0" width="10" height="20" /></clipPath>
        </defs>
        <path
          d="M10 17 C10 17 2 11.5 2 6 C2 3.5 4 2 6.5 2 C8 2 9.2 2.9 10 3.8 C10.8 2.9 12 2 13.5 2 C16 2 18 3.5 18 6 C18 11.5 10 17 10 17Z"
          fill="#3f3f46" stroke="#52525b" strokeWidth="1" strokeLinejoin="round"
        />
        <path
          d="M10 17 C10 17 2 11.5 2 6 C2 3.5 4 2 6.5 2 C8 2 9.2 2.9 10 3.8 C10.8 2.9 12 2 13.5 2 C16 2 18 3.5 18 6 C18 11.5 10 17 10 17Z"
          fill="#ef4444" stroke="#991b1b" strokeWidth="1" strokeLinejoin="round"
          clipPath={`url(#${id}-l)`}
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
      <path
        d="M10 17 C10 17 2 11.5 2 6 C2 3.5 4 2 6.5 2 C8 2 9.2 2.9 10 3.8 C10.8 2.9 12 2 13.5 2 C16 2 18 3.5 18 6 C18 11.5 10 17 10 17Z"
        fill="#3f3f46" stroke="#52525b" strokeWidth="1" strokeLinejoin="round"
      />
    </svg>
  );
}

/** Minecraft-style drumstick icon — distinct SVG per state, unique clipPath IDs */
function Drumstick({ fill, idx }) {
  const id = `dh-${idx}`;
  const drumPath = "M13 2 C16.5 2 18 4 18 6.5 C18 9.5 15.5 11.5 13 11.5 C11.8 11.5 10.8 11 10 10.3 L5.5 15.5 C5 16.1 4.2 16.3 3.5 15.8 C2.8 15.3 2.7 14.4 3.2 13.8 L7.7 8.6 C7 7.8 6.5 6.8 6.5 5.5 C6.5 3.5 8.5 2 13 2Z";

  if (fill >= 2) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
        <path d={drumPath} fill="#f59e0b" stroke="#b45309" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    );
  }
  if (fill >= 1) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
        <defs>
          <clipPath id={`${id}-t`}><rect x="0" y="0" width="20" height="10" /></clipPath>
        </defs>
        <path d={drumPath} fill="#3f3f46" stroke="#52525b" strokeWidth="1" strokeLinejoin="round" />
        <path d={drumPath} fill="#f59e0b" stroke="#b45309" strokeWidth="1" strokeLinejoin="round" clipPath={`url(#${id}-t)`} />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
      <path d={drumPath} fill="#3f3f46" stroke="#52525b" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** Action group with title bar */
function ActionGroup({ title, hint, children }) {
  return (
    <div style={{
      background: 'var(--bg-input)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '1rem 1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {hint && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Whitelist ───────────────────────────────────────────────────────────── */
function WhitelistTab({ serverId }) {
  const [list, setList]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api(`/api/servers/${serverId}/players/lists/whitelist`); setList(d || []); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [serverId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const t = target.trim();
    if (!t) return toast('Please enter a username or UUID', 'error');
    try {
      await api(`/api/servers/${serverId}/players/lists/whitelist`, { method: 'POST', body: { target: t } });
      toast('Player added to whitelist', 'success');
      setTarget('');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async (name) => {
    if (!(await showConfirm(`Remove ${name} from whitelist?`))) return;
    try {
      await api(`/api/servers/${serverId}/players/lists/whitelist/${name}`, { method: 'DELETE' });
      toast('Player removed from whitelist', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (<>
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Add to Whitelist</h3>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Player Username / UUID</label>
          <input type="text" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. Notch" style={{ width: '100%' }} />
        </div>
        <button className="btn primary" style={{ height: 38 }} onClick={add}>Add Player</button>
      </div>
    </div>
    <div className="card">
      <div className="list-header">
        <div className="col col-wide">Player Name</div>
        <div className="col">UUID</div>
        <div className="col actions">Actions</div>
      </div>
      <div className="list-body">
        {loading ? <p className="text-muted" style={{ padding: '1rem' }}>Loading Whitelist…</p>
          : !list.length ? <div className="list-item"><p className="text-muted">Whitelist is empty.</p></div>
          : list.map(item => (
            <div key={item.uuid || item.name} className="list-item">
              <div className="col col-wide text-mono" data-label="Player">{item.name || 'Unknown'}</div>
              <div className="col text-muted text-mono" style={{ fontSize: '0.8rem' }} data-label="UUID">{item.uuid || '--'}</div>
              <div className="col actions" data-label="Actions">
                <button className="btn danger small" onClick={() => remove(item.name || item.uuid)}>Remove</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  </>);
}

/* ── OPs ─────────────────────────────────────────────────────────────────── */
function OpsTab({ serverId }) {
  const [list, setList]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState('');
  const [level, setLevel] = useState('4');

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api(`/api/servers/${serverId}/players/lists/ops`); setList(d || []); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [serverId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const t = target.trim();
    if (!t) return toast('Please enter a username', 'error');
    try {
      await api(`/api/servers/${serverId}/players/lists/ops`, { method: 'POST', body: { target: t, level: parseInt(level) || 4 } });
      toast('Player opped', 'success');
      setTarget('');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const deop = async (name) => {
    if (!(await showConfirm(`Deop ${name}?`))) return;
    try {
      await api(`/api/servers/${serverId}/players/lists/ops/${name}`, { method: 'DELETE' });
      toast('Player deopped', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (<>
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Make Player Operator</h3>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Player Username</label>
          <input type="text" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. Notch" style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ width: 160, margin: 0 }}>
          <label>Permission Level</label>
          <Select value={level} onChange={e => setLevel(e.target.value)}>
            <option value="4">4 (Full Admin)</option>
            <option value="3">3 (Moderator)</option>
            <option value="2">2 (Game Master)</option>
            <option value="1">1 (No bypass)</option>
          </Select>
        </div>
        <button className="btn primary" style={{ height: 38 }} onClick={add}>OP Player</button>
      </div>
    </div>
    <div className="card">
      <div className="list-header">
        <div className="col col-wide">Player Name</div>
        <div className="col">OP Level</div>
        <div className="col">Bypasses Limit</div>
        <div className="col actions">Actions</div>
      </div>
      <div className="list-body">
        {loading ? <p className="text-muted" style={{ padding: '1rem' }}>Loading Operator List…</p>
          : !list.length ? <div className="list-item"><p className="text-muted">No operators defined.</p></div>
          : list.map(item => (
            <div key={item.uuid || item.name} className="list-item">
              <div className="col col-wide text-mono" data-label="Player">{item.name || 'Unknown'}</div>
              <div className="col" data-label="OP Level">Level {item.level ?? 4}</div>
              <div className="col" data-label="Bypasses Limit">{item.bypassesPlayerLimit ? 'Yes' : 'No'}</div>
              <div className="col actions" data-label="Actions">
                <button className="btn danger small" onClick={() => deop(item.name || item.uuid)}>Deop</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  </>);
}

/* ── Banned Players ──────────────────────────────────────────────────────── */
function BannedPlayersTab({ serverId }) {
  const [list, setList]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api(`/api/servers/${serverId}/players/lists/banned-players`); setList(d || []); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [serverId]);
  useEffect(() => { load(); }, [load]);

  const ban = async () => {
    const t = target.trim();
    if (!t) return toast('Please enter a username', 'error');
    try {
      await api(`/api/servers/${serverId}/players/lists/banned-players`, { method: 'POST', body: { target: t, reason: reason.trim() } });
      toast('Player banned', 'success');
      setTarget(''); setReason('');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const pardon = async (name) => {
    if (!(await showConfirm(`Pardon ${name}?`))) return;
    try {
      await api(`/api/servers/${serverId}/players/lists/banned-players/${name}`, { method: 'DELETE' });
      toast('Player pardoned', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (<>
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Ban Player</h3>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Player Username</label>
          <input type="text" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. GriefingSteve" style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flex: 2, margin: 0 }}>
          <label>Reason</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Griefing / Hacking" style={{ width: '100%' }} />
        </div>
        <button className="btn danger" style={{ height: 38 }} onClick={ban}>Ban Player</button>
      </div>
    </div>
    <div className="card">
      <div className="list-header">
        <div className="col col-wide">Player Name</div>
        <div className="col">Banned By</div>
        <div className="col col-wide">Reason</div>
        <div className="col">Expires</div>
        <div className="col actions">Actions</div>
      </div>
      <div className="list-body">
        {loading ? <p className="text-muted" style={{ padding: '1rem' }}>Loading Banned Players…</p>
          : !list.length ? <div className="list-item"><p className="text-muted">No banned players.</p></div>
          : list.map(item => (
            <div key={item.uuid || item.name} className="list-item">
              <div className="col col-wide text-mono" data-label="Player">{item.name || 'Unknown'}</div>
              <div className="col" data-label="Banned By">{item.source || 'Admin'}</div>
              <div className="col col-wide text-muted" data-label="Reason">{item.reason || 'Banned by panel'}</div>
              <div className="col" style={{ fontSize: '0.8rem' }} data-label="Expires">{item.expires || 'forever'}</div>
              <div className="col actions" data-label="Actions">
                <button className="btn success small" onClick={() => pardon(item.name || item.uuid)}>Pardon</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  </>);
}

/* ── Banned IPs ──────────────────────────────────────────────────────────── */
function BannedIpsTab({ serverId }) {
  const [list, setList]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api(`/api/servers/${serverId}/players/lists/banned-ips`); setList(d || []); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [serverId]);
  useEffect(() => { load(); }, [load]);

  const ban = async () => {
    const t = target.trim();
    if (!t) return toast('Please enter an IP address', 'error');
    try {
      await api(`/api/servers/${serverId}/players/lists/banned-ips`, { method: 'POST', body: { target: t, reason: reason.trim() } });
      toast('IP banned', 'success');
      setTarget(''); setReason('');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const unban = async (ip) => {
    if (!(await showConfirm(`Unban IP ${ip}?`))) return;
    try {
      await api(`/api/servers/${serverId}/players/lists/banned-ips/${ip}`, { method: 'DELETE' });
      toast('IP unbanned', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (<>
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Ban IP Address</h3>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>IP Address</label>
          <input type="text" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 192.168.1.100" style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flex: 2, margin: 0 }}>
          <label>Reason</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Spamming chat" style={{ width: '100%' }} />
        </div>
        <button className="btn danger" style={{ height: 38 }} onClick={ban}>Ban IP</button>
      </div>
    </div>
    <div className="card">
      <div className="list-header">
        <div className="col col-wide">IP Address</div>
        <div className="col">Banned By</div>
        <div className="col col-wide">Reason</div>
        <div className="col">Expires</div>
        <div className="col actions">Actions</div>
      </div>
      <div className="list-body">
        {loading ? <p className="text-muted" style={{ padding: '1rem' }}>Loading Banned IPs…</p>
          : !list.length ? <div className="list-item"><p className="text-muted">No banned IPs.</p></div>
          : list.map(item => (
            <div key={item.ip || item.name} className="list-item">
              <div className="col col-wide text-mono" data-label="IP">{item.ip || item.name || '--'}</div>
              <div className="col" data-label="Banned By">{item.source || 'Admin'}</div>
              <div className="col col-wide text-muted" data-label="Reason">{item.reason || '--'}</div>
              <div className="col" style={{ fontSize: '0.8rem' }} data-label="Expires">{item.expires || 'forever'}</div>
              <div className="col actions" data-label="Actions">
                <button className="btn success small" onClick={() => unban(item.ip || item.name)}>Unban</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  </>);
}
