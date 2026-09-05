export default function BrandMark({ size = 20, className = "" }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polygon fill="#F8FAFC" points="47,20 12,32 16,78 47,68" />
      <polygon fill="#F8FAFC" points="53,20 88,32 84,78 53,68" />
      <rect fill="#CBD5E1" x="47" y="20" width="6" height="48" />
      <polyline
        fill="none"
        stroke="#F59E0B"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="24,52 44,66 78,26"
      />
    </svg>
  );
}
