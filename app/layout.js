import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { InstallPromptProvider } from "@/context/InstallPromptContext";
import Navbar from "@/components/Navbar";
import RegisterSW from "@/components/RegisterSW";
import RippleEffect from "@/components/RippleEffect";
import PageTransition from "@/components/PageTransition";
import SplashScreen from "@/components/SplashScreen";

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
    { media: "(prefers-color-scheme: light)", color: "#f7f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#14120b" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=EB+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Quiz Hub" />
      </head>
      <body>
        <SplashScreen />
        <AuthProvider>
          <InstallPromptProvider>
            <Navbar />
            <div id="app">
              <PageTransition>{children}</PageTransition>
            </div>
          </InstallPromptProvider>
        </AuthProvider>
        <RegisterSW />
        <RippleEffect />
      </body>
    </html>
  );
}
