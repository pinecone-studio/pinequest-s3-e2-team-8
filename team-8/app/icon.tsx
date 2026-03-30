import { ImageResponse } from "next/og";
import PineconeLogo from "@/app/_icons/PineconeLogo";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          color: "#4078C1",
        }}
      >
        <PineconeLogo width={26} height={23} />
      </div>
    ),
    size
  );
}
