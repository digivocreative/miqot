import { useId } from 'react';
import { normalizeFlightStatus } from '../lib/flightStatusPresentation';

interface FlightRouteLineProps {
  flight: {
    status?: string | null;
    progress?: number | null;
  };
  className?: string;
}

/**
 * Shared route-status visualization used by both Dashboard and public flight
 * pages. Keeping the status branches here prevents their animations drifting.
 */
export default function FlightRouteLine({ flight, className = '' }: FlightRouteLineProps) {
  const w = 100;
  const h = 16;
  // Pulse pesawat/checkmark mencapai radius 6 (+ stroke). Beri inset cukup
  // supaya marker pada progress 0%/100% tidak terpotong oleh batas viewBox SVG.
  const markerEdgeInset = 8;
  const x1 = markerEdgeInset;
  const x2 = w - markerEdgeInset;
  const status = normalizeFlightStatus(flight.status);
  const progress = Number(flight.progress);
  const prog = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress / 100 : 0));
  const px = x1 + (x2 - x1) * prog;
  const traveledSpan = Math.max(px - x1, 1);
  const auroraGradientId = `flight-route-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={`flex-shrink-0 ${className}`.trim()}
      aria-hidden="true"
    >
      {status === 'en-route' && (
        <defs>
          <linearGradient
            id={auroraGradientId}
            gradientUnits="userSpaceOnUse"
            x1={x1 - traveledSpan}
            y1={h / 2}
            x2={x1}
            y2={h / 2}
          >
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="36%" stopColor="#3b82f6" />
            <stop offset="58%" stopColor="#67e8f9" />
            <stop offset="72%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#2563eb" />
            <animate attributeName="x1" values={`${x1 - traveledSpan};${px}`} dur="2.8s" repeatCount="indefinite" />
            <animate attributeName="x2" values={`${x1};${px + traveledSpan}`} dur="2.8s" repeatCount="indefinite" />
          </linearGradient>
        </defs>
      )}

      {/* Terjadwal: marching ants */}
      {status === 'scheduled' && (
        <line
          x1={x1}
          y1={h / 2}
          x2={x2}
          y2={h / 2}
          stroke="#d1d5db"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="dark:stroke-slate-600"
        >
          <animate attributeName="stroke-dashoffset" values="0;-16" dur="1s" repeatCount="indefinite" />
        </line>
      )}

      {/* En-route: solid traveled route plus the flowing aurora */}
      {status === 'en-route' && (
        <>
          <line
            x1={x1}
            y1={h / 2}
            x2={x2}
            y2={h / 2}
            stroke="#e5e7eb"
            strokeWidth="1.5"
            strokeDasharray="3 2"
            className="dark:stroke-slate-600"
          />
          <line
            x1={x1}
            y1={h / 2}
            x2={px}
            y2={h / 2}
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1={x1}
            y1={h / 2}
            x2={px}
            y2={h / 2}
            stroke={`url(#${auroraGradientId})`}
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.18"
          />
          <line
            x1={x1}
            y1={h / 2}
            x2={px}
            y2={h / 2}
            stroke={`url(#${auroraGradientId})`}
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.95"
          />
        </>
      )}

      {/* Delay: red marching ants */}
      {status === 'delayed' && (
        <line
          x1={x1}
          y1={h / 2}
          x2={x2}
          y2={h / 2}
          stroke="#fca5a5"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="dark:stroke-red-800"
        >
          <animate attributeName="stroke-dashoffset" values="0;-16" dur="1s" repeatCount="indefinite" />
        </line>
      )}

      {status === 'landed' && (
        <line
          x1={x1}
          y1={h / 2}
          x2={x2}
          y2={h / 2}
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}

      {status === 'cancelled' && (
        <line
          x1={x1}
          y1={h / 2}
          x2={x2}
          y2={h / 2}
          stroke="#d1d5db"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          className="dark:stroke-slate-600"
        />
      )}

      <circle cx={x1} cy={h / 2} r="3" fill="#10b981" stroke="white" strokeWidth="1.5" />

      {status !== 'landed' && (
        <circle
          cx={x2}
          cy={h / 2}
          r="3"
          fill={status === 'cancelled' ? '#d1d5db' : '#cbd5e1'}
          stroke="white"
          strokeWidth="1.5"
          className="dark:fill-slate-500"
        />
      )}

      {status === 'en-route' && (
        <>
          <circle cx={px} cy={h / 2} r="5" fill="#3b82f6" stroke="white" strokeWidth="1.5">
            <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <text
            x={px}
            y={h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7"
            fill="white"
          >
            ✈
          </text>
        </>
      )}

      {status === 'landed' && (
        <g transform={`translate(${x2 - 5}, ${h / 2 - 5})`}>
          <circle cx="5" cy="5" r="5" fill="#10b981" stroke="white" strokeWidth="1.5">
            <animate attributeName="r" values="3;6;5" dur="0.6s" fill="freeze" />
          </circle>
          <path
            d="M3 5.5 L4.5 7 L7.5 3.5"
            stroke="white"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0"
          >
            <animate attributeName="opacity" values="0;0;1" dur="0.6s" fill="freeze" />
          </path>
        </g>
      )}
    </svg>
  );
}
