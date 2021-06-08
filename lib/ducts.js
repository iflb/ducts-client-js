const MessagePack = require("what-the-pack");
const { encode, decode } = MessagePack.initialize(2**22);
const WebSocket = require("websocket").w3cwebsocket;
const fetch = require("node-fetch");
const getRandomValues = require("get-random-values");
const Buffer = require('buffer').Buffer;

//https://github.com/necojackarc/extensible-custom-error/blob/master/src/index.js
class DuctError extends Error {

    constructor(message, error=null, ...args) {
    super(message, error, ...args);

    // Align with Object.getOwnPropertyDescriptor(Error.prototype, 'name')
    Object.defineProperty(this, 'name', {
        configurable: true,
        enumerable: false,
        value: this.constructor.name,
        writable: true,
    });

    // Helper function to merge stack traces
    const merge =
          (stackTraceToMerge, baseStackTrace) => {
          const entriesToMerge = stackTraceToMerge.split('\n');
          const baseEntries = baseStackTrace.split('\n');
          const newEntries = [];
          entriesToMerge.forEach((entry) => {
              if (baseEntries.includes(entry)) {
              return;
              }
              newEntries.push(entry);
          });
          return [...newEntries, ...baseEntries].join('\n');
          };
    if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
        this.stack = error ? merge(this.stack, error.stack) : this.stack;
    }

    }

};

class DuctEvent {
    constructor() {
    }
};

class DuctConnectionEvent extends DuctEvent {

    constructor(state, source) {
        super();
        this.state = state;
        this.source = source;
    }

};

class DuctMessageEvent extends DuctEvent {

    constructor(rid, eid, data) {
        super();
        this.rid = rid;
        this.eid = eid;
        this.data = data;
    }

};

const State = Object.freeze({
    CLOSE : -1
    , OPEN_CONNECTING : WebSocket.CONNECTING
    , OPEN_CONNECTED : WebSocket.OPEN
    , OPEN_CLOSING : WebSocket.CONNECTING
    , OPEN_CLOSED : WebSocket.CLOSED
});

class DuctEventListener {

    constructor() {
        this.on =
            (names, func) => {
            for(let name of (names instanceof Array) ? names : [names]) {
                if (!(name in this)) {
                throw new ReferenceError('['+name+'] in '+this.constructor.name);
                }
                this[name] = func;
            }

            };

    }
};

class ConnectionEventListener extends DuctEventListener {
    onopen(event){}
    onclose(event){}
    onerror(event){}
    onmessage(event){}

};

class Duct {

    constructor() {
        this.WSD = null;
        this.EVENT = null;

        this.next_rid =
            () => {
                let next_id = new Date().getTime();
                if (next_id <= this.last_rid) {
                    next_id = this.last_rid + 1;
                }
                this.last_rid = next_id;
                return next_id;
            };
        this.open =
            (wsd_url, uuid = null, params = {}) => {return this._open(this, wsd_url, uuid, params);};
        this.reconnect =
            () => {return this._reconnect(this);};
        this.send =
            (request_id, event_id, data) => {return this._send(this, request_id, event_id, data)};
        this.close =
            () => {return this._close(this);};

        this._connection_listener = new ConnectionEventListener();

        this._event_handler = {};
        this.setEventHandler =
            (event_id, handler) => {this._event_handler[event_id] = handler;};
        this.catchall_event_handler = (rid, eid, data) => {};
        this.uncaught_event_handler = (rid, eid, data) => {};
        this.event_error_handler = (rid, eid, data, error) => {};

        this.add_onopen_handler = (handler) => { this.onopen_handlers.push(handler); };
        this.invoke_on_open = (handler) => {
            if(this.state==State.OPEN_CONNECTED) handler();
            else this.add_onopen_handler(handler);
        }
        this._onopen_handlers = [];
    }

    get state() {
        if (this._ws) {
            return this._ws.readyState;
        } else {
            return State.CLOSE;
        }
    }

    _reconnect(self, wsd) {
        if (wsd != null) {
            self.WSD = wsd;
            self.EVENT = self.WSD.EVENT;
        }
        return new Promise(function(resolve, reject) {
            if (self._ws) {
            resolve(self);
            return;
            }
            let ws = new WebSocket(self.WSD.websocket_url_reconnect);
            ws.binaryType = 'arraybuffer';
            ws.onopen =
            (event) => {
                ws.onerror =
                (event) => {self._connection_listener.onerror(new DuctConnectionEvent('onerror', event));};
                ws.onclose =
                (event) => {self._connection_listener.onclose(new DuctConnectionEvent('onclose', event));};
                ws.onmessage =
                (event) => {self._onmessage(self, new DuctConnectionEvent('onmessage', event));};
                self._ws = ws;
                self._onreconnect(self, event);
                self._connection_listener.onopen(new DuctConnectionEvent('onopen', event));
                resolve(self);
            };
            ws.onerror =
            (event) => {
                self._connection_listener.onerror(new DuctConnectionEvent('onerror', event));
                reject(event);
            };
        });
    }

