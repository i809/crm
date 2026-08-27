export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>RubberTrack Platform</h1>
      <p>Multi-tenant CRM + Dashboard + CMS</p>
      <ul>
        <li><a href="http://localhost:8055">Directus Admin</a></li>
        <li><a href="http://localhost:4000/health">BFF Health</a></li>
        <li><a href="http://localhost:5000/health">AI Service Health</a></li>
      </ul>
    </main>
  );
}
