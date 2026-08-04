/** Hand-drawn icons. 15px stroke set, `currentColor`, no icon library. */

type IconProps = { className?: string | undefined };

function Svg({ children, className }: IconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

import cairnMarkUrl from "../assets/cairn-icon.svg";

/** The brand mark: the Cairn logo glyph. Black source, inverted to white by CSS in the dark theme. */
export function CairnMark({ className }: IconProps): JSX.Element {
  return <img className={className} src={cairnMarkUrl} alt="" aria-hidden="true" />;
}

export function ReviewIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h4" />
      <path d="M11 11.2l1.5 1.6 3-3.4" />
    </Svg>
  );
}

export function CairnIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <ellipse cx="8" cy="12.6" rx="5.2" ry="1.7" />
      <ellipse cx="8" cy="8.4" rx="3.7" ry="1.5" />
      <ellipse cx="8" cy="4.4" rx="2.3" ry="1.3" />
    </Svg>
  );
}

export function EscalationIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M4 14V2.8" />
      <path d="M4 3.2h8.2l-1.7 2.6 1.7 2.6H4" />
    </Svg>
  );
}

export function RunsIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M1.5 8h3l1.6-4 2.4 8 1.6-4h4.4" />
    </Svg>
  );
}

export function FolderIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M1.8 12.5v-9h4l1.4 1.8h7v7.2z" />
    </Svg>
  );
}

export function PlusIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </Svg>
  );
}

export function PlayIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="13" height="13">
      <path d="M4.6 3.1l8 4.6a.35.35 0 010 .6l-8 4.6a.35.35 0 01-.6-.3V3.4a.35.35 0 01.6-.3z" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

export function MoonIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M13.4 9.6A5.6 5.6 0 016.4 2.6a5.8 5.8 0 107 7z" />
    </Svg>
  );
}

export function SunIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.2v1.4M8 13.4v1.4M1.2 8h1.4M13.4 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
    </Svg>
  );
}

export function ExternalIcon({ className }: IconProps): JSX.Element {
  return (
    <Svg className={className}>
      <path d="M9.5 2.5H13.5V6.5" />
      <path d="M13.5 2.5L7.8 8.2" />
      <path d="M12.4 9.6v3.9H2.5V3.6h4" />
    </Svg>
  );
}
