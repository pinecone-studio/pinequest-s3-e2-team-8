import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PineExam - Pinecone Academy LMS",
  description: "Online Exam & Learning Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="mathjax-config" strategy="beforeInteractive">
          {`
            window.MathJax = {
              loader: {
                load: ['[tex]/ams', '[tex]/mhchem']
              },
              tex: {
                inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
                displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
                processEscapes: true,
                packages: { '[+]': ['ams', 'mhchem'] }
              },
              options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
              },
              startup: {
                typeset: false
              }
            };
          `}
        </Script>
        <Script
          id="mathjax-script"
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
