"use client";

export default function ChartPattern() {
  return (
    <div
      aria-hidden="true"
      className="chart-pattern pointer-events-none fixed inset-0 z-[-1]"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g stroke="currentColor" strokeWidth="0.75" strokeLinecap="round">
          {/* Airway lines — two pass through the VOR nodes below */}
          <path d="M0 88 L1440 838" />
          <path d="M0 700 L1440 150" />
          <path d="M540 0 L640 900" />
          <path d="M1200 0 L980 900" />
          <path d="M0 470 L1440 500" />
          <path d="M180 0 L460 900" />

          {/* VOR node A — (320, 250) */}
          <g>
            <circle cx="320" cy="250" r="7" />
            <circle cx="320" cy="250" r="2.5" />
            <path d="M320 250 L427 213" />
            <path d="M320 250 L445 320" />
            <path d="M320 250 L268 145" />
            <path d="M320 250 L210 330" />
            <path d="M320 250 L320 130" />
            <path d="M320 250 L440 250" />
          </g>

          {/* VOR node B — (1070, 630) */}
          <g>
            <circle cx="1070" cy="630" r="7" />
            <circle cx="1070" cy="630" r="2.5" />
            <path d="M1070 630 L1177 593" />
            <path d="M1070 630 L1165 715" />
            <path d="M1070 630 L1010 530" />
            <path d="M1070 630 L960 690" />
            <path d="M1070 630 L1070 515" />
            <path d="M1070 630 L1190 630" />
          </g>

          {/* Bearing labels (invented) */}
          <g fill="currentColor" stroke="none" fontSize="9" fontWeight="500">
            <text x="434" y="210">026°</text>
            <text x="452" y="332">112°</text>
            <text x="240" y="140">205°</text>
            <text x="196" y="346">291°</text>
            <text x="1184" y="590">075°</text>
            <text x="1173" y="730">168°</text>
            <text x="984" y="524">254°</text>
            <text x="944" y="706">341°</text>
          </g>

          {/* VOR frequency boxes (invented identifiers) */}
          <g>
            <rect x="452" y="118" width="58" height="30" rx="4" />
            <path d="M452 133 L510 133" />
            <g fill="currentColor" stroke="none" fontSize="9" fontWeight="600">
              <text x="464" y="130">PTM</text>
              <text x="461" y="144" fontSize="8.5" fontWeight="400">114.70</text>
            </g>
          </g>
          <g>
            <rect x="1146" y="286" width="58" height="30" rx="4" />
            <path d="M1146 301 L1204 301" />
            <g fill="currentColor" stroke="none" fontSize="9" fontWeight="600">
              <text x="1158" y="298">LRE</text>
              <text x="1155" y="312" fontSize="8.5" fontWeight="400">117.35</text>
            </g>
          </g>

          {/* Waypoint triangles at line intersections (invented) */}
          <g fill="currentColor" stroke="none">
            <path d="M689 431 l6.5 11 h-13 z" />
            <path d="M583 377 l6.5 11 h-13 z" />
            <path d="M1045 485 l6.5 11 h-13 z" />
          </g>
          <g fill="currentColor" stroke="none" fontSize="8" fontWeight="500">
            <text x="700" y="447">WPT02</text>
            <text x="594" y="393">D12</text>
            <text x="1056" y="501">WPT05</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
