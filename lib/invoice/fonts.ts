import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

// Noto Sans JP (JP subset OTF, ~4.4MB each). Bundled under public/fonts/
// so Vercel ships the files into the serverless function output.
export function registerInvoiceFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "NotoSansJP",
    fonts: [
      { src: path.join(dir, "NotoSansJP-Regular.otf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSansJP-Bold.otf"), fontWeight: 700 },
    ],
  });
  // Disable hyphenation; Japanese text has no word boundaries the default splitter understands.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
