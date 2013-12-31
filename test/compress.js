var assert = require('assert');
var vm = require('vm');

var request = require('supertest');
var express = require('express');
var after = require('after');

var enchilada = require('../');

var app = express();

suite('compress');

test('setup', function(done) {
    app.use(enchilada({
        src: __dirname + '/assets',
        compress: true
    }));
    app.listen(done);
});

test('/foo.js - not entry', function(done) {
    done = after(3, done);

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
        vm.runInNewContext(src, sandbox);
        done();
    });
});
