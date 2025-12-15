# ChattingLord Frontend

Next.js frontend application for ChattingLord - a real-time, ephemeral chat and collaboration platform.

## Features

- Real-time messaging via Socket.IO
- Room-based chat interface
- WebRTC video call support (placeholder)
- Responsive design with Tailwind CSS
- Zustand for state management

## Tech Stack

- Next.js 14+ (App Router)
- React 18+
- TypeScript
- Tailwind CSS
- Socket.IO Client
- Zustand

## Prerequisites

- Node.js 20+
- Backend server running (see backend README)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.local.example` to `.env.local` and configure:

```bash
cp .env.local.example .env.local
```

Update `NEXT_PUBLIC_API_URL` to point to your backend server.

## Running the app

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

The app will be available at `http://localhost:3000`

## Project Structure

```
frontend/
├── app/              # Next.js App Router pages
│   ├── page.tsx      # Home/landing page
│   └── room/[id]/    # Dynamic room page
├── components/       # React components
│   ├── chat/         # Chat-related components
│   └── video/        # Video call components
└── lib/              # Utilities and stores
    ├── socket.ts     # Socket.IO client setup
    └── store.ts      # Zustand state management
```

## License

ISC

