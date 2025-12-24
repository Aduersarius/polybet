"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealTimeDataClient = void 0;
const tslib_1 = require("tslib");
const isomorphic_ws_1 = tslib_1.__importDefault(require("isomorphic-ws"));
const model_1 = require("./model");
const DEFAULT_HOST = "wss://ws-live-data.polymarket.com";
const DEFAULT_PING_INTERVAL = 5000;
/**
 * A client for managing real-time WebSocket connections, handling messages, subscriptions,
 * and automatic reconnections.
 */
class RealTimeDataClient {
    /**
     * Constructs a new RealTimeDataClient instance.
     * @param args Configuration options for the client.
     */
    constructor(args) {
        /**
         * Handles WebSocket 'open' event. Executes the `onConnect` callback and starts pinging.
         */
        this.onOpen = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.ping();
            this.notifyStatusChange(model_1.ConnectionStatus.CONNECTED);
            if (this.onConnect) {
                this.onConnect(this);
            }
        });
        /**
         * Handles WebSocket 'pong' event. Continues the ping cycle.
         */
        this.onPong = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            delay(this.pingInterval).then(() => this.ping());
        });
        /**
         * Handles WebSocket errors. Logs the error and attempts reconnection if `autoReconnect` is enabled.
         * @param err Error object describing the issue.
         */
        this.onError = (err) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            console.error("error", err);
            if (this.autoReconnect) {
                this.connect();
            }
        });
        /**
         * Handles WebSocket 'close' event. Logs the disconnect reason and attempts reconnection if `autoReconnect` is enabled.
         * @param code Close event code.
         * @param reason Buffer containing the reason for closure.
         */
        this.onClose = (message) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            console.error("disconnected", "code", message.code, "reason", message.reason);
            this.notifyStatusChange(model_1.ConnectionStatus.DISCONNECTED);
            if (this.autoReconnect) {
                this.connect();
            }
        });
        /**
         * Sends a ping message to keep the connection alive.
         */
        this.ping = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this.ws.readyState !== isomorphic_ws_1.default.OPEN) {
                return console.warn("Socket not open. Ready state is:", this.ws.readyState);
            }
            this.ws.send("ping", (err) => {
                if (err) {
                    console.error("ping error", err);
                }
            });
        });
        /**
         * Handles incoming WebSocket messages. Parses and processes custom messages if applicable.
         * @param event Raw WebSocket message data.
         */
        this.onMessage = (event) => {
            if (typeof event.data === "string" && event.data.length > 0) {
                if (this.onCustomMessage && event.data.includes("payload")) {
                    const message = JSON.parse(event.data);
                    this.onCustomMessage(this, message);
                }
                else {
                    console.log("onMessage error", { event });
                }
            }
        };
        this.host = args.host || DEFAULT_HOST;
        this.pingInterval = args.pingInterval || DEFAULT_PING_INTERVAL;
        this.autoReconnect = args.autoReconnect || true;
        this.onCustomMessage = args.onMessage;
        this.onConnect = args.onConnect;
        this.onStatusChange = args.onStatusChange;
    }
    /**
     * Establishes a WebSocket connection to the server.
     */
    connect() {
        this.notifyStatusChange(model_1.ConnectionStatus.CONNECTING);
        this.ws = new isomorphic_ws_1.default(this.host);
        if (this.ws) {
            this.ws.onopen = this.onOpen;
            this.ws.onmessage = this.onMessage;
            this.ws.onclose = this.onClose;
            this.ws.onerror = this.onError;
            this.ws.pong = this.onPong;
        }
        return this;
    }
    /**
     * Closes the WebSocket connection.
     */
    disconnect() {
        this.autoReconnect = false;
        this.ws.close();
    }
    /**
     * Subscribes to a data stream by sending a subscription message.
     * @param msg Subscription request message.
     */
    subscribe(msg) {
        if (this.ws.readyState !== isomorphic_ws_1.default.OPEN) {
            return console.warn("Socket not open. Ready state is:", this.ws.readyState);
        }
        this.ws.send(JSON.stringify(Object.assign({ action: "subscribe" }, msg)), (err) => {
            if (err) {
                console.error("subscribe error", err);
                this.ws.close();
            }
        });
    }
    /**
     * Unsubscribes from a data stream by sending an unsubscription message.
     * @param msg Unsubscription request message.
     */
    unsubscribe(msg) {
        if (this.ws.readyState !== isomorphic_ws_1.default.OPEN) {
            return console.warn("Socket not open. Ready state is:", this.ws.readyState);
        }
        console.log("unsubscribing", { msg });
        this.ws.send(JSON.stringify(Object.assign({ action: "unsubscribe" }, msg)), (err) => {
            if (err) {
                console.error("unsubscribe error", err);
                this.ws.close();
            }
        });
    }
    /**
     * Callback for connection status changes
     * @param status status of the connection
     */
    notifyStatusChange(status) {
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
        return status;
    }
}
exports.RealTimeDataClient = RealTimeDataClient;
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=client.js.map