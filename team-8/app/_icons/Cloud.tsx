import * as React from "react";
const Cloud = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={159}
    height={121}
    fill="none"
    {...props}
  >
    <g clipPath="url(#a)">
      <path
        fill="#F0F2FF"
        fillRule="evenodd"
        d="M163.871-41.79c25.826 1.806 45.297 24.205 43.491 50.03-1.806 25.826-24.205 45.297-50.03 43.492a46.715 46.715 0 0 1-18.724-5.353c-4.275 23.131-25.334 39.863-49.357 38.184-25.826-1.806-45.297-24.206-43.491-50.031a47.09 47.09 0 0 1 1.592-9.298 37.736 37.736 0 0 1-.938-.054C25.754 23.735 10.176 5.815 11.62-14.845c1.444-20.66 19.364-36.237 40.024-34.793l112.226 7.848Z"
        clipRule="evenodd"
      />
      <path
        stroke="#fff"
        strokeLinecap="round"
        strokeWidth={1.791}
        d="M158.197 39.262c18.939 1.325 35.365-12.955 36.689-31.893"
      />
    </g>
    <defs>
      <clipPath id="a">
        <path
          fill="#fff"
          d="m0 106.514 199.513 13.951 13.951-199.512L13.951-93z"
        />
      </clipPath>
    </defs>
  </svg>
);
export default Cloud;
