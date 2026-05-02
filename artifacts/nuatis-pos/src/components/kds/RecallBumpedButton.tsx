import type { LastBumped } from "./KdsScreen";

interface Props {
  lastBumped: LastBumped | null;
  onRecall: () => void;
}

/**
 * Recall Last Bumped — single-item in-memory undo for the KDS operator.
 *
 * Client-side only: restores the item's bumped state in the UI.
 * The server-side bump_at / status = 'bumped' is NOT reversed (no un-bump
 * endpoint this batch). If the KDS tab is closed, the bump is permanent.
 */
export function RecallBumpedButton({ lastBumped, onRecall }: Props) {
  if (!lastBumped) return null;

  return (
    <button
      onClick={onRecall}
      className="
        flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600
        text-zinc-300 hover:text-white
        font-mono text-xs tracking-wide
        transition-colors
      "
      title="Restore last bumped item (in-memory only)"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      Recall Last Bumped
    </button>
  );
}
