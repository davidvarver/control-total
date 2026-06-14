"use client";

import { useState } from "react";

type ProductThumbnailProps = {
  imageUrl?: string | null;
  label: string;
  size?: "sm" | "md";
};

export function ProductThumbnail({
  imageUrl,
  label,
  size = "md",
}: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === "sm" ? "h-10 w-10 text-[10px]" : "h-14 w-14 text-xs";

  return (
    <span
      className={`ct-product-thumb flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden font-black`}
    >
      {imageUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        getInitials(label)
      )}
    </span>
  );
}

function getInitials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "SKU"
  );
}
