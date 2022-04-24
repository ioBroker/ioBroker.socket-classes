describe('Implement tests', () => {
    const SocketAdmin = require('../index').SocketAdmin;

    it('Test', done => {
        const settings = {};
        settings.crossDomain = true;
        settings.ttl = 3600;

        const server = new SocketAdmin(settings, {config: {}});

        server.close();

        done();
    });
});