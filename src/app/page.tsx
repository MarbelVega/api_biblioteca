export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '4rem auto' }}>
      <h1>API Biblioteca UREAL</h1>
      <p><a href="/api/auth/google">Iniciar sesión con Google</a></p>
      <p><a href="/api/auth/me">Ver mi sesión</a> · <a href="/api/libros">Libros</a></p>
    </main>
  );
}
