import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { api, getToken, openSocket } from "../../api/client";
import { describeEvent } from "../../lib/events";
import { useAuth } from "../auth/AuthProvider";
import { useToasts } from "../../components/ui/ToastStack";

const PairContext = createContext(null);

const TOAST_EVENTS = new Set([
  "nudge",
  "note",
  "mood_update",
  "moment_window_started",
  "moment_created",
  "reaction_added",
  "plan_created",
  "plan_updated",
  "pair_connected"
]);

/**
 * Owns the live connection for the signed-in user: pair status, partner presence,
 * the activity feed, and a pub/sub other screens use to refetch when data changes.
 */
export function PairProvider({ children }) {
  const { user } = useAuth();
  const { pushToast } = useToasts();
  const [status, setStatus] = useState({ pair_id: null, partner: null, partner_online: false });
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState("connecting");
  const [events, setEvents] = useState([]);
  const [partnerTouching, setPartnerTouching] = useState(false);
  const listeners = useRef(new Set());
  const socketRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const emit = useCallback((message) => {
    listeners.current.forEach((fn) => fn(message));
  }, []);

  const refreshPair = useCallback(async () => {
    if (!user) return;
    try {
      const next = await api.pairStatus();
      setStatus(next);
      if (next.pair_id) setEvents(await api.events());
      else setEvents([]);
    } catch {
      /* offline — the socket reconnect will retry */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setStatus({ pair_id: null, partner: null, partner_online: false });
      setEvents([]);
      setLoading(true);
      return undefined;
    }

    let closedByUs = false;
    let retry = 0;
    let retryTimer;
    let pingTimer;

    const connect = () => {
      const ws = openSocket();
      socketRef.current = ws;
      setConnection("connecting");

      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: getToken() }));

      ws.onmessage = (raw) => {
        const msg = JSON.parse(raw.data);
        switch (msg.type) {
          case "hello":
            retry = 0;
            setConnection("live");
            refreshPair();
            emit({ type: "resync" }); // catch up on anything missed while offline
            clearInterval(pingTimer);
            pingTimer = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
            }, 20000);
            break;
          case "presence":
            setStatus((s) => ({ ...s, partner_online: msg.online }));
            if (!msg.online) setPartnerTouching(false);
            break;
          case "pair_changed":
            refreshPair();
            break;
          case "touch":
            setPartnerTouching(msg.active);
            break;
          case "event": {
            const event = msg.event;
            setEvents((prev) =>
              prev.some((e) => e.id === event.id) ? prev : [event, ...prev].slice(0, 60)
            );
            if (event.event_type === "mood_update" || event.event_type === "profile_updated") {
              refreshPair();
            }
            if (event.sender_id !== user.id && TOAST_EVENTS.has(event.event_type)) {
              const { icon, text } = describeEvent(event);
              const known = statusRef.current.partner?.display_name;
              if (known) pushToast({ icon, title: known, text });
              else
                api
                  .pairStatus()
                  .then((s) => pushToast({ icon, title: s.partner?.display_name || "Your partner", text }))
                  .catch(() => pushToast({ icon, title: "Your partner", text }));
              if (event.event_type === "nudge" && navigator.vibrate) navigator.vibrate([80, 60, 120]);
            }
            emit(msg);
            break;
          }
          default:
            break;
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        setPartnerTouching(false);
        if (closedByUs) return;
        setConnection("offline");
        retry += 1;
        retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry));
      };
    };

    connect();

    // Phones suspend sockets when the screen locks — reconnect as soon as we're visible.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const ws = socketRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        clearTimeout(retryTimer);
        retry = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      document.removeEventListener("visibilitychange", onVisible);
      socketRef.current?.close();
    };
  }, [user?.id, refreshPair, emit, pushToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const sendTouch = useCallback((active) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "touch", active }));
  }, []);

  const value = useMemo(
    () => ({
      pairId: status.pair_id,
      pairedAt: status.paired_at,
      partner: status.partner,
      partnerOnline: status.partner_online,
      isPaired: Boolean(status.pair_id),
      loading,
      connection,
      events,
      partnerTouching,
      refreshPair,
      subscribe,
      sendTouch
    }),
    [status, loading, connection, events, partnerTouching, refreshPair, subscribe, sendTouch]
  );

  return <PairContext.Provider value={value}>{children}</PairContext.Provider>;
}

export function usePair() {
  const ctx = useContext(PairContext);
  if (!ctx) throw new Error("usePair must be used within PairProvider");
  return ctx;
}

/**
 * Loads data with `fetcher` and reloads it whenever a live event of one of
 * `eventTypes` arrives (or after reconnecting).
 */
export function useLiveResource(fetcher, eventTypes) {
  const { subscribe } = usePair();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const typesKey = eventTypes.join(",");

  const reload = useCallback(async () => {
    try {
      setData(await fetcherRef.current());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    reload();
    const types = new Set(typesKey.split(","));
    return subscribe((msg) => {
      if (msg.type === "resync" || (msg.type === "event" && types.has(msg.event.event_type))) reload();
    });
  }, [reload, subscribe, typesKey]);

  return { data, error, reload, setData };
}
