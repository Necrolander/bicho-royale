import { animals } from '@/lib/game';
// Original geometric portraits, drawn as native SVG rather than downloaded assets.
export function AnimalArt({ id, size = 72 }: { id: number; size?: number }) {
  const a = animals[id - 1],
    bird = [1, 2, 13, 19, 20].includes(id),
    horn = [6, 7, 21, 25].includes(id),
    long = [3, 8, 11].includes(id),
    cat = [14, 16, 22].includes(id);
  const color = [
    '#c8b491',
    '#b4a98a',
    '#afa08a',
    '#7cc8b3',
    '#c4a076',
    '#d8c8ab',
    '#e0d4bd',
    '#c8a16a',
    '#6ca991',
    '#d5c8b8',
    '#a97450',
    '#9da5a5',
    '#e7b063',
    '#beb7aa',
    '#69987b',
    '#d8b275',
    '#ae8b63',
    '#dfa5a5',
    '#70aa9f',
    '#c29d7c',
    '#b99b73',
    '#dcaa67',
    '#a28669',
    '#bd9972',
    '#d4c7ad',
  ][id - 1];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Ilustração de ${a.name}`}
    >
      <defs>
        <radialGradient id={`a${id}`}>
          <stop stopColor={color} />
          <stop offset="1" stopColor="#2b2929" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="#161f27" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="#d4af37" opacity=".18" />
      {id === 4 ? (
        <>
          <path
            d="M48 49C0 1 5 69 43 62C14 92 56 97 49 59M52 49C100 1 95 69 57 62C86 92 44 97 51 59"
            fill={color}
            stroke="#d7b967"
            strokeWidth="2"
          />
          <path d="M50 35v39m0-35-9-12m9 12 9-12" stroke="#f5d77a" strokeWidth="3" />
          <circle cx="26" cy="45" r="7" fill="#162a2a" />
          <circle cx="74" cy="45" r="7" fill="#162a2a" />
        </>
      ) : id === 9 ? (
        <>
          <path
            d="M30 73C88 92 87 49 48 57S22 31 56 33"
            fill="none"
            stroke={color}
            strokeWidth="17"
          />
          <ellipse cx="58" cy="31" rx="18" ry="12" fill={color} />
          <circle cx="64" cy="28" r="3" fill="#090b12" />
          <path d="m73 34 10 3 4-4m-4 4 4 4" fill="none" stroke="#d47c6c" strokeWidth="2" />
        </>
      ) : id === 15 ? (
        <>
          <path d="M17 69 30 38 52 29 73 46 84 65 59 79Z" fill={color} />
          <path d="m28 47 10-8 11 8 12-8 10 8" fill="none" stroke="#466d52" strokeWidth="5" />
          <ellipse cx="50" cy="66" rx="25" ry="12" fill="#aac19b" />
          <circle cx="36" cy="49" r="4" />
          <circle cx="62" cy="49" r="4" />
          <path d="M33 65h35" stroke="#172720" strokeWidth="3" />
        </>
      ) : (
        <>
          {id === 19 &&
            Array.from({ length: 7 }, (_, i) => (
              <ellipse
                key={i}
                cx="50"
                cy="29"
                rx="8"
                ry="25"
                fill={i % 2 ? '#397e70' : '#2c625a'}
                stroke="#c6ae5a"
                transform={`rotate(${(i - 3) * 23} 50 60)`}
              />
            ))}
          {id === 16 && (
            <path
              d="m50 12 11 7 13-1 5 14 11 8-3 14 3 13-13 6-6 13-15-3-13 6-10-12-13-4-1-15-7-12 10-10 3-14 14 1Z"
              fill="#a47a3e"
            />
          )}
          {id === 24 && (
            <path
              d="M33 39 27 15 15 9m12 13-13 1m55 15 7-24 11-7m-12 15 14 1"
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
            />
          )}
          {horn && (
            <path
              d="M35 37C17 29 19 13 22 12C27 27 31 26 37 28M65 37C83 29 81 13 78 12C73 27 69 26 63 28"
              fill={id === 7 ? '#aa9371' : '#eadcb4'}
            />
          )}
          {id === 10 ? (
            <>
              <ellipse cx="36" cy="25" rx="9" ry="23" fill={color} transform="rotate(-12 36 25)" />
              <ellipse cx="64" cy="25" rx="9" ry="23" fill={color} transform="rotate(12 64 25)" />
              <path d="M36 10v29M64 10v29" stroke="#bfa5a0" strokeWidth="6" />
            </>
          ) : (
            !bird && (
              <>
                <ellipse
                  cx="25"
                  cy={long ? 31 : 42}
                  rx={id === 12 ? 19 : 12}
                  ry={long ? 23 : 15}
                  fill={color}
                  transform={`rotate(-${cat ? 30 : 20} 25 40)`}
                />
                <ellipse
                  cx="75"
                  cy={long ? 31 : 42}
                  rx={id === 12 ? 19 : 12}
                  ry={long ? 23 : 15}
                  fill={color}
                  transform={`rotate(${cat ? 30 : 20} 75 40)`}
                />
              </>
            )
          )}
          {cat && <path d="m25 43-2-23 22 16m10 0 22-16-2 23" fill={color} />}
          <ellipse
            cx="50"
            cy={bird ? 53 : 56}
            rx={bird ? 21 : long ? 23 : 28}
            ry={bird ? 27 : long ? 30 : 27}
            fill={`url(#a${id})`}
          />
          {id === 25 && (
            <>
              <path d="m31 35 12 2-5 18-14 3" fill="#373939" />
              <path d="m60 31 15 10-5 18-14-8" fill="#373939" />
            </>
          )}
          {id === 22 && (
            <path
              d="m30 39 12 8-14 0m42-8-12 8 14 0M50 30v14m-23 13 14 5m32-5-14 5"
              stroke="#3b342e"
              strokeWidth="4"
            />
          )}
          {id === 13 && (
            <path d="M37 31C29 8 42 9 44 23C45 0 57 8 55 25C73 9 72 28 62 32" fill="#b95141" />
          )}
          {id === 20 && <path d="M45 36C39 24 60 22 63 34L67 48" fill="#b95141" />}
          <ellipse cx="39" cy="50" rx="3.5" ry="4" fill="#080b12" />
          <ellipse cx="61" cy="50" rx="3.5" ry="4" fill="#080b12" />
          <circle cx="40" cy="49" r="1" fill="#fff" />
          <circle cx="62" cy="49" r="1" fill="#fff" />
          {bird ? (
            <path d="m41 61 18 0-9 12Z" fill="#deb25b" />
          ) : id === 12 ? (
            <path
              d="M46 61C40 90 68 90 66 74"
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
            />
          ) : (
            <>
              <ellipse
                cx="50"
                cy="68"
                rx={id === 18 ? 17 : long ? 19 : 15}
                ry="12"
                fill={id === 18 || id === 25 ? '#d7afa1' : '#d0bf9c'}
              />
              <path
                d={id === 18 || id === 25 ? 'M43 67v4m14-4v4' : 'm45 64 10 0-5 6Z'}
                fill="#292d2d"
                stroke="#292d2d"
                strokeWidth="3"
              />
              <path d="m50 70 0 5m-8 0q8 6 16 0" fill="none" stroke="#565145" strokeWidth="1.5" />
              {cat && <path d="m29 65 13 3m-14 6 14-2m29-7-13 3m14 6-14-2" stroke="#e3d1ac" />}
            </>
          )}
          {id === 6 && <path d="m43 79 7 12 7-12" fill="#d6c5a4" />}
        </>
      )}
    </svg>
  );
}
