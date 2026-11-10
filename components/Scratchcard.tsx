'use client';
import { formatBRL, displayPrizeLabel } from '@/lib/money';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Coins, RotateCcw, Ticket } from 'lucide-react';
import type { ScratchConfig, ScratchGame } from '@/lib/scratchcards';
import { PrizeImage } from './PrizeImage';

type ScratchResult = {
  id: string;
  price_points: number;
  prize_points: number;
  prize_label: string;
  created_at: string;
};
type ScratchSymbol = { icon: string; label: string; points: number; image?: string };

function shuffleSymbols(symbols: ScratchSymbol[], key: string) {
  const shuffled = [...symbols];
  let seed = [...key].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
  for (let index = shuffled.length - 1; index > 0; index--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export default function Scratchcard({
  config,
  points,
  history,
  registered,
  request,
  onRefresh,
  onRegister,
  onDeposit,
  notify,
}: {
  config: ScratchConfig;
  points: number;
  history: ScratchResult[];
  registered: boolean;
  request: (path: string, body?: unknown) => Promise<unknown>;
  onRefresh: () => Promise<void>;
  onRegister: () => void;
  onDeposit: () => void;
  notify: (message: string) => void;
}) {
  const [card, setCard] = useState<ScratchResult | null>(null);
  const games: ScratchGame[] =
    config.games === undefined
      ? [
          {
            id: 'ouro-vegas',
            name: 'Ouro Vegas',
            tagline: 'Três símbolos iguais liberam o prêmio',
            icon: '👑',
            price: config.price,
            enabled: config.enabled,
            prizes: config.prizes,
          },
        ]
      : config.games.filter((game) => game.enabled);
  const [selectedGame, setSelectedGame] = useState<ScratchGame | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [scratchProgress, setScratchProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keyRef = useRef<string | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const prizeSymbols: ScratchSymbol[] = (selectedGame?.prizes ?? [])
    .filter((prize) => prize.points > 0)
    .map((prize) => ({
      icon: selectedGame?.icon || '👑',
      image: prize.image,
      label: displayPrizeLabel(prize.label, prize.points),
      points: prize.points,
    }));
  const winningSymbol = prizeSymbols.find(
    (symbol) => symbol.points === card?.prize_points,
  );
  const revealSymbols: ScratchSymbol[] = card
    ? card.prize_points > 0 && winningSymbol
      ? shuffleSymbols(
          [
            winningSymbol,
            winningSymbol,
            winningSymbol,
            ...prizeSymbols.filter((symbol) => symbol !== winningSymbol).slice(0, 6),
          ],
          card.id,
        )
      : shuffleSymbols(prizeSymbols.slice(0, 9), card.id)
    : [];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scale = window.devicePixelRatio || 1;
    lastPoint.current = null;
    setScratchProgress(0);
    dragging.current = false;
    canvas.width = 420 * scale;
    canvas.height = 420 * scale;
    ctx.scale(scale, scale);
    const gradient = ctx.createLinearGradient(0, 0, 420, 420);
    gradient.addColorStop(0, '#62666c');
    gradient.addColorStop(0.18, '#e7e6df');
    gradient.addColorStop(0.42, '#92969c');
    gradient.addColorStop(0.66, '#f3f1e8');
    gradient.addColorStop(0.86, '#888d94');
    gradient.addColorStop(1, '#555a61');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 420, 420);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 420, 420);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.23)';
    ctx.lineWidth = 1;
    for (let i = -420; i < 800; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 420, 420);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(35,39,44,.18)';
    for (let i = 0; i < 480; i++) {
      const x = (i * 67) % 420;
      const y = (i * 43) % 420;
      ctx.beginPath();
      ctx.arc(x, y, (i % 4) / 2 + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(30,34,38,.68)';
    ctx.fillRect(0, 0, 420, 48);
    ctx.fillStyle = '#f5ce68';
    ctx.textAlign = 'center';
    ctx.font = '900 12px system-ui';
    ctx.fillText(`${selectedGame?.name.toUpperCase() ?? 'BICHOS VEGAS'}  •  RASPADINHA`, 210, 30);
    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 55, 404, 355);
    ctx.fillStyle = '#22262b';
    ctx.font = '900 20px system-ui';
    ctx.fillText('RASPE OS 9 CAMPOS', 210, 210);
    ctx.font = '700 11px system-ui';
    ctx.fillText('TRÊS SÍMBOLOS IGUAIS REVELAM O PRÊMIO', 210, 236);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.font = '700 10px system-ui';
    ctx.fillText('DESLIZE O DEDO OU O MOUSE', 210, 385);
    ctx.globalCompositeOperation = 'destination-out';
  }, [card?.id, selectedGame?.id]);

  const buy = async (game?: ScratchGame) => {
    if (!registered) {
      onRegister();
      return;
    }
    setBusy(true);
    try {
      keyRef.current ||= crypto.randomUUID();
      const result = (await request('scratchcards', {
        key: keyRef.current,
        gameId: game?.id,
      })) as ScratchResult;
      keyRef.current = null;
      setCard(result);
      setRevealed(false);
      await onRefresh();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const erase = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!card || revealed) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 420;
    const y = ((event.clientY - rect.top) / rect.height) * 420;
    ctx.lineWidth = event.pressure ? 42 + event.pressure * 10 : 48;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastPoint.current = { x, y };
    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.fill();
  };

  const checkScratch = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || revealed) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let total = 0;
    for (let y = 0; y < canvas.height; y += 8) {
      for (let offset = 3; offset < canvas.width * 4; offset += 32) {
        total++;
        if (pixels[y * canvas.width * 4 + offset] < 40) clear++;
      }
    }
    const progress = Math.round((clear / total) * 100);
    setScratchProgress(progress);
    if (progress >= 38) setRevealed(true);
  };

  return (
    <div className="scratch-page">
      <section className="surface scratch-hero">
        <span className="eyebrow">
          <Ticket size={16} /> BICHOS VEGAS
        </span>
        <h2>Raspadinha Vegas</h2>
        <p>Compre com saldo, raspe o cartão e veja na hora o resultado.</p>
        <div className="scratch-purchase">
          <span>
            <Coins size={18} /> Escolha um cartão e confira o preço antes de jogar
          </span>
        </div>
        <small>
          Saldo: {formatBRL(points)} · sem valor monetário ou saque.
        </small>
        {!config.enabled && !config.games?.some((game) => game.enabled) && (
          <p className="scratch-paused">A raspadinha está temporariamente pausada.</p>
        )}
      </section>

      {!card && !selectedGame && (
        <section className="scratch-catalog" aria-label="Escolha uma raspadinha">
          <div className="section-heading tight">
            <div>
              <span className="eyebrow">ESCOLHA SEU JOGO</span>
              <h2>Raspadinhas disponíveis</h2>
            </div>
          </div>
          <div className="scratch-game-grid">
            {games.map((game) => (
              <article className="scratch-game-card" key={game.id}>
                <div className="scratch-game-cover">
                  {game.image ? <img src={game.image} alt="" /> : <span>{game.icon}</span>}
                  <small>BICHOS VEGAS</small>
                  <b>{game.name.toUpperCase()}</b>
                  <i>RASPE E DESCUBRA</i>
                </div>
                <div className="scratch-game-info">
                  <div>
                    <h3>{game.name}</h3>
                    <p>{game.tagline}</p>
                  </div>
                  <div className="scratch-game-price">
                    <b>{formatBRL(game.price)}</b>
                  </div>
                </div>
                <div className="scratch-game-prize">
                  <span>Prêmios possíveis</span>
                  <b>
                    {game.prizes
                      .filter((prize) => prize.points > 0)
                      .map((prize) => `{formatBRL(prize.points)}`)
                      .join(' · ') || 'Sem prêmios configurados'}
                  </b>
                </div>
                <button className="primary" onClick={() => setSelectedGame(game)}>
                  Ver raspadinha
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectedGame && (
        <section className="scratch-room" aria-live="polite">
          <div className="scratch-match-layout">
            <div className="scratch-match-left">
              <div className={`scratch-match-board ${card ? 'purchased' : ''}`}>
                {card ? (
                  <>
                    <div className="scratch-match-grid scratch-grid-nine">
                      {revealSymbols.map((symbol, index) => (
                        <div className="scratch-match-cell" key={`${card.id}-${index}`}>
                          {symbol.image ? (
                            <PrizeImage src={symbol.image} alt={symbol.label} />
                          ) : (
                            <span>{symbol.icon}</span>
                          )}
                          <small>{symbol.label}</small>
                        </div>
                      ))}
                    </div>
                    {!revealed && (
                      <canvas
                        ref={canvasRef}
                        className="scratch-canvas"
                        aria-label="Raspe os nove quadradinhos para revelar o resultado"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          dragging.current = true;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          erase(event);
                        }}
                        onPointerMove={(event) => {
                          if (dragging.current) erase(event);
                        }}
                        onPointerUp={() => {
                          dragging.current = false;
                          lastPoint.current = null;
                          checkScratch();
                        }}
                        onPointerCancel={() => {
                          dragging.current = false;
                          lastPoint.current = null;
                          checkScratch();
                        }}
                      />
                    )}
                    <span className="scratch-ticket-number">Nº {card.id.slice(0, 6).toUpperCase()}</span>
                  </>
                ) : (
                  <>
                    <div className="scratch-match-grid scratch-grid-nine">
                      {Array.from({ length: 9 }, (_, index) => (
                        <div className="scratch-match-cell covered" key={index}>
                          <span>★</span>
                        </div>
                      ))}
                    </div>
                    <div className="scratch-acquire-overlay">
                      <span className="scratch-acquire-icon">◉</span>
                      <b>ADQUIRA!</b>
                      <p>Compre sua ficha e raspe os 9 quadradinhos<br />para ver o resultado.</p>
                    </div>
                  </>
                )}
              </div>
              <div className="scratch-match-actions">
                <button
                  className="scratch-buy-button"
                  disabled={busy || !config.enabled || (registered && points < selectedGame.price)}
                  onClick={() => {
                    if (card && !revealed) return;
                    if (card) setCard(null);
                    setRevealed(false);
                    void buy(selectedGame);
                  }}
                >
                  <span>♟</span> {busy ? 'Preparando…' : card ? 'Comprar outro' : 'Comprar por'}
                  <b>{formatBRL(selectedGame.price)}</b>
                </button>
                <button
                  className="scratch-lightning"
                  aria-label="Revelar resultado"
                  disabled={!card || revealed}
                  onClick={() => { setRevealed(true); setScratchProgress(100); }}
                >
                  ⚡
                </button>
                <button className="scratch-auto" onClick={() => { setCard(null); setRevealed(false); setSelectedGame(null); }}>
                  <RotateCcw size={17} /> Voltar aos cartões
                </button>
              </div>
              {card && !revealed && <p className="scratch-progress">Área raspada: {scratchProgress}% · raspe com o mouse ou toque</p>}
              {card && revealed && <p className="scratch-confirm"><CheckCircle2 size={17} /> Resultado: {displayPrizeLabel(card.prize_label, card.prize_points)} · {formatBRL(card.prize_points)}</p>}
            </div>
            <div className="scratch-match-right">
              <div className="scratch-promo-banner" style={{ backgroundImage: `linear-gradient(90deg,#251832 0%,#251832cc 48%,#15151544 100%),url("${selectedGame.image || '/scratch-prizes/smartphone.jpg'}")` }}>
                <b>RASPE 3 SÍMBOLOS IGUAIS</b>
                <strong>E VEJA SEU PRÊMIO</strong>
                <small>{selectedGame.name.toUpperCase()} · {formatBRL(selectedGame.price)}</small>
              </div>
              <aside className="scratch-instructions">
                <h2><Ticket size={20} /> {selectedGame.name}</h2>
                <p>Pressione <kbd>Comprar</kbd> para adquirir sua raspadinha.</p>
                <p>Raspe os <b>9 quadradinhos</b> usando o dedo ou o mouse.</p>
                <p>Encontre <b>3 imagens iguais</b> para revelar o prêmio.</p>
                <small>Saldo: {formatBRL(points)}</small>
              </aside>
              <div className="scratch-prize-note">
                <b>✦ &nbsp; Prêmios demonstrativos</b>
                <span>Esta versão usa saldo demonstrativo. As fotos são ilustrativas e não representam produtos resgatáveis.</span>
              </div>
              {registered && points < selectedGame.price && !card && (
                <div className="scratch-insufficient">
                  <small className="scratch-game-disabled">Saldo insuficiente para comprar esta raspadinha.</small>
                  <button className="secondary" onClick={onDeposit}>Ver depósitos</button>
                </div>
              )}
            </div>
          </div>
          <div className="scratch-detail-prizes">
            <h2>Prêmios da raspadinha</h2>
            <div className="scratch-prize-gallery">
              {selectedGame.prizes.filter((prize) => prize.points > 0).map((prize, index) => (
                <article key={`${prize.label}-${index}`}>
                {prize.image ? (
                  <PrizeImage src={prize.image} alt={displayPrizeLabel(prize.label, prize.points)} />
                ) : (
                  <span>{selectedGame.icon}</span>
                )}
                  <b>{displayPrizeLabel(prize.label, prize.points)}</b>
                  <small>{formatBRL(prize.points)} virtuais</small>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="surface scratch-history">
        <div className="section-heading tight">
          <div>
            <span className="eyebrow">SEU HISTÓRICO</span>
            <h2>Raspadinhas anteriores</h2>
          </div>
        </div>
        {!history.length ? (
          <p>Suas raspadinhas aparecerão aqui depois da primeira compra.</p>
        ) : (
          history.map((item) => (
            <div className="recent-row" key={item.id}>
              <span className="recent-icon">
                <Ticket size={20} />
              </span>
              <div>
                <b>{displayPrizeLabel(item.prize_label, item.prize_points)}</b>
                <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
              </div>
              <span className="result-number">
                {formatBRL(item.prize_points)}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
