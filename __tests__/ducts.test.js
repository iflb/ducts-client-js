const ducts =  require('../lib/ducts')

var errorCount = 0;
function resetErrorCount() { errorCount = 0; }
function incrementErrorCount() { ++errorCount }
function assertNoError() { expect(errorCount).toBe(0); }
function assertHasError() { expect(errorCount).not.toBe(0); }

const duct = new ducts.Duct();
duct._connection_listener.onopen = (event) => {
    // console.log('[OPEN]', event);
};
duct._connection_listener.onclose = (event) => {
    // console.log('[CLOSE]', event);
};
duct._connection_listener.onerror = (event) => {
    // console.log('[ERROR]', event);
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
    async () => {
        resetErrorCount();
        await duct.open(wsd_url);
        let closeEvent = await duct.close();
        expect(closeEvent.code).toBe(1000);
        assertNoError();
    },
);

test(
    'Test Open Fails',
    async () => {
        resetErrorCount();
        expect(duct.open('https://invalid_url')).rejects.toThrow(); 
        assertNoError();
    },
);

test(
    'Test Call',
    async () => {
        resetErrorCount();
        await duct.open(wsd_url);
        let group_name = 'ducts.test.js'
        if (await duct.call(duct.EVENT['BLOBS_GROUP_EXISTS'], group_name)) {
            await duct.call(duct.EVENT['BLOBS_GROUP_DELETE'], group_name);
        }
        await duct.call(duct.EVENT['BLOBS_GROUP_ADD'], { group_key: group_name });
        let exists = await duct.call(duct.EVENT['BLOBS_GROUP_EXISTS'], group_name);
        expect(exists).toBe(true);
        await duct.call(duct.EVENT['BLOBS_GROUP_DELETE'], group_name);
        await duct.close();
        assertNoError();
    },
);