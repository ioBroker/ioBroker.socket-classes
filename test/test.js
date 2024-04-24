describe('Implement tests', () => {
    const SocketAdmin = require('../index').SocketAdmin;

    it('Test', done => {
        const settings = {};
        settings.crossDomain = true;
        settings.ttl = 3600;

        const server = new SocketAdmin(settings, { config: {} });

        server.close();

        done();
    });

    it('Test getObjectView', async () => {
        const settings = {};
        settings.crossDomain = true;
        settings.ttl = 3600;

        const server = new SocketAdmin(settings, {
            config: {},
            getObjectView: (design, search, params, options, callback) => {
                const data = require('./data.json');
                const rows = Object.keys(data).map(id => data[id].type === search && ({ id, value: data[id] })).filter(it => it);

                callback(null, { rows });
            }
        });
        await new Promise((resolve, reject) => server.commands.commands['getObjectView'](
            {_acl: { user: 'system.user.admin' } },
            'system',
            'state',
            {startkey: 'hm-rpc.1.', endkey: 'hm-rpc.1.\u9999', depth: 1},
            (err, result) => {
                if (result.rows.find(it => it.value.type !== 'folder')) {
                    reject();
                }
                if (!result.rows.length) {
                    reject();
                }
                resolve();
            }));

        await new Promise((resolve, reject) => server.commands.commands['getObjectView'](
            {_acl: { user: 'system.user.admin' } },
            'system',
            'state',
            {startkey: 'hm-rpc.1.', endkey: 'hm-rpc.1.\u9999', depth: 2},
            (err, result) => {
                if (result.rows.find(it => it.value.type !== 'folder')) {
                    reject();
                }
                if (!result.rows.length) {
                    reject();
                }
                resolve();
            }));

        await new Promise((resolve, reject) => server.commands.commands['getObjectView'](
            {_acl: { user: 'system.user.admin' } },
            'system',
            'channel',
            {startkey: 'hm-rpc.1.', endkey: 'hm-rpc.1.\u9999', depth: 1},
            (err, result) => {
                if (result.rows.find(it => it.value.type !== 'channel')) {
                    reject();
                }
                if (!result.rows.length) {
                    reject();
                }
                resolve();
            }));

        server.close();
    }).timeout(30000);
});
