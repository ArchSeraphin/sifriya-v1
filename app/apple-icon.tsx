import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f5f1e8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <svg width="124" height="124" viewBox="0 0 32 32" fill="none">
          <rect x="5" y="3" width="22" height="26" rx="2" fill="#3d2f17" />
          <rect x="5" y="3" width="3" height="26" fill="rgba(0,0,0,0.25)" />
          <path
            d="M11 9h12M11 13h12M11 17h8"
            stroke="#e8dcb8"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="16" cy="22" r="1.5" fill="#8a6b1f" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
