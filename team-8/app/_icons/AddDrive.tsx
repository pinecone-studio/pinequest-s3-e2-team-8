import * as React from "react";

function AddDrive(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g clipPath="url(#clip0_298_1044)">
        <path
          d="M7.708 3.52L1.148 15l3.42 5.99 6.56-11.47-3.42-6zM13.348 15h-3.62l-3.43 6h8.24a5.93 5.93 0 01-1.19-6zm6.65 1v-3h-2v3h-3v2h3v3h2v-3h3v-2h-3zm.71-4.75L15.418 2h-6.84v.01l6.15 10.77a5.99 5.99 0 015.98-1.53z"
          fill="#575555"
        />
      </g>
      <defs>
        <clipPath id="clip0_298_1044">
          <path fill="#fff" d="M0 0H24V24H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}

export default AddDrive;
