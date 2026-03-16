export const metadata = {
  title: 'AMR Sentinel',
  description: 'WHO AWaRe Compliance Agent powered by NVIDIA Nemotron',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#0F0F0F' }}>
        {children}
      </body>
    </html>
  );
}
