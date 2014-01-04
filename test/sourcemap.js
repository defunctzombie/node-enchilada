var assert = require('assert');
var vm = require('vm');

var request = require('supertest');
var express = require('express');
var after = require('after');

var enchilada = require('../');

var app = undefined;

suite('sourcemap');

test('setup', function(done) {
    app = express();
    app.use(enchilada({
        src: __dirname + '/assets',
        debug: true
    }));
    app.listen(done);
});

test('basic', function(done) {
    done = after(4, done);

    request(app)
    .get('/foo.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/javascript');

        var sandbox = {
            done: done,
            assert: assert
        };

        var src = res.text;
        assert(src.match(/.*\/\/# sourceMappingURL=foo.map.json$/));

        vm.runInNewContext(src, sandbox);
        done();

        request(app)
        .get('/foo.map.json')
        .end(function(err, res) {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');

            var map = res.body;

            assert.equal(map.version, 3);
            assert.equal(map.file, '/foo.js');
            assert.equal(map.sources.length, 3);
            assert.equal(map.sourcesContent.length, 3);
            assert.equal(map.mappings, 'AAAA;ACAA;AACA;AACA;;ACFA;AACA;AACA;AACA;AACA;AACA');
            done();
        });
    });
});

test('setup for compress', function(done) {
    app = express();

    app.use(enchilada({
        src: __dirname + '/assets',
        debug: true,
        compress: true
    }));
    app.listen(done);
});

test('basic', function(done) {
    done = after(4, done);

    request(app)
    .get('/foo.js')
    .end(function(err, res) {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/javascript');

        var sandbox = {
            done: done,
            assert: assert
        };

        var src = res.text;
        assert(src.match(/.*\/\/# sourceMappingURL=foo.map.json$/));

        vm.runInNewContext(src, sandbox);
        done();

        request(app)
        .get('/foo.map.json')
        .end(function(err, res) {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');

            var map = res.body;

            assert.equal(map.version, 3);
            assert.equal(map.file, '/foo.js');
            assert.equal(map.sources.length, 3);
            assert.equal(map.sourcesContent.length, 3);
            done();
        });
    });
});
