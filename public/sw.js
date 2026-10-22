/* Sequenc — Service Worker: permite abrir e usar o app sem internet.
   Estratégias:
   - Arquivos do app (HTML/CSS/JS/ícones): guardados na instalação e atualizados em segundo plano
   - Respostas da API (histórico, exercícios): rede primeiro, com cópia em cache para usar offline
   - Envio de treinos (POST): tratado pela fila offline dentro do app (app.js) */
const VERSION = 'sequenc-v3';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POSTs de treino são gerenciados pela fila no app
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navegação (abrir o app): rede primeiro; sem sinal, usa a cópia salva
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Dados da API: rede primeiro; sem sinal, usa a última resposta guardada
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Estáticos: rede primeiro (atualizações aplicam na hora); sem sinal, usa o cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
