const ducts =  require('../lib/ducts')

var errorCount = 0;
function resetErrorCount() { errorCount = 0; }
function incrementErrorCount() { ++errorCount }
function assertNoError() { expect(errorCount).toBe(0); }
function assertHasError() { expect(errorCount).not.toBe(0); }
function initializeTest() {
    return new Promise(resolve => {
        resetErrorCount();
        resolve();
    });
}

const duct = new ducts.Duct();
duct._connection_listener.onopen = (event) => {
    // console.log('[OPEN]', event);
};
duct._connection_listener.onclose = (event) => {
    // console.log('[CLOSE]', event);
};
duct._connection_listener.onerror = (event) => {
    // console.log('[ERROR]', event);
    incrementErrorCount();
};
duct._connection_listener.onmessage = (event) => {
    // console.log('[MESSAGE]', event);
};
duct.event_error_handler = (rid, eid, data, error) => {
    // console.log(String(rid) + '-' + String(eid) + '-' + String(data) + ': ' + String(error));
    incrementErrorCount();
};

const wsd_url = 'https://sdk.ducts.io/ducts/wsd';

test(
    'Test Open And Close',
    () => {
        initializeTest()
            .then(duct.open.bind(null, wsd_url))
            .then(new Promise(resolve => { duct.close(); resolve(); }))
            .then(assertNoError);
    },
);

test(
    'Test Open Fails',
    () => {
        initializeTest()
            .then(duct.open.bind(null, 'https://invalid_url'))
            .catch(assertHasError);
    },
);
