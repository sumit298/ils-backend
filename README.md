# Interactive Live Streaming Platform - Backend

A scalable real-time live streaming platform built with Node.js, WebRTC (MediaSoup), Socket.IO, and MongoDB.

## 🚀 Features

- **User Authentication** - JWT-based auth with secure password hashing
- **Live Streaming** - WebRTC-powered real-time video streaming via MediaSoup
- **Real-time Chat** - Socket.IO-based live chat during streams
- **Stream Management** - Create, update, delete, and browse live streams
- **Analytics** - Track viewers, chat messages, and stream statistics
- **Caching** - Redis integration for performance optimization
- **Message Queue** - RabbitMQ for event processing and analytics

## 🛠️ Tech Stack

- **Runtime**: Node.js + Express.js
- **Database**: MongoDB
- **Cache**: Redis
- **Message Queue**: RabbitMQ
- **WebRTC**: MediaSoup
- **Real-time**: Socket.IO
- **Authentication**: JWT + bcrypt

## 📦 Installation

```bash
# Clone repository
git clone <repository-url>
cd ils-backend

# Install dependencies
npm install

# Start services (MongoDB, Redis, RabbitMQ)
docker-compose up -d

# Start server
npm start
```

## 🔧 Environment Variables

Create a `.env` file:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/ils
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
JWT_SECRET=your-secret-key
NODE_ENV=development
```

## 📡 API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get user profile
- `POST /api/auth/refresh-token` - Token refresh
- `POST /api/auth/logout` - User logout

### Streams (`/api/streams`)
- `GET /api/streams` - Get all streams
- `POST /api/streams` - Create new stream
- `GET /api/streams/:id` - Get specific stream
- `PUT /api/streams/:id` - Update stream
- `DELETE /api/streams/:id` - Delete stream
- `POST /api/streams/:id/join` - Join stream
- `GET /api/streams/:id/stats` - Get stream statistics

### Chat (`/api/chat`)
- `GET /api/chat/:streamId` - Get chat messages
- `POST /api/chat/:streamId` - Send chat message
- `DELETE /api/chat/:streamId/:messageId` - Delete message
- `GET /api/chat/:streamId/stats` - Get chat statistics

## 🔌 Socket.IO Events

**Client → Server**
- `join-stream` - Join a stream room
- `create-stream` - Create new stream
- `get-router-capabilities` - Get MediaSoup router RTP capabilities
- `create-transport` - Create WebRTC transport
- `connect-transport` - Connect WebRTC transport
- `produce` - Start producing media
- `consume` - Start consuming media

**Server → Client**
- `new-message` - New chat message received
- `viewer-count` - Updated viewer count
- `stream-ended` - Stream has ended

## 🏗️ Project Structure

```
src/
├── models/          # MongoDB schemas
├── routes/          # API route handlers
├── services/        # Business logic
├── middleware/      # Auth & validation
server.js            # Entry point
```

## 🧪 Testing

```bash
# Run API tests
node test-api.js

# Run comprehensive tests
node test-comprehensive.js
```

## 📝 License

MIT