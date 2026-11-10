'use client';
import { animals, modes, type ModeId } from '@/lib/game';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { AnimalArt } from './AnimalArt';
type Entry = {
  mode: ModeId;
  selection: string[];
  points: number;
  created_at: string;
  outcome: { win: boolean; explanation: string } | null;
};
export default function PersonalInsights({ entries }: { entries: Entry[] }) {
  const activity = new Map<string, { day: string; points: number; entries: number }>();
  const choices = animals.map((a) => ({ ...a, count: 0 }));
  for (const e of entries) {
    const day = e.created_at.slice(0, 10),
      existing = activity.get(day) || { day, points: 0, entries: 0 };
    existing.entries++;
    existing.points += e.points;
    activity.set(day, existing);
    if (modes.find((m) => m.id === e.mode)?.kind === 'group')
      for (const s of e.selection) choices[Number(s) - 1].count++;
  }
  const days = [...activity.values()].sort((a, b) => a.day.localeCompare(b.day));
  const favorites = choices
    .filter((a) => a.count)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return (
    <div className="bottom-grid personal-insights">
      <section className="surface">
        <span className="eyebrow">SEU CAMINHO ROYALE</span>
        <h2>Atividade pessoal</h2>
        <p>Participações registradas por dia. Dados da sua conta.</p>
        {!entries.length ? (
          <div className="empty">
            <p>Participe de uma rodada para acompanhar sua atividade aqui.</p>
          </div>
        ) : (
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days}>
                <XAxis dataKey="day" tickFormatter={(d) => String(d).slice(5)} stroke="#89978f" />
                <YAxis allowDecimals={false} stroke="#89978f" />
                <Tooltip contentStyle={{ background: '#131d22', border: '1px solid #6c5c34' }} />
                <Area dataKey="entries" name="Participações" stroke="#d4af37" fill="#d4af3725" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section className="surface">
        <span className="eyebrow">SUAS PREFERÊNCIAS EM NÚMEROS</span>
        <h2>Animais mais selecionados</h2>
        {!favorites.length ? (
          <div className="empty">
            <p>Suas seleções de grupo aparecerão aqui.</p>
          </div>
        ) : (
          <>
            <div className="personal-favorites">
              {favorites.map((a) => (
                <div key={a.id}>
                  <AnimalArt id={a.id} size={43} />
                  <span>{a.name}</span>
                  <b>{a.count} escolha(s)</b>
                </div>
              ))}
            </div>
            <div className="chart compact">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={favorites}>
                  <XAxis dataKey="name" stroke="#89978f" fontSize={10} />
                  <YAxis allowDecimals={false} stroke="#89978f" />
                  <Tooltip contentStyle={{ background: '#131d22', border: '1px solid #6c5c34' }} />
                  <Bar dataKey="count" name="Seleções" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
