type ChainProofLogoProps = {
  size?: number
  className?: string
}

export function ChainProofLogo({ size = 36, className = '' }: ChainProofLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 80"
      role="img"
      aria-label="ChainProof logo"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 26c0-10 8-18 18-18s18 8 18 18-8 18-18 18H22" opacity="0.9" />
        <path d="M98 26c0-10-8-18-18-18s-18 8-18 18 8 18 18 18h18" opacity="0.9" />
        <path d="M26 42h68" opacity="0.8" />
      </g>
      <g fill="currentColor" fontSize="28" fontWeight="700" fontFamily="Segoe UI, Arial, sans-serif">
        <text x="19" y="57">C</text>
        <text x="52" y="57">P</text>
      </g>
    </svg>
  )
}

export default ChainProofLogo
