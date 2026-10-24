# 🏋️ Sequenc — Controle de treinos

App simples e bonito para registrar seus exercícios, séries, cargas e repetições da academia.
Tema preto com laranja claro, feito para o **iPhone** (instala na Tela de Início e roda em tela cheia, como um app nativo — sem precisar de APK).

## Funcionalidades

- **Login / contas**: cada pessoa cria seu usuário e senha na primeira tela. Cada conta tem academias, exercícios, treinos e histórico próprios — dá para compartilhar o app com um colega sem misturar os dados.
- **Academias**: cadastre os lugares onde treina (2 ou 3 academias, por exemplo). Escolhe onde vai treinar antes de iniciar, e exercícios, histórico e estatísticas ficam separados por academia.
- **Treino**: inicie um treino, adicione exercícios, registre peso × repetições por série e finalize. O treino em andamento fica salvo no celular mesmo se você fechar a página.
- **Evolução**: no detalhe de cada exercício (aba Exercícios), um gráfico mostra a subida da melhor carga treino a treino.
- **Meta semanal**: defina quantos dias por semana você quer treinar (1 a 7, no cartão da tela inicial). A cada treino finalizado, um círculo laranja é preenchido; ao bater a meta, o app comemora. Treinos em qualquer academia contam.
- **Última carga**: ao escolher um exercício, o app mostra a carga da última vez ("última: 40 kg × 10").
- **Repetir último treino**: recria o treino anterior com as mesmas séries para ajustar e evoluir.
- **Exercícios**: lista padrão com 34 exercícios comuns (editável) agrupados por músculo; cada academia tem sua própria lista. Adicione, renomeie e exclua os seus.
- **Histórico**: todos os treinos finalizados com volume total, com filtro por academia; detalhe série por série.
- **Funciona offline (PWA)**: depois da primeira abertura com internet, o app instala no iPhone e abre sem sinal nenhum. Dá para iniciar treino, ver exercícios, "última carga" e registrar séries sem internet. Treinos finalizados sem sinal entram numa fila no aparelho e sobem sozinhos para o servidor quando a conexão volta (banner laranja mostra o que está pendente).
- **PWA**: ícone próprio, abre em tela cheia no iPhone (Safari → Compartilhar → *Adicionar à Tela de Início*).

## Rodar localmente

```bash
npm install
npm start
```

Abra http://localhost:3000

> Sem `MONGODB_URI` o app roda em **modo demo** (dados em memória, perfeitos para testar).
> Com `MONGODB_URI` definida, tudo é salvo no MongoDB.

## Deploy no Render (grátis) + MongoDB Atlas (grátis)

### 1. MongoDB Atlas (banco free M0)

1. Crie uma conta em https://www.mongodb.com/cloud/atlas e crie um cluster **M0 (Free)**.
2. **Database Access** → crie um usuário/senha.
3. **Network Access** → adicione `0.0.0.0/0` (permitir de qualquer IP — necessário para o Render).
4. Copie a connection string: `mongodb+srv://usuario:senha@cluster0.xxxxx.mongodb.net/sequenc`

### 2. Subir o código no GitHub

```bash
git init
git add .
git commit -m "Sequenc — app de treinos"
git remote add origin https://github.com/SEU-USUARIO/sequenc.git
git push -u origin main
```

### 3. Render

1. Em https://render.com → **New +** → **Web Service** → conecte o repositório.
2. Runtime **Node**, Build `npm install`, Start `npm start` (ou use o `render.yaml` via **Blueprint**).
3. Em **Environment**, adicione:
   - `MONGODB_URI` = a connection string do Atlas.
4. Deploy. Em alguns minutos o app estará no ar em `https://sequenc.onrender.com`.

> 💡 O plano free do Render "dorme" após ~15 min sem acesso — a primeira abertura depois disso demora ~30–60 s para acordar. Os dados ficam no Atlas e nunca são perdidos.

### 4. Instalar no iPhone

1. Abra a URL do app no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
3. Pronto: o app abre em tela cheia, com ícone próprio, como um app nativo.

## Estrutura

```
server.js            → API REST (Express) + rotas
store.js             → MongoDB (mongoose) + fallback em memória
seed.js              → lista inicial de exercícios
scripts/gen-icons.js → gera os ícones PNG
public/              → frontend (HTML/CSS/JS puro, PWA)
public/sw.js         → service worker (abrir e usar o app offline)
render.yaml          → blueprint de deploy do Render
```

## API

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` | cria conta `{username, password}` (já vem com academia + lista básica) |
| POST | `/api/auth/login` | entra `{username, password}` → token |
| GET | `/api/auth/me` | valida sessão |
| POST | `/api/auth/logout` | encerra sessão |
| GET | `/api/gyms` | lista academias da conta |
| POST | `/api/gyms` | cria academia `{name, seed?}` (seed = copiar lista básica) |
| PUT | `/api/gyms/:id` | renomeia academia |
| DELETE | `/api/gyms/:id` | exclui academia (exercícios migram para a mais antiga) |
| GET | `/api/exercises` | lista exercícios da conta |
| POST | `/api/exercises` | cria exercício `{name, group}` |
| PUT | `/api/exercises/:id` | renomeia / muda grupo |
| DELETE | `/api/exercises/:id` | exclui exercício |
| GET | `/api/workouts?limit=60` | histórico (mais recentes primeiro) |
| POST | `/api/workouts` | salva treino finalizado |
| DELETE | `/api/workouts/:id` | exclui treino |
| GET | `/api/health` | status do servidor e do banco |
