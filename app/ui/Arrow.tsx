/**
 * The arrow between two numbers, as in "50 [arrow] 55 lb". Drawn because the arrow character is not in the
 * self-hosted font subsets and would fall back to a system font. Screen readers hear "to".
 */
export function Arrow() {
  return (
    <>
      <svg
        width="1em"
        height="0.75em"
        viewBox="0 0 16 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="inline-block flex-none"
      >
        <path d="M1.5 6h13M10 1.5 14.5 6 10 10.5" />
      </svg>
      <span className="sr-only">to</span>
    </>
  );
}
