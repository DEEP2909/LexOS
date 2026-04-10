/**
 * EvidentIS WebSocket Real-time Events
 * Socket.io implementation for live updates
 */

import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { jwtVerify, importSPKI, type KeyLike } from 'jose';
import fs from 'fs';
import type { Server as HttpServer } from 'http';

// ============================================================================
// TYPES
// ============================================================================

interface AuthenticatedSocket extends Socket {
  user: {
    attorneyId: string;
    tenantId: string;
    email: string;
    role: string;
  };
}

interface DocumentEvent {
  type: 'uploaded' | 'processing' | 'processed' | 'failed';
  documentId: string;
  matterId: string;
  fileName: string;
  status: string;
  progress?: number;
  error?: string;
}

interface ClauseEvent {
  type: 'extracted' | 'updated';
  clauseId: string;
  documentId: string;
  matterId: string;
  clauseType: string;
  riskLevel: string;
}

interface FlagEvent {
  type: 'created' | 'acknowledged' | 'resolved';
  flagId: string;
  matterId: string;
  documentId?: string;
  severity: string;
  message: string;
}

interface ObligationEvent {
  type: 'created' | 'due_soon' | 'overdue' | 'completed';
  obligationId: string;
  matterId: string;
  description: string;
  deadline: string;
}

interface MatterEvent {
  type: 'created' | 'updated' | 'health_changed' | 'closed';
  matterId: string;
  matterName: string;
  healthScore?: number;
  status?: string;
}

interface NotificationEvent {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actionUrl?: string;
  persistent?: boolean;
}

interface PresenceEvent {
  attorneyId: string;
  email: string;
  displayName: string;
  status: 'online' | 'away' | 'busy';
  currentMatterId?: string;
  currentDocumentId?: string;
}

// ============================================================================
// SOCKET SERVER SETUP
// ============================================================================

let io: SocketServer | null = null;
let publicKey: KeyLike | Uint8Array | null = null;
let devModeNoAuth = false;

export async function initializeWebSocket(
  httpServer: HttpServer,
  redisUrl: string,
  jwtPublicKeyPath: string
): Promise<SocketServer> {
  // Load public key for JWT verification (RS256)
  // Guard against missing key file - fallback to no auth in dev mode
  if (fs.existsSync(jwtPublicKeyPath)) {
    const publicKeyPem = fs.readFileSync(jwtPublicKeyPath, 'utf8');
    publicKey = await importSPKI(publicKeyPem, 'RS256');
    console.log('WebSocket: JWT public key loaded');
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  JWT public key not found — WebSocket auth disabled in dev mode');
    devModeNoAuth = true;
  } else {
    throw new Error(`JWT public key not found at ${jwtPublicKeyPath} (required in production)`);
  }
  
  // Create Socket.io server
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    path: '/ws',
  });

  // Redis adapter for horizontal scaling
  if (redisUrl && process.env.NODE_ENV === 'production') {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    
    await Promise.all([pubClient.connect(), subClient.connect()]);
    
    io.adapter(createAdapter(pubClient, subClient));
    console.log('WebSocket: Redis adapter connected');
  }

  // Authentication middleware
  io.use(async (socket, next) => {
    // In dev mode without keys, allow connections with mock user
    if (devModeNoAuth) {
      console.warn('WebSocket: Dev mode - allowing unauthenticated connection');
      (socket as AuthenticatedSocket).user = {
        attorneyId: 'dev-user',
        tenantId: 'dev-tenant',
        email: 'dev@localhost',
        role: 'admin',
      };
      return next();
    }

    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      if (!publicKey) {
        return next(new Error('Server not initialized'));
      }
      const { payload } = await jwtVerify(token, publicKey);
      (socket as AuthenticatedSocket).user = {
        attorneyId: payload.sub as string,
        tenantId: payload.tenantId as string,
        email: payload.email as string,
        role: payload.role as string,
      };
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const { tenantId, attorneyId, email } = authSocket.user;

    console.log(`WebSocket: User connected - ${email} (${attorneyId})`);

    // Join tenant room for tenant-wide events
    socket.join(`tenant:${tenantId}`);

    // Join user-specific room for direct messages
    socket.join(`user:${attorneyId}`);

    // Handle room subscriptions
    socket.on('subscribe:matter', (matterId: string) => {
      socket.join(`matter:${tenantId}:${matterId}`);
      console.log(`WebSocket: ${email} subscribed to matter ${matterId}`);
    });

    socket.on('unsubscribe:matter', (matterId: string) => {
      socket.leave(`matter:${tenantId}:${matterId}`);
    });

    socket.on('subscribe:document', (documentId: string) => {
      socket.join(`document:${tenantId}:${documentId}`);
      console.log(`WebSocket: ${email} subscribed to document ${documentId}`);
    });

    socket.on('unsubscribe:document', (documentId: string) => {
      socket.leave(`document:${tenantId}:${documentId}`);
    });

    // Presence updates
    socket.on('presence:update', (data: { status: string; matterId?: string; documentId?: string }) => {
      const presenceEvent: PresenceEvent = {
        attorneyId,
        email,
        displayName: email.split('@')[0], // Simplified; use actual display name
        status: data.status as 'online' | 'away' | 'busy',
        currentMatterId: data.matterId,
        currentDocumentId: data.documentId,
      };

      // Broadcast to tenant
      socket.to(`tenant:${tenantId}`).emit('presence:changed', presenceEvent);
    });

    // Document collaboration - cursor/selection sharing
    socket.on('document:cursor', (data: { documentId: string; position: number; selection?: { start: number; end: number } }) => {
      socket.to(`document:${tenantId}:${data.documentId}`).emit('document:cursor', {
        attorneyId,
        email,
        ...data,
      });
    });

    // Typing indicator
    socket.on('typing:start', (data: { matterId: string; context: 'comment' | 'note' }) => {
      socket.to(`matter:${tenantId}:${data.matterId}`).emit('typing:start', {
        attorneyId,
        email,
        ...data,
      });
    });

    socket.on('typing:stop', (data: { matterId: string }) => {
      socket.to(`matter:${tenantId}:${data.matterId}`).emit('typing:stop', {
        attorneyId,
        ...data,
      });
    });

    // Ping for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect handler
    socket.on('disconnect', (reason) => {
      console.log(`WebSocket: User disconnected - ${email} (${reason})`);
      
      // Notify tenant of user going offline
      socket.to(`tenant:${tenantId}`).emit('presence:changed', {
        attorneyId,
        email,
        status: 'offline',
      });
    });

    // Error handler
    socket.on('error', (error) => {
      console.error(`WebSocket error for ${email}:`, error);
    });

    // Send initial connection success
    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });
  });

  console.log('WebSocket: Server initialized');
  return io;
}

