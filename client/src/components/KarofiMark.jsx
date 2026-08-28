import React from 'react';

/** Biểu tượng giọt nước ôm quả địa cầu, theo đúng tinh thần logo Karofi —
 * dùng `currentColor` để đổi màu qua class Tailwind như icon lucide-react. */
export default function KarofiMark({ className }) {
  return (
    <svg viewBox="0 0 32 36" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 1.6C16 1.6 3.6 16.7 3.6 24.4a12.4 12.4 0 0 0 24.8 0C28.4 16.7 16 1.6 16 1.6Z"
        fill="currentColor"
      />
      <circle cx="16" cy="23.2" r="7.4" fill="none" stroke="white" strokeWidth="1.15" opacity="0.9" />
      <path
        d="M9.2 20.6c2.1 1.7 11.5 1.7 13.6 0M9.2 25.8c2.1-1.7 11.5-1.7 13.6 0M16 15.9v14.6"
        stroke="white"
        strokeWidth="1.05"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}
