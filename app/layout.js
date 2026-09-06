import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import RegisterSW from "@/components/RegisterSW";
import SplashScreen from "@/components/SplashScreen";

// Runs synchronously before first paint so the dark/light theme is applied
// immediately instead of flashing the default theme and then switching
// (previously Navbar set this class in a useEffect, which only runs after
// the first paint — a visible flash + a layout/color repaint on every load).
const THEME_INIT_SCRIPT = `(function(){try{
  var saved = localStorage.getItem("theme");
  var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
}catch(e){}})();`;

export const metadata = {
  title: "Civil Engineering Quiz Hub",
  description: "Practice & Review — Civil Engineering Objective Questions",
  applicationName: "Quiz Hub",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Quiz Hub",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/favicon.ico", sizes: "any" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0C2E4E" },
    { media: "(prefers-color-scheme: light)", color: "#F1EDE1" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Open the connection to the font host immediately instead of
            waiting for the stylesheet to be parsed — shaves off a round
            trip before font download can even start. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Quiz Hub" />
        {/* Applies the saved theme before first paint — avoids a flash of
            the wrong theme and the repaint that used to happen once
            Navbar's effect ran after mount. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <SplashScreen />
        <AuthProvider>
          <Navbar />
          <div id="app">{children}</div>
        </AuthProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
