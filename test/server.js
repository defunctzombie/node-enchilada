var assert = require('assert');
var vm = require('vm');

var request = require('supertest');
var after = require('after');
var http = require('http');

var enchilada = require('../');

suite('server');

var server;

test('setup normal http server', function(done) {
    server = http.createServer(enchilada(__dirname + '/assets'));
    server.listen(done);
});

test('basic without express', function(done) {
    done = after(3, done);

    request(server)
    .get('/foo.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/javascript');

        var sandbox = {
            done: done,
            assert: assert
        };

        var src = res.text;
        vm.runInNewContext(src, sandbox);
        done();
    });
});

test('handle browserify errors', function(done) {
    request(server)
    .get('/error.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 500);
        assert.equal(res.headers['content-type'], 'text/plain');
        assert.ok(/Error/.test(res.text));
        done();
    });
});

test('handle missing file', function(done) {
    request(server)
    .get('/missing.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 404);
        assert.equal(res.headers['content-type'], 'text/plain');
        assert.equal(res.text, 'Not Found');
        done();
    });
});
