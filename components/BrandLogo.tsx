"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

export function BrandLogo({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string>(BRAND.assets.yextLogoCdn);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => {
        if (src !== BRAND.assets.yextLogoLocal) {
          setSrc(BRAND.assets.yextLogoLocal);
        }
      }}
    />
  );
}
