import './globals.css';

export const metadata = {
  title: 'AMR Sentinel',
  description: 'WHO AWaRe Compliance Agent powered by NVIDIA Nemotron',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
