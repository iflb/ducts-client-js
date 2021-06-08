const ducts =  require('../lib/ducts')

test('Test Open', testOpenAndClose);

const wsd_url = 'https://sdk.ducts.io/ducts/wsd';

var errorCount = 0;

const duct = new ducts.Duct();
duct._connection_listener.onopen = (event) => { console.log('[OPEN]', event); };
duct._connection_listener.onclose = (event) => { console.log('[CLOSE]', event); };
duct._connection_listener.onerror = (event) => { console.log('[ERROR]', event); };
duct._connection_listener.onmessage = (event) => { console.log('[MESSAGE]', event); };
duct.event_error_handler = (rid, eid, data, error) => {
    console.log(String(rid) + '-' + String(eid) + '-' + String(data) + ': ' + String(error));
    ++errorCount;
};

function resetErrorCount() {
    errorCount = 0;
}

async function testOpenAndClose() {
    resetErrorCount();
    await duct.open(wsd_url);
    duct.close();
    expect(errorCount).toBe(0);
}
