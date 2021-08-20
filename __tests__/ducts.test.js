const ducts = require('../lib/ducts')

var errorCount = 0;
function resetErrorCount() { errorCount = 0; }
function incrementErrorCount() { ++errorCount }
function assertNoError() { expect(errorCount).toBe(0); }
function assertHasError() { expect(errorCount).not.toBe(0); }

const duct = new ducts.Duct();
duct._connectionListener.onopen = (event) => {
    // console.log('[OPEN]', event);
};
duct._connectionListener.onclose = (event) => {
    // console.log('[CLOSE]', event);
};
duct._connectionListener.onerror = (event) => {
    // console.log('[ERROR]', event);
};
duct._connectionListener.onmessage = (event) => {
    // console.log('[MESSAGE]', event);
};
duct.eventErrorHandler = (rid, eid, data, error) => {
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
        let groupName = 'ducts.test.js'
        if (await duct.call(duct.EVENT['BLOBS_GROUP_EXISTS'], groupName)) {
            await duct.call(duct.EVENT['BLOBS_GROUP_DELETE'], groupName);
        }
        await duct.call(duct.EVENT['BLOBS_GROUP_ADD'], { 'group_key': groupName });
        let exists = await duct.call(duct.EVENT['BLOBS_GROUP_EXISTS'], groupName);
        expect(exists).toBe(true);
        await duct.call(duct.EVENT['BLOBS_GROUP_DELETE'], groupName);
        await duct.close();
        assertNoError();
    },
);

test(
    'Test Event Handler',
    async () => {
        resetErrorCount();
        await duct.open(wsd_url);
        let hello = 'Hello.';
        duct.setEventHandler(duct.EVENT['DUCTS_TEST_MSG'], (rid, eid, data) => {});
        await expect(duct.call(duct.EVENT['DUCTS_TEST_MSG'], hello)).resolves.toBe(hello);
        let seeYou = 'See you.';
        duct.setEventHandler(duct.EVENT['DUCTS_TEST_MSG'], (rid, eid, data) => [ rid, eid, seeYou ]);
        await expect(duct.call(duct.EVENT['DUCTS_TEST_MSG'], hello)).resolves.toBe(seeYou);
        duct.setEventHandler(duct.EVENT['DUCTS_TEST_MSG']);
        await duct.close();
        assertNoError();
    },
);

test(
    'Test Loop',
    async () => {
        resetErrorCount();
        await duct.open(wsd_url);
        let loopCount = 10;
        let queue = await duct.call(duct.EVENT['DUCTS_TEST_LOOP'], loopCount);
        let memoValue = 0
        for (let i = 0; i < loopCount; ++i) {
            let expectedValue = memoValue + i;
            await expect(queue.dequeue()).resolves.toBe(expectedValue);
            memoValue = expectedValue;
        }
        await expect(queue.dequeue()).resolves.toBe(null);
        await duct.close();
        assertNoError();
    },
);

test(
    'Test BLOB',
    async () => {
        resetErrorCount();
        await duct.open(wsd_url);
        let ret = await duct.call(duct.EVENT['DUCTS_TEST_BLOB']);
        expect(ret.toString()).toBe('0123456789'.repeat(1024 * 1024))
        await duct.close();
        assertNoError();
    },
);

test(
    'Test Promised Close Function Returned Gets Resolved Immediately After A Websocket Is Closed',
    async () => {
        resetErrorCount();
        await duct.open(wsd_url);
        await duct.close();
        expect(duct.close()).resolves.toBe(null);
        assertNoError();
    },
);
