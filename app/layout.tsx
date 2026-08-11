import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"GeoList — ZIP targeting workspace",description:"Turn state, county, and city requests into clean, copy-ready ZIP lists.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}