    _open(self, wsd_url, uuid, params) {
        return new Promise(function(resolve, reject) {
            if (self._ws) {
            resolve(self);
            return;
            }
            let query = uuid != null ? uuid : '?uuid='+([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
            for (let [key, value] of Object.entries(params)) {
            query += '&'+key+'='+value;
            }
            fetch(wsd_url + query, { headers: { "User-Agent": "" } })
            .then( response => {
                return response.json();
            }).then( wsd => {
                //console.log(wsd);
                self.WSD = wsd;
                self.EVENT = self.WSD.EVENT;
                //console.log(self.WSD.websocket_url);
                let ws = new WebSocket(self.WSD.websocket_url);
                ws.binaryType = 'arraybuffer';
                ws.onopen =
                (event) => {
                    ws.onerror =
                    (event) => {self._connection_listener.onerror(new DuctConnectionEvent('onerror', event));};
                    ws.onclose =
                    (event) => {self._connection_listener.onclose(new DuctConnectionEvent('onclose', event));};
                    ws.onmessage =
                    (event) => {self._onmessage(self, new DuctConnectionEvent('onmessage', event));};
                    self._ws = ws;
                    self._onopen(self, event);
                    self._connection_listener.onopen(new DuctConnectionEvent('onopen', event));
                    resolve(self);
                };
                ws.onerror =
                (event) => {
                    self._connection_listener.onerror(new DuctConnectionEvent('onerror', event));
                    reject(event);
                };
            }).catch( (error) => {
                //console.error(error);
                self._connection_listener.onerror(new DuctConnectionEvent('onerror', error));
                reject(error);
            });
        });
    }

    _onopen(self, event) {
        self._send_timestamp = new Date().getTime() / 1000;
        self.time_offset = 0;
        self.time_latency = 0;
        self._time_count = 0;
        self.setEventHandler(this.EVENT.ALIVE_MONITORING, (rid, eid, data) => {
            let client_received = new Date().getTime() / 1000;
            let server_sent = data[0];
            let server_received = data[1];
            let client_sent = this._send_timestamp;
            //console.log('t0='+client_sent+', t1='+server_received+', t2='+server_sent+',t3='+client_received);
            let new_offset = ((server_received - client_sent) - (client_received - server_sent))/2;
            let new_latency = ((client_received - client_sent) - (server_sent - server_received))/2;
            this.time_offset = (this.time_offset * this._time_count + new_offset) / (this._time_count + 1);
            this.time_latency = (this.time_latency * this._time_count + new_latency) / (this._time_count + 1);
            this._time_count += 1;
            //console.log('offset='+this.time_offset+', latency='+this.time_latency);
        });
        let rid = self.next_rid();
        let eid = self.EVENT.ALIVE_MONITORING;
        let value = self._send_timestamp;
        self.send(rid, eid, value);

        for(const handler of this._onopen_handlers)  handler();
    }

    _onreconnect(self, event) {
        //console.log('reconnected');
    }

    _send(self, request_id, event_id, data) {
        const msgpack = encode([request_id, event_id, data])
        self._ws.send(msgpack)
        return request_id;
    }

    _close(self) {
        try {
            if (self._ws) {
            self._ws.close();
            }
        } finally {
            self._ws = null;
        }
    }

    _onmessage(self, event) {
        try {
            self._connection_listener.onmessage(event);
            const [rid, eid, data] = decode(Buffer.from(event.source.data));
            try {
            self.catchall_event_handler(rid, eid, data);
            let handle = (eid in self._event_handler) ? self._event_handler[eid] : self.uncaught_event_handler;
            handle(rid, eid, data);
            } catch(error) {
            self.event_error_handler(rid, eid, data, error);
            }
        }
        catch (error) {
            self.event_error_handler(-1, -1, null, error);
        }
    }
};

module.exports = {
    DuctError,
    DuctEvent,
    DuctConnectionEvent,
    DuctMessageEvent,
    State,
    DuctEventListener,
    ConnectionEventListener,
    Duct
};
