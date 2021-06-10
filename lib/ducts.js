const MessagePack = require("what-the-pack");
const { encode, decode } = MessagePack.initialize(2**22);
const WebSocket = require("websocket").w3cwebsocket;
const fetch = require("node-fetch");
const getRandomValues = require("get-random-values");
const Buffer = require('buffer').Buffer;
const { ThisBinded } = require('@iflb/lib');

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

class DuctPromiseContext {
    constructor(resolve, reject) {
        this.resolve = resolve;
        this.reject = reject;
    }
}

class ConnectionEventListener extends DuctEventListener {
    onopen(event){}
    onclose(event){}
    onerror(event){}
    onmessage(event){}

};

class Duct extends ThisBinded {

    constructor() {
        super();
        this.WSD = null;
        this.EVENT = null;
        this.nextRid =
            () => {
                let nextRid = new Date().getTime();
                if (nextRid <= this.lastRid) {
                    nextRid = this.lastRid + 1;
                }
                this.lastRid = nextRid;
                return nextRid;
            };
        this._connectionListener = new ConnectionEventListener();
        this._eventHandler = {};
        this.catchallEventHandler = (rid, eid, data) => {};
        this.uncaughtEventHandler = (rid, eid, data) => {};
        this.eventErrorHandler = (rid, eid, data, error) => {};
        this._onopenHandlers = [];
        this._waitingMessagePromiseContext = {};
        this._waitingClosedPromiseContext = [];
    }

    setEventHandler(self, eventId, handler) {
        self._eventHandler[eventId] = handler;
    }

    addOnopenHandler(self, handler) {
        self._onopenHandlers.push(handler);
    }

    invokeOnOpen(self, handler) {
        if (self.state === State.OPEN_CONNECTED) handler();
        else self.addOnopenHandler(handler);
    }

    get state() {
        if (this._ws) {
            return this._ws.readyState;
        } else {
            return State.CLOSE;
        }
    }

    reconnect(self, wsd) {
        if (wsd != null) {
            self.WSD = wsd;
            self.EVENT = self.WSD.EVENT;
        }
        return new Promise(function(resolve, reject) {
            if (self._ws) {
            resolve(self);
            return;
            }
            let ws = new WebSocket(self.WSD['websocket_url_reconnect']);
            ws.binaryType = 'arraybuffer';
            ws.onopen =
            (event) => {
                ws.onerror =
                (event) => {self._connectionListener.onerror(new DuctConnectionEvent('onerror', event));};
                ws.onclose =
                (event) => {self._connectionListener.onclose(new DuctConnectionEvent('onclose', event));};
                ws.onmessage =
                (event) => {self._onmessage(new DuctConnectionEvent('onmessage', event));};
                self._ws = ws;
                self._onreconnect(event);
                self._connectionListener.onopen(new DuctConnectionEvent('onopen', event));
                resolve(self);
            };
            ws.onerror =
            (event) => {
                self._connectionListener.onerror(new DuctConnectionEvent('onerror', event));
                reject(event);
            };
        });
    }

