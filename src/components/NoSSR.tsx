"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

type AnyProps = { [k: string]: any };

export default function NoSSR<T extends AnyProps>(
  importer: () => Promise<{ default: ComponentType<T> }>
) {
  const Loading = (props: AnyProps) => {
    const h =
      typeof props?.mapHeight === "number"
        ? `${props.mapHeight}px`
        : props?.mapHeight || "calc(100vh - 120px)";
    const r = props?.radius ?? 16;
    return (
      <div
        style={{
          width: "100%",
          height: h,
          borderRadius: r,
          overflow: "hidden",
          background: "transparent",
        }}
      />
    );
  };

  return dynamic(importer, {
    ssr: false,
    loading: (p: any) => <Loading {...(p as any)} />,
  }) as unknown as ComponentType<T>;
}
