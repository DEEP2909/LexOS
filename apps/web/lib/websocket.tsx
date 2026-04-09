"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuthStore } from "@/lib/auth";
import { toast } from "sonner";

interface DocumentEvent {
  type: "processing_started" | "processing_progress" | "processing_completed" | "processing_failed";
  documentId: string;
  documentName?: string;
  progress?: number;
  stage?: string;
  error?: string;
}

interface MatterEvent {
  type: "matter_updated" | "document_added" | "obligation_due";
  matterId: string;
  data?: Record<string, unknown>;
}

interface NotificationEvent {
  type: "notification";
  title: string;
  message: string;
  severity?: "info" | "success" | "warning" | "error";
}

type WebSocketEvent = DocumentEvent | MatterEvent | NotificationEvent;

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (event: string, callback: (data: WebSocketEvent) => void) => () => void;
  documentProgress: Map<string, { progress: number; stage: string }>;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return context;
}

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { isAuthenticated, user } = useAuthStore();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [subscribers, setSubscribers] = useState<Map<string, Set<(data: WebSocketEvent) => void>>>(
    new Map()
  );
  const [documentProgress, setDocumentProgress] = useState<Map<string, { progress: number; stage: string }>>(
    new Map()
  );

  // Connect to WebSocket when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Disconnect if not authenticated
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Determine WebSocket URL
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}//${window.location.host}`;
    const wsUrl = `${wsHost}/ws?tenantId=${user.tenantId}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      setIsConnected(true);
      
      // Authenticate the connection
      ws.send(JSON.stringify({
        type: "auth",
        token: localStorage.getItem("accessToken"),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketEvent;
        
        // Handle document progress updates
        if ("documentId" in data) {
          if (data.type === "processing_progress") {
            setDocumentProgress((prev) => {
              const next = new Map(prev);
              next.set(data.documentId, {
                progress: data.progress || 0,
                stage: data.stage || "Processing",
              });
              return next;
            });
          } else if (data.type === "processing_completed") {
            setDocumentProgress((prev) => {
              const next = new Map(prev);
              next.delete(data.documentId);
              return next;
            });
            toast.success(`Document processed: ${data.documentName || "Document"}`);
          } else if (data.type === "processing_failed") {
            setDocumentProgress((prev) => {
              const next = new Map(prev);
              next.delete(data.documentId);
              return next;
            });
            toast.error(`Processing failed: ${data.error || "Unknown error"}`);
          }
        }

        // Handle notifications
        if (data.type === "notification") {
          const notif = data as NotificationEvent;
          switch (notif.severity) {
            case "success":
              toast.success(notif.title, { description: notif.message });
              break;
            case "warning":
              toast.warning(notif.title, { description: notif.message });
              break;
            case "error":
              toast.error(notif.title, { description: notif.message });
              break;
            default:
              toast.info(notif.title, { description: notif.message });
          }
        }

        // Notify subscribers
        const eventSubscribers = subscribers.get(data.type);
        if (eventSubscribers) {
          eventSubscribers.forEach((callback) => callback(data));
        }

        // Also notify "all" subscribers
        const allSubscribers = subscribers.get("*");
        if (allSubscribers) {
          allSubscribers.forEach((callback) => callback(data));
        }
      } catch (err) {
        console.error("[WebSocket] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WebSocket] Disconnected");
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    setSocket(ws);

    // Cleanup on unmount
    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  // Reconnect logic
  useEffect(() => {
    if (!isConnected && isAuthenticated && user) {
      const reconnectTimer = setTimeout(() => {
        console.log("[WebSocket] Attempting reconnect...");
        // The effect above will handle reconnection
      }, 5000);

      return () => clearTimeout(reconnectTimer);
    }
  }, [isConnected, isAuthenticated, user]);

  const subscribe = useCallback(
    (event: string, callback: (data: WebSocketEvent) => void) => {
      setSubscribers((prev) => {
        const next = new Map(prev);
        if (!next.has(event)) {
          next.set(event, new Set());
        }
        next.get(event)!.add(callback);
        return next;
      });

      // Return unsubscribe function
      return () => {
        setSubscribers((prev) => {
          const next = new Map(prev);
          const eventSet = next.get(event);
          if (eventSet) {
            eventSet.delete(callback);
            if (eventSet.size === 0) {
              next.delete(event);
            }
          }
          return next;
        });
      };
    },
    []
  );

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe, documentProgress }}>
      {children}
    </WebSocketContext.Provider>
  );
}