    open(self, wsdUrl, uuid = null, params = {}) {
        return new Promise(function(resolve, reject) {
            if (self._ws) {
            resolve(self);
            return;
            }
            let query = uuid != null ? uuid : '?uuid='+([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
            for (let [key, value] of Object.entries(params)) {
            query += '&'+key+'='+value;
            }
            fetch(wsdUrl + query, { headers: { "User-Agent": "" } })
            .then( response => {
                return response.json();
            }).then( wsd => {
                //console.log(wsd);
                self.WSD = wsd;
                self.EVENT = self.WSD.EVENT;
                //console.log(self.WSD.websocket_url);
                let ws = new WebSocket(self.WSD['websocket_url']);
                ws.binaryType = 'arraybuffer';
                ws.onopen =
                (event) => {
                    ws.onerror =
                    (event) => {self._connectionListener.onerror(new DuctConnectionEvent('onerror', event));};
                    ws.onclose =
                    (event) => {
                        self._ws = null;
                        switch (event.code) {
                            case 1000:
                                for (let promiseContext of self._waitingClosedPromiseContext) {
                                    promiseContext.resolve(event);
                                }
                                break;
                            default:
                                for (let promiseContext of self._waitingClosedPromiseContext) {
                                    promiseContext.reject(event);
                                }
                                break;
                        }
                        self._waitingClosedPromiseContext.splice(0);
                        self._connectionListener.onclose(new DuctConnectionEvent('onclose', event));
                    };
                    ws.onmessage =
                    (event) => {self._onmessage(new DuctConnectionEvent('onmessage', event));};
                    self._ws = ws;
                    self._onopen(event);
                    self._connectionListener.onopen(new DuctConnectionEvent('onopen', event));
                    resolve(self);
                };
                ws.onerror =
                (event) => {
                    self._connectionListener.onerror(new DuctConnectionEvent('onerror', event));
                    reject(event);
                };
            }).catch( (error) => {
                //console.error(error);
                self._connectionListener.onerror(new DuctConnectionEvent('onerror', error));
                reject(error);
            });
        });
    }

    _onopen(self, event) {
        self._sendTimestamp = new Date().getTime() / 1000;
        self.timeOffset = 0;
        self.timeLatency = 0;
        self._timeCount = 0;
        self.setEventHandler(self.EVENT.ALIVE_MONITORING, self._aliveMonitoringHandler);
        let rid = self.nextRid();
        let eid = self.EVENT.ALIVE_MONITORING;
        let value = self._sendTimestamp;
        self.send(rid, eid, value);

        for(const handler of self._onopenHandlers)  handler();
    }

    _onreconnect(self, event) {
        //console.log('reconnected');
    }

    send(self, requestId, eventId, data) {
        const msgpack = encode([requestId, eventId, data])
        self._ws.send(msgpack)
        return requestId;
    }

    call(self, eid, data = []) {
        let rid = self.nextRid();
        self.send(rid, eid, data);
        return new Promise((resolve, reject) => {
            self._waitingMessagePromiseContext[rid] = new DuctPromiseContext(resolve, reject);
        });
    }

    close(self) {
        if (self._ws) {
            self._ws.close();
        }
        return new Promise((resolve, reject) => {
            self._waitingClosedPromiseContext.push(new DuctPromiseContext(resolve, reject));
        });
    }

    _onmessage(self, event) {
        try {
            self._connectionListener.onmessage(event);
            const [rid, eid, data] = decode(Buffer.from(event.source.data));
            try {
            self.catchallEventHandler(rid, eid, data);
            let isErrorOccured = (eid < 0);
            let handle = self._eventHandler[Math.abs(eid)];
            if (!handle) handle = self.uncaughtEventHandler;
            let ret = handle(rid, eid, data);
            if (ret) data = ret;
            let promiseContext = self._waitingMessagePromiseContext[rid];
            delete self._waitingMessagePromiseContext[rid];
            if (promiseContext) {
                if (isErrorOccured) {
                    promiseContext.reject(data);
                } else {
                    promiseContext.resolve(data);
                }
            }
            } catch(error) {
            self.eventErrorHandler(rid, eid, data, error);
            }
        }
        catch (error) {
            self.eventErrorHandler(-1, -1, null, error);
        }
    }

    _aliveMonitoringHandler(self, rid, eid, data) {
        let client_received = new Date().getTime() / 1000;
        let serverSent = data[0];
        let serverReceived = data[1];
        let clientSent = self._sendTimestamp;
        //console.log('t0='+clientSent+', t1='+serverReceived+', t2='+serverSent+',t3='+client_received);
        let new_offset = ((serverReceived - clientSent) - (client_received - serverSent))/2;
        let new_latency = ((client_received - clientSent) - (serverSent - serverReceived))/2;
        self.timeOffset = (self.timeOffset * self._timeCount + new_offset) / (self._timeCount + 1);
        self.timeLatency = (self.timeLatency * self._timeCount + new_latency) / (self._timeCount + 1);
        self._timeCount += 1;
        //console.log('offset='+self.timeOffset+', latency='+self.timeLatency);
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