// ============================================================================
// EVENT EMITTERS
// ============================================================================

export function emitDocumentEvent(tenantId: string, matterId: string, event: DocumentEvent): void {
  if (!io) return;

  // Emit to matter room
  io.to(`matter:${tenantId}:${matterId}`).emit('document:event', event);

  // Emit to document-specific room
  io.to(`document:${tenantId}:${event.documentId}`).emit('document:event', event);

  // Also emit to tenant for dashboard updates
  io.to(`tenant:${tenantId}`).emit('document:event', event);
}

export function emitClauseEvent(tenantId: string, matterId: string, event: ClauseEvent): void {
  if (!io) return;

  io.to(`matter:${tenantId}:${matterId}`).emit('clause:event', event);
  io.to(`document:${tenantId}:${event.documentId}`).emit('clause:event', event);
}

export function emitFlagEvent(tenantId: string, matterId: string, event: FlagEvent): void {
  if (!io) return;

  io.to(`matter:${tenantId}:${matterId}`).emit('flag:event', event);
  
  // Critical/high flags go to tenant room for immediate attention
  if (event.severity === 'critical' || event.severity === 'high') {
    io.to(`tenant:${tenantId}`).emit('flag:critical', event);
  }
}

export function emitObligationEvent(tenantId: string, event: ObligationEvent): void {
  if (!io) return;

  io.to(`matter:${tenantId}:${event.matterId}`).emit('obligation:event', event);
  
  // Due soon and overdue events go to tenant room
  if (event.type === 'due_soon' || event.type === 'overdue') {
    io.to(`tenant:${tenantId}`).emit('obligation:reminder', event);
  }
}

export function emitMatterEvent(tenantId: string, event: MatterEvent): void {
  if (!io) return;

  io.to(`matter:${tenantId}:${event.matterId}`).emit('matter:event', event);
  io.to(`tenant:${tenantId}`).emit('matter:event', event);
}

export function emitNotification(
  tenantId: string, 
  attorneyId: string | null, 
  event: NotificationEvent
): void {
  if (!io) return;

  if (attorneyId) {
    // Send to specific user
    io.to(`user:${attorneyId}`).emit('notification', event);
  } else {
    // Broadcast to tenant
    io.to(`tenant:${tenantId}`).emit('notification', event);
  }
}

export function emitProcessingProgress(
  tenantId: string,
  documentId: string,
  stage: string,
  progress: number,
  message: string
): void {
  if (!io) return;

  io.to(`document:${tenantId}:${documentId}`).emit('processing:progress', {
    documentId,
    stage,
    progress,
    message,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getConnectedUsers(tenantId: string): string[] {
  if (!io) return [];

  const room = io.sockets.adapter.rooms.get(`tenant:${tenantId}`);
  if (!room) return [];

  const userIds: string[] = [];
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
    if (socket?.user?.attorneyId) {
      userIds.push(socket.user.attorneyId);
    }
  }

  return [...new Set(userIds)];
}

export function getSocketStats(): { connected: number; rooms: number } {
  if (!io) return { connected: 0, rooms: 0 };

  return {
    connected: io.sockets.sockets.size,
    rooms: io.sockets.adapter.rooms.size,
  };
}

export function disconnectUser(attorneyId: string): void {
  if (!io) return;

  const room = io.sockets.adapter.rooms.get(`user:${attorneyId}`);
  if (room) {
    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }
  }
}

export function broadcastSystemMessage(message: string): void {
  if (!io) return;

  io.emit('system:message', {
    message,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

export async function shutdownWebSocket(): Promise<void> {
  if (!io) return;
  const currentIo = io;

  // Notify all clients
  currentIo.emit('system:shutdown', {
    message: 'Server is shutting down for maintenance',
    reconnectIn: 30,
  });

  // Close all connections
  await new Promise<void>((resolve) => {
    currentIo.close(() => {
      console.log('WebSocket: Server closed');
      resolve();
    });
  });

  io = null;
}

// ============================================================================
// FASTIFY INTEGRATION
// ============================================================================

export function getIO(): SocketServer | null {
  return io;
}

export default {
  initializeWebSocket,
  emitDocumentEvent,
  emitClauseEvent,
  emitFlagEvent,
  emitObligationEvent,
  emitMatterEvent,
  emitNotification,
  emitProcessingProgress,
  getConnectedUsers,
  getSocketStats,
  disconnectUser,
  broadcastSystemMessage,
  shutdownWebSocket,
  getIO,
};